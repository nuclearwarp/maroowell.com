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
  const sourceRate = Number(s.completedRatio);
  const rate = Number.isFinite(sourceRate) ? sourceRate : (total > 0 ? pct(completed, total) : 0);
  return { assigned, scanned, completed, impossible, pdd, total, rate };
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

function tsMs(v) {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z");
}
function minutesBetween(a, b) {
  const x = tsMs(a), y = tsMs(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.max(0, (y - x) / 60000) : 0;
}
function addMinutesIso(v, minutes) {
  const x = tsMs(v);
  if (!Number.isFinite(x)) return null;
  return new Date(x + minutes * 60000).toISOString().slice(0, -1);
}
function sampleMinute(v) { return String(v || "").slice(0, 16) + ":00"; }
function expectedRounds(batch) { return Math.max(1, Math.min(3, Number(batch?.expected_rounds || 2))); }
function metricsCloseReached(batch) {
  const close = tsMs(batch?.metrics_close_at);
  if (Number.isFinite(close)) return Date.now() >= close;
  const kp = kstParts();
  const scheduleDate = String(batch?.schedule_date || "");
  const wave = String(batch?.wave || "").toUpperCase();
  if (!scheduleDate) return false;
  if (wave === "WAVE2") return kp.date > scheduleDate || (kp.date === scheduleDate && kp.hour === 23 && kp.minute >= 59);
  if (wave === "WAVE1") {
    const closeDate = addDate(scheduleDate, 1);
    return kp.date > closeDate || (kp.date === closeDate && kp.hour === 11 && kp.minute >= 59);
  }
  return false;
}
function schedulePersonKey(r) {
  const id = String(r?.driver_coupang_id || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  const name = String(r?.driver_display_name || r?.driver_name || r?.driver_owner_name || "").trim();
  return name ? `name:${name}` : "";
}
function scheduledPeople(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!r || r.route_label === "휴무자") continue;
    const key = schedulePersonKey(r);
    if (key && !map.has(key)) map.set(key, {
      key,
      id: String(r.driver_coupang_id || "").trim().toLowerCase(),
      names: uniq([r.driver_display_name,r.driver_name,r.driver_owner_name].map(x=>String(x||"").trim()).filter(Boolean))
    });
  }
  return [...map.values()];
}
function currentMatchesPerson(r, p) {
  const id = String(r?.coupang_id || "").trim().toLowerCase();
  if (p.id && id === p.id) return true;
  const name = String(r?.driver_name || "").trim();
  return !!name && p.names.includes(name);
}
function progressChanged(prev, d, ret, fb, wave) {
  if (!prev) return false;
  const pairs = [
    [prev.delivery_assigned,d.assigned],[prev.delivery_scanned,d.scanned],[prev.delivery_completed,d.completed],
    [prev.delivery_impossible,d.impossible],[prev.delivery_pdd_miss,d.pdd],[prev.delivery_total,d.total],
    [prev.freshbag_pending,fb.pending],[prev.freshbag_collected,fb.collected],[prev.freshbag_uncollected,fb.uncollected]
  ];
  if (wave !== "WAVE1" && ret) pairs.push(
    [prev.return_pending,ret.pending],[prev.return_collected,ret.collected],[prev.return_uncollected_raw,ret.rawUn],[prev.return_absent_raw,ret.rawAbsent]
  );
  return pairs.some(([a,b]) => Number(a ?? 0) !== Number(b ?? 0));
}
function scanActivity(prev, d) {
  if (!prev) return d.scanned > 0 || d.completed > 0 || d.impossible > 0 || d.pdd > 0;
  return d.scanned > Number(prev.delivery_scanned || 0)
    || d.total > Number(prev.delivery_total || 0)
    || d.assigned > Number(prev.delivery_assigned || 0);
}
function deliveryActivity(prev, d) {
  // "배송 시작"은 배송 자체의 실적 변화만 의미한다.
  // 반품/프백 변화는 progress 판단에는 쓰지만 배송 시작시각을 만들지 않는다.
  if (!prev) return (d.completed + d.impossible + d.pdd) > 0;
  return d.completed > Number(prev.delivery_completed || 0)
    || d.impossible > Number(prev.delivery_impossible || 0)
    || d.pdd > Number(prev.delivery_pdd_miss || 0);
}
function roundFields(prev, round) {
  return {
    scan: prev?.[`round${round}_scan_started_at`] || (round === 1 ? (prev?.scan_started_at || null) : null),
    delivery: prev?.[`round${round}_delivery_started_at`] || (round === 1 ? (prev?.delivery_started_at || null) : null),
    completed: prev?.[`round${round}_completed_at`] || null,
    detected: prev?.[`round${round}_completion_detected_at`] || null,
    method: prev?.[`round${round}_completion_method`] || null
  };
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
  if (kp.hour >= 7) targets.push({ date: kp.date, wave: "WAVE2" });
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
        status: "collecting", expected_rounds: 2, poll_interval_seconds: 60, next_poll_at: nowIso(), updated_at: nowIso()
      });
    }
  }
}
function isActiveBatchDate(batch) {
  const kp = kstParts();
  const wave = String(batch?.wave || "").toUpperCase();
  const scheduleDate = String(batch?.schedule_date || "");
  if (wave === "WAVE2") return scheduleDate === kp.date;
  if (wave === "WAVE1") {
    const activeNightDate = kp.hour < 12 ? addDate(kp.date, -1) : kp.date;
    return scheduleDate === activeNightDate;
  }
  return false;
}
async function purgeStaleRealtimeRows(env) {
  const rows = await sbGet(env, "meta_realtime_batch?select=id,schedule_date,wave,status&status=in.(collecting,completion_candidate,overdue,error)") || [];
  const stale = rows.filter(r => !isActiveBatchDate(r));
  for (const batch of stale) {
    await sbDelete(env, `meta_realtime_current?batch_id=eq.${batch.id}`);
    await sbDelete(env, `meta_realtime_fresh_current?batch_id=eq.${batch.id}`);
  }
  return stale.length;
}
async function dueBatches(env) {
  const now = encodeURIComponent(nowIso());
  const rows = await sbGet(env, `meta_realtime_batch?select=*&status=in.(collecting,completion_candidate,overdue,error)&or=(next_poll_at.is.null,next_poll_at.lte.${now})&order=started_at.asc`) || [];
  return rows.filter(isActiveBatchDate);
}
async function storeFreshRows(env, batch, schedule, directory, fresh, now) {
  if (batch.wave !== "WAVE2" || !fresh?.success) return [];
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
  return rows;
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
  const byKey = new Map(), now = nowIso(), expRounds = expectedRounds(batch);

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

    const deliveryDone = d.total > 0 && d.scanned === 0;
    const returnDone = batch.wave === "WAVE1" ? true : (ret.total === 0 || ret.pending === 0);
    const freshbagDone = fb.total === 0 || fb.pending === 0;
    const exactDone = deliveryDone && returnDone && freshbagDone;
    const changed = progressChanged(prev, d, ret, fb, batch.wave);
    const scanMoved = scanActivity(prev, d);
    const deliveryMoved = deliveryActivity(prev, d);

    let currentRound = Math.max(1, Math.min(3, Number(prev?.current_round || 1)));
    let lastProgressAt = changed ? now : (prev?.last_progress_at || now);
    let lastScanActivityAt = scanMoved ? now : (prev?.last_scan_activity_at || null);
    const rounds = {1:roundFields(prev,1),2:roundFields(prev,2),3:roundFields(prev,3)};

    if (!rounds[1].scan && (d.scanned > 0 || d.completed > 0 || d.impossible > 0 || d.pdd > 0)) rounds[1].scan = now;
    if (!rounds[currentRound].delivery && deliveryMoved) rounds[currentRound].delivery = now;

    if (rounds[currentRound].completed && currentRound < expRounds && scanMoved) {
      currentRound += 1;
      if (!rounds[currentRound].scan) rounds[currentRound].scan = now;
      if (!rounds[currentRound].delivery && deliveryMoved) rounds[currentRound].delivery = now;
      lastProgressAt = now;
      lastScanActivityAt = now;
    }

    const idleMinutes = minutesBetween(lastProgressAt, now);
    if (currentRound < expRounds && rounds[currentRound].delivery && !rounds[currentRound].completed && idleMinutes >= 30) {
      rounds[currentRound].completed = addMinutesIso(lastProgressAt, 1);
      rounds[currentRound].detected = now;
      rounds[currentRound].method = "idle_30m";
    }

    const deliveryRemaining = Math.max(0, d.scanned);
    const returnRemaining = batch.wave === "WAVE1" ? 0 : Math.max(0, ret?.pending || 0);
    const freshbagRemaining = Math.max(0, fb.pending || 0);
    const totalRemaining = deliveryRemaining + returnRemaining + freshbagRemaining;
    const hadDeliveryActivity = !!(prev?.delivery_started_at || rounds[1].delivery || d.completed > 0 || d.impossible > 0 || d.pdd > 0);
    const exactCandidate = exactDone && hadDeliveryActivity ? (prev?.exact_complete_candidate_at || now) : null;
    const exactConfirmed = exactDone && hadDeliveryActivity && !!prev?.exact_complete_candidate_at;
    const finalRoundReady = currentRound >= expRounds && !!rounds[currentRound].delivery;
    const staleTailConfirmed = finalRoundReady
      && deliveryRemaining <= 2
      && (batch.wave === "WAVE1" || returnRemaining <= 2)
      && freshbagRemaining <= 2
      && idleMinutes >= 30;

    let workCompletedAt = prev?.work_completed_at || null;
    let completionMethod = prev?.completion_method || null;
    let completionDetectedAt = prev?.completion_detected_at || null;

    if (!workCompletedAt && exactConfirmed) {
      workCompletedAt = prev.exact_complete_candidate_at;
      completionMethod = "exact_2poll";
      completionDetectedAt = now;
    } else if (!workCompletedAt && staleTailConfirmed) {
      workCompletedAt = addMinutesIso(lastProgressAt, 1);
      completionMethod = "stale_tail_30m";
      completionDetectedAt = now;
    }

    if (workCompletedAt) {
      if (!rounds[currentRound].completed) rounds[currentRound].completed = workCompletedAt;
      if (!rounds[currentRound].detected) rounds[currentRound].detected = completionDetectedAt;
      if (!rounds[currentRound].method) rounds[currentRound].method = completionMethod;
    }

    const rec = {
      batch_id: batch.id, schedule_date: batch.schedule_date, meta_work_date: batch.meta_work_date,
      camp_code: batch.camp_code, camp_name: batch.camp_name, wave: batch.wave,
      meta_worker_key: key, source_camp_code: sourceCampCode(src), driver_pk: driverPk, coupang_id: realCid,
      driver_name: mappedName, driver_account_type: accountType, scheduled_routes: scheduledRoutes, actual_routes: actualRoutes,
      delivery_assigned: d.assigned, delivery_scanned: d.scanned, delivery_completed: d.completed, delivery_impossible: d.impossible,
      delivery_pdd_miss: d.pdd, delivery_total: d.total, delivery_complete_rate: d.rate,
      fresh_delivery_assigned: prev?.fresh_delivery_assigned || 0, fresh_delivery_scanned: prev?.fresh_delivery_scanned || 0,
      fresh_delivery_completed: prev?.fresh_delivery_completed || 0, fresh_delivery_impossible: prev?.fresh_delivery_impossible || 0,
      fresh_delivery_pdd_miss: prev?.fresh_delivery_pdd_miss || 0, fresh_delivery_total: prev?.fresh_delivery_total || 0,
      fresh_delivery_complete_rate: prev?.fresh_delivery_complete_rate || 0,
      return_pending: ret?.pending ?? null, return_collected: ret?.collected ?? null, return_uncollected_raw: ret?.rawUn ?? null,
      return_absent_raw: ret?.rawAbsent ?? null,
      return_total: ret?.total ?? null, return_attempt_rate: ret?.attemptRate ?? null, return_collection_rate: ret?.collectionRate ?? null,
      freshbag_pending: fb.pending, freshbag_collected: fb.collected, freshbag_uncollected: fb.uncollected,
      freshbag_total: fb.total, freshbag_attempt_rate: fb.attemptRate, freshbag_collection_rate: fb.collectionRate,

      current_round: currentRound, expected_rounds: expRounds,
      last_progress_at: lastProgressAt, last_scan_activity_at: lastScanActivityAt,
      exact_complete_candidate_at: exactCandidate,
      round1_scan_started_at: rounds[1].scan, round1_delivery_started_at: rounds[1].delivery,
      round1_completed_at: rounds[1].completed, round1_completion_detected_at: rounds[1].detected, round1_completion_method: rounds[1].method,
      round2_scan_started_at: rounds[2].scan, round2_delivery_started_at: rounds[2].delivery,
      round2_completed_at: rounds[2].completed, round2_completion_detected_at: rounds[2].detected, round2_completion_method: rounds[2].method,
      round3_scan_started_at: rounds[3].scan, round3_delivery_started_at: rounds[3].delivery,
      round3_completed_at: rounds[3].completed, round3_completion_detected_at: rounds[3].detected, round3_completion_method: rounds[3].method,
      completion_method: completionMethod, completion_detected_at: completionDetectedAt,
      work_completed_at: workCompletedAt,

      scan_started_at: prev?.scan_started_at || rounds[1].scan,
      delivery_started_at: prev?.delivery_started_at || rounds[1].delivery,
      delivery_completed_at: prev?.delivery_completed_at || workCompletedAt || null,
      all_completed_at: workCompletedAt,
      first_seen_at: prev?.first_seen_at || now, last_seen_at: now,
      delivery_done: deliveryDone,
      return_done: batch.wave === "WAVE1" ? null : returnDone,
      freshbag_done: freshbagDone,
      raw_payload: { main: src, route_alerts: routeAlerts, share_candidate: routeAlerts.length > 0, collected_at: now, total_remaining: totalRemaining },
      updated_at: now
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
  // Current is stateful for the full active batch. Never delete a worker row merely
  // because META omitted it from one or more polls; finalize is the only bulk cleanup.
  if (rows.length) await sbUpsert(env, "meta_realtime_current", rows, "batch_id,meta_worker_key");

  const freshRows = await storeFreshRows(env, batch, schedule, directory, fresh, now);
  const freshMap = new Map((freshRows || []).map(r => [r.meta_worker_key, r]));
  if (rows.length) {
    const minute = sampleMinute(now);
    const historyRows = rows.map(r => {
      const fr = freshMap.get(r.meta_worker_key);
      const deliveryRemaining = Math.max(0, Number(r.delivery_scanned || 0));
      const totalRemaining = deliveryRemaining + (batch.wave === "WAVE1" ? 0 : Math.max(0, Number(r.return_pending || 0))) + Math.max(0, Number(r.freshbag_pending || 0));
      return {
        batch_id:r.batch_id,sampled_at:now,sample_minute:minute,schedule_date:r.schedule_date,meta_work_date:r.meta_work_date,
        camp_code:r.camp_code,camp_name:r.camp_name,wave:r.wave,meta_worker_key:r.meta_worker_key,driver_pk:r.driver_pk,
        coupang_id:r.coupang_id,driver_name:r.driver_name,current_round:r.current_round,expected_rounds:r.expected_rounds,
        delivery_assigned:r.delivery_assigned,delivery_scanned:r.delivery_scanned,delivery_completed:r.delivery_completed,
        delivery_impossible:r.delivery_impossible,delivery_pdd_miss:r.delivery_pdd_miss,delivery_total:r.delivery_total,delivery_complete_rate:r.delivery_complete_rate,
        fresh_delivery_assigned:fr?.delivery_assigned ?? 0,fresh_delivery_scanned:fr?.delivery_scanned ?? 0,
        fresh_delivery_completed:fr?.delivery_completed ?? 0,fresh_delivery_impossible:fr?.delivery_impossible ?? 0,
        fresh_delivery_pdd_miss:fr?.delivery_pdd_miss ?? 0,fresh_delivery_total:fr?.delivery_total ?? 0,
        fresh_delivery_complete_rate:fr?.delivery_complete_rate ?? 0,
        return_pending:r.return_pending,return_collected:r.return_collected,
        return_uncollected:Math.max(Number(r.return_uncollected_raw || 0),Number(r.return_absent_raw || 0)),return_total:r.return_total,
        freshbag_pending:r.freshbag_pending,freshbag_collected:r.freshbag_collected,freshbag_uncollected:r.freshbag_uncollected,freshbag_total:r.freshbag_total,
        delivery_remaining:deliveryRemaining,total_remaining:totalRemaining,actual_routes:r.actual_routes
      };
    });
    await sbUpsert(env, "meta_realtime_history", historyRows, "batch_id,meta_worker_key,sample_minute");
  }

  const stateRows = await sbGet(env, `meta_realtime_current?select=meta_worker_key,coupang_id,driver_name,work_completed_at,completion_method&batch_id=eq.${batch.id}`) || [];
  const expected = scheduledPeople(schedule);
  const matched = expected.length
    ? expected.map(p => stateRows.find(r => currentMatchesPerson(r,p))).filter(Boolean)
    : stateRows;
  const complete = matched.length > 0
    && (expected.length === 0 || matched.length === expected.length)
    && matched.every(r => !!r.work_completed_at);
  const completedCount = expected.length
    ? expected.filter(p => !!stateRows.find(r => currentMatchesPerson(r,p) && r.work_completed_at)).length
    : stateRows.filter(r => !!r.work_completed_at).length;
  const stable = complete ? Number(batch.stable_complete_poll_count || 0) + 1 : 0;
  const inferred = matched.some(r => r.completion_method === "stale_tail_30m");
  const batchMethod = complete ? (inferred ? "stale_tail_30m" : (batch.completion_method || "exact_2poll")) : null;
  const workCompletedAt = complete
    ? matched.map(r => r.work_completed_at).filter(Boolean).sort().at(-1)
    : (batch.work_completed_at || null);
  const shouldFinalize = complete && metricsCloseReached(batch);
  const patch = {
    meta_camp_codes: codes, last_polled_at: now, worker_count: stateRows.length,
    completed_worker_count: completedCount,
    stable_complete_poll_count: stable,
    status: complete ? "completion_candidate" : "collecting",
    work_completed_at: complete ? (batch.work_completed_at || workCompletedAt) : null,
    metrics_status: "collecting",
    completion_method: complete ? (batch.completion_method || batchMethod) : null,
    completion_detected_at: complete ? (batch.completion_detected_at || now) : null,
    poll_interval_seconds: 60, next_poll_at: kstIsoAt(Date.now() + 60000), last_error: null, updated_at: now
  };
  if (complete && !batch.completion_candidate_at) patch.completion_candidate_at = now;
  await sbPatch(env, `meta_realtime_batch?id=eq.${batch.id}`, patch);

  if (shouldFinalize) {
    const freshFinal = await sbGet(env, `meta_realtime_fresh_current?select=*&batch_id=eq.${batch.id}`) || [];
    const finalized = await sbPost(env, "rpc/meta_finalize_realtime_batch", { p_batch_id: batch.id });
    for (const fr of freshFinal) {
      await sbPatch(env, `meta_realtime_final?batch_id=eq.${batch.id}&meta_worker_key=eq.${encodeURIComponent(fr.meta_worker_key)}`, {
        fresh_delivery_assigned:fr.delivery_assigned, fresh_delivery_scanned:fr.delivery_scanned, fresh_delivery_completed:fr.delivery_completed,
        fresh_delivery_impossible:fr.delivery_impossible, fresh_delivery_pdd_miss:fr.delivery_pdd_miss, fresh_delivery_total:fr.delivery_total,
        fresh_delivery_complete_rate:fr.delivery_complete_rate
      });
    }
    await sbDelete(env, `meta_realtime_fresh_current?batch_id=eq.${batch.id}`);
    return { camp: batch.camp_name, wave: batch.wave, workers: rows.length, finalized, codes, completion_method: batchMethod };
  }
  return { camp: batch.camp_name, wave: batch.wave, workers: rows.length, complete, stable, collecting_after_completion: complete, codes };
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
  await purgeStaleRealtimeRows(env);
  await ensureBatches(env);
  const due = await dueBatches(env), results = [];
  for (const batch of due) {
    const lockToken = crypto.randomUUID();
    let claimed = false;
    try {
      claimed = await sbPost(env, "rpc/meta_claim_realtime_batch", {
        p_batch_id: batch.id,
        p_token: lockToken,
        p_lease_seconds: 120
      });
      if (!claimed) {
        results.push({ camp: batch.camp_name, wave: batch.wave, skipped: "collector_locked" });
        continue;
      }
      results.push(await processBatch(env, cookies, batch));
    } catch (e) {
      const msg = String(e?.message || e);
      results.push({ camp: batch.camp_name, wave: batch.wave, error: msg });
      if (claimed) {
        await sbPatch(env, `meta_realtime_batch?id=eq.${batch.id}`, {
          status: "error", last_error: msg.slice(0, 500), next_poll_at: kstIsoAt(Date.now() + 300000), updated_at: nowIso()
        });
      }
      if (/META (401|403|302)/.test(msg)) { await saveSession(env, cookies, "expired", Number(msg.match(/META (\d+)/)?.[1] || 401), msg.slice(0, 250)); break; }
    } finally {
      if (claimed) {
        try {
          await sbPost(env, "rpc/meta_release_realtime_batch", { p_batch_id: batch.id, p_token: lockToken });
        } catch {}
      }
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