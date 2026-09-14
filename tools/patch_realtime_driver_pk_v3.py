from pathlib import Path


def rep(s, old, new, label):
    if old not in s:
        raise SystemExit(f"missing target: {label}")
    return s.replace(old, new, 1)

# backend
p = Path("workers/meta-collector/entry.js")
s = p.read_text(encoding="utf-8")

s = rep(s,
'''function rowIdentity(r) { return canonicalIdentity(r?.coupang_id, r?.driver_name, r?.meta_worker_key); }''',
'''function rowIdentity(r) { return r?.driver_pk != null ? `pk:${Number(r.driver_pk)}` : canonicalIdentity(r?.coupang_id, r?.driver_name, r?.meta_worker_key); }
function driverIdentity(driverPk, cid, name, fallback) { return driverPk != null ? `pk:${Number(driverPk)}` : canonicalIdentity(cid, name, fallback); }
function infoWave(wave) { return String(wave || '').toUpperCase() === 'WAVE1' ? '야간' : String(wave || '').toUpperCase() === 'WAVE2' ? '주간' : String(wave || '').trim(); }
async function loadDriverDirectory(env) { return await sbGet(env, 'maroowell_info?select=pk_id,person_name,coupang_id,camp_code,wave,position_title') || []; }
function resolveDriverPk(directory, cid, name, camp, wave) {
  const id = String(cid || '').trim().toLowerCase();
  const dn = String(name || '').trim();
  const campName = String(camp || '').trim();
  const iw = infoWave(wave);
  const active = r => String(r?.position_title || '').trim().toLowerCase() !== '퇴사';
  if (id) {
    const byId = (directory || []).filter(r => String(r?.coupang_id || '').trim().toLowerCase() === id);
    if (byId.length === 1) return Number(byId[0].pk_id);
    const scopedActive = byId.filter(r => (!campName || String(r?.camp_code || '').trim() === campName) && (!iw || String(r?.wave || '').trim() === iw) && active(r));
    if (scopedActive.length === 1) return Number(scopedActive[0].pk_id);
    const scoped = byId.filter(r => (!campName || String(r?.camp_code || '').trim() === campName) && (!iw || String(r?.wave || '').trim() === iw));
    if (scoped.length === 1) return Number(scoped[0].pk_id);
  }
  if (dn) {
    const scopedActive = (directory || []).filter(r => String(r?.person_name || '').trim() === dn && (!campName || String(r?.camp_code || '').trim() === campName) && (!iw || String(r?.wave || '').trim() === iw) && active(r));
    if (scopedActive.length === 1) return Number(scopedActive[0].pk_id);
    const byName = (directory || []).filter(r => String(r?.person_name || '').trim() === dn);
    if (byName.length === 1) return Number(byName[0].pk_id);
  }
  return null;
}''', 'backend identity helpers')

s = rep(s,
'''  return { assigned, scanned, completed, impossible, pdd, total, rate: pct(completed, total) };''',
'''  const settled = completed + impossible + assigned + pdd;
  return { assigned, scanned, completed, impossible, pdd, total, rate: pct(settled, total) };''', 'backend delivery rate')

s = rep(s, 'async function storeFreshRows(env, batch, schedule, fresh, now) {', 'async function storeFreshRows(env, batch, schedule, directory, fresh, now) {', 'fresh signature')
s = rep(s,
'''    const mappedName = String(matched[0]?.driver_display_name || matched[0]?.driver_name || matched[0]?.driver_owner_name || name || "").trim() || null;
    const key = canonicalIdentity(realCid, mappedName, workerKey(src));''',
'''    const mappedName = String(matched[0]?.driver_display_name || matched[0]?.driver_name || matched[0]?.driver_owner_name || name || "").trim() || null;
    const driverPk = resolveDriverPk(directory, realCid, mappedName, batch.camp_name, batch.wave);
    const key = driverIdentity(driverPk, realCid, mappedName, workerKey(src));''', 'fresh resolve pk')
s = rep(s, 'meta_worker_key:key, coupang_id:realCid, driver_name:mappedName,', 'meta_worker_key:key, driver_pk:driverPk, coupang_id:realCid, driver_name:mappedName,', 'fresh driver pk')
s = rep(s,
'''  const schedule = await loadSchedule(env, batch.schedule_date, batch.wave, batch.camp_name);
  const prevRows''',
'''  const schedule = await loadSchedule(env, batch.schedule_date, batch.wave, batch.camp_name);
  const directory = await loadDriverDirectory(env);
  const prevRows''', 'load directory')
s = rep(s,
'''    const mappedName = String(matched[0]?.driver_display_name || matched[0]?.driver_name || matched[0]?.driver_owner_name || name || "").trim() || null;
    const key = canonicalIdentity(realCid, mappedName, workerKey(src)), prev = prevMap.get(key);''',
'''    const mappedName = String(matched[0]?.driver_display_name || matched[0]?.driver_name || matched[0]?.driver_owner_name || name || "").trim() || null;
    const driverPk = resolveDriverPk(directory, realCid, mappedName, batch.camp_name, batch.wave);
    const key = driverIdentity(driverPk, realCid, mappedName, workerKey(src)), prev = prevMap.get(key);''', 'main resolve pk')
s = rep(s, 'meta_worker_key: key, source_camp_code: sourceCampCode(src), coupang_id: realCid,', 'meta_worker_key: key, source_camp_code: sourceCampCode(src), driver_pk: driverPk, coupang_id: realCid,', 'main driver pk')
s = rep(s, 'const deliveryDone = d.total > 0 && d.completed === d.total;', 'const deliveryDone = d.total > 0 && d.scanned === 0 && (d.completed + d.impossible + d.assigned + d.pdd) >= d.total;', 'delivery done')
s = rep(s, 'await storeFreshRows(env, batch, schedule, fresh, now);', 'await storeFreshRows(env, batch, schedule, directory, fresh, now);', 'fresh call')
p.write_text(s, encoding="utf-8")

# frontend
p = Path("public/realtime")
s = p.read_text(encoding="utf-8")
s = rep(s, 'driver:String(src.driver_name||src.coupang_id||"담당 확인").trim(),\n      coupangId:String(src.coupang_id||"").trim().toLowerCase(),', 'driver:String(src.driver_name||src.coupang_id||"담당 확인").trim(),\n      driverPk:src.driver_pk==null?null:Number(src.driver_pk),\n      coupangId:String(src.coupang_id||"").trim().toLowerCase(),', 'frontend driver pk')
s = rep(s, 'const byKey=new Map(),byCid=new Map(),byName=new Map();', 'const byPk=new Map(),byKey=new Map(),byCid=new Map(),byName=new Map();', 'fresh maps')
s = rep(s, 'for(const f of freshRows||[]){\n    if(f.meta_worker_key)', 'for(const f of freshRows||[]){\n    if(f.driver_pk!=null)byPk.set(`${f.batch_id}|${Number(f.driver_pk)}`,f);\n    if(f.meta_worker_key)', 'fresh map pk')
s = rep(s, 'return{byKey,byCid,byName};', 'return{byPk,byKey,byCid,byName};', 'fresh map return')
s = rep(s, 'const f=\n      (r.meta_worker_key&&fm.byKey.get', 'const f=\n      (r.driver_pk!=null&&fm.byPk.get(`${r.batch_id}|${Number(r.driver_pk)}`))||\n      (r.meta_worker_key&&fm.byKey.get', 'fresh join pk')
s = rep(s, 'batch_id,meta_worker_key,camp_code,camp_name,wave,coupang_id,driver_name,', 'batch_id,meta_worker_key,driver_pk,camp_code,camp_name,wave,coupang_id,driver_name,', 'current select pk')
s = rep(s, 'batch_id,meta_worker_key,coupang_id,driver_name,delivery_assigned', 'batch_id,meta_worker_key,driver_pk,coupang_id,driver_name,delivery_assigned', 'fresh select pk')
s = s.replace('mw-realtime-live-v10', 'mw-realtime-live-v11').replace('content="10"', 'content="11"').replace('20260915-realtime10', '20260915-realtime11')
p.write_text(s, encoding="utf-8")
print('patched backend and frontend')
