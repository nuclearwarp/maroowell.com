/**
 * Cloudflare Worker - route API + share OG/Twitter + v=yyyymmddHHMM 자동 부여
 *
 * ENV:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTE:
 *  - maroowell.com/share* 라우트가 Worker에 걸려있는 상태에서
 *    Worker가 템플릿을 maroowell.com/share.html 로 fetch하면 재귀가 납니다.
 *  - 그래서 템플릿은 "www" 서브도메인(Worker 미적용)에서 가져오도록 구성합니다.
 *
 * ✅ 패치 (vendor_name 컬럼 제거 대응 + 색상/벤더/센터좌표 개선)
 *  - DB: subsubroutes.vendor_name 삭제 전제
 *  - subsubroutes.vendor_business_number_1w / _2w 에 business_number 저장
 *  - 응답에서 vendors.business_number 를 매핑해서 vendor_name_1w/2w(표시용)을 내려줌
 *  - color는 DB에 저장하지 않고, 응답 생성 시 안정적인 HSL 해시 컬러로 생성
 *  - /vendors?q= 부분검색 API 제공
 *  - ✅ center_wgs84 PATCH/응답 파싱 지원 (라벨/중심점 이동용)
 *  - ✅ wave 정규화: "주간=2W / 야간=1W" (DAY/NIGHT/주간/야간 입력도 지원)
 */

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS preflight
      if (request.method === "OPTIONS") {
        return cors(new Response("", { status: 204 }));
      }

      if (path === "/health") {
        return cors(json({ ok: true }));
      }

      if (path === "/route") {
        if (request.method === "GET") return cors(await handleRouteGet(url, env));
        if (request.method === "POST") return cors(await handleRoutePost(request, env));
        if (request.method === "DELETE") return cors(await handleRouteDelete(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }

      // ✅ 벤더 부분검색 + 신규 등록
      if (path === "/vendors") {
        if (request.method === "GET") return cors(await handleVendorsGet(url, env));
        if (request.method === "POST") return cors(await handleVendorCreate(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }

      if (path === "/osm" && request.method === "GET") {
        return cors(await handleOsmGet(url));
      }

      if (path === "/addresses" && request.method === "GET") {
        return cors(await handleAddressesGet(url, env));
      }

      // 공유 미리보기(OG/Twitter/파비콘 + v 자동)
      if ((path === "/share" || path === "/share.html") && request.method === "GET") {
        return await handleShareHtml(url, env);
      }

      // 우편번호 경계 API (루트 경로에서 zipcode 파라미터로 처리)
      if (path === "/" && request.method === "GET") {
        const zipcode = url.searchParams.get("zipcode");
        if (zipcode) {
          return cors(await handleZipGet(zipcode));
        }
      }

      return cors(json({ error: "Not Found" }, 404));
    } catch (e) {
      return cors(json({ error: e?.message || String(e) }, 500));
    }
  }
};

const ROUTE_TABLE = "subsubroutes";
const ADDRESS_TABLE = "addresses";
const VENDORS_TABLE = "vendors";

/**
 * ✅ 템플릿은 "www"에서 가져오기 (Worker 라우트 미적용이라 재귀 방지)
 * - www.maroowell.com/share.html 은 GitHub Pages 정적 파일이어야 합니다.
 */
const SHARE_TEMPLATE_URL = "https://www.maroowell.com/share.html";

/**
 * ✅ 브라우저 탭 파비콘 (HTML <link rel="icon">)
 */
const FAVICON_URL = "https://maroowell.com/favicon.ico?v=2";

/**
 * ✅ 카톡/메신저 미리보기 썸네일(og:image)
 */
const OG_IMAGE_BASE = "https://maroowell.com/assets/og/maroowell-1200x630.png"; // 없으면 업로드 필요

// ---------- helpers ----------
function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error("Invalid JSON body"); }
}

function mustEnv(env, k) {
  const v = env[k];
  if (!v) throw new Error(`Missing ENV: ${k}`);
  return v;
}

async function supabaseFetch(env, pathWithQuery, init = {}) {
  const base = mustEnv(env, "SUPABASE_URL");
  const key = mustEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  const url = `${base}${pathWithQuery}`;
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();

  if (!res.ok) {
    let msg = text || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j?.message || j?.error || msg;
    } catch {}
    throw new Error(msg);
  }

  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function upsertHeadTag(html, matchRegex, newTag) {
  if (matchRegex.test(html)) return html.replace(matchRegex, newTag);
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen) return html.replace(/<head[^>]*>/i, headOpen[0] + "\n  " + newTag);
  return newTag + "\n" + html;
}

function getKstYYYYMMDDHHMM() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  const yyyy = String(kst.getUTCFullYear());
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const HH = String(kst.getUTCHours()).padStart(2, "0");
  const MM = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${HH}${MM}`;
}

/**
 * ✅ wave 정규화
 * - 주간 = 2W
 * - 야간 = 1W
 *
 * 허용 입력:
 * - "1W" | "2W" | "1" | "2" | "W1" | "W2"
 * - "DAY" | "NIGHT"
 * - "주간" | "야간"
 */
function normalizeWave(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;

  // 직접 wave 지정은 그대로
  if (s === "1W" || s === "1" || s === "W1") return "1W";
  if (s === "2W" || s === "2" || s === "W2") return "2W";

  // ✅ 사용자 정의: 주간=2W / 야간=1W
  if (s === "DAY" || s === "주간".toUpperCase()) return "2W";
  if (s === "NIGHT" || s === "야간".toUpperCase()) return "1W";

  return null;
}

// ---------- ✅ color: 안정적인 HSL 해시 (저채도/중명도, DB 저장 X) ----------
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return [r, g, b];
}

function toHex2(n) {
  return n.toString(16).padStart(2, "0");
}

function rgbToHex(r, g, b) {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function generateColor(seed) {
  const str = String(seed ?? "");
  const h = fnv1a32(str);

  const hue = h % 360;
  // ✅ 너무 쨍하지 않게(채도↓), 너무 연하지 않게(명도 중간)
  const sat = 58 + ((h >>> 8) % 15);     // 58..72
  const light = 46 + ((h >>> 16) % 12);  // 46..57

  const [r, g, b] = hslToRgb(hue, sat, light);
  return rgbToHex(r, g, b);
}

// ---------- ✅ vendors name 매핑 (business_number -> name) ----------
function quoteInValue(v) {
  const s = String(v ?? "");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function fetchVendorNameMap(env, businessNumbers) {
  const bns = Array.from(new Set(businessNumbers))
    .map(v => String(v || "").trim())
    .filter(Boolean);

  if (bns.length === 0) return new Map();

  // URL 길이 방어
  const MAX = 200;
  const sliced = bns.slice(0, MAX);

  const params = new URLSearchParams();
  params.set("select", "business_number,name");
  params.set("business_number", `in.(${sliced.map(quoteInValue).join(",")})`);

  const rows = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${params.toString()}`, { method: "GET" });

  const map = new Map();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const bn = String(r?.business_number || "").trim();
      if (!bn) continue;
      map.set(bn, r?.name ?? null);
    }
  }
  return map;
}

async function enrichRoutes(rows, env) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  // business_number 수집 (1W/2W)
  const bns = [];
  for (const row of rows) {
    if (!row) continue;
    const bn1 = row.vendor_business_number_1w ?? row.vendor_business_number ?? null;
    const bn2 = row.vendor_business_number_2w ?? null;
    if (bn1) bns.push(bn1);
    if (bn2) bns.push(bn2);
  }

  const nameMap = await fetchVendorNameMap(env, bns);

  for (const row of rows) {
    if (!row) continue;

    const camp = String(row.camp ?? "").trim();
    const fullCode = String(row.full_code ?? row.code ?? "").trim();

    // ✅ color는 "항상" 계산해서 내려줌 (DB에 저장 안 하고, 기존/캐시 색상 무시)
    if (fullCode) row.color = generateColor(`${camp}|${fullCode}`);

    // polygon_wgs84 string -> json
    if (row.polygon_wgs84 && typeof row.polygon_wgs84 === "string") {
      try { row.polygon_wgs84 = JSON.parse(row.polygon_wgs84); } catch { row.polygon_wgs84 = null; }
    }

    // ✅ center_wgs84 string -> json (있으면)
    if (row.center_wgs84 && typeof row.center_wgs84 === "string") {
      try { row.center_wgs84 = JSON.parse(row.center_wgs84); } catch { /* keep */ }
    }

    // vendor 번호 정규화 (legacy column 대비)
    const bn1 = row.vendor_business_number_1w ?? row.vendor_business_number ?? null;
    const bn2 = row.vendor_business_number_2w ?? null;

    row.vendor_business_number_1w = bn1 ?? null;
    row.vendor_business_number_2w = bn2 ?? null;

    // legacy 호환
    row.vendor_business_number = bn1 ?? null;

    const name1 = bn1 ? (nameMap.get(String(bn1).trim()) ?? null) : null;
    const name2 = bn2 ? (nameMap.get(String(bn2).trim()) ?? null) : null;

    row.vendor_name_1w = name1;
    row.vendor_name_2w = name2;

    row.vendor_name = name1; // legacy 호환
  }

  return rows;
}

// ---------- /route GET ----------
async function handleRouteGet(url, env) {
  const camp = (url.searchParams.get("camp") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();
  const mode = (url.searchParams.get("mode") || "prefix").trim(); // prefix | exact

  if (!camp) return json({ error: "camp is required" }, 400);

  const params = new URLSearchParams();

  // ✅ 컬럼 변경으로 인한 오류 방지: select=*
  params.set("select", "*");
  params.set("camp", `eq.${camp}`);
  params.set("order", "full_code.asc");

  if (code) {
    if (mode === "exact") params.set("full_code", `eq.${code}`);
    else params.set("full_code", `like.${code}%`);
  }

  const rows = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, { method: "GET" });

  const enriched = await enrichRoutes(Array.isArray(rows) ? rows : [], env);

  return json({ rows: enriched || [] }, 200, { "Cache-Control": "no-store" });
}

// ---------- /route POST (upsert) ----------
async function handleRoutePost(request, env) {
  const body = await readJson(request);

  const camp = (body.camp || "").trim();
  const code = (body.code || "").trim();
  const id = body.id;

  if (!camp) return json({ error: "camp is required" }, 400);
  if (!code) return json({ error: "code is required" }, 400);

  const hasPoly = Object.prototype.hasOwnProperty.call(body, "polygon_wgs84");

  const patch = { camp, code, full_code: code };

  // ✅ vendor_name 컬럼은 제거되었으므로 더 이상 patch에 포함하지 않음
  // ✅ 1W/2W 저장 지원:
  //    - vendor_wave + vendor_business_number
  //    - vendor_business_number_1w / vendor_business_number_2w
  const wave = normalizeWave(body.vendor_wave);

  if (Object.prototype.hasOwnProperty.call(body, "vendor_business_number_1w")) {
    patch.vendor_business_number_1w = body.vendor_business_number_1w ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "vendor_business_number_2w")) {
    patch.vendor_business_number_2w = body.vendor_business_number_2w ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "vendor_business_number")) {
    const bn = body.vendor_business_number ?? null;
    if (wave === "2W") patch.vendor_business_number_2w = bn;
    else if (wave === "1W") patch.vendor_business_number_1w = bn;
    else patch.vendor_business_number_1w = bn; // default
  }

  // ✅ center_wgs84 저장 지원 (라벨/중심점 이동)
  if (Object.prototype.hasOwnProperty.call(body, "center_wgs84")) {
    patch.center_wgs84 = body.center_wgs84 ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_name")) patch.delivery_location_name = body.delivery_location_name ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_address")) patch.delivery_location_address = body.delivery_location_address ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lat")) patch.delivery_location_lat = body.delivery_location_lat ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lng")) patch.delivery_location_lng = body.delivery_location_lng ?? null;
  if (hasPoly) patch.polygon_wgs84 = body.polygon_wgs84 ?? null;

  let saved;

  // ID 기반 업데이트
  if (typeof id === "number") {
    const params = new URLSearchParams();
    params.set("id", `eq.${id}`);
    params.set("select", "*");

    saved = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
  } else {
    // (camp + full_code) upsert-like
    const queryParams = new URLSearchParams();
    queryParams.set("camp", `eq.${camp}`);
    queryParams.set("full_code", `eq.${code}`);
    queryParams.set("select", "id");

    const existing = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${queryParams.toString()}`, { method: "GET" });

    if (Array.isArray(existing) && existing.length > 0) {
      const existingId = existing[0].id;

      const patchParams = new URLSearchParams();
      patchParams.set("id", `eq.${existingId}`);
      patchParams.set("select", "*");

      saved = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${patchParams.toString()}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      });
    } else {
      const insertParams = new URLSearchParams();
      insertParams.set("select", "*");

      saved = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${insertParams.toString()}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      });
    }
  }

  const row = Array.isArray(saved) ? saved[0] : saved;

  const enrichedArr = await enrichRoutes(row ? [row] : [], env);
  const enriched = enrichedArr && enrichedArr[0] ? enrichedArr[0] : row;

  return json({ row: enriched }, 200, { "Cache-Control": "no-store" });
}

// ---------- /route DELETE ----------
// 실제 삭제가 아니라 polygon_wgs84=null 로 "폴리곤만 제거"
async function handleRouteDelete(request, env) {
  const body = await readJson(request);
  const id = body.id;
  const camp = (body.camp || "").trim();
  const code = (body.code || "").trim();

  if (typeof id !== "number" && (!camp || !code)) {
    return json({ error: "id OR (camp + code) is required" }, 400);
  }

  const params = new URLSearchParams();
  params.set("select", "*");

  if (typeof id === "number") {
    params.set("id", `eq.${id}`);
  } else {
    params.set("camp", `eq.${camp}`);
    params.set("full_code", `eq.${code}`);
  }

  const updated = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ polygon_wgs84: null })
  });

  const row = Array.isArray(updated) ? updated[0] : updated;

  const enrichedArr = await enrichRoutes(row ? [row] : [], env);
  const enriched = enrichedArr && enrichedArr[0] ? enrichedArr[0] : row;

  return json({ row: enriched }, 200, { "Cache-Control": "no-store" });
}

// ---------- /vendors POST (신규 등록) ----------
// body: { name, business_number }
// - business_number는 하이픈 포함 그대로 저장
// - business_number가 이미 있으면 기존 row 반환
// - vendor_code는 "bn_숫자" 기본, 충돌 시 suffix 추가
async function handleVendorCreate(request, env) {
  const body = await readJson(request);

  const name = String(body?.name || "").trim();
  const business_number = String(body?.business_number || "").trim();

  if (!name) return json({ error: "name is required" }, 400);
  if (!business_number) return json({ error: "business_number is required" }, 400);

  // 1) business_number 중복이면 그대로 반환
  try {
    const p0 = new URLSearchParams();
    p0.set("select", "id,vendor_code,name,business_number,created_at");
    p0.set("business_number", `eq.${business_number}`);
    p0.set("limit", "1");

    const existed = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${p0.toString()}`, { method: "GET" });
    if (Array.isArray(existed) && existed.length > 0) {
      return json({ row: existed[0], existed: true }, 200, { "Cache-Control": "no-store" });
    }
  } catch (e) {
    // 조회 실패는 무시하고 생성 로직 진행 (단, insert 실패 시 다시 표면화)
  }

  // 2) vendor_code 생성 (bn_숫자)
  const digits = business_number.replace(/\D/g, "");
  const base = digits ? `bn_${digits}` : `bn_${Date.now()}`;

  let vendor_code = base;

  // vendor_code 충돌 시 suffix 부여
  for (let i = 0; i < 60; i++) {
    const p1 = new URLSearchParams();
    p1.set("select", "id");
    p1.set("vendor_code", `eq.${vendor_code}`);
    p1.set("limit", "1");

    const hit = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${p1.toString()}`, { method: "GET" });
    if (!Array.isArray(hit) || hit.length === 0) break;

    vendor_code = `${base}_${i + 2}`;
  }

  // 3) insert
  try {
    const p2 = new URLSearchParams();
    p2.set("select", "id,vendor_code,name,business_number,created_at");

    const inserted = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${p2.toString()}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ vendor_code, name, business_number })
    });

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return json({ row, existed: false }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    // 동시성/유니크 충돌 등으로 insert 실패 시 business_number로 재조회 후 반환
    try {
      const p3 = new URLSearchParams();
      p3.set("select", "id,vendor_code,name,business_number,created_at");
      p3.set("business_number", `eq.${business_number}`);
      p3.set("limit", "1");

      const existed2 = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${p3.toString()}`, { method: "GET" });
      if (Array.isArray(existed2) && existed2.length > 0) {
        return json({ row: existed2[0], existed: true }, 200, { "Cache-Control": "no-store" });
      }
    } catch {}
    return json({ error: e?.message || String(e) }, 500);
  }
}

// ---------- /vendors GET (부분검색) ----------
async function handleVendorsGet(url, env) {
  const qRaw = (url.searchParams.get("q") || "").trim();
  if (!qRaw) return json({ error: "q is required" }, 400);

  // PostgREST OR 필터에서 괄호/콤마는 구문을 깨기 쉬워서 제거
  const q = qRaw.replace(/[(),]/g, " ").trim();
  const pattern = `*${q}*`;

  const params = new URLSearchParams();
  params.set("select", "id,vendor_code,name,business_number,created_at");
  params.set("order", "name.asc");
  params.set("limit", "30");

  // name, vendor_code, business_number 중 하나라도 매칭
  params.set("or", `(name.ilike.${pattern},vendor_code.ilike.${pattern},business_number.ilike.${pattern})`);

  const rows = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${params.toString()}`, { method: "GET" });

  return json({ rows: Array.isArray(rows) ? rows : [] }, 200, { "Cache-Control": "no-store" });
}

// ---------- /addresses GET ----------
async function handleAddressesGet(url, env) {
  const camp = (url.searchParams.get("camp") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();

  if (!camp) return json({ error: "camp is required" }, 400);

  const select = [
    "id",
    "camp",
    "full_code",
    "address",
    "center_wgs84",
    "zipcode",
    "detail",
    "dong",
    "created_at"
  ].join(",");

  const params = new URLSearchParams();
  params.set("select", select);
  params.set("camp", `eq.${camp}`);
  params.set("order", "full_code.asc,address.asc");

  if (code) params.set("full_code", `like.${code}%`);

  try {
    const rows = await supabaseFetch(env, `/rest/v1/${ADDRESS_TABLE}?${params.toString()}`, { method: "GET" });

    if (Array.isArray(rows)) {
      rows.forEach(row => {
        if (row && row.center_wgs84 && typeof row.center_wgs84 === "string") {
          try { row.center_wgs84 = JSON.parse(row.center_wgs84); } catch { row.center_wgs84 = null; }
        }
      });
    }

    return json({ rows: rows || [] }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("addresses 조회 실패:", e);
    return json({ error: e.message, rows: [] }, 200);
  }
}

// ---------- /zip GET ----------
async function handleZipGet(zipcode) {
  try {
    if (!zipcode) return json({ error: "zipcode 쿼리 파라미터가 필요함" }, 400);

    const ts = Date.now();
    const wfsUrl =
      `https://www.juso.go.kr/wfs.do` +
      `?callback=callback` +
      `&svcType=WFS` +
      `&typeName=BAS` +
      `&basId=${encodeURIComponent(zipcode)}` +
      `&maxFeatures=1` +
      `&_=${ts}`;

    const wfsRes = await fetch(wfsUrl, {
      headers: { Referer: "https://maroowell.com/", Origin: "https://maroowell.com" }
    });

    if (!wfsRes.ok) return json({ error: "WFS 호출 실패", status: wfsRes.status }, 502);

    const text = await wfsRes.text();
    const xmlMatch = text.match(/xmlStr'\s*:\s*'([\s\S]*?)'\s*}\s*\)\s*;?\s*$/);
    if (!xmlMatch) return json({ error: "WFS 응답에서 xmlStr를 찾지 못함", rawSample: text.slice(0, 200) }, 500);

    let xml = xmlMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");

    const coordsMatch = xml.match(/<gml:coordinates[^>]*>([^<]+)<\/gml:coordinates>/);
    if (!coordsMatch) return json({ error: "gml:coordinates 태그를 찾지 못함", xmlSample: xml.slice(0, 300) }, 500);

    const coordText = coordsMatch[1].trim();
    const polygon5179 = coordText
      .split(/\s+/)
      .map(pair => pair.split(",").map(Number))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

    if (polygon5179.length === 0) return json({ error: "좌표 파싱 결과가 비어 있음", coordSample: coordText.slice(0, 200) }, 500);

    const xMatch = xml.match(/<kais_tmp:x_code>([^<]+)<\/kais_tmp:x_code>/);
    const yMatch = xml.match(/<kais_tmp:y_code>([^<]+)<\/kais_tmp:y_code>/);
    const center5179 = xMatch && yMatch ? [Number(xMatch[1]), Number(yMatch[1])] : null;

    return json({ zipcode, srid: 5179, center5179, polygon5179 });
  } catch (err) {
    return json({ error: "Worker 내부 예외 발생", detail: String(err) }, 500);
  }
}

// ---------- /share 동적 메타 태그 처리 (+ v 자동 부여) ----------
async function handleShareHtml(url, env) {
  const v = (url.searchParams.get("v") || "").trim();
  const isValidV = /^\d{12}$/.test(v);
  if (!isValidV) {
    const v2 = getKstYYYYMMDDHHMM();
    const newUrl = new URL(url.toString());
    newUrl.searchParams.set("v", v2);

    return new Response(null, {
      status: 302,
      headers: {
        Location: newUrl.toString(),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const camp = (url.searchParams.get("camp") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();

  let ogTitle = "배송 지도 공유";
  let ogDescription = "배송 구역 및 경로를 확인하세요";

  if (camp) {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("select", "delivery_location_name,delivery_location_address,full_code");
      queryParams.set("camp", `eq.${camp}`);
      if (code) queryParams.set("full_code", `like.${code}%`);
      queryParams.set("limit", "1");
      queryParams.set("order", "full_code.asc");

      const rows = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${queryParams.toString()}`, { method: "GET" });

      if (Array.isArray(rows) && rows.length > 0) {
        const locationName = (rows[0].delivery_location_name || "").trim();
        const locationAddr = (rows[0].delivery_location_address || "").trim();
        const fullCode = (rows[0].full_code || code || "").trim();

        ogTitle = `${camp}${locationName ? " " + locationName : ""}${fullCode ? " " + fullCode : ""}`.trim();
        ogDescription = `${camp}${locationName ? " " + locationName : ""}${fullCode ? " " + fullCode : ""} 배송 구역을 확인하세요`.trim();
        if (locationAddr) ogDescription = `${locationAddr} · ${ogDescription}`;
      } else if (code) {
        ogTitle = `${camp} ${code}`.trim();
        ogDescription = `${camp} ${code} 배송 구역을 확인하세요`.trim();
      } else {
        ogTitle = `${camp} 배송지도`.trim();
        ogDescription = `${camp} 배송 구역을 확인하세요`.trim();
      }
    } catch (e) {
      ogTitle = code ? `${camp} ${code}`.trim() : `${camp} 배송지도`.trim();
      ogDescription = code
        ? `${camp} ${code} 배송 구역을 확인하세요`.trim()
        : `${camp} 배송 구역을 확인하세요`.trim();
    }
  }

  const htmlRes = await fetch(SHARE_TEMPLATE_URL, {
    headers: { "User-Agent": "maroowell-route-worker/1.0" }
  });

  if (!htmlRes.ok) {
    return json(
      { error: "Failed to fetch share template", template: SHARE_TEMPLATE_URL, status: htmlRes.status },
      502
    );
  }

  let html = await htmlRes.text();

  const safeTitle = escapeHtmlAttr(ogTitle);
  const safeDesc = escapeHtmlAttr(ogDescription);
  const safeUrl = escapeHtmlAttr(url.toString());
  const imgUrl = `${OG_IMAGE_BASE}?v=${v}`;
  const safeImg = escapeHtmlAttr(imgUrl);
  const safeFav = escapeHtmlAttr(FAVICON_URL);

  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  } else {
    html = upsertHeadTag(html, /$^/i, `<title>${safeTitle}</title>`);
  }

  html = upsertHeadTag(html, /<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="website" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${safeTitle}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${safeDesc}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:site_name["'][^>]*>/i, `<meta property="og:site_name" content="Maroowell" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${safeUrl}" />`);

  html = upsertHeadTag(html, /<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${safeImg}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:image:secure_url["'][^>]*>/i, `<meta property="og:image:secure_url" content="${safeImg}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:image:alt["'][^>]*>/i, `<meta property="og:image:alt" content="Maroowell" />`);

  html = html.replace(/<link\s+rel=["']icon["'][^>]*>/gi, `<link rel="icon" type="image/x-icon" href="${safeFav}" />`);
  html = upsertHeadTag(html, /<link\s+rel=["']icon["'][^>]*>/i, `<link rel="icon" type="image/x-icon" href="${safeFav}" />`);
  html = upsertHeadTag(html, /<link\s+rel=["']shortcut icon["'][^>]*>/i, `<link rel="shortcut icon" href="${safeFav}" />`);
  html = upsertHeadTag(html, /<link\s+rel=["']apple-touch-icon["'][^>]*>/i, `<link rel="apple-touch-icon" href="${safeFav}" />`);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

// ---------- /osm GET (Overpass) ----------
async function handleOsmGet(url) {
  const bboxStr = (url.searchParams.get("bbox") || "").trim();
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
    return json({ error: "bbox is required: minLng,minLat,maxLng,maxLat" }, 400);
  }

  const [minLng, minLat, maxLng, maxLat] = parts;
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

  const query = `
[out:json][timeout:25];
(
  way["highway"](${bbox});
);
out geom;
(
  way["building"](${bbox});
);
out geom;
`;

  const overpassUrl = "https://overpass-api.de/api/interpreter";
  const res = await fetch(overpassUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": "maroowell-route-worker/1.0"
    },
    body: `data=${encodeURIComponent(query)}`
  });

  const text = await res.text();
  if (!res.ok) return json({ error: `Overpass error: ${text || res.status}` }, 502);

  let data;
  try { data = JSON.parse(text); } catch {
    return json({ error: "Overpass returned invalid JSON" }, 502);
  }

  const elements = data?.elements || [];
  const roads = [];
  const buildings = [];

  for (const el of elements) {
    if (!el || !el.type || !Array.isArray(el.geometry)) continue;
    const coords = el.geometry
      .filter(g => typeof g?.lat === "number" && typeof g?.lon === "number")
      .map(g => [g.lon, g.lat]);

    if (coords.length < 2) continue;

    const isHighway = el.tags && el.tags.highway;
    const isBuilding = el.tags && el.tags.building;

    if (isHighway) roads.push({ id: el.id, coords });
    else if (isBuilding && coords.length >= 3) buildings.push({ id: el.id, coords });
  }

  return json({ roads, buildings }, 200, { "Cache-Control": "public, max-age=60" });
}
