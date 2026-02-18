/**
 * Cloudflare Worker - route API (+ camps 기반 입차지 매핑, zipcode API)
 *
 * ENV:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

const ROUTE_TABLE = "subsubroutes";
const ADDRESS_TABLE = "addresses";
const CAMPS_TABLE = "camps";

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return cors(new Response("", { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/health") {
        return cors(json({ ok: true }));
      }

      if (path === "/route") {
        if (request.method === "GET") return cors(await handleRouteGet(url, env));
        if (request.method === "POST") return cors(await handleRoutePost(request, env));
        if (request.method === "DELETE") return cors(await handleRouteDelete(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }

      if (path === "/addresses" && request.method === "GET") {
        return cors(await handleAddressesGet(url, env));
      }

      if (path === "/camps") {
        if (request.method === "GET") return cors(await handleCampsGet(url, env));
        if (request.method === "POST") return cors(await handleCampsPost(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }

      if (path === "/osm" && request.method === "GET") {
        return cors(await handleOsmGet(url));
      }

      // zipcode API: /?zipcode=07420 또는 /zip?zipcode=07420
      if ((path === "/" || path === "/zip") && request.method === "GET") {
        const zipcode = (url.searchParams.get("zipcode") || "").trim();
        if (!zipcode) return cors(json({ error: "zipcode 쿼리 파라미터가 필요함" }, 400));
        return cors(await handleZipGet(zipcode));
      }

      return cors(json({ error: "Not Found" }, 404));
    } catch (e) {
      return cors(json({ error: e?.message || String(e) }, 500));
    }
  },
};

// ---------- 공통 helpers ----------
function cors(res) {
  const h = new Headers(res.headers || {});
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function mustEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Missing ENV: ${key}`);
  return value;
}

async function supabaseFetch(env, pathWithQuery, init = {}) {
  const base = mustEnv(env, "SUPABASE_URL");
  const key = mustEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  const url = `${base}${pathWithQuery}`;
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (!headers.has("Content-Type") && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("Content-Type", "application/json");
  }

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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function safeTrim(v) {
  return String(v ?? "").trim();
}

function parseMaybeJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function parseMaybeNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeCampKey(v) {
  return safeTrim(v).toLowerCase();
}

function applyRouteDerivedFields(row) {
  if (!row || typeof row !== "object") return;
  const fullCode = safeTrim(row.full_code || row.code);
  if (fullCode && !row.color) row.color = generateColor(fullCode);

  if (typeof row.polygon_wgs84 === "string") {
    row.polygon_wgs84 = parseMaybeJson(row.polygon_wgs84, null);
  }

  // 프론트 편의: camp_name/route_code도 함께 내려줌
  if (!row.camp_name && row.camp) row.camp_name = row.camp;
  if (!row.route_code && row.full_code) row.route_code = row.full_code;
}

function generateColor(code) {
  const COLOR_PALETTE = [
    "#00C2FF", "#FF4D6D", "#FFD166", "#06D6A0", "#A78BFA",
    "#F97316", "#22C55E", "#E11D48", "#3B82F6", "#F59E0B",
    "#14B8A6", "#8B5CF6", "#84CC16", "#EC4899", "#0EA5E9",
    "#EF4444", "#10B981", "#FBBF24", "#6366F1", "#FB7185",
  ];

  const s = String(code || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

// ---------- camps 매핑 ----------
async function loadCampIndex(env, campName = "") {
  const params = new URLSearchParams();
  params.set("select", "id,camp,code,address,latitude,longitude,mb_camp,created_at,updated_at");
  if (campName) params.set("camp", `eq.${campName}`);
  params.set("order", "updated_at.desc,created_at.desc,id.desc");

  let rows = [];
  try {
    const data = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${params.toString()}`, { method: "GET" });
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("camps 조회 실패:", e?.message || String(e));
    rows = [];
  }

  const byMbCamp = new Map();
  for (const row of rows) {
    const key = normalizeCampKey(row?.mb_camp);
    if (!key || byMbCamp.has(key)) continue;
    byMbCamp.set(key, row);
  }
  return byMbCamp;
}

async function hydrateRouteRowsWithCamps(rows, env) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const byCamp = new Map(); // camp -> Map(mb_camp -> campRow)

  for (const row of rows) {
    const deliveryName = safeTrim(row?.delivery_location_name);
    // subsubroutes의 기존 주소값이 남아 있어도 camps 기준으로 덮어쓰기 위해 초기화
    if (deliveryName) row.delivery_location_address = null;
    if (!deliveryName) continue;

    const routeCamp = safeTrim(row?.camp);
    const key = normalizeCampKey(deliveryName);
    if (!key) continue;

    if (!byCamp.has(routeCamp)) {
      byCamp.set(routeCamp, await loadCampIndex(env, routeCamp));
    }
    const matched = byCamp.get(routeCamp).get(key);

    if (!matched) continue;

    const addr = safeTrim(matched.address);
    if (addr) row.delivery_location_address = addr;

    const lat = parseMaybeNumber(matched.latitude);
    const lng = parseMaybeNumber(matched.longitude);
    if ((row.delivery_location_lat == null || row.delivery_location_lat === "") && lat != null) {
      row.delivery_location_lat = lat;
    }
    if ((row.delivery_location_lng == null || row.delivery_location_lng === "") && lng != null) {
      row.delivery_location_lng = lng;
    }
  }

  return rows;
}

// ---------- /route ----------
async function handleRouteGet(url, env) {
  const camp = safeTrim(url.searchParams.get("camp"));
  const code = safeTrim(url.searchParams.get("code"));
  const mode = safeTrim(url.searchParams.get("mode") || "prefix");

  if (!camp) return json({ error: "camp is required" }, 400);

  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("camp", `eq.${camp}`);
  params.set("order", "full_code.asc");

  if (code) {
    if (mode === "exact") params.set("full_code", `eq.${code}`);
    else params.set("full_code", `like.${code}%`);
  }

  const rows = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, { method: "GET" });
  const out = Array.isArray(rows) ? rows : [];

  out.forEach(applyRouteDerivedFields);
  await hydrateRouteRowsWithCamps(out, env);

  return json({ rows: out }, 200, { "Cache-Control": "no-store" });
}

function buildRoutePatch(body) {
  const camp = safeTrim(body.camp);
  const code = safeTrim(body.code);
  const patch = { camp, code, full_code: code };

  // 벤더 계열 (구/신 컬럼 모두 허용)
  const vendorKeys = [
    "vendor_name",
    "vendor_business_number",
    "vendor_name_1w",
    "vendor_name_2w",
    "vendor_business_number_1w",
    "vendor_business_number_2w",
    "vendor_1w_name",
    "vendor_2w_name",
  ];
  for (const k of vendorKeys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k] ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_name")) {
    patch.delivery_location_name = body.delivery_location_name ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lat")) {
    patch.delivery_location_lat = parseMaybeNumber(body.delivery_location_lat);
  }
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lng")) {
    patch.delivery_location_lng = parseMaybeNumber(body.delivery_location_lng);
  }

  // 중요: delivery_location_address는 camps 테이블에서 계산해서 내려주므로 저장 대상에서 제외
  if (Object.prototype.hasOwnProperty.call(body, "polygon_wgs84")) {
    patch.polygon_wgs84 = body.polygon_wgs84 ?? null;
  }

  return patch;
}

async function handleRoutePost(request, env) {
  const body = await readJson(request);
  const camp = safeTrim(body.camp);
  const code = safeTrim(body.code);
  const id = body.id;

  if (!camp) return json({ error: "camp is required" }, 400);
  if (!code) return json({ error: "code is required" }, 400);

  const patch = buildRoutePatch(body);
  let row = null;

  if (typeof id === "number") {
    const params = new URLSearchParams();
    params.set("id", `eq.${id}`);
    params.set("select", "*");

    const updated = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    row = Array.isArray(updated) ? updated[0] : updated;
  } else {
    // camp + code(full_code) 기준으로 존재하면 PATCH, 없으면 POST
    const q = new URLSearchParams();
    q.set("camp", `eq.${camp}`);
    q.set("full_code", `eq.${code}`);
    q.set("select", "id");
    q.set("limit", "1");

    const existing = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${q.toString()}`, { method: "GET" });

    if (Array.isArray(existing) && existing.length > 0 && typeof existing[0]?.id === "number") {
      const params = new URLSearchParams();
      params.set("id", `eq.${existing[0].id}`);
      params.set("select", "*");

      const updated = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      row = Array.isArray(updated) ? updated[0] : updated;
    } else {
      const params = new URLSearchParams();
      params.set("select", "*");

      const inserted = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      row = Array.isArray(inserted) ? inserted[0] : inserted;
    }
  }

  applyRouteDerivedFields(row);
  await hydrateRouteRowsWithCamps([row], env);

  return json({ row }, 200, { "Cache-Control": "no-store" });
}

async function handleRouteDelete(request, env) {
  const body = await readJson(request);
  const id = body.id;
  const camp = safeTrim(body.camp);
  const code = safeTrim(body.code);

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
    body: JSON.stringify({ polygon_wgs84: null }),
  });

  const row = Array.isArray(updated) ? updated[0] : updated;
  applyRouteDerivedFields(row);
  await hydrateRouteRowsWithCamps([row], env);

  return json({ row }, 200, { "Cache-Control": "no-store" });
}

// ---------- /addresses ----------
async function handleAddressesGet(url, env) {
  const camp = safeTrim(url.searchParams.get("camp"));
  const code = safeTrim(url.searchParams.get("code"));

  if (!camp) return json({ error: "camp is required" }, 400);

  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("camp", `eq.${camp}`);
  params.set("order", "full_code.asc,address.asc");
  if (code) params.set("full_code", `like.${code}%`);

  try {
    const rows = await supabaseFetch(env, `/rest/v1/${ADDRESS_TABLE}?${params.toString()}`, { method: "GET" });
    const out = Array.isArray(rows) ? rows : [];

    out.forEach((row) => {
      if (row && typeof row.center_wgs84 === "string") {
        row.center_wgs84 = parseMaybeJson(row.center_wgs84, null);
      }
    });

    return json({ rows: out }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.warn("addresses 조회 실패:", e?.message || String(e));
    return json({ rows: [], error: e?.message || String(e) }, 200, { "Cache-Control": "no-store" });
  }
}

// ---------- /camps ----------
function normalizeCampRow(row) {
  if (!row || typeof row !== "object") return null;
  const out = { ...row };
  out.camp = safeTrim(out.camp);
  out.code = safeTrim(out.code);
  out.mb_camp = safeTrim(out.mb_camp);
  out.address = safeTrim(out.address);
  out.latitude = parseMaybeNumber(out.latitude);
  out.longitude = parseMaybeNumber(out.longitude);
  return out;
}

function scoreCampSearchMatch(row, qLower) {
  const mb = safeTrim(row?.mb_camp).toLowerCase();
  const camp = safeTrim(row?.camp).toLowerCase();
  const code = safeTrim(row?.code).toLowerCase();
  const addr = safeTrim(row?.address).toLowerCase();

  if (!qLower) return 0;
  if (mb === qLower) return 120;
  if (camp === qLower) return 115;
  if (code === qLower) return 110;
  if (mb.startsWith(qLower)) return 100;
  if (camp.startsWith(qLower)) return 95;
  if (code.startsWith(qLower)) return 90;
  if (mb.includes(qLower)) return 80;
  if (camp.includes(qLower)) return 75;
  if (code.includes(qLower)) return 70;
  if (addr.includes(qLower)) return 60;
  return 0;
}

function campRowDedupeKey(row) {
  if (row?.id != null) return `id:${row.id}`;
  return `key:${safeTrim(row?.camp)}|${safeTrim(row?.mb_camp)}|${safeTrim(row?.code)}`;
}

async function handleCampsGet(url, env) {
  const q = safeTrim(url.searchParams.get("q"));
  const camp = safeTrim(url.searchParams.get("camp"));
  // 레거시/오타 파라미터(orbm_camp, ormb_camp)도 mb_camp로 흡수
  const mbCamp = safeTrim(
    url.searchParams.get("mb_camp") ||
      url.searchParams.get("orbm_camp") ||
      url.searchParams.get("ormb_camp")
  );
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

  // q가 없으면 단순 조회
  if (!q) {
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("order", "updated_at.desc,created_at.desc,id.desc");
    params.set("limit", String(limit));
    if (camp) params.set("camp", `eq.${camp}`);
    if (mbCamp) params.set("mb_camp", `eq.${mbCamp}`);

    const rows = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${params.toString()}`, { method: "GET" });
    const out = (Array.isArray(rows) ? rows : []).map(normalizeCampRow).filter(Boolean);
    return json({ rows: out }, 200, { "Cache-Control": "no-store" });
  }

  // q가 있으면 camp/mb_camp/address/code 각각 검색 후 병합
  const qLower = q.toLowerCase();
  const base = new URLSearchParams();
  base.set("select", "*");
  base.set("order", "updated_at.desc,created_at.desc,id.desc");
  base.set("limit", String(Math.min(limit * 2, 200)));
  if (camp) base.set("camp", `eq.${camp}`);
  if (mbCamp) base.set("mb_camp", `eq.${mbCamp}`);

  const wildcard = `*${q}*`;
  const likeFields = ["mb_camp", "camp", "address", "code"];
  const eqFields = ["mb_camp", "camp", "code"];

  const queries = [
    ...eqFields.map((field) => {
      const p = new URLSearchParams(base.toString());
      p.set(field, `eq.${q}`);
      return p;
    }),
    ...likeFields.map((field) => {
      const p = new URLSearchParams(base.toString());
      p.set(field, `ilike.${wildcard}`);
      return p;
    }),
  ];

  const results = [];
  for (const p of queries) {
    try {
      const rows = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${p.toString()}`, { method: "GET" });
      results.push(Array.isArray(rows) ? rows : []);
    } catch (e) {
      // 일부 쿼리 실패해도 다른 쿼리 결과로 계속 진행
      console.warn("camps 검색 쿼리 실패:", e?.message || String(e));
    }
  }

  const mergedMap = new Map();
  for (const arr of results) {
    for (const row of arr) {
      const normalized = normalizeCampRow(row);
      if (!normalized) continue;
      const key = campRowDedupeKey(normalized);
      if (!mergedMap.has(key)) mergedMap.set(key, normalized);
    }
  }

  let out = Array.from(mergedMap.values());

  // PostgREST ilike 누락/인코딩 이슈 대비: 결과가 없으면 넓게 가져와 JS 필터링 fallback
  if (out.length === 0) {
    try {
      const p = new URLSearchParams();
      p.set("select", "*");
      p.set("order", "updated_at.desc,created_at.desc,id.desc");
      p.set("limit", String(Math.min(Math.max(limit * 8, 200), 1000)));
      if (camp) p.set("camp", `eq.${camp}`);
      if (mbCamp) p.set("mb_camp", `eq.${mbCamp}`);

      const broad = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${p.toString()}`, { method: "GET" });
      out = (Array.isArray(broad) ? broad : [])
        .map(normalizeCampRow)
        .filter(Boolean)
        .filter((row) => {
          const hay = `${safeTrim(row.mb_camp)}\n${safeTrim(row.camp)}\n${safeTrim(row.code)}\n${safeTrim(row.address)}`.toLowerCase();
          return hay.includes(qLower);
        });
    } catch (e) {
      console.warn("camps fallback 검색 실패:", e?.message || String(e));
    }
  }

  out = out
    .sort((a, b) => scoreCampSearchMatch(b, qLower) - scoreCampSearchMatch(a, qLower))
    .slice(0, limit);

  return json({ rows: out }, 200, { "Cache-Control": "no-store" });
}

async function handleCampsPost(request, env) {
  const body = await readJson(request);

  const camp = safeTrim(body.camp);
  const mbCamp = safeTrim(body.mb_camp ?? body.delivery_location_name ?? body.name);
  const address = safeTrim(body.address);
  const code = safeTrim(body.code);
  const latitude = parseMaybeNumber(body.latitude);
  const longitude = parseMaybeNumber(body.longitude);

  if (!camp) return json({ error: "camp is required" }, 400);
  if (!mbCamp) return json({ error: "mb_camp is required" }, 400);
  if (!address) return json({ error: "address is required" }, 400);

  const patch = {
    camp,
    mb_camp: mbCamp,
    address,
  };
  if (code || Object.prototype.hasOwnProperty.call(body, "code")) {
    patch.code = code || null;
  }
  if (latitude != null || Object.prototype.hasOwnProperty.call(body, "latitude")) {
    patch.latitude = latitude;
  }
  if (longitude != null || Object.prototype.hasOwnProperty.call(body, "longitude")) {
    patch.longitude = longitude;
  }

  // camp + mb_camp 존재 시 업데이트, 없으면 신규 생성
  const q = new URLSearchParams();
  q.set("select", "id");
  q.set("camp", `eq.${camp}`);
  q.set("mb_camp", `eq.${mbCamp}`);
  q.set("limit", "1");
  const existing = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${q.toString()}`, { method: "GET" });

  let row = null;
  if (Array.isArray(existing) && existing.length > 0 && typeof existing[0]?.id === "number") {
    const params = new URLSearchParams();
    params.set("id", `eq.${existing[0].id}`);
    params.set("select", "*");

    const updated = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${params.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    row = Array.isArray(updated) ? updated[0] : updated;
  } else {
    const params = new URLSearchParams();
    params.set("select", "*");

    const inserted = await supabaseFetch(env, `/rest/v1/${CAMPS_TABLE}?${params.toString()}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    row = Array.isArray(inserted) ? inserted[0] : inserted;
  }

  return json({ row: normalizeCampRow(row) }, 200, { "Cache-Control": "no-store" });
}

// ---------- /osm ----------
async function handleOsmGet(url) {
  const bboxStr = safeTrim(url.searchParams.get("bbox"));
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return json({ error: "bbox is required: minLng,minLat,maxLng,maxLat" }, 400);
  }

  const [minLng, minLat, maxLng, maxLat] = parts;
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`; // south,west,north,east

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
      "User-Agent": "maroowell-route-worker/1.0",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  const text = await res.text();
  if (!res.ok) return json({ error: `Overpass error: ${text || res.status}` }, 502);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: "Overpass returned invalid JSON" }, 502);
  }

  const elements = data?.elements || [];
  const roads = [];
  const buildings = [];

  for (const el of elements) {
    if (!el || !el.type || !Array.isArray(el.geometry)) continue;
    const coords = el.geometry
      .filter((g) => typeof g?.lat === "number" && typeof g?.lon === "number")
      .map((g) => [g.lon, g.lat]);

    if (coords.length < 2) continue;

    const isHighway = el.tags && el.tags.highway;
    const isBuilding = el.tags && el.tags.building;

    if (isHighway) roads.push({ id: el.id, coords });
    else if (isBuilding && coords.length >= 3) buildings.push({ id: el.id, coords });
  }

  return json({ roads, buildings }, 200, { "Cache-Control": "public, max-age=60" });
}

// ---------- zipcode boundary API ----------
async function handleZipGet(zipcode) {
  const apiUrl = "https://www.juso.go.kr/api/totalMap/selectKarbSbdList";

  const payload = {
    params_sido_val: null,
    params_sido_data: [],
    params_sgg_val: null,
    params_sgg_data: [],
    search_result: [],
    result_count: 0,
    result_offset: 0,
    ctpvCd: "",
    lgvReplcCd: "",
    districtNo: zipcode,
    pageable: {
      first: 0,
      totalRecords: 0,
      currentRecords: 0,
      totalPages: 0,
      page: 0,
      size: 10,
      linkSize: 5,
      orders: [{ property: "", direction: "" }],
    },
  };

  const apiRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.juso.go.kr",
      Referer: "https://www.juso.go.kr/map/totalMapView",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
    },
    body: JSON.stringify(payload),
  });

  if (!apiRes.ok) {
    return json({ error: "주소정보 API 호출 실패", status: apiRes.status }, 502);
  }

  const data = await apiRes.json();
  if (!data?.results?.content || !Array.isArray(data.results.content)) {
    return json({ error: "응답 데이터 형식 오류", response: data }, 500);
  }
  if (data.results.content.length === 0) {
    return json({ error: "해당 우편번호의 경계 데이터가 없음", zipcode }, 404);
  }

  const item = data.results.content[0];
  const metadata = {
    ctpvNm: item.ctpvNm,
    sigNm: item.sigNm,
    sbdno: item.sbdno,
    lgvReplcCd: item.lgvReplcCd,
  };

  if (!item.geom) {
    return json({ error: "geom 필드가 없음", item }, 500);
  }

  let geojson;
  try {
    geojson = typeof item.geom === "string" ? JSON.parse(item.geom) : item.geom;
  } catch (e) {
    return json({ error: "GeoJSON 파싱 실패", detail: String(e), geom: item.geom }, 500);
  }

  if (geojson.type !== "MultiPolygon" || !Array.isArray(geojson.coordinates)) {
    return json({ error: "예상치 못한 geometry 타입", type: geojson.type }, 500);
  }

  const polygon5179 = geojson.coordinates;
  let center5179 = null;
  if (polygon5179.length > 0 && polygon5179[0].length > 0 && polygon5179[0][0].length > 0) {
    const firstRing = polygon5179[0][0];
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const [x, y] of firstRing) {
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
    if (count > 0) center5179 = [sumX / count, sumY / count];
  }

  return json({ zipcode, srid: 5179, center5179, polygon5179, metadata });
}
