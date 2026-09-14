from pathlib import Path
import re
import subprocess
import tempfile
import os

SOURCE = Path("public/maroowell_schedule")
OUTPUT = Path("maroowell_schedule_front_full_fixed_20260915.txt")

s = SOURCE.read_text(encoding="utf-8")

old = '''        if(found)return found;
          return {displayName:raw,ownerName:raw,exportName:raw,exportId:"",accountType:"직접입력",colorKey:raw,search:raw};'''
new = '''        if(found)return found;

          // maroowell_info에서 같은 기사 계정을 찾으면 master 정보를 최우선으로 사용한다.
          const master=resolveMetaInfoAccount(raw);
          if(master && clean(master.exportId)) return master;

          // master에도 없는 경우에만 실제 직접입력으로 취급한다.
          return {displayName:raw,ownerName:raw,exportName:raw,exportId:"",accountType:"직접입력",colorKey:raw,search:raw};'''
if old not in s:
    raise SystemExit("resolveAccount fallback anchor not found")
s = s.replace(old, new, 1)

pattern = r'''      function makeDirtyRecord\(\{date,routeLabel,value,rowOrder,source\}\)\{[\s\S]*?\n      \}\n\n      function applyInputVisual'''
replacement = '''      function makeDirtyRecord({date,routeLabel,value,rowOrder,source}){
        const cleanValue=clean(value);
        const keepAssignmentFields=!!cleanValue;

        let account=null;
        if(cleanValue){
          account=resolveMetaInfoAccount(cleanValue)
            || resolvePddAccount(cleanValue,source||{})
            || resolveAccount(cleanValue);
        }

        const parsedAccountId=parseAccountToken(
          account?.exportId,
          clean(account?.exportName || account?.displayName || cleanValue)
        );
        const masterId=clean(parsedAccountId.id);

        const parsedSourceId=parseAccountToken(
          clean(source?.driver_coupang_id),
          clean(source?.driver_export_name || source?.driver_name || cleanValue)
        );
        const sourceId=clean(parsedSourceId.id);

        const accountType=clean(account?.accountType);
        const sourceAccountType=clean(source?.driver_account_type);
        const authoritativeAccountType=masterId
          ? (accountType || "본계정")
          : (sourceAccountType || accountType || null);

        return {
          schedule_date:date,
          camp:state.camp,
          wave:state.wave,
          route_label:normalizeRouteLabel(routeLabel),
          driver_name:cleanValue||null,
          driver_display_name:cleanValue||null,
          driver_owner_name:keepAssignmentFields?(
            clean(account?.ownerName)
            || clean(source?.driver_owner_name)
            || cleanValue
            || null
          ):null,
          driver_export_name:keepAssignmentFields?(
            clean(account?.exportName)
            || clean(source?.driver_export_name)
            || cleanValue
            || null
          ):null,
          driver_coupang_id:keepAssignmentFields?(
            masterId
            || sourceId
            || null
          ):null,
          driver_account_type:keepAssignmentFields?authoritativeAccountType:null,
          memo:keepAssignmentFields?(clean(source?.memo)||null):null,
          row_order:Number(rowOrder||source?.row_order||0),
          cell_color:cleanValue?colorForValue(cleanValue):null,
          is_active:!!cleanValue
        };
      }

      function applyInputVisual'''
s, n = re.subn(pattern, replacement, s, count=1)
if n != 1:
    raise SystemExit(f"makeDirtyRecord replacement count={n}")

old = '''      async function saveAll(){
        if(!state.camp||!state.weekDates.length){alert("먼저 불러오기를 해주세요.");return}

        normalizeUniformChildrenBeforeSave();'''
new = '''      async function saveAll(){
        if(!state.camp||!state.weekDates.length){alert("먼저 불러오기를 해주세요.");return}

        try{
          const added=await loadAllMaroowellInfoRowsForAccountLookup();
          if(added>0) buildDriverAccounts();
        }catch(e){
          console.warn("[schedule save] maroowell_info account refresh failed",e);
        }

        normalizeUniformChildrenBeforeSave();'''
if old not in s:
    raise SystemExit("saveAll anchor not found")
s = s.replace(old, new, 1)

if not s.startswith("<!doctype html>") or not s.rstrip().endswith("</html>"):
    raise SystemExit("full file boundary validation failed")

for needle in (
    "const master=resolveMetaInfoAccount(raw);",
    "const masterId=clean(parsedAccountId.id);",
    "[schedule save] maroowell_info account refresh failed",
):
    if needle not in s:
        raise SystemExit(f"validation failed: {needle}")

OUTPUT.write_text(s, encoding="utf-8")

blocks = re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>', s, re.I)
inline = [b for b in blocks if b.strip()]
if not inline:
    raise SystemExit("no inline JavaScript found")
js = max(inline, key=len)
with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
    f.write(js)
    tmp = f.name
try:
    result = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stderr)
finally:
    os.unlink(tmp)

print(f"created {OUTPUT} ({OUTPUT.stat().st_size} bytes), JavaScript syntax OK")
