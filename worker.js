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

/**
 * ✅ 템플릿은 "www"에서 가져오기 (Worker 라우트 미적용이라 재귀 방지)
 * - www.maroowell.com/share.html 은 GitHub Pages 정적 파일이어야 합니다.
 */
const SHARE_TEMPLATE_URL = "https://www.maroowell.com/share.html";

/**
 * ✅ 브라우저 탭 파비콘 (HTML <link rel="icon">)
 * - 실제로 https://maroowell.com/favicon.ico 가 200으로 열려야 합니다.
 */
const FAVICON_URL = "https://maroowell.com/favicon.ico?v=2";

/**
 * ✅ 카톡/메신저 미리보기 "썸네일"은 favicon이 아니라 og:image 입니다.
 * - ico는 플랫폼이 무시하는 경우가 많아서 512 PNG를 추천합니다.
 * - 예) /og.png (512x512) 만들어두고 아래 URL로 바꾸세요.
 */
const OG_IMAGE_URL = "https://maroowell.com/og.png?v=2"; // 없으면 업로드 필요

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

// ---------- /route GET ----------
async function handleRouteGet(url, env) {
  const camp = (url.searchParams.get("camp") || "").trim();
  const code = (url.searchParams.get("code") || "").trim();
  const mode = (url.searchParams.get("mode") || "prefix").trim(); // prefix | exact

  if (!camp) return json({ error: "camp is required" }, 400);

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

  const params = new URLSearchParams();
  params.set("select", select);
  params.set("camp", `eq.${camp}`);
  params.set("order", "full_code.asc");

  if (code) {
    if (mode === "exact") params.set("full_code", `eq.${code}`);
    else params.set("full_code", `like.${code}%`);
  }

  const rows = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, { method: "GET" });

  if (Array.isArray(rows)) {
    rows.forEach(row => {
      if (row && row.full_code && !row.color) row.color = generateColor(row.full_code);
      if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === "string") {
        try { row.polygon_wgs84 = JSON.parse(row.polygon_wgs84); } catch { row.polygon_wgs84 = null; }
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

  const hasPoly = Object.prototype.hasOwnProperty.call(body, "polygon_wgs84");

  const patch = { camp, code, full_code: code };

  if (Object.prototype.hasOwnProperty.call(body, "vendor_name")) patch.vendor_name = body.vendor_name ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "vendor_business_number")) patch.vendor_business_number = body.vendor_business_number ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_name")) patch.delivery_location_name = body.delivery_location_name ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_address")) patch.delivery_location_address = body.delivery_location_address ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lat")) patch.delivery_location_lat = body.delivery_location_lat ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "delivery_location_lng")) patch.delivery_location_lng = body.delivery_location_lng ?? null;
  if (hasPoly) patch.polygon_wgs84 = body.polygon_wgs84 ?? null;

  if (typeof id === "number") {
    const params = new URLSearchParams();
    params.set("id", `eq.${id}`);
    params.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");

    const updated = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${params.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });

    const row = Array.isArray(updated) ? updated[0] : updated;
    if (row && row.full_code) row.color = generateColor(row.full_code);
    if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === "string") {
      try { row.polygon_wgs84 = JSON.parse(row.polygon_wgs84); } catch { row.polygon_wgs84 = null; }
    }

    return json({ row }, 200, { "Cache-Control": "no-store" });
  }

  const queryParams = new URLSearchParams();
  queryParams.set("camp", `eq.${camp}`);
  queryParams.set("full_code", `eq.${code}`);
  queryParams.set("select", "id");

  const existing = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${queryParams.toString()}`, { method: "GET" });

  let inserted;
  if (Array.isArray(existing) && existing.length > 0) {
    const existingId = existing[0].id;
    const patchParams = new URLSearchParams();
    patchParams.set("id", `eq.${existingId}`);
    patchParams.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");

    inserted = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${patchParams.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
  } else {
    const insertParams = new URLSearchParams();
    insertParams.set("select", "id,camp,code,full_code,polygon_wgs84,vendor_name,vendor_business_number,delivery_location_name,delivery_location_address,delivery_location_lat,delivery_location_lng,created_at,updated_at");

    inserted = await supabaseFetch(env, `/rest/v1/${ROUTE_TABLE}?${insertParams.toString()}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
  }

  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  if (row && row.full_code) row.color = generateColor(row.full_code);
  if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === "string") {
    try { row.polygon_wgs84 = JSON.parse(row.polygon_wgs84); } catch { row.polygon_wgs84 = null; }
  }

  return json({ row }, 200, { "Cache-Control": "no-store" });
}

// ---------- /route DELETE ----------
async function handleRouteDelete(request, env) {
  const body = await readJson(request);
  const id = body.id;
  const camp = (body.camp || "").trim();
  const code = (body.code || "").trim();

  if (typeof id !== "number" && (!camp || !code)) {
    return json({ error: "id OR (camp + code) is required" }, 400);
  }

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
  if (row && row.full_code) row.color = generateColor(row.full_code);
  if (row && row.polygon_wgs84 && typeof row.polygon_wgs84 === "string") {
    try { row.polygon_wgs84 = JSON.parse(row.polygon_wgs84); } catch { row.polygon_wgs84 = null; }
  }

  return json({ row }, 200, { "Cache-Control": "no-store" });
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
  // ✅ v 파라미터 없으면: KST 기준 yyyymmddHHMM 생성해서 302 리다이렉트
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

  // ✅ 템플릿 HTML fetch (www에서 정적 share.html 가져오기)
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
  const safeImg = escapeHtmlAttr(OG_IMAGE_URL);
  const safeFav = escapeHtmlAttr(FAVICON_URL);

  // title
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  } else {
    html = upsertHeadTag(html, /$^/i, `<title>${safeTitle}</title>`);
  }

  // OG
  html = upsertHeadTag(html, /<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="website" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${safeTitle}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${safeDesc}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:site_name["'][^>]*>/i, `<meta property="og:site_name" content="Maroowell" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${safeUrl}" />`);

  // og:image (카톡 썸네일)
  html = upsertHeadTag(html, /<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${safeImg}" />`);
  html = upsertHeadTag(html, /<meta\s+property=["']og:image:alt["'][^>]*>/i, `<meta property="og:image:alt" content="Maroowell" />`);

  // Twitter
  html = upsertHeadTag(html, /<meta\s+name=["']twitter:card["'][^>]*>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  html = upsertHeadTag(html, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${safeTitle}" />`);
  html = upsertHeadTag(html, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${safeDesc}" />`);
  html = upsertHeadTag(html, /<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${safeImg}" />`);

  // favicon (절대경로로 강제 + 종류 확장)
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
