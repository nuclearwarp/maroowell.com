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
newv="BUILDING_HUB_KAPT_V73_APARTMENT_NAME_OR_PURPOSE_ORPHAN_DEDUPE_2026-09-25"
s=s[:m.start()]+f'const BUILDING_STATS_SOURCE_VERSION =\n  "{newv}";'+s[m.end():]

old=r'''function v72IsStrictApartmentTitle(row) {
  const purpose = cleanBuildingText(buildingPurposeText(row)).replace(/\s+/g, "");
  return /아파트/.test(purpose) && !/오피스텔/.test(purpose);
}'''
new=r'''function v72IsStrictApartmentTitle(row) {
  const purpose = cleanBuildingText(buildingPurposeText(row)).replace(/\s+/g, "");
  const name = cleanBuildingText(row?.bldNm ?? row?.bld_nm ?? row?.dongNm ?? row?.dong_nm).replace(/\s+/g, "");
  const combined = `${purpose} ${name}`;
  return /아파트/.test(combined) && !/오피스텔/.test(purpose);
}'''
if old not in s: raise RuntimeError("v72 strict apartment function anchor missing")
s=s.replace(old,new,1)

marker='''  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {'''
insert=r'''  // V73: if the same parcel already has an explicit residential title count
  // (hhldCnt/fmlyCnt/purpose count), orphan detail rows are duplicate evidence.
  // Keep orphan details only where no title-level residential count exists.
  const v73ResidentialTitleCountParcels = new Set();
  for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
    for (const row of v60RelevantTitles(rows)) {
      const classification = v60Classification(row);
      if (!classification.residential) continue;
      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = v62PurposeResidentialCountHint(row);
      const explicitCount = Math.max(
        Math.max(0, Math.trunc(Number(explicit?.units) || 0)),
        Math.max(0, Math.trunc(Number(purposeHint) || 0))
      );
      if (explicitCount > 0) {
        v73ResidentialTitleCountParcels.add(parcelKey);
        break;
      }
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {'''
if marker not in s: raise RuntimeError("orphan loop marker missing")
s=s.replace(marker,insert,1)

old2='''    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
    addUnits({'''
new2='''    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
    if (bucket === "residential" && v73ResidentialTitleCountParcels.has(item.parcelKey)) {
      continue;
    }
    addUnits({'''
# replace only in orphan loop region after insert
idx=s.find('for (const item of orphanDetailUnits)')
pos=s.find(old2,idx)
if pos<0: raise RuntimeError("orphan bucket anchor missing")
s=s[:pos]+s[pos:].replace(old2,new2,1)

deploy(s)
verify=fetch_source()
assert newv in verify
assert "v73ResidentialTitleCountParcels" in verify
assert "const combined =" in verify
print("verified",newv)
