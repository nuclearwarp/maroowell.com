# Live Copernicus terrain auth diagnostic

worker: purple-resonance-61ea

```text
source_bytes=489805
source_sha256=2f2afce7efc5188648b8c3f7ba4c51113ca22a27167e9f4a86928ff968d28304
settings_success=true
binding_count=9
```

## Relevant binding names/types

- COPERNICUS_CLIENT_ID: secret_text
- COPERNICUS_CLIENT_SECRET: secret_text

## All binding names

- ALLOWED_ORIGIN
- BUILDING_HUB_SERVICE_KEY
- COPERNICUS_CLIENT_ID
- COPERNICUS_CLIENT_SECRET
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_URL
- ZIP_SHARE_KV
- ZIP_SHARE_SECRET

## Production source snippets (sanitized)


### 1. Copernicus Process API failed @ 61647

```js
inElevation,
    maxElevation,
    meanElevation,
    stdevElevation,
    p10Elevation,
    p90Elevation,
    elevationRange: maxElevation - minElevation,
    effectiveRange: p90Elevation - p10Elevation,
    sampleCount: validPixelCount,
    noDataCount,
    resolutionMeters: Math.max(cell.x, cell.y),
    meanSlopeDegrees: slopeSum / slopeSampleCount,
    maxSlopeDegrees: slopeP95,
    flatPercent: flatCount / slopeSampleCount * 100,
    gentlePercent: gentleCount / slopeSampleCount * 100,
    steepPercent: steepCount / slopeSampleCount * 100,
    slopeSampleCount,
    slopeMethod: TERRAIN_SLOPE_METHOD,
  };
}

async function requestCopernicusTerrainStatistics(env, normalized) {
  const payload = buildCopernicusProcessPayload(normalized);

  for (let attempt = 0; attempt < 2; attempt++) {
    const forceRefresh = attempt === 1;
    const accessToken = await getCopernicusAccessToken(env, forceRefresh);

    const res = await fetchWithTimeout(
      COPERNICUS_PROCESS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cf: { cacheTtl: 0, cacheEverything: false },
      },
      COPERNICUS_PROCESS_TIMEOUT_MS
    );

    if (res.status === 401 && attempt === 0) {
      copernicusTokenCache = { accessToken: "", expiresAt: 0 };
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      const message =
        data?.error?.message ||
        data?.error_description ||
        data?.message ||
        data?.error ||
        snippet(text) ||
        `HTTP ${res.status}`;
      throw httpError(502, `Copernicus Process API failed: ${message}`);
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("image/png")) {
      const text = await res.text().catch(() => "");
      throw httpError(502, `Copernicus Process API returned ${contentType || "unknown content type"}: ${snippet(text)}`);
    }

    const png = await decodeTerrainPng(await res.arrayBuffer());
    return calculateTerrainStatsFromRgba(
      png.rgba,
      png.width,
      png.height,
      normalized.bbox
    );
  }

  throw httpError(502, "Copernicus authentication retry failed");
}

function terrainStatsToDatabaseRow(scope, geometryHash, stats, polygonAreaM2) {
  const calculatedAt = new Date().toISOString();

  return {
    zipcode: scope.zipcode,
    scope_type: scope.scopeType,
    scope_key: scope.scopeKey,
    geometry_hash: geometryHash,
    subsubroute_id: scope.subsubrouteId,
    subroute_id: scope.subrouteId,
    vendor_id: scope.vendorId,
    display_name: scope.displayName,
    min_elevation: stats.minElevation,
    max_elevation: stats.maxElevation,
    mean_elevation: stats.meanElevation,
    stdev_elevation: stats.stdevElevation,
    p10_elevation: stats.p10Elevation,
    p90_elevation: stats.p90Elevation,
    elevation_range: stats.elevationRange,
    effective_range: stats.effectiveRange,
    sample_count: stats.sampleCount,
    no_data_count: stats.noDataCount,
    resolution_m: Math.max(
      1,
      Math.round(Number(stats.resolutionMeters) || TERRAIN_RESOLUTION_METERS)
    ),
    source: COPERNICUS_TERRAIN_SOURCE,
    calculated_at: calculatedAt,
    mean_slope_degrees: stats.meanSlopeDegrees,
    max_slope_degrees: stats.maxSlopeDegrees,
    flat_percent: stats.flatPercent,
    gentle_percent: stats.gentlePercent,
    steep_percent: stats.steepPercent,
    slope_sample_count: stats.slopeSampleCount,
    slope_method: stats.slopeMethod || TERRAIN_SLOPE_METHOD,
    slope_calculated_at: calculatedAt,
    polygon_area_m2: polygonAreaM2,
  };
}

function isTerrainCacheFresh(row, geometryHash, forceRefresh = false) {
  if (forceRefresh || !row) return false;
  if (String(row.geometry_hash || "") !== String(geometryHash || "")) return false;
  if (String(row.source || "") !== COPERNICUS_TERRAIN_SOURCE) return false;
  if (String(row.slope_method || "") !== TERRAIN_SLOPE_METHOD) return false;

  const calculatedAt = Date.parse(row.calculated_at || row.slope_calculated_at || "");
  if (!Number.isFinite(calculatedAt)) return false;
  return Date.now() - calculatedAt < TERRAIN_CACHE_MAX_AGE_MS;
}

function terrainCacheExpiresAt(row) {
  const calculatedAt = Date.parse(row?.calculated_at || row?.slope_calculated_at || "");
  if (!Number.isFinite(calculatedAt)) return null;
  return new Date(calculatedAt + TERRAIN_CACHE_MAX_AGE_MS).toISOString();
}

async function handleTerrainRequest(request, env) {
  await verifySupabaseUserByJwt(request, env);

  const body = await readJsonBody(request);
  const scope = normalizeTerrainScope(body);
  const normalized = normalizeTerrainGeometry(
    body?.geometry || body?.polygon || body?.geojson
  );
  const geometryHash = await terrainGeometryHash(normalized);
  co
```

### 2. sh.dataspace.copernicus.eu @ 28731

```js
load = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = String(body?.scopeKey ?? body?.scope_key ?? "").trim();
  const allowed = new Set(["subsubroute", "subrout
```

### 3. identity.dataspace.copernicus.eu @ 28607

```js
l.toString(),
    appUrl: `${publicShareOrigin(env)}/zipcode_share.html`
  }), 400);

  let payload = null;

  try {
    payload = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
```

### 4. /process @ 28757

```js
ecodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = String(body?.scopeKey ?? body?.scope_key ?? "").trim();
  const allowed = new Set(["subsubroute", "subroute", "route_set", "camp"]);
```

### 5. COPERNICUS @ 28048

```js
tml(description)}</p>
    <div class="chips">${chips.map(zip => `<span class="chip">${escapeHtml(zip)}</span>`).join("")}</div>
    <a href="${escapeHtml(appUrl)}">지도 열기</a>
  </main>
  <script>location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;
}

async function handleZipSharePreview(request, env, url) {
  const s = cleanText(url.searchParams.get("s"));
  const sig = cleanText(url.searchParams.get("sig"));

  if (!s) return htmlResp(buildZipSharePreviewHtml({
    payload: { description: "공유 토큰이 없습니다.", zips: [] },
    previewUrl: url.toString(),
    appUrl: `${publicShareOrigin(env)}/zipcode_share.html`
  }), 400);

  let payload = null;

  try {
    payload = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.
```

### 6. COPERNICUS @ 28374

```js

  const s = cleanText(url.searchParams.get("s"));
  const sig = cleanText(url.searchParams.get("sig"));

  if (!s) return htmlResp(buildZipSharePreviewHtml({
    payload: { description: "공유 토큰이 없습니다.", zips: [] },
    previewUrl: url.toString(),
    appUrl: `${publicShareOrigin(env)}/zipcode_share.html`
  }), 400);

  let payload = null;

  try {
    payload = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      sco
```

### 7. COPERNICUS @ 28573

```js
.", zips: [] },
    previewUrl: url.toString(),
    appUrl: `${publicShareOrigin(env)}/zipcode_share.html`
  }), 400);

  let payload = null;

  try {
    payload = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope
```

### 8. COPERNICUS @ 28626

```js
ppUrl: `${publicShareOrigin(env)}/zipcode_share.html`
  }), 400);

  let payload = null;

  try {
    payload = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = S
```

### 9. COPERNICUS @ 28695

```js
let payload = null;

  try {
    payload = sig
      ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = String(body?.scopeKey ?? body?.scope_key ?? "").trim();
  const allowe
```

### 10. COPERNICUS @ 28744

```js
    ? await decodeLegacySignedShare(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = String(body?.scopeKey ?? body?.scope_key ?? "").trim();
  const allowed = new Set(["subsubroute", "subroute", "route_se
```

### 11. COPERNICUS @ 28777

```js
re(request, env, s, sig)
      : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = String(body?.scopeKey ?? body?.scope_key ?? "").trim();
  const allowed = new Set(["subsubroute", "subroute", "route_set", "camp"]);

  if (!allowed.has
```

### 12. COPERNICUS @ 28804

```js
    : await loadShortZipSharePayload(env, s);

    if (payload?.type !== "zipcode_map") throw httpError(400, "Invalid share type");

    const expiresAt = Date.parse(payload.expires_at || payload.expiresAt || "");
    if (!Number.isFinite(expiresAt)) throw httpError(400, "Invalid expiration");
    if (Date.now() > expiresAt) throw httpError(410, "Share link has expired");

    payload.zips = uniqueShareZips(payload.zips);
    if (!payload.zips.length) throw httpError(400, "No zipcode in share payload");
  } catch (e) {
    payload = {
      type: "zipcode_map",
      description: e?.status === 410 ? "공유 링크가 만료되었습니다." : "공유 지도를 열 수 없습니다.",
      zips: []
    };
  }

  const previewUrl = `${publicShareOrigin(env)}/zip/share?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;
  const appUrl = `${publicShareOrigin(env)}/zipcode_share.html?s=${encodeURIComponent(s)}${sig ? `&sig=${encodeURIComponent(sig)}` : ""}`;

  return htmlResp(buildZipSharePreviewHtml({ payload, previewUrl, appUrl }));
}


// ---------- Copernicus GLO-30 terrain statistics ----------
//
// 기존 우편번호 경계 GET, 지도 공유, Supabase 인증 로직은 그대로 유지한다.
// 프론트가 EPSG:5179 경계를 WGS84로 변환한 뒤 아래 엔드포인트로 전달한다.
//   POST /terrain
//   POST /zip/terrain
// Body:
//   { zipcode: "13581", geometry: { type: "Polygon|MultiPolygon", coordinates: [...] } }
//
// 최초 조회: Supabase 캐시 확인 -> Copernicus Process API -> 표고/경사도 계산 -> Supabase 저장
// 재조회: 표고와 경사도 캐시가 모두 있으면 Supabase 캐시만 반환
// 기존 표고 캐시에 경사도가 없으면 DEM을 다시 계산해 경사도 컬럼까지 보충한다.

const ZIPCODE_TERRAIN_TABLE = "zipcode_terrain";
const COPERNICUS_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_PROCESS_URL =
  "https://sh.dataspace.copernicus.eu/process/v1";
const COPERNICUS_DEM_INSTANCE = "COPERNICUS_30";
const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";
const TERRAIN_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const TERRAIN_RESOLUTION_METERS = 30;
const TERRAIN_SUPABASE_TIMEOUT_MS = 5000;
const COPERNICUS_TOKEN_TIMEOUT_MS = 6000;
const COPERNICUS_PROCESS_TIMEOUT_MS = 20000;
const TERRAIN_MAX_POINTS = 100000;
const TERRAIN_MAX_BBOX_DEGREES = 2;
// CPU-safe raster budget. 30m 해상도는 작은 구역에서 그대로 유지하고,
// 큰 구역만 종횡비를 유지한 채 자동 다운샘플링한다.
const TERRAIN_MAX_IMAGE_SIDE = 768;
const TERRAIN_MAX_IMAGE_PIXELS = 65536;
// 작은 우편번호 구역을 과도하게 확대하지 않는다.
const TERRAIN_MIN_IMAGE_SIDE = 8;

// 경사도 분류 기준
// 평지: 0도 이상 5도 미만 / 완경사: 5도 이상 15도 미만 / 급경사: 15도 이상
const TERRAIN_SLOPE_FLAT_MAX_DEGREES = 5;
const TERRAIN_SLOPE_GENTLE_MAX_DEGREES = 15;

// Copernicus GLO-30은 건물/수목이 포함될 수 있는 DSM이다.
// 과거 v2는 7x7 창 안의 모든 점쌍을 비교해 표본 하나당 수백 번의 연산과 정렬을 수행했다.
// v3는 동일한 7x7 창에서 중심 기준 대칭 차분의 중앙값을 사용해 건물 모서리 이상치 저항성을
// 유지하면서 연산량과 임시 객체 생성을 크게 줄인다.
const TERRAIN_SLOPE_WINDOW_RADIUS = 3;
const TERRAIN_SLOPE_MIN_WINDOW_POINTS = 15;
const TERRAIN_SLOPE_MAX_SAMPLES = 384;
const TERRAIN_GROUND_INTERCEPT_PERCENTILE = 0.35;
const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";
const TERRAIN_SLOPE_LEGACY_METHODS = new Set([
  "robust_pairwise_plane_7x7_v2",
]);

// 고도값을 PNG RGB 24비트 정수로 저장하기 위한 규칙.
// encoded = round((elevationMeters + 12000) * 10)
// decoded elevation = encoded / 10 - 12000
const TERRAIN_HEIGHT_OFFSET = 12000;
const TERRAIN_HEIGHT_SCALE = 10;

let copernicusTokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const TERRAIN_PROCESS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["DEM", "dataMask"]
    }],
    output: {
      id: "default",
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function evaluatePixel(sample) {
  if (!sample.dataMask) return [0, 0, 0, 0];

  var encoded = Math.round((sample.DEM + ${TERRAIN_HEIGHT_OFFSET}) * ${TERRAIN_HEIGHT_SCALE});
  encoded = Math.max(0, Math.min(16777215, encoded));

  var r = Math.floor(encoded / 65536);
  var g = Math.floor((encoded - r * 65536) / 256);
  var b = encoded - r * 65536 - g * 256;

  return [r, g, b, 255];
}`;

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTerrainNumber(value, digits = 2) {
  const n = finiteNumberOrNull(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function normalizeTerrainZipcode(value) {
  const text = String(value ?? "").trim();
  return /^\d{5}$/.test(text) ? text : "";
}

function normalizeTerrainScope(body) {
  const zipcode = normalizeTerrainZipcode(body?.zipcode);
  if (zipcode) {
    return {
      scopeType: "zipcode",
      scopeKey: zipcode,
      zipcode,
      subsubrouteId: null,
      subrouteId: null,
      vendorId: null,
      displayName: zipcode,
    };
  }

  const rawType = String(body?.scopeType ?? body?.scope_type ?? "").trim().toLowerCase();
  const rawKey = String(body?.scopeKey ?? body?.scope_key ?? "").trim();
  const allowed = new Set(["subsubroute", "subroute", "route_set", "camp"]);

  if (!allowed.has(rawType)) {
    throw http
```
