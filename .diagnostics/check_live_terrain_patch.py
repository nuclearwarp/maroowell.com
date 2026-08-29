import os
from email.parser import BytesParser
from email.policy import default
import requests
ACCOUNT='0f644373a9db40f2b36e4ffece348c46'; SCRIPT='purple-resonance-61ea'
r=requests.get(f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{SCRIPT}/content/v2',headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']},timeout=30);r.raise_for_status()
msg=BytesParser(policy=default).parsebytes((f'Content-Type: {r.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.content)
src=''
for p in msg.iter_parts():
    if p.get_param('name',header='content-disposition')=='worker.js': src=(p.get_payload(decode=True) or b'').decode();break
print('AWS_FALLBACK_FUNCTION=', 'requestAwsTerrariumTerrainStatistics' in src)
print('AWS_FALLBACK_403=', 'res.status === 403' in src and 'requestAwsTerrariumTerrainStatistics(normalized)' in src)
print('AWS_RGB_DECODER=', 'decodeTerrariumRgbPng' in src)
print('DIAGNOSTIC_PROBE_HELPER_COUNT=', src.count('async function __mwCopProbe'))
if not ('requestAwsTerrariumTerrainStatistics' in src and 'decodeTerrariumRgbPng' in src and 'requestAwsTerrariumTerrainStatistics(normalized)' in src): raise SystemExit(2)
