import authWorker from "./auth-v12-base.js";

const SUPABASE_URL = "https://rgqerimdxkthkcewqbbe.supabase.co";
const FLY_REALTIME = "https://fly.coupang.com/ui/dashboard/realtime";
const META_WORKER_URL = "https://fly.coupang.com/realtime-dashboard/workers/work-status/search";
const META_CAMP_URL = "https://fly.coupang.com/realtime-dashboard/camps/work-status/search";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const kstIsoAt = (ms) => { const d = new Date(ms + 9 * 3600000); return d.toISOString().slice(0, -1); };
const nowIso = () => kstIsoAt(Date.now());
const uniq = xs => [...new Set((xs || []).map(v => String(v || "").trim()).filter(Boolean))];
const normRoute = v => String(v || "").trim().toUpperCase().replace(/[^0-9A-Z가-힣]/g, "");
const pct = (a, b) => b > 0 ? Math.round(a / b * 10000) / 100 : 100;

function kstParts(d = new Date()) {
  const x = new Date(d.getTime() + 9 * 3600000);
  return { date: x.toISOString().slice(0, 10), hour: x.getUTCHours(), minute: x.getUTCMinutes() };
}
function addDate(date, days) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function metaContent(x) {
  if (Array.isArray(x?.data?.content)) return x.data.content;
  if (Array.isArray(x?.content)) return x.content;
  if (Array.isArray(x?.data?.data?.content)) return x.data.data.content;
  return [];
}
function workerName(src) {
  const w = src?.workerInfo || {};
  return String(w.workerName || w.name || w.workerDisplayName || w.displayName || "").trim();
}
function coupangId(src) {
  const w = src?.workerInfo || {};
  for (const k of ["coupangId", "loginId", "coupangLoginId", "workerLoginId"]) {
    const v = w?.[k] ?? src?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}
function workerKey(src) {
  const w = src?.workerInfo || {};
  const cid = coupangId(src);
  if (cid) return `coupang:${cid.toLowerCase()}`;
  const name = workerName(src);
  if (name) return `name:${name.toLowerCase()}`;
  for (const k of ["workerSrl", "workerId", "id", "userId", "memberSrl", "memberId"]) {
    const v = w?.[k] ?? src?.[k];
    if (v != null && String(v).trim()) return `${k}:${String(v).trim()}`;
  }
  const routes = uniq((w.workSubRoutes || []).map(normRoute)).sort().join(",");
  return `fallback:${routes || "no-route"}`;
}
function canonicalIdentity(cid, name, fallback) {
  const id = String(cid || "").trim().toLowerCase();
  if (id) return `coupang:${id}`;
  const dn = String(name || "").trim().toLowerCase();
  if (dn) return `name:${dn}`;
  return String(fallback || "unknown");
}
function rowIdentity(r) { return r?.driver_pk != null ? `pk:${Number(r.driver_pk)}` : canonicalIdentity(r?.coupang_id, r?.driver_name, r?.meta_worker_key); }
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
}
function sourceCampCode(src) {
  const w = src?.workerInfo || {};
  for (const k of ["campCode", "sourceCampCode", "workCampCode"]) {
    const v = src?.[k] ?? w?.[k];
    if (v != null && String(v).trim()) return String(v).trim().toUpperCase();
  }
  return null;
}
function deliveryMetric(s = {}) {
  const assigned = +s.assignedCount || 0;
  const scanned = +s.scannedCount || 0;
  const completed = +s.completedCount || 0;
  const impossible = +s.impossibleCount || 0;
  const pdd = +s.pddMissCount || 0;
  const total = assigned + scanned + completed + impossible + pdd;
  const settled = completed + impossible + assigned + pdd;
  return { assigned, scanned, completed, impossible, pdd, total, rate: pct(settled, total) };
}
function collectionMetric(s = {}, includeAbsent = false) {
  const pending = +s.assignedCount || 0;
  const collected = +s.collectedCount || 0;
  const rawUn = +s.uncollectedCount || 0;
  const rawAbsent = includeAbsent ? (+s.absentCount || 0) : 0;
  const uncollected = Math.max(rawUn, rawAbsent);
  const total = pending + collected + uncollected;
  const attempted = collected + uncollected;
  return { pending, collected, rawUn, rawAbsent, uncollected, total, attemptRate: pct(attempted, total), collectionRate: pct(collected, total) };
}
function metaCampCandidates(codes) {
  const out = [];
  for (const raw of codes || []) {
    const c = String(raw || "").trim().toUpperCase();
    if (!c) continue;
    out.push(c);
    if (/^SG\d{2}$/.test(c)) out.push(`S6${c.slice(2)}`);
    if (/^MO\d{2}$/.test(c)) out.push(`M0${c.slice(2)}`);
  }
  return uniq(out);
}

async function sb(env, path, init = {}) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status} ${path}: ${text.slice(0, 500)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
const sbGet = (env, path) => sb(env, path);
const sbPatch = (env, path, body) => sb(env, path, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(body) });
const sbDelete = (env, path) => sb(env, path, { method: "DELETE", headers: { prefer: "return=minimal" } });
const sbPost = (env, path, body, prefer = "return=representation") => sb(env, path, { method: "POST", headers: { prefer }, body: JSON.stringify(body) });
const sbUpsert = (env, path, body, conflict) => sb(env, `${path}?on_conflict=${encodeURIComponent(conflict)}`, {
  method: "POST", headers: { prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(body)
});

function parseCookieBundle(bundle) {
  const map = new Map();
  for (const part of String(bundle || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  return map;
}
function cookieHeader(map) { return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
function splitSetCookie(raw) {
  if (!raw) return [];
  return String(raw).split(/,(?=[^;,]+=)/g);
}
function absorbSetCookies(map, response) {
  const lines = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get("set-cookie"));
  for (const line of lines) {
    const first = String(line || "").split(";", 1)[0];
    const i = first.indexOf("=");
    if (i <= 0) continue;
    const name = first.slice(0, i), value = first.slice(i + 1);
    const expired = /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(line) || value === "";
    if (expired) map.delete(name); else map.set(name, value);
  }
}
async function metaPost(cookies, url, payload) {
  const r = await fetch(url, {
    method: "POST", redirect: "manual",
    headers: {
      accept: "application/json", "accept-language": "ko-KR",
      "content-type": "application/json;charset=UTF-8", origin: "https://fly.coupang.com",
      referer: FLY_REALTIME, "user-agent": UA, "x-coupang-accept-language": "ko-KR",
      "x-requested-with": "XMLHttpRequest", cookie: cookieHeader(cookies)
    },
    body: JSON.stringify(payload)
  });
  absorbSetCookies(cookies, r);
  const text = await r.text(); let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: r.status, text, body, success: r.status === 200 && (body?.message === "SUCCESS" || Array.isArray(body?.data?.content) || Array.isArray(body?.content) || Array.isArray(body?.data?.data?.content)) };
}
function workerPayload(campCodes, wave, workDate, pddTime = null) {
  return { campCodes, page: 0, size: 100, sortDirection: "ASC", sortType: "DELIVERY_COMPLETED_RATIO", waveCode: wave, workDate, ...(pddTime ? { pddTime } : {}) };
}

async function sessionState(env) {
  const rows = await sbGet(env, "meta_backend_state?id=eq.1&select=*");
  return rows?.[0] || null;
}
async function saveSession(env, cookies, status = "active", http = 200, error = null) {
  const patch = { cookie_bundle: cookieHeader(cookies), status, last_http_status: http, last_error: error, updated_at: nowIso() };
  if (!error) patch.last_success_at = nowIso();
  await sbPatch(env, "meta_backend_state?id=eq.1", patch);
}
async function loadCampCodes(env, camp) {
  const rows = await sbGet(env, `camps?select=code&camp=eq.${encodeURIComponent(camp)}&code=not.is.null`);
  return uniq((rows || []).map(r => String(r.code || "").toUpperCase())).sort();
}
async function loadSchedule(env, date, wave, camp) {
  return await sbGet(env, `maroowell_schedule?select=route_label,driver_name,driver_display_name,driver_owner_name,driver_coupang_id,driver_account_type,row_order&schedule_date=eq.${date}&wave=eq.${wave}&camp=eq.${encodeURIComponent(camp)}&is_active=eq.true&order=row_order.asc`) || [];
}
function scheduleMatch(rows, cid, name) {
  const id = String(cid || "").trim().toLowerCase();
  const dn = String(name || "").trim();
  let hit = rows.filter(r => id && String(r.driver_coupang_id || "").trim().toLowerCase() === id);
  if (!hit.length && dn) hit = rows.filter(r => [r.driver_display_name, r.driver_name, r.driver_owner_name].some(x => String(x || "").trim() === dn));
  return hit;
}
function scheduledRouteMatches(actual, scheduled) {
  const a = normRoute(actual), b = normRoute(scheduled);
  return !!a && !!b && (a === b || a.startsWith(b));
}
function scheduleMatchByRoutes(rows, actualRoutes) {
  const owned = new Map();
  for (const actual of actualRoutes || []) {
    const candidates = rows.filter(r => r.route_label && r.route_label !== "휴무자" && scheduledRouteMatches(actual, r.route_label));
    candidates.sort((a, b) => normRoute(b.route_label).length - normRoute(a.route_label).length);
    const best = candidates[0];
    if (!best) continue;
    const key = String(best.driver_coupang_id || best.driver_display_name || best.driver_name || best.driver_owner_name || "").trim();
    if (!key) continue;
    owned.set(key, (owned.get(key) || 0) + 1);
  }
  const ranked = [...owned.entries()].sort((a,b) => b[1]-a[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return [];
  const winner = ranked[0][0];
  return rows.filter(r => String(r.driver_coupang_id || r.driver_display_name || r.driver_name || r.driver_owner_name || "").trim() === winner);
}

async function ensureBatches(env) {
  const kp = kstParts();
  const targets = [];
  if (kp.hour >= 8) targets.push({ date: kp.date, wave: "WAVE2" });
  if (kp.hour >= 20) targets.push({ date: kp.date, wave: "WAVE1" });
  else if (kp.hour < 12) targets.push({ date: addDate(kp.date, -1), wave: "WAVE1" });
  for (const t of targets) {
    const schedules = await sbGet(env, `maroowell_schedule?select=camp&schedule_date=eq.${t.date}&wave=eq.${t.wave}&is_active=eq.true`);
    for (const camp of uniq((schedules || []).map(r => r.camp))) {
      const dbCodes = await loadCampCodes(env, camp), codes = metaCampCandidates(dbCodes);
      if (!codes.length) continue;
      const campCode = dbCodes[0] || codes[0];
      const found = await sbGet(env, `meta_realtime_batch?select=id,meta_camp_codes&schedule_date=eq.${t.date}&camp_code=eq.${encodeURIComponent(campCode)}&wave=eq.${t.wave}&limit=1`);
      if (found?.length) {
        await sbPatch(env, `meta_realtime_batch?id=eq.${found[0].id}`, { meta_camp_codes: codes, updated_at: nowIso() });
        continue;
      }
      await sbPost(env, "meta_realtime_batch", {
        schedule_date: t.date, meta_work_date: t.wave === "WAVE1" ? addDate(t.date, 1) : t.date,
        camp_code: campCode, camp_name: camp, wave: t.wave, meta_camp_codes: codes,
        status: "collecting", poll_interval_seconds: 60, next_poll_at: nowIso(), updated_at: nowIso()
      });
    }
  }
}
async function dueBatches(env) {
  const now = encodeURIComponent(nowIso());
  return await sbGet(env, `meta_realtime_batch?select=*&status=in.(collecting,completion_candidate,overdue,error)&or=(next_poll_at.is.null,next_poll_at.lte.${now})&order=started_at.asc`) || [];
}
async function storeFreshRows(env, batch, schedule, directory, fresh, now) {
  if (batch.wave !== "WAVE2" || !fresh?.success) return 0;
  const map = new Map();
  for (const src of metaContent(fresh.body)) {
    const w = src?.workerInfo || {}, name = workerName(src), metaCid = coupangId(src);
    const actualRoutes = uniq((w.workSubRoutes || []).map(normRoute));
    let matched = scheduleMatch(schedule, metaCid, name);
    if (!matched.length) matched = scheduleMatchByRoutes(schedule, actualRoutes);
    const realCid = String(matched[0]?.driver_coupang_id || metaCid || "").trim() || null;
    const mappedName = String(matched[0]?.driver_display_name || matched[0]?.driver_name || matched[0]?.driver_owner_name || name || "").trim() || null;
    const driverPk = resolveDriverPk(directory, realCid, mappedName, batch.camp_name, batch.wave);
    const key = driverIdentity(driverPk, realCid, mappedName, workerKey(src));
    const d = deliveryMetric(src?.deliverySummary || {});
    if (d.total <= 0) continue;
    const rec = { batch_id:batch.id, schedule_date:batch.schedule_date, meta_work_date:batch.meta_work_date, camp_code:batch.camp_code, camp_name:batch.camp_name, wave:batch.wave, meta_worker_key:key, driver_pk:driverPk, coupang_id:realCid, driver_name:mappedName, delivery_assigned:d.assigned, delivery_scanned:d.scanned, delivery_completed:d.completed, delivery_impossible:d.impossible, delivery_pdd_miss:d.pdd, delivery_total:d.total, delivery_complete_rate:d.rate, last_seen_at:now, raw_payload:{ fresh:src, collected_at:now }, updated_at:now };
    const old = map.get(key);
    if (!old || rec.delivery_total > old.delivery_total) map.set(key, rec);
  }
  await sbDelete(env, `meta_realtime_fresh_current?batch_id=eq.${batch.id}`);
  const rows = [...map.values()];
  if (rows.length) await sbUpsert(env, "meta_realtime_fresh_current", rows, "batch_id,meta_worker_key");
  return rows.length;
}

async function processBatch(env, cookies, batch) {
  const dbCodes = await loadCampCodes(env, batch.camp_name);
  const codes = uniq(batch.meta_camp_codes?.length ? batch.meta_camp_codes : metaCampCandidates(dbCodes));
  if (!codes.length) throw new Error(`캠프 코드 없음: ${batch.camp_name}`);
  const main = await metaPost(cookies, META_WORKER_URL, workerPayload(codes, batch.wave, batch.meta_work_date));
  if (!main.success) throw new Error(`META ${main.status}: ${main.text.slice(0, 240)}`);
  let fresh = null;
  if (batch.wave === "WAVE2") fresh = await metaPost(cookies, META_WORKER_URL, workerPayload(codes, batch.wave, batch.meta_work_date, "20:00"));

  const schedule = await loadSchedule(env, batch.schedule_date, batch.wave, batch.camp_name);
  const directory = await loadDriverDirectory(env);
  const prevRows = await sbGet(env, `meta_realtime_current?select=*&batch_id=eq.${batch.id}`) || [];
  const prevMap = new Map(prevRows.map(r => [rowIdentity(r), r]));
  const byKey = new Map(), now = nowIso();

  for (const src of metaContent(main.body)) {
    const w = src?.workerInfo || {}, name = workerName(src);
    const metaCid = coupangId(src);
    const actualRoutes = uniq((w.workSubRoutes || []).map(normRoute));
    let matched = scheduleMatch(schedule, metaCid, name);
    if (!matched.length) matched = scheduleMatchByRoutes(schedule, actualRoutes);
    const scheduledRoutes = uniq(matched.map(r => normRoute(r.route_label)).filter(r => r && r !== "휴무자"));
    const realCid = String(matched[0]?.driver_coupang_id || metaCid || "").trim() || null;
    const mappedName = String(matched[0]?.driver_display_name || matched[0]?.driver_name || matched[0]?.driver_owner_name || name || "").trim() || null;
    const driverPk = resolveDriverPk(directory, realCid, mappedName, batch.camp_name, batch.wave);
    const key = driverIdentity(driverPk, realCid, mappedName, workerKey(src)), prev = prevMap.get(key);
    const accountType = String(matched[0]?.driver_account_type || w.workerAccountType || w.accountType || "").trim() || null;
    const d = deliveryMetric(src?.deliverySummary || {}), fb = collectionMetric(src?.freshbagSummary || {}, false);
    const ret = batch.wave === "WAVE1" ? null : collectionMetric(src?.returnSummary || {}, true);
    const routeAlerts = actualRoutes.filter(a => !scheduledRoutes.some(sr => scheduledRouteMatches(a, sr))).map(route => {
      const owners = schedule.filter(r => r.route_label && r.route_label !== "휴무자" && scheduledRouteMatches(route, r.route_label)).sort((a,b) => normRoute(b.route_label).length - normRoute(a.route_label).length);
      const owner = owners[0];
      if (!owner) return { route, type: "uncontracted" };
      const ownerName = String(owner.driver_display_name || owner.driver_name || owner.driver_owner_name || owner.driver_coupang_id || "원주인").trim();
      return { route, type: "borrowed", owner: ownerName };
    });
    const deliveryDone = d.total > 0 && d.scanned === 0 && (d.completed + d.impossible + d.assigned + d.pdd) >= d.total;
    const returnDone = batch.wave === "WAVE1" ? null : (ret.total === 0 || (ret.pending === 0 && ret.collected + ret.uncollected >= ret.total));
    const freshbagDone = fb.total === 0 || (fb.pending === 0 && fb.collected + fb.uncollected >= fb.total);
    const allDone = deliveryDone;
    const rec = {
      batch_id: batch.id, schedule_date: batch.schedule_date, meta_work_date: batch.meta_work_date,
      camp_code: batch.camp_code, camp_name: batch.camp_name, wave: batch.wave,
      meta_worker_key: key, source_camp_code: sourceCampCode(src), driver_pk: driverPk, coupang_id: realCid,
      driver_name: mappedName, driver_account_type: accountType, scheduled_routes: scheduledRoutes, actual_routes: actualRoutes,
      delivery_assigned: d.assigned, delivery_scanned: d.scanned, delivery_completed: d.completed, delivery_impossible: d.impossible,
      delivery_pdd_miss: d.pdd, delivery_total: d.total, delivery_complete_rate: d.rate,
      fresh_delivery_assigned: 0, fresh_delivery_scanned: 0, fresh_delivery_completed: 0,
      fresh_delivery_impossible: 0, fresh_delivery_pdd_miss: 0, fresh_delivery_total: 0, fresh_delivery_complete_rate: 0,
      return_pending: ret?.pending ?? null, return_collected: ret?.collected ?? null, return_uncollected_raw: ret?.rawUn ?? null, return_absent_raw: ret?.rawAbsent ?? null,
      return_total: ret?.total ?? null, return_attempt_rate: ret?.attemptRate ?? null, return_collection_rate: ret?.collectionRate ?? null,
      freshbag_pending: fb.pending, freshbag_collected: fb.collected, freshbag_uncollected: fb.uncollected,
      freshbag_total: fb.total, freshbag_attempt_rate: fb.attemptRate, freshbag_collection_rate: fb.collectionRate,
      scan_started_at: prev?.scan_started_at || ((d.scanned + d.completed + d.impossible + d.pdd) > 0 ? now : null),
      delivery_started_at: prev?.delivery_started_at || ((d.completed + (ret?.collected || 0) + (ret?.uncollected || 0) + fb.collected + fb.uncollected) > 0 ? now : null),
      delivery_completed_at: prev?.delivery_completed_at || (deliveryDone ? now : null),
      all_completed_at: prev?.all_completed_at || (allDone ? now : null), first_seen_at: prev?.first_seen_at || now, last_seen_at: now,
      delivery_done: deliveryDone, return_done: returnDone, freshbag_done: freshbagDone,
      raw_payload: { main: src, route_alerts: routeAlerts, share_candidate: routeAlerts.length > 0, collected_at: now }, updated_at: now
    };
    const old = byKey.get(key);
    if (!old || rec.delivery_total > old.delivery_total) byKey.set(key, rec);
    else {
      old.actual_routes = uniq([...(old.actual_routes || []), ...actualRoutes]);
      const priorAlerts = Array.isArray(old.raw_payload?.route_alerts) ? old.raw_payload.route_alerts : [];
      old.raw_payload = { ...old.raw_payload, route_alerts: [...priorAlerts, ...routeAlerts] };
    }
  }

  const rows = [...byKey.values()];
  await sbDelete(env, `meta_realtime_current?batch_id=eq.${batch.id}`);
  if (rows.length) await sbUpsert(env, "meta_realtime_current", rows, "batch_id,meta_worker_key");
  await storeFreshRows(env, batch, schedule, directory, fresh, now);
  const complete = rows.length > 0 && rows.every(r => r.delivery_done && (batch.wave === "WAVE1" || r.return_done) && r.freshbag_done);
  const stable = complete ? Number(batch.stable_complete_poll_count || 0) + 1 : 0;
  const kp = kstParts(), lateNight = batch.wave === "WAVE1" && kp.hour >= 12 && kp.hour < 20;
  const interval = lateNight ? 300 : 60;
  const patch = {
    meta_camp_codes: codes, last_polled_at: now, worker_count: rows.length,
    completed_worker_count: rows.filter(r => r.delivery_done && (batch.wave === "WAVE1" || r.return_done) && r.freshbag_done).length,
    stable_complete_poll_count: stable, status: complete ? "completion_candidate" : (lateNight ? "overdue" : "collecting"),
    poll_interval_seconds: interval, next_poll_at: kstIsoAt(Date.now() + interval * 1000), last_error: null, updated_at: now
  };
  if (complete && !batch.completion_candidate_at) patch.completion_candidate_at = now;
  await sbPatch(env, `meta_realtime_batch?id=eq.${batch.id}`, patch);
  if (complete && stable >= 2) {
    const freshFinal = await sbGet(env, `meta_realtime_fresh_current?select=*&batch_id=eq.${batch.id}`) || [];
    const finalized = await sbPost(env, "rpc/meta_finalize_realtime_batch", { p_batch_id: batch.id });
    for (const f of freshFinal) {
      await sbPatch(env, `meta_realtime_final?batch_id=eq.${batch.id}&meta_worker_key=eq.${encodeURIComponent(f.meta_worker_key)}`, {
        fresh_delivery_assigned:f.delivery_assigned, fresh_delivery_scanned:f.delivery_scanned, fresh_delivery_completed:f.delivery_completed,
        fresh_delivery_impossible:f.delivery_impossible, fresh_delivery_pdd_miss:f.delivery_pdd_miss, fresh_delivery_total:f.delivery_total, fresh_delivery_complete_rate:f.delivery_complete_rate
      });
    }
    await sbDelete(env, `meta_realtime_fresh_current?batch_id=eq.${batch.id}`);
    return { camp: batch.camp_name, wave: batch.wave, workers: rows.length, finalized, codes };
  }
  return { camp: batch.camp_name, wave: batch.wave, workers: rows.length, complete, stable, codes };
}

async function heartbeat(env, cookies) {
  const rows = await sbGet(env, "camps?select=code&code=not.is.null&limit=30");
  const codes = metaCampCandidates((rows || []).map(r => r.code));
  const kp = kstParts();
  const r = await metaPost(cookies, META_CAMP_URL, workerPayload(codes, "WAVE2", kp.date));
  await saveSession(env, cookies, r.success ? "active" : "expired", r.status, r.success ? null : `heartbeat ${r.status}`);
  return { ok: r.success, status: r.status };
}
async function runCollector(env, force = false) {
  const state = await sessionState(env);
  if (!state?.cookie_bundle) return { ok: false, error: "META DB session 없음" };
  const cookies = parseCookieBundle(state.cookie_bundle);
  await ensureBatches(env);
  const due = await dueBatches(env), results = [];
  for (const batch of due) {
    try {
      results.push(await processBatch(env, cookies, batch));
    } catch (e) {
      const msg = String(e?.message || e);
      results.push({ camp: batch.camp_name, wave: batch.wave, error: msg });
      await sbPatch(env, `meta_realtime_batch?id=eq.${batch.id}`, {
        status: "error", last_error: msg.slice(0, 500), next_poll_at: kstIsoAt(Date.now() + 300000), updated_at: nowIso()
      });
      if (/META (401|403|302)/.test(msg)) { await saveSession(env, cookies, "expired", Number(msg.match(/META (\d+)/)?.[1] || 401), msg.slice(0, 250)); break; }
    }
  }
  const kp = kstParts();
  if (!due.length && (force || kp.minute % 5 === 0)) results.push({ heartbeat: await heartbeat(env, cookies) });
  else if (due.length) await saveSession(env, cookies, "active", 200, null);
  return { ok: true, at: nowIso(), due: due.length, results };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/collector/run") return json(await runCollector(env, true));
      if (path === "/collector/status") {
        const batches = await sbGet(env, "meta_realtime_batch?select=*&order=schedule_date.desc,started_at.desc&limit=50");
        return json({ ok: true, batches });
      }
      if (path.startsWith("/login-") || path === "/test-db") return authWorker.fetch(request, env);
      return json({ ok: true, message: "Maroowell META collector", endpoints: ["/collector/run", "/collector/status", "/login-send-code", "/test-db"] });
    } catch (e) { return json({ ok: false, error: String(e?.message || e) }, 500); }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCollector(env).catch(async e => {
      try {
        await sbPatch(env, "meta_backend_state?id=eq.1", { status: "error", last_error: `collector cron: ${String(e?.message || e).slice(0, 300)}`, updated_at: nowIso() });
      } catch {}
    }));
  }
};