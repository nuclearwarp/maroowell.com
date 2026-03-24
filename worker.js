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
const VENDORS_TABLE = "vendors";
const FAVICON_URL = "https://maroowell.com/favicon.ico?v=2";
const OG_IMAGE_URL = "https://maroowell.com/assets/og/maroowell-1200x630.png?v=1";

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

      // 공유 엔드포인트는 /share 와 /share.html 둘 다 처리
      if ((path === "/share" || path === "/share.html") && request.method === "GET") {
        return await handleShareHtml(request, url, env);
      }

      if (path === "/camps") {
        if (request.method === "GET") return cors(await handleCampsGet(url, env));
        if (request.method === "POST") return cors(await handleCampsPost(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }

      if (path === "/vendors") {
        if (request.method === "GET") return cors(await handleVendorsGet(url, env));
        if (request.method === "POST") return cors(await handleVendorCreate(request, env));
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

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quoteJsString(s) {
  return JSON.stringify(String(s ?? ""));
}

function removeHtmlTags(html, regexList = []) {
  let out = String(html ?? "");
  for (const re of regexList) {
    out = out.replace(re, "");
  }
  return out;
}

function prependHeadBlock(html, block) {
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen) {
    return html.replace(/<head[^>]*>/i, `${headOpen[0]}\n${block}`);
  }
  return `${block}\n${html}`;
}

function buildVersionedAssetUrl(rawUrl, versionValue) {
  try {
    const u = new URL(String(rawUrl));
    if (versionValue) u.searchParams.set("ogv", versionValue);
    return u.toString();
  } catch {
    return String(rawUrl || "");
  }
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

function digitsOnly(v) {
  return safeTrim(v).replace(/\D/g, "");
}

function normalizeBusinessNumber(v) {
  const d = digitsOnly(v);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return safeTrim(v);
}

function buildVendorCodeFromBusinessNumber(v) {
  const d = digitsOnly(v);
  if (!d) return null;
  return `bn_${d}`;
}

function quoteInValue(v) {
  const s = String(v ?? "");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function fetchVendorNameMap(env, businessNumbers) {
  const bnSet = new Set();
  for (const v of businessNumbers || []) {
    const raw = safeTrim(v);
    if (!raw) continue;
    bnSet.add(raw);
    const norm = normalizeBusinessNumber(raw);
    if (norm) bnSet.add(norm);
    const d = digitsOnly(raw);
    if (d) bnSet.add(d);
  }
  const bns = Array.from(bnSet);

  if (bns.length === 0) return new Map();

  const params = new URLSearchParams();
  params.set("select", "business_number,name");
  params.set("business_number", `in.(${bns.slice(0, 200).map(quoteInValue).join(",")})`);

  const rows = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${params.toString()}`, { method: "GET" });
  const out = new Map();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const bn = safeTrim(row?.business_number);
    if (!bn) continue;
    const name = safeTrim(row?.name) || null;
    out.set(bn, name);
    const norm = normalizeBusinessNumber(bn);
    if (norm) out.set(norm, name);
    const d = digitsOnly(bn);
    if (d) out.set(d, name);
  }
  return out;
}

async function enrichRowsWithVendorNames(rows, env) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const bns = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const bn1 = normalizeBusinessNumber(row.vendor_business_number_1w ?? row.vendor_business_number);
    const bn2 = normalizeBusinessNumber(row.vendor_business_number_2w);
    if (bn1) bns.push(bn1);
    if (bn2) bns.push(bn2);
  }
  const nameMap = await fetchVendorNameMap(env, bns);

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const bn1 = normalizeBusinessNumber(row.vendor_business_number_1w ?? row.vendor_business_number);
    const bn2 = normalizeBusinessNumber(row.vendor_business_number_2w);
    const n1 = bn1 ? (nameMap.get(bn1) || nameMap.get(digitsOnly(bn1))) : null;
    const n2 = bn2 ? (nameMap.get(bn2) || nameMap.get(digitsOnly(bn2))) : null;

    if (n1) {
      row.vendor_name_1w = n1;
      row.vendor_1w_name = n1;
    }
    if (n2) {
      row.vendor_name_2w = n2;
      row.vendor_2w_name = n2;
    }
  }

  return rows;
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

  const byCamp = new Map();

  for (const row of rows) {
    const deliveryName = safeTrim(row?.delivery_location_name);
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
  await enrichRowsWithVendorNames(out, env);
  await hydrateRouteRowsWithCamps(out, env);

  return json({ rows: out }, 200, { "Cache-Control": "no-store" });
}

function buildRoutePatch(body) {
  const camp = safeTrim(body.camp);
  const code = safeTrim(body.code);
  const patch = { camp, code, full_code: code };

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
  await enrichRowsWithVendorNames([row], env);
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
  await enrichRowsWithVendorNames([row], env);
  await hydrateRouteRowsWithCamps([row], env);

  return json({ row }, 200, { "Cache-Control": "no-store" });
}

// ---------- /vendors ----------
function scoreVendorSearch(row, qLower) {
  const name = safeTrim(row?.name).toLowerCase();
  const bn = safeTrim(row?.business_number).toLowerCase();
  if (!qLower) return 0;
  if (name === qLower) return 120;
  if (bn === qLower) return 115;
  if (name.startsWith(qLower)) return 100;
  if (bn.startsWith(qLower)) return 95;
  if (name.includes(qLower)) return 80;
  if (bn.includes(qLower)) return 75;
  return 0;
}

function vendorDedupeKey(row) {
  if (row?.id != null) return `id:${row.id}`;
  return `key:${safeTrim(row?.business_number)}|${safeTrim(row?.name)}`;
}

async function handleVendorsGet(url, env) {
  const q = safeTrim(url.searchParams.get("q"));
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

  if (!q) {
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("order", "created_at.desc,id.desc");
    params.set("limit", String(limit));
    const rows = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${params.toString()}`, { method: "GET" });
    return json({ rows: Array.isArray(rows) ? rows : [] }, 200, { "Cache-Control": "no-store" });
  }

  const wildcard = `*${q}*`;
  const base = new URLSearchParams();
  base.set("select", "*");
  base.set("order", "created_at.desc,id.desc");
  base.set("limit", String(Math.min(limit * 2, 200)));

  const queries = [
    ["name", `eq.${q}`],
    ["business_number", `eq.${q}`],
    ["name", `ilike.${wildcard}`],
    ["business_number", `ilike.${wildcard}`],
  ];

  const merged = new Map();
  for (const [field, value] of queries) {
    try {
      const p = new URLSearchParams(base.toString());
      p.set(field, value);
      const rows = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${p.toString()}`, { method: "GET" });
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const key = vendorDedupeKey(row);
        if (!merged.has(key)) merged.set(key, row);
      }
    } catch (e) {
      console.warn("vendors 검색 쿼리 실패:", e?.message || String(e));
    }
  }

  const qLower = q.toLowerCase();
  const out = Array.from(merged.values())
    .sort((a, b) => scoreVendorSearch(b, qLower) - scoreVendorSearch(a, qLower))
    .slice(0, limit);

  return json({ rows: out }, 200, { "Cache-Control": "no-store" });
}

async function handleVendorCreate(request, env) {
  const body = await readJson(request);
  const name = safeTrim(body.name ?? body.vendor_name);
  const rawBusinessNumber = safeTrim(body.business_number ?? body.vendor_business_number);
  const businessNumber = normalizeBusinessNumber(rawBusinessNumber);
  const vendorCodeInput = safeTrim(body.vendor_code);

  if (!name) return json({ error: "name is required" }, 400);
  if (!digitsOnly(businessNumber)) return json({ error: "business_number is required" }, 400);
  const vendorCode = buildVendorCodeFromBusinessNumber(businessNumber) || vendorCodeInput || null;

  const tryFindByBusinessNumber = async (bn) => {
    const q = new URLSearchParams();
    q.set("select", "*");
    q.set("business_number", `eq.${bn}`);
    q.set("limit", "1");
    const rows = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${q.toString()}`, { method: "GET" });
    return Array.isArray(rows) ? rows : [];
  };

  let existing = await tryFindByBusinessNumber(businessNumber);
  if ((!existing || existing.length === 0) && rawBusinessNumber && rawBusinessNumber !== businessNumber) {
    existing = await tryFindByBusinessNumber(rawBusinessNumber);
  }

  const patch = { name, business_number: businessNumber };
  if (vendorCode || Object.prototype.hasOwnProperty.call(body, "vendor_code")) {
    patch.vendor_code = vendorCode;
  }

  let row = null;
  if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id != null) {
    const params = new URLSearchParams();
    params.set("id", `eq.${existing[0].id}`);
    params.set("select", "*");

    const updated = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${params.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    row = Array.isArray(updated) ? updated[0] : updated;
  } else {
    const params = new URLSearchParams();
    params.set("select", "*");

    const inserted = await supabaseFetch(env, `/rest/v1/${VENDORS_TABLE}?${params.toString()}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    row = Array.isArray(inserted) ? inserted[0] : inserted;
  }

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

  if (!qLower) return 0;
  if (mb === qLower) return 120;
  if (camp === qLower) return 115;
  if (mb.startsWith(qLower)) return 100;
  if (camp.startsWith(qLower)) return 95;
  if (mb.includes(qLower)) return 80;
  if (camp.includes(qLower)) return 75;
  return 0;
}

function campRowDedupeKey(row) {
  if (row?.id != null) return `id:${row.id}`;
  return `key:${safeTrim(row?.camp)}|${safeTrim(row?.mb_camp)}|${safeTrim(row?.code)}`;
}

async function handleCampsGet(url, env) {
  const q = safeTrim(url.searchParams.get("q"));
  const camp = safeTrim(url.searchParams.get("camp"));
  const mbCamp = safeTrim(
    url.searchParams.get("mb_camp") ||
    url.searchParams.get("orbm_camp") ||
    url.searchParams.get("ormb_camp")
  );
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

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

  const qLower = q.toLowerCase();
  const base = new URLSearchParams();
  base.set("select", "*");
  base.set("order", "updated_at.desc,created_at.desc,id.desc");
  base.set("limit", String(Math.min(limit * 2, 200)));
  if (camp) base.set("camp", `eq.${camp}`);
  if (mbCamp) base.set("mb_camp", `eq.${mbCamp}`);

  const wildcard = `*${q}*`;
  const likeFields = ["mb_camp", "camp"];
  const eqFields = ["mb_camp", "camp"];

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
          const hay = `${safeTrim(row.mb_camp)}\n${safeTrim(row.camp)}`.toLowerCase();
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

// ---------- /share ----------
const SHARE_TEMPLATE_B64 = "PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImtvIj4KPGhlYWQ+CiAgPG1ldGEgY2hhcnNldD0idXRmLTgiIC8+CiAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTEsbWF4aW11bS1zY2FsZT0xLHVzZXItc2NhbGFibGU9bm8iIC8+CiAgPHRpdGxlPuuwsOyGoSDsp4Drj4Qg6rO17JygPC90aXRsZT4KICA8bWV0YSBuYW1lPSJkZXNjcmlwdGlvbiIgY29udGVudD0i67Cw7IahIOq1rOyXrSDrsI8g6rK966Gc66W8IO2ZleyduO2VmOyEuOyalCIgLz4KICA8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9ImluZGV4LGZvbGxvdyxtYXgtaW1hZ2UtcHJldmlldzpsYXJnZSIgLz4KCiAgPCEtLSBPcGVuIEdyYXBoIC8g7Lm07Lm07JikIOunge2BrCDrr7jrpqzrs7TquLAgLS0+CiAgPG1ldGEgcHJvcGVydHk9Im9nOnR5cGUiIGNvbnRlbnQ9IndlYnNpdGUiIC8+CiAgPG1ldGEgcHJvcGVydHk9Im9nOnNpdGVfbmFtZSIgY29udGVudD0iTWFyb293ZWxsIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzpsb2NhbGUiIGNvbnRlbnQ9ImtvX0tSIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzp0aXRsZSIgY29udGVudD0i67Cw7IahIOyngOuPhCDqs7XsnKAiIC8+CiAgPG1ldGEgcHJvcGVydHk9Im9nOmRlc2NyaXB0aW9uIiBjb250ZW50PSLrsLDshqEg6rWs7JetIOuwjyDqsr3roZzrpbwg7ZmV7J247ZWY7IS47JqUIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzp1cmwiIGNvbnRlbnQ9Imh0dHBzOi8vbWFyb293ZWxsLmNvbS9zaGFyZS5odG1sIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzppbWFnZSIgY29udGVudD0iaHR0cHM6Ly9tYXJvb3dlbGwuY29tL2Fzc2V0cy9vZy9tYXJvb3dlbGwtMTIwMHg2MzAucG5nIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzppbWFnZTp1cmwiIGNvbnRlbnQ9Imh0dHBzOi8vbWFyb293ZWxsLmNvbS9hc3NldHMvb2cvbWFyb293ZWxsLTEyMDB4NjMwLnBuZyIgLz4KICA8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2U6c2VjdXJlX3VybCIgY29udGVudD0iaHR0cHM6Ly9tYXJvb3dlbGwuY29tL2Fzc2V0cy9vZy9tYXJvb3dlbGwtMTIwMHg2MzAucG5nIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzppbWFnZTp0eXBlIiBjb250ZW50PSJpbWFnZS9wbmciIC8+CiAgPG1ldGEgcHJvcGVydHk9Im9nOmltYWdlOndpZHRoIiBjb250ZW50PSIxMjAwIiAvPgogIDxtZXRhIHByb3BlcnR5PSJvZzppbWFnZTpoZWlnaHQiIGNvbnRlbnQ9IjYzMCIgLz4KICA8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2U6YWx0IiBjb250ZW50PSJNYXJvb3dlbGwg67Cw7IahIOyngOuPhCDqs7XsnKAiIC8+CgogIDxtZXRhIG5hbWU9InR3aXR0ZXI6Y2FyZCIgY29udGVudD0ic3VtbWFyeV9sYXJnZV9pbWFnZSIgLz4KICA8bWV0YSBuYW1lPSJ0d2l0dGVyOnRpdGxlIiBjb250ZW50PSLrsLDshqEg7KeA64+EIOqzteycoCIgLz4KICA8bWV0YSBuYW1lPSJ0d2l0dGVyOmRlc2NyaXB0aW9uIiBjb250ZW50PSLrsLDshqEg6rWs7JetIOuwjyDqsr3roZzrpbwg7ZmV7J247ZWY7IS47JqUIiAvPgogIDxtZXRhIG5hbWU9InR3aXR0ZXI6dXJsIiBjb250ZW50PSJodHRwczovL21hcm9vd2VsbC5jb20vc2hhcmUuaHRtbCIgLz4KICA8bWV0YSBuYW1lPSJ0d2l0dGVyOmltYWdlIiBjb250ZW50PSJodHRwczovL21hcm9vd2VsbC5jb20vYXNzZXRzL29nL21hcm9vd2VsbC0xMjAweDYzMC5wbmciIC8+CiAgPG1ldGEgbmFtZT0idHdpdHRlcjppbWFnZTphbHQiIGNvbnRlbnQ9Ik1hcm9vd2VsbCDrsLDshqEg7KeA64+EIOqzteycoCIgLz4KCiAgPGxpbmsgcmVsPSJjYW5vbmljYWwiIGhyZWY9Imh0dHBzOi8vbWFyb293ZWxsLmNvbS9zaGFyZS5odG1sIiAvPgoKICA8bGluayByZWw9Imljb24iIGhyZWY9Ii9mYXZpY29uLmljbz92PTIiIHNpemVzPSJhbnkiIC8+CiAgPGxpbmsgcmVsPSJpY29uIiB0eXBlPSJpbWFnZS9zdmcreG1sIiBocmVmPSIvZmF2aWNvbi5zdmc/dj0yIiAvPgogIDxsaW5rIHJlbD0iYXBwbGUtdG91Y2gtaWNvbiIgaHJlZj0iL2FwcGxlLXRvdWNoLWljb24ucG5nP3Y9MiIgLz4KCiAgPHN0eWxlPgogICAgOnJvb3R7CiAgICAgIC0tYmc6IzBiMTIyMDsKICAgICAgLS1wYW5lbDojMGYxYTJkOwogICAgICAtLXR4dDojZTZlZWZjOwogICAgICAtLW11dGVkOiM5M2E0Yzc7CiAgICAgIC0tbGluZTpyZ2JhKDI1NSwyNTUsMjU1LC4wOCk7CiAgICAgIC0tYnRuOiMxNjI3NDQ7CiAgICAgIC0tYnRuMjojMWEyZjU1OwogICAgfQogICAgKntib3gtc2l6aW5nOmJvcmRlci1ib3g7IG1hcmdpbjowOyBwYWRkaW5nOjA7fQogICAgaHRtbCxib2R5e2hlaWdodDoxMDAlOyBmb250LWZhbWlseTpzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sICJOb3RvIFNhbnMgS1IiLCBzYW5zLXNlcmlmOyBiYWNrZ3JvdW5kOnZhcigtLWJnKTsgY29sb3I6dmFyKC0tdHh0KTt9CgogICAgLmNvbnRhaW5lcntkaXNwbGF5OmZsZXg7IGZsZXgtZGlyZWN0aW9uOmNvbHVtbjsgaGVpZ2h0OjEwMHZoO30KCiAgICAuaGVhZGVyewogICAgICBiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxYTJmNTUgMCUsICMwZjFhMmQgMTAwJSk7CiAgICAgIHBhZGRpbmc6MjBweDsKICAgICAgYm9yZGVyLWJvdHRvbToycHggc29saWQgdmFyKC0tbGluZSk7CiAgICAgIGJveC1zaGFkb3c6MCA0cHggMTJweCByZ2JhKDAsMCwwLC4zKTsKICAgICAgdGV4dC1hbGlnbjpjZW50ZXI7CiAgICB9CiAgICAuaGVhZGVyLWNvbnRlbnR7CiAgICAgIG1heC13aWR0aDo2MDBweDsKICAgICAgbWFyZ2luOjAgYXV0bzsKICAgIH0KICAgIC5jYW1wLWluZm97CiAgICAgIG1hcmdpbi1ib3R0b206MTZweDsKICAgIH0KICAgIC5jYW1wLW5hbWV7CiAgICAgIGZvbnQtc2l6ZToyNHB4OwogICAgICBmb250LXdlaWdodDo4MDA7CiAgICAgIG1hcmdpbi1ib3R0b206OHB4OwogICAgICBsZXR0ZXItc3BhY2luZzowLjNweDsKICAgICAgY29sb3I6IzAwQzJGRjsKICAgIH0KICAgIC5jYW1wLWFkZHJlc3N7CiAgICAgIGZvbnQtc2l6ZToxNHB4OwogICAgICBjb2xvcjp2YXIoLS1tdXRlZCk7CiAgICAgIGxpbmUtaGVpZ2h0OjEuNTsKICAgICAgbWFyZ2luLWJvdHRvbTo0cHg7CiAgICAgIGRpc3BsYXk6ZmxleDsKICAgICAgYWxpZ24taXRlbXM6Y2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyOwogICAgICBnYXA6OHB4OwogICAgfQogICAgLmNvcHktYnRuewogICAgICBiYWNrZ3JvdW5kOnJnYmEoMCwxOTQsMjU1LC4xNSk7CiAgICAgIGJvcmRlcjoxcHggc29saWQgcmdiYSgwLDE5NCwyNTUsLjMpOwogICAgICBjb2xvcjojMDBDMkZGOwogICAgICBwYWRkaW5nOjRweCA4cHg7CiAgICAgIGJvcmRlci1yYWRpdXM6NnB4OwogICAgICBjdXJzb3I6cG9pbnRlcjsKICAgICAgZm9udC1zaXplOjEycHg7CiAgICAgIHRyYW5zaXRpb246YWxsIDAuMnM7CiAgICAgIHdoaXRlLXNwYWNlOm5vd3JhcDsKICAgIH0KICAgIC5jb3B5LWJ0bjpob3ZlcnsKICAgICAgYmFja2dyb3VuZDpyZ2JhKDAsMTk0LDI1NSwuMjUpOwogICAgICBib3JkZXItY29sb3I6IzAwQzJGRjsKICAgIH0KCiAgICAubmF2aS1idXR0b25zewogICAgICBkaXNwbGF5OmZsZXg7CiAgICAgIGdhcDo4cHg7CiAgICAgIGZsZXgtZGlyZWN0aW9uOmNvbHVtbjsKICAgIH0KICAgIC5idG57CiAgICAgIHdpZHRoOjEwMCU7CiAgICAgIHBhZGRpbmc6MTRweCAyMHB4OwogICAgICBib3JkZXItcmFkaXVzOjEycHg7CiAgICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7CiAgICAgIGJhY2tncm91bmQ6dmFyKC0tYnRuKTsKICAgICAgY29sb3I6dmFyKC0tdHh0KTsKICAgICAgY3Vyc29yOnBvaW50ZXI7CiAgICAgIGZvbnQtd2VpZ2h0OjcwMDsKICAgICAgZm9udC1zaXplOjE1cHg7CiAgICAgIHdoaXRlLXNwYWNlOm5vd3JhcDsKICAgICAgdHJhbnNpdGlvbjphbGwgMC4yczsKICAgICAgZGlzcGxheTpmbGV4OwogICAgICBhbGlnbi1pdGVtczpjZW50ZXI7CiAgICAgIGp1c3RpZnktY29udGVudDpjZW50ZXI7CiAgICAgIGdhcDo4cHg7CiAgICB9CiAgICAuYnRuOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYnRuMik7IHRyYW5zZm9ybTp0cmFuc2xhdGVZKC0xcHgpO30KICAgIC5idG4ucHJpbWFyeXsKICAgICAgYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDBDMkZGIDAlLCAjMDA4OENDIDEwMCUpOwogICAgICBib3JkZXItY29sb3I6IzAwQzJGRjsKICAgICAgY29sb3I6I2ZmZjsKICAgICAgYm94LXNoYWRvdzowIDRweCAxMnB4IHJnYmEoMCwxOTQsMjU1LC4yNSk7CiAgICAgIGZvbnQtc2l6ZToxNnB4OwogICAgICBwYWRkaW5nOjE2cHggMjBweDsKICAgIH0KICAgIC5idG4ucHJpbWFyeTpob3ZlcnsKICAgICAgYm94LXNoYWRvdzowIDZweCAxNnB4IHJnYmEoMCwxOTQsMjU1LC4zNSk7CiAgICB9CgogICAgLm1hcC1jb250YWluZXJ7ZmxleDoxOyBwb3NpdGlvbjpyZWxhdGl2ZTt9CiAgICAjbWFwe3Bvc2l0aW9uOmFic29sdXRlOyBpbnNldDowO30KCiAgICAubWFwLXRvb2xiYXJ7CiAgICAgIHBvc2l0aW9uOmFic29sdXRlOwogICAgICB0b3A6MTJweDsKICAgICAgcmlnaHQ6MTJweDsKICAgICAgei1pbmRleDoyMDA7CiAgICAgIGRpc3BsYXk6ZmxleDsKICAgICAgZmxleC1kaXJlY3Rpb246Y29sdW1uOwogICAgICBnYXA6OHB4OwogICAgICBwb2ludGVyLWV2ZW50czphdXRvOwogICAgfQogICAgLnRvb2wtYnRuewogICAgICBwYWRkaW5nOjEwcHggMTJweDsKICAgICAgYm9yZGVyLXJhZGl1czoxMnB4OwogICAgICBib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsLjEyKTsKICAgICAgYmFja2dyb3VuZDpyZ2JhKDE1LDI2LDQ1LC44OCk7CiAgICAgIGJhY2tkcm9wLWZpbHRlcjpibHVyKDEwcHgpOwogICAgICBjb2xvcjp2YXIoLS10eHQpOwogICAgICBjdXJzb3I6cG9pbnRlcjsKICAgICAgZm9udC13ZWlnaHQ6ODAwOwogICAgICBmb250LXNpemU6MTNweDsKICAgICAgYm94LXNoYWRvdzowIDhweCAxOHB4IHJnYmEoMCwwLDAsLjMwKTsKICAgICAgdHJhbnNpdGlvbjphbGwgLjE1cyBlYXNlOwogICAgICB3aGl0ZS1zcGFjZTpub3dyYXA7CiAgICB9CiAgICAudG9vbC1idG46aG92ZXJ7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTFweCk7IGJvcmRlci1jb2xvcjpyZ2JhKDAsMTk0LDI1NSwuMzUpfQogICAgLnRvb2wtYnRuLm9uewogICAgICBib3JkZXItY29sb3I6cmdiYSgwLDE5NCwyNTUsLjU1KTsKICAgICAgYm94LXNoYWRvdzowIDEwcHggMjBweCByZ2JhKDAsMTk0LDI1NSwuMTUpOwogICAgfQoKICAgIC5yb2Fkdmlldy13cmFwewogICAgICBwb3NpdGlvbjphYnNvbHV0ZTsKICAgICAgbGVmdDoxMHB4OwogICAgICByaWdodDoxMHB4OwogICAgICBib3R0b206MTBweDsKICAgICAgaGVpZ2h0OjQydmg7CiAgICAgIG1pbi1oZWlnaHQ6MjYwcHg7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgxNSwyNiw0NSwuOTYpOwogICAgICBiYWNrZHJvcC1maWx0ZXI6Ymx1cigxMHB4KTsKICAgICAgYm9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LC4xMCk7CiAgICAgIGJvcmRlci1yYWRpdXM6MTZweDsKICAgICAgYm94LXNoYWRvdzowIDEycHggMjhweCByZ2JhKDAsMCwwLC40NSk7CiAgICAgIHotaW5kZXg6MzAwOwogICAgICBvdmVyZmxvdzpoaWRkZW47CiAgICAgIGRpc3BsYXk6bm9uZTsKICAgIH0KICAgIC5yb2Fkdmlldy13cmFwLnZpc2libGV7ZGlzcGxheTpibG9jazt9CiAgICAucm9hZHZpZXctaGVhZGVyewogICAgICBoZWlnaHQ6NDRweDsKICAgICAgZGlzcGxheTpmbGV4OwogICAgICBhbGlnbi1pdGVtczpjZW50ZXI7CiAgICAgIGp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuOwogICAgICBwYWRkaW5nOjAgMTJweCAwIDE0cHg7CiAgICAgIGJvcmRlci1ib3R0b206MXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsLjA4KTsKICAgICAgY29sb3I6dmFyKC0tdHh0KTsKICAgICAgZm9udC13ZWlnaHQ6ODAwOwogICAgICBmb250LXNpemU6MTNweDsKICAgICAgYmFja2dyb3VuZDpyZ2JhKDAsMCwwLC4xOCk7CiAgICB9CiAgICAucm9hZHZpZXctYWN0aW9uc3sKICAgICAgZGlzcGxheTpmbGV4OwogICAgICBnYXA6OHB4OwogICAgICBhbGlnbi1pdGVtczpjZW50ZXI7CiAgICB9CiAgICAucnYtbWluaS1idG57CiAgICAgIHBhZGRpbmc6OHB4IDEwcHg7CiAgICAgIGJvcmRlci1yYWRpdXM6MTBweDsKICAgICAgYm9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LC4xMik7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuMTgpOwogICAgICBjb2xvcjp2YXIoLS10eHQpOwogICAgICBjdXJzb3I6cG9pbnRlcjsKICAgICAgZm9udC13ZWlnaHQ6ODAwOwogICAgICBmb250LXNpemU6MTJweDsKICAgIH0KICAgIC5ydi1taW5pLWJ0bjpob3Zlcntib3JkZXItY29sb3I6cmdiYSgwLDE5NCwyNTUsLjM1KX0KICAgICNyb2Fkdmlld3sKICAgICAgd2lkdGg6MTAwJTsKICAgICAgaGVpZ2h0OmNhbGMoMTAwJSAtIDQ0cHgpOwogICAgICBiYWNrZ3JvdW5kOiMwMDA7CiAgICB9CiAgICAucnYtaGludHsKICAgICAgcG9zaXRpb246YWJzb2x1dGU7CiAgICAgIGxlZnQ6MTZweDsKICAgICAgdG9wOjU4cHg7CiAgICAgIHotaW5kZXg6NDAwOwogICAgICBwYWRkaW5nOjhweCAxMHB4OwogICAgICBib3JkZXItcmFkaXVzOjEycHg7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuNTUpOwogICAgICBjb2xvcjojZmZmOwogICAgICBib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsLjEyKTsKICAgICAgZm9udC1zaXplOjEycHg7CiAgICAgIGZvbnQtd2VpZ2h0OjcwMDsKICAgICAgZGlzcGxheTpub25lOwogICAgfQogICAgLnJ2LWhpbnQudmlzaWJsZXtkaXNwbGF5OmJsb2NrO30KCiAgICAuYWRkcmVzcy1wYW5lbHsKICAgICAgcG9zaXRpb246YWJzb2x1dGU7CiAgICAgIGJvdHRvbToyMHB4OwogICAgICBsZWZ0OjIwcHg7CiAgICAgIG1heC13aWR0aDozNjBweDsKICAgICAgbWF4LWhlaWdodDo2MHZoOwogICAgICBiYWNrZ3JvdW5kOnJnYmEoMTUsMjYsNDUsLjk1KTsKICAgICAgYmFja2Ryb3AtZmlsdGVyOmJsdXIoMTBweCk7CiAgICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7CiAgICAgIGJvcmRlci1yYWRpdXM6MTZweDsKICAgICAgYm94LXNoYWRvdzowIDhweCAyNHB4IHJnYmEoMCwwLDAsLjQpOwogICAgICBvdmVyZmxvdzpoaWRkZW47CiAgICAgIGRpc3BsYXk6bm9uZTsKICAgICAgei1pbmRleDoxNTA7CiAgICB9CiAgICAuYWRkcmVzcy1wYW5lbC52aXNpYmxle2Rpc3BsYXk6YmxvY2s7fQogICAgLnBhbmVsLWhlYWRlcnsKICAgICAgcGFkZGluZzoxNnB4IDE4cHg7CiAgICAgIGJvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpOwogICAgICBmb250LXdlaWdodDo3MDA7CiAgICAgIGZvbnQtc2l6ZToxNXB4OwogICAgICBiYWNrZ3JvdW5kOnJnYmEoMCwwLDAsLjIpOwogICAgfQogICAgLmFkZHJlc3MtbGlzdHsKICAgICAgbWF4LWhlaWdodDpjYWxjKDYwdmggLSA2MHB4KTsKICAgICAgb3ZlcmZsb3cteTphdXRvOwogICAgICBwYWRkaW5nOjEwcHg7CiAgICB9CiAgICAuYWRkcmVzcy1pdGVtewogICAgICBwYWRkaW5nOjE0cHggMTZweDsKICAgICAgbWFyZ2luLWJvdHRvbTo4cHg7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuMTUpOwogICAgICBib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpOwogICAgICBib3JkZXItcmFkaXVzOjEycHg7CiAgICAgIGZvbnQtc2l6ZToxM3B4OwogICAgICBkaXNwbGF5OmZsZXg7CiAgICAgIGZsZXgtZGlyZWN0aW9uOmNvbHVtbjsKICAgICAgZ2FwOjEwcHg7CiAgICAgIHRyYW5zaXRpb246YWxsIDAuMnM7CiAgICB9CiAgICAuYWRkcmVzcy1pdGVtOmhvdmVye2JhY2tncm91bmQ6cmdiYSgwLDAsMCwuMjUpOyBib3JkZXItY29sb3I6IzAwQzJGRjt9CiAgICAuYWRkcmVzcy1pbmZve2ZsZXg6MTsgbWluLXdpZHRoOjA7fQogICAgLmFkZHJlc3MtdGV4dHtmb250LXdlaWdodDo2MDA7IGNvbG9yOnZhcigtLXR4dCk7IG1hcmdpbi1ib3R0b206NHB4OyB3b3JkLWJyZWFrOmJyZWFrLWFsbDt9CiAgICAuYWRkcmVzcy1tZXRhe2NvbG9yOnZhcigtLW11dGVkKTsgZm9udC1zaXplOjEycHg7fQogICAgLmFkZHJlc3MtaXRlbSAuYnRuewogICAgICBwYWRkaW5nOjEwcHggMTZweDsKICAgICAgZm9udC1zaXplOjE0cHg7CiAgICAgIHdpZHRoOjEwMCU7CiAgICAgIGJvcmRlci1yYWRpdXM6OHB4OwogICAgfQoKICAgIC5sb2FkaW5newogICAgICBwb3NpdGlvbjphYnNvbHV0ZTsKICAgICAgaW5zZXQ6MDsKICAgICAgYmFja2dyb3VuZDpyZ2JhKDExLDE4LDMyLC44NSk7CiAgICAgIGRpc3BsYXk6ZmxleDsKICAgICAgYWxpZ24taXRlbXM6Y2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyOwogICAgICB6LWluZGV4OjEwMDsKICAgICAgZmxleC1kaXJlY3Rpb246Y29sdW1uOwogICAgICBnYXA6MTJweDsKICAgIH0KICAgIC5zcGlubmVyewogICAgICB3aWR0aDo0MHB4OwogICAgICBoZWlnaHQ6NDBweDsKICAgICAgYm9yZGVyOjRweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LC4xKTsKICAgICAgYm9yZGVyLXRvcC1jb2xvcjojMDBDMkZGOwogICAgICBib3JkZXItcmFkaXVzOjUwJTsKICAgICAgYW5pbWF0aW9uOnNwaW4gMC44cyBsaW5lYXIgaW5maW5pdGU7CiAgICB9CiAgICBAa2V5ZnJhbWVzIHNwaW57dG97dHJhbnNmb3JtOnJvdGF0ZSgzNjBkZWcpO319CiAgICAubG9hZGluZy10ZXh0e2ZvbnQtc2l6ZToxNHB4OyBjb2xvcjp2YXIoLS1tdXRlZCk7fQoKICAgIC5yb3V0ZS1sYWJlbHsKICAgICAgcGFkZGluZzo1cHggMTBweDsKICAgICAgYm9yZGVyLXJhZGl1czoxMnB4OwogICAgICBiYWNrZ3JvdW5kOnJnYmEoMCwwLDAsLjEwKTsKICAgICAgY29sb3I6I2ZmZjsKICAgICAgZm9udC1zaXplOjEycHg7CiAgICAgIGJvcmRlcjoycHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwuMjIpOwogICAgICB3aGl0ZS1zcGFjZTpub3dyYXA7CiAgICAgIGJveC1zaGFkb3c6MCAzcHggMTBweCByZ2JhKDAsMCwwLC4zNSk7CiAgICAgIGZvbnQtd2VpZ2h0OjgwMDsKICAgICAgbGV0dGVyLXNwYWNpbmc6MC4ycHg7CiAgICAgIGJhY2tkcm9wLWZpbHRlcjpibHVyKDRweCk7CiAgICB9CgogICAgLnJvdXRlLW1vZGFsewogICAgICBwb3NpdGlvbjpmaXhlZDsKICAgICAgaW5zZXQ6MDsKICAgICAgYmFja2dyb3VuZDpyZ2JhKDAsMCwwLC44KTsKICAgICAgYmFja2Ryb3AtZmlsdGVyOmJsdXIoOHB4KTsKICAgICAgei1pbmRleDoxMDAwOwogICAgICBkaXNwbGF5Om5vbmU7CiAgICAgIGFsaWduLWl0ZW1zOmNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OmNlbnRlcjsKICAgICAgcGFkZGluZzoyMHB4OwogICAgfQogICAgLnJvdXRlLW1vZGFsLnZpc2libGV7ZGlzcGxheTpmbGV4O30KICAgIC5yb3V0ZS1tb2RhbC1jb250ZW50ewogICAgICBiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTsKICAgICAgYm9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTsKICAgICAgYm9yZGVyLXJhZGl1czoxNnB4OwogICAgICBwYWRkaW5nOjI0cHg7CiAgICAgIG1heC13aWR0aDo1MDBweDsKICAgICAgd2lkdGg6MTAwJTsKICAgICAgbWF4LWhlaWdodDo4MHZoOwogICAgICBvdmVyZmxvdy15OmF1dG87CiAgICB9CiAgICAucm91dGUtbW9kYWwtdGl0bGV7CiAgICAgIGZvbnQtc2l6ZToyMHB4OwogICAgICBmb250LXdlaWdodDo4MDA7CiAgICAgIG1hcmdpbi1ib3R0b206MTZweDsKICAgICAgdGV4dC1hbGlnbjpjZW50ZXI7CiAgICB9CiAgICAucm91dGUtaXRlbXsKICAgICAgcGFkZGluZzoxNnB4OwogICAgICBtYXJnaW4tYm90dG9tOjEycHg7CiAgICAgIGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuMik7CiAgICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7CiAgICAgIGJvcmRlci1yYWRpdXM6MTJweDsKICAgICAgY3Vyc29yOnBvaW50ZXI7CiAgICAgIHRyYW5zaXRpb246YWxsIDAuMnM7CiAgICB9CiAgICAucm91dGUtaXRlbTpob3ZlcnsKICAgICAgYmFja2dyb3VuZDpyZ2JhKDAsMCwwLC4zKTsKICAgICAgYm9yZGVyLWNvbG9yOiMwMEMyRkY7CiAgICAgIHRyYW5zZm9ybTp0cmFuc2xhdGVZKC0ycHgpOwogICAgfQogICAgLnJvdXRlLWl0ZW0tY29kZXsKICAgICAgZm9udC1zaXplOjE4cHg7CiAgICAgIGZvbnQtd2VpZ2h0OjcwMDsKICAgICAgY29sb3I6IzAwQzJGRjsKICAgICAgbWFyZ2luLWJvdHRvbTo4cHg7CiAgICB9CiAgICAucm91dGUtaXRlbS1pbmZvewogICAgICBmb250LXNpemU6MTNweDsKICAgICAgY29sb3I6dmFyKC0tbXV0ZWQpOwogICAgfQoKICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCl7CiAgICAgIC5hZGRyZXNzLXBhbmVsewogICAgICAgIGxlZnQ6MTBweDsKICAgICAgICByaWdodDoxMHB4OwogICAgICAgIGJvdHRvbToxMHB4OwogICAgICAgIG1heC13aWR0aDpub25lOwogICAgICB9CiAgICAgIC5yb3V0ZS1tb2RhbC1jb250ZW50ewogICAgICAgIHBhZGRpbmc6MjBweDsKICAgICAgfQogICAgICAucm9hZHZpZXctd3JhcHsKICAgICAgICBsZWZ0OjEwcHg7CiAgICAgICAgcmlnaHQ6MTBweDsKICAgICAgICBib3R0b206MTBweDsKICAgICAgICBoZWlnaHQ6NDV2aDsKICAgICAgfQogICAgICAubWFwLXRvb2xiYXJ7CiAgICAgICAgcmlnaHQ6MTBweDsKICAgICAgICB0b3A6MTBweDsKICAgICAgfQogICAgfQogIDwvc3R5bGU+CgogIDxzY3JpcHQgc3JjPSJodHRwczovL2RhcGkua2FrYW8uY29tL3YyL21hcHMvc2RrLmpzP2FwcGtleT1hZGQ0Y2U5M2IzOGMwZmY5ZDliOTA1MzcyOGUwNjdiMyZhdXRvbG9hZD1mYWxzZSZsaWJyYXJpZXM9c2VydmljZXMiPjwvc2NyaXB0Pgo8L2hlYWQ+Cgo8Ym9keT4KPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICA8ZGl2IGNsYXNzPSJoZWFkZXIiPgogICAgPGRpdiBjbGFzcz0iaGVhZGVyLWNvbnRlbnQiPgogICAgICA8ZGl2IGNsYXNzPSJjYW1wLWluZm8iPgogICAgICAgIDxkaXYgY2xhc3M9ImNhbXAtbmFtZSIgaWQ9ImNhbXBOYW1lIj7wn5ONIOuwsOyGoSDqtazsl60g7JWI64K0PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iY2FtcC1hZGRyZXNzIj4KICAgICAgICAgIDxzcGFuIGlkPSJjYW1wQWRkcmVzcyI+7KO87IaMIOygleuztCDroZzrlKkg7KSRLi4uPC9zcGFuPgogICAgICAgICAgPGJ1dHRvbiBjbGFzcz0iY29weS1idG4iIGlkPSJjb3B5QWRkcmVzc0J0biIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPvCfk4sg67O17IKsPC9idXR0b24+CiAgICAgICAgPC9kaXY+CiAgICAgIDwvZGl2PgoKICAgICAgPGRpdiBjbGFzcz0ibmF2aS1idXR0b25zIj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gcHJpbWFyeSIgaWQ9Im5hdmlUb0NhbXBCdG4iPgogICAgICAgICAg8J+nrSDtmITsnqzsnITsuZgg4oaSIOy6oO2UhOq5jOyngCDquLjssL7quLAKICAgICAgICA8L2J1dHRvbj4KCiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBpZD0ibmF2aVRvRGVsaXZlcnlCdG4iCiAgICAgICAgICBzdHlsZT0iYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMjJDNTVFIDAlLCAjMTZBMzRBIDEwMCUpOyBib3JkZXItY29sb3I6IzIyQzU1RTsgY29sb3I6I2ZmZjsiPgogICAgICAgICAg7Lqg7ZSEIOKGkiDrsLDshqHsp4Ag7Lm07Lm07Jik7KeA64+EIOyXsOuPmeKZqgogICAgICAgIDwvYnV0dG9uPgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2PgoKICA8ZGl2IGNsYXNzPSJyb3V0ZS1tb2RhbCIgaWQ9InJvdXRlTW9kYWwiPgogICAgPGRpdiBjbGFzcz0icm91dGUtbW9kYWwtY29udGVudCI+CiAgICAgIDxkaXYgY2xhc3M9InJvdXRlLW1vZGFsLXRpdGxlIiBpZD0icm91dGVNb2RhbFRpdGxlIj7rsLDshqHsp4Ag7ISg7YOdPC9kaXY+CiAgICAgIDxkaXYgaWQ9InJvdXRlTGlzdCI+PC9kaXY+CiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPGRpdiBjbGFzcz0ibWFwLWNvbnRhaW5lciI+CiAgICA8ZGl2IGlkPSJtYXAiPjwvZGl2PgoKICAgIDxkaXYgY2xhc3M9Im1hcC10b29sYmFyIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0idG9vbC1idG4iIGlkPSJtYXBUeXBlQnRuIj7wn5uwIOychOyEsTwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJ0b29sLWJ0biIgaWQ9InJvYWR2aWV3QnRuIj7wn6e/IOuhnOuTnOu3sDwvYnV0dG9uPgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0icm9hZHZpZXctd3JhcCIgaWQ9InJvYWR2aWV3V3JhcCI+CiAgICAgIDxkaXYgY2xhc3M9InJvYWR2aWV3LWhlYWRlciI+CiAgICAgICAgPGRpdj7wn6e/IOuhnOuTnOu3sCAo7KeA64+EIO2BtOumreycvOuhnCDsnITsuZgg67OA6rK9KTwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvYWR2aWV3LWFjdGlvbnMiPgogICAgICAgICAgPGJ1dHRvbiBjbGFzcz0icnYtbWluaS1idG4iIGlkPSJydlRvQ2VudGVyQnRuIj7wn5ONIOyngOuPhOykkeyLrDwvYnV0dG9uPgogICAgICAgICAgPGJ1dHRvbiBjbGFzcz0icnYtbWluaS1idG4iIGlkPSJydkNsb3NlQnRuIj7ri6vquLA8L2J1dHRvbj4KICAgICAgICA8L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InJ2LWhpbnQiIGlkPSJydkhpbnQiPuuhnOuTnOu3sOqwgCDsvJzsoLgg7J6I7Iq164uI64ukLiDsp4Drj4Tsl5DshJwg67O06rOgIOyLtuydgCDsp4DsoJDsnYQg7YOt7ZWY7IS47JqULjwvZGl2PgogICAgICA8ZGl2IGlkPSJyb2FkdmlldyI+PC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJsb2FkaW5nIiBpZD0ibG9hZGluZyI+CiAgICAgIDxkaXYgY2xhc3M9InNwaW5uZXIiPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJsb2FkaW5nLXRleHQiPuyngOuPhCDrjbDsnbTthLAg66Gc65SpIOykkS4uLjwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0iYWRkcmVzcy1wYW5lbCIgaWQ9ImFkZHJlc3NQYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWRlciI+8J+TpiDrsLDshqHsp4Ag66qp66GdPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImFkZHJlc3MtbGlzdCIgaWQ9ImFkZHJlc3NMaXN0Ij48L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2Pgo8L2Rpdj4KCjxzY3JpcHQ+CigoKSA9PiB7CiAgY29uc3QgQVBJX0JBU0UgPSAiaHR0cHM6Ly9yb3V0ZS5tYXJvb3dlbGwuY29tIjsKICBjb25zdCBST1VURV9FTkRQT0lOVCA9IGAke0FQSV9CQVNFfS9yb3V0ZWA7CiAgY29uc3QgQUREUkVTU19FTkRQT0lOVCA9IGAke0FQSV9CQVNFfS9hZGRyZXNzZXNgOwoKICBjb25zdCBCQVNFX1NIQVJFX1VSTCA9ICJodHRwczovL21hcm9vd2VsbC5jb20vc2hhcmUuaHRtbCI7CiAgY29uc3QgT0dfSU1BR0VfVVJMID0gImh0dHBzOi8vbWFyb293ZWxsLmNvbS9hc3NldHMvb2cvbWFyb293ZWxsLTEyMDB4NjMwLnBuZyI7CgogIGNvbnN0ICQgPSAoaWQpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTsKCiAgZnVuY3Rpb24gc2V0TWV0YShzZWxlY3RvciwgYXR0ciwgdmFsdWUpIHsKICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7CiAgICBpZiAoZWwpIGVsLnNldEF0dHJpYnV0ZShhdHRyLCB2YWx1ZSk7CiAgfQoKICBmdW5jdGlvbiBidWlsZFNoYXJlVXJsKCkgewogICAgY29uc3QgdXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTsKICAgIHVybC5oYXNoID0gIiI7CiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7CiAgfQoKICBmdW5jdGlvbiBidWlsZE1ldGFUaXRsZShjYW1wVmFsdWUsIGRpc3BsYXlOYW1lLCBkaXNwbGF5Q29kZSkgewogICAgbGV0IHRpdGxlID0gYCR7Y2FtcFZhbHVlfSAke2Rpc3BsYXlOYW1lfWAudHJpbSgpOwogICAgaWYgKGRpc3BsYXlDb2RlKSB0aXRsZSArPSBgICR7ZGlzcGxheUNvZGV9YDsKICAgIHJldHVybiB0aXRsZSB8fCAi67Cw7IahIOyngOuPhCDqs7XsnKAiOwogIH0KCiAgZnVuY3Rpb24gdXBkYXRlTWV0YVRhZ3ModGl0bGUsIGRlc2NyaXB0aW9uKSB7CiAgICBjb25zdCBzaGFyZVVybCA9IGJ1aWxkU2hhcmVVcmwoKTsKCiAgICBkb2N1bWVudC50aXRsZSA9IHRpdGxlOwoKICAgIHNldE1ldGEoJ21ldGFbbmFtZT0iZGVzY3JpcHRpb24iXScsICdjb250ZW50JywgZGVzY3JpcHRpb24pOwoKICAgIHNldE1ldGEoJ21ldGFbcHJvcGVydHk9Im9nOnR5cGUiXScsICdjb250ZW50JywgJ3dlYnNpdGUnKTsKICAgIHNldE1ldGEoJ21ldGFbcHJvcGVydHk9Im9nOnNpdGVfbmFtZSJdJywgJ2NvbnRlbnQnLCAnTWFyb293ZWxsJyk7CiAgICBzZXRNZXRhKCdtZXRhW3Byb3BlcnR5PSJvZzpsb2NhbGUiXScsICdjb250ZW50JywgJ2tvX0tSJyk7CiAgICBzZXRNZXRhKCdtZXRhW3Byb3BlcnR5PSJvZzp0aXRsZSJdJywgJ2NvbnRlbnQnLCB0aXRsZSk7CiAgICBzZXRNZXRhKCdtZXRhW3Byb3BlcnR5PSJvZzpkZXNjcmlwdGlvbiJdJywgJ2NvbnRlbnQnLCBkZXNjcmlwdGlvbik7CiAgICBzZXRNZXRhKCdtZXRhW3Byb3BlcnR5PSJvZzp1cmwiXScsICdjb250ZW50Jywgc2hhcmVVcmwpOwogICAgc2V0TWV0YSgnbWV0YVtwcm9wZXJ0eT0ib2c6aW1hZ2UiXScsICdjb250ZW50JywgT0dfSU1BR0VfVVJMKTsKICAgIHNldE1ldGEoJ21ldGFbcHJvcGVydHk9Im9nOmltYWdlOnVybCJdJywgJ2NvbnRlbnQnLCBPR19JTUFHRV9VUkwpOwogICAgc2V0TWV0YSgnbWV0YVtwcm9wZXJ0eT0ib2c6aW1hZ2U6c2VjdXJlX3VybCJdJywgJ2NvbnRlbnQnLCBPR19JTUFHRV9VUkwpOwogICAgc2V0TWV0YSgnbWV0YVtwcm9wZXJ0eT0ib2c6aW1hZ2U6dHlwZSJdJywgJ2NvbnRlbnQnLCAnaW1hZ2UvcG5nJyk7CiAgICBzZXRNZXRhKCdtZXRhW3Byb3BlcnR5PSJvZzppbWFnZTp3aWR0aCJdJywgJ2NvbnRlbnQnLCAnMTIwMCcpOwogICAgc2V0TWV0YSgnbWV0YVtwcm9wZXJ0eT0ib2c6aW1hZ2U6aGVpZ2h0Il0nLCAnY29udGVudCcsICc2MzAnKTsKICAgIHNldE1ldGEoJ21ldGFbcHJvcGVydHk9Im9nOmltYWdlOmFsdCJdJywgJ2NvbnRlbnQnLCB0aXRsZSk7CgogICAgc2V0TWV0YSgnbWV0YVtuYW1lPSJ0d2l0dGVyOmNhcmQiXScsICdjb250ZW50JywgJ3N1bW1hcnlfbGFyZ2VfaW1hZ2UnKTsKICAgIHNldE1ldGEoJ21ldGFbbmFtZT0idHdpdHRlcjp0aXRsZSJdJywgJ2NvbnRlbnQnLCB0aXRsZSk7CiAgICBzZXRNZXRhKCdtZXRhW25hbWU9InR3aXR0ZXI6ZGVzY3JpcHRpb24iXScsICdjb250ZW50JywgZGVzY3JpcHRpb24pOwogICAgc2V0TWV0YSgnbWV0YVtuYW1lPSJ0d2l0dGVyOnVybCJdJywgJ2NvbnRlbnQnLCBzaGFyZVVybCk7CiAgICBzZXRNZXRhKCdtZXRhW25hbWU9InR3aXR0ZXI6aW1hZ2UiXScsICdjb250ZW50JywgT0dfSU1BR0VfVVJMKTsKICAgIHNldE1ldGEoJ21ldGFbbmFtZT0idHdpdHRlcjppbWFnZTphbHQiXScsICdjb250ZW50JywgdGl0bGUpOwoKICAgIHNldE1ldGEoJ2xpbmtbcmVsPSJjYW5vbmljYWwiXScsICdocmVmJywgc2hhcmVVcmwpOwogIH0KCiAgY29uc3QgbG9hZGluZyA9ICQoImxvYWRpbmciKTsKICBjb25zdCBuYXZpVG9DYW1wQnRuID0gJCgibmF2aVRvQ2FtcEJ0biIpOwogIGNvbnN0IG5hdmlUb0RlbGl2ZXJ5QnRuID0gJCgibmF2aVRvRGVsaXZlcnlCdG4iKTsKICBjb25zdCBjYW1wTmFtZSA9ICQoImNhbXBOYW1lIik7CiAgY29uc3QgY2FtcEFkZHJlc3MgPSAkKCJjYW1wQWRkcmVzcyIpOwogIGNvbnN0IGNvcHlBZGRyZXNzQnRuID0gJCgiY29weUFkZHJlc3NCdG4iKTsKICBjb25zdCBhZGRyZXNzUGFuZWwgPSAkKCJhZGRyZXNzUGFuZWwiKTsKICBjb25zdCBhZGRyZXNzTGlzdCA9ICQoImFkZHJlc3NMaXN0Iik7CiAgY29uc3Qgcm91dGVNb2RhbCA9ICQoInJvdXRlTW9kYWwiKTsKICBjb25zdCByb3V0ZUxpc3QgPSAkKCJyb3V0ZUxpc3QiKTsKICBjb25zdCByb3V0ZU1vZGFsVGl0bGUgPSAkKCJyb3V0ZU1vZGFsVGl0bGUiKTsKCiAgY29uc3QgbWFwVHlwZUJ0biA9ICQoIm1hcFR5cGVCdG4iKTsKICBjb25zdCByb2Fkdmlld0J0biA9ICQoInJvYWR2aWV3QnRuIik7CiAgY29uc3Qgcm9hZHZpZXdXcmFwID0gJCgicm9hZHZpZXdXcmFwIik7CiAgY29uc3QgcnZDbG9zZUJ0biA9ICQoInJ2Q2xvc2VCdG4iKTsKICBjb25zdCBydlRvQ2VudGVyQnRuID0gJCgicnZUb0NlbnRlckJ0biIpOwogIGNvbnN0IHJ2SGludCA9ICQoInJ2SGludCIpOwoKICBsZXQgbWFwLCBnZW9jb2RlcjsKCiAgbGV0IHJvYWR2aWV3ID0gbnVsbDsKICBsZXQgcm9hZHZpZXdDbGllbnQgPSBudWxsOwogIGxldCByb2Fkdmlld1Zpc2libGUgPSBmYWxzZTsKICBsZXQgcm9hZHZpZXdNYXJrZXIgPSBudWxsOwogIGxldCBsYXN0Um9hZHZpZXdMYXRMbmcgPSBudWxsOwoKICBsZXQgaXNTYXRlbGxpdGUgPSBmYWxzZTsKCiAgbGV0IGFsbFJvdXRlcyA9IFtdOwogIGxldCByb3V0ZURhdGEgPSBudWxsOwogIGxldCBhZGRyZXNzUm93cyA9IFtdOwoKICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7CiAgY29uc3QgY2FtcCA9IHBhcmFtcy5nZXQoImNhbXAiKSB8fCAiIjsKICBjb25zdCBjb2RlID0gKHBhcmFtcy5nZXQoImNvZGUiKSB8fCAiIikucmVwbGFjZSgvJi4qJC8sICIiKS50cmltKCk7CgogIGNvbnN0IENPTE9SX1BBTEVUVEUgPSBbCiAgICAiIzAwQzJGRiIsICIjRkY0RDZEIiwgIiNGRkQxNjYiLCAiIzA2RDZBMCIsICIjQTc4QkZBIiwKICAgICIjRjk3MzE2IiwgIiMyMkM1NUUiLCAiI0UxMUQ0OCIsICIjM0I4MkY2IiwgIiNGNTlFMEIiCiAgXTsKCiAgZnVuY3Rpb24gaGFzaENvZGUoc3RyKSB7CiAgICBsZXQgaCA9IDA7CiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykgewogICAgICBoID0gKGggPDwgNSkgLSBoICsgc3RyLmNoYXJDb2RlQXQoaSk7CiAgICAgIGggfD0gMDsKICAgIH0KICAgIHJldHVybiBNYXRoLmFicyhoKTsKICB9CgogIGZ1bmN0aW9uIGNvbG9yRm9yKGNvZGUpIHsKICAgIHJldHVybiBDT0xPUl9QQUxFVFRFW2hhc2hDb2RlKGNvZGUpICUgQ09MT1JfUEFMRVRURS5sZW5ndGhdOwogIH0KCiAgYXN5bmMgZnVuY3Rpb24gYXBpR2V0KHVybCkgewogICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2godXJsLCB7IG1ldGhvZDogIkdFVCIgfSk7CiAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzLnRleHQoKTsKICAgIGxldCBqc29uID0gbnVsbDsKICAgIHRyeSB7IGpzb24gPSB0ZXh0ID8gSlNPTi5wYXJzZSh0ZXh0KSA6IG51bGw7IH0gY2F0Y2gge30KICAgIGlmICghcmVzLm9rKSB7CiAgICAgIGNvbnN0IG1zZyA9IGpzb24/LmVycm9yIHx8IHRleHQgfHwgYEhUVFAgJHtyZXMuc3RhdHVzfWA7CiAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpOwogICAgfQogICAgcmV0dXJuIGpzb247CiAgfQoKICBmdW5jdGlvbiBwYXJzZVBvbHlnb25XZ3M4NCh2KSB7CiAgICBpZiAoIXYpIHJldHVybiBudWxsOwogICAgaWYgKEFycmF5LmlzQXJyYXkodikpIHJldHVybiB2OwogICAgaWYgKHR5cGVvZiB2ID09PSAic3RyaW5nIikgewogICAgICB0cnkgewogICAgICAgIGNvbnN0IHAgPSBKU09OLnBhcnNlKHYpOwogICAgICAgIGlmIChBcnJheS5pc0FycmF5KHApKSByZXR1cm4gcDsKICAgICAgfSBjYXRjaCAoZSkge30KICAgIH0KICAgIHJldHVybiBudWxsOwogIH0KCiAgZnVuY3Rpb24gY2VudHJvaWRPZkxhdExuZ3MobGF0bG5ncykgewogICAgbGV0IGxhdFN1bSA9IDAsIGxuZ1N1bSA9IDA7CiAgICBmb3IgKGNvbnN0IGxsIG9mIGxhdGxuZ3MpIHsKICAgICAgbGF0U3VtICs9IGxsLmdldExhdCgpOwogICAgICBsbmdTdW0gKz0gbGwuZ2V0TG5nKCk7CiAgICB9CiAgICByZXR1cm4gbmV3IGtha2FvLm1hcHMuTGF0TG5nKGxhdFN1bSAvIGxhdGxuZ3MubGVuZ3RoLCBsbmdTdW0gLyBsYXRsbmdzLmxlbmd0aCk7CiAgfQoKICBmdW5jdGlvbiBjcmVhdGVMYWJlbCh0ZXh0LCBwb3NpdGlvbiwgY29sb3IpIHsKICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgiZGl2Iik7CiAgICBlbC5jbGFzc05hbWUgPSAicm91dGUtbGFiZWwiOwogICAgZWwuc3R5bGUuYm9yZGVyQ29sb3IgPSBjb2xvcjsKICAgIGVsLnN0eWxlLmJhY2tncm91bmQgPSBgbGluZWFyLWdyYWRpZW50KDEzNWRlZywgJHtjb2xvcn0xNCwgJHtjb2xvcn0yNilgOwogICAgZWwuaW5uZXJIVE1MID0gYPCfk6YgJHt0ZXh0fWA7CgogICAgcmV0dXJuIG5ldyBrYWthby5tYXBzLkN1c3RvbU92ZXJsYXkoewogICAgICBwb3NpdGlvbiwKICAgICAgY29udGVudDogZWwsCiAgICAgIHlBbmNob3I6IDAuNSwKICAgICAgekluZGV4OiAxMAogICAgfSk7CiAgfQoKICBmdW5jdGlvbiBleHRyYWN0UmluZ0xhdExuZ3MocG9seSkgewogICAgaWYgKCFwb2x5KSByZXR1cm4gW107CiAgICBjb25zdCBmaXJzdCA9IHBvbHlbMF07CiAgICBsZXQgcmluZyA9IG51bGw7CgogICAgaWYgKGZpcnN0ICYmIHR5cGVvZiBmaXJzdCA9PT0gIm9iamVjdCIgJiYgImxhdCIgaW4gZmlyc3QgJiYgImxuZyIgaW4gZmlyc3QpIHsKICAgICAgcmluZyA9IHBvbHk7CiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmlyc3QpKSB7CiAgICAgIGNvbnN0IGZpcnN0T2ZGaXJzdCA9IGZpcnN0WzBdOwoKICAgICAgaWYgKGZpcnN0T2ZGaXJzdCAmJiB0eXBlb2YgZmlyc3RPZkZpcnN0ID09PSAib2JqZWN0IiAmJiAibGF0IiBpbiBmaXJzdE9mRmlyc3QgJiYgImxuZyIgaW4gZmlyc3RPZkZpcnN0KSB7CiAgICAgICAgcmluZyA9IGZpcnN0OwogICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmlyc3RPZkZpcnN0KSAmJiBmaXJzdE9mRmlyc3QubGVuZ3RoID49IDIpIHsKICAgICAgICByaW5nID0gZmlyc3Q7CiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpcnN0T2ZGaXJzdCA9PT0gIm51bWJlciIpIHsKICAgICAgICByaW5nID0gcG9seTsKICAgICAgfQogICAgfQoKICAgIGlmICghQXJyYXkuaXNBcnJheShyaW5nKSkgcmV0dXJuIFtdOwoKICAgIHJldHVybiByaW5nLm1hcChwdCA9PiB7CiAgICAgIGlmIChwdCAmJiB0eXBlb2YgcHQgPT09ICJvYmplY3QiICYmICJsYXQiIGluIHB0ICYmICJsbmciIGluIHB0KSB7CiAgICAgICAgcmV0dXJuIHsgbGF0OiBOdW1iZXIocHQubGF0KSwgbG5nOiBOdW1iZXIocHQubG5nKSB9OwogICAgICB9CiAgICAgIGlmIChBcnJheS5pc0FycmF5KHB0KSAmJiBwdC5sZW5ndGggPj0gMikgewogICAgICAgIHJldHVybiB7IGxhdDogTnVtYmVyKHB0WzFdKSwgbG5nOiBOdW1iZXIocHRbMF0pIH07CiAgICAgIH0KICAgICAgcmV0dXJuIG51bGw7CiAgICB9KS5maWx0ZXIodiA9PiB2ICYmIGlzRmluaXRlKHYubGF0KSAmJiBpc0Zpbml0ZSh2LmxuZykpOwogIH0KCiAgZnVuY3Rpb24gY2VudHJvaWRMYXRMbmdPZlBvbHlnb25XZ3M4NChwb2x5Z29uX3dnczg0KSB7CiAgICBjb25zdCBwb2x5ID0gcGFyc2VQb2x5Z29uV2dzODQocG9seWdvbl93Z3M4NCk7CiAgICBpZiAoIXBvbHkpIHJldHVybiBudWxsOwoKICAgIGNvbnN0IHJpbmcgPSBleHRyYWN0UmluZ0xhdExuZ3MocG9seSk7CiAgICBpZiAoIXJpbmcgfHwgcmluZy5sZW5ndGggPCAzKSByZXR1cm4gbnVsbDsKCiAgICBsZXQgbGF0U3VtID0gMCwgbG5nU3VtID0gMDsKICAgIGZvciAoY29uc3QgcCBvZiByaW5nKSB7CiAgICAgIGxhdFN1bSArPSBwLmxhdDsKICAgICAgbG5nU3VtICs9IHAubG5nOwogICAgfQogICAgcmV0dXJuIHsgbGF0OiBsYXRTdW0gLyByaW5nLmxlbmd0aCwgbG5nOiBsbmdTdW0gLyByaW5nLmxlbmd0aCB9OwogIH0KCiAgZnVuY3Rpb24gZHJhd1BvbHlnb25zKHJvd3MpIHsKICAgIGlmICghcm93cyB8fCByb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuOwoKICAgIGNvbnN0IGJvdW5kcyA9IG5ldyBrYWthby5tYXBzLkxhdExuZ0JvdW5kcygpOwogICAgbGV0IGhhc1BvbHlnb24gPSBmYWxzZTsKCiAgICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7CiAgICAgIGNvbnN0IGZ1bGxDb2RlID0gcm93LmZ1bGxfY29kZSB8fCByb3cuY29kZSB8fCAiIjsKICAgICAgY29uc3QgY29sb3IgPSByb3cuY29sb3IgfHwgY29sb3JGb3IoZnVsbENvZGUpOwogICAgICBjb25zdCBwb2x5ID0gcGFyc2VQb2x5Z29uV2dzODQocm93LnBvbHlnb25fd2dzODQpOwoKICAgICAgaWYgKCFwb2x5IHx8ICFBcnJheS5pc0FycmF5KHBvbHkpIHx8IHBvbHkubGVuZ3RoID09PSAwKSBjb250aW51ZTsKCiAgICAgIGxldCByaW5ncyA9IFtdOwogICAgICBjb25zdCBmaXJzdCA9IHBvbHlbMF07CgogICAgICBpZiAoZmlyc3QgJiYgdHlwZW9mIGZpcnN0ID09PSAib2JqZWN0IiAmJiAibGF0IiBpbiBmaXJzdCAmJiAibG5nIiBpbiBmaXJzdCkgewogICAgICAgIHJpbmdzID0gW3BvbHldOwogICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmlyc3QpKSB7CiAgICAgICAgY29uc3QgZmlyc3RPZkZpcnN0ID0gZmlyc3RbMF07CiAgICAgICAgaWYgKGZpcnN0T2ZGaXJzdCAmJiB0eXBlb2YgZmlyc3RPZkZpcnN0ID09PSAib2JqZWN0IiAmJiAibGF0IiBpbiBmaXJzdE9mRmlyc3QgJiYgImxuZyIgaW4gZmlyc3RPZkZpcnN0KSB7CiAgICAgICAgICByaW5ncyA9IHBvbHk7CiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpcnN0T2ZGaXJzdCkgJiYgZmlyc3RPZkZpcnN0Lmxlbmd0aCA+PSAyKSB7CiAgICAgICAgICByaW5ncyA9IHBvbHk7CiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmlyc3RPZkZpcnN0ID09PSAibnVtYmVyIikgewogICAgICAgICAgcmluZ3MgPSBbcG9seV07CiAgICAgICAgfQogICAgICB9CgogICAgICBmb3IgKGNvbnN0IHJpbmcgb2YgcmluZ3MpIHsKICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocmluZykgfHwgcmluZy5sZW5ndGggPCAzKSBjb250aW51ZTsKCiAgICAgICAgY29uc3QgbGF0bG5ncyA9IHJpbmcubWFwKHB0ID0+IHsKICAgICAgICAgIGlmIChwdCAmJiB0eXBlb2YgcHQgPT09ICJvYmplY3QiICYmICJsYXQiIGluIHB0ICYmICJsbmciIGluIHB0KSB7CiAgICAgICAgICAgIHJldHVybiBuZXcga2FrYW8ubWFwcy5MYXRMbmcocHQubGF0LCBwdC5sbmcpOwogICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHB0KSAmJiBwdC5sZW5ndGggPj0gMikgewogICAgICAgICAgICByZXR1cm4gbmV3IGtha2FvLm1hcHMuTGF0TG5nKHB0WzFdLCBwdFswXSk7CiAgICAgICAgICB9CiAgICAgICAgICByZXR1cm4gbnVsbDsKICAgICAgICB9KS5maWx0ZXIobGwgPT4gbGwgIT09IG51bGwpOwoKICAgICAgICBpZiAobGF0bG5ncy5sZW5ndGggPCAzKSBjb250aW51ZTsKCiAgICAgICAgY29uc3QgcG9seWdvbiA9IG5ldyBrYWthby5tYXBzLlBvbHlnb24oewogICAgICAgICAgcGF0aDogbGF0bG5ncywKICAgICAgICAgIHN0cm9rZVdlaWdodDogMiwKICAgICAgICAgIHN0cm9rZUNvbG9yOiBjb2xvciwKICAgICAgICAgIHN0cm9rZU9wYWNpdHk6IDEuMCwKICAgICAgICAgIHN0cm9rZVN0eWxlOiAic29saWQiLAogICAgICAgICAgZmlsbENvbG9yOiBjb2xvciwKICAgICAgICAgIGZpbGxPcGFjaXR5OiAwLjIwLAogICAgICAgICAgekluZGV4OiAxCiAgICAgICAgfSk7CiAgICAgICAgcG9seWdvbi5zZXRNYXAobWFwKTsKCiAgICAgICAgY29uc3QgY2VudGVyID0gY2VudHJvaWRPZkxhdExuZ3MobGF0bG5ncyk7CiAgICAgICAgY29uc3QgbGFiZWwgPSBjcmVhdGVMYWJlbChmdWxsQ29kZSwgY2VudGVyLCBjb2xvcik7CiAgICAgICAgbGFiZWwuc2V0TWFwKG1hcCk7CgogICAgICAgIGxhdGxuZ3MuZm9yRWFjaChsbCA9PiBib3VuZHMuZXh0ZW5kKGxsKSk7CiAgICAgICAgaGFzUG9seWdvbiA9IHRydWU7CiAgICAgIH0KICAgIH0KCiAgICBpZiAoaGFzUG9seWdvbikgewogICAgICBtYXAuc2V0Qm91bmRzKGJvdW5kcyk7CiAgICB9CiAgfQoKICBmdW5jdGlvbiByZW5kZXJBZGRyZXNzTGlzdCgpIHsKICAgIGlmICghYWRkcmVzc1Jvd3MgfHwgYWRkcmVzc1Jvd3MubGVuZ3RoID09PSAwKSB7CiAgICAgIGFkZHJlc3NQYW5lbC5jbGFzc0xpc3QucmVtb3ZlKCJ2aXNpYmxlIik7CiAgICAgIHJldHVybjsKICAgIH0KCiAgICBhZGRyZXNzUGFuZWwuY2xhc3NMaXN0LmFkZCgidmlzaWJsZSIpOwogICAgYWRkcmVzc0xpc3QuaW5uZXJIVE1MID0gIiI7CgogICAgYWRkcmVzc1Jvd3MuZm9yRWFjaCgoYWRkciwgaWR4KSA9PiB7CiAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCJkaXYiKTsKICAgICAgaXRlbS5jbGFzc05hbWUgPSAiYWRkcmVzcy1pdGVtIjsKCiAgICAgIGNvbnN0IGFkZHJlc3NUZXh0ID0gYWRkci5hZGRyZXNzIHx8IGFkZHIuZnVsbF9hZGRyZXNzIHx8ICLso7zshowg7JeG7J2MIjsKICAgICAgY29uc3QgZG9uZyA9IGFkZHIuZG9uZyA/IGAoJHthZGRyLmRvbmd9KWAgOiAiIjsKICAgICAgY29uc3QgemlwY29kZSA9IGFkZHIuemlwY29kZSA/IGDsmrDtjrjrsojtmLg6ICR7YWRkci56aXBjb2RlfWAgOiAiIjsKCiAgICAgIGl0ZW0uaW5uZXJIVE1MID0gYAogICAgICAgIDxkaXYgY2xhc3M9ImFkZHJlc3MtaW5mbyI+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJhZGRyZXNzLXRleHQiPiR7aWR4ICsgMX0uICR7YWRkcmVzc1RleHR9ICR7ZG9uZ308L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9ImFkZHJlc3MtbWV0YSI+JHt6aXBjb2RlfTwvZGl2PgogICAgICAgIDwvZGl2PgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biI+8J+alyDquLjssL7quLA8L2J1dHRvbj4KICAgICAgYDsKCiAgICAgIGNvbnN0IGJ0biA9IGl0ZW0ucXVlcnlTZWxlY3RvcigiYnV0dG9uIik7CiAgICAgIGJ0bi5vbmNsaWNrID0gKCkgPT4gb3Blbk5hdmlUb0FkZHJlc3MoYWRkcik7CgogICAgICBhZGRyZXNzTGlzdC5hcHBlbmRDaGlsZChpdGVtKTsKICAgIH0pOwogIH0KCiAgcm91dGVNb2RhbC5vbmNsaWNrID0gKGUpID0+IHsKICAgIGlmIChlLnRhcmdldCA9PT0gcm91dGVNb2RhbCkgewogICAgICByb3V0ZU1vZGFsLmNsYXNzTGlzdC5yZW1vdmUoInZpc2libGUiKTsKICAgIH0KICB9OwoKICBmdW5jdGlvbiBnZW9jb2RlQXN5bmMoYWRkcmVzcykgewogICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHsKICAgICAgZ2VvY29kZXIuYWRkcmVzc1NlYXJjaChhZGRyZXNzLCAocmVzdWx0LCBzdGF0dXMpID0+IHsKICAgICAgICBpZiAoc3RhdHVzICE9PSBrYWthby5tYXBzLnNlcnZpY2VzLlN0YXR1cy5PSyB8fCAhcmVzdWx0Py5sZW5ndGgpIHsKICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoIuyjvOyGjOulvCDssL7snYQg7IiYIOyXhuyKteuLiOuLpC4iKSk7CiAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICAgIHJlc29sdmUoeyBsYXQ6IE51bWJlcihyZXN1bHRbMF0ueSksIGxuZzogTnVtYmVyKHJlc3VsdFswXS54KSB9KTsKICAgICAgfSk7CiAgICB9KTsKICB9CgogIGFzeW5jIGZ1bmN0aW9uIGdldENhbXBMYXRMbmcoKSB7CiAgICBpZiAoIXJvdXRlRGF0YSkgdGhyb3cgbmV3IEVycm9yKCLsuqDtlIQg642w7J207YSw6rCAIOyXhuyKteuLiOuLpC4iKTsKCiAgICBjb25zdCBsYXQgPQogICAgICBOdW1iZXIocm91dGVEYXRhLmRlbGl2ZXJ5X2xvY2F0aW9uX2xhdCA/PyByb3V0ZURhdGEuZGVsaXZlcnlfbGF0ID8/IHJvdXRlRGF0YS5sYXQgPz8gcm91dGVEYXRhLnkpOwogICAgY29uc3QgbG5nID0KICAgICAgTnVtYmVyKHJvdXRlRGF0YS5kZWxpdmVyeV9sb2NhdGlvbl9sbmcgPz8gcm91dGVEYXRhLmRlbGl2ZXJ5X2xuZyA/PyByb3V0ZURhdGEubG5nID8/IHJvdXRlRGF0YS54KTsKCiAgICBpZiAoaXNGaW5pdGUobGF0KSAmJiBpc0Zpbml0ZShsbmcpKSByZXR1cm4geyBsYXQsIGxuZyB9OwoKICAgIGNvbnN0IGFkZHIgPSByb3V0ZURhdGEuZGVsaXZlcnlfbG9jYXRpb25fYWRkcmVzczsKICAgIGlmICghYWRkcikgdGhyb3cgbmV3IEVycm9yKCLsuqDtlIQg7KO87IaM6rCAIOyXhuyKteuLiOuLpC4iKTsKICAgIHJldHVybiBhd2FpdCBnZW9jb2RlQXN5bmMoYWRkcik7CiAgfQoKICBmdW5jdGlvbiBvcGVuS2FrYW9Sb3V0ZSh7IHNwLCBlcCwgc3BOYW1lLCBlcE5hbWUgfSkgewogICAgY29uc3QgaXNNb2JpbGUgPSAvaVBob25lfGlQYWR8aVBvZHxBbmRyb2lkL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTsKCiAgICBpZiAoaXNNb2JpbGUpIHsKICAgICAgbGV0IHVybCA9IGBrYWthb21hcDovL3JvdXRlP2J5PUNBUmA7CiAgICAgIGlmIChzcCkgdXJsICs9IGAmc3A9JHtzcC5sYXR9LCR7c3AubG5nfWA7CiAgICAgIGlmIChlcCkgdXJsICs9IGAmZXA9JHtlcC5sYXR9LCR7ZXAubG5nfWA7CiAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdXJsOwogICAgICByZXR1cm47CiAgICB9CgogICAgaWYgKHNwICYmIGVwKSB7CiAgICAgIGNvbnN0IHVybCA9CiAgICAgICAgYGh0dHBzOi8vbWFwLmtha2FvLmNvbS9saW5rL2Zyb20vJHtlbmNvZGVVUklDb21wb25lbnQoc3BOYW1lIHx8ICLstpzrsJwiKX0sJHtzcC5sYXR9LCR7c3AubG5nfWAgKwogICAgICAgIGAvdG8vJHtlbmNvZGVVUklDb21wb25lbnQoZXBOYW1lIHx8ICLrj4TssKkiKX0sJHtlcC5sYXR9LCR7ZXAubG5nfWA7CiAgICAgIHdpbmRvdy5vcGVuKHVybCwgIl9ibGFuayIpOwogICAgfSBlbHNlIGlmIChlcCkgewogICAgICBjb25zdCB1cmwgPQogICAgICAgIGBodHRwczovL21hcC5rYWthby5jb20vbGluay90by8ke2VuY29kZVVSSUNvbXBvbmVudChlcE5hbWUgfHwgIuuqqeyggeyngCIpfSwke2VwLmxhdH0sJHtlcC5sbmd9YDsKICAgICAgd2luZG93Lm9wZW4odXJsLCAiX2JsYW5rIik7CiAgICB9CiAgfQoKICBhc3luYyBmdW5jdGlvbiBvcGVuTmF2aUN1cnJlbnRUb0NhbXAoKSB7CiAgICB0cnkgewogICAgICBjb25zdCBjYW1wTGF0TG5nID0gYXdhaXQgZ2V0Q2FtcExhdExuZygpOwogICAgICBjb25zdCBlcE5hbWUgPSByb3V0ZURhdGE/LmRlbGl2ZXJ5X2xvY2F0aW9uX25hbWUgfHwgY2FtcCB8fCAi7Lqg7ZSEIjsKICAgICAgb3Blbktha2FvUm91dGUoeyBlcDogY2FtcExhdExuZywgZXBOYW1lIH0pOwogICAgfSBjYXRjaCAoZSkgewogICAgICBhbGVydCgi7Lqg7ZSEIOq4uOywvuq4sCDsi6TtjKg6ICIgKyBlLm1lc3NhZ2UpOwogICAgfQogIH0KCiAgZnVuY3Rpb24gc2hvd1N1YnJvdXRlTW9kYWxGb3JEZWxpdmVyeSgpIHsKICAgIGlmICghYWxsUm91dGVzIHx8IGFsbFJvdXRlcy5sZW5ndGggPT09IDApIHsKICAgICAgYWxlcnQoIuudvOyasO2KuCDsoJXrs7TqsIAg7JeG7Iq164uI64ukLiIpOwogICAgICByZXR1cm47CiAgICB9CgogICAgaWYgKGFsbFJvdXRlcy5sZW5ndGggPT09IDEpIHsKICAgICAgb3Blbk5hdmlDYW1wVG9TdWJyb3V0ZShhbGxSb3V0ZXNbMF0pOwogICAgICByZXR1cm47CiAgICB9CgogICAgcm91dGVNb2RhbFRpdGxlLnRleHRDb250ZW50ID0gIuuwsOyGoeyngCDshKDtg50o7ISc67iM65287Jqw7Yq4KSI7CiAgICByb3V0ZUxpc3QuaW5uZXJIVE1MID0gIiI7CgogICAgYWxsUm91dGVzLmZvckVhY2goKHIsIGlkeCkgPT4gewogICAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgiZGl2Iik7CiAgICAgIGl0ZW0uY2xhc3NOYW1lID0gInJvdXRlLWl0ZW0iOwoKICAgICAgY29uc3Qgcm91dGVDb2RlID0gci5mdWxsX2NvZGUgfHwgci5jb2RlIHx8IGDshJzruIzrnbzsmrDtirggJHtpZHggKyAxfWA7CiAgICAgIGNvbnN0IGluZm8xID0gIuy6oO2UhCDihpIg7ISg7YOdIOq1rOyXrSDspJHsi6wo7KKM7ZGcKSDquLjssL7quLAiOwoKICAgICAgaXRlbS5pbm5lckhUTUwgPSBgCiAgICAgICAgPGRpdiBjbGFzcz0icm91dGUtaXRlbS1jb2RlIj4ke3JvdXRlQ29kZX08L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3V0ZS1pdGVtLWluZm8iPiR7aW5mbzF9PC9kaXY+CiAgICAgIGA7CgogICAgICBpdGVtLm9uY2xpY2sgPSAoKSA9PiB7CiAgICAgICAgcm91dGVNb2RhbC5jbGFzc0xpc3QucmVtb3ZlKCJ2aXNpYmxlIik7CiAgICAgICAgb3Blbk5hdmlDYW1wVG9TdWJyb3V0ZShyKTsKICAgICAgfTsKCiAgICAgIHJvdXRlTGlzdC5hcHBlbmRDaGlsZChpdGVtKTsKICAgIH0pOwoKICAgIHJvdXRlTW9kYWwuY2xhc3NMaXN0LmFkZCgidmlzaWJsZSIpOwogIH0KCiAgYXN5bmMgZnVuY3Rpb24gb3Blbk5hdmlDYW1wVG9TdWJyb3V0ZShyb3V0ZSkgewogICAgdHJ5IHsKICAgICAgY29uc3Qgc3AgPSBhd2FpdCBnZXRDYW1wTGF0TG5nKCk7CiAgICAgIGNvbnN0IHNwTmFtZSA9IHJvdXRlRGF0YT8uZGVsaXZlcnlfbG9jYXRpb25fbmFtZSB8fCBjYW1wIHx8ICLsuqDtlIQiOwoKICAgICAgY29uc3QgbGF0ID0KICAgICAgICBOdW1iZXIocm91dGUuZGVsaXZlcnlfbGF0ID8/IHJvdXRlLmRlbGl2ZXJ5X2xvY2F0aW9uX2xhdCA/PyByb3V0ZS5sYXQgPz8gcm91dGUueSk7CiAgICAgIGNvbnN0IGxuZyA9CiAgICAgICAgTnVtYmVyKHJvdXRlLmRlbGl2ZXJ5X2xuZyA/PyByb3V0ZS5kZWxpdmVyeV9sb2NhdGlvbl9sbmcgPz8gcm91dGUubG5nID8/IHJvdXRlLngpOwoKICAgICAgbGV0IGVwID0gbnVsbDsKICAgICAgaWYgKGlzRmluaXRlKGxhdCkgJiYgaXNGaW5pdGUobG5nKSkgewogICAgICAgIGVwID0geyBsYXQsIGxuZyB9OwogICAgICB9IGVsc2UgewogICAgICAgIGVwID0gY2VudHJvaWRMYXRMbmdPZlBvbHlnb25XZ3M4NChyb3V0ZS5wb2x5Z29uX3dnczg0KTsKICAgICAgfQoKICAgICAgaWYgKCFlcCkgdGhyb3cgbmV3IEVycm9yKCLshJzruIzrnbzsmrDtirgg67Cw7Iah7KeAIOyijO2RnOulvCDrp4zrk6Qg7IiYIOyXhuyKteuLiOuLpC4iKTsKCiAgICAgIGNvbnN0IGVwTmFtZSA9IHJvdXRlLmZ1bGxfY29kZSB8fCByb3V0ZS5jb2RlIHx8ICLrsLDshqHsp4AiOwogICAgICBvcGVuS2FrYW9Sb3V0ZSh7IHNwLCBlcCwgc3BOYW1lLCBlcE5hbWUgfSk7CiAgICB9IGNhdGNoIChlKSB7CiAgICAgIGFsZXJ0KCLrsLDshqHsp4Ag7Jew64+ZIOyLpO2MqDogIiArIGUubWVzc2FnZSk7CiAgICB9CiAgfQoKICBmdW5jdGlvbiBvcGVuTmF2aVRvQWRkcmVzcyhhZGRyKSB7CiAgICBpZiAoIXJvdXRlRGF0YSkgewogICAgICBhbGVydCgi7Lqg7ZSEIOuNsOydtO2EsCDroZzrlKkg7KSR7J6F64uI64ukLiIpOwogICAgICByZXR1cm47CiAgICB9CgogICAgY29uc3QgYWRkcmVzc1RleHQgPSBhZGRyLmFkZHJlc3MgfHwgYWRkci5mdWxsX2FkZHJlc3M7CgogICAgY29uc3QgZW5kTGF0ID0gTnVtYmVyKGFkZHIubGF0ID8/IGFkZHIubGF0aXR1ZGUgPz8gYWRkci55KTsKICAgIGNvbnN0IGVuZExuZyA9IE51bWJlcihhZGRyLmxuZyA/PyBhZGRyLmxvbmdpdHVkZSA/PyBhZGRyLngpOwoKICAgIChhc3luYyAoKSA9PiB7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3Qgc3AgPSBhd2FpdCBnZXRDYW1wTGF0TG5nKCk7CiAgICAgICAgY29uc3Qgc3BOYW1lID0gcm91dGVEYXRhPy5kZWxpdmVyeV9sb2NhdGlvbl9uYW1lIHx8IGNhbXAgfHwgIuy6oO2UhCI7CgogICAgICAgIGlmIChpc0Zpbml0ZShlbmRMYXQpICYmIGlzRmluaXRlKGVuZExuZykpIHsKICAgICAgICAgIG9wZW5LYWthb1JvdXRlKHsKICAgICAgICAgICAgc3AsCiAgICAgICAgICAgIGVwOiB7IGxhdDogZW5kTGF0LCBsbmc6IGVuZExuZyB9LAogICAgICAgICAgICBzcE5hbWUsCiAgICAgICAgICAgIGVwTmFtZTogYWRkcmVzc1RleHQgfHwgIuuwsOyGoeyngCIKICAgICAgICAgIH0pOwogICAgICAgICAgcmV0dXJuOwogICAgICAgIH0KCiAgICAgICAgaWYgKCFhZGRyZXNzVGV4dCkgdGhyb3cgbmV3IEVycm9yKCLrsLDshqHsp4Ag7KO87IaMIOygleuztOqwgCDsl4bsirXri4jri6QuIik7CiAgICAgICAgY29uc3QgZXAgPSBhd2FpdCBnZW9jb2RlQXN5bmMoYWRkcmVzc1RleHQpOwoKICAgICAgICBvcGVuS2FrYW9Sb3V0ZSh7CiAgICAgICAgICBzcCwKICAgICAgICAgIGVwLAogICAgICAgICAgc3BOYW1lLAogICAgICAgICAgZXBOYW1lOiBhZGRyZXNzVGV4dAogICAgICAgIH0pOwogICAgICB9IGNhdGNoIChlKSB7CiAgICAgICAgYWxlcnQoIuq4uOywvuq4sCDsi6TtjKg6ICIgKyBlLm1lc3NhZ2UpOwogICAgICB9CiAgICB9KSgpOwogIH0KCiAgZnVuY3Rpb24gdG9nZ2xlU2F0ZWxsaXRlKCkgewogICAgaXNTYXRlbGxpdGUgPSAhaXNTYXRlbGxpdGU7CgogICAgaWYgKGlzU2F0ZWxsaXRlKSB7CiAgICAgIG1hcC5zZXRNYXBUeXBlSWQoa2FrYW8ubWFwcy5NYXBUeXBlSWQuSFlCUklEKTsKICAgICAgbWFwVHlwZUJ0bi50ZXh0Q29udGVudCA9ICLwn5e6IOydvOuwmCI7CiAgICAgIG1hcFR5cGVCdG4uY2xhc3NMaXN0LmFkZCgib24iKTsKICAgIH0gZWxzZSB7CiAgICAgIG1hcC5zZXRNYXBUeXBlSWQoa2FrYW8ubWFwcy5NYXBUeXBlSWQuUk9BRE1BUCk7CiAgICAgIG1hcFR5cGVCdG4udGV4dENvbnRlbnQgPSAi8J+bsCDsnITshLEiOwogICAgICBtYXBUeXBlQnRuLmNsYXNzTGlzdC5yZW1vdmUoIm9uIik7CiAgICB9CiAgfQoKICBmdW5jdGlvbiBlbnN1cmVSb2FkdmlldygpIHsKICAgIGlmIChyb2FkdmlldyAmJiByb2Fkdmlld0NsaWVudCkgcmV0dXJuOwoKICAgIHJvYWR2aWV3Q2xpZW50ID0gbmV3IGtha2FvLm1hcHMuUm9hZHZpZXdDbGllbnQoKTsKICAgIHJvYWR2aWV3ID0gbmV3IGtha2FvLm1hcHMuUm9hZHZpZXcoJCgicm9hZHZpZXciKSk7CgogICAgcm9hZHZpZXdNYXJrZXIgPSBuZXcga2FrYW8ubWFwcy5NYXJrZXIoewogICAgICBwb3NpdGlvbjogbWFwLmdldENlbnRlcigpCiAgICB9KTsKICB9CgogIGZ1bmN0aW9uIHNob3dSb2Fkdmlld0hpbnQob24pIHsKICAgIHJ2SGludC5jbGFzc0xpc3QudG9nZ2xlKCJ2aXNpYmxlIiwgISFvbik7CiAgfQoKICBmdW5jdGlvbiBzZXRSb2Fkdmlld0F0KGxhdGxuZykgewogICAgZW5zdXJlUm9hZHZpZXcoKTsKCiAgICBsYXN0Um9hZHZpZXdMYXRMbmcgPSBsYXRsbmc7CgogICAgcm9hZHZpZXdDbGllbnQuZ2V0TmVhcmVzdFBhbm9JZChsYXRsbmcsIDUwLCAocGFub0lkKSA9PiB7CiAgICAgIGlmICghcGFub0lkKSB7CiAgICAgICAgYWxlcnQoIuydtCDsnITsuZgg6re87LKY7JeQIOuhnOuTnOu3sOqwgCDsl4bsirXri4jri6QuICjsobDquIgg64uk66W4IOyngOygkOydhCDriIzrn6zrs7TshLjsmpQpIik7CiAgICAgICAgcmV0dXJuOwogICAgICB9CiAgICAgIHJvYWR2aWV3LnNldFBhbm9JZChwYW5vSWQsIGxhdGxuZyk7CiAgICAgIHJvYWR2aWV3TWFya2VyLnNldFBvc2l0aW9uKGxhdGxuZyk7CiAgICAgIHJvYWR2aWV3TWFya2VyLnNldE1hcChtYXApOwogICAgfSk7CiAgfQoKICBmdW5jdGlvbiB0b2dnbGVSb2FkdmlldygpIHsKICAgIHJvYWR2aWV3VmlzaWJsZSA9ICFyb2Fkdmlld1Zpc2libGU7CgogICAgaWYgKHJvYWR2aWV3VmlzaWJsZSkgewogICAgICByb2Fkdmlld1dyYXAuY2xhc3NMaXN0LmFkZCgidmlzaWJsZSIpOwogICAgICByb2Fkdmlld0J0bi5jbGFzc0xpc3QuYWRkKCJvbiIpOwogICAgICByb2Fkdmlld0J0bi50ZXh0Q29udGVudCA9ICLwn6e/IOuhnOuTnOu3sCBPTiI7CiAgICAgIHNob3dSb2Fkdmlld0hpbnQodHJ1ZSk7CgogICAgICBjb25zdCBjZW50ZXIgPSBtYXAuZ2V0Q2VudGVyKCk7CiAgICAgIHNldFJvYWR2aWV3QXQoY2VudGVyKTsKICAgIH0gZWxzZSB7CiAgICAgIHJvYWR2aWV3V3JhcC5jbGFzc0xpc3QucmVtb3ZlKCJ2aXNpYmxlIik7CiAgICAgIHJvYWR2aWV3QnRuLmNsYXNzTGlzdC5yZW1vdmUoIm9uIik7CiAgICAgIHJvYWR2aWV3QnRuLnRleHRDb250ZW50ID0gIvCfp78g66Gc65Oc67ewIjsKICAgICAgc2hvd1JvYWR2aWV3SGludChmYWxzZSk7CgogICAgICBpZiAocm9hZHZpZXdNYXJrZXIpIHJvYWR2aWV3TWFya2VyLnNldE1hcChudWxsKTsKICAgIH0KICB9CgogIGFzeW5jIGZ1bmN0aW9uIGxvYWREYXRhKCkgewogICAgdHJ5IHsKICAgICAgaWYgKCFjYW1wKSB0aHJvdyBuZXcgRXJyb3IoIuy6oO2UhCDsoJXrs7TqsIAg7JeG7Iq164uI64ukLiAoY2FtcCDtjIzrnbzrr7jthLAg7ZWE7JqUKSIpOwoKICAgICAgY29uc3QgY29kZXMgPSBjb2RlID8gY29kZS5zcGxpdCgvWyxcc10rLykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKSA6IFtdOwoKICAgICAgY29uc3QgZmV0Y2hSb3V0ZXMgPSBhc3luYyAoc2luZ2xlQ29kZSkgPT4gewogICAgICAgIGNvbnN0IHUgPSBuZXcgVVJMKFJPVVRFX0VORFBPSU5UKTsKICAgICAgICB1LnNlYXJjaFBhcmFtcy5zZXQoImNhbXAiLCBjYW1wKTsKICAgICAgICB1LnNlYXJjaFBhcmFtcy5zZXQoIm1vZGUiLCAicHJlZml4Iik7CiAgICAgICAgaWYgKHNpbmdsZUNvZGUpIHUuc2VhcmNoUGFyYW1zLnNldCgiY29kZSIsIHNpbmdsZUNvZGUpOwogICAgICAgIGNvbnN0IGQgPSBhd2FpdCBhcGlHZXQodS50b1N0cmluZygpKTsKICAgICAgICByZXR1cm4gZD8ucm93cyB8fCBbXTsKICAgICAgfTsKCiAgICAgIGxldCByb3dzID0gW107CiAgICAgIGlmIChjb2Rlcy5sZW5ndGggPD0gMSkgewogICAgICAgIHJvd3MgPSBhd2FpdCBmZXRjaFJvdXRlcyhjb2Rlc1swXSB8fCAiIik7CiAgICAgIH0gZWxzZSB7CiAgICAgICAgZm9yIChjb25zdCBjIG9mIGNvZGVzKSB7CiAgICAgICAgICBjb25zdCBwYXJ0ID0gYXdhaXQgZmV0Y2hSb3V0ZXMoYyk7CiAgICAgICAgICBpZiAocGFydCAmJiBwYXJ0Lmxlbmd0aCkgcm93cy5wdXNoKC4uLnBhcnQpOwogICAgICAgIH0KICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpOwogICAgICAgIHJvd3MgPSByb3dzLmZpbHRlcihyID0+IHsKICAgICAgICAgIGNvbnN0IGsgPSAociAmJiByLmlkICE9IG51bGwpID8gU3RyaW5nKHIuaWQpIDogYCR7cj8uY2FtcCB8fCAiIn0vJHtyPy5mdWxsX2NvZGUgfHwgcj8uY29kZSB8fCAiIn1gOwogICAgICAgICAgaWYgKHNlZW4uaGFzKGspKSByZXR1cm4gZmFsc2U7CiAgICAgICAgICBzZWVuLmFkZChrKTsKICAgICAgICAgIHJldHVybiB0cnVlOwogICAgICAgIH0pOwogICAgICB9CgogICAgICBpZiAoIXJvd3MubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoIuudvOyasO2KuCDrjbDsnbTthLDrpbwg7LC+7J2EIOyImCDsl4bsirXri4jri6QuIik7CgogICAgICBhbGxSb3V0ZXMgPSByb3dzOwogICAgICByb3V0ZURhdGEgPSByb3dzWzBdOwoKICAgICAgY29uc3QgZGlzcGxheU5hbWUgPSByb3V0ZURhdGEuZGVsaXZlcnlfbG9jYXRpb25fbmFtZSB8fCAi7Lqg7ZSEIjsKICAgICAgY29uc3QgZGlzcGxheUFkZHJlc3MgPSByb3V0ZURhdGEuZGVsaXZlcnlfbG9jYXRpb25fYWRkcmVzcyB8fCAi7KO87IaMIOygleuztCDsl4bsnYwiOwogICAgICBjb25zdCBkaXNwbGF5Q29kZSA9IGNvZGUgfHwgKGFsbFJvdXRlcy5sZW5ndGggPT09IDEgPyAoYWxsUm91dGVzWzBdLmZ1bGxfY29kZSB8fCBhbGxSb3V0ZXNbMF0uY29kZSB8fCAiIikgOiAiIik7CgogICAgICBjYW1wTmFtZS50ZXh0Q29udGVudCA9IGDwn5ONICR7Y2FtcH0gJHtkaXNwbGF5TmFtZX1gOwogICAgICBjYW1wQWRkcmVzcy50ZXh0Q29udGVudCA9IGRpc3BsYXlBZGRyZXNzOwoKICAgICAgY29uc3QgcGFnZVRpdGxlID0gYnVpbGRNZXRhVGl0bGUoY2FtcCwgZGlzcGxheU5hbWUsIGRpc3BsYXlDb2RlKTsKICAgICAgY29uc3QgcGFnZURlc2NyaXB0aW9uID0gYCR7cGFnZVRpdGxlfSDrsLDshqEg6rWs7Jet7J2EIO2ZleyduO2VmOyEuOyalGA7CiAgICAgIHVwZGF0ZU1ldGFUYWdzKHBhZ2VUaXRsZSwgcGFnZURlc2NyaXB0aW9uKTsKCiAgICAgIGlmIChkaXNwbGF5QWRkcmVzcyAmJiBkaXNwbGF5QWRkcmVzcyAhPT0gIuyjvOyGjCDsoJXrs7Qg7JeG7J2MIikgewogICAgICAgIGNvcHlBZGRyZXNzQnRuLnN0eWxlLmRpc3BsYXkgPSAiaW5saW5lLWJsb2NrIjsKICAgICAgfQoKICAgICAgZHJhd1BvbHlnb25zKGFsbFJvdXRlcyk7CgogICAgICB0cnkgewogICAgICAgIGxldCBtZXJnZWQgPSBbXTsKCiAgICAgICAgY29uc3QgZmV0Y2hBZGRycyA9IGFzeW5jIChzaW5nbGVDb2RlKSA9PiB7CiAgICAgICAgICBjb25zdCBhdSA9IG5ldyBVUkwoQUREUkVTU19FTkRQT0lOVCk7CiAgICAgICAgICBhdS5zZWFyY2hQYXJhbXMuc2V0KCJjYW1wIiwgY2FtcCk7CiAgICAgICAgICBpZiAoc2luZ2xlQ29kZSkgewogICAgICAgICAgICBhdS5zZWFyY2hQYXJhbXMuc2V0KCJjb2RlIiwgc2luZ2xlQ29kZSk7CiAgICAgICAgICAgIGF1LnNlYXJjaFBhcmFtcy5zZXQoIm1vZGUiLCAicHJlZml4Iik7CiAgICAgICAgICB9CiAgICAgICAgICBjb25zdCBhZCA9IGF3YWl0IGFwaUdldChhdS50b1N0cmluZygpKTsKICAgICAgICAgIHJldHVybiBhZD8ucm93cyB8fCBbXTsKICAgICAgICB9OwoKICAgICAgICBpZiAoY29kZXMubGVuZ3RoIDw9IDEpIHsKICAgICAgICAgIG1lcmdlZCA9IGF3YWl0IGZldGNoQWRkcnMoY29kZXNbMF0gfHwgIiIpOwogICAgICAgIH0gZWxzZSB7CiAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgY29kZXMpIHsKICAgICAgICAgICAgY29uc3QgcGFydCA9IGF3YWl0IGZldGNoQWRkcnMoYyk7CiAgICAgICAgICAgIGlmIChwYXJ0ICYmIHBhcnQubGVuZ3RoKSBtZXJnZWQucHVzaCguLi5wYXJ0KTsKICAgICAgICAgIH0KICAgICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgU2V0KCk7CiAgICAgICAgICBtZXJnZWQgPSBtZXJnZWQuZmlsdGVyKHIgPT4gewogICAgICAgICAgICBjb25zdCBrID0gKHIgJiYgci5pZCAhPSBudWxsKSA/IFN0cmluZyhyLmlkKSA6IChyPy5hZGRyZXNzIHx8IHI/LmZ1bGxfYWRkcmVzcyB8fCBKU09OLnN0cmluZ2lmeShyKSk7CiAgICAgICAgICAgIGlmIChzZWVuLmhhcyhrKSkgcmV0dXJuIGZhbHNlOwogICAgICAgICAgICBzZWVuLmFkZChrKTsKICAgICAgICAgICAgcmV0dXJuIHRydWU7CiAgICAgICAgICB9KTsKICAgICAgICB9CgogICAgICAgIGFkZHJlc3NSb3dzID0gbWVyZ2VkOwogICAgICAgIHJlbmRlckFkZHJlc3NMaXN0KCk7CiAgICAgIH0gY2F0Y2ggKGFkZHJFcnIpIHsKICAgICAgICBjb25zb2xlLndhcm4oIuuwsOyGoeyngCDroZzrk5wg7Iuk7YyoKO2MqOuEkCk6IiwgYWRkckVycik7CiAgICAgIH0KCiAgICAgIGxvYWRpbmcuc3R5bGUuZGlzcGxheSA9ICJub25lIjsKCiAgICB9IGNhdGNoIChlcnIpIHsKICAgICAgY29uc29sZS5lcnJvcihlcnIpOwogICAgICBsb2FkaW5nLmlubmVySFRNTCA9IGAKICAgICAgICA8ZGl2IHN0eWxlPSJ0ZXh0LWFsaWduOmNlbnRlcjsgY29sb3I6I0ZGNEQ2RDsiPgogICAgICAgICAgPGRpdiBzdHlsZT0iZm9udC1zaXplOjQ4cHg7IG1hcmdpbi1ib3R0b206MTZweDsiPuKaoO+4jzwvZGl2PgogICAgICAgICAgPGRpdiBzdHlsZT0iZm9udC1zaXplOjE2cHg7IGZvbnQtd2VpZ2h0OjcwMDsgbWFyZ2luLWJvdHRvbTo4cHg7Ij7rjbDsnbTthLAg66Gc65OcIOyLpO2MqDwvZGl2PgogICAgICAgICAgPGRpdiBzdHlsZT0iZm9udC1zaXplOjEzcHg7IGNvbG9yOnZhcigtLW11dGVkKTsiPiR7ZXJyLm1lc3NhZ2V9PC9kaXY+CiAgICAgICAgPC9kaXY+CiAgICAgIGA7CiAgICB9CiAgfQoKICBmdW5jdGlvbiBpbml0KCkgewogICAgY29uc3QgYm9vdFRpdGxlID0gY2FtcCAmJiBjb2RlID8gYCR7Y2FtcH0gJHtjb2RlfWAgOiAoY2FtcCB8fCAi67Cw7IahIOyngOuPhCDqs7XsnKAiKTsKICAgIGNvbnN0IGJvb3REZXNjcmlwdGlvbiA9IGNhbXAgPyBgJHtib290VGl0bGV9IOuwsOyGoSDqtazsl63snYQg7ZmV7J247ZWY7IS47JqUYCA6ICLrsLDshqEg6rWs7JetIOuwjyDqsr3roZzrpbwg7ZmV7J247ZWY7IS47JqUIjsKICAgIHVwZGF0ZU1ldGFUYWdzKGJvb3RUaXRsZSwgYm9vdERlc2NyaXB0aW9uKTsKCiAgICBrYWthby5tYXBzLmxvYWQoKCkgPT4gewogICAgICBjb25zdCBjZW50ZXIgPSBuZXcga2FrYW8ubWFwcy5MYXRMbmcoMzcuNTY2NSwgMTI2Ljk3OCk7CiAgICAgIG1hcCA9IG5ldyBrYWthby5tYXBzLk1hcCgkKCJtYXAiKSwgewogICAgICAgIGNlbnRlciwKICAgICAgICBsZXZlbDogOCwKICAgICAgICBkcmFnZ2FibGU6IHRydWUsCiAgICAgICAgc2Nyb2xsd2hlZWw6IHRydWUsCiAgICAgICAgZGlzYWJsZURvdWJsZUNsaWNrWm9vbTogZmFsc2UKICAgICAgfSk7CiAgICAgIGdlb2NvZGVyID0gbmV3IGtha2FvLm1hcHMuc2VydmljZXMuR2VvY29kZXIoKTsKCiAgICAgIGNvbnN0IHpvb21Db250cm9sID0gbmV3IGtha2FvLm1hcHMuWm9vbUNvbnRyb2woKTsKICAgICAgbWFwLmFkZENvbnRyb2woem9vbUNvbnRyb2wsIGtha2FvLm1hcHMuQ29udHJvbFBvc2l0aW9uLlJJR0hUKTsKCiAgICAgIG1hcFR5cGVCdG4ub25jbGljayA9IHRvZ2dsZVNhdGVsbGl0ZTsKCiAgICAgIHJvYWR2aWV3QnRuLm9uY2xpY2sgPSAoKSA9PiB7CiAgICAgICAgdG9nZ2xlUm9hZHZpZXcoKTsKICAgICAgfTsKCiAgICAgIHJ2Q2xvc2VCdG4ub25jbGljayA9ICgpID0+IHsKICAgICAgICBpZiAocm9hZHZpZXdWaXNpYmxlKSB0b2dnbGVSb2FkdmlldygpOwogICAgICB9OwoKICAgICAgcnZUb0NlbnRlckJ0bi5vbmNsaWNrID0gKCkgPT4gewogICAgICAgIGlmICghcm9hZHZpZXdWaXNpYmxlKSByZXR1cm47CiAgICAgICAgY29uc3QgYyA9IG1hcC5nZXRDZW50ZXIoKTsKICAgICAgICBzZXRSb2Fkdmlld0F0KGMpOwogICAgICB9OwoKICAgICAga2FrYW8ubWFwcy5ldmVudC5hZGRMaXN0ZW5lcihtYXAsICJjbGljayIsIChtb3VzZUV2ZW50KSA9PiB7CiAgICAgICAgaWYgKCFyb2Fkdmlld1Zpc2libGUpIHJldHVybjsKICAgICAgICBzZXRSb2Fkdmlld0F0KG1vdXNlRXZlbnQubGF0TG5nKTsKICAgICAgfSk7CgogICAgICBuYXZpVG9DYW1wQnRuLm9uY2xpY2sgPSAoKSA9PiB7CiAgICAgICAgaWYgKCFyb3V0ZURhdGEpIHJldHVybiBhbGVydCgi642w7J207YSwIOuhnOuUqSDspJEuLi4iKTsKICAgICAgICBvcGVuTmF2aUN1cnJlbnRUb0NhbXAoKTsKICAgICAgfTsKCiAgICAgIG5hdmlUb0RlbGl2ZXJ5QnRuLm9uY2xpY2sgPSAoKSA9PiB7CiAgICAgICAgaWYgKCFyb3V0ZURhdGEpIHJldHVybiBhbGVydCgi642w7J207YSwIOuhnOuUqSDspJEuLi4iKTsKICAgICAgICBzaG93U3Vicm91dGVNb2RhbEZvckRlbGl2ZXJ5KCk7CiAgICAgIH07CgogICAgICBjb3B5QWRkcmVzc0J0bi5vbmNsaWNrID0gKCkgPT4gewogICAgICAgIGNvbnN0IGFkZHJlc3MgPSBjYW1wQWRkcmVzcy50ZXh0Q29udGVudDsKICAgICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChhZGRyZXNzKS50aGVuKCgpID0+IHsKICAgICAgICAgIGNvbnN0IG9yaWdpbmFsVGV4dCA9IGNvcHlBZGRyZXNzQnRuLnRleHRDb250ZW50OwogICAgICAgICAgY29weUFkZHJlc3NCdG4udGV4dENvbnRlbnQgPSAi4pyTIOuzteyCrOuQqCI7CiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgY29weUFkZHJlc3NCdG4udGV4dENvbnRlbnQgPSBvcmlnaW5hbFRleHQ7IH0sIDIwMDApOwogICAgICAgIH0pLmNhdGNoKGVyciA9PiB7CiAgICAgICAgICBhbGVydCgi67O17IKsIOyLpO2MqDogIiArIGVyci5tZXNzYWdlKTsKICAgICAgICB9KTsKICAgICAgfTsKCiAgICAgIGxvYWREYXRhKCk7CiAgICB9KTsKICB9CgogIGluaXQoKTsKfSkoKTsKPC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPgo=";

function decodeBase64Utf8(b64) {
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function fetchShareTemplateFromOrigin(_request) {
  const text = decodeBase64Utf8(SHARE_TEMPLATE_B64);
  if (!text || !/<html[\s>]/i.test(text)) {
    throw new Error("Embedded share template is invalid html");
  }
  return text;
}

async function handleShareHtml(request, url, env) {
  const v = safeTrim(url.searchParams.get("v"));
  if (!/^\d{12}$/.test(v)) {
    const next = new URL(url.toString());
    next.searchParams.set("v", getKstYYYYMMDDHHMM());
    return new Response(null, {
      status: 302,
      headers: {
        Location: next.toString(),
        "Cache-Control": "no-store",
      },
    });
  }

  const camp = safeTrim(url.searchParams.get("camp"));
  const code = safeTrim(url.searchParams.get("code"));

  let ogTitle = "배송 지도 공유";
  let ogDescription = "배송 구역 및 경로를 확인하세요";

  if (camp) {
    try {
      const q = new URLSearchParams();
      q.set("select", "camp,full_code,delivery_location_name,delivery_location_address");
      q.set("camp", `eq.${camp}`);
      if (code) q.set("full_code", `like.${code}%`);
      q.set("order", "full_code.asc");
      q.set("limit", "1");

      const rows = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${q.toString()}`, { method: "GET" });
      const out = Array.isArray(rows) ? rows : [];
      await hydrateRouteRowsWithCamps(out, env);
      const row = out[0];

      if (row) {
        const locationAddr = safeTrim(row.delivery_location_address);
        const fullCode = safeTrim(code || row.full_code);

        ogTitle = fullCode ? `${camp} ${fullCode}`.trim() : `${camp} 배송지도`.trim();
        ogDescription = fullCode
          ? `${camp} ${fullCode} 배송 구역을 확인하세요`.trim()
          : `${camp} 배송 구역을 확인하세요`.trim();

        if (locationAddr) ogDescription = `${locationAddr} · ${ogDescription}`;
      } else if (code) {
        ogTitle = `${camp} ${code}`.trim();
        ogDescription = `${camp} ${code} 배송 구역을 확인하세요`.trim();
      } else {
        ogTitle = `${camp} 배송지도`.trim();
        ogDescription = `${camp} 배송 구역을 확인하세요`.trim();
      }
    } catch {
      ogTitle = code ? `${camp} ${code}`.trim() : `${camp} 배송지도`.trim();
      ogDescription = code
        ? `${camp} ${code} 배송 구역을 확인하세요`.trim()
        : `${camp} 배송 구역을 확인하세요`.trim();
    }
  }

  let html = await fetchShareTemplateFromOrigin(request);

  const versionedOgImageUrl = buildVersionedAssetUrl(OG_IMAGE_URL, v);

  const safeTitle = escapeHtmlAttr(ogTitle);
  const safeDesc = escapeHtmlAttr(ogDescription);
  const safeUrl = escapeHtmlAttr(url.toString());
  const safeImg = escapeHtmlAttr(versionedOgImageUrl);
  const safeFav = escapeHtmlAttr(FAVICON_URL);

  html = removeHtmlTags(html, [
    /<title[^>]*>[\s\S]*?<\/title>\s*/gi,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
    /<meta\s+name=["']robots["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi,
    /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /<link\s+rel=["']icon["'][^>]*>\s*/gi,
    /<link\s+rel=["']shortcut icon["'][^>]*>\s*/gi,
    /<link\s+rel=["']apple-touch-icon["'][^>]*>\s*/gi,
  ]);

  const seoBlock = [
    `  <title>${safeTitle}</title>`,
    `  <meta name="description" content="${safeDesc}" />`,
    `  <meta name="robots" content="index,follow,max-image-preview:large" />`,
    ``,
    `  <meta property="og:type" content="website" />`,
    `  <meta property="og:site_name" content="Maroowell" />`,
    `  <meta property="og:locale" content="ko_KR" />`,
    `  <meta property="og:title" content="${safeTitle}" />`,
    `  <meta property="og:description" content="${safeDesc}" />`,
    `  <meta property="og:url" content="${safeUrl}" />`,
    `  <meta property="og:image" content="${safeImg}" />`,
    `  <meta property="og:image:url" content="${safeImg}" />`,
    `  <meta property="og:image:secure_url" content="${safeImg}" />`,
    `  <meta property="og:image:type" content="image/png" />`,
    `  <meta property="og:image:width" content="1200" />`,
    `  <meta property="og:image:height" content="630" />`,
    `  <meta property="og:image:alt" content="${safeTitle}" />`,
    ``,
    `  <meta name="twitter:card" content="summary_large_image" />`,
    `  <meta name="twitter:title" content="${safeTitle}" />`,
    `  <meta name="twitter:description" content="${safeDesc}" />`,
    `  <meta name="twitter:url" content="${safeUrl}" />`,
    `  <meta name="twitter:image" content="${safeImg}" />`,
    `  <meta name="twitter:image:alt" content="${safeTitle}" />`,
    ``,
    `  <link rel="canonical" href="${safeUrl}" />`,
    `  <link rel="icon" type="image/x-icon" href="${safeFav}" />`,
    `  <link rel="shortcut icon" href="${safeFav}" />`,
    `  <link rel="apple-touch-icon" href="${safeFav}" />`,
  ].join("\n");

  html = prependHeadBlock(html, seoBlock);

  html = html.replace(
    /const\s+OG_IMAGE_URL\s*=\s*["'][^"']*["'];/i,
    `const OG_IMAGE_URL = ${quoteJsString(versionedOgImageUrl)};`
  );

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ---------- /osm ----------
async function handleOsmGet(url) {
  const bboxStr = safeTrim(url.searchParams.get("bbox"));
  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
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
