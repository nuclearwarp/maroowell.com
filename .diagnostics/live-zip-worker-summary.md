# Live Cloudflare building Worker diagnostic

worker: purple-resonance-61ea

```text
raw_http=200 raw_bytes=489382 raw_content_type=multipart/form-data; boundary=75c795284d00284ac0dff5b3bce8b715df93719e6caab29e00473e82eb17
v2_http=200 v2_bytes=489449 v2_content_type=multipart/form-data; boundary=088a9dda2bbf77cc466a34d3da6846ae51dac5233664e97d1f1471752d83
selected_bytes=489449
contains_building_stats=true
source_sha256=932ef174e68d6f9cb59be20d692cce08b7f82f8f3cec4b3624c9794c07ee4350
hit_count=98 excerpt_ranges=12
```

## Relevant source excerpts

### Excerpt 1 (65640-73120)

```js
Row = await upsertTerrainCache(env, {
        ...cachedRow,
        polygon_area_m2: polygonAreaM2,
      });
    }

    return jsonResp({
      ok: true,
      zipcode: scope.zipcode,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
      cached: true,
      cacheAvailable: true,
      cacheVersion: COPERNICUS_TERRAIN_SOURCE,
      cacheExpiresAt: terrainCacheExpiresAt(effectiveCachedRow),
      terrain: terrainRowToResponse(effectiveCachedRow) || {
        ...cachedTerrain,
        polygonAreaM2,
        areaSquareKilometers: roundTerrainNumber(polygonAreaM2 / 1000000, 4),
        areaPyeong: roundTerrainNumber(
          polygonAreaM2 / TERRAIN_SQUARE_METERS_PER_PYEONG,
          0
        ),
      },
    });
  }

  const stats = await requestCopernicusTerrainStatistics(env, normalized);
  const row = terrainStatsToDatabaseRow(scope, geometryHash, stats, polygonAreaM2);
  const savedRow = await upsertTerrainCache(env, row);
  const terrain = terrainRowToResponse(savedRow) || terrainRowToResponse(row);

  return jsonResp({
    ok: true,
    zipcode: scope.zipcode,
    scopeType: scope.scopeType,
    scopeKey: scope.scopeKey,
    geometryHash,
    cached: false,
    cacheAvailable: true,
    cacheVersion: COPERNICUS_TERRAIN_SOURCE,
    cacheExpiresAt: terrainCacheExpiresAt(savedRow || row),
    terrain,
  });
}


// ---------- Building HUB household / elevator statistics ----------
//
// 기존 우편번호 경계·공유·지형정보 로직과 분리된 추가 기능이다.
//
// Endpoint:
//   POST /building/stats
//   POST /households
//   POST /zip/building-stats
//
// 최초 요청:
//   1) polygon_building_stats 캐시 확인
//   2) 캐시가 없으면 BUILDING_HUB_SERVICE_KEY로 건축물대장 + K-APT 조회
//   3) 건축물 좌표가 없으면 requiresGeocoding=true와 geocodingTargets 반환
//   4) 프론트가 Kakao Geocoder 등으로 좌표를 붙여 같은 요청을 다시 전송
//   5) 폴리곤 내부 건축물만 집계하여 1년 캐시 저장
//
// 이후 요청:
//   - geometry_hash가 같고 expires_at이 지나지 않았으면 DB 캐시만 반환
//   - forceRefresh / force_refresh=true이면 강제 갱신
//
// 요청 예시:
// {
//   "zipcode": "17829",
//   "geometry": { "type": "Polygon", "coordinates": [...] },
//   "legalDongCodes": ["4122025321"],
//   "buildingLocations": [
//     { "key": "건축물키", "lat": 36.99, "lng": 127.10 }
//   ],
//   "forceRefresh": false
// }
//
// 주의:
// - 건축물대장 표제부에는 세대수·가구수·호수·승강기수는 있지만 위경도가 없다.
// - 따라서 첫 호출에서 내려주는 geocodingTargets를 프론트에서 좌표 변환한 뒤
//   buildingLocations로 다시 보내야 정확한 폴리곤 내부 집계가 가능하다.

const POLYGON_BUILDING_STATS_TABLE = "polygon_building_stats";
const BUILDING_HUB_TITLE_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
const BUILDING_HUB_RECAP_TITLE_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo";
const BUILDING_HUB_EXPOS_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposInfo";
const BUILDING_HUB_EXPOS_AREA_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo";
const BUILDING_HUB_HOUSE_PRICE_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrHsprcInfo";
const BUILDING_HUB_FLOOR_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService/getBrFlrOulnInfo";
// V66: 아파트 단지 내 상가는 건축물대장 전유부가 아니라 주택건설사업계획승인
// "복리분양시설"에만 남는 구축 단지가 있다. 건축HUB 주택인허가 공식 원천을
// K-APT로 확정된 아파트 단지에 한해서 보조 근거로 사용한다.
const HOUSING_PERMIT_WELFARE_LOTOUT_URL =
  "https://apis.data.go.kr/1613000/HsPmsHubService/getHpWlfarLotouFcInfo";
const HOUSING_PERMIT_MGM_COOP_WELFARE_URL =
  "https://apis.data.go.kr/1613000/HsPmsHubService/getHpMgmCoopSbsdWlfarFcInfo";
const KAPT_LEGAL_DONG_LIST_URL =
  "https://apis.data.go.kr/1613000/AptListService3/getLegaldongAptList3";
const KAPT_BASIC_INFO_URL =
  "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4";
const KAPT_DETAIL_INFO_URL =
  "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4";
const KAPT_BASIC_INFO_V3_URL =
  "https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfoV3";
const KAPT_DETAIL_INFO_V3_URL =
  "https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusDtlInfoV3";

// 이 값이 바뀌면 과거의 부정확한 캐시는 자동으로 무효화된다.
// V60: 국토부 공식 필지조회 + 법정동 표제부 resumable cache + 선택적 전유부 상세조회.
// K-APT는 정확히 결속된 아파트 세대수/승강기 보강에만 사용하며 동일 필지 타 건물로 전파하지 않는다.
// 연면적/층수/주차대수 기반 배송호수 추정은 사용하지 않는다.
const BUILDING_STATS_SOURCE_VERSION =
  "BUILDING_HUB_KAPT_V66_HSPMS_WELFARE_RESCUE_2026-08-15";

const BUILDING_HUB_PAGE_SIZE = 1000;
const BUILDING_HUB_MAX_PAGES_PER_DONG = 80;
const BUILDING_HUB_MAX_LEGAL_DONG_CODES = 12;
const BUILDING_HUB_MAX_SOURCE_RECORDS = 30000;
// 공공데이터포털은 간헐적으로 12초 이상 응답이 지연된다.
// 기존 12초 단일 시도는 한 서비스 지연만으로 전체 분석을 500으로 끝냈다.
const BUILDING_HUB_TIMEOUT_MS = 22000;
const BUILDING_HUB_MAX_ATTEMPTS = 2;
// V57: 법정동 표제부 bulk는 누락 페이지가 생겨도 뒤의 scope-parcel exact fallback으로 보완한다.
// 한 페이지만 20~40초씩 붙잡지 않도록 bulk page 자체는 짧게 1회 시도한다.
const BUILDING_TITLE_PAGE_TIMEOUT_MS = 9000;
const BUILDING_TITLE_PAGE_MAX_ATTEMPTS = 1;

const KAPT_PAGE_SIZE = 1000;
const KAPT_MAX_PAGES_PER_DONG = 10;
const KAPT_TIMEOUT_MS = 22000;
const KAPT_MAX_ATTEMPTS = 2;
// V35 Paid: K-APT 기본/상세는 complex당 2개의 병렬 fetch를 사용한다.
// Workers의 동시 outgoing connection 한도 6에 맞춰 complex concurrency를 3으로 둔다.
const KAPT_INFO_CONCURRENCY = 3;
// V50: 법정동 K-APT 목록은 시도/시군구/법정동명만 내려오는 경우가 있어
// Kakao addressSearch가 단지 대표점을 찾지 못한다. 최초 위치확인 요청에서만
// 기본정보 주소를 선보강한다. direct-scope에서 실제 법정동 후보만 대상으로 제한한다.
const KAPT_GEOCODE_ENRICH_MAX_COMPLEXES = 64;
const KAPT_GEOCODE_ENRICH_CONCURRENCY = 3;
const PUBLIC_DATA_RETRY_BASE_DELAY_MS = 500;

const BUILDING_STATS_SUPABASE_TIMEOUT_MS = 5000;
const BUILDING_STATS_CACHE_YEARS = 1;
const BUILDING_STATS_DEFAULT_MIN_COVERAGE_PERCENT = 75;

// 주소 대표점은 건물 중심이 아니라 출입구·도로에 찍힐 수 있다.
// 다만 같은 우편번호라는 이유만으로 법정동 전체를 포함하면 과대 집계되므로,
// 실제 폴리곤 경계와 가까운 경우에만 제한적으로 보정한다.
const BUILDING_STATS_ZIPCODE_EDGE_TOLERANCE_METERS = 80;
const BUILDING_STATS_NO_ZIP_EDGE_TOLERANCE_METERS = 35;
const BUILDING_STATS_ROUTE_EDGE_TOLERANCE_METERS = 25;
const BUILDING_STATS_MAX_GEOCODING_TARGETS = 20000;
const BUILDING_STATS_KAPT_MATCH_RADIUS_METERS = 250;
const BUILDING_UNIT_PAGE_SIZE = 1000;
const BUILDING_UNIT_MAX_PAGES_PER_PARCEL = 30;
// V35 Paid: 필지별 상세조회는 서로 독립적이므로 4개씩 병렬 처리한다.
// 각 필지 내부의 페이지/소스 조회는 순차 실행되어 outgoing connection 6 한도 안에 머문다.
const BUILDING_UNIT_FETCH_CONCURRENCY = 6;
const BUILDING_UNIT_TIMEOUT_MS = 22000;
const BUILDING_UNIT_MAX_ATTEMPTS = 2;
const BUILDING_INFER_ELEVATOR_MIN_FLOORS = 6;
const BUILDING_INFER_ELEVATOR_MIN_HEIGHT_M = 18;
const BUILDING_INFER_ELEVATOR_ZERO_MIN_FLOORS = 5;
const BUILDING_INFER_ELEVATOR_ZERO_MIN_HEIGHT_M = 15;
const BUILDING_INFER_ELEVATOR_COLLECTIVE_MIN_UNITS = 8;
const BUILDING_INFER_ELEVATOR_LARGE_UNIT_COUNT = 20;

// V35 Paid: 기본 10,000 subrequest 예산을 기준으로 상세 필지를 한 요청에서 최대 48개 처리한다.
// 필지당 최악 5개 소스 x 30페이지 = 150 subrequest로 계산해도 약 7,200회라
// 표제부/K-APT/Supabase 요청을 포함한 안전 여유를 남긴다. 대부분의 구역은 한 요청에 완료된다.
const BUILDING_STATS_MAX_DETAIL_PARCELS_PER_REQUEST = 72;
const BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE = 1024;
const BUILDING_UNIT_QUERY_VARIANT_LIMIT = 6;
const BUILDING_UNIT_DETAIL_MAX_ATTEMPTS = 1;
const KAPT_SIGUNGU_LIST_URL =
  "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
const KAPT_SIGUNGU_MAX_PAGES = 2;
// V35 Paid: Free 플랜 subrequest 회피용 6개 제한을 해제하고 실사용 상한을 64개로 확장한다.
const KAPT_MAX_INFO_COMPLEXES_PER_REQUEST = 64;

// V35 Paid: 폴리곤 내부 표제부는 최대 128필지를 한 요청에서 처리한다.
// 각 필지는 1페이지 직접조회이므로 Paid 기본 10,000 subrequest 한도에 충분한 여유가 있다.
// 4개 병렬로 처리해 공공데이터 응답 지연에 따른 wall time을 줄인다.
const BUILDING_SCOPE_DIRECT_TITLE_MAX_PARCELS = 192;
const BUILDING_SCOPE_DIRECT_TITL
```

### Excerpt 2 (74964-95620)

```js
code, subsubroute, subroute, or route_polygon"
    );
  }

  if (
    !rawKey ||
    rawKey.length > 160 ||
    !/^[0-9A-Za-z._:-]+$/.test(rawKey)
  ) {
    throw httpError(400, "A valid scopeKey is required");
  }

  const positiveIntegerOrNull = (value) => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };

  const subsubrouteId = positiveIntegerOrNull(
    body?.subsubrouteId ??
    body?.subsubroute_id
  );

  const subrouteId = positiveIntegerOrNull(
    body?.subrouteId ??
    body?.subroute_id
  );

  if (mappedType === "subsubroute" && subsubrouteId == null) {
    throw httpError(400, "subsubrouteId is required for subsubroute scope");
  }

  if (mappedType === "subroute" && subrouteId == null) {
    throw httpError(400, "subrouteId is required for subroute scope");
  }

  return {
    scopeType: mappedType,
    scopeKey: rawKey,
    zipcode: null,
    subsubrouteId,
    subrouteId,
    vendorId:
      String(body?.vendorId ?? body?.vendor_id ?? "").trim() || null,
    displayName:
      String(body?.displayName ?? body?.display_name ?? "")
        .trim()
        .slice(0, 240) || null,
  };
}

function buildingStatsSelectColumns() {
  return [
    "id",
    "scope_type",
    "scope_key",
    "geometry_hash",
    "zipcode",
    "subsubroute_id",
    "subroute_id",
    "vendor_id",
    "display_name",
    "polygon_area_m2",
    "household_count",
    "apartment_household_count",
    "non_apartment_household_count",
    "unknown_household_count",
    "residential_unit_count",
    "commercial_unit_count",
    "unclassified_unit_count",
    "delivery_unit_count",
    "residential_building_unit_count",
    "commercial_building_unit_count",
    "mixed_use_building_count",
    "exclusive_unit_record_count",
    "common_area_record_count",
    "confirmed_elevator_unit_count",
    "inferred_elevator_unit_count",
    "no_elevator_unit_count",
    "unknown_elevator_unit_count",
    "residential_elevator_unit_count",
    "residential_no_elevator_unit_count",
    "residential_unknown_elevator_unit_count",
    "commercial_elevator_unit_count",
    "commercial_no_elevator_unit_count",
    "commercial_unknown_elevator_unit_count",
    "unit_analysis_version",
    "unit_analysis_method",
    "source_record_count",
    "matched_building_count",
    "residential_building_count",
    "geocoded_building_count",
    "unlocated_building_count",
    "coverage_percent",
    "elevator_building_count",
    "no_elevator_building_count",
    "unknown_elevator_building_count",
    "elevator_household_count",
    "no_elevator_household_count",
    "unknown_elevator_household_count",
    "passenger_elevator_count",
    "emergency_elevator_count",
    "walkup_min_ground_floors",
    "walkup_building_count",
    "walkup_household_count",
    "source",
    "source_version",
    "source_reference_date",
    "source_fetched_at",
    "location_source",
    "breakdown",
    "calculated_at",
    "expires_at",
    "refresh_status",
    "last_refresh_attempt_at",
    "last_refresh_error",
    "created_at",
    "updated_at",
  ].join(",");
}

async function fetchBuildingStatsCache(env, scopeType, scopeKey) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
  const params = new URLSearchParams();

  params.set("scope_type", `eq.${scopeType}`);
  params.set("scope_key", `eq.${scopeKey}`);
  params.set("select", buildingStatsSelectColumns());
  params.set("limit", "1");

  const res = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/${POLYGON_BUILDING_STATS_TABLE}?${params.toString()}`,
    {
      method: "GET",
      headers: terrainSupabaseHeaders(env),
      cf: { cacheTtl: 0, cacheEverything: false },
    },
    BUILDING_STATS_SUPABASE_TIMEOUT_MS
  );

  const text = await res.text();
  let rows = null;

  try {
    rows = text ? JSON.parse(text) : [];
  } catch {}

  if (!res.ok) {
    throw httpError(
      502,
      `Building stats cache lookup failed: ${
        snippet(text) || `HTTP ${res.status}`
      }`
    );
  }

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertBuildingStatsCache(env, row) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
  const params = new URLSearchParams();

  params.set("on_conflict", "scope_type,scope_key");

  const res = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/${POLYGON_BUILDING_STATS_TABLE}?${params.toString()}`,
    {
      method: "POST",
      headers: terrainSupabaseHeaders(
        env,
        "resolution=merge-duplicates,return=representation"
      ),
      body: JSON.stringify(row),
      cf: { cacheTtl: 0, cacheEverything: false },
    },
    BUILDING_STATS_SUPABASE_TIMEOUT_MS
  );

  const text = await res.text();
  let rows = null;

  try {
    rows = text ? JSON.parse(text) : [];
  } catch {}

  if (!res.ok) {
    throw httpError(
      502,
      `Building stats cache save failed: ${
        snippet(text) || `HTTP ${res.status}`
      }`
    );
  }

  return Array.isArray(rows) && rows.length ? rows[0] : row;
}


// ---------- V56 raw upstream cache -------------------------------------------------
// IMPORTANT: 이 캐시는 V3X/V46 분석 알고리즘을 바꾸지 않는다.
// 외부 API 응답을 그대로 재사용해 같은 법정동/필지를 다시 호출하지 않는 I/O 가속 계층이다.
const BUILDING_SOURCE_CACHE_TABLE = "building_source_cache";
const BUILDING_V56_RAW_CACHE_VERSION = "RAW2";
const BUILDING_V56_TITLE_PAGE_CACHE_DAYS = 90;
const BUILDING_V56_TITLE_PARCEL_CACHE_DAYS = 90;
const BUILDING_V56_DETAIL_PARCEL_CACHE_DAYS = 90;
const BUILDING_V56_CACHE_BATCH = 80;
const BUILDING_V56_TITLE_PAGE_CONCURRENCY = 6;
const BUILDING_V56_SOURCE_CACHE_SELECT = [
  "cache_key", "source_type", "region_key", "parcel_key", "kapt_code",
  "payload", "status", "fetched_at", "expires_at", "last_error"
].join(",");

function v56RegionKey(sigunguCd, bjdongCd = "") {
  const sig = String(sigunguCd || "").replace(/\D/g, "");
  const bjd = String(bjdongCd || "").replace(/\D/g, "");
  if (sig.length !== 5) return "";
  if (!bjd) return sig;
  return bjd.length === 5 ? `${sig}${bjd}` : "";
}

function v56RegionKeyFromParcel(parcel) {
  return parcel ? v56RegionKey(parcel.sigunguCd, parcel.bjdongCd) : "";
}

function v56RawCacheKey(sourceType, identity) {
  return `${BUILDING_V56_RAW_CACHE_VERSION}:${sourceType}:${identity}`;
}

function v56RawCacheFresh(row) {
  if (!row || row.status === "error") return false;
  const expires = Date.parse(row.expires_at || "");
  return Number.isFinite(expires) && expires > Date.now();
}

function v56RawCacheRow({ sourceType, regionKey, parcelKey = null, identity, payload, days }) {
  const now = new Date().toISOString();
  return {
    cache_key: v56RawCacheKey(sourceType, identity),
    source_type: sourceType,
    region_key: regionKey || null,
    parcel_key: parcelKey || null,
    kapt_code: null,
    payload: payload && typeof payload === "object" ? payload : {},
    status: "ready",
    fetched_at: now,
    expires_at: new Date(Date.now() + Math.max(1, Number(days) || 1) * 86400000).toISOString(),
    last_error: null,
    updated_at: now,
  };
}

async function v56FetchRawCacheRows(env, regionKey, sourceType) {
  if (!regionKey || !sourceType) return { available: false, rows: [], error: null };
  try {
    const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("region_key", `eq.${regionKey}`);
    params.set("source_type", `eq.${sourceType}`);
    params.set("select", BUILDING_V56_SOURCE_CACHE_SELECT);
    params.set("limit", "5000");
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/${BUILDING_SOURCE_CACHE_TABLE}?${params.toString()}`,
      {
        method: "GET",
        headers: terrainSupabaseHeaders(env),
        cf: { cacheTtl: 0, cacheEverything: false },
      },
      BUILDING_STATS_SUPABASE_TIMEOUT_MS
    );
    const text = await res.text();
    let rows = [];
    try { rows = text ? JSON.parse(text) : []; } catch {}
    if (!res.ok) {
      return { available: false, rows: [], error: `HTTP ${res.status}: ${snippet(text)}` };
    }
    return { available: true, rows: Array.isArray(rows) ? rows : [], error: null };
  } catch (error) {
    return { available: false, rows: [], error: String(error?.message || error) };
  }
}

function v56RawCacheIndex(rows) {
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.cache_key || "").trim();
    if (key) index.set(key, row);
  }
  return index;
}

async function v56UpsertRawCacheRows(env, rows) {
  const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!source.length) return { ok: true, written: 0, error: null };
  try {
    const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
    let written = 0;
    for (let offset = 0; offset < source.length; offset += BUILDING_V56_CACHE_BATCH) {
      const batch = source.slice(offset, offset + BUILDING_V56_CACHE_BATCH);
      const params = new URLSearchParams();
      params.set("on_conflict", "cache_key");
      const res = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/${BUILDING_SOURCE_CACHE_TABLE}?${params.toString()}`,
        {
          method: "POST",
          headers: terrainSupabaseHeaders(env, "resolution=merge-duplicates,return=minimal"),
          body: JSON.stringify(batch),
          cf: { cacheTtl: 0, cacheEverything: false },
        },
        BUILDING_STATS_SUPABASE_TIMEOUT_MS
      );
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, written, error: `HTTP ${res.status}: ${snippet(text)}` };
      }
      written += batch.length;
    }
    return { ok: true, written, error: null };
  } catch (error) {
    return { ok: false, written: 0, error: String(error?.message || error) };
  }
}

function v56CachedTitlePage(row) {
  if (!v56RawCacheFresh(row)) return null;
  const payload = row?.payload;
  if (!payload || !Array.isArray(payload.items)) return null;
  return {
    items: payload.items,
    totalCount: Number(payload.totalCount || payload.items.length || 0),
    pageNo: Number(payload.pageNo || 1),
    numOfRows: Number(payload.numOfRows || BUILDING_HUB_PAGE_SIZE),
    __cacheV56: true,
  };
}

function v56CachedDetailResult(row, parcel, titleMatches = []) {
  if (!v56RawCacheFresh(row)) return null;
  const payload = row?.payload;
  if (!payload || payload.sourceComplete === false) return null;
  return {
    parcel,
    titleMatches,
    addedFromVerifiedScopeV51: false,
    addedFromKaptScopeV48: false,
    verifiedScopeEntryV51: null,
    kaptMatchesV51: [],
    areaRows: Array.isArray(payload.areaRows) ? payload.areaRows : [],
    exposRows: Array.isArray(payload.exposRows) ? payload.exposRows : [],
    recapRows: Array.isArray(payload.recapRows) ? payload.recapRows : [],
    housePriceRows: Array.isArray(payload.housePriceRows) ? payload.housePriceRows : [],
    floorRows: Array.isArray(payload.floorRows) ? payload.floorRows : [],
    sourceComplete: true,
    queryDiagnostics: { optimized: true, rawCacheV56: true },
  };
}

async function markBuildingStatsRefreshError(env, cacheRow, error) {
  if (!cacheRow?.id) return;

  try {
    const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
    const params = new URLSearchParams();

    params.set("id", `eq.${cacheRow.id}`);

    await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/${POLYGON_BUILDING_STATS_TABLE}?${params.toString()}`,
      {
        method: "PATCH",
        headers: terrainSupabaseHeaders(env),
        body: JSON.stringify({
          refresh_status: "error",
          last_refresh_attempt_at: new Date().toISOString(),
          last_refresh_error: String(error?.message || error || "")
            .slice(0, 4000),
        }),
        cf: { cacheTtl: 0, cacheEverything: false },
      },
      BUILDING_STATS_SUPABASE_TIMEOUT_MS
    );
  } catch (markError) {
    console.warn("[BUILDING_STATS] failed to mark refresh error", markError);
  }
}

function buildingStatsRowToResponse(row) {
  if (!row || typeof row !== "object") return null;

  const numberValue = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const nullableNumber = (value) => {
    const n = Number(value);
    return value == null || value === "" || !Number.isFinite(n)
      ? null
      : n;
  };

  // 배송호수 컬럼 추가 이전 캐시도 화면에서 계속 사용할 수 있게 호환한다.
  const legacyHouseholds = numberValue(row.household_count);
  const storedResidentialUnits = numberValue(row.residential_unit_count);
  const storedCommercialUnits = numberValue(row.commercial_unit_count);
  const storedUnclassifiedUnits = numberValue(row.unclassified_unit_count);
  const storedDeliveryUnits = numberValue(row.delivery_unit_count);
  const storedUnitSum =
    storedResidentialUnits +
    storedCommercialUnits +
    storedUnclassifiedUnits;
  const deliveryUnitsCompat = storedDeliveryUnits > 0
    ? storedDeliveryUnits
    : Math.max(storedUnitSum, legacyHouseholds);
  const residentialUnitsCompat = storedUnitSum > 0
    ? storedResidentialUnits
    : legacyHouseholds;

  const legacyElevatorUnits = numberValue(row.elevator_household_count);
  const legacyNoElevatorUnits = numberValue(row.no_elevator_household_count);
  const legacyUnknownElevatorUnits = numberValue(row.unknown_elevator_household_count);
  const confirmedElevatorUnitsCompat = numberValue(row.confirmed_elevator_unit_count) || legacyElevatorUnits;
  const noElevatorUnitsCompat = numberValue(row.no_elevator_unit_count) || legacyNoElevatorUnits;
  const unknownElevatorUnitsCompat = numberValue(row.unknown_elevator_unit_count) || legacyUnknownElevatorUnits;

  return {
    scopeType: row.scope_type || null,
    scopeKey: row.scope_key || null,
    geometryHash: row.geometry_hash || null,
    zipcode: row.zipcode || null,
    displayName: row.display_name || null,
    polygonAreaM2: nullableNumber(row.polygon_area_m2),

    householdCount: numberValue(row.household_count),
    apartmentHouseholdCount: numberValue(
      row.apartment_household_count
    ),
    nonApartmentHouseholdCount: numberValue(
      row.non_apartment_household_count
    ),
    unknownHouseholdCount: numberValue(
      row.unknown_household_count
    ),

    residentialUnitCount: residentialUnitsCompat,
    commercialUnitCount: storedCommercialUnits,
    unclassifiedUnitCount: storedUnclassifiedUnits,
    deliveryUnitCount: deliveryUnitsCompat,

    residentialBuildingUnitCount: numberValue(
      row.residential_building_unit_count
    ),
    commercialBuildingUnitCount: numberValue(
      row.commercial_building_unit_count
    ),
    mixedUseBuildingCount: numberValue(row.mixed_use_building_count),
    exclusiveUnitRecordCount: numberValue(row.exclusive_unit_record_count),
    commonAreaRecordCount: numberValue(row.common_area_record_count),

    confirmedElevatorUnitCount: confirmedElevatorUnitsCompat,
    inferredElevatorUnitCount: numberValue(
      row.inferred_elevator_unit_count
    ),
    noElevatorUnitCount: noElevatorUnitsCompat,
    unknownElevatorUnitCount: unknownElevatorUnitsCompat,

    residentialElevatorUnitCount: numberValue(
      row.residential_elevator_unit_count
    ),
    residentialNoElevatorUnitCount: numberValue(
      row.residential_no_elevator_unit_count
    ),
    residentialUnknownElevatorUnitCount: numberValue(
      row.residential_unknown_elevator_unit_count
    ),
    commercialElevatorUnitCount: numberValue(
      row.commercial_elevator_unit_count
    ),
    commercialNoElevatorUnitCount: numberValue(
      row.commercial_no_elevator_unit_count
    ),
    commercialUnknownElevatorUnitCount: numberValue(
      row.commercial_unknown_elevator_unit_count
    ),

    unitAnalysisVersion: row.unit_analysis_version || null,
    unitAnalysisMethod: row.unit_analysis_method || null,

    sourceRecordCount: numberValue(row.source_record_count),
    matchedBuildingCount: numberValue(row.matched_building_count),
    residentialBuildingCount: numberValue(
      row.residential_building_count
    ),
    geocodedBuildingCount: numberValue(
      row.geocoded_building_count
    ),
    unlocatedBuildingCount: numberValue(
      row.unlocated_building_count
    ),
    coveragePercent: nullableNumber(row.coverage_percent),

    elevatorBuildingCount: numberValue(
      row.elevator_building_count
    ),
    noElevatorBuildingCount: numberValue(
      row.no_elevator_building_count
    ),
    unknownElevatorBuildingCount: numberValue(
      row.unknown_elevator_building_count
    ),

    elevatorHouseholdCount: numberValue(
      row.elevator_household_count
    ),
    noElevatorHouseholdCount: numberValue(
      row.no_elevator_household_count
    ),
    unknownElevatorHouseholdCount: numberValue(
      row.unknown_elevator_household_count
    ),

    passengerElevatorCount: numberValue(
      row.passenger_elevator_count
    ),
    emergencyElevatorCount: numberValue(
      row.emergency_elevator_count
    ),

    walkupMinGroundFloors: numberValue(
      row.walkup_min_ground_floors
    ),
    walkupBuildingCount: numberValue(
      row.walkup_building_count
    ),
    walkupHouseholdCount: numberValue(
      row.walkup_household_count
    ),

    source: row.source || "BUILDING_HUB",
    sourceVersion: row.source_version || null,
    sourceReferenceDate: row.source_reference_date || null,
    sourceFetchedAt: row.source_fetched_at || null,
    locationSource: row.location_source || null,
    breakdown: row.breakdown || null,

    calculatedAt: row.calculated_at || null,
    expiresAt: row.expires_at || null,
    refreshStatus: row.refresh_status || "ready",
    lastRefreshAttemptAt: row.last_refresh_attempt_at || null,
    lastRefreshError: row.last_refresh_error || null,
  };
}

function buildingStatsCachedDeliveryUnits(row) {
  if (!row || typeof row !== "object") return 0;

  const values = [
    row.delivery_unit_count,
    row.household_count,
    Number(row.residential_unit_count || 0) +
      Number(row.commercial_unit_count || 0) +
      Number(row.unclassified_unit_count || 0),
  ].map((value) => Math.max(0, Math.trunc(Number(value) || 0)));

  return Math.max(...values, 0);
}

function isUsableBuildingStatsCache(
  row,
  geometryHash,
  { allowExpired = false } = {}
) {
  if (!row) return false;

  if (String(row.geometry_hash || "") !== String(geometryHash || "")) {
    return false;
  }

  // 과거에 잘못 저장된 0호 캐시는 재사용하지 않는다.
  if (buildingStatsCachedDeliveryUnits(row) <= 0) {
    return false;
  }

  if (allowExpired) return true;

  const expiresAt = Date.parse(row.expires_at || "");
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function isSuspiciousOnePerBuildingCache(row) {
  if (!row || typeof row !== "object") return false;
  const delivery = buildingStatsCachedDeliveryUnits(row);
  const matched = Math.max(0, Math.trunc(Number(row.matched_building_count) || 0));
  const exclusive = Math.max(0, Math.trunc(Number(row.exclusive_unit_record_count) || 0));
  const quality = row?.breakdown?.dataQuality || {};
  const authoritative = Math.max(
    0,
    Math.trunc(Number(quality.authoritativeUnitCount) || 0)
  );
  const estimated = Math.max(
    0,
    Math.trunc(Number(quality.estimatedUnitCount) || 0)
  );
  const sourceVersion = String(row.source_version || "");

  return (
    sourceVersion !== BUILDING_STATS_SOURCE_VERSION &&
    delivery > 0 &&
    matched >= 10 &&
    exclusive === 0 &&
    delivery <= matched * 1.25 &&
    (authoritative === 0 || estimated >= delivery * 0.8)
  );
}

function isSuspiciousElevatorCache(row) {
  if (!row || typeof row !== "object") return false;

  const sourceVersion = String(row.source_version || "");
  if (sourceVersion === BUILDING_STATS_SOURCE_VERSION) return false;

  const delivery = buildingStatsCachedDeliveryUnits(row);
  if (delivery <= 0) return false;

  const confirmed = Math.max(
    0,
    Math.trunc(Number(row.confirmed_elevator_unit_count) || 0),
    Math.trunc(Number(row.elevator_household_count) || 0)
  );
  const inferred = Math.max(
    0,
    Math.trunc(Number(row.inferred_elevator_unit_count) || 0)
  );
  const none = Math.max(
    0,
    Math.trunc(Number(row.no_elevator_unit_count) || 0),
    Math.trunc(Number(row.no_elevator_household_count) || 0)
  );
  const unknown = Math.max(
    0,
    Math.trunc(Number(row.unknown_elevator_unit_count) || 0),
    Math.trunc(Number(row.unknown_elevator_household_count) || 0)
  );
  const matched = Math.max(0, Math.trunc(Number(row.matched_building_count) || 0));

  return (
    confirmed + inferred === 0 &&
    matched >= 4 &&
    (none >= delivery * 0.75 || none + unknown >=
```

### Excerpt 3 (129086-133981)

```js
= normalizeDeliveryUnitName(
    publicDataField(parentRow, "bldNm", "bld_nm", "buildingName", "building_name")
  );

  const selected = parcelRows.filter((row) => {
    const managementKey = cleanBuildingText(
      publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk")
    );
    if (parentManagementKey && managementKey === parentManagementKey) return true;

    const dong = normalizeDeliveryUnitName(
      publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
    );
    if (parentDong && dong && dong === parentDong) return true;

    const name = normalizeDeliveryUnitName(
      publicDataField(row, "bldNm", "bld_nm", "buildingName", "building_name")
    );
    return Boolean(parentName && name && name === parentName);
  });

  if (!selected.length) return [parentRow];
  if (!selected.includes(parentRow)) selected.unshift(parentRow);
  return selected;
}

function buildingElevatorAvailability(row, classification, context = {}) {
  return buildingElevatorAvailabilityFromRows([row], classification, context);
}

function buildingElevatorProfile(
  parentRow,
  classification,
  parcelMatches,
  context = {}
) {
  const rows = buildingElevatorRowsForParent(parentRow, parcelMatches);
  const sourceRows = rows.length ? rows : (parentRow ? [parentRow] : []);
  return buildingElevatorAvailabilityFromRows(
    sourceRows,
    classification,
    context
  );
}

function kaptElevatorAvailability(complex) {
  const floors = Math.max(0, Math.trunc(Number(complex?.maxFloorCount) || 0));
  const unitCount = Math.max(0, Math.trunc(Number(complex?.households) || 0));
  const count = Math.max(0, Math.trunc(Number(complex?.elevatorCount) || 0));

  if (count > 0) {
    return {
      category: "confirmed",
      reason: "kapt_positive_count",
      inferred: false,
      zeroOverridden: false,
      known: true,
      explicitZero: false,
      passenger: count,
      emergency: 0,
      floors,
      heightM: 0,
      unitCount,
      inferenceRules: [],
      sourceRowCount: 1,
    };
  }

  // V36: K-APT도 동일하게 공식 elevatorCount만 O/X 근거로 사용한다.
  // 값이 없으면 단지 규모가 커도 임의 추정하지 않고 unknown으로 둔다.
  return {
    category: complex?.elevatorKnown ? "none" : "unknown",
    reason: complex?.elevatorKnown
      ? "kapt_registered_zero_without_counterevidence"
      : "kapt_elevator_count_missing",
    inferred: false,
    zeroOverridden: false,
    known: complex?.elevatorKnown === true,
    explicitZero: complex?.elevatorKnown === true,
    passenger: 0,
    emergency: 0,
    floors,
    heightM: 0,
    unitCount,
    inferenceRules: [],
    sourceRowCount: 1,
  };
}

function elevatorCategoryRank(category) {
  return {
    unknown: 0,
    none: 1,
    inferred: 2,
    confirmed: 3,
  }[category] ?? 0;
}

function registerElevatorBuildingDiagnostic(
  map,
  buildingKey,
  elevator,
  units,
  unitType,
  contributor = {}
) {
  const key = cleanBuildingText(buildingKey);
  const count = Math.max(0, Math.trunc(Number(units) || 0));
  if (!key || !count) return;

  const nextCategory = elevator?.category || "unknown";
  const previous = map.get(key) || {
    key,
    category: nextCategory,
    reason: elevator?.reason || null,
    inferenceRules: [],
    floors: 0,
    heightM: 0,
    unitCount: 0,
    residentialUnits: 0,
    commercialUnits: 0,
    unclassifiedUnits: 0,
    totalUnits: 0,
    name: contributor?.name || null,
    address: contributor?.address || null,
    source: contributor?.source || null,
    buildingWeight: Math.max(1, Math.trunc(Number(contributor?.buildingWeight) || 1)),
    zeroOverridden: false,
    registeredPassenger: 0,
    registeredEmergency: 0,
  };

  if (
    elevatorCategoryRank(nextCategory) >
    elevatorCategoryRank(previous.category)
  ) {
    previous.category = nextCategory;
    previous.reason = elevator?.reason || previous.reason;
  }

  previous.inferenceRules = [...new Set([
    ...(previous.inferenceRules || []),
    ...((elevator?.inferenceRules || []).filter(Boolean)),
  ])];
  previous.floors = Math.max(previous.floors || 0, Number(elevator?.floors) || 0);
  previous.heightM = Math.max(previous.heightM || 0, Number(elevator?.heightM) || 0);
  previous.unitCount = Math.max(previous.unitCount || 0, Number(elevator?.unitCount) || 0);
  previous.zeroOverridden = previous.zeroOverridden || elevator?.zeroOverridden === true;
  previous.registeredPassenger = Math.max(
    previous.registeredPassenger || 0,
    Number(elevator?.passenger) || 0
  );
  previous.registeredEmergency = Math.max(
    previous.registeredEmergency || 0,
    Number(elevator?.emergency) || 0
  );

  if (unitType === "residential") previous.residentialUnits += count;
  else if (unitType === "commercial") previous.commercialUnits += count;
  else previous.unclassifiedUnits += count;
  previous.totalUnits += count;

  if (!previous.name && contributor?.name) previous.name = contributor.name;
  if (!previous
```

### Excerpt 4 (141702-149559)

```js
) {
    return locationIndex.get(key);
  }

  const managementKey = cleanBuildingText(
    row?.mgmBldrgstPk ??
    row?.mgm_bldrgst_pk
  );

  if (
    managementKey &&
    locationIndex.has(managementKey)
  ) {
    return locationIndex.get(managementKey);
  }

  const addresses = buildingRecordAddresses(row);

  for (const address of [
    addresses.roadAddress,
    addresses.parcelAddress,
  ]) {
    const normalized = normalizedBuildingAddress(address);
    if (normalized && locationIndex.has(normalized)) {
      return locationIndex.get(normalized);
    }
  }

  return null;
}

function buildingGeocodingTarget(row) {
  const addresses = buildingRecordAddresses(row);
  const classification = buildingHousingClassification(row);
  const elevator = buildingElevatorInfo(row);

  return {
    key: buildingRecordKey(row),
    managementKey: cleanBuildingText(
      row?.mgmBldrgstPk ??
      row?.mgm_bldrgst_pk
    ) || null,
    roadAddress: addresses.roadAddress || null,
    parcelAddress: addresses.parcelAddress || null,
    address: addresses.preferredAddress || null,
    buildingName: cleanBuildingText(
      row?.bldNm ??
      row?.bld_nm
    ) || null,
    dongName: cleanBuildingText(
      row?.dongNm ??
      row?.dong_nm
    ) || null,
    purpose: classification.purpose || null,
    residential: classification.residential,
    apartment: classification.apartment,
    householdCount: buildingHouseholdUnits(
      row,
      classification
    ),
    groundFloorCount: nonNegativeBuildingInteger(
      row?.grndFlrCnt ??
      row?.grnd_flr_cnt
    ),
    passengerElevatorCount: elevator.passenger,
    emergencyElevatorCount: elevator.emergency,
  };
}

function latestBuildingReferenceDate(records) {
  let latest = "";

  for (const row of records || []) {
    const raw = String(
      row?.crtnDay ??
      row?.crtn_day ??
      ""
    ).replace(/\D/g, "");

    if (raw.length === 8 && raw > latest) {
      latest = raw;
    }
  }

  if (!latest) return null;

  return `${latest.slice(0, 4)}-${latest.slice(4, 6)}-${latest.slice(6, 8)}`;
}

function aggregateBuildingStats(
  records,
  geometry,
  locationIndex,
  walkupMinGroundFloors
) {
  const matched = [];
  const missing = [];

  let geocodedBuildingCount = 0;

  for (const row of records) {
    const location = findBuildingRecordLocation(
      row,
      locationIndex
    );

    if (!location) {
      missing.push(row);
      continue;
    }

    geocodedBuildingCount += 1;

    if (
      pointInBuildingGeometry(
        location.lng,
        location.lat,
        geometry
      )
    ) {
      matched.push({ row, location });
    }
  }

  let householdCount = 0;
  let apartmentHouseholdCount = 0;
  let nonApartmentHouseholdCount = 0;
  let unknownHouseholdCount = 0;

  let residentialBuildingCount = 0;

  let elevatorBuildingCount = 0;
  let noElevatorBuildingCount = 0;
  let unknownElevatorBuildingCount = 0;

  let elevatorHouseholdCount = 0;
  let noElevatorHouseholdCount = 0;
  let unknownElevatorHouseholdCount = 0;

  let passengerElevatorCount = 0;
  let emergencyElevatorCount = 0;

  let walkupBuildingCount = 0;
  let walkupHouseholdCount = 0;

  const housingTypeBreakdown = {};
  const purposeBreakdown = {};
  let unknownResidentialBuildingCount = 0;

  for (const match of matched) {
    const row = match.row;

    if (isAncillaryBuildingRecord(row)) {
      continue;
    }

    const classification = buildingHousingClassification(row);

    if (!classification.residential) {
      continue;
    }

    residentialBuildingCount += 1;

    const units = buildingHouseholdUnits(
      row,
      classification
    );

    householdCount += units;

    const housingType = classification.apartment
      ? "apartment"
      : "non_apartment";

    housingTypeBreakdown[housingType] =
      (housingTypeBreakdown[housingType] || 0) + units;

    if (classification.apartment) {
      apartmentHouseholdCount += units;
    } else {
      nonApartmentHouseholdCount += units;
    }

    if (units === 0) {
      unknownResidentialBuildingCount += 1;
    }

    const purposeKey =
      classification.purpose ||
      "미분류";

    purposeBreakdown[purposeKey] =
      (purposeBreakdown[purposeKey] || 0) + units;

    const elevator = buildingElevatorInfo(row);
    const groundFloorCount = nonNegativeBuildingInteger(
      row?.grndFlrCnt ??
      row?.grnd_flr_cnt
    );

    passengerElevatorCount += elevator.passenger;
    emergencyElevatorCount += elevator.emergency;

    if (!elevator.known) {
      unknownElevatorBuildingCount += 1;
      unknownElevatorHouseholdCount += units;
      continue;
    }

    if (elevator.hasElevator) {
      elevatorBuildingCount += 1;
      elevatorHouseholdCount += units;
      continue;
    }

    noElevatorBuildingCount += 1;
    noElevatorHouseholdCount += units;

    if (groundFloorCount >= walkupMinGroundFloors) {
      walkupBuildingCount += 1;
      walkupHouseholdCount += units;
    }
  }

  const sourceRecordCount = records.length;
  const unlocatedBuildingCount = Math.max(
    0,
    sourceRecordCount - geocodedBuildingCount
  );

  const coveragePercent = sourceRecordCount > 0
    ? geocodedBuildingCount / sourceRecordCount * 100
    : 100;

  return {
    householdCount,
    apartmentHouseholdCount,
    nonApartmentHouseholdCount,
    unknownHouseholdCount,

    sourceRecordCount,
    matchedBuildingCount: matched.length,
    residentialBuildingCount,

    geocodedBuildingCount,
    unlocatedBuildingCount,
    coveragePercent,

    elevatorBuildingCount,
    noElevatorBuildingCount,
    unknownElevatorBuildingCount,

    elevatorHouseholdCount,
    noElevatorHouseholdCount,
    unknownElevatorHouseholdCount,

    passengerElevatorCount,
    emergencyElevatorCount,

    walkupBuildingCount,
    walkupHouseholdCount,

    missingRecords: missing,
    breakdown: {
      housingType: housingTypeBreakdown,
      purpose: purposeBreakdown,
      unknownResidentialBuildingCount,
      matchedRecordCount: matched.length,
    },
  };
}


function publicDataField(source, ...keys) {
  if (!source || typeof source !== "object") return undefined;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  const lowered = new Map(
    Object.keys(source).map((key) => [String(key).toLowerCase(), key])
  );

  for (const key of keys) {
    const actual = lowered.get(String(key).toLowerCase());
    if (!actual) continue;
    const value = source[actual];
    if (value !== null && value !== undefined && value !== "") return value;
  }

  return undefined;
}

function decodeBuildingXmlEntities(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseBuildingXmlObject(fragment) {
  const result = {};
  const tagPattern = /<([A-Za-z_][A-Za-z0-9_.:-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = tagPattern.exec(String(fragment || ""))) !== null) {
    const key = match[1];
    const rawValue = match[2];
    if (/<[A-Za-z_]/.test(rawValue)) continue;
    result[key] = decodeBuildingXmlEntities(rawValue).trim();
  }

  return result;
}

function firstBuildingXmlTag(text, tagNames) {
  for (const name of tagNames) {
    const pattern = new RegExp(
      `<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,
      "i"
    );
    const match = String(text || "").match(pattern);
    if (match) return decodeBuildingXmlEntities(match[1]).trim();
  }
  return "";
}

function publicDataGatewayErrorFromObject(data) {
  if (!data || typeof data !== "object") return nul
```

### Excerpt 5 (157676-161676)

```js
plication/json, application/xml, text/xml, */*",
          },
          cf: { cacheTtl: 0, cacheEverything: false },
        },
        timeoutMs
      );

      const responseText = await res.text();
      const gatewayError = publicDataGatewayErrorFromText(responseText);
      if (gatewayError) throw publicDataGatewayHttpError(label, gatewayError);
      let data = null;
      let parseError = null;

      try {
        data = responseText
          ? parseBuildingPublicDataJson(responseText)
          : null;
      } catch (error) {
        parseError = error;
      }

      if (res.ok && data) return data;

      const error = httpError(
        502,
        `${label} request failed: ${
          parseError
            ? `response parse error: ${String(parseError)}`
            : snippet(responseText) || `HTTP ${res.status}`
        }`
      );
      lastError = error;

      if (
        attempt < maxAttempts &&
        publicDataRetryableStatus(res.status)
      ) {
        await waitForPublicDataRetry(attempt);
        continue;
      }

      throw error;
    } catch (error) {
      lastError = error;
      if (
        attempt < maxAttempts &&
        publicDataRetryableError(error)
      ) {
        await waitForPublicDataRetry(attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError || httpError(502, `${label} request failed`);
}

function kaptCodeOf(row) {
  return cleanBuildingText(
    publicDataField(row, "kaptCode", "kapt_code", "code", "aptCode")
  );
}

function kaptNameOf(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "kaptName",
      "kapt_name",
      "aptName",
      "apt_name",
      "complexName",
      "complex_name"
    )
  );
}

function kaptAddressOf(row) {
  const roadAddress = cleanBuildingText(
    publicDataField(
      row,
      "doroJuso",
      "doro_juso",
      "roadAddress",
      "road_address",
      "roadAddr"
    )
  );

  const parcelAddress = cleanBuildingText(
    publicDataField(
      row,
      "kaptAddr",
      "kapt_addr",
      "address",
      "addr",
      "jibunAddress",
      "jibun_address"
    )
  );

  const composed = [
    publicDataField(row, "as1"),
    publicDataField(row, "as2"),
    publicDataField(row, "as3"),
    publicDataField(row, "as4"),
  ].map(cleanBuildingText).filter(Boolean).join(" ");

  return {
    roadAddress,
    parcelAddress: parcelAddress || composed,
    preferredAddress: roadAddress || parcelAddress || composed,
  };
}

function kaptComplexKey(row) {
  const code = kaptCodeOf(row);
  if (code) return `kapt:${code}`;

  const address = kaptAddressOf(row).preferredAddress;
  const name = kaptNameOf(row);
  return `kapt:${normalizedBuildingAddress(address)}:${name}`;
}

function normalizeBuildingLegalDongCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(0, 10);
  return "";
}

function kaptGeocodingTarget(row) {
  const addresses = kaptAddressOf(row);
  const code = kaptCodeOf(row);
  const name = kaptNameOf(row) || null;
  const legalDongCode = normalizeBuildingLegalDongCode(
    row?.bjdCode ?? row?.bjd_code ?? row?.bjdongCode ?? row?.bjdong_code ??
    row?.legaldongCode ?? row?.legal_dong_code
  );

  // K-APT 목록 API는 주소가 as1/as2/as3까지만 내려오는 경우가 있다.
  // 기본정보에서 보강된 도로명/지번주소와 단지명을 모두 별칭으로 제공하여
  // 현재 coupangRouteMap.html의 Kakao addressSearch가 가장 구체적인 주소부터 찾게 한다.
  const rawAliases = [
    addresses.roadAddress,
    addresses.parcelAddress,
    addresses.preferredAddress,
    [addresses.roadAddress, name].filter(Boolean).join(" "),
    [addresses.parcelAddress, name].filter(Boolean).join(" "),
    [
      publicDataField(row, "as1"),
      publicDataField(row, "as2"),
      publicDataField(row, "as3"),
      publicDataField(row, "as4"),
      name,
    ].map(cleanBuildingText).filter(Boolean).join(" "),
  ];
  const addressAliases = [];
  const seenAliases = new Set();
  for (cons
```

### Excerpt 6 (195517-202222)

```js
ified_scope_parcel_v49_geocode_recovery",
    fallbackCount: sigunguRows.length,
    rawMatchedCount: matchedRows.length,
    scopeParcelMatchedCount,
    strictMatchedCount,
    uniqueScopeMatchedCount,
  };
}
function firstObjectFromPublicData(data, label) {
  const parts = publicDataResponseParts(data, label);
  if (parts.items.length) return parts.items[0];

  const response = data?.response ?? data?.Response ?? data ?? {};
  const body = parts.body || {};
  const candidates = [
    body?.item,
    body?.Item,
    body?.result,
    body?.Result,
    body?.data,
    body?.Data,
    response?.item,
    response?.Item,
    response?.result,
    response?.Result,
    data?.item,
    data?.Item,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length
    ) {
      return candidate;
    }
  }

  // K-APT JSON은 body 없이 최상위 객체 자체가 Item일 수 있다.
  const metadataKeys = new Set([
    "resultCode", "resultMsg", "header", "body", "response",
    "totalCount", "pageNo", "numOfRows"
  ]);
  const ownDataKeys = Object.keys(response || {}).filter(
    (key) => !metadataKeys.has(key)
  );
  if (ownDataKeys.length) return response;

  return {};
}

function kaptRawHouseholdCount(info) {
  const aliases = [
    "kaptdaCnt", "kaptDaCnt", "kapt_da_cnt", "kaptdacnt",
    "householdCount", "household_count", "hhldCnt", "hhld_cnt",
    "hoCnt", "ho_cnt"
  ];

  for (const source of [info?.basic, info?.detail, info?.list]) {
    const value = firstFiniteBuildingValue(
      ...aliases.map((key) => publicDataField(source, key))
    );
    if (value != null && value > 0) return Math.trunc(value);
  }

  return 0;
}

async function fetchKaptEndpointPair(env, kaptCode, basicUrl, detailUrl, version) {
  const [basicResult, detailResult] = await Promise.allSettled([
    fetchPublicDataJson(
      basicUrl,
      { kaptCode },
      env,
      `K-APT ${version} basic info`
    ),
    fetchPublicDataJson(
      detailUrl,
      { kaptCode },
      env,
      `K-APT ${version} detail info`
    ),
  ]);

  const basic = basicResult.status === "fulfilled"
    ? firstObjectFromPublicData(basicResult.value, `K-APT ${version} basic info`)
    : {};
  const detail = detailResult.status === "fulfilled"
    ? firstObjectFromPublicData(detailResult.value, `K-APT ${version} detail info`)
    : {};

  return {
    version,
    basic,
    detail,
    basicError: basicResult.status === "rejected"
      ? String(basicResult.reason || "failed")
      : null,
    detailError: detailResult.status === "rejected"
      ? String(detailResult.reason || "failed")
      : null,
    basicKeys: Object.keys(basic || {}).slice(0, 80),
    detailKeys: Object.keys(detail || {}).slice(0, 80),
  };
}

async function fetchKaptComplexInfo(env, complex) {
  const kaptCode = kaptCodeOf(complex);
  if (!kaptCode) {
    return {
      list: complex,
      basic: {},
      detail: {},
      diagnostics: {
        kaptCode: null,
        error: "missing_kapt_code",
        attempts: [],
      },
    };
  }

  const attempts = [];

  const v4 = await fetchKaptEndpointPair(
    env,
    kaptCode,
    KAPT_BASIC_INFO_URL,
    KAPT_DETAIL_INFO_URL,
    "V4"
  );
  attempts.push(v4);

  let selected = {
    list: complex,
    basic: v4.basic,
    detail: v4.detail,
  };

  // V4가 빈 객체 또는 0세대를 반환하면 V3로 한 번 더 확인한다.
  if (kaptRawHouseholdCount(selected) <= 0) {
    const v3 = await fetchKaptEndpointPair(
      env,
      kaptCode,
      KAPT_BASIC_INFO_V3_URL,
      KAPT_DETAIL_INFO_V3_URL,
      "V3"
    );
    attempts.push(v3);

    const v3Info = {
      list: complex,
      basic: v3.basic,
      detail: v3.detail,
    };

    if (
      kaptRawHouseholdCount(v3Info) > kaptRawHouseholdCount(selected) ||
      Object.keys(selected.basic || {}).length === 0
    ) {
      selected = v3Info;
    }
  }

  return {
    ...selected,
    diagnostics: {
      kaptCode,
      listName: kaptNameOf(complex) || null,
      listAddress: kaptAddressOf(complex).preferredAddress || null,
      householdCount: kaptRawHouseholdCount(selected),
      attempts: attempts.map((attempt) => ({
        version: attempt.version,
        basicError: attempt.basicError,
        detailError: attempt.detailError,
        basicKeys: attempt.basicKeys,
        detailKeys: attempt.detailKeys,
      })),
    },
  };
}


function kaptAddressHasSpecificNumberV50(row) {
  const addresses = kaptAddressOf(row);
  return [addresses.roadAddress, addresses.parcelAddress, addresses.preferredAddress]
    .some((value) => /\d/.test(cleanBuildingText(value)));
}

function mergeKaptRowWithBasicInfoV50(listRow, basicRow) {
  if (!basicRow || typeof basicRow !== "object" || !Object.keys(basicRow).length) {
    return listRow;
  }
  // 시군구/법정동 목록에만 존재하는 bjdCode/as1~as4와 scope 결속 필드는 보존하고,
  // 기본정보의 kaptAddr/doroJuso/세대수/동수 같은 더 구체적인 값을 덮어쓴다.
  return {
    ...listRow,
    ...basicRow,
    ...kaptScopeBindingFields(listRow),
    __kaptBasicAddressEnrichedV50: true,
  };
}

async function fetchKaptBasicAddressV50(env, complex) {
  const kaptCode = kaptCodeOf(complex);
  if (!kaptCode || kaptAddressHasSpecificNumberV50(complex)) {
    return { row: complex, enriched: false, attempted: false, error: null };
  }

  const endpoints = [
    { url: KAPT_BASIC_INFO_URL, version: "V4" },
    { url: KAPT_BASIC_INFO_V3_URL, version: "V3" },
  ];
  let lastError = null;
  let best = complex;

  for (const endpoint of endpoints) {
    try {
      const data = await fetchPublicDataJson(
        endpoint.url,
        { kaptCode },
        env,
        `K-APT ${endpoint.version} basic address pre-geocode V50`
      );
      const basic = firstObjectFromPublicData(
        data,
        `K-APT ${endpoint.version} basic address pre-geocode V50`
      );
      if (!basic || !Object.keys(basic).length) continue;
      best = mergeKaptRowWithBasicInfoV50(complex, basic);
      if (kaptAddressHasSpecificNumberV50(best)) {
        return { row: best, enriched: true, attempted: true, error: null };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    row: best,
    enriched: best !== complex,
    attempted: true,
    error: lastError ? String(lastError?.message || lastError) : null,
  };
}

async function enrichKaptGeocodingRowsV50(env, rows, legalDongCodes) {
  const legalSet = new Set(
    (legalDongCodes || [])
      .map((item) => String(item?.legalDongCode || "").replace(/\D/g, "").slice(0, 10))
      .filter((value) => /^\d{10}$/.test(value))
  );

  const candidates = [];
  const candidateKeys = new Set();
  for (const row of rows || []) {
    const key = kaptComple
```

### Excerpt 7 (203379-207379)

```js
enriched) enriched += 1;
    if (result?.error) failed += 1;
  });

  return {
    rows: (rows || []).map((row) => replacements.get(kaptComplexKey(row)) || row),
    attempted: candidates.length,
    enriched,
    failed,
  };
}

async function mapBuildingWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const count = Math.min(
    Math.max(1, Math.trunc(concurrency) || 1),
    Math.max(1, items.length)
  );

  await Promise.all(Array.from({ length: count }, worker));
  return results;
}

function firstFiniteBuildingValue(...values) {
  for (const value of values) {
    const n = finiteBuildingNumber(value);
    if (n != null) return n;
  }
  return null;
}

function kaptInfoValue(info, ...keys) {
  for (const source of [info?.basic, info?.detail, info?.list]) {
    const value = publicDataField(source, ...keys);
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
}

function normalizedKaptInfo(info, location) {
  const directHouseholds = firstFiniteBuildingValue(
    kaptInfoValue(
      info,
      "kaptdaCnt",
      "kaptDaCnt",
      "kapt_da_cnt",
      "kaptdacnt",
      "householdCount",
      "household_count",
      "hhldCnt",
      "hhld_cnt",
      "hoCnt",
      "ho_cnt"
    )
  );

  const areaBandHouseholds = [
    ["kaptMparea_60", "kaptMparea60", "kapt_mparea_60"],
    ["kaptMparea_85", "kaptMparea85", "kapt_mparea_85"],
    ["kaptMparea_135", "kaptMparea135", "kapt_mparea_135"],
    ["kaptMparea_136", "kaptMparea136", "kapt_mparea_136"],
  ].reduce((sum, aliases) => {
    const value = firstFiniteBuildingValue(
      ...aliases.map((key) => kaptInfoValue(info, key))
    );
    return sum + Math.max(0, Math.trunc(value || 0));
  }, 0);

  const households = Math.max(
    0,
    Math.trunc(
      directHouseholds != null && directHouseholds > 0
        ? directHouseholds
        : areaBandHouseholds
    )
  );

  const buildingCount = Math.max(
    1,
    Math.trunc(firstFiniteBuildingValue(
      kaptInfoValue(
        info,
        "kaptDongCnt",
        "kapt_dong_cnt",
        "dongCnt",
        "dong_count"
      )
    ) || 1)
  );

  const rawElevatorCount = firstFiniteBuildingValue(
    kaptInfoValue(
      info,
      // V4 기본정보의 승객용 승강기대수 필드(kaptdEcntp)를 최우선으로 포함한다.
      "kaptdEcntp",
      "kaptDEcntp",
      "kapt_elevator_passenger_cnt",
      "kaptdEcnt",
      "kaptDEcnt",
      "kaptEcnt",
      "kapt_elevator_cnt",
      "elevatorCnt",
      "elevator_count",
      "elvtCnt",
      "elvt_count"
    )
  );
  const elevatorKnown = rawElevatorCount != null;
  const elevatorCount = Math.max(0, Math.trunc(rawElevatorCount || 0));

  const maxFloorCount = Math.max(
    0,
    Math.trunc(firstFiniteBuildingValue(
      kaptInfoValue(
        info,
        "kaptTopFloor",
        "kapt_top_floor",
        "maxFloorCnt",
        "max_floor_count",
        "topFloor",
        "top_floor"
      )
    ) || 0)
  );

  const addresses = kaptAddressOf(info?.basic || info?.list || {});
  const listAddresses = kaptAddressOf(info?.list || {});
  const code = kaptCodeOf(info?.basic || {}) || kaptCodeOf(info?.list || {});
  const name = kaptNameOf(info?.basic || {}) || kaptNameOf(info?.list || {});

  return {
    key: code ? `kapt:${code}` : kaptComplexKey(info?.list || info?.basic || {}),
    kaptCode: code,
    name,
    address: addresses.preferredAddress || listAddresses.preferredAddress,
    households,
    householdsSource: directHouseholds != null && directHouseholds > 0
      ? "KAPT_TOTAL"
      : areaBandHouseholds > 0
        ? "KAPT_AREA_BANDS"
        : "KAPT_EMPTY",
    buildingCount,
    elevatorCount,
    elevatorKnown,
    maxFloorCount,
    location,
    // V46 scope binding을 K-APT 상세조회 뒤에도 보존한다.

```

### Excerpt 8 (306985-315225)

```js
20: parcelKey }
      : row;
    const stable = buildingRecordKey(normalizedRow) || buildingUnitRowStableKey(normalizedRow, 0);
    const dedupeKey = `${parcelKey || "NO_PARCEL"}|${stable || normalizedBuildingAddress(buildingRecordAddresses(normalizedRow).preferredAddress)}`;
    if (!dedupeKey || effectiveMatchSeenV51.has(dedupeKey)) return;
    effectiveMatchSeenV51.add(dedupeKey);
    effectiveMatchedBuildingRowsV51.push({
      ...match,
      row: normalizedRow,
      parcelKey: parcelKey || match?.parcelKey || null,
      scopeMatchReason: match?.scopeMatchReason || source,
    });
  };

  for (const match of prepared.matchedBuildingRows || []) {
    pushEffectiveMatchV51(match, match?.parcelKey || "", "building_title");
  }
  let recapMergedTitleRowCountV51 = 0;
  for (const parcelResult of unitSource.parcels || []) {
    const parcelKey = cleanBuildingText(parcelResult?.parcel?.key);
    for (const row of parcelResult?.recapRows || []) {
      const before = effectiveMatchedBuildingRowsV51.length;
      pushEffectiveMatchV51({
        row,
        location: parcelResult?.verifiedScopeEntryV51?.location || null,
        parcelKey,
      }, parcelKey, "recap_direct_parcel_v51");
      if (effectiveMatchedBuildingRowsV51.length > before) recapMergedTitleRowCountV51 += 1;
    }
  }

  const indexes = titleRowIndexes(effectiveMatchedBuildingRowsV51);

  const totals = {
    residentialUnitCount: 0,
    commercialUnitCount: 0,
    unclassifiedUnitCount: 0,
    deliveryUnitCount: 0,
    confirmedElevatorUnitCount: 0,
    inferredElevatorUnitCount: 0,
    noElevatorUnitCount: 0,
    unknownElevatorUnitCount: 0,
    residentialElevatorUnitCount: 0,
    residentialNoElevatorUnitCount: 0,
    residentialUnknownElevatorUnitCount: 0,
    commercialElevatorUnitCount: 0,
    commercialNoElevatorUnitCount: 0,
    commercialUnknownElevatorUnitCount: 0,
    passengerElevatorCount: 0,
    emergencyElevatorCount: 0,
    walkupBuildingCount: 0,
    walkupHouseholdCount: 0,
    authoritativeUnitCount: 0,
    estimatedUnitCount: 0,
  };

  const residentialBuildings = new Set();
  const commercialBuildings = new Set();
  const mixedUseBuildings = new Set();
  const countedUnits = new Set();
  const buildingElevatorCategories = new Map();
  const elevatorBuildingDiagnostics = new Map();
  const walkupBuildings = new Set();
  const contributorTotals = new Map();
  let commonAreaRecordCount = 0;
  let recapFallbackUnits = 0;
  let titleFallbackUnits = 0;
  let exclusiveUnits = 0;

  const unitDiagnostics = {
    matchedParcels: unitSource.parcels.length,
    areaRows: 0,
    exposRows: 0,
    floorRows: 0,
    recapRows: 0,
    housePriceRows: 0,
    candidateUnits: 0,
    parentlessCandidates: 0,
    ambiguousParentCandidates: 0,
    parcelsWithExclusiveUnits: 0,
    parcelsWithRecapFallback: 0,
    parcelsWithHousePriceFallback: 0,
    parcelsWithTitleFallback: 0,
    titleSupplementBuildings: 0,
    titleSupplementUnits: 0,
    titleSupplementAuthoritativeUnits: 0,
    titleSupplementEstimatedUnits: 0,
    mixedUseSplitBuildings: 0,
    mixedUseResidentialUnits: 0,
    mixedUseCommercialUnits: 0,
    kaptComplexes: normalizedKapt.length,
    verifiedScopeParcelCount: Number(unitSource?.diagnosticsV51?.verifiedScopeParcelCount || 0),
    detailScopeOnlyParcelCount: Number(unitSource?.diagnosticsV51?.detailScopeOnlyParcelCount || 0),
    detailKaptAddedParcelCount: Number(unitSource?.diagnosticsV51?.detailKaptAddedParcelCount || 0),
    recapMergedTitleRowCount: recapMergedTitleRowCountV51,
    kaptGeocodeBoundCount: Number(prepared?.scopeMatchDiagnostics?.verifiedKaptGeocodeParcel || 0),
  };

  const registerContributor = (key, payload) => {
    const normalizedKey = cleanBuildingText(key);
    const units = Math.max(0, Math.trunc(Number(payload?.units) || 0));
    if (!normalizedKey || !units) return;

    const previous = contributorTotals.get(normalizedKey) || {
      key: normalizedKey,
      name: payload?.name || null,
      address: payload?.address || null,
      source: payload?.source || null,
      estimateDetails: payload?.estimateDetails || null,
      residential: 0,
      commercial: 0,
      unclassified: 0,
      authoritative: 0,
      estimated: 0,
      total: 0,
    };

    const type = payload?.unitType;
    if (type === "residential") previous.residential += units;
    else if (type === "commercial") previous.commercial += units;
    else previous.unclassified += units;
    if (payload?.confidence === "estimated") previous.estimated += units;
    else previous.authoritative += units;
    previous.total += units;
    contributorTotals.set(normalizedKey, previous);
  };

  const elevatorRank = {
    unknown: 0,
    none: 1,
    inferred: 2,
    confirmed: 3,
  };

  const recordBuildingElevator = (buildingKey, category) => {
    const key = cleanBuildingText(buildingKey);
    if (!key) return;
    const next = category || "unknown";
    const previous = buildingElevatorCategories.get(key);
    if (!previous || (elevatorRank[next] ?? 0) > (elevatorRank[previous] ?? 0)) {
      buildingElevatorCategories.set(key, next);
    }
  };

  const addCount = (
    unitType,
    units,
    buildingKey,
    elevator,
    contributor,
    confidence = "authoritative"
  ) => {
    const count = Math.max(0, Math.trunc(Number(units) || 0));
    if (!count) return;

    if (unitType === "residential") {
      totals.residentialUnitCount += count;
      residentialBuildings.add(buildingKey);
    } else if (unitType === "commercial") {
      totals.commercialUnitCount += count;
      commercialBuildings.add(buildingKey);
    } else {
      totals.unclassifiedUnitCount += count;
    }

    if (confidence === "estimated") totals.estimatedUnitCount += count;
    else totals.authoritativeUnitCount += count;

    addUnitToElevatorTotals(totals, unitType, elevator.category, count);
    recordBuildingElevator(buildingKey, elevator.category);
    registerElevatorBuildingDiagnostic(
      elevatorBuildingDiagnostics,
      buildingKey,
      elevator,
      count,
      unitType,
      contributor
    );
    registerContributor(buildingKey, {
      ...contributor,
      units: count,
      unitType,
      confidence,
    });

    if (
      elevator.category === "none" &&
      elevator.floors >= prepared.walkupMinGroundFloors
    ) {
      totals.walkupHouseholdCount += count;
      walkupBuildings.add(buildingKey);
    }
  };

  const supplementTitleUnitEvidence = (
    parcelMatches,
    parcelKey,
    coveredByKapt,
    countedUnitCountByBuilding,
    sourceTag = "TITLE_RECONCILE",
    floorRows = [],
    elevatorEvidenceRows = [],
    parcelDescriptor = null,
    sharedElevatorEvidence = null
  ) => {
    let supplementedUnits = 0;
    let supplementedBuildings = 0;

    for (const fallback of titleParcelFallback(parcelMatches)) {
      if (coveredByKapt && fallback.classification.apartment) continue;

      const buildingKey = buildingRecordKey(fallback.row) || parcelKey;
      const alreadyCounted = Math.max(
        0,
        Math.trunc(Number(countedUnitCountByBuilding.get(buildingKey)) || 0)
      );
      const baseTargetUnits = Math.max(0, Math.trunc(Number(fallback.units) || 0));
      const floorEstimate = floorOverviewEstimatedUnitEvidence(
        floorRows,
        fallback.row,
        fallback.classification,
        parcelMatches
      );
      const reconciled = reconcileTitleUnitsWithFloorEvidence(fallback, floorEstimate);
      const targetUnits = Math.max(baseTargetUnits, reconciled.units || 0);
      if (targetUnits <= alreadyCounted) continue;

      const delta = targetUnits - alreadyCounted;
      const elevator = buildingElevatorProfile(
        fallback.row,
        fallback.classification,
        parcelMatches,
        {
          unitCount: targetUnits,
          elevatorFacilityRows: elevatorFacilityRowsForBuilding(
            elevatorEvidenceRows,
            fallback.row,
            parcelDescriptor,
            indexes,
            parcelMatches
          ),
          sharedElevatorEvidence,
        }
      );
      const split = splitBuildingUnitsByUse(
        delta,
        fallback.classification,
        floorRows,
        fallback.row,
        parcelMatches
  
```

### Excerpt 9 (332816-342844)

```js
_HUB_TITLE_FALLBACK",
          name: cleanBuildingText(fallback.row?.bldNm ?? fallback.row?.bld_nm) || null,
          address: buildingRecordAddresses(fallback.row).preferredAddress || null,
          estimateDetails: {
            ...(fallback.estimateDetails || {}),
            mixedUseSplitMethod: part.method || null,
            floorDistribution: part.distribution || null,
            floorUnitEstimate: floorEstimate || null,
            floorReconcileReason: reconciled.reason || null,
          },
        }, reconciled.usedFloorOverride ? "estimated" : (fallback.confidence || "estimated"));
        if (fallback.classification?.mixedUse) {
          if (part.type === "residential") unitDiagnostics.mixedUseResidentialUnits += part.units;
          if (part.type === "commercial") unitDiagnostics.mixedUseCommercialUnits += part.units;
        }
      }
      if (fallback.classification?.mixedUse && titleSplit.length > 1) unitDiagnostics.mixedUseSplitBuildings += 1;
      parcelTitleUnits += effectiveUnits;
      titleFallbackUnits += effectiveUnits;
      totals.passengerElevatorCount += elevator.passenger;
      totals.emergencyElevatorCount += elevator.emergency;
    }
    if (parcelTitleUnits > 0) unitDiagnostics.parcelsWithTitleFallback += 1;
  }

  for (const key of residentialBuildings) {
    if (commercialBuildings.has(key)) mixedUseBuildings.add(key);
  }

  totals.deliveryUnitCount =
    totals.residentialUnitCount +
    totals.commercialUnitCount +
    totals.unclassifiedUnitCount;

  const topContributors = [...contributorTotals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 100);
  const kaptHouseholds = normalizedKapt.reduce((sum, row) => sum + row.households, 0);
  const elevatorSummary = summarizeElevatorBuildingDiagnostics(
    elevatorBuildingDiagnostics
  );
  const uniqueMatchedBuildingKeys = new Set(
    (effectiveMatchedBuildingRowsV51 || [])
      .map((match) => buildingRecordKey(match?.row || {}))
      .filter(Boolean)
  );

  // K-APT로 대체 집계한 아파트는 건축물대장 동 레코드 + K-APT 단지를 이중으로 세지 않는다.
  // 실제 K-APT 동수로 대체하고, K-APT와 연결되지 않은 건축물대장만 별도로 더한다.
  const kaptCoveredTitleKeys = new Set();
  for (const complex of normalizedKapt) {
    for (const match of effectiveMatchedBuildingRowsV51 || []) {
      const row = match?.row || {};
      if (!buildingHousingClassification(row).apartment) continue;
      if (!kaptMatchesTitleParcel(complex, [match])) continue;
      const key = buildingRecordKey(row);
      if (key) kaptCoveredTitleKeys.add(key);
    }
  }
  const unmatchedTitleBuildingCount = [...uniqueMatchedBuildingKeys]
    .filter((key) => !kaptCoveredTitleKeys.has(key)).length;
  const kaptBuildingCount = normalizedKapt.reduce(
    (sum, complex) => sum + Math.max(1, Math.trunc(Number(complex.buildingCount) || 1)),
    0
  );
  const matchedBuildingCount = unmatchedTitleBuildingCount + kaptBuildingCount;

  return {
    detailContinuation: unitSource.detailContinuation || { required: false, evidence: [] },
    householdCount: totals.residentialUnitCount,
    apartmentHouseholdCount: kaptHouseholds,
    nonApartmentHouseholdCount: Math.max(0, totals.residentialUnitCount - kaptHouseholds),
    unknownHouseholdCount: 0,
    residentialUnitCount: totals.residentialUnitCount,
    commercialUnitCount: totals.commercialUnitCount,
    unclassifiedUnitCount: totals.unclassifiedUnitCount,
    deliveryUnitCount: totals.deliveryUnitCount,
    residentialBuildingUnitCount: residentialBuildings.size,
    commercialBuildingUnitCount: commercialBuildings.size,
    mixedUseBuildingCount: mixedUseBuildings.size,
    exclusiveUnitRecordCount: countedUnits.size,
    commonAreaRecordCount,
    confirmedElevatorUnitCount: totals.confirmedElevatorUnitCount,
    inferredElevatorUnitCount: totals.inferredElevatorUnitCount,
    noElevatorUnitCount: totals.noElevatorUnitCount,
    unknownElevatorUnitCount: totals.unknownElevatorUnitCount,
    residentialElevatorUnitCount: totals.residentialElevatorUnitCount,
    residentialNoElevatorUnitCount: totals.residentialNoElevatorUnitCount,
    residentialUnknownElevatorUnitCount: totals.residentialUnknownElevatorUnitCount,
    commercialElevatorUnitCount: totals.commercialElevatorUnitCount,
    commercialNoElevatorUnitCount: totals.commercialNoElevatorUnitCount,
    commercialUnknownElevatorUnitCount: totals.commercialUnknownElevatorUnitCount,
    sourceRecordCount: prepared.sourceRecordCount,
    matchedBuildingCount,
    residentialBuildingCount: residentialBuildings.size,
    geocodedBuildingCount: prepared.geocodedBuildingCount,
    unlocatedBuildingCount: prepared.unlocatedBuildingCount,
    coveragePercent: prepared.coveragePercent,
    // V40: 공식 양수 등록 또는 건축HUB 승강기 시설 직접 증거만 엘베 O 건물로 집계한다.
    elevatorBuildingCount: elevatorSummary.buildingCounts.confirmed,
    noElevatorBuildingCount: elevatorSummary.buildingCounts.none,
    unknownElevatorBuildingCount: elevatorSummary.buildingCounts.unknown,
    elevatorHouseholdCount: totals.confirmedElevatorUnitCount,
    noElevatorHouseholdCount: totals.noElevatorUnitCount,
    unknownElevatorHouseholdCount: totals.unknownElevatorUnitCount,
    passengerElevatorCount: totals.passengerElevatorCount,
    emergencyElevatorCount: totals.emergencyElevatorCount,
    walkupBuildingCount: walkupBuildings.size,
    walkupHouseholdCount: totals.walkupHouseholdCount,
    unitSourceComplete:
      unitSource.complete &&
      kaptInfoFailures.length === 0 &&
      totals.estimatedUnitCount === 0,
    unitSourceWarnings: [
      ...unitSource.warnings,
      ...kaptInfoFailures.map((row) =>
        `K_APT_INFO_EMPTY: ${row.kaptCode || row.name || "unknown"}`
      ),
      ...(totals.estimatedUnitCount > 0
        ? [`ESTIMATED_UNITS: ${totals.estimatedUnitCount}`]
        : []),
    ],
    breakdown: {
      algorithm: {
        version: BUILDING_STATS_SOURCE_VERSION,
        parcelIdentityRequired: true,
        polygonInsideWins: true,
        scope: prepared.scopeMatchDiagnostics,
      },
      deliveryUnits: {
        residential: totals.residentialUnitCount,
        commercial: totals.commercialUnitCount,
        unclassified: totals.unclassifiedUnitCount,
        total: totals.deliveryUnitCount,
        exclusiveUnitRows: exclusiveUnits,
        recapFallbackUnits,
        titleFallbackUnits,
      },
      elevator: {
        unitCounts: {
          confirmed: totals.confirmedElevatorUnitCount,
          inferred: totals.inferredElevatorUnitCount,
          none: totals.noElevatorUnitCount,
          unknown: totals.unknownElevatorUnitCount,
        },
        buildingCounts: elevatorSummary.buildingCounts,
        zeroOverrideBuildingCount: elevatorSummary.zeroOverrideBuildingCount,
        inferencePolicy: {
          mode: "OFFICIAL_COUNT_OR_REGISTERED_FACILITY",
          registeredPositiveIsElevator: true,
          registeredFacilityIsElevator: true,
          registeredZeroCanBeOverriddenByFacility: true,
          registeredZeroIsNoElevatorWithoutFacility: true,
          missingValueIsUnknownWithoutFacility: true,
          inferredElevatorIncludedInConfirmed: false,
        },
        samples: elevatorSummary.samples,
      },
      dataQuality: {
        authoritativeUnitCount: totals.authoritativeUnitCount,
        estimatedUnitCount: totals.estimatedUnitCount,
        authoritativePercent: totals.deliveryUnitCount > 0
          ? Math.round(totals.authoritativeUnitCount / totals.deliveryUnitCount * 1000) / 10
          : 0,
        estimatedPercent: totals.deliveryUnitCount > 0
          ? Math.round(totals.estimatedUnitCount / totals.deliveryUnitCount * 1000) / 10
          : 0,
        matchedBuildingCount,
        candidateBuildingParcelCount: prepared.parcelGroups.length,
        candidateGeocodingTargetCount:
          prepared.scopeMatchDiagnostics?.candidateGeocodingTargets ?? null,
        resolvedGeocodingTargetCount:
          prepared.scopeMatchDiagnostics?.resolvedGeocodingTargets ?? null,
        unresolvedGeocodingTargetCount:
          prepared.scopeMatchDiagnostics?.unresolvedGeocodingTargets ?? null,
        averageUnitsPerMatchedBuilding: matchedBuildingCount > 0
          ? Math.round(totals.deliveryUnitCount / matchedBuildingCount * 100) / 100
          : 0,
        onePerBuildingSuspicion: (
          matchedBuildingCount >= 10 &&
          totals.deliveryUnitCount <= matchedBuildingCount * 1.2 &&
          exclusiveUnits === 0
        ),
        titleSupplementBuildings: unitDiagnostics.titleSupplementBuildings,
        titleSupplementUnits: unitDiagnostics.titleSupplementUnits,
        titleSupplementAuthoritativeUnits: unitDiagnostics.titleSupplementAuthoritativeUnits,
        titleSupplementEstimatedUnits: unitDiagnostics.titleSupplementEstimatedUnits,
        ambiguousParentCandidates: unitDiagnostics.ambiguousParentCandidates,
        mixedUseSplitBuildings: unitDiagnostics.mixedUseSplitBuildings,
        mixedUseResidentialUnits: unitDiagnostics.mixedUseResidentialUnits,
        mixedUseCommercialUnits: unitDiagnostics.mixedUseCommercialUnits,
        detailContinuation: unitSource.detailContinuation
          ? {
              required: unitSource.detailContinuation.required === true,
              processedParcelCount: unitSource.detailContinuation.processedParcelCount || 0,
              batchParcelCount: unitSource.detailContinuation.batchParcelCount || 0,
              remainingParcelCount: unitSource.detailContinuation.remainingParcelCount || 0,
              totalDetailParcelCount: unitSource.detailContinuation.totalDetailParcelCount || 0,
            }
          : null,
        bulkExclusive: unitSource.bulkDiagnostics || null,
      },
      kapt: {
        requestedComplexCount: prepared.matchedKapt.length,
        complexCount: normalizedKapt.length,
        failedComplexCount: kaptInfoFailures.length,
        householdCount: kaptHouseholds,
        failures: kaptInfoFailures,
        complexes: normalizedKapt.map((row) => ({
          kaptCode: row.kaptCode || null,
          name: row.nam
```

### Excerpt 10 (344452-348480)

```js
function titleFallbackIdentity(row, index = 0) {
  const managementKey = cleanBuildingText(
    row?.mgmBldrgstPk ?? row?.mgm_bldrgst_pk
  );
  if (managementKey) return `mgm:${managementKey}`;

  const parcel = buildingParcelDescriptor(row);
  const dong = normalizeDeliveryUnitName(row?.dongNm ?? row?.dong_nm ?? "");
  const name = normalizeDeliveryUnitName(row?.bldNm ?? row?.bld_nm ?? "");
  return [
    parcel?.key || "NO_PARCEL",
    dong || name || `ROW_${index}`,
  ].join("|");
}

function titleFallbackParcelKey(row, index = 0) {
  const parcel = buildingParcelDescriptor(row);
  return parcel?.key || `record:${titleFallbackIdentity(row, index)}`;
}

function titleFallbackUnitType(classification) {
  if (classification?.residential) return "residential";
  if (classification?.commercial) return "commercial";
  return "unclassified";
}

function buildTitleBaselineFallbackAggregate(prepared) {
  const matches = Array.isArray(prepared?.matchedBuildingRows)
    ? prepared.matchedBuildingRows
    : [];

  const parcelGroups = new Map();
  matches.forEach((match, index) => {
    const row = match?.row;
    if (!row || isAncillaryBuildingRecord(row)) return;
    const key = titleFallbackParcelKey(row, index);
    if (!parcelGroups.has(key)) parcelGroups.set(key, []);
    parcelGroups.get(key).push({ match, row, index });
  });

  const totals = {
    residentialUnitCount: 0,
    commercialUnitCount: 0,
    unclassifiedUnitCount: 0,
    confirmedElevatorUnitCount: 0,
    inferredElevatorUnitCount: 0,
    noElevatorUnitCount: 0,
    unknownElevatorUnitCount: 0,
    residentialElevatorUnitCount: 0,
    residentialNoElevatorUnitCount: 0,
    residentialUnknownElevatorUnitCount: 0,
    commercialElevatorUnitCount: 0,
    commercialNoElevatorUnitCount: 0,
    commercialUnknownElevatorUnitCount: 0,
    passengerElevatorCount: 0,
    emergencyElevatorCount: 0,
    walkupBuildingCount: 0,
    walkupHouseholdCount: 0,
  };

  const residentialBuildings = new Set();
  const commercialBuildings = new Set();
  const mixedUseBuildings = new Set();
  const countedBuildings = new Set();
  const contributors = [];
  const elevatorBuildingDiagnostics = new Map();
  const walkupBuildings = new Set();

  const add = (unitType, units, row, buildingKey, source, peerMatches = []) => {
    const count = Math.max(0, Math.trunc(Number(units) || 0));
    if (!count) return;

    const classification = buildingHousingClassification(row);
    const elevator = buildingElevatorProfile(
      row,
      classification,
      peerMatches,
      { unitCount: count }
    );

    if (unitType === "residential") {
      totals.residentialUnitCount += count;
      residentialBuildings.add(buildingKey);
    } else if (unitType === "commercial") {
      totals.commercialUnitCount += count;
      commercialBuildings.add(buildingKey);
    } else {
      totals.unclassifiedUnitCount += count;
    }

    addUnitToElevatorTotals(totals, unitType, elevator.category, count);
    registerElevatorBuildingDiagnostic(
      elevatorBuildingDiagnostics,
      buildingKey,
      elevator,
      count,
      unitType,
      {
        source,
        name: cleanBuildingText(row?.bldNm ?? row?.bld_nm) || null,
        address: buildingRecordAddresses(row).preferredAddress || null,
      }
    );

    if (
      elevator.category === "none" &&
      elevator.floors >= Number(prepared?.walkupMinGroundFloors || 3)
    ) {
      walkupBuildings.add(buildingKey);
      totals.walkupHouseholdCount += count;
    }

    if (!countedBuildings.has(buildingKey)) {
      countedBuildings.add(buildingKey);
      totals.passengerElevatorCount += elevator.passenger || 0;
      totals.emergencyElevatorCount += elevator.emergency || 0;
    }

    contributors.push({
      key: buildingKey,
      name: cleanBuildingText(row?.bldNm ?? row?.bld_nm) || null,
      address: buildingRecordAddresses(row).preferredAddress || null,
      source,
      unitType,
      units: count,
      rawCounts: {
        hhldCnt: nonNegativeBuildingI
```

### Excerpt 11 (354375-358555)

```js
 },
        samples: elevatorSummary.samples,
      },
      titleBaselineFallback: {
        parcelCount: parcelGroups.size,
        matchedTitleRowCount: matches.length,
        contributorCount: contributors.length,
        contributors: contributors
          .sort((a, b) => b.units - a.units)
          .slice(0, 100),
      },
    },
  };
}

function nextBuildingStatsExpiry() {
  const date = new Date();
  date.setUTCFullYear(
    date.getUTCFullYear() + BUILDING_STATS_CACHE_YEARS
  );
  return date.toISOString();
}

function buildingStatsDatabaseRow({
  scope,
  geometryHash,
  polygonAreaM2,
  aggregate,
  records,
  walkupMinGroundFloors,
  locationSource,
  sourceMode = "BUILDING_HUB+K_APT",
  sourceVersion = BUILDING_STATS_SOURCE_VERSION,
  sourceWarnings = [],
}) {
  const now = new Date().toISOString();

  return {
    scope_type: scope.scopeType,
    scope_key: scope.scopeKey,
    geometry_hash: geometryHash,

    zipcode: scope.zipcode,
    subsubroute_id: scope.subsubrouteId,
    subroute_id: scope.subrouteId,
    vendor_id: scope.vendorId,
    display_name: scope.displayName,

    polygon_area_m2: polygonAreaM2,

    household_count: aggregate.householdCount,
    apartment_household_count: aggregate.apartmentHouseholdCount,
    non_apartment_household_count: aggregate.nonApartmentHouseholdCount,
    unknown_household_count: aggregate.unknownHouseholdCount,

    residential_unit_count: aggregate.residentialUnitCount,
    commercial_unit_count: aggregate.commercialUnitCount,
    unclassified_unit_count: aggregate.unclassifiedUnitCount,
    delivery_unit_count: aggregate.deliveryUnitCount,

    residential_building_unit_count: aggregate.residentialBuildingUnitCount,
    commercial_building_unit_count: aggregate.commercialBuildingUnitCount,
    mixed_use_building_count: aggregate.mixedUseBuildingCount,
    exclusive_unit_record_count: aggregate.exclusiveUnitRecordCount,
    common_area_record_count: aggregate.commonAreaRecordCount,

    confirmed_elevator_unit_count: aggregate.confirmedElevatorUnitCount,
    inferred_elevator_unit_count: aggregate.inferredElevatorUnitCount,
    no_elevator_unit_count: aggregate.noElevatorUnitCount,
    unknown_elevator_unit_count: aggregate.unknownElevatorUnitCount,

    residential_elevator_unit_count: aggregate.residentialElevatorUnitCount,
    residential_no_elevator_unit_count: aggregate.residentialNoElevatorUnitCount,
    residential_unknown_elevator_unit_count: aggregate.residentialUnknownElevatorUnitCount,
    commercial_elevator_unit_count: aggregate.commercialElevatorUnitCount,
    commercial_no_elevator_unit_count: aggregate.commercialNoElevatorUnitCount,
    commercial_unknown_elevator_unit_count: aggregate.commercialUnknownElevatorUnitCount,

    unit_analysis_version: BUILDING_STATS_SOURCE_VERSION,
    unit_analysis_method: "PAID_FULL_SCOPE_TITLE+DIRECT_PARCEL_EXPOS_AREA_FLOOR+LEGALDONG_KAPT+CONFIDENCE_VALIDATION",

    source_record_count: aggregate.sourceRecordCount,
    matched_building_count: aggregate.matchedBuildingCount,
    residential_building_count: aggregate.residentialBuildingCount,

    geocoded_building_count: aggregate.geocodedBuildingCount,
    unlocated_building_count: aggregate.unlocatedBuildingCount,
    coverage_percent: Math.round(aggregate.coveragePercent * 100) / 100,

    elevator_building_count: aggregate.elevatorBuildingCount,
    no_elevator_building_count: aggregate.noElevatorBuildingCount,
    unknown_elevator_building_count: aggregate.unknownElevatorBuildingCount,

    elevator_household_count: aggregate.elevatorHouseholdCount,
    no_elevator_household_count: aggregate.noElevatorHouseholdCount,
    unknown_elevator_household_count: aggregate.unknownElevatorHouseholdCount,

    passenger_elevator_count: aggregate.passengerElevatorCount,
    emergency_elevator_count: aggregate.emergencyElevatorCount,

    walkup_min_ground_floors: walkupMinGroundFloors,
    walkup_building_count: aggregate.walkupBuildingCount,
    walkup_household_count: aggregate.walkupHouseholdCount,

    source: sourceMode,
    source_version: sourceVersion,
    source_reference_date: latestBuildingReferenceDate(records),
    source_fetched_at: no
```

### Excerpt 12 (464858-467447)

```js
item?.lgvReplcCd ?? null,
  };

  return jsonResp({
    zipcode,
    srid: 5179,
    center5179,
    polygon5179,
    metadata,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && (path === "/health" || path === "/share/health")) {
        return jsonResp({
          ok: true,
          service: "zipcode-boundary-share",
          version: ZIP_SHARE_WORKER_VERSION,
          kvReady: !!env?.ZIP_SHARE_KV,
          terrainMode: "process_cpu_safe_symmetric_slope_scope_area_cache",
          terrainEndpoint: COPERNICUS_PROCESS_URL,
          buildingStatsVersion: BUILDING_STATS_SOURCE_VERSION,
          buildingStatsMode: "v60_deterministic_parcel_cache_selective_detail",
          buildingHubTimeoutMs: BUILDING_HUB_TIMEOUT_MS,
          kaptTimeoutMs: KAPT_TIMEOUT_MS
        });
      }

      if (request.method === "POST" && (path === "/terrain" || path === "/zip/terrain")) {
        return await handleTerrainRequest(request, env);
      }

      if (
        request.method === "POST" &&
        (
          path === "/building/stats" ||
          path === "/households" ||
          path === "/zip/building-stats"
        )
      ) {
        return await handleBuildingStatsRequest(request, env);
      }

      if (request.method === "POST" && (path === "/share/create" || path === "/create")) {
        return await handleZipShareCreate(request, env);
      }

      if (request.method === "GET" && (path === "/share/verify" || path === "/verify")) {
        return await handleZipShareVerify(request, env, url);
      }

      if (request.method === "GET" && (path === "/zip/share" || path === "/share/view" || path === "/share")) {
        return await handleZipSharePreview(request, env, url);
      }

      if (request.method === "GET" && (path === "/" || path === "/zip")) {
        return await handleZipBoundaryRequest(url);
      }

      return jsonResp({ error: "Not Found" }, 404);
    } catch (err) {
      return jsonResp(
        {
          error: err?.message || "Worker 내부 예외 발생",
          detail: String(err),
          stack: err?.stack || null,
        },
        Number(err?.status || 500)
      );
    }
  },
};

--088a9dda2bbf77cc466a34d3da6846ae51dac5233664e97d1f1471752d83--

```
