"""Checked deployment of V75.4 source transport. No credential values are logged."""
import argparse,hashlib,json,os,subprocess,time,uuid,urllib.request,urllib.error
from pathlib import Path
from email.parser import BytesParser
from email.policy import default
from patch_v754 import patch,BASE
ROOT=Path(__file__).parent
ACCOUNT='0f644373a9db40f2b36e4ffece348c46'
API=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/purple-resonance-61ea'
OUT=Path('/tmp/building-v754')

def main():
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
    token=os.environ['CLOUDFLARE_API_TOKEN']
    def call(path='',method='GET',body=None,headers=None):
        req=urllib.request.Request(API+path,data=body,method=method,headers={'Authorization':'Bearer '+token,**(headers or {})})
        try:
            with urllib.request.urlopen(req,timeout=90) as r:return r.read(),r.headers
        except urllib.error.HTTPError as e:raise RuntimeError('Cloudflare request failed: HTTP '+str(e.code)) from None
    def source():
        raw,h=call('/content/v2');msg=BytesParser(policy=default).parsebytes((f'Content-Type: {h["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
        for part in msg.iter_parts():
            if part.get_param('name',header='content-disposition')=='worker.js':return (part.get_payload(decode=True) or b'').decode('utf-8')
        raise RuntimeError('worker.js module missing')
    before=source();digest=hashlib.sha256(before.encode()).hexdigest();print('Live source SHA256',digest)
    if 'buildingTransportPolicy: \'SHARED_SERIAL_PACED_V75_4\'' in before:
        print('V75.4 already present; source not overwritten');return
    if digest!=BASE:raise RuntimeError('Live source changed; deployment refused pending review')
    after=patch(before);OUT.mkdir(exist_ok=True)
    (OUT/'base.mjs').write_text(before,encoding='utf-8');(OUT/'candidate.mjs').write_text(after,encoding='utf-8')
    subprocess.run(['node','--check',str(OUT/'candidate.mjs')],check=True,timeout=30)
    env={**os.environ,'BASE_WORKER':str(OUT/'base.mjs'),'CANDIDATE_WORKER':str(OUT/'candidate.mjs')}
    tests=subprocess.run(['node','--test',str(ROOT/'test_v754.mjs')],env=env,text=True,capture_output=True,timeout=120)
    report=tests.stdout+'\n'+tests.stderr;(OUT/'test-results.txt').write_text(report,encoding='utf-8');print(report)
    if tests.returncode:raise RuntimeError('Regression tests failed; live source was not changed')
    if args.check:print('CHECK ONLY: no Worker changes');return
    raw,_=call('/settings');j=json.loads(raw)
    if not j.get('success'):raise RuntimeError('Worker settings unavailable')
    cfg=j.get('result') or {};bindings=cfg.get('bindings') or []
    required={'BUILDING_ANALYSIS_QUEUE','BUILDING_HUB_SERVICE_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL'}
    if not required.issubset({b.get('name') for b in bindings}):raise RuntimeError('Required bindings missing; deployment refused')
    metadata={'main_module':'worker.js','bindings':[{'type':'inherit','name':b['name'],'version_id':'latest'} for b in bindings]}
    for k in ('compatibility_date','compatibility_flags','placement','limits','observability','logpush','tail_consumers','tags'):
        if k in cfg and cfg[k] is not None:metadata[k]=cfg[k]
    if source()!=before:raise RuntimeError('Concurrent Worker change detected; deployment refused')
    boundary='mw'+uuid.uuid4().hex
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n'+json.dumps(metadata)+f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n').encode()+after.encode()+f'\r\n--{boundary}--\r\n'.encode()
    raw,_=call('?bindings_inherit=strict','PUT',body,{'Content-Type':'multipart/form-data; boundary='+boundary})
    if not json.loads(raw).get('success'):raise RuntimeError('Worker deployment was not accepted')
    deployed=source();expected=hashlib.sha256(after.encode()).hexdigest()
    if hashlib.sha256(deployed.encode()).hexdigest()!=expected:raise RuntimeError('Deployed source hash mismatch')
    print('Deployed source verified',expected)
    (OUT/'manifest.json').write_text(json.dumps({'base':digest,'deployed':expected,'bindings_preserved':sorted(b['name'] for b in bindings),'algorithm_version_unchanged':True},indent=2))
    for attempt in range(10):
        req=urllib.request.Request('https://purple-resonance-61ea.brain-0f6.workers.dev/health?v=754',headers={'Cache-Control':'no-cache'})
        with urllib.request.urlopen(req,timeout=20) as r:health=json.load(r)
        if health.get('buildingTransportPolicy')=='SHARED_SERIAL_PACED_V75_4' and health.get('buildingRecoveryPolicy')=='PER_PAGE_NONBLOCKING_V75_4':
            print('Live health confirmed V75.4');return
        time.sleep(3)
    raise RuntimeError('Upload succeeded but health version not yet confirmed')
if __name__=='__main__':main()
