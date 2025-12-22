/**
 * Cloudflare Worker - route API
 *
 * ENV:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *
 * DB (예: subsubroutes):
 *  - id (bigint)
 *  - camp (text)
 *  - full_code (text)
 *  - polygon_wgs84 (jsonb / text)  <-- JSON 저장 권장
 *  - color (text) [OPTIONAL]
 *  - vendor_name (text)            <-- 추가 권장
 *  - vendor_business_number (text) <-- 추가 권장
 *  - created_at / updated_at ...
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

      if (path === "/osm" && request.method === "GET") {
        return cors(await handleOsmGet(url));
      }

      if (path === "/addresses" && request.method === "GET") {
        return cors(await handleAddressesGet(url, env));
      }

      return cors(json({ error: "Not Found" }, 404));
    } catch (e) {
      return cors(json({ error: e?.message || String(e) }, 500));
    }
  }
};

const ROUTE_TABLE = "subsubroutes";
const ADDRESS_TABLE = "addresses"; // 배송지 테이블 (필요 시 수정)

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
    // Supabase error는 보통 JSON 문자열
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

// ---------- /route GET ----------
async function handleRouteGet(url, env) {
  const camp = (url.searchParams.get("camp") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();
  const mode = (url.searchParams.get("mode") || "prefix").trim(); // prefix | exact

  if (!camp) return json({ error: "camp is required" }, 400);

  // color 컬럼을 제거 (DB에 없음)
  const select = [
    "id",
    "camp",
    "code",
    "full_code",
    "polygon_wgs84",
    "vendor_name",
    "vendor_business_number",
    "delivery_location_name",
    "delivery_location_address",
    "delivery_location_lat",
    "delivery_location_lng",
    "created_at",
    "updated_at"
  ].join(",");

  // Supabase REST filter
  const params = new URLSearchParams();
  params.set("select", select);
  params.set("camp", `eq.${camp}`);
  params.set("order", "full_code.asc");

  if (code) {
    if (mode === "exact") {
      params.set("full_code", `eq.${code}`);
    } else {
      // prefix
      // like는 % 필요, URL 인코딩 처리: % => %25
      params.set("full_code", `like.${code}%`);
    }
  }

  const rows = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
    method: "GET"
  });

  // 프론트엔드를 위해 color를 자동 생성 (해시 기반)
  // polygon_wgs84가 문자열이면 JSON 파싱
  if (Array.isArray(rows)) {
    rows.forEach(row => {
      if (row && row.full_code && !row.color) {
        row.color = generateColor(row.full_code);
      }
      // polygon_wgs84 파싱 (문자열 → 배열)
      if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === 'string') {
        try {
          row.polygon_wgs84 = JSON.parse(row.polygon_wgs84);
        } catch (e) {
          console.error('polygon_wgs84 파싱 실패:', e);
          row.polygon_wgs84 = null;
        }
      }
    });
  }

  return json({ rows: rows || [] }, 200, { "Cache-Control": "no-store" });
}

// 프론트엔드와 동일한 색상 생성 로직
function generateColor(code) {
  const COLOR_PALETTE = [
    "#00C2FF", "#FF4D6D", "#FFD166", "#06D6A0", "#A78BFA",
    "#F97316", "#22C55E", "#E11D48", "#3B82F6", "#F59E0B",
    "#14B8A6", "#8B5CF6", "#84CC16", "#EC4899", "#0EA5E9",
    "#EF4444", "#10B981", "#FBBF24", "#6366F1", "#FB7185"
  ];
  
  let h = 0;
  for (let i = 0; i < code.length; i++) {
    h = (h << 5) - h + code.charCodeAt(i);
    h |= 0;
  }
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

// ---------- /route POST (upsert) ----------
async function handleRoutePost(request, env) {
  const body = await readJson(request);

  const camp = (body.camp || "").trim();
  const code = (body.code || "").trim();
  const id = body.id;

  if (!camp) return json({ error: "camp is required" }, 400);
  if (!code) return json({ error: "code is required" }, 400);

  // polygon_wgs84:
  // - undefined: 유지
  // - null: null 저장
  // - array/object: 그대로 저장
  const hasPoly = Object.prototype.hasOwnProperty.call(body, "polygon_wgs84");

  const patch = {
    camp,
    code: code,      // 데이터베이스 code 컬럼 (NOT NULL)
    full_code: code  // 데이터베이스 full_code 컬럼
  };

  // 선택 저장 (color는 DB에 컬럼이 없으므로 제외)
  if (Object.prototype.hasOwnProperty.call(body, "vendor_name")) patch.vendor_name = body.vendor_name ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "vendor_business_number")) {
    patch.vendor_business_number = body.vendor_business_number ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_name")) {
    patch.delivery_location_name = body.delivery_location_name ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_address")) {
    patch.delivery_location_address = body.delivery_location_address ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lat")) {
    patch.delivery_location_lat = body.delivery_location_lat ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lng")) {
    patch.delivery_location_lng = body.delivery_location_lng ?? null;
  }
  if (hasPoly) patch.polygon_wgs84 = body.polygon_wgs84 ?? null;

  // id가 오면 patch 우선(단, full_code/camp 같이 동기화)
  if (typeof id === "number") {
    const params = new URLSearchParams();
    params.set("id", `eq.${id}`);
    params.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");

    const updated = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    });

    const row = Array.isArray(updated) ? updated[0] : updated;
    if (row && row.full_code) {
      row.color = generateColor(row.full_code);
    }
    // polygon_wgs84 파싱
    if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === 'string') {
      try {
        row.polygon_wgs84 = JSON.parse(row.polygon_wgs84);
      } catch (e) {
        row.polygon_wgs84 = null;
      }
    }

    return json({ row }, 200, { "Cache-Control": "no-store" });
  }

  // id가 없으면 먼저 기존 row 조회 후 있으면 PATCH, 없으면 POST
  const queryParams = new URLSearchParams();
  queryParams.set("camp", `eq.${camp}`);
  queryParams.set("full_code", `eq.${code}`);
  queryParams.set("select", "id");
  
  const existing = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${queryParams.toString()}`, {
    method: "GET"
  });

  let inserted;
  if (Array.isArray(existing) && existing.length > 0) {
    // 기존 row가 있으면 PATCH
    const existingId = existing[0].id;
    const patchParams = new URLSearchParams();
    patchParams.set("id", `eq.${existingId}`);
    patchParams.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");
    
    inserted = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${patchParams.toString()}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    });
  } else {
    // 기존 row가 없으면 POST (신규 생성)
    const insertParams = new URLSearchParams();
    insertParams.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");
    
    inserted = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${insertParams.toString()}`, {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    });
  }

  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  if (row && row.full_code) {
    row.color = generateColor(row.full_code);
  }
  // polygon_wgs84 파싱
  if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === 'string') {
    try {
      row.polygon_wgs84 = JSON.parse(row.polygon_wgs84);
    } catch (e) {
      row.polygon_wgs84 = null;
    }
  }

  return json({ row }, 200, { "Cache-Control": "no-store" });
}

// ---------- /route DELETE (polygon_wgs84=null) ----------
async function handleRouteDelete(request, env) {
  const body = await readJson(request);
  const id = body.id;
  const camp = (body.camp || "").trim();
  const code = (body.code || "").trim();

  if (typeof id !== "number" && (!camp || !code)) {
    return json({ error: "id OR (camp + code) is required" }, 400);
  }

  // 대상 필터
  const params = new URLSearchParams();
  params.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");

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
  if (row && row.full_code) {
    row.color = generateColor(row.full_code);
  }
  // polygon_wgs84 파싱 (null이지만 일관성 유지)
  if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === 'string') {
    try {
      row.polygon_wgs84 = JSON.parse(row.polygon_wgs84);
    } catch (e) {
      row.polygon_wgs84 = null;
    }
  }

  return json({ row }, 200, { "Cache-Control": "no-store" });
}

// ---------- /addresses GET ----------
async function handleAddressesGet(url, env) {
  const camp = (url.searchParams.get("camp") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();

  if (!camp) return json({ error: "camp is required" }, 400);

  // 배송지 테이블에서 조회
  // 예상 컬럼: id, camp, full_code, address, center_wgs84, zipcode 등
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

  if (code) {
    // prefix 검색
    params.set("full_code", `like.${code}%`);
  }

  try {
    const rows = await supabaseFetch(env, `/rest/v1/${ADDRESS_TABLE}?${params.toString()}`, {
      method: "GET"
    });

    // center_wgs84 파싱 (문자열 → 객체)
    if (Array.isArray(rows)) {
      rows.forEach(row => {
        if (row && row.center_wgs84 && typeof row.center_wgs84 === 'string') {
          try {
            row.center_wgs84 = JSON.parse(row.center_wgs84);
          } catch (e) {
            console.error('center_wgs84 파싱 실패:', e);
            row.center_wgs84 = null;
          }
        }
      });
    }

    return json({ rows: rows || [] }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    // 테이블이 없거나 컬럼이 다를 수 있음
    console.error('addresses 조회 실패:', e);
    return json({ error: e.message, rows: [] }, 200);
  }
}

// ---------- /osm GET (Overpass) ----------
async function handleOsmGet(url) {
  const bboxStr = (url.searchParams.get("bbox") || "").trim();
  // bbox: minLng,minLat,maxLng,maxLat
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
    return json({ error: "bbox is required: minLng,minLat,maxLng,maxLat" }, 400);
  }

  const [minLng, minLat, maxLng, maxLat] = parts;

  // Overpass bounding box format: (south,west,north,east) = (minLat,minLng,maxLat,maxLng)
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

  // 도로 + 건물(너무 무거우면 건물 제거 가능)
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

  // Overpass endpoint (기본)
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
  if (!res.ok) {
    return json({ error: `Overpass error: ${text || res.status}` }, 502);
  }

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

  return json(
    { roads, buildings },
    200,
    {
      "Cache-Control": "public, max-age=60"
    }
  );
}
