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

def settings_metadata():
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
    files={
      "metadata":(None,json.dumps(settings_metadata(),separators=(",",":")),"application/json"),
      "worker.js":("worker.js",src.encode(),"application/javascript+module")
    }
    r=requests.put(API+"?bindings_inherit=strict",headers=H,files=files,timeout=120)
    if not r.ok: raise RuntimeError(f"deploy {r.status_code}: {r.text[:1600]}")
    print("deploy",r.status_code)

s=fetch_source()
old_version=re.search(r'const BUILDING_STATS_SOURCE_VERSION\s*=\s*\n?\s*"([^"]+)";',s)
if not old_version: raise RuntimeError("BUILDING_STATS_SOURCE_VERSION not found")
print("old",old_version.group(1))
new_version="BUILDING_HUB_KAPT_V69_VERIFIED_APARTMENT_FALLBACK_2026-09-25"
s=s[:old_version.start()]+f'const BUILDING_STATS_SOURCE_VERSION =\n  "{new_version}";'+s[old_version.end():]

helper=r'''
const V69_VERIFIED_APARTMENT_TOTALS = [
  {
    key: "YEUIDO_SAMBU",
    label: "여의도 삼부아파트",
    parcelKeys: [
      "11560|11000|0|0030|0002",
      "11560|11000|0|0030|0003",
    ],
    households: 866,
    source: "VERIFIED_COMPLEX_TOTAL",
  },
];

function v69ApplyVerifiedApartmentFallback({
  aggregate,
  contributions,
  titleRowsByParcel,
  kaptMatches,
}) {
  const corrections = [];
  const matchedKaptParcels = new Set((kaptMatches || []).map((row) => String(row?.parcelKey || "")));
  for (const rule of V69_VERIFIED_APARTMENT_TOTALS) {
    if (!rule.parcelKeys.every((key) => titleRowsByParcel.has(key))) continue;
    if (rule.parcelKeys.some((key) => matchedKaptParcels.has(key))) continue;
    const parcelSet = new Set(rule.parcelKeys);
    const related = (contributions || []).filter((item) =>
      item?.bucket === "residential" &&
      parcelSet.has(String(item?.meta?.parcelKey || "")) &&
      String(item?.source || "").startsWith("TITLE_")
    );
    const current = related.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item?.units) || 0)), 0);
    const target = Math.max(0, Math.trunc(Number(rule.households) || 0));
    if (!current || !target || current === target) continue;
    const delta = target - current;

    aggregate.apartmentHouseholdCount = Math.max(0, aggregate.apartmentHouseholdCount + delta);
    aggregate.residentialUnitCount = Math.max(0, aggregate.residentialUnitCount + delta);
    aggregate.householdCount = Math.max(0, aggregate.householdCount + delta);
    aggregate.residentialBuildingUnitCount = Math.max(0, aggregate.residentialBuildingUnitCount + delta);

    if (delta < 0) {
      let remaining = -delta;
      const statusTotals = {
        no: related.filter(x => x.elevatorStatus === "no").reduce((s,x)=>s+Math.max(0,Number(x.units)||0),0),
        yes: related.filter(x => x.elevatorStatus === "yes").reduce((s,x)=>s+Math.max(0,Number(x.units)||0),0),
        unknown: related.filter(x => !["no","yes"].includes(x.elevatorStatus)).reduce((s,x)=>s+Math.max(0,Number(x.units)||0),0),
      };
      for (const status of ["no","yes","unknown"]) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, statusTotals[status]);
        if (!take) continue;
        if (status === "no") {
          aggregate.noElevatorUnitCount = Math.max(0, aggregate.noElevatorUnitCount - take);
          aggregate.residentialNoElevatorUnitCount = Math.max(0, aggregate.residentialNoElevatorUnitCount - take);
          aggregate.walkupHouseholdCount = Math.max(0, aggregate.walkupHouseholdCount - take);
        } else if (status === "yes") {
          aggregate.confirmedElevatorUnitCount = Math.max(0, aggregate.confirmedElevatorUnitCount - take);
          aggregate.residentialElevatorUnitCount = Math.max(0, aggregate.residentialElevatorUnitCount - take);
        } else {
          aggregate.unknownElevatorUnitCount = Math.max(0, aggregate.unknownElevatorUnitCount - take);
          aggregate.residentialUnknownElevatorUnitCount = Math.max(0, aggregate.residentialUnknownElevatorUnitCount - take);
        }
        remaining -= take;
      }
    }

    corrections.push({
      key: rule.key,
      label: rule.label,
      parcelKeys: rule.parcelKeys,
      before: current,
      after: target,
      delta,
      source: rule.source,
    });
  }
  return corrections;
}
'''
anchor='function v60AggregateBuildingStats({'
if 'V69_VERIFIED_APARTMENT_TOTALS' not in s:
    i=s.find(anchor)
    if i<0: raise RuntimeError("aggregate function anchor missing")
    s=s[:i]+helper+"\n"+s[i:]

needle='  aggregate.deliveryUnitCount = aggregate.residentialUnitCount + aggregate.commercialUnitCount + aggregate.unclassifiedUnitCount;'
pos=s.find(needle)
if pos<0: raise RuntimeError("delivery total anchor missing")
insert='''  const v69ApartmentCorrections = v69ApplyVerifiedApartmentFallback({
    aggregate,
    contributions,
    titleRowsByParcel,
    kaptMatches,
  });
'''
s=s[:pos]+insert+s[pos:]

dq='''    dataQuality: {
      deliveryUnitCount: aggregate.deliveryUnitCount,
      matchedBuildingCount: aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
    },'''
dq2='''    dataQuality: {
      deliveryUnitCount: aggregate.deliveryUnitCount,
      matchedBuildingCount: aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
      verifiedApartmentCorrections: v69ApartmentCorrections,
    },'''
if dq not in s: raise RuntimeError("dataQuality anchor missing")
s=s.replace(dq,dq2,1)

deploy(s)
verify=fetch_source()
assert new_version in verify
assert 'V69_VERIFIED_APARTMENT_TOTALS' in verify
print("verified",new_version)
