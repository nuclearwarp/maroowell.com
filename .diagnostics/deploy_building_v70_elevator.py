import json, os, re, requests
from email.parser import BytesParser
from email.policy import default

ACCOUNT_ID="0f644373a9db40f2b36e4ffece348c46"
SCRIPT="purple-resonance-61ea"
API=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}"
H={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"]}

def fetch_source():
    r=requests.get(API+"/content/v2",headers=H,timeout=30); r.raise_for_status()
    msg=BytesParser(policy=default).parsebytes((f'Content-Type: {r.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.content)
    for part in msg.iter_parts():
        if part.get_param("name",header="content-disposition")=="worker.js":
            return (part.get_payload(decode=True) or b"").decode()
    raise RuntimeError("worker.js missing")

def metadata():
    s=requests.get(API+"/settings",headers=H,timeout=30).json().get("result") or {}
    m={"main_module":"worker.js"}
    bs=[]
    for x in (s.get("bindings") or []):
        if isinstance(x,dict) and x.get("name"):
            bs.append({"type":"inherit","name":x["name"],"version_id":"latest"})
    m["bindings"]=bs
    for k in ("compatibility_date","compatibility_flags","placement"):
        if s.get(k) not in (None,[],{}): m[k]=s[k]
    return m

def deploy(src):
    files={"metadata":(None,json.dumps(metadata(),separators=(",",":")),"application/json"),
           "worker.js":("worker.js",src.encode(),"application/javascript+module")}
    r=requests.put(API+"?bindings_inherit=strict",headers=H,files=files,timeout=120)
    if not r.ok: raise RuntimeError(f"deploy {r.status_code}: {r.text[:1600]}")
    print("deploy",r.status_code)

s=fetch_source()
m=re.search(r'const BUILDING_STATS_SOURCE_VERSION\s*=\s*\n?\s*"([^"]+)";',s)
if not m: raise RuntimeError("version not found")
print("old",m.group(1))
newv="BUILDING_HUB_KAPT_V70_APARTMENT_ELEVATOR_FLOOR_FALLBACK_2026-09-25"
s=s[:m.start()]+f'const BUILDING_STATS_SOURCE_VERSION =\n  "{newv}";'+s[m.end():]

old='''function v60ElevatorStatusFromTitle(row) {
  const info = buildingElevatorInfo(row);
  if (info.hasElevator) return { status: "yes", info, reason: "title_positive" };
  if (info.explicitZero) return { status: "no", info, reason: "title_zero" };
  return { status: "unknown", info, reason: "title_unknown" };
}'''
new='''function v60ElevatorStatusFromTitle(row) {
  const info = buildingElevatorInfo(row);
  if (info.hasElevator) return { status: "yes", info, reason: "title_positive" };
  if (info.explicitZero) {
    const classification = v60Classification(row);
    const groundFloors = Math.max(0, Math.trunc(Number(buildingGroundFloorCount(row)) || 0));
    if (classification?.apartment && groundFloors >= 6) {
      return {
        status: "yes",
        info: { ...info, inferredByFloorFallback: true, inferredGroundFloors: groundFloors },
        reason: "apartment_6plus_floor_counterevidence",
      };
    }
    return { status: "no", info, reason: "title_zero" };
  }
  return { status: "unknown", info, reason: "title_unknown" };
}'''
if old not in s: raise RuntimeError("elevator function anchor missing")
s=s.replace(old,new,1)

deploy(s)
verify=fetch_source()
assert newv in verify
assert "apartment_6plus_floor_counterevidence" in verify
print("verified",newv)
