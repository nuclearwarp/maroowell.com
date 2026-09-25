import json, os, re, requests
from email.parser import BytesParser
from email.policy import default

ACCOUNT_ID="0f644373a9db40f2b36e4ffece348c46"
SCRIPT="purple-resonance-61ea"
API=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}"
H={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"]}

def fetch_source():
    r=requests.get(API+"/content/v2",headers=H,timeout=30)
    r.raise_for_status()
    msg=BytesParser(policy=default).parsebytes((f'Content-Type: {r.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.content)
    for part in msg.iter_parts():
        if part.get_param("name",header="content-disposition")=="worker.js":
            return (part.get_payload(decode=True) or b"").decode()
    raise RuntimeError("worker.js missing")

def metadata():
    s=requests.get(API+"/settings",headers=H,timeout=30).json().get("result") or {}
    m={"main_module":"worker.js"}
    m["bindings"]=[{"type":"inherit","name":x["name"],"version_id":"latest"} for x in (s.get("bindings") or []) if isinstance(x,dict) and x.get("name")]
    for k in ("compatibility_date","compatibility_flags","placement"):
        if s.get(k) not in (None,[],{}): m[k]=s[k]
    return m

def deploy(src):
    files={
      "metadata":(None,json.dumps(metadata(),separators=(",",":")),"application/json"),
      "worker.js":("worker.js",src.encode(),"application/javascript+module")
    }
    r=requests.put(API+"?bindings_inherit=strict",headers=H,files=files,timeout=120)
    if not r.ok: raise RuntimeError(f"deploy {r.status_code}: {r.text[:1600]}")
    print("deploy",r.status_code)

s=fetch_source()
m=re.search(r'const BUILDING_STATS_SOURCE_VERSION\s*=\s*\n?\s*"([^"]+)";',s)
if not m: raise RuntimeError("version not found")
print("old",m.group(1))
newv="BUILDING_HUB_KAPT_V74_NO_MANUAL_APARTMENT_OVERRIDES_2026-09-26"
s=s[:m.start()]+f'const BUILDING_STATS_SOURCE_VERSION =\n  "{newv}";'+s[m.end():]

# Remove the only manual apartment override block injected in V69.
s,n=re.subn(
    r'\n?const V69_VERIFIED_APARTMENT_TOTALS = \[[\s\S]*?\nfunction v60AggregateBuildingStats\(',
    '\nfunction v60AggregateBuildingStats(',
    s,
    count=1
)
print("manual_block_removed",n)

# Remove the V69 invocation and diagnostic field.
s=re.sub(
    r'\n\s*const v69ApartmentCorrections = v69ApplyVerifiedApartmentFallback\(\{[\s\S]*?\}\);\s*',
    '\n',
    s,
    count=1
)
s=s.replace("      verifiedApartmentCorrections: v69ApartmentCorrections,\n","")
s=s.replace("      verifiedApartmentCorrections: v69ApartmentCorrections,\r\n","")

for forbidden in ("YEUIDO_SAMBU","V69_VERIFIED_APARTMENT_TOTALS","v69ApplyVerifiedApartmentFallback","verifiedApartmentCorrections"):
    if forbidden in s:
        raise RuntimeError("manual apartment override still present: "+forbidden)

deploy(s)
verify=fetch_source()
assert newv in verify
for forbidden in ("YEUIDO_SAMBU","V69_VERIFIED_APARTMENT_TOTALS","v69ApplyVerifiedApartmentFallback","verifiedApartmentCorrections"):
    assert forbidden not in verify
print("verified",newv)
