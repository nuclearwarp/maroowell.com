"""Output narrowly selected, static Cloudflare source signatures to GitHub Actions logs.
Never print Worker binding contents, auth headers or access tokens."""
import os,urllib.request,hashlib,re
from email.parser import BytesParser
from email.policy import default

API='https://api.cloudflare.com/client/v4/accounts/0f644373a9db40f2b36e4ffece348c46/workers/scripts/purple-resonance-61ea/content/v2'
req=urllib.request.Request(API,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']})
with urllib.request.urlopen(req,timeout=30) as r:
    msg=BytesParser(policy=default).parsebytes((f'Content-Type: {r.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.read())
src=''
for part in msg.iter_parts():
    if part.get_param('name',header='content-disposition')=='worker.js':src=(part.get_payload(decode=True) or b'').decode('utf-8')
if not src:raise RuntimeError('worker not found')
print("WORKER SHA",hashlib.sha256(src.encode()).hexdigest())
keys=['KAPT','kapt','AptList','AptBasis','getLegaldong','getBrTitle','getBrRecap']
lines=src.splitlines()
for n,line in enumerate(lines):
    if any(k in line for k in keys) and re.search(r'(?m)^(?:const |let |var |async function |function )',line):
        if any(s in line for s in ['URL','BASE','SERVICE','ENDPOINT','v60Kapt','v60FetchKapt','v60EnsureKapt','v60BuildKapt','v60FetchBuildingHubTitlePage','fetchBuildingHubTitlePage']):
            if len(line)>350:line=line[:350]
            print("INDEX",n+1,line)
names=[
"v60EnsureKaptRegionLists","v60KaptCandidateRows","v60BuildKaptMatches",
"v60FetchKaptRegion","v60FetchKaptRegionList","v60FetchKaptLegalDong",
"v60EnsureScopeTitles","v60TitleRowsByParcel","v60DetermineDetailParcels",
"v60FetchBuildingHubTitlePage","fetchBuildingHubTitlePage"
]
for name in names:
    m=re.search(r'(?m)^(?:async )?function '+re.escape(name)+r'\(',src)
    if not m:continue
    a=src.rfind('\n',0,m.start())+1
    b=src.find('\n}\n',m.end())
    if b<0:b=min(len(src),a+2500)
    frag=src[a:min(b+2,a+5200)].splitlines()
    print("FUNCTION",name,"lines",len(frag))
    for line in frag[:110]:
        if re.search(r'(?i)token\s*=|password\s*=|secret\s*=|supabase_service_role_key\s*=',line):print(" [SECRET REDACTED]");continue
        print(line[:300])
