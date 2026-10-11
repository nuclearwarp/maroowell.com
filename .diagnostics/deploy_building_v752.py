"""Guarded V75.2 Cloudflare Worker deployment; original bindings remain inherited.

This script reads the live module, checks the exact previously audited V75.1
SHA-256, adds a narrow JSON-empty-200 XML fallback, syntax-checks it, and
verifies the deployed module digest. No source or credential is printed.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from email.parser import BytesParser
from email.policy import default
import requests
from patch_building_v752 import patch, BASE_SHA256, PATCH_MARKER

ACCOUNT_ID='0f644373a9db40f2b36e4ffece348c46'
SCRIPT='purple-resonance-61ea'
API=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}'

def main():
    token=os.environ['CLOUDFLARE_API_TOKEN']
    session=requests.Session()
    session.headers.update({'Authorization':'Bearer '+token})

    def fetch_source():
        res=session.get(API+'/content/v2',timeout=40)
        res.raise_for_status()
        raw=(f'Content-Type: {res.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+res.content
        msg=BytesParser(policy=default).parsebytes(raw)
        for part in msg.iter_parts():
            if part.get_param('name',header='content-disposition')=='worker.js':
                return (part.get_payload(decode=True) or b'').decode('utf-8')
        raise RuntimeError('worker.js module is missing')

    before=fetch_source()
    old_hash=hashlib.sha256(before.encode('utf-8')).hexdigest()
    print('Current Worker SHA-256',old_hash)
    if PATCH_MARKER in before:
        if "buildingHubFallbackMode: 'JSON_EMPTY_200_XML_ONCE_V75_2'" not in before:
            raise RuntimeError('Worker marker mismatch, manual review required')
        print('V75.2 already deployed; nothing to change')
        return
    if old_hash!=BASE_SHA256:
        raise RuntimeError('Live Worker differs from audited V75.1 code: deployment safely cancelled')
    after=patch(before)
    next_hash=hashlib.sha256(after.encode('utf-8')).hexdigest()
    with tempfile.TemporaryDirectory() as tmp:
        candidate=Path(tmp)/'worker-v752.mjs'
        candidate.write_text(after,encoding='utf-8')
        subprocess.run(['node','--check',str(candidate)],check=True,timeout=30)
        settings_req=session.get(API+'/settings',timeout=40)
        settings_req.raise_for_status()
        data=settings_req.json()
        if not data.get('success'): raise RuntimeError('Cloudflare Worker settings request failed')
        settings=data.get('result') or {}
        bindings=settings.get('bindings') or []
        if not isinstance(bindings,list) or not bindings:
            raise RuntimeError('Deployment cancelled because bindings could not be read')
        inherited=[{'type':'inherit','name':item['name'],'version_id':'latest'}
                   for item in bindings if isinstance(item,dict) and item.get('name')]
        if len(inherited)!=len(bindings):
            raise RuntimeError('Deployment cancelled because not every binding could be inherited')
        metadata={'main_module':'worker.js','bindings':inherited}
        for key in ('compatibility_date','compatibility_flags','placement'):
            if settings.get(key) not in (None,[],{}): metadata[key]=settings[key]
        print('Preserving binding names',[b['name'] for b in inherited])
        res=session.put(API+'?bindings_inherit=strict',files={
            'metadata':(None,json.dumps(metadata,separators=(',',':')),'application/json'),
            'worker.js':('worker.js',after.encode('utf-8'),'application/javascript+module'),
        },timeout=120)
        if not res.ok:
            raise RuntimeError('Cloudflare deployment HTTP '+str(res.status_code))
        deployed=fetch_source()
        deployed_hash=hashlib.sha256(deployed.encode('utf-8')).hexdigest()
        if deployed_hash!=next_hash:
            raise RuntimeError('Deployment returned success but source digest differs; manual verification required')
        print('V75.2 source digest verified',deployed_hash)

if __name__=='__main__':
    main()
