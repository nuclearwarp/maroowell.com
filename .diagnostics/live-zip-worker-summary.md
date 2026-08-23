# Live zip Worker diagnostic

```text
accounts_http=200
account_name=Brain@maroowell.com's Account
scripts_http=200
script_name=admin-access
source_http=200 bytes=16362
script_name=cleansinghistory
source_http=200 bytes=23991
script_name=coupangcamp
source_http=200 bytes=32310
script_name=dragoncar
source_http=200 bytes=26796
script_name=freshbag
source_http=200 bytes=19954
script_name=login
source_http=200 bytes=1569
script_name=maroowell
source_http=200 bytes=89362
script_name=maroowell-app-download
source_http=200 bytes=8363
script_name=maroowellaccount
source_http=200 bytes=17812
script_name=maroowellfreshbag
source_http=200 bytes=17727
script_name=maroowellinfo
source_http=200 bytes=15716
script_name=maroowellpayout
source_http=200 bytes=752
script_name=maroowellroute
source_http=200 bytes=10974
script_name=newssearch
source_http=200 bytes=6932
script_name=payout
source_http=200 bytes=5224
script_name=purple-resonance-61ea
source_http=200 bytes=489382
matched_account_name=Brain@maroowell.com's Account
matched_script=purple-resonance-61ea
```

source_sha256: dd8f70cb001ec97c924d42e89562a9e50a6855405b543afad0d6e5ed82855aae

## Relevant source excerpts

```js

// ...
 2299 |   "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo";
 2300 | const BUILDING_HUB_EXPOS_URL =
 2301 |   "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposInfo";
 2302 | const BUILDING_HUB_EXPOS_AREA_URL =
 2303 |   "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo";
 2304 | const BUILDING_HUB_HOUSE_PRICE_URL =
 2305 |   "https://apis.data.go.kr/1613000/BldRgstHubService/getBrHsprcInfo";
 2306 | const BUILDING_HUB_FLOOR_URL =
 2307 |   "https://apis.data.go.kr/1613000/BldRgstHubService/getBrFlrOulnInfo";
 2308 | // V66: 아파트 단지 내 상가는 건축물대장 전유부가 아니라 주택건설사업계획승인
 2309 | // "복리분양시설"에만 남는 구축 단지가 있다. 건축HUB 주택인허가 공식 원천을
 2310 | // K-APT로 확정된 아파트 단지에 한해서 보조 근거로 사용한다.
 2311 | const HOUSING_PERMIT_WELFARE_LOTOUT_URL =
 2312 |   "https://apis.data.go.kr/1613000/HsPmsHubService/getHpWlfarLotouFcInfo";
 2313 | const HOUSING_PERMIT_MGM_COOP_WELFARE_URL =
 2314 |   "https://apis.data.go.kr/1613000/HsPmsHubService/getHpMgmCoopSbsdWlfarFcInfo";
 2315 | const KAPT_LEGAL_DONG_LIST_URL =
 2316 |   "https://apis.data.go.kr/1613000/AptListService3/getLegaldongAptList3";
 2317 | const KAPT_BASIC_INFO_URL =
 2318 |   "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4";
 2319 | const KAPT_DETAIL_INFO_URL =
 2320 |   "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4";
 2321 | const KAPT_BASIC_INFO_V3_URL =
 2322 |   "https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfoV3";
 2323 | const KAPT_DETAIL_INFO_V3_URL =
 2324 |   "https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusDtlInfoV3";
 2325 | 
 2326 | // 이 값이 바뀌면 과거의 부정확한 캐시는 자동으로 무효화된다.
 2327 | // V60: 국토부 공식 필지조회 + 법정동 표제부 resumable cache + 선택적 전유부 상세조회.
 2328 | // K-APT는 정확히 결속된 아파트 세대수/승강기 보강에만 사용하며 동일 필지 타 건물로 전파하지 않는다.
 2329 | // 연면적/층수/주차대수 기반 배송호수 추정은 사용하지 않는다.
 2330 | const BUILDING_STATS_SOURCE_VERSION =
 2331 |   "[long-token-redacted]";
 2332 | 
 2333 | const BUILDING_HUB_PAGE_SIZE = 1000;
 2334 | const BUILDING_HUB_MAX_PAGES_PER_DONG = 80;
 2335 | const BUILDING_HUB_MAX_LEGAL_DONG_CODES = 12;
 2336 | const BUILDING_HUB_MAX_SOURCE_RECORDS = 30000;
 2337 | // 공공데이터포털은 간헐적으로 12초 이상 응답이 지연된다.
 2338 | // 기존 12초 단일 시도는 한 서비스 지연만으로 전체 분석을 500으로 끝냈다.
 2339 | const BUILDING_HUB_TIMEOUT_MS = 22000;
 2340 | const BUILDING_HUB_MAX_ATTEMPTS = 2;
 2341 | // V57: 법정동 표제부 bulk는 누락 페이지가 생겨도 뒤의 scope-parcel exact fallback으로 보완한다.
 2342 | // 한 페이지만 20~40초씩 붙잡지 않도록 bulk page 자체는 짧게 1회 시도한다.
 2343 | const BUILDING_TITLE_PAGE_TIMEOUT_MS = 9000;
 2344 | const BUILDING_TITLE_PAGE_MAX_ATTEMPTS = 1;
 2345 | 
 2346 | const KAPT_PAGE_SIZE = 1000;
 2347 | const KAPT_MAX_PAGES_PER_DONG = 10;
 2348 | const KAPT_TIMEOUT_MS = 22000;
 2349 | const KAPT_MAX_ATTEMPTS = 2;
 2350 | // V35 Paid: K-APT 기본/상세는 complex당 2개의 병렬 fetch를 사용한다.
 2351 | // Workers의 동시 outgoing connection 한도 6에 맞춰 complex concurrency를 3으로 둔다.
 2352 | const KAPT_INFO_CONCURRENCY = 3;
 2353 | // V50: 법정동 K-APT 목록은 시도/시군구/법정동명만 내려오는 경우가 있어
 2354 | // Kakao addressSearch가 단지 대표점을 찾지 못한다. 최초 위치확인 요청에서만
 2355 | // 기본정보 주소를 선보강한다. direct-scope에서 실제 법정동 후보만 대상으로 제한한다.
 2356 | const KAPT_GEOCODE_ENRICH_MAX_COMPLEXES = 64;
 2357 | const KAPT_GEOCODE_ENRICH_CONCURRENCY = 3;
 2358 | const PUBLIC_DATA_RETRY_BASE_DELAY_MS = 500;
 2359 | 
 2360 | const BUILDING_STATS_SUPABASE_TIMEOUT_MS = 5000;
 2361 | const BUILDING_STATS_CACHE_YEARS = 1;
 2362 | const [long-token-redacted] = 75;
 2363 | 
 2364 | // 주소 대표점은 건물 중심이 아니라 출입구·도로에 찍힐 수 있다.
 2365 | // 다만 같은 우편번호라는 이유만으로 법정동 전체를 포함하면 과대 집계되므로,
 2366 | // 실제 폴리곤 경계와 가까운 경우에만 제한적으로 보정한다.
 2367 | const [long-token-redacted] = 80;
 2368 | const [long-token-redacted] = 35;
 2369 | const [long-token-redacted] = 25;
 2370 | const BUILDING_STATS_MAX_GEOCODING_TARGETS = 20000;
 2371 | const BUILDING_STATS_KAPT_MATCH_RADIUS_METERS = 250;
 2372 | const BUILDING_UNIT_PAGE_SIZE = 1000;
 2373 | const BUILDING_UNIT_MAX_PAGES_PER_PARCEL = 30;
 2374 | // V35 Paid: 필지별 상세조회는 서로 독립적이므로 4개씩 병렬 처리한다.
 2375 | // 각 필지 내부의 페이지/소스 조회는 순차 실행되어 outgoing connection 6 한도 안에 머문다.
 2376 | const BUILDING_UNIT_FETCH_CONCURRENCY = 6;
 2377 | const BUILDING_UNIT_TIMEOUT_MS = 22000;
 2378 | const BUILDING_UNIT_MAX_ATTEMPTS = 2;
 2379 | const BUILDING_INFER_ELEVATOR_MIN_FLOORS = 6;
 2380 | const BUILDING_INFER_ELEVATOR_MIN_HEIGHT_M = 18;
 2381 | const BUILDING_INFER_ELEVATOR_ZERO_MIN_FLOORS = 5;
 2382 | const [long-token-redacted] = 15;
 2383 | const [long-token-redacted] = 8;
 2384 | const [long-token-redacted] = 20;
 2385 | 
 2386 | // V35 Paid: 기본 10,000 subrequest 예산을 기준으로 상세 필지를 한 요청에서 최대 48개 처리한다.
 2387 | // 필지당 최악 5개 소스 x 30페이지 = 150 subrequest로 계산해도 약 7,200회라
 2388 | // 표제부/K-APT/Supabase 요청을 포함한 안전 여유를 남긴다. 대부분의 구역은 한 요청에 완료된다.
 2389 | const [long-token-redacted] = 72;
 2390 | const [long-token-redacted] = 1024;
 2391 | const BUILDING_UNIT_QUERY_VARIANT_LIMIT = 6;
 2392 | const BUILDING_UNIT_DETAIL_MAX_ATTEMPTS = 1;
 2393 | const KAPT_SIGUNGU_LIST_URL =
 2394 |   "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
 2395 | const KAPT_SIGUNGU_MAX_PAGES = 2;
 2396 | // V35 Paid: Free 플랜 subrequest 회피용 6개 제한을 해제하고 실사용 상한을 64개로 확장한다.
 2397 | const KAPT_MAX_INFO_COMPLEXES_PER_REQUEST = 64;
 2398 | 
 2399 | // V35 Paid: 폴리곤 내부 표제부는 최대 128필지를 한 요청에서 처리한다.
 2400 | // 각 필지는 1페이지 직접조회이므로 Paid 기본 10,000 subrequest 한도에 충분한 여유가 있다.
 2401 | // 4개 병렬로 처리해 공공데이터 응답 지연에 따른 wall time을 줄인다.
 2402 | const BUILDING_SCOPE_DIRECT_TITLE_MAX_PARCELS = 192;
 2403 | const [long-token-redacted] = 1024;
 2404 | const BUILDING_SCOPE_DIRECT_TITLE_CONCURRENCY = 6;
 2405 | const [long-token-redacted] = 6;
 2406 | const BUILDING_SCOPE_DIRECT_TITLE_TIMEOUT_MS = 9000;
 2407 | 
 2408 | // 법정동 전체 전유부를 페이지 단위로 한 번에 읽어 폴리곤 내부 필지만 필터링한다.
 2409 | // 기존의 "필지당 1회" 상세조회는 Cloudflare subrequest 한도 때문에 전체 빌라를 누락했다.
 2410 | const BUILDING_BULK_UNIT_MAX_DONGS = 2;
 2411 | const BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG = 10;
 2412 | const BUILDING_BULK_UNIT_MAX_PAGES_TOTAL = 16;
 2413 | const BUILDING_BULK_UNIT_CONCURRENCY = 2;
 2414 | const BUILDING_BULK_UNIT_TIMEOUT_MS = 22000;
 2415 | const BUILDING_BULK_UNIT_MAX_ROWS = 50000;
 2416 | 
 2417 | // 공식 세대/호수/전유부가 없는 구축 일반지번은 표제부의 면적·층수로
 2418 | // 배송호수를 추정한다. 추정값은 authoritative와 분리하고 정상 1년 캐시로 저장하지 않는다.
 2419 | const BUILDING_ESTIMATE_RESIDENTIAL_GROSS_M2 = 65;
 2420 | const BUILDING_ESTIMATE_OFFICETEL_GROSS_M2 = 45;
 2421 | const BUILDING_ESTIMATE_DAGAGU_GROSS_M2 = 72;
 2422 | const BUILDING_ESTIMATE_COMMERCIAL_GROSS_M2 = 55;
 2423 | const BUILDING_ESTIMATE_MAX_UNITS_PER_FLOOR = 6;
 2424 | 
 2425 | function normalizeBuildingStatsScope(body) {

// ...
 2516 |         .slice(0, 240) || null,
 2517 |   };
 2518 | }
 2519 | 
 2520 | function buildingStatsSelectColumns() {
 2521 |   return [
 2522 |     "id",
 2523 |     "scope_type",
 2524 |     "scope_key",
 2525 |     "geometry_hash",
 2526 |     "zipcode",
 2527 |     "subsubroute_id",
 2528 |     "subroute_id",
 2529 |     "vendor_id",
 2530 |     "display_name",
 2531 |     "polygon_area_m2",
 2532 |     "household_count",
 2533 |     "apartment_household_count",
 2534 |     "non_apartment_household_count",
 2535 |     "unknown_household_count",
 2536 |     "residential_unit_count",
 2537 |     "commercial_unit_count",
 2538 |     "unclassified_unit_count",
 2539 |     "delivery_unit_count",
 2540 |     "residential_building_unit_count",
 2541 |     "commercial_building_unit_count",
 2542 |     "mixed_use_building_count",
 2543 |     "exclusive_unit_record_count",
 2544 |     "common_area_record_count",
 2545 |     "confirmed_elevator_unit_count",
 2546 |     "inferred_elevator_unit_count",
 2547 |     "no_elevator_unit_count",
 2548 |     "unknown_elevator_unit_count",
 2549 |     "residential_elevator_unit_count",
 2550 |     "residential_no_elevator_unit_count",
 2551 |     "residential_unknown_elevator_unit_count",
 2552 |     "commercial_elevator_unit_count",
 2553 |     "commercial_no_elevator_unit_count",
 2554 |     "commercial_unknown_elevator_unit_count",
 2555 |     "unit_analysis_version",
 2556 |     "unit_analysis_method",
 2557 |     "source_record_count",
 2558 |     "matched_building_count",
 2559 |     "residential_building_count",
 2560 |     "geocoded_building_count",
 2561 |     "unlocated_building_count",
 2562 |     "coverage_percent",
 2563 |     "elevator_building_count",
 2564 |     "no_elevator_building_count",
 2565 |     "unknown_elevator_building_count",
 2566 |     "elevator_household_count",
 2567 |     "no_elevator_household_count",
 2568 |     "unknown_elevator_household_count",
 2569 |     "passenger_elevator_count",
 2570 |     "emergency_elevator_count",
 2571 |     "walkup_min_ground_floors",
 2572 |     "walkup_building_count",
 2573 |     "walkup_household_count",
 2574 |     "source",
 2575 |     "source_version",
 2576 |     "source_reference_date",
 2577 |     "source_fetched_at",
 2578 |     "location_source",
 2579 |     "breakdown",
 2580 |     "calculated_at",
 2581 |     "expires_at",
 2582 |     "refresh_status",
 2583 |     "last_refresh_attempt_at",
 2584 |     "last_refresh_error",
 2585 |     "created_at",
 2586 |     "updated_at",
 2587 |   ].join(",");
 2588 | }
 2589 | 
 2590 | async function fetchBuildingStatsCache(env, scopeType, scopeKey) {
 2591 |   const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
 2592 |   const params = new URLSearchParams();
 2593 | 
 2594 |   params.set("scope_type", `eq.${scopeType}`);
 2595 |   params.set("scope_key", `eq.${scopeKey}`);
 2596 |   params.set("select", buildingStatsSelectColumns());
 2597 |   params.set("limit", "1");
 2598 | 
 2599 |   const res = await fetchWithTimeout(
 2600 |     `${supabaseUrl}/rest/v1/${POLYGON_BUILDING_STATS_TABLE}?${params.toString()}`,
 2601 |     {

// ...
 2663 | 
 2664 |   return Array.isArray(rows) && rows.length ? rows[0] : row;
 2665 | }
 2666 | 
 2667 | 
 2668 | // ---------- V56 raw upstream cache [long-token-redacted]
 2669 | // IMPORTANT: 이 캐시는 V3X/V46 분석 알고리즘을 바꾸지 않는다.
 2670 | // 외부 API 응답을 그대로 재사용해 같은 법정동/필지를 다시 호출하지 않는 I/O 가속 계층이다.
 2671 | const BUILDING_SOURCE_CACHE_TABLE = "building_source_cache";
 2672 | const BUILDING_V56_RAW_CACHE_VERSION = "RAW2";
 2673 | const BUILDING_V56_TITLE_PAGE_CACHE_DAYS = 90;
 2674 | const BUILDING_V56_TITLE_PARCEL_CACHE_DAYS = 90;
 2675 | const BUILDING_V56_DETAIL_PARCEL_CACHE_DAYS = 90;
 2676 | const BUILDING_V56_CACHE_BATCH = 80;
 2677 | const BUILDING_V56_TITLE_PAGE_CONCURRENCY = 6;
 2678 | const BUILDING_V56_SOURCE_CACHE_SELECT = [
 2679 |   "cache_key", "source_type", "region_key", "parcel_key", "kapt_code",
 2680 |   "payload", "status", "fetched_at", "expires_at", "last_error"
 2681 | ].join(",");
 2682 | 
 2683 | function v56RegionKey(sigunguCd, bjdongCd = "") {
 2684 |   const sig = String(sigunguCd || "").replace(/\D/g, "");
 2685 |   const bjd = String(bjdongCd || "").replace(/\D/g, "");
 2686 |   if (sig.length !== 5) return "";
 2687 |   if (!bjd) return sig;
 2688 |   return bjd.length === 5 ? `${sig}${bjd}` : "";
 2689 | }
 2690 | 
 2691 | function v56RegionKeyFromParcel(parcel) {
 2692 |   return parcel ? v56RegionKey(parcel.sigunguCd, parcel.bjdongCd) : "";
 2693 | }
 2694 | 
 2695 | function v56RawCacheKey(sourceType, identity) {
 2696 |   return `${BUILDING_V56_RAW_CACHE_VERSION}:${sourceType}:${identity}`;
 2697 | }
 2698 | 
 2699 | function v56RawCacheFresh(row) {
 2700 |   if (!row || row.status === "error") return false;
 2701 |   const expires = Date.parse(row.expires_at || "");
 2702 |   return Number.isFinite(expires) && expires > Date.now();
 2703 | }
 2704 | 
 2705 | function v56RawCacheRow({ sourceType, regionKey, parcelKey = null, identity, payload, days }) {
 2706 |   const now = new Date().toISOString();
 2707 |   return {
 2708 |     cache_key: v56RawCacheKey(sourceType, identity),
 2709 |     source_type: sourceType,
 2710 |     region_key: regionKey || null,
 2711 |     parcel_key: parcelKey || null,
 2712 |     kapt_code: null,
 2713 |     payload: payload && typeof payload === "object" ? payload : {},
 2714 |     status: "ready",
 2715 |     fetched_at: now,
 2716 |     expires_at: new Date(Date.now() + Math.max(1, Number(days) || 1) * 86400000).toISOString(),
 2717 |     last_error: null,
 2718 |     updated_at: now,
 2719 |   };
 2720 | }
 2721 | 
 2722 | async function v56FetchRawCacheRows(env, regionKey, sourceType) {
 2723 |   if (!regionKey || !sourceType) return { available: false, rows: [], error: null };
 2724 |   try {
 2725 |     const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
 2726 |     const params = new URLSearchParams();
 2727 |     params.set("region_key", `eq.${regionKey}`);
 2728 |     params.set("source_type", `eq.${sourceType}`);
 2729 |     params.set("select", BUILDING_V56_SOURCE_CACHE_SELECT);
 2730 |     params.set("limit", "5000");
 2731 |     const res = await fetchWithTimeout(
 2732 |       `${supabaseUrl}/rest/v1/${BUILDING_SOURCE_CACHE_TABLE}?${params.toString()}`,
 2733 |       {
 2734 |         method: "GET",
 2735 |         headers: terrainSupabaseHeaders(env),
 2736 |         cf: { cacheTtl: 0, cacheEverything: false },
 2737 |       },
 2738 |       BUILDING_STATS_SUPABASE_TIMEOUT_MS
 2739 |     );
 2740 |     const text = await res.text();

// ...
 2800 |     pageNo: Number(payload.pageNo || 1),
 2801 |     numOfRows: Number(payload.numOfRows || BUILDING_HUB_PAGE_SIZE),
 2802 |     __cacheV56: true,
 2803 |   };
 2804 | }
 2805 | 
 2806 | function v56CachedDetailResult(row, parcel, titleMatches = []) {
 2807 |   if (!v56RawCacheFresh(row)) return null;
 2808 |   const payload = row?.payload;
 2809 |   if (!payload || payload.sourceComplete === false) return null;
 2810 |   return {
 2811 |     parcel,
 2812 |     titleMatches,
 2813 |     addedFromVerifiedScopeV51: false,
 2814 |     addedFromKaptScopeV48: false,
 2815 |     verifiedScopeEntryV51: null,
 2816 |     kaptMatchesV51: [],
 2817 |     areaRows: Array.isArray(payload.areaRows) ? payload.areaRows : [],
 2818 |     exposRows: Array.isArray(payload.exposRows) ? payload.exposRows : [],
 2819 |     recapRows: Array.isArray(payload.recapRows) ? payload.recapRows : [],
 2820 |     housePriceRows: Array.isArray(payload.housePriceRows) ? payload.housePriceRows : [],
 2821 |     floorRows: Array.isArray(payload.floorRows) ? payload.floorRows : [],
 2822 |     sourceComplete: true,
 2823 |     queryDiagnostics: { optimized: true, rawCacheV56: true },
 2824 |   };
 2825 | }
 2826 | 
 2827 | async function markBuildingStatsRefreshError(env, cacheRow, error) {
 2828 |   if (!cacheRow?.id) return;
 2829 | 
 2830 |   try {
 2831 |     const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
 2832 |     const params = new URLSearchParams();
 2833 | 
 2834 |     params.set("id", `eq.${cacheRow.id}`);
 2835 | 
 2836 |     await fetchWithTimeout(
 2837 |       `${supabaseUrl}/rest/v1/${POLYGON_BUILDING_STATS_TABLE}?${params.toString()}`,
 2838 |       {
 2839 |         method: "PATCH",
 2840 |         headers: terrainSupabaseHeaders(env),
 2841 |         body: JSON.stringify({
 2842 |           refresh_status: "error",
 2843 |           last_refresh_attempt_at: new Date().toISOString(),
 2844 |           last_refresh_error: String(error?.message || error || "")

// ...
 2856 | function buildingStatsRowToResponse(row) {
 2857 |   if (!row || typeof row !== "object") return null;
 2858 | 
 2859 |   const numberValue = (value) => {
 2860 |     const n = Number(value);
 2861 |     return Number.isFinite(n) ? n : 0;
 2862 |   };
 2863 | 
 2864 |   const nullableNumber = (value) => {
 2865 |     const n = Number(value);
 2866 |     return value == null || value === "" || !Number.isFinite(n)
 2867 |       ? null
 2868 |       : n;
 2869 |   };
 2870 | 
 2871 |   // 배송호수 컬럼 추가 이전 캐시도 화면에서 계속 사용할 수 있게 호환한다.
 2872 |   const legacyHouseholds = numberValue(row.household_count);
 2873 |   const storedResidentialUnits = numberValue(row.residential_unit_count);
 2874 |   const storedCommercialUnits = numberValue(row.commercial_unit_count);
 2875 |   const storedUnclassifiedUnits = numberValue(row.unclassified_unit_count);
 2876 |   const storedDeliveryUnits = numberValue(row.delivery_unit_count);
 2877 |   const storedUnitSum =
 2878 |     storedResidentialUnits +
 2879 |     storedCommercialUnits +
 2880 |     storedUnclassifiedUnits;
 2881 |   const deliveryUnitsCompat = storedDeliveryUnits > 0
 2882 |     ? storedDeliveryUnits
 2883 |     : Math.max(storedUnitSum, legacyHouseholds);
 2884 |   const residentialUnitsCompat = storedUnitSum > 0
 2885 |     ? storedResidentialUnits
 2886 |     : legacyHouseholds;
 2887 | 
 2888 |   const legacyElevatorUnits = numberValue(row.elevator_household_count);
 2889 |   const legacyNoElevatorUnits = numberValue(row.no_elevator_household_count);
 2890 |   const legacyUnknownElevatorUnits = numberValue(row.unknown_elevator_household_count);
 2891 |   const confirmedElevatorUnitsCompat = numberValue(row.confirmed_elevator_unit_count) || legacyElevatorUnits;
 2892 |   const noElevatorUnitsCompat = numberValue(row.no_elevator_unit_count) || legacyNoElevatorUnits;
 2893 |   const unknownElevatorUnitsCompat = numberValue(row.unknown_elevator_unit_count) || legacyUnknownElevatorUnits;
 2894 | 
 2895 |   return {
 2896 |     scopeType: row.scope_type || null,
 2897 |     scopeKey: row.scope_key || null,
 2898 |     geometryHash: row.geometry_hash || null,
 2899 |     zipcode: row.zipcode || null,
 2900 |     displayName: row.display_name || null,
 2901 |     polygonAreaM2: nullableNumber(row.polygon_area_m2),
 2902 | 
 2903 |     householdCount: numberValue(row.household_count),
 2904 |     apartmentHouseholdCount: numberValue(
 2905 |       row.apartment_household_count
 2906 |     ),
 2907 |     nonApartmentHouseholdCount: numberValue(
 2908 |       row.non_apartment_household_count
 2909 |     ),
 2910 |     unknownHouseholdCount: numberValue(
 2911 |       row.unknown_household_count
 2912 |     ),
 2913 | 
 2914 |     residentialUnitCount: residentialUnitsCompat,
 2915 |     commercialUnitCount: storedCommercialUnits,
 2916 |     unclassifiedUnitCount: storedUnclassifiedUnits,
 2917 |     deliveryUnitCount: deliveryUnitsCompat,
 2918 | 
 2919 |     residentialBuildingUnitCount: numberValue(
 2920 |       row.residential_building_unit_count
 2921 |     ),
 2922 |     commercialBuildingUnitCount: numberValue(
 2923 |       row.commercial_building_unit_count
 2924 |     ),
 2925 |     mixedUseBuildingCount: numberValue(row.mixed_use_building_count),
 2926 |     exclusiveUnitRecordCount: numberValue(row.exclusive_unit_record_count),
 2927 |     commonAreaRecordCount: numberValue(row.common_area_record_count),
 2928 | 
 2929 |     confirmedElevatorUnitCount: confirmedElevatorUnitsCompat,
 2930 |     inferredElevatorUnitCount: numberValue(
 2931 |       row.inferred_elevator_unit_count
 2932 |     ),
 2933 |     noElevatorUnitCount: noElevatorUnitsCompat,
 2934 |     unknownElevatorUnitCount: unknownElevatorUnitsCompat,
 2935 | 
 2936 |     residentialElevatorUnitCount: numberValue(
 2937 |       row.residential_elevator_unit_count
 2938 |     ),
 2939 |     residentialNoElevatorUnitCount: numberValue(
 2940 |       row.residential_no_elevator_unit_count
 2941 |     ),
 2942 |     residentialUnknownElevatorUnitCount: numberValue(
 2943 |       row.residential_unknown_elevator_unit_count
 2944 |     ),
 2945 |     commercialElevatorUnitCount: numberValue(

// ...
 2966 |     unlocatedBuildingCount: numberValue(
 2967 |       row.unlocated_building_count
 2968 |     ),
 2969 |     coveragePercent: nullableNumber(row.coverage_percent),
 2970 | 
 2971 |     elevatorBuildingCount: numberValue(
 2972 |       row.elevator_building_count
 2973 |     ),
 2974 |     noElevatorBuildingCount: numberValue(
 2975 |       row.no_elevator_building_count
 2976 |     ),
 2977 |     unknownElevatorBuildingCount: numberValue(
 2978 |       row.unknown_elevator_building_count
 2979 |     ),
 2980 | 
 2981 |     elevatorHouseholdCount: numberValue(
 2982 |       row.elevator_household_count
 2983 |     ),
 2984 |     noElevatorHouseholdCount: numberValue(
 2985 |       row.no_elevator_household_count
 2986 |     ),
 2987 |     unknownElevatorHouseholdCount: numberValue(
 2988 |       row.unknown_elevator_household_count
 2989 |     ),
 2990 | 
 2991 |     passengerElevatorCount: numberValue(
 2992 |       row.passenger_elevator_count
 2993 |     ),
 2994 |     emergencyElevatorCount: numberValue(
 2995 |       row.emergency_elevator_count
 2996 |     ),
 2997 | 
 2998 |     walkupMinGroundFloors: numberValue(
 2999 |       row.walkup_min_ground_floors
 3000 |     ),
 3001 |     walkupBuildingCount: numberValue(
 3002 |       row.walkup_building_count
 3003 |     ),
 3004 |     walkupHouseholdCount: numberValue(
 3005 |       row.walkup_household_count
 3006 |     ),
 3007 | 
 3008 |     source: row.source || "BUILDING_HUB",
 3009 |     sourceVersion: row.source_version || null,
 3010 |     sourceReferenceDate: row.source_reference_date || null,
 3011 |     sourceFetchedAt: row.source_fetched_at || null,
 3012 |     locationSource: row.location_source || null,
 3013 |     breakdown: row.breakdown || null,
 3014 | 
 3015 |     calculatedAt: row.calculated_at || null,
 3016 |     expiresAt: row.expires_at || null,
 3017 |     refreshStatus: row.refresh_status || "ready",
 3018 |     lastRefreshAttemptAt: row.last_refresh_attempt_at || null,
 3019 |     lastRefreshError: row.last_refresh_error || null,
 3020 |   };
 3021 | }
 3022 | 
 3023 | function buildingStatsCachedDeliveryUnits(row) {
 3024 |   if (!row || typeof row !== "object") return 0;
 3025 | 
 3026 |   const values = [
 3027 |     row.delivery_unit_count,
 3028 |     row.household_count,
 3029 |     Number(row.residential_unit_count || 0) +
 3030 |       Number(row.commercial_unit_count || 0) +
 3031 |       Number(row.unclassified_unit_count || 0),
 3032 |   ].map((value) => Math.max(0, Math.trunc(Number(value) || 0)));
 3033 | 
 3034 |   return Math.max(...values, 0);
 3035 | }
 3036 | 
 3037 | function isUsableBuildingStatsCache(
 3038 |   row,
 3039 |   geometryHash,
 3040 |   { allowExpired = false } = {}
 3041 | ) {
 3042 |   if (!row) return false;
 3043 | 
 3044 |   if (String(row.geometry_hash || "") !== String(geometryHash || "")) {
 3045 |     return false;
 3046 |   }
 3047 | 
 3048 |   // 과거에 잘못 저장된 0호 캐시는 재사용하지 않는다.
 3049 |   if (buildingStatsCachedDeliveryUnits(row) <= 0) {
 3050 |     return false;
 3051 |   }
 3052 | 
 3053 |   if (allowExpired) return true;
 3054 | 
 3055 |   const expiresAt = Date.parse(row.expires_at || "");
 3056 |   return Number.isFinite(expiresAt) && expiresAt > Date.now();
 3057 | }
 3058 | 
 3059 | function isSuspiciousOnePerBuildingCache(row) {

// ...
 3081 |     (authoritative === 0 || estimated >= delivery * 0.8)
 3082 |   );
 3083 | }
 3084 | 
 3085 | function isSuspiciousElevatorCache(row) {
 3086 |   if (!row || typeof row !== "object") return false;
 3087 | 
 3088 |   const sourceVersion = String(row.source_version || "");
 3089 |   if (sourceVersion === BUILDING_STATS_SOURCE_VERSION) return false;
 3090 | 
 3091 |   const delivery = buildingStatsCachedDeliveryUnits(row);
 3092 |   if (delivery <= 0) return false;
 3093 | 
 3094 |   const confirmed = Math.max(
 3095 |     0,
 3096 |     Math.trunc(Number(row.confirmed_elevator_unit_count) || 0),
 3097 |     Math.trunc(Number(row.elevator_household_count) || 0)
 3098 |   );
 3099 |   const inferred = Math.max(
 3100 |     0,
 3101 |     Math.trunc(Number(row.inferred_elevator_unit_count) || 0)
 3102 |   );
 3103 |   const none = Math.max(
 3104 |     0,
 3105 |     Math.trunc(Number(row.no_elevator_unit_count) || 0),
 3106 |     Math.trunc(Number(row.no_elevator_household_count) || 0)
 3107 |   );
 3108 |   const unknown = Math.max(
 3109 |     0,
 3110 |     Math.trunc(Number(row.unknown_elevator_unit_count) || 0),
 3111 |     Math.trunc(Number(row.unknown_elevator_household_count) || 0)
 3112 |   );
 3113 |   const matched = Math.max(0, Math.trunc(Number(row.matched_building_count) || 0));
 3114 | 
 3115 |   return (
 3116 |     confirmed + inferred === 0 &&
 3117 |     matched >= 4 &&
 3118 |     (none >= delivery * 0.75 || none + unknown >= delivery * 0.95)
 3119 |   );
 3120 | }
 3121 | 
 3122 | function isBuildingStatsCacheFresh(
 3123 |   row,
 3124 |   geometryHash,
 3125 |   forceRefresh
 3126 | ) {
 3127 |   if (forceRefresh) return false;
 3128 | 
 3129 |   // 현재 분석 알고리즘과 버전이 다른 캐시는 결과값이 정상처럼 보여도 재사용하지 않는다.
 3130 |   // V20/V21/V22/V23 등 이전 캐시가 남아 있으면 반드시 현재 버전으로 다시 계산한다.
 3131 |   if (
 3132 |     String(row?.source_version || "") !==
 3133 |     BUILDING_STATS_SOURCE_VERSION
 3134 |   ) {
 3135 |     return false;
 3136 |   }
 3137 | 
 3138 |   // 과거 로직이 건물마다 최소 1호만 넣은 캐시는 "정상 1호 이상"이어도 재사용하지 않는다.
 3139 |   if (isSuspiciousOnePerBuildingCache(row)) return false;

// ...
 3628 |   };
 3629 | }
 3630 | 
 3631 | function firstPositiveBuildingInteger(...values) {
 3632 |   for (const value of values) {
 3633 |     const n = nonNegativeBuildingInteger(value);
 3634 |     if (n > 0) return n;
 3635 |   }
 3636 |   return 0;
 3637 | }
 3638 | 
 3639 | function buildingHouseholdUnits(row, classification) {
 3640 |   const household = firstPositiveBuildingInteger(
 3641 |     row?.hhldCnt,
 3642 |     row?.hhld_cnt,
 3643 |     row?.householdCnt,
 3644 |     row?.household_count,
 3645 |     row?.hshldCnt,
 3646 |     row?.hshld_cnt,
 3647 |     row?.totHhldCnt,
 3648 |     row?.tot_hhld_cnt
 3649 |   );
 3650 | 
 3651 |   const family = firstPositiveBuildingInteger(
 3652 |     row?.fmlyCnt,
 3653 |     row?.fmly_cnt,
 3654 |     row?.familyCnt,
 3655 |     row?.family_count,
 3656 |     row?.fmlyCo,
 3657 |     row?.fmly_co
 3658 |   );
 3659 | 
 3660 |   const ho = firstPositiveBuildingInteger(
 3661 |     row?.hoCnt,
 3662 |     row?.ho_cnt,
 3663 |     row?.hoCount,
 3664 |     row?.ho_count,
 3665 |     row?.unitCnt,
 3666 |     row?.unit_cnt,
 3667 |     row?.unitCount,
 3668 |     row?.unit_count,
 3669 |     row?.roomCnt,
 3670 |     row?.room_cnt
 3671 |   );
 3672 | 

// ...
 3681 |   }
 3682 | 
 3683 |   if (classification?.residential) {
 3684 |     return family || household || ho || 0;
 3685 |   }
 3686 | 
 3687 |   // 상업·업무시설도 개별 전유호가 있으면 호수를 배송 단위로 사용한다.
 3688 |   return ho || household || family || 0;
 3689 | }
 3690 | 
 3691 | 
 3692 | function buildingExplicitUnitEvidence(row, classification) {
 3693 |   const household = firstPositiveBuildingInteger(
 3694 |     row?.hhldCnt,
 3695 |     row?.hhld_cnt,
 3696 |     row?.householdCnt,
 3697 |     row?.household_count,
 3698 |     row?.hshldCnt,
 3699 |     row?.hshld_cnt,
 3700 |     row?.totHhldCnt,
 3701 |     row?.tot_hhld_cnt
 3702 |   );
 3703 |   const family = firstPositiveBuildingInteger(
 3704 |     row?.fmlyCnt,
 3705 |     row?.fmly_cnt,
 3706 |     row?.familyCnt,
 3707 |     row?.family_count,
 3708 |     row?.fmlyCo,
 3709 |     row?.fmly_co
 3710 |   );
 3711 |   const ho = firstPositiveBuildingInteger(
 3712 |     row?.hoCnt,
 3713 |     row?.ho_cnt,
 3714 |     row?.hoCount,
 3715 |     row?.ho_count,
 3716 |     row?.unitCnt,
 3717 |     row?.unit_cnt,
 3718 |     row?.unitCount,
 3719 |     row?.unit_count,
 3720 |     row?.roomCnt,
 3721 |     row?.room_cnt
 3722 |   );
 3723 | 
 3724 |   let units = 0;
 3725 |   let source = null;

// ...
 4281 | 
 4282 | function buildingElevatorProfile(
 4283 |   parentRow,
 4284 |   classification,
 4285 |   parcelMatches,
 4286 |   context = {}
 4287 | ) {
 4288 |   const rows = buildingElevatorRowsForParent(parentRow, parcelMatches);
 4289 |   const sourceRows = rows.length ? rows : (parentRow ? [parentRow] : []);
 4290 |   return buildingElevatorAvailabilityFromRows(
 4291 |     sourceRows,
 4292 |     classification,
 4293 |     context
 4294 |   );
 4295 | }
 4296 | 
 4297 | function kaptElevatorAvailability(complex) {
 4298 |   const floors = Math.max(0, Math.trunc(Number(complex?.maxFloorCount) || 0));
 4299 |   const unitCount = Math.max(0, Math.trunc(Number(complex?.households) || 0));
 4300 |   const count = Math.max(0, Math.trunc(Number(complex?.elevatorCount) || 0));
 4301 | 
 4302 |   if (count > 0) {
 4303 |     return {
 4304 |       category: "confirmed",
 4305 |       reason: "kapt_positive_count",
 4306 |       inferred: false,
 4307 |       zeroOverridden: false,
 4308 |       known: true,
 4309 |       explicitZero: false,
 4310 |       passenger: count,
 4311 |       emergency: 0,
 4312 |       floors,
 4313 |       heightM: 0,
 4314 |       unitCount,
 4315 |       inferenceRules: [],
 4316 |       sourceRowCount: 1,
 4317 |     };
 4318 |   }
 4319 | 
 4320 |   // V36: K-APT도 동일하게 공식 elevatorCount만 O/X 근거로 사용한다.
 4321 |   // 값이 없으면 단지 규모가 커도 임의 추정하지 않고 unknown으로 둔다.
 4322 |   return {
 4323 |     category: complex?.elevatorKnown ? "none" : "unknown",
 4324 |     reason: complex?.elevatorKnown
 4325 |       ? "[long-token-redacted]"
 4326 |       : "kapt_elevator_count_missing",
 4327 |     inferred: false,
 4328 |     zeroOverridden: false,
 4329 |     known: complex?.elevatorKnown === true,
 4330 |     explicitZero: complex?.elevatorKnown === true,
 4331 |     passenger: 0,
 4332 |     emergency: 0,
 4333 |     floors,
 4334 |     heightM: 0,
 4335 |     unitCount,
 4336 |     inferenceRules: [],
 4337 |     sourceRowCount: 1,
 4338 |   };
 4339 | }
 4340 | 
 4341 | function elevatorCategoryRank(category) {
 4342 |   return {
 4343 |     unknown: 0,
 4344 |     none: 1,
 4345 |     inferred: 2,
 4346 |     confirmed: 3,
 4347 |   }[category] ?? 0;
 4348 | }
 4349 | 
 4350 | function registerElevatorBuildingDiagnostic(
 4351 |   map,
 4352 |   buildingKey,
 4353 |   elevator,
 4354 |   units,

// ...
 4776 |       row?.mgm_bldrgst_pk
 4777 |     ) || null,
 4778 |     roadAddress: addresses.roadAddress || null,
 4779 |     parcelAddress: addresses.parcelAddress || null,
 4780 |     address: addresses.preferredAddress || null,
 4781 |     buildingName: cleanBuildingText(
 4782 |       row?.bldNm ??
 4783 |       row?.bld_nm
 4784 |     ) || null,
 4785 |     dongName: cleanBuildingText(
 4786 |       row?.dongNm ??
 4787 |       row?.dong_nm
 4788 |     ) || null,
 4789 |     purpose: classification.purpose || null,
 4790 |     residential: classification.residential,
 4791 |     apartment: classification.apartment,
 4792 |     householdCount: buildingHouseholdUnits(
 4793 |       row,
 4794 |       classification
 4795 |     ),
 4796 |     groundFloorCount: nonNegativeBuildingInteger(
 4797 |       row?.grndFlrCnt ??
 4798 |       row?.grnd_flr_cnt
 4799 |     ),
 4800 |     passengerElevatorCount: elevator.passenger,
 4801 |     emergencyElevatorCount: elevator.emergency,
 4802 |   };
 4803 | }
 4804 | 
 4805 | function latestBuildingReferenceDate(records) {
 4806 |   let latest = "";
 4807 | 
 4808 |   for (const row of records || []) {
 4809 |     const raw = String(
 4810 |       row?.crtnDay ??
 4811 |       row?.crtn_day ??
 4812 |       ""
 4813 |     ).replace(/\D/g, "");
 4814 | 
 4815 |     if (raw.length === 8 && raw > latest) {
 4816 |       latest = raw;
 4817 |     }
 4818 |   }
 4819 | 
 4820 |   if (!latest) return null;

// ...
 4844 |       continue;
 4845 |     }
 4846 | 
 4847 |     geocodedBuildingCount += 1;
 4848 | 
 4849 |     if (
 4850 |       pointInBuildingGeometry(
 4851 |         location.lng,
 4852 |         location.lat,
 4853 |         geometry
 4854 |       )
 4855 |     ) {
 4856 |       matched.push({ row, location });
 4857 |     }
 4858 |   }
 4859 | 
 4860 |   let householdCount = 0;
 4861 |   let apartmentHouseholdCount = 0;
 4862 |   let nonApartmentHouseholdCount = 0;
 4863 |   let unknownHouseholdCount = 0;
 4864 | 
 4865 |   let residentialBuildingCount = 0;
 4866 | 
 4867 |   let elevatorBuildingCount = 0;
 4868 |   let noElevatorBuildingCount = 0;
 4869 |   let unknownElevatorBuildingCount = 0;
 4870 | 
 4871 |   let elevatorHouseholdCount = 0;
 4872 |   let noElevatorHouseholdCount = 0;
 4873 |   let unknownElevatorHouseholdCount = 0;
 4874 | 
 4875 |   let passengerElevatorCount = 0;
 4876 |   let emergencyElevatorCount = 0;
 4877 | 
 4878 |   let walkupBuildingCount = 0;
 4879 |   let walkupHouseholdCount = 0;
 4880 | 
 4881 |   const housingTypeBreakdown = {};
 4882 |   const purposeBreakdown = {};
 4883 |   let unknownResidentialBuildingCount = 0;
 4884 | 
 4885 |   for (const match of matched) {
 4886 |     const row = match.row;
 4887 | 
 4888 |     if (isAncillaryBuildingRecord(row)) {
 4889 |       continue;
 4890 |     }
 4891 | 
 4892 |     const classification = buildingHousingClassification(row);
 4893 | 
 4894 |     if (!classification.residential) {
 4895 |       continue;
 4896 |     }
 4897 | 
 4898 |     residentialBuildingCount += 1;
 4899 | 
 4900 |     const units = buildingHouseholdUnits(
 4901 |       row,
 4902 |       classification
 4903 |     );
 4904 | 
 4905 |     householdCount += units;
 4906 | 
 4907 |     const housingType = classification.apartment
 4908 |       ? "apartment"
 4909 |       : "non_apartment";
 4910 | 
 4911 |     housingTypeBreakdown[housingType] =
 4912 |       (housingTypeBreakdown[housingType] || 0) + units;
 4913 | 
 4914 |     if (classification.apartment) {
 4915 |       apartmentHouseholdCount += units;
 4916 |     } else {
 4917 |       nonApartmentHouseholdCount += units;
 4918 |     }
 4919 | 
 4920 |     if (units === 0) {
 4921 |       unknownResidentialBuildingCount += 1;
 4922 |     }
 4923 | 
 4924 |     const purposeKey =
 4925 |       classification.purpose ||
 4926 |       "미분류";
 4927 | 
 4928 |     purposeBreakdown[purposeKey] =
 4929 |       (purposeBreakdown[purposeKey] || 0) + units;
 4930 | 
 4931 |     const elevator = buildingElevatorInfo(row);
 4932 |     const groundFloorCount = nonNegativeBuildingInteger(
 4933 |       row?.grndFlrCnt ??

// ...
 4956 |       walkupBuildingCount += 1;
 4957 |       walkupHouseholdCount += units;
 4958 |     }
 4959 |   }
 4960 | 
 4961 |   const sourceRecordCount = records.length;
 4962 |   const unlocatedBuildingCount = Math.max(
 4963 |     0,
 4964 |     sourceRecordCount - geocodedBuildingCount
 4965 |   );
 4966 | 
 4967 |   const coveragePercent = sourceRecordCount > 0
 4968 |     ? geocodedBuildingCount / sourceRecordCount * 100
 4969 |     : 100;
 4970 | 
 4971 |   return {
 4972 |     householdCount,
 4973 |     apartmentHouseholdCount,
 4974 |     nonApartmentHouseholdCount,
 4975 |     unknownHouseholdCount,
 4976 | 
 4977 |     sourceRecordCount,
 4978 |     matchedBuildingCount: matched.length,
 4979 |     residentialBuildingCount,
 4980 | 
 4981 |     geocodedBuildingCount,
 4982 |     unlocatedBuildingCount,
 4983 |     coveragePercent,
 4984 | 
 4985 |     elevatorBuildingCount,
 4986 |     noElevatorBuildingCount,
 4987 |     unknownElevatorBuildingCount,
 4988 | 
 4989 |     elevatorHouseholdCount,
 4990 |     noElevatorHouseholdCount,
 4991 |     unknownElevatorHouseholdCount,
 4992 | 
 4993 |     passengerElevatorCount,
 4994 |     emergencyElevatorCount,
 4995 | 
 4996 |     walkupBuildingCount,
 4997 |     walkupHouseholdCount,
 4998 | 
 4999 |     missingRecords: missing,
 5000 |     breakdown: {

// ...
 5289 |     numOfRows: Math.max(
 5290 |       1,
 5291 |       Math.trunc(Number(
 5292 |         publicDataField(body, "numOfRows", "num_of_rows") ??
 5293 |         publicDataField(response, "numOfRows", "num_of_rows") ??
 5294 |         items.length ?? 1
 5295 |       ) || 1)
 5296 |     ),
 5297 |   };
 5298 | }
 5299 | 
 5300 | async function fetchPublicDataJson(
 5301 |   url,
 5302 |   params,
 5303 |   env,
 5304 |   label,
 5305 |   timeoutMs = KAPT_TIMEOUT_MS,
 5306 |   maxAttempts = KAPT_MAX_ATTEMPTS
 5307 | ) {
 5308 |   const query = new URLSearchParams();
 5309 |   const serviceKey = publicDataServiceKey(env);
 5310 |   const urlText = String(url || "");
 5311 | 
 5312 |   // K-APT 기본/상세정보는 ServiceKey, 목록/건축HUB는 serviceKey를 사용한다.
 5313 |   if (urlText.includes("AptBasisInfoService")) {
 5314 |     query.set("ServiceKey", serviceKey);
 5315 |     query.set("dataType", "JSON");
 5316 |   } else {
 5317 |     query.set("serviceKey", serviceKey);
 5318 |   }
 5319 | 
 5320 |   query.set("_type", "json");
 5321 | 
 5322 |   for (const [key, value] of Object.entries(params || {})) {
 5323 |     if (value === null || value === undefined || value === "") continue;
 5324 |     query.set(key, String(value));
 5325 |   }
 5326 | 
 5327 |   const requestUrl = `${url}?${query.toString()}`;
 5328 |   let lastError = null;
 5329 | 
 5330 |   for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
 5331 |     try {
 5332 |       const res = await fetchWithTimeout(
 5333 |         requestUrl,
 5334 |         {

// ...
 5379 |     } catch (error) {
 5380 |       lastError = error;
 5381 |       if (
 5382 |         attempt < maxAttempts &&
 5383 |         publicDataRetryableError(error)
 5384 |       ) {
 5385 |         await waitForPublicDataRetry(attempt);
 5386 |         continue;
 5387 |       }
 5388 |       throw error;
 5389 |     }
 5390 |   }
 5391 | 
 5392 |   throw lastError || httpError(502, `${label} request failed`);
 5393 | }
 5394 | 
 5395 | function kaptCodeOf(row) {
 5396 |   return cleanBuildingText(
 5397 |     publicDataField(row, "kaptCode", "kapt_code", "code", "aptCode")
 5398 |   );
 5399 | }
 5400 | 
 5401 | function kaptNameOf(row) {
 5402 |   return cleanBuildingText(
 5403 |     publicDataField(
 5404 |       row,
 5405 |       "kaptName",
 5406 |       "kapt_name",
 5407 |       "aptName",
 5408 |       "apt_name",
 5409 |       "complexName",
 5410 |       "complex_name"
 5411 |     )
 5412 |   );
 5413 | }
 5414 | 
 5415 | function kaptAddressOf(row) {
 5416 |   const roadAddress = cleanBuildingText(
 5417 |     publicDataField(
 5418 |       row,
 5419 |       "doroJuso",
 5420 |       "doro_juso",
 5421 |       "roadAddress",
 5422 |       "road_address",
 5423 |       "roadAddr"
 5424 |     )
 5425 |   );
 5426 | 
 5427 |   const parcelAddress = cleanBuildingText(
 5428 |     publicDataField(
 5429 |       row,
 5430 |       "kaptAddr",
 5431 |       "kapt_addr",
 5432 |       "address",
 5433 |       "addr",
 5434 |       "jibunAddress",
 5435 |       "jibun_address"
 5436 |     )
 5437 |   );
 5438 | 
 5439 |   const composed = [
 5440 |     publicDataField(row, "as1"),
 5441 |     publicDataField(row, "as2"),
 5442 |     publicDataField(row, "as3"),
 5443 |     publicDataField(row, "as4"),
 5444 |   ].map(cleanBuildingText).filter(Boolean).join(" ");
 5445 | 
 5446 |   return {
 5447 |     roadAddress,
 5448 |     parcelAddress: parcelAddress || composed,
 5449 |     preferredAddress: roadAddress || parcelAddress || composed,
 5450 |   };
 5451 | }
 5452 | 
 5453 | function kaptComplexKey(row) {
 5454 |   const code = kaptCodeOf(row);
 5455 |   if (code) return `kapt:${code}`;
 5456 | 
 5457 |   const address = kaptAddressOf(row).preferredAddress;
 5458 |   const name = kaptNameOf(row);
 5459 |   return `kapt:${normalizedBuildingAddress(address)}:${name}`;
 5460 | }
 5461 | 
 5462 | function normalizeBuildingLegalDongCode(value) {
 5463 |   const digits = String(value ?? "").replace(/\D/g, "");
 5464 |   if (digits.length === 10) return digits;
 5465 |   if (digits.length > 10) return digits.slice(0, 10);
 5466 |   return "";
 5467 | }
 5468 | 
 5469 | function kaptGeocodingTarget(row) {
 5470 |   const addresses = kaptAddressOf(row);
 5471 |   const code = kaptCodeOf(row);
 5472 |   const name = kaptNameOf(row) || null;
 5473 |   const legalDongCode = normalizeBuildingLegalDongCode(
 5474 |     row?.bjdCode ?? row?.bjd_code ?? row?.bjdongCode ?? row?.bjdong_code ??
 5475 |     row?.legaldongCode ?? row?.legal_dong_code
 5476 |   );
 5477 | 
 5478 |   // K-APT 목록 API는 주소가 as1/as2/as3까지만 내려오는 경우가 있다.
 5479 |   // 기본정보에서 보강된 도로명/지번주소와 단지명을 모두 별칭으로 제공하여
 5480 |   // 현재 coupangRouteMap.html의 Kakao addressSearch가 가장 구체적인 주소부터 찾게 한다.
 5481 |   const rawAliases = [
 5482 |     addresses.roadAddress,
 5483 |     addresses.parcelAddress,
 5484 |     addresses.preferredAddress,
 5485 |     [addresses.roadAddress, name].filter(Boolean).join(" "),
 5486 |     [addresses.parcelAddress, name].filter(Boolean).join(" "),
 5487 |     [
 5488 |       publicDataField(row, "as1"),
 5489 |       publicDataField(row, "as2"),
 5490 |       publicDataField(row, "as3"),
 5491 |       publicDataField(row, "as4"),
 5492 |       name,
 5493 |     ].map(cleanBuildingText).filter(Boolean).join(" "),
 5494 |   ];
 5495 |   const addressAliases = [];
 5496 |   const seenAliases = new Set();
 5497 |   for (const value of rawAliases) {
 5498 |     const cleaned = cleanBuildingText(value);
 5499 |     if (!cleaned) continue;
 5500 |     for (const alias of [cleaned, cleaned.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()]) {
 5501 |       const normalized = normalizedBuildingAddress(alias);
 5502 |       if (!alias || !normalized || seenAliases.has(normalized)) continue;
 5503 |       seenAliases.add(normalized);
 5504 |       addressAliases.push(alias);
 5505 |     }
 5506 |   }
 5507 | 
 5508 |   return {
 5509 |     key: kaptComplexKey(row),
 5510 |     managementKey: code || null,
 5511 |     sourceType: "KAPT_COMPLEX",
 5512 |     kaptCode: code || null,
 5513 |     roadAddress: addresses.roadAddress || null,
 5514 |     parcelAddress: addresses.parcelAddress || null,
 5515 |     address: addresses.preferredAddress || addressAliases[0] || null,
 5516 |     addressAliases,
 5517 |     buildingName: name,
 5518 |     dongName: null,
 5519 |     purpose: "공동주택",
 5520 |     residential: true,
 5521 |     apartment: true,
 5522 |     legalDongCode: legalDongCode || null,
 5523 |     identityRequired: false,
 5524 |   };
 5525 | }
 5526 | 
 5527 | function buildingStatsTargetAddressAliases(target) {
 5528 |   const values = [
 5529 |     target?.roadAddress,
 5530 |     target?.road_address,
 5531 |     target?.parcelAddress,
 5532 |     target?.parcel_address,
 5533 |     target?.address,
 5534 |     ...(Array.isArray(target?.addressAliases)
 5535 |       ? target.addressAliases
 5536 |       : []),
 5537 |     ...(Array.isArray(target?.address_aliases)
 5538 |       ? target.address_aliases
 5539 |       : []),
 5540 |   ];

// ...
 5766 |   ].map(cleanBuildingText).filter(Boolean);
 5767 | 
 5768 |   for (const key of directKeys) {
 5769 |     if (locationIndex.has(key)) return locationIndex.get(key);
 5770 |   }
 5771 | 
 5772 |   for (const address of buildingStatsTargetAddressAliases(target)) {
 5773 |     const normalized = normalizedBuildingAddress(address);
 5774 |     if (normalized && locationIndex.has(normalized)) {
 5775 |       return locationIndex.get(normalized);
 5776 |     }
 5777 |   }
 5778 | 
 5779 |   return null;
 5780 | }
 5781 | 
 5782 | function kaptRegionCodeVariants(value) {
 5783 |   const digits = String(value || "").replace(/\D/g, "");
 5784 |   if (!digits) return [];
 5785 | 
 5786 |   const variants = [digits];
 5787 |   // 특별자치도 출범 전/후 코드가 공공데이터 서비스별로 섞여 있다.
 5788 |   // 양방향으로 모두 조회해야 Kakao(신코드) ↔ Building HUB/K-APT(구코드) 결속이 끊기지 않는다.
 5789 |   if (digits.startsWith("51")) variants.push(`42${digits.slice(2)}`);
 5790 |   if (digits.startsWith("42")) variants.push(`51${digits.slice(2)}`);
 5791 |   if (digits.startsWith("52")) variants.push(`45${digits.slice(2)}`);
 5792 |   if (digits.startsWith("45")) variants.push(`52${digits.slice(2)}`);
 5793 | 
 5794 |   return [...new Set(variants)];
 5795 | }
 5796 | 
 5797 | 
 5798 | async function fetchKaptLegalDongPage(env, legalDongCode, pageNo) {
 5799 |   const data = await fetchPublicDataJson(
 5800 |     KAPT_LEGAL_DONG_LIST_URL,
 5801 |     {
 5802 |       bjdCode: legalDongCode,
 5803 |       pageNo,
 5804 |       numOfRows: KAPT_PAGE_SIZE,
 5805 |     },
 5806 |     env,
 5807 |     "K-APT legal dong list"
 5808 |   );
 5809 | 
 5810 |   return publicDataResponseParts(data, "K-APT legal dong list");
 5811 | }
 5812 | 
 5813 | async function fetchKaptComplexes(env, legalDongCodes) {
 5814 |   const rows = [];
 5815 | 
 5816 |   for (const dong of legalDongCodes) {
 5817 |     const codeVariants = kaptRegionCodeVariants(dong?.legalDongCode);
 5818 | 
 5819 |     for (const legalDongCode of codeVariants) {
 5820 |       let expectedTotal = null;
 5821 | 
 5822 |       for (let pageNo = 1; pageNo <= KAPT_MAX_PAGES_PER_DONG; pageNo++) {
 5823 |         const page = await fetchKaptLegalDongPage(
 5824 |           env,
 5825 |           legalDongCode,
 5826 |           pageNo
 5827 |         );
 5828 | 
 5829 |         if (expectedTotal == null) expectedTotal = page.totalCount;
 5830 |         rows.push(...page.items);
 5831 | 
 5832 |         if (
 5833 |           page.items.length === 0 ||
 5834 |           page.items.length < KAPT_PAGE_SIZE ||
 5835 |           pageNo * KAPT_PAGE_SIZE >= expectedTotal
 5836 |         ) {
 5837 |           break;
 5838 |         }
 5839 |       }
 5840 |     }
 5841 |   }
 5842 | 
 5843 |   const deduped = [];
 5844 |   const seen = new Set();
 5845 | 
 5846 |   for (const row of rows) {
 5847 |     const key = kaptComplexKey(row);
 5848 |     if (!key || seen.has(key)) continue;
 5849 |     seen.add(key);
 5850 |     deduped.push(row);
 5851 |   }
 5852 | 
 5853 |   return deduped;
 5854 | }
 5855 | 
 5856 | 
 5857 | async function fetchKaptSigunguPageWithParam(
 5858 |   env,
 5859 |   sigunguCode,
 5860 |   pageNo,
 5861 |   parameterName
 5862 | ) {
 5863 |   const data = await fetchPublicDataJson(
 5864 |     KAPT_SIGUNGU_LIST_URL,
 5865 |     {
 5866 |       [parameterName]: sigunguCode,
 5867 |       pageNo,
 5868 |       numOfRows: KAPT_PAGE_SIZE,
 5869 |     },
 5870 |     env,
 5871 |     `K-APT sigungu list (${parameterName})`
 5872 |   );
 5873 | 
 5874 |   return publicDataResponseParts(
 5875 |     data,
 5876 |     `K-APT sigungu list (${parameterName})`
 5877 |   );
 5878 | }
 5879 | 
 5880 | async function fetchKaptSigunguComplexes(env, legalDongCodes) {
 5881 |   const sigunguCodes = [...new Set(
 5882 |     (legalDongCodes || [])
 5883 |       .flatMap((row) => {
 5884 |         const current = String(row?.legalDongCode || "").replace(/\D/g, "").slice(0, 5);
 5885 |         return current.length === 5 ? kaptRegionCodeVariants(current) : [];
 5886 |       })
 5887 |       .filter((value) => value.length === 5)
 5888 |   )];
 5889 | 
 5890 |   const rows = [];
 5891 | 
 5892 |   for (const sigunguCode of sigunguCodes) {
 5893 |     let selectedParameter = "sigunguCode";
 5894 |     let firstPage = null;
 5895 | 
 5896 |     try {
 5897 |       firstPage = await fetchKaptSigunguPageWithParam(
 5898 |         env,
 5899 |         sigunguCode,
 5900 |         1,
 5901 |         selectedParameter
 5902 |       );
 5903 |     } catch (firstError) {
 5904 |       selectedParameter = "sigunguCd";
 5905 |       firstPage = await fetchKaptSigunguPageWithParam(
 5906 |         env,
 5907 |         sigunguCode,
 5908 |         1,
 5909 |         selectedParameter
 5910 |       );
 5911 |     }
 5912 | 
 5913 |     // 일부 이관 환경은 잘못된 파라미터를 오류 대신 빈 목록으로 반환한다.

// ...
 5918 |           sigunguCode,
 5919 |           1,
 5920 |           "sigunguCd"
 5921 |         );
 5922 |         if (alternate.items.length) {
 5923 |           firstPage = alternate;
 5924 |           selectedParameter = "sigunguCd";
 5925 |         }
 5926 |       } catch {}
 5927 |     }
 5928 | 
 5929 |     rows.push(...firstPage.items);
 5930 |     const total = firstPage.totalCount;
 5931 | 
 5932 |     for (
 5933 |       let pageNo = 2;
 5934 |       pageNo <= KAPT_SIGUNGU_MAX_PAGES &&
 5935 |       (pageNo - 1) * KAPT_PAGE_SIZE < total;
 5936 |       pageNo++
 5937 |     ) {
 5938 |       const page = await fetchKaptSigunguPageWithParam(
 5939 |         env,
 5940 |         sigunguCode,
 5941 |         pageNo,
 5942 |         selectedParameter
 5943 |       );
 5944 |       rows.push(...page.items);
 5945 |       if (page.items.length < KAPT_PAGE_SIZE) break;
 5946 |     }
 5947 |   }
 5948 | 
 5949 |   const deduped = [];
 5950 |   const seen = new Set();
 5951 |   for (const row of rows) {
 5952 |     const key = kaptComplexKey(row);
 5953 |     if (!key || seen.has(key)) continue;
 5954 |     seen.add(key);
 5955 |     deduped.push(row);
 5956 |   }
 5957 |   return deduped;
 5958 | }
 5959 | 
 5960 | function compactBuildingMatchText(value) {
 5961 |   return cleanBuildingText(value)
 5962 |     .toLowerCase()
 5963 |     .replace(/아파트|오피스텔|주상복합|연립주택|연립|빌라/g, "")
 5964 |     .replace(/[^0-9a-z가-힣]/g, "");
 5965 | }
 5966 | 
 5967 | function uniqueNormalizedBuildingAddresses(values) {
 5968 |   return [...new Set(
 5969 |     (values || [])
 5970 |       .map((value) => normalizedBuildingAddress(value))
 5971 |       .filter(Boolean)
 5972 |   )];
 5973 | }
 5974 | 
 5975 | function kaptFallbackAddressEvidence(complex, titleRow) {
 5976 |   const kaptAddresses = kaptAddressOf(complex);
 5977 |   const titleAddresses = buildingRecordAddresses(titleRow);
 5978 |   const kaptList = uniqueNormalizedBuildingAddresses([
 5979 |     kaptAddresses.parcelAddress,
 5980 |     kaptAddresses.roadAddress,
 5981 |     kaptAddresses.preferredAddress,
 5982 |   ]);
 5983 |   const titleList = uniqueNormalizedBuildingAddresses([
 5984 |     titleAddresses.parcelAddress,
 5985 |     titleAddresses.roadAddress,
 5986 |     titleAddresses.preferredAddress,
 5987 |   ]);
 5988 | 
 5989 |   let exact = false;
 5990 |   let numberMatch = false;
 5991 |   for (const left of kaptList) {
 5992 |     for (const right of titleList) {
 5993 |       if (left === right) exact = true;
 5994 |       if (buildingAddressSimilarity(left, right)) numberMatch = true;
 5995 |     }
 5996 |   }
 5997 | 
 5998 |   const kaptParcel = normalizedBuildingAddress(kaptAddresses.parcelAddress);
 5999 |   const titleParcel = normalizedBuildingAddress(titleAddresses.parcelAddress);
 6000 |   const parcelExact = !!(kaptParcel && titleParcel && kaptParcel === titleParcel);
 6001 |   const parcelNumberMatch = !!(
 6002 |     kaptParcel && titleParcel && buildingAddressSimilarity(kaptParcel, titleParcel)
 6003 |   );
 6004 | 
 6005 |   return { exact, numberMatch, parcelExact, parcelNumberMatch };
 6006 | }
 6007 | 
 6008 | function kaptFallbackTitleMatch(complex, titleRows) {
 6009 |   const complexName = compactBuildingMatchText(kaptNameOf(complex));
 6010 |   let best = null;
 6011 | 
 6012 |   for (const row of titleRows || []) {
 6013 |     const classification = buildingHousingClassification(row);
 6014 |     if (!classification.apartment) continue;
 6015 | 
 6016 |     const titleName = compactBuildingMatchText(row?.bldNm ?? row?.bld_nm ?? "");
 6017 |     const addressEvidence = kaptFallbackAddressEvidence(complex, row);
 6018 |     const nameExact = !!(complexName && titleName && complexName === titleName);
 6019 |     const nameContains = !!(
 6020 |       complexName && titleName &&
 6021 |       Math.min(complexName.length, titleName.length) >= 2 &&
 6022 |       (complexName.includes(titleName) || titleName.includes(complexName))
 6023 |     );
 6024 |     const shortOrGenericName = Math.min(
 6025 |       complexName?.length || 0,
 6026 |       titleName?.length || 0
 6027 |     ) <= 3;
 6028 | 
 6029 |     // V47: 이 1차 매칭은 주소/지번 또는 충분히 긴 고유 단지명만 허용한다.
 6030 |     // 동신/우성처럼 짧은 이름은 아래 unique-scope 보정에서 "폴리곤 내부 필지 1개 +
 6031 |     // 시군구 K-APT 후보 1개"가 동시에 성립할 때만 안전하게 결속한다.
 6032 |     if (
 6033 |       shortOrGenericName && (nameExact || nameContains) &&
 6034 |       !addressEvidence.parcelNumberMatch && !addressEvidence.exact
 6035 |     ) continue;
 6036 | 
 6037 |     let score = 0;
 6038 |     const reasons = [];
 6039 |     if (addressEvidence.parcelExact) {
 6040 |       score += 220;
 6041 |       reasons.push("parcel_exact");
 6042 |     } else if (addressEvidence.parcelNumberMatch) {
 6043 |       score += 150;
 6044 |       reasons.push("parcel_number");
 6045 |     } else if (addressEvidence.exact) {

// ...
 6097 |   if (!matches.length) return "";
 6098 |   const match = matches[matches.length - 1];
 6099 |   const main = String(Number(match?.[2] || 0));
 6100 |   const sub = Number(match?.[3] || 0);
 6101 |   if (!main || main === "0") return "";
 6102 |   return `${match?.[1] ? "산" : ""}${main}${sub > 0 ? `-${sub}` : ""}`;
 6103 | }
 6104 | 
 6105 | function scopeParcelLotTokenV48(entry) {
 6106 |   const parcel = entry?.parcel || {};
 6107 |   const main = Number(String(parcel?.bun || "").replace(/\D/g, ""));
 6108 |   const sub = Number(String(parcel?.ji || "").replace(/\D/g, ""));
 6109 |   if (!Number.isFinite(main) || main <= 0) return "";
 6110 |   return `${String(parcel?.platGbCd || "0") === "1" ? "산" : ""}${main}${sub > 0 ? `-${sub}` : ""}`;
 6111 | }
 6112 | 
 6113 | function kaptLegalDongCodeV48(complex) {
 6114 |   return normalizeBuildingLegalDongCode(
 6115 |     publicDataField(
 6116 |       complex,
 6117 |       "bjdCode", "bjd_code", "bjdongCode", "bjdong_code",
 6118 |       "legaldongCode", "legal_dong_code"
 6119 |     )
 6120 |   );
 6121 | }
 6122 | 
 6123 | function scopeParcelLegalDongCodeV48(entry) {
 6124 |   const parcel = entry?.parcel || {};
 6125 |   const sigunguCd = String(parcel?.sigunguCd || "").replace(/\D/g, "").padStart(5, "0").slice(-5);
 6126 |   const bjdongCd = String(parcel?.bjdongCd || "").replace(/\D/g, "").padStart(5, "0").slice(-5);
 6127 |   const value = `${sigunguCd}${bjdongCd}`;
 6128 |   return /^\d{10}$/.test(value) ? value : "";
 6129 | }
 6130 | 
 6131 | function kaptScopeLegalDongCompatibleV48(complex, entry) {
 6132 |   const complexCode = kaptLegalDongCodeV48(complex);
 6133 |   const scopeCode = scopeParcelLegalDongCodeV48(entry);
 6134 |   if (!complexCode || !scopeCode) return true;
 6135 |   if (complexCode === scopeCode) return true;
 6136 |   return (
 6137 |     kaptRegionCodeVariants(scopeCode).includes(complexCode) ||
 6138 |     kaptRegionCodeVariants(complexCode).includes(scopeCode)
 6139 |   );
 6140 | }
 6141 | 
 6142 | function kaptScopeParcelCandidateV48(complex, entry) {
 6143 |   if (!complex || !entry || !kaptScopeLegalDongCompatibleV48(complex, entry)) return null;
 6144 | 
 6145 |   const complexName = compactBuildingMatchText(kaptNameOf(complex));
 6146 |   const scopeNames = scopeParcelBuildingNamesV48(entry)
 6147 |     .map(compactBuildingMatchText)
 6148 |     .filter(Boolean);
 6149 | 
 6150 |   const nameExact = Boolean(
 6151 |     complexName && scopeNames.some((name) => name === complexName)
 6152 |   );
 6153 |   const nameContains = Boolean(
 6154 |     complexName && scopeNames.some((name) => (
 6155 |       Math.min(name.length, complexName.length) >= 2 &&
 6156 |       (name.includes(complexName) || complexName.includes(name))
 6157 |     ))
 6158 |   );
 6159 | 
 6160 |   const kaptAddresses = kaptAddressOf(complex);
 6161 |   const scopeParcelAddress = cleanBuildingText(entry?.parcelAddress);
 6162 |   const scopeRoadAddress = cleanBuildingText(entry?.roadAddress);
 6163 |   const scopeMatchedAddress = cleanBuildingText(entry?.matchedAddress);
 6164 | 
 6165 |   const normalizedKaptParcel = normalizedBuildingAddress(kaptAddresses.parcelAddress);
 6166 |   const normalizedKaptRoad = normalizedBuildingAddress(kaptAddresses.roadAddress);
 6167 |   const normalizedKaptPreferred = normalizedBuildingAddress(kaptAddresses.preferredAddress);
 6168 |   const normalizedScopeParcel = normalizedBuildingAddress(scopeParcelAddress);
 6169 |   const normalizedScopeRoad = normalizedBuildingAddress(scopeRoadAddress);
 6170 |   const normalizedScopeMatched = normalizedBuildingAddress(scopeMatchedAddress);
 6171 | 
 6172 |   const parcelExact = Boolean(
 6173 |     normalizedKaptParcel && normalizedScopeParcel && normalizedKaptParcel === normalizedScopeParcel
 6174 |   );
 6175 |   const roadExact = Boolean(
 6176 |     normalizedKaptRoad && normalizedScopeRoad && normalizedKaptRoad === normalizedScopeRoad
 6177 |   );
 6178 |   const matchedAddressExact = Boolean(
 6179 |     normalizedKaptPreferred && normalizedScopeMatched && normalizedKaptPreferred === normalizedScopeMatched
 6180 |   );
 6181 | 
 6182 |   const kaptLot = lastParcelLotTokenV48(kaptAddresses.parcelAddress);
 6183 |   const scopeLot = scopeParcelLotTokenV48(entry);
 6184 |   const parcelLotExact = Boolean(kaptLot && scopeLot && kaptLot === scopeLot);
 6185 | 
 6186 |   const addressNumberMatch = Boolean(
 6187 |     (kaptAddresses.parcelAddress && scopeParcelAddress && buildingAddressSimilarity(kaptAddresses.parcelAddress, scopeParcelAddress)) ||
 6188 |     (kaptAddresses.roadAddress && scopeRoadAddress && buildingAddressSimilarity(kaptAddresses.roadAddress, scopeRoadAddress)) ||
 6189 |     (kaptAddresses.preferredAddress && scopeMatchedAddress && buildingAddressSimilarity(kaptAddresses.preferredAddress, scopeMatchedAddress))
 6190 |   );
 6191 | 
 6192 |   const strongAddress = parcelExact || parcelLotExact || roadExact || matchedAddressExact;
 6193 |   if (!strongAddress && !addressNumberMatch && !nameExact && !nameContains) return null;
 6194 | 
 6195 |   let score = 0;
 6196 |   const reasons = [];
 6197 |   if (parcelExact) { score += 420; reasons.push("scope_parcel_address_exact"); }
 6198 |   else if (parcelLotExact) { score += 340; reasons.push("scope_parcel_lot_exact"); }
 6199 |   if (roadExact) { score += 300; reasons.push("scope_road_address_exact"); }
 6200 |   if (matchedAddressExact) { score += 260; reasons.push("scope_matched_address_exact"); }
 6201 |   if (addressNumberMatch && !strongAddress) { score += 90; reasons.push("scope_address_number"); }
 6202 |   if (nameExact) { score += complexName.length <= 3 ? 140 : 170; reasons.push("scope_building_name_exact"); }
 6203 |   else if (nameContains) { score += complexName.length <= 3 ? 95 : 120; reasons.push("scope_building_name_contains"); }
 6204 | 
 6205 |   const buildingName = scopeParcelBuildingNamesV48(entry)[0] || "";
 6206 |   return {
 6207 |     row: null,
 6208 |     entry,
 6209 |     score,
 6210 |     reason: reasons.join("+") || "verified_scope_parcel",
 6211 |     titleKey: "",
 6212 |     parcelKey: cleanBuildingText(entry?.key),
 6213 |     buildingName,
 6214 |     titleAddress: scopeParcelAddress || scopeRoadAddress || scopeMatchedAddress || "",
 6215 |     scopeNameKey: compactBuildingMatchText(buildingName),
 6216 |     strongAddress,
 6217 |     nameExact,
 6218 |     nameContains,
 6219 |   };
 6220 | }
 6221 | 
 6222 | function buildKaptVerifiedScopeParcelBindingsV48(kaptRows, verifiedScopeParcels) {
 6223 |   const scopeMap = verifiedScopeParcels?.map instanceof Map
 6224 |     ? verifiedScopeParcels.map
 6225 |     : new Map();
 6226 |   if (!scopeMap.size) return new Map();
 6227 | 
 6228 |   const preliminary = [];
 6229 |   for (const complex of kaptRows || []) {
 6230 |     const complexKey = kaptComplexKey(complex);
 6231 |     if (!complexKey) continue;
 6232 | 
 6233 |     const candidates = [...scopeMap.values()]
 6234 |       .map((entry) => kaptScopeParcelCandidateV48(complex, entry))
 6235 |       .filter(Boolean)
 6236 |       .sort((a, b) => b.score - a.score);
 6237 |     if (!candidates.length) continue;
 6238 | 
 6239 |     const top = candidates[0];
 6240 |     const second = candidates[1] || null;
 6241 |     const distinctNames = new Set(candidates.map((row) => row.scopeNameKey).filter(Boolean));
 6242 |     const sameNamedScopeGroup = Boolean(
 6243 |       (top.nameExact || top.nameContains) && distinctNames.size === 1
 6244 |     );
 6245 |     const clearlyBetter = Boolean(second && top.score - second.score >= 140);
 6246 |     const acceptable = top.strongAddress || candidates.length === 1 || sameNamedScopeGroup || clearlyBetter;
 6247 |     if (!acceptable) continue;
 6248 | 
 6249 |     preliminary.push({ complexKey, complex, match: top });
 6250 |   }
 6251 | 
 6252 |   // 하나의 scope 필지에 이름만 같은 K-APT 후보가 여러 개 걸리면 오매칭을 막는다.
 6253 |   const byParcel = new Map();
 6254 |   for (const item of preliminary) {
 6255 |     const key = cleanBuildingText(item.match?.parcelKey);
 6256 |     if (!key) continue;
 6257 |     if (!byParcel.has(key)) byParcel.set(key, []);
 6258 |     byParcel.get(key).push(item);
 6259 |   }
 6260 | 
 6261 |   const accepted = new Map();
 6262 |   for (const items of byParcel.values()) {

// ...
 6304 |       : `title:${fallbackKey}|name:${compactName}`;
 6305 | 
 6306 |     if (!groups.has(groupKey)) {
 6307 |       groups.set(groupKey, {
 6308 |         key: groupKey,
 6309 |         parcelKey,
 6310 |         compactName,
 6311 |         rows: [],
 6312 |       });
 6313 |     }
 6314 |     groups.get(groupKey).rows.push(row);
 6315 |   }
 6316 | 
 6317 |   return [...groups.values()];
 6318 | }
 6319 | 
 6320 | function kaptScopeNameCandidateV47(complex, group) {
 6321 |   const complexName = compactBuildingMatchText(kaptNameOf(complex));
 6322 |   const titleName = cleanBuildingText(group?.compactName);
 6323 |   if (!complexName || !titleName || Math.min(complexName.length, titleName.length) < 2) {
 6324 |     return null;
 6325 |   }
 6326 | 
 6327 |   const nameExact = complexName === titleName;
 6328 |   const nameContains = !nameExact && (
 6329 |     complexName.includes(titleName) || titleName.includes(complexName)
 6330 |   );
 6331 |   if (!nameExact && !nameContains) return null;
 6332 | 
 6333 |   let bestAddress = {
 6334 |     exact: false,
 6335 |     numberMatch: false,
 6336 |     parcelExact: false,
 6337 |     parcelNumberMatch: false,
 6338 |   };
 6339 |   let representativeRow = group?.rows?.[0] || null;
 6340 | 
 6341 |   for (const row of group?.rows || []) {
 6342 |     const evidence = kaptFallbackAddressEvidence(complex, row);
 6343 |     const currentRank =
 6344 |       (evidence.parcelExact ? 8 : 0) +
 6345 |       (evidence.parcelNumberMatch ? 4 : 0) +
 6346 |       (evidence.exact ? 2 : 0) +
 6347 |       (evidence.numberMatch ? 1 : 0);
 6348 |     const bestRank =
 6349 |       (bestAddress.parcelExact ? 8 : 0) +
 6350 |       (bestAddress.parcelNumberMatch ? 4 : 0) +
 6351 |       (bestAddress.exact ? 2 : 0) +
 6352 |       (bestAddress.numberMatch ? 1 : 0);
 6353 |     if (currentRank > bestRank) {
 6354 |       bestAddress = evidence;
 6355 |       representativeRow = row;
 6356 |     }
 6357 |   }
 6358 | 
 6359 |   const strongAddress = Boolean(
 6360 |     bestAddress.parcelExact ||
 6361 |     bestAddress.parcelNumberMatch ||
 6362 |     bestAddress.exact
 6363 |   );
 6364 |   const anyAddress = strongAddress || bestAddress.numberMatch;
 6365 |   const shortName = Math.min(complexName.length, titleName.length) <= 3;
 6366 | 
 6367 |   let score = 0;
 6368 |   const reasons = [];
 6369 |   if (bestAddress.parcelExact) {
 6370 |     score += 260;

// ...
 6394 |   return {
 6395 |     complex,
 6396 |     group,
 6397 |     row,
 6398 |     score,
 6399 |     strongAddress,
 6400 |     anyAddress,
 6401 |     shortName,
 6402 |     reason: reasons.join("+") || "scope_name",
 6403 |     titleKey: buildingRecordKey(row),
 6404 |     parcelKey: group?.parcelKey || buildingParcelDescriptor(row)?.key || "",
 6405 |     buildingName: cleanBuildingText(row?.bldNm ?? row?.bld_nm) || "",
 6406 |     titleAddress: buildingRecordAddresses(row).preferredAddress || "",
 6407 |   };
 6408 | }
 6409 | 
 6410 | function buildUniqueKaptScopeNameBindingsV47(kaptRows, titleRows) {
 6411 |   const groups = buildKaptScopeApartmentGroupsV47(titleRows);
 6412 |   const candidatesByGroup = new Map();
 6413 |   for (const complex of kaptRows || []) {
 6414 |     const complexKey = kaptComplexKey(complex);
 6415 |     if (!complexKey) continue;
 6416 | 
 6417 |     const matches = [];
 6418 |     for (const group of groups) {
 6419 |       const candidate = kaptScopeNameCandidateV47(complex, group);
 6420 |       if (candidate) matches.push(candidate);
 6421 |     }
 6422 | 
 6423 |     // 한 K-APT 후보가 scope의 서로 다른 필지 두 곳에 동시에 걸리면 이름만으로 결속하지 않는다.
 6424 |     const uniqueGroupKeys = new Set(matches.map((candidate) => candidate.group?.key).filter(Boolean));
 6425 |     if (uniqueGroupKeys.size !== 1 || matches.length === 0) continue;
 6426 | 
 6427 |     const candidate = matches.sort((a, b) => b.score - a.score)[0];
 6428 |     const groupKey = candidate.group.key;
 6429 |     if (!candidatesByGroup.has(groupKey)) candidatesByGroup.set(groupKey, []);
 6430 |     candidatesByGroup.get(groupKey).push(candidate);
 6431 |   }
 6432 | 
 6433 |   const accepted = new Map();
 6434 | 
 6435 |   for (const [groupKey, candidates] of candidatesByGroup.entries()) {
 6436 |     const ordered = [...candidates].sort((a, b) => b.score - a.score);
 6437 |     if (!ordered.length) continue;
 6438 | 
 6439 |     const top = ordered[0];
 6440 |     const second = ordered[1] || null;
 6441 | 
 6442 |     // 주소/지번 직접 증거가 있으면 기존 정책처럼 채택한다.
 6443 |     // 주소 증거 없이 동신/우성처럼 짧은 이름만 남은 경우에는 해당 scope 필지에
 6444 |     // 대응하는 K-APT 후보가 시군구 목록에서 단 하나일 때만 허용한다.
 6445 |     const uniquelyNamedInSigungu = ordered.length === 1;
 6446 |     const clearlyBetterThanSecond = Boolean(
 6447 |       second && top.score - second.score >= 80 && top.anyAddress
 6448 |     );
 6449 |     const acceptable = top.strongAddress || uniquelyNamedInSigungu || clearlyBetterThanSecond;
 6450 |     if (!acceptable) continue;
 6451 | 
 6452 |     const complexKey = kaptComplexKey(top.complex);
 6453 |     if (!complexKey) continue;
 6454 | 
 6455 |     accepted.set(complexKey, {
 6456 |       row: top.row,
 6457 |       score: top.score + (uniquelyNamedInSigungu ? 40 : 0),
 6458 |       reason: `${top.reason}+${uniquelyNamedInSigungu ? "unique_scope_sigungu_candidate" : "scope_address_disambiguated"}`,
 6459 |       titleKey: top.titleKey,
 6460 |       parcelKey: top.parcelKey,
 6461 |       buildingName: top.buildingName,
 6462 |       titleAddress: top.titleAddress,
 6463 |       groupKey,
 6464 |       shortName: top.shortName,
 6465 |     });
 6466 |   }
 6467 | 
 6468 |   return accepted;
 6469 | }
 6470 | 
 6471 | function kaptScopeBindingFields(complex) {
 6472 |   if (!complex || typeof complex !== "object") return {};
 6473 |   const fields = {};
 6474 |   for (const key of [
 6475 |     "__scopeTitleKeyV46",
 6476 |     "__scopeParcelKeyV46",
 6477 |     "__scopeBuildingNameV46",
 6478 |     "__scopeTitleAddressV46",
 6479 |     "__scopeMatchScoreV46",
 6480 |     "__scopeMatchReasonV46",
 6481 |   ]) {
 6482 |     if (complex[key] !== undefined && complex[key] !== null && complex[key] !== "") {
 6483 |       fields[key] = complex[key];
 6484 |     }
 6485 |   }
 6486 |   return fields;
 6487 | }
 6488 | 
 6489 | function bindKaptComplexToTitleV46(complex, match) {
 6490 |   return {
 6491 |     ...complex,
 6492 |     __scopeTitleKeyV46: match?.titleKey || "",
 6493 |     __scopeParcelKeyV46: match?.parcelKey || "",
 6494 |     __scopeBuildingNameV46: match?.buildingName || "",
 6495 |     __scopeTitleAddressV46: match?.titleAddress || "",
 6496 |     __scopeMatchScoreV46: Number(match?.score || 0),
 6497 |     __scopeMatchReasonV46: cleanBuildingText(match?.reason || "sigungu_title_match"),
 6498 |   };
 6499 | }

// ...
 6506 | ) {
 6507 |   const sigunguRows = await fetchKaptSigunguComplexes(env, legalDongCodes);
 6508 |   const directScopeParcelBindings = buildKaptVerifiedScopeParcelBindingsV48(
 6509 |     sigunguRows,
 6510 |     verifiedScopeParcels
 6511 |   );
 6512 |   const uniqueScopeNameBindings = buildUniqueKaptScopeNameBindingsV47(
 6513 |     sigunguRows,
 6514 |     titleRows
 6515 |   );
 6516 |   const matchedRows = [];
 6517 |   let scopeParcelMatchedCount = 0;
 6518 |   let strictMatchedCount = 0;
 6519 |   let uniqueScopeMatchedCount = 0;
 6520 | 
 6521 |   for (const row of sigunguRows) {
 6522 |     const complexKey = kaptComplexKey(row);
 6523 |     const directScopeMatch = directScopeParcelBindings.get(complexKey) || null;
 6524 |     const strictMatch = kaptFallbackTitleMatch(row, titleRows);
 6525 |     const uniqueScopeMatch = uniqueScopeNameBindings.get(complexKey) || null;
 6526 |     const ranked = [
 6527 |       { kind: "scope-parcel", match: directScopeMatch },
 6528 |       { kind: "strict-title", match: strictMatch },
 6529 |       { kind: "unique-title", match: uniqueScopeMatch },
 6530 |     ]
 6531 |       .filter((item) => item.match)
 6532 |       .sort((a, b) => Number(b.match?.score || 0) - Number(a.match?.score || 0));
 6533 |     const selected = ranked[0] || null;
 6534 |     if (!selected) continue;
 6535 | 
 6536 |     if (selected.kind === "scope-parcel") scopeParcelMatchedCount += 1;
 6537 |     else if (selected.kind === "strict-title") strictMatchedCount += 1;
 6538 |     else uniqueScopeMatchedCount += 1;
 6539 | 
 6540 |     matchedRows.push(bindKaptComplexToTitleV46(row, selected.match));
 6541 |   }
 6542 | 
 6543 |   // 같은 실제 아파트 필지/이름에 후보가 여러 개 걸리면 가장 강한 한 건만 선택한다.
 6544 |   const selectedByBinding = new Map();
 6545 |   for (const row of matchedRows) {
 6546 |     const parcelKey = cleanBuildingText(row.__scopeParcelKeyV46);
 6547 |     const buildingName = compactBuildingMatchText(row.__scopeBuildingNameV46);
 6548 |     const titleKey = cleanBuildingText(row.__scopeTitleKeyV46);
 6549 |     const bindingKey = parcelKey ? `${parcelKey}|${buildingName}` : titleKey || kaptComplexKey(row);
 6550 |     const previous = selectedByBinding.get(bindingKey);
 6551 |     if (!previous || Number(row.__scopeMatchScoreV46 || 0) > Number(previous.__scopeMatchScoreV46 || 0)) {
 6552 |       selectedByBinding.set(bindingKey, row);
 6553 |     }
 6554 |   }
 6555 | 
 6556 |   return {
 6557 |     rows: [...selectedByBinding.values()],
 6558 |     // V49: 이름/지번 직접결속이 실패해도 direct-scope에서는 이 시군구 후보를
 6559 |     // 프론트 Kakao 주소검색으로 좌표화한 뒤 실제 폴리곤 포함 여부로 최종 판정한다.
 6560 |     // 국토부 Building HUB의 아파트 용도/건물명이 잘못되어도 K-APT 자체 주소가
 6561 |     // 폴리곤 안에 있으면 단지를 복구할 수 있도록 원 후보 목록도 함께 반환한다.
 6562 |     candidates: sigunguRows,
 6563 |     mode: "[long-token-redacted]",
 6564 |     fallbackCount: sigunguRows.length,
 6565 |     rawMatchedCount: matchedRows.length,
 6566 |     scopeParcelMatchedCount,
 6567 |     strictMatchedCount,
 6568 |     uniqueScopeMatchedCount,
 6569 |   };
 6570 | }
 6571 | function firstObjectFromPublicData(data, label) {
 6572 |   const parts = publicDataResponseParts(data, label);
 6573 |   if (parts.items.length) return parts.items[0];
 6574 | 
 6575 |   const response = data?.response ?? data?.Response ?? data ?? {};
 6576 |   const body = parts.body || {};
 6577 |   const candidates = [

// ...
 6600 |     }
 6601 |   }
 6602 | 
 6603 |   // K-APT JSON은 body 없이 최상위 객체 자체가 Item일 수 있다.
 6604 |   const metadataKeys = new Set([
 6605 |     "resultCode", "resultMsg", "header", "body", "response",
 6606 |     "totalCount", "pageNo", "numOfRows"
 6607 |   ]);
 6608 |   const ownDataKeys = Object.keys(response || {}).filter(
 6609 |     (key) => !metadataKeys.has(key)
 6610 |   );
 6611 |   if (ownDataKeys.length) return response;
 6612 | 
 6613 |   return {};
 6614 | }
 6615 | 
 6616 | function kaptRawHouseholdCount(info) {
 6617 |   const aliases = [
 6618 |     "kaptdaCnt", "kaptDaCnt", "kapt_da_cnt", "kaptdacnt",
 6619 |     "householdCount", "household_count", "hhldCnt", "hhld_cnt",
 6620 |     "hoCnt", "ho_cnt"
 6621 |   ];
 6622 | 
 6623 |   for (const source of [info?.basic, info?.detail, info?.list]) {
 6624 |     const value = firstFiniteBuildingValue(
 6625 |       ...aliases.map((key) => publicDataField(source, key))
 6626 |     );
 6627 |     if (value != null && value > 0) return Math.trunc(value);
 6628 |   }
 6629 | 
 6630 |   return 0;
 6631 | }
 6632 | 
 6633 | async function fetchKaptEndpointPair(env, kaptCode, basicUrl, detailUrl, version) {
 6634 |   const [basicResult, detailResult] = await Promise.allSettled([
 6635 |     fetchPublicDataJson(
 6636 |       basicUrl,
 6637 |       { kaptCode },
 6638 |       env,
 6639 |       `K-APT ${version} basic info`
 6640 |     ),
 6641 |     fetchPublicDataJson(
 6642 |       detailUrl,
 6643 |       { kaptCode },
 6644 |       env,
 6645 |       `K-APT ${version} detail info`
 6646 |     ),
 6647 |   ]);
 6648 | 
 6649 |   const basic = basicResult.status === "fulfilled"
 6650 |     ? firstObjectFromPublicData(basicResult.value, `K-APT ${version} basic info`)
 6651 |     : {};
 6652 |   const detail = detailResult.status === "fulfilled"
 6653 |     ? firstObjectFromPublicData(detailResult.value, `K-APT ${version} detail info`)
 6654 |     : {};
 6655 | 
 6656 |   return {
 6657 |     version,
 6658 |     basic,
 6659 |     detail,
 6660 |     basicError: basicResult.status === "rejected"
 6661 |       ? String(basicResult.reason || "failed")
 6662 |       : null,
 6663 |     detailError: detailResult.status === "rejected"
 6664 |       ? String(detailResult.reason || "failed")
 6665 |       : null,
 6666 |     basicKeys: Object.keys(basic || {}).slice(0, 80),
 6667 |     detailKeys: Object.keys(detail || {}).slice(0, 80),
 6668 |   };
 6669 | }
 6670 | 
 6671 | async function fetchKaptComplexInfo(env, complex) {
 6672 |   const kaptCode = kaptCodeOf(complex);
 6673 |   if (!kaptCode) {
 6674 |     return {
 6675 |       list: complex,
 6676 |       basic: {},
 6677 |       detail: {},
 6678 |       diagnostics: {
 6679 |         kaptCode: null,
 6680 |         error: "missing_kapt_code",
 6681 |         attempts: [],
 6682 |       },
 6683 |     };
 6684 |   }
 6685 | 
 6686 |   const attempts = [];
 6687 | 
 6688 |   const v4 = await fetchKaptEndpointPair(
 6689 |     env,
 6690 |     kaptCode,
 6691 |     KAPT_BASIC_INFO_URL,
 6692 |     KAPT_DETAIL_INFO_URL,
 6693 |     "V4"
 6694 |   );
 6695 |   attempts.push(v4);
 6696 | 
 6697 |   let selected = {
 6698 |     list: complex,
 6699 |     basic: v4.basic,
 6700 |     detail: v4.detail,
 6701 |   };
 6702 | 
 6703 |   // V4가 빈 객체 또는 0세대를 반환하면 V3로 한 번 더 확인한다.
 6704 |   if (kaptRawHouseholdCount(selected) <= 0) {
 6705 |     const v3 = await fetchKaptEndpointPair(
 6706 |       env,
 6707 |       kaptCode,
 6708 |       KAPT_BASIC_INFO_V3_URL,
 6709 |       KAPT_DETAIL_INFO_V3_URL,
 6710 |       "V3"
 6711 |     );
 6712 |     attempts.push(v3);
 6713 | 
 6714 |     const v3Info = {
 6715 |       list: complex,
 6716 |       basic: v3.basic,
 6717 |       detail: v3.detail,
 6718 |     };
 6719 | 
 6720 |     if (
 6721 |       kaptRawHouseholdCount(v3Info) > kaptRawHouseholdCount(selected) ||
 6722 |       Object.keys(selected.basic || {}).length === 0
 6723 |     ) {
 6724 |       selected = v3Info;
 6725 |     }
 6726 |   }
 6727 | 
 6728 |   return {
 6729 |     ...selected,
 6730 |     diagnostics: {
 6731 |       kaptCode,
 6732 |       listName: kaptNameOf(complex) || null,
 6733 |       listAddress: kaptAddressOf(complex).preferredAddress || null,
 6734 |       householdCount: kaptRawHouseholdCount(selected),
 6735 |       attempts: attempts.map((attempt) => ({
 6736 |         version: attempt.version,
 6737 |         basicError: attempt.basicError,
 6738 |         detailError: attempt.detailError,
 6739 |         basicKeys: attempt.basicKeys,
 6740 |         detailKeys: attempt.detailKeys,
 6741 |       })),
 6742 |     },
 6743 |   };
 6744 | }
 6745 | 
 6746 | 
 6747 | function kaptAddressHasSpecificNumberV50(row) {
 6748 |   const addresses = kaptAddressOf(row);
 6749 |   return [addresses.roadAddress, addresses.parcelAddress, addresses.preferredAddress]
 6750 |     .some((value) => /\d/.test(cleanBuildingText(value)));
 6751 | }
 6752 | 
 6753 | function mergeKaptRowWithBasicInfoV50(listRow, basicRow) {
 6754 |   if (!basicRow || typeof basicRow !== "object" || !Object.keys(basicRow).length) {
 6755 |     return listRow;
 6756 |   }
 6757 |   // 시군구/법정동 목록에만 존재하는 bjdCode/as1~as4와 scope 결속 필드는 보존하고,
 6758 |   // 기본정보의 kaptAddr/doroJuso/세대수/동수 같은 더 구체적인 값을 덮어쓴다.
 6759 |   return {
 6760 |     ...listRow,
 6761 |     ...basicRow,
 6762 |     ...kaptScopeBindingFields(listRow),
 6763 |     __kaptBasicAddressEnrichedV50: true,
 6764 |   };
 6765 | }
 6766 | 
 6767 | async function fetchKaptBasicAddressV50(env, complex) {
 6768 |   const kaptCode = kaptCodeOf(complex);
 6769 |   if (!kaptCode || kaptAddressHasSpecificNumberV50(complex)) {
 6770 |     return { row: complex, enriched: false, attempted: false, error: null };
 6771 |   }
 6772 | 
 6773 |   const endpoints = [
 6774 |     { url: KAPT_BASIC_INFO_URL, version: "V4" },
 6775 |     { url: KAPT_BASIC_INFO_V3_URL, version: "V3" },
 6776 |   ];
 6777 |   let lastError = null;
 6778 |   let best = complex;
 6779 | 
 6780 |   for (const endpoint of endpoints) {
 6781 |     try {
 6782 |       const data = await fetchPublicDataJson(
 6783 |         endpoint.url,
 6784 |         { kaptCode },
 6785 |         env,
 6786 |         `K-APT ${endpoint.version} basic address pre-geocode V50`
 6787 |       );
 6788 |       const basic = firstObjectFromPublicData(
 6789 |         data,
 6790 |         `K-APT ${endpoint.version} basic address pre-geocode V50`
 6791 |       );
 6792 |       if (!basic || !Object.keys(basic).length) continue;
 6793 |       best = mergeKaptRowWithBasicInfoV50(complex, basic);
 6794 |       if (kaptAddressHasSpecificNumberV50(best)) {
 6795 |         return { row: best, enriched: true, attempted: true, error: null };
 6796 |       }
 6797 |     } catch (error) {
 6798 |       lastError = error;
 6799 |     }
 6800 |   }
 6801 | 
 6802 |   return {
 6803 |     row: best,
 6804 |     enriched: best !== complex,
 6805 |     attempted: true,
 6806 |     error: lastError ? String(lastError?.message || lastError) : null,
 6807 |   };
 6808 | }
 6809 | 
 6810 | async function enrichKaptGeocodingRowsV50(env, rows, legalDongCodes) {
 6811 |   const legalSet = new Set(
 6812 |     (legalDongCodes || [])
 6813 |       .map((item) => String(item?.legalDongCode || "").replace(/\D/g, "").slice(0, 10))
 6814 |       .filter((value) => /^\d{10}$/.test(value))
 6815 |   );
 6816 | 
 6817 |   const candidates = [];
 6818 |   const candidateKeys = new Set();
 6819 |   for (const row of rows || []) {
 6820 |     const key = kaptComplexKey(row);
 6821 |     if (!key || candidateKeys.has(key)) continue;
 6822 |     const code = kaptLegalDongCodeV48(row);
 6823 |     const bound = !!cleanBuildingText(row?.__scopeParcelKeyV46 ?? row?.scopeParcelKey);
 6824 |     const exactLegalDongSource = [
 6825 |       "LEGAL_DONG",
 6826 |       "SIGUNGU_SAME_LEGAL_DONG",
 6827 |       "SIGUNGU_SCOPE_BOUND",
 6828 |     ].includes(row?.__kaptSourceV50);
 6829 |     if (!bound && !exactLegalDongSource && !(code && legalSet.has(code))) continue;
 6830 |     if (kaptAddressHasSpecificNumberV50(row)) continue;
 6831 |     candidateKeys.add(key);
 6832 |     candidates.push(row);
 6833 |     if (candidates.length >= KAPT_GEOCODE_ENRICH_MAX_COMPLEXES) break;
 6834 |   }
 6835 | 
 6836 |   if (!candidates.length) {
 6837 |     return { rows, attempted: 0, enriched: 0, failed: 0 };
 6838 |   }
 6839 | 
 6840 |   const results = await mapBuildingWithConcurrency(
 6841 |     candidates,
 6842 |     KAPT_GEOCODE_ENRICH_CONCURRENCY,
 6843 |     async (row) => fetchKaptBasicAddressV50(env, row)
 6844 |   );
 6845 |   const replacements = new Map();
 6846 |   let enriched = 0;
 6847 |   let failed = 0;
 6848 |   results.forEach((result, index) => {
 6849 |     const original = candidates[index];
 6850 |     const key = kaptComplexKey(original);
 6851 |     if (!key) return;
 6852 |     replacements.set(key, result?.row || original);
 6853 |     if (result?.enriched) enriched += 1;
 6854 |     if (result?.error) failed += 1;
 6855 |   });
 6856 | 
 6857 |   return {
 6858 |     rows: (rows || []).map((row) => replacements.get(kaptComplexKey(row)) || row),
 6859 |     attempted: candidates.length,
 6860 |     enriched,
 6861 |     failed,
 6862 |   };
 6863 | }
 6864 | 
 6865 | async function mapBuildingWithConcurrency(items, concurrency, mapper) {
 6866 |   const results = new Array(items.length);
 6867 |   let cursor = 0;
 6868 | 
 6869 |   async function worker() {
 6870 |     while (true) {
 6871 |       const index = cursor++;
 6872 |       if (index >= items.length) return;
 6873 |       results[index] = await mapper(items[index], index);
 6874 |     }
 6875 |   }
 6876 | 
 6877 |   const count = Math.min(
 6878 |     Math.max(1, Math.trunc(concurrency) || 1),
 6879 |     Math.max(1, items.length)
 6880 |   );
 6881 | 
 6882 |   await Promise.all(Array.from({ length: count }, worker));
 6883 |   return results;
 6884 | }
 6885 | 
 6886 | function firstFiniteBuildingValue(...values) {
 6887 |   for (const value of values) {
 6888 |     const n = finiteBuildingNumber(value);
 6889 |     if (n != null) return n;
 6890 |   }
 6891 |   return null;
 6892 | }
 6893 | 
 6894 | function kaptInfoValue(info, ...keys) {
 6895 |   for (const source of [info?.basic, info?.detail, info?.list]) {
 6896 |     const value = publicDataField(source, ...keys);
 6897 |     if (value !== null && value !== undefined && value !== "") {
 6898 |       return value;
 6899 |     }
 6900 |   }
 6901 |   return null;
 6902 | }
 6903 | 
 6904 | function normalizedKaptInfo(info, location) {
 6905 |   const directHouseholds = firstFiniteBuildingValue(
 6906 |     kaptInfoValue(
 6907 |       info,
 6908 |       "kaptdaCnt",
 6909 |       "kaptDaCnt",
 6910 |       "kapt_da_cnt",
 6911 |       "kaptdacnt",
 6912 |       "householdCount",
 6913 |       "household_count",
 6914 |       "hhldCnt",
 6915 |       "hhld_cnt",
 6916 |       "hoCnt",
 6917 |       "ho_cnt"
 6918 |     )
 6919 |   );
 6920 | 
 6921 |   const areaBandHouseholds = [
 6922 |     ["kaptMparea_60", "kaptMparea60", "kapt_mparea_60"],
 6923 |     ["kaptMparea_85", "kaptMparea85", "kapt_mparea_85"],
 6924 |     ["kaptMparea_135", "kaptMparea135", "kapt_mparea_135"],
 6925 |     ["kaptMparea_136", "kaptMparea136", "kapt_mparea_136"],
 6926 |   ].reduce((sum, aliases) => {
 6927 |     const value = firstFiniteBuildingValue(
 6928 |       ...aliases.map((key) => kaptInfoValue(info, key))
 6929 |     );
 6930 |     return sum + Math.max(0, Math.trunc(value || 0));
 6931 |   }, 0);
 6932 | 
 6933 |   const households = Math.max(
 6934 |     0,
 6935 |     Math.trunc(
 6936 |       directHouseholds != null && directHouseholds > 0
 6937 |         ? directHouseholds
 6938 |         : areaBandHouseholds
 6939 |     )
 6940 |   );
 6941 | 
 6942 |   const buildingCount = Math.max(
 6943 |     1,
 6944 |     Math.trunc(firstFiniteBuildingValue(
 6945 |       kaptInfoValue(
 6946 |         info,
 6947 |         "kaptDongCnt",
 6948 |         "kapt_dong_cnt",
 6949 |         "dongCnt",
 6950 |         "dong_count"
 6951 |       )
 6952 |     ) || 1)
 6953 |   );
 6954 | 
 6955 |   const rawElevatorCount = firstFiniteBuildingValue(
 6956 |     kaptInfoValue(
 6957 |       info,
 6958 |       // V4 기본정보의 승객용 승강기대수 필드(kaptdEcntp)를 최우선으로 포함한다.
 6959 |       "kaptdEcntp",
 6960 |       "kaptDEcntp",
 6961 |       "kapt_elevator_passenger_cnt",
 6962 |       "kaptdEcnt",
 6963 |       "kaptDEcnt",
 6964 |       "kaptEcnt",
 6965 |       "kapt_elevator_cnt",
 6966 |       "elevatorCnt",
 6967 |       "elevator_count",
 6968 |       "elvtCnt",
 6969 |       "elvt_count"
 6970 |     )
 6971 |   );
 6972 |   const elevatorKnown = rawElevatorCount != null;
 6973 |   const elevatorCount = Math.max(0, Math.trunc(rawElevatorCount || 0));
 6974 | 
 6975 |   const maxFloorCount = Math.max(
 6976 |     0,
 6977 |     Math.trunc(firstFiniteBuildingValue(
 6978 |       kaptInfoValue(
 6979 |         info,
 6980 |         "kaptTopFloor",
 6981 |         "kapt_top_floor",
 6982 |         "maxFloorCnt",
 6983 |         "max_floor_count",
 6984 |         "topFloor",
 6985 |         "top_floor"
 6986 |       )
 6987 |     ) || 0)
 6988 |   );
 6989 | 
 6990 |   const addresses = kaptAddressOf(info?.basic || info?.list || {});
 6991 |   const listAddresses = kaptAddressOf(info?.list || {});
 6992 |   const code = kaptCodeOf(info?.basic || {}) || kaptCodeOf(info?.list || {});
 6993 |   const name = kaptNameOf(info?.basic || {}) || kaptNameOf(info?.list || {});
 6994 | 
 6995 |   return {
 6996 |     key: code ? `kapt:${code}` : kaptComplexKey(info?.list || info?.basic || {}),
 6997 |     kaptCode: code,
 6998 |     name,
 6999 |     address: addresses.preferredAddress || listAddresses.preferredAddress,
 7000 |     households,
 7001 |     householdsSource: directHouseholds != null && directHouseholds > 0
 7002 |       ? "KAPT_TOTAL"
 7003 |       : areaBandHouseholds > 0
 7004 |         ? "KAPT_AREA_BANDS"
 7005 |         : "KAPT_EMPTY",
 7006 |     buildingCount,
 7007 |     elevatorCount,
 7008 |     elevatorKnown,
 7009 |     maxFloorCount,
 7010 |     location,
 7011 |     // V46 scope binding을 K-APT 상세조회 뒤에도 보존한다.
 7012 |     scopeTitleKey: cleanBuildingText(info?.list?.__scopeTitleKeyV46),
 7013 |     scopeParcelKey: cleanBuildingText(info?.list?.__scopeParcelKeyV46),
 7014 |     scopeBuildingName: cleanBuildingText(info?.list?.__scopeBuildingNameV46),
 7015 |     scopeTitleAddress: cleanBuildingText(info?.list?.__scopeTitleAddressV46),
 7016 |     scopeMatchScore: Number(info?.list?.__scopeMatchScoreV46 || 0),
 7017 |     scopeMatchReason: cleanBuildingText(info?.list?.__scopeMatchReasonV46),
 7018 |     diagnostics: info?.diagnostics || null,
 7019 |   };
 7020 | }
 7021 | 
 7022 | function isRelevantBuildingHubRecord(row) {
 7023 |   if (!row || typeof row !== "object") return false;
 7024 |   if (isAncillaryBuildingRecord(row)) return false;
 7025 | 
 7026 |   const classification = buildingHousingClassification(row);
 7027 |   const hoCount = nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt);
 7028 |   const floors = buildingGroundFloorCount(row);
 7029 |   const purpose = classification.purpose.replace(/\s+/g, "");
 7030 | 
 7031 |   if (/주차장|기계실|전기실|변전실|저수조|경비실|관리사무소만/.test(purpose)) {
 7032 |     return false;
 7033 |   }

// ...
 7039 |     floors > 0
 7040 |   );
 7041 | }
 7042 | 
 7043 | function distanceMetersBetweenPoints(a, b) {
 7044 |   if (!a || !b) return Infinity;
 7045 |   const lat1 = Number(a.lat) * Math.PI / 180;
 7046 |   const lat2 = Number(b.lat) * Math.PI / 180;
 7047 |   const deltaLat = lat2 - lat1;
 7048 |   const deltaLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
 7049 |   const sinLat = Math.sin(deltaLat / 2);
 7050 |   const sinLng = Math.sin(deltaLng / 2);
 7051 |   const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
 7052 |   return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
 7053 | }
 7054 | 
 7055 | function isNearKaptComplex(location, kaptComplexes) {
 7056 |   return kaptComplexes.some((complex) =>
 7057 |     distanceMetersBetweenPoints(location, complex.location) <=
 7058 |       BUILDING_STATS_KAPT_MATCH_RADIUS_METERS
 7059 |   );
 7060 | }
 7061 | 
 7062 | 
 7063 | function buildingParcelDescriptor(row) {
 7064 |   const digits = (value, length) => {
 7065 |     const raw = String(value ?? "").replace(/\D/g, "");
 7066 |     return raw ? raw.padStart(length, "0").slice(-length) : "";
 7067 |   };
 7068 | 
 7069 |   // 폴리곤 내부 필지 직접조회 결과에는 요청에 사용한 표준 필지키를 보존한다.
 7070 |   // 공공데이터 응답의 대지구분/본번/부번 표기가 달라도 실제 조회 필지와 연결한다.
 7071 |   const scopeOverrideKey = cleanBuildingText(
 7072 |     row?.__scopeParcelKeyV20 ?? row?.scopeParcelKeyV20
 7073 |   );
 7074 |   if (/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(scopeOverrideKey)) {
 7075 |     const [sigunguCd, bjdongCd, platGbCd, bun, ji] = scopeOverrideKey.split("|");
 7076 |     return {
 7077 |       key: scopeOverrideKey,
 7078 |       sigunguCd,
 7079 |       bjdongCd,
 7080 |       platGbCd,
 7081 |       bun,
 7082 |       ji,
 7083 |       scopeOverride: true,
 7084 |     };
 7085 |   }
 7086 | 

// ...
 7125 | 
 7126 |   if (!sigungu || !bjdong || !bun || Number(bun) <= 0) return "";
 7127 |   return [sigungu, bjdong, plat, bun, ji].join("|");
 7128 | }
 7129 | 
 7130 | 
 7131 | function buildingParcelKeyPartsV51(value) {
 7132 |   const key = cleanBuildingText(typeof value === "string" ? value : value?.key);
 7133 |   if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(key)) return null;
 7134 |   const [sigunguCd, bjdongCd, platGbCd, bun, ji] = key.split("|");
 7135 |   return { key, sigunguCd, bjdongCd, platGbCd, bun, ji };
 7136 | }
 7137 | 
 7138 | function buildingParcelRegionVariantsV51(parcel) {
 7139 |   const parts = buildingParcelKeyPartsV51(parcel) || parcel;
 7140 |   if (!parts) return [];
 7141 |   const sigunguVariants = kaptRegionCodeVariants(parts.sigunguCd).filter((value) => /^\d{5}$/.test(value));
 7142 |   const rows = [];
 7143 |   const seen = new Set();
 7144 |   for (const sigunguCd of sigunguVariants.length ? sigunguVariants : [parts.sigunguCd]) {
 7145 |     const key = [sigunguCd, parts.bjdongCd, parts.platGbCd, parts.bun, parts.ji || "0000"].join("|");
 7146 |     if (seen.has(key)) continue;
 7147 |     seen.add(key);
 7148 |     rows.push({
 7149 |       key,
 7150 |       sigunguCd,
 7151 |       bjdongCd: parts.bjdongCd,
 7152 |       platGbCd: parts.platGbCd,
 7153 |       bun: parts.bun,
 7154 |       ji: parts.ji || "0000",
 7155 |     });
 7156 |   }
 7157 |   return rows;
 7158 | }
 7159 | 
 7160 | function parcelRelaxedRegionVariantKeysV51(parcel) {
 7161 |   const parts = buildingParcelKeyPartsV51(parcel) || parcel;
 7162 |   if (!parts) return [];
 7163 |   const sigunguVariants = kaptRegionCodeVariants(parts.sigunguCd).filter((value) => /^\d{5}$/.test(value));
 7164 |   return [...new Set((sigunguVariants.length ? sigunguVariants : [parts.sigunguCd]).map((sigunguCd) =>
 7165 |     `${sigunguCd}|${parts.bjdongCd}|${parts.bun}|${parts.ji || "0000"}`
 7166 |   ))];
 7167 | }
 7168 | 
 7169 | function resolveKaptGeocodedParcelBindingV51(complex, location, scopeParcelMap, parcelGroups) {
 7170 |   const point = normalizeBuildingLocationPoint(location);
 7171 |   if (!point?.legalDongCode || !point?.parcelMainNo || Number(point.parcelMainNo) <= 0) return null;
 7172 | 
 7173 |   const baseKeys = ["0", "1"]
 7174 |     .map((platGbCd) => canonicalBuildingParcelKeyFromParts({
 7175 |       legalDongCode: point.legalDongCode,
 7176 |       platGbCd,
 7177 |       parcelMainNo: point.parcelMainNo,
 7178 |       parcelSubNo: point.parcelSubNo,
 7179 |     }))
 7180 |     .filter(Boolean);
 7181 |   if (!baseKeys.length) return null;
 7182 | 
 7183 |   const existingParcelKeys = new Set([
 7184 |     ...(scopeParcelMap instanceof Map ? scopeParcelMap.keys() : []),
 7185 |     ...(parcelGroups || []).map((group) => cleanBuildingText(group?.key)).filter(Boolean),
 7186 |   ]);
 7187 | 
 7188 |   // 정확 키와 특별자치도 신·구 코드 변형을 우선한다.
 7189 |   for (const baseKey of baseKeys) {
 7190 |     const base = buildingParcelKeyPartsV51(baseKey);
 7191 |     for (const variant of buildingParcelRegionVariantsV51(base)) {
 7192 |       if (existingParcelKeys.has(variant.key)) {
 7193 |         return {
 7194 |           key: variant.key,
 7195 |           reason: "[long-token-redacted]",
 7196 |           synthetic: false,
 7197 |         };
 7198 |       }
 7199 |     }
 7200 |   }
 7201 | 
 7202 |   // 대지구분만 다른 경우에는 본번/부번 + 신·구 시군구 코드로 완화 결속한다.
 7203 |   const relaxedCandidates = new Set();
 7204 |   for (const baseKey of baseKeys) {
 7205 |     const base = buildingParcelKeyPartsV51(baseKey);
 7206 |     for (const relaxed of parcelRelaxedRegionVariantKeysV51(base)) relaxedCandidates.add(relaxed);
 7207 |   }
 7208 |   for (const key of existingParcelKeys) {
 7209 |     const parts = buildingParcelKeyPartsV51(key);
 7210 |     if (!parts) continue;
 7211 |     const relaxedRows = parcelRelaxedRegionVariantKeysV51(parts);
 7212 |     if (relaxedRows.some((value) => relaxedCandidates.has(value))) {
 7213 |       return {
 7214 |         key,
 7215 |         reason: "kapt_geocoded_relaxed_parcel_v51",
 7216 |         synthetic: false,
 7217 |       };
 7218 |     }
 7219 |   }
 7220 | 
 7221 |   // 폴리곤 내부가 이미 확인된 K-APT 좌표라면, Building HUB 표제부가 없어도
 7222 |   // Kakao가 반환한 법정동/지번으로 직접 상세조회용 필지를 생성한다.
 7223 |   const syntheticKey = baseKeys[0];
 7224 |   return syntheticKey ? {
 7225 |     key: syntheticKey,
 7226 |     reason: "kapt_geocoded_synthetic_parcel_v51",
 7227 |     synthetic: true,
 7228 |   } : null;
 7229 | }
 7230 | 
 7231 | function bindKaptComplexToGeocodedParcelV51(complex, location, scopeParcelMap, parcelGroups) {
 7232 |   const resolved = resolveKaptGeocodedParcelBindingV51(
 7233 |     complex,
 7234 |     location,
 7235 |     scopeParcelMap,
 7236 |     parcelGroups
 7237 |   );
 7238 |   const existing = cleanBuildingText(
 7239 |     complex?.__scopeParcelKeyV46 ?? complex?.scopeParcelKey
 7240 |   );
 7241 |   const parcelKey = resolved?.key || (/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(existing) ? existing : "");
 7242 |   if (!parcelKey) return { complex, binding: null };
 7243 | 
 7244 |   const addresses = kaptAddressOf(complex);
 7245 |   const reason = resolved?.reason || cleanBuildingText(complex?.__scopeMatchReasonV46) || "existing_scope_binding";
 7246 |   return {
 7247 |     complex: {
 7248 |       ...complex,
 7249 |       __scopeParcelKeyV46: parcelKey,
 7250 |       __scopeBuildingNameV46: cleanBuildingText(
 7251 |         complex?.__scopeBuildingNameV46 || kaptNameOf(complex)
 7252 |       ),
 7253 |       __scopeTitleAddressV46: cleanBuildingText(
 7254 |         complex?.__scopeTitleAddressV46 || addresses.preferredAddress
 7255 |       ),
 7256 |       __scopeMatchScoreV46: Math.max(
 7257 |         Number(complex?.__scopeMatchScoreV46 || 0),
 7258 |         resolved?.synthetic ? 500 : 700
 7259 |       ),
 7260 |       __scopeMatchReasonV46: reason,
 7261 |       __scopeGeocodedParcelV51: true,
 7262 |     },
 7263 |     binding: {
 7264 |       parcelKey,
 7265 |       reason,
 7266 |       synthetic: resolved?.synthetic === true,
 7267 |     },
 7268 |   };
 7269 | }
 7270 | 
 7271 | function normalizeVerifiedScopeParcels(input, geometry, scopeZipcode) {
 7272 |   const map = new Map();
 7273 |   const diagnostics = {
 7274 |     received: 0,
 7275 |     accepted: 0,
 7276 |     invalid: 0,
 7277 |     outsidePolygon: 0,
 7278 |     postcodeMismatch: 0,
 7279 |     postcodeMismatchAcceptedInterior: 0,

// ...
 8346 |     regstrKindCdNm: get("regstrKindCdNm", "regstr_kind_cd_nm"),
 8347 |     exposPubuseGbCdNm: get("exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
 8348 |     bldNm: get("bldNm", "bld_nm"),
 8349 |     dongNm: get("dongNm", "dong_nm"),
 8350 |     flrGbCdNm: get("flrGbCdNm", "flr_gb_cd_nm"),
 8351 |     flrNo: get("flrNo", "flr_no"),
 8352 |     flrNoNm: get("flrNoNm", "flr_no_nm", "floorNm", "floor_no"),
 8353 |     hoNm: get("hoNm", "ho_nm", "hoNo", "ho_no", "unitNm", "unit_name", "unitNo", "unit_no"),
 8354 |     mainPurpsCdNm: get("mainPurpsCdNm", "main_purps_cd_nm"),
 8355 |     etcPurps: get("etcPurps", "etc_purps"),
 8356 |     // V65 synthetic evidence. Official floor-overview rows are collapsed to a
 8357 |     // single unambiguous residential/commercial hint for the same building+floor.
 8358 |     floorUseV65: get("floorUseV65", "floor_use_v65", "__v65FloorUse"),
 8359 |     detailVersionV65: get("detailVersionV65", "detail_version_v65", "__v65DetailVersion"),
 8360 |     area: get("area", "flrArea", "flr_area", "areaM2", "area_m2"),
 8361 |     areaExct: get("areaExct", "area_exct"),
 8362 |     hhldCnt: get("hhldCnt", "hhld_cnt", "householdCnt", "household_count"),
 8363 |     fmlyCnt: get("fmlyCnt", "fmly_cnt", "familyCnt", "family_count"),
 8364 |     hoCnt: get("hoCnt", "ho_cnt", "hoCount", "ho_count", "unitCnt", "unit_count"),
 8365 |     grndFlrCnt: get("grndFlrCnt", "grnd_flr_cnt"),
 8366 |     rideUseElvtCnt: get("rideUseElvtCnt", "ride_use_elvt_cnt"),
 8367 |     emgenUseElvtCnt: get("emgenUseElvtCnt", "emgen_use_elvt_cnt"),
 8368 |     newPlatPlc: get("newPlatPlc", "new_plat_plc"),
 8369 |     platPlc: get("platPlc", "plat_plc"),
 8370 |     rnum: get("rnum", "rowNo", "row_no"),
 8371 |   };
 8372 |   return Object.fromEntries(
 8373 |     Object.entries(out).filter(([, value]) => value !== undefined && value !== null && value !== "")
 8374 |   );
 8375 | }
 8376 | 
 8377 | function compactBuildingDetailRows(rows, maxRows = 4000) {
 8378 |   const out = [];
 8379 |   for (const row of rows || []) {
 8380 |     if (out.length >= maxRows) break;
 8381 |     const compact = compactBuildingDetailRow(row);
 8382 |     if (compact) out.push(compact);
 8383 |   }
 8384 |   return out;
 8385 | }
 8386 | 
 8387 | function normalizeBuildingDetailEvidenceInput(value) {
 8388 |   if (!Array.isArray(value)) return [];
 8389 |   const out = [];
 8390 |   const seen = new Set();

// ...
 8751 |   // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
 8752 |   const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
 8753 |     ? options.verifiedScopeParcels.map
 8754 |     : new Map();
 8755 | 
 8756 |   // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
 8757 |   // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
 8758 |   // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
 8759 |   for (const match of matchedKapt || []) {
 8760 |     const parcelKey = cleanBuildingText(
 8761 |       match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
 8762 |     );
 8763 |     if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
 8764 |     if (parcels.has(parcelKey)) {
 8765 |       const group = parcels.get(parcelKey);
 8766 |       group.addedFromKaptScopeV48 = true;
 8767 |       group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
 8768 |       continue;
 8769 |     }
 8770 |     const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey.split("|");
 8771 |     parcels.set(parcelKey, {
 8772 |       parcel: { key: parcelKey, sigunguCd, bjdongCd, platGbCd, bun, ji },
 8773 |       titleMatches: [],
 8774 |       addedFromKaptScopeV48: true,
 8775 |       kaptMatchesV51: [match],
 8776 |     });
 8777 |   }
 8778 | 
 8779 |   const parcelGroups = [...parcels.values()];
 8780 |   const priorDetailEvidence = normalizeBuildingDetailEvidenceInput(
 8781 |     options?.detailEvidence ?? options?.detail_evidence ?? []
 8782 |   );
 8783 |   const priorDetailEvidenceMap = new Map(
 8784 |     priorDetailEvidence.map((item) => [item.parcelKey, item])
 8785 |   );
 8786 | 
 8787 |   // V56 persistent detail cache: 알고리즘은 그대로 두고 과거에 정상 조회한 동일 필지 원천만 재사용한다.
 8788 |   const detailCacheByRegion = new Map();
 8789 |   const detailCacheIndex = new Map();
 8790 |   for (const group of parcelGroups) {
 8791 |     const regionKey = v56RegionKeyFromParcel(group.parcel);
 8792 |     if (!regionKey || detailCacheByRegion.has(regionKey)) continue;
 8793 |     const loaded = await v56FetchRawCacheRows(env, regionKey, "DETAIL_PARCEL_V56");
 8794 |     detailCacheByRegion.set(regionKey, loaded);
 8795 |     for (const row of loaded.rows || []) {
 8796 |       const key = String(row?.cache_key || "").trim();
 8797 |       if (key) detailCacheIndex.set(key, row);
 8798 |     }
 8799 |   }
 8800 | 
 8801 |   const warnings = [
 8802 |     "V29_DIRECT_PARCEL_DETAIL: 법정동 전체 bulk 전유부 대신 폴리곤 매칭 필지를 직접 조회합니다.",
 8803 |   ];

// ...
 8809 |   // 잘리는 문제가 있었다. 정확도를 위해 matched parcel을 전부 직접조회 대상으로 둔다.
 8810 |   for (const group of parcelGroups) {
 8811 |     const priorEvidence = priorDetailEvidenceMap.get(group.parcel.key) || null;
 8812 |     if (priorEvidence) {
 8813 |       resultByKey.set(group.parcel.key, {
 8814 |         parcel: group.parcel,
 8815 |         titleMatches: group.titleMatches,
 8816 |         areaRows: priorEvidence.areaRows || [],
 8817 |         exposRows: priorEvidence.exposRows || [],
 8818 |         recapRows: priorEvidence.recapRows || [],
 8819 |         housePriceRows: priorEvidence.housePriceRows || [],
 8820 |         floorRows: priorEvidence.floorRows || [],
 8821 |         sourceComplete: priorEvidence.sourceComplete !== false,
 8822 |         addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
 8823 |         addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
 8824 |         verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
 8825 |         kaptMatchesV51: group.kaptMatchesV51 || [],
 8826 |         queryDiagnostics: {
 8827 |           optimized: true,
 8828 |           skippedReason: "detail_continuation_evidence_v29",
 8829 |         },
 8830 |       });
 8831 |       continue;
 8832 |     }
 8833 | 
 8834 |     const persistentCacheKey = v56RawCacheKey("DETAIL_PARCEL_V56", group.parcel.key);
 8835 |     const persistentCached = v56CachedDetailResult(
 8836 |       detailCacheIndex.get(persistentCacheKey),
 8837 |       group.parcel,
 8838 |       group.titleMatches
 8839 |     );
 8840 |     if (persistentCached) {
 8841 |       persistentCached.addedFromKaptScopeV48 = group.addedFromKaptScopeV48 === true;
 8842 |       persistentCached.kaptMatchesV51 = group.kaptMatchesV51 || [];
 8843 |       resultByKey.set(group.parcel.key, persistentCached);
 8844 |       continue;
 8845 |     }
 8846 | 
 8847 |     const titleEvidenceRows = titleParcelFallback(group.titleMatches);
 8848 |     const expectedTitleUnits = titleEvidenceRows.reduce(
 8849 |       (sum, item) => sum + Math.max(0, Math.trunc(Number(item?.units) || 0)),
 8850 |       0
 8851 |     );
 8852 | 
 8853 |     // V57 speed-up without accuracy loss: 표제부 자체에 authoritative 세대/호수와 승강기 값이 모두 있고
 8854 |     // 순수 주거 건물이라면 전유부/공용면적/층별개요/총괄표제/주택가격을 다시 5번 조회하지 않는다.
 8855 |     // 혼합용도/상가/오피스텔/표제부 세대수 없음/승강기 미상은 기존 V29 상세조회 경로를 그대로 탄다.
 8856 |     const authoritativeTitleRowsV57 = titleEvidenceRows.filter((item) => item?.confidence === "authoritative");
 8857 |     const simpleResidentialTitleV57 = (
 8858 |       titleEvidenceRows.length > 0 &&
 8859 |       authoritativeTitleRowsV57.length === titleEvidenceRows.length &&
 8860 |       titleEvidenceRows.every((item) => {
 8861 |         const c = item?.classification || {};
 8862 |         return c.residential === true && c.commercial !== true && c.mixedUse !== true && c.officetel !== true;
 8863 |       }) &&
 8864 |       titleEvidenceRows.every((item) => buildingElevatorInfo(item?.row || {}).known === true)
 8865 |     );
 8866 |     const kaptApartmentSufficientV57 = (
 8867 |       group.addedFromKaptScopeV48 === true &&
 8868 |       (group.kaptMatchesV51 || []).some((match) => {
 8869 |         const list = match?.list || {};
 8870 |         return Number(list?.households || 0) > 0 && list?.elevatorKnown === true;
 8871 |       }) &&
 8872 |       !(group.titleMatches || []).some((match) => {
 8873 |         const c = buildingHousingClassification(match?.row || {});
 8874 |         return c.commercial || c.mixedUse || c.officetel;
 8875 |       })
 8876 |     );
 8877 | 
 8878 |     if (simpleResidentialTitleV57 || kaptApartmentSufficientV57) {
 8879 |       resultByKey.set(group.parcel.key, {
 8880 |         parcel: group.parcel,
 8881 |         titleMatches: group.titleMatches,
 8882 |         areaRows: [],
 8883 |         exposRows: [],
 8884 |         recapRows: [],
 8885 |         housePriceRows: [],
 8886 |         floorRows: [],
 8887 |         sourceComplete: true,
 8888 |         addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
 8889 |         addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
 8890 |         verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
 8891 |         kaptMatchesV51: group.kaptMatchesV51 || [],
 8892 |         queryDiagnostics: {
 8893 |           optimized: true,
 8894 |           skippedReason: simpleResidentialTitleV57
 8895 |             ? "[long-token-redacted]"
 8896 |             : "v57_kapt_apartment_sufficient",
 8897 |         },
 8898 |       });
 8899 |       continue;
 8900 |     }
 8901 | 
 8902 |     const expectedBuildingCount = new Set(
 8903 |       (group.titleMatches || [])
 8904 |         .map((match) => buildingRecordKey(match?.row || {}))
 8905 |         .filter(Boolean)
 8906 |     ).size;
 8907 |     const densityPriority = titleEvidenceRows.reduce((score, item) => {
 8908 |       const classification = item?.classification || {};
 8909 |       const purpose = String(classification?.purpose || "");
 8910 |       if (classification.officetel) score += 80;
 8911 |       if (classification.mixedUse) score += 120;
 8912 |       if (/다세대|연립|다가구|도시형생활주택/.test(purpose)) score += 50;
 8913 |       if (/업무시설|사무소|근린생활시설|판매시설|병원|의원|의료시설/.test(purpose)) score += 60;
 8914 |       return score;
 8915 |     }, 0);
 8916 | 
 8917 |     detailCandidates.push({
 8918 |       ...group,
 8919 |       priority:
 8920 |         (group.addedFromVerifiedScopeV51 ? 100000 : 0) +
 8921 |         (group.addedFromKaptScopeV48 ? 80000 : 0) +
 8922 |         densityPriority + expectedTitleUnits * 10 + expectedBuildingCount * 5,
 8923 |       initialAreaRows: [],
 8924 |       initialExposRows: [],

// ...
 8939 |       `DETAIL_CONTINUATION_V29: 이번 요청에서 직접 상세조회 ${selectedCandidates.length}필지를 처리하고 ` +
 8940 |       `${deferredCandidates.length}필지를 다음 배치로 넘깁니다.`
 8941 |     );
 8942 |   }
 8943 | 
 8944 |   const emptySource = (reason) => ({
 8945 |     rows: [],
 8946 |     queryVariant: null,
 8947 |     attempts: [],
 8948 |     error: null,
 8949 |     skippedReason: reason || null,
 8950 |   });
 8951 | 
 8952 |   const selectedResults = await mapBuildingWithConcurrency(
 8953 |     selectedCandidates,
 8954 |     BUILDING_UNIT_FETCH_CONCURRENCY,
 8955 |     async ({ parcel, titleMatches, addedFromVerifiedScopeV51, addedFromKaptScopeV48, verifiedScopeEntryV51, kaptMatchesV51 }) => {
 8956 |       const fetchOne = async (url, label) => {
 8957 |         try {
 8958 |           return await fetchBuildingHubParcelPages(
 8959 |             env,
 8960 |             url,
 8961 |             label,
 8962 |             parcel,
 8963 |             {
 8964 |               maxVariants: BUILDING_UNIT_QUERY_VARIANT_LIMIT,
 8965 |               maxAttempts: BUILDING_UNIT_DETAIL_MAX_ATTEMPTS,
 8966 |             }
 8967 |           );
 8968 |         } catch (error) {
 8969 |           complete = false;
 8970 |           warnings.push(
 8971 |             `${parcel.key} ${label}: ${String(error?.message || error || "failed")}`
 8972 |           );
 8973 |           return {
 8974 |             rows: [],
 8975 |             queryVariant: null,
 8976 |             attempts: [],
 8977 |             error: String(error?.message || error || "failed"),
 8978 |           };
 8979 |         }
 8980 |       };
 8981 | 
 8982 |       const expos = await fetchOne(
 8983 |         BUILDING_HUB_EXPOS_URL,

// ...
 9026 |       if (!exposHasUnits && !areaHasUnits && !recapHasUnits) {
 9027 |         housePrice = await fetchOne(
 9028 |           BUILDING_HUB_HOUSE_PRICE_URL,
 9029 |           "Building HUB house-price direct parcel V29"
 9030 |         );
 9031 |       }
 9032 | 
 9033 |       const sourceComplete = ![area, expos, floor, recap, housePrice]
 9034 |         .some((source) => source && source.error);
 9035 | 
 9036 |       return {
 9037 |         parcel,
 9038 |         titleMatches,
 9039 |         addedFromVerifiedScopeV51: addedFromVerifiedScopeV51 === true,
 9040 |         addedFromKaptScopeV48: addedFromKaptScopeV48 === true,
 9041 |         verifiedScopeEntryV51: verifiedScopeEntryV51 || null,
 9042 |         kaptMatchesV51: kaptMatchesV51 || [],
 9043 |         areaRows: area.rows || [],
 9044 |         exposRows: expos.rows || [],
 9045 |         recapRows: recap.rows || [],
 9046 |         housePriceRows: housePrice.rows || [],
 9047 |         floorRows: floor.rows || [],
 9048 |         sourceComplete,
 9049 |         queryDiagnostics: {
 9050 |           optimized: true,
 9051 |           directParcelV29: true,
 9052 |           area,
 9053 |           expos,
 9054 |           floor,
 9055 |           recap,
 9056 |           housePrice,
 9057 |         },
 9058 |       };
 9059 |     }
 9060 |   );
 9061 | 
 9062 |   for (const result of selectedResults) {
 9063 |     resultByKey.set(result.parcel.key, result);
 9064 |     if (result.sourceComplete === false) complete = false;
 9065 |   }
 9066 | 
 9067 |   const v56DetailCacheWrites = selectedResults
 9068 |     .filter((result) => result?.sourceComplete !== false && result?.parcel?.key)
 9069 |     .map((result) => v56RawCacheRow({
 9070 |       sourceType: "DETAIL_PARCEL_V56",

// ...
 9081 |       },
 9082 |       days: BUILDING_V56_DETAIL_PARCEL_CACHE_DAYS,
 9083 |     }));
 9084 |   if (v56DetailCacheWrites.length) {
 9085 |     const saved = await v56UpsertRawCacheRows(env, v56DetailCacheWrites);
 9086 |     if (!saved.ok) warnings.push(`V56_DETAIL_CACHE_WRITE_FAILED:${saved.error}`);
 9087 |   }
 9088 | 
 9089 |   for (const group of deferredCandidates) {
 9090 |     const reason = "deferred_to_detail_continuation_v29";
 9091 |     resultByKey.set(group.parcel.key, {
 9092 |       parcel: group.parcel,
 9093 |       titleMatches: group.titleMatches,
 9094 |       addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
 9095 |       addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
 9096 |       verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
 9097 |       kaptMatchesV51: group.kaptMatchesV51 || [],
 9098 |       areaRows: [],
 9099 |       exposRows: [],
 9100 |       recapRows: [],
 9101 |       housePriceRows: [],
 9102 |       floorRows: [],
 9103 |       sourceComplete: true,
 9104 |       queryDiagnostics: {
 9105 |         optimized: true,
 9106 |         skippedReason: reason,
 9107 |       },
 9108 |     });
 9109 |   }
 9110 | 
 9111 |   const accumulatedDetailEvidence = [
 9112 |     ...priorDetailEvidence,
 9113 |     ...selectedResults
 9114 |       .map(buildingDetailEvidenceFromResult)
 9115 |       .filter(Boolean),
 9116 |   ].slice(0, [long-token-redacted]);
 9117 | 
 9118 |   return {
 9119 |     complete,
 9120 |     detailContinuation: {
 9121 |       required: deferredCandidates.length > 0,
 9122 |       processedParcelCount: accumulatedDetailEvidence.length,
 9123 |       batchParcelCount: selectedResults.length,
 9124 |       remainingParcelCount: deferredCandidates.length,
 9125 |       totalDetailParcelCount: accumulatedDetailEvidence.length + deferredCandidates.length,

// ...
 9135 |     bulkDiagnostics: {
 9136 |       complete: true,
 9137 |       skipped: true,
 9138 |       mode: "V29_DIRECT_PARCEL_ONLY",
 9139 |       reason: "법정동 bulk 전유부가 10/757처럼 잘리는 지역에서 과소집계를 방지하기 위해 사용하지 않음",
 9140 |       areaCoverage: null,
 9141 |       area: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
 9142 |       expos: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
 9143 |     },
 9144 |     parcels: parcelGroups.map((group) =>
 9145 |       resultByKey.get(group.parcel.key) || {
 9146 |         parcel: group.parcel,
 9147 |         titleMatches: group.titleMatches,
 9148 |         addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
 9149 |         addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
 9150 |         verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
 9151 |         kaptMatchesV51: group.kaptMatchesV51 || [],
 9152 |         areaRows: [],
 9153 |         exposRows: [],
 9154 |         recapRows: [],
 9155 |         housePriceRows: [],
 9156 |         floorRows: [],
 9157 |         sourceComplete: true,
 9158 |         queryDiagnostics: {
 9159 |           optimized: true,
 9160 |           skippedReason: "no_result_v29",
 9161 |         },
 9162 |       }
 9163 |     ),
 9164 |   };
 9165 | }
 9166 | 
 9167 | function titleRowIndexes(matchedBuildingRows) {
 9168 |   const byManagementKey = new Map();
 9169 |   const byParcelKey = new Map();
 9170 | 
 9171 |   for (const match of matchedBuildingRows || []) {
 9172 |     const row = match.row;
 9173 |     const mgmKey = cleanBuildingText(row?.mgmBldrgstPk ?? row?.mgm_bldrgst_pk);
 9174 |     if (mgmKey) byManagementKey.set(mgmKey, match);
 9175 | 
 9176 |     const parcel = buildingParcelDescriptor(row);
 9177 |     if (parcel) {
 9178 |       if (!byParcelKey.has(parcel.key)) byParcelKey.set(parcel.key, []);
 9179 |       byParcelKey.get(parcel.key).push(match);

// ...
 9455 | function buildingLocationMatchesScope(location, geometry, scopeZipcode) {
 9456 |   return buildingLocationScopeDecision(
 9457 |     location,
 9458 |     geometry,
 9459 |     scopeZipcode
 9460 |   ).matched;
 9461 | }
 9462 | 
 9463 | function normalizeBuildingComplexName(value) {
 9464 |   return cleanBuildingText(value)
 9465 |     .toLowerCase()
 9466 |     .replace(/\([^)]*\)/g, "")
 9467 |     .replace(/아파트|공동주택|주상복합|연립주택|단지/g, "")
 9468 |     .replace(/[^0-9a-z가-힣]/g, "");
 9469 | }
 9470 | 
 9471 | function kaptTitleMatchScore(complex, titleMatch) {
 9472 |   const row = titleMatch?.row || {};
 9473 |   const complexName = normalizeBuildingComplexName(kaptNameOf(complex));
 9474 |   const buildingName = normalizeBuildingComplexName(
 9475 |     publicDataField(row, "bldNm", "bld_nm")
 9476 |   );
 9477 |   const complexAddress = kaptAddressOf(complex).preferredAddress;
 9478 |   const titleAddress = buildingRecordAddresses(row).preferredAddress;
 9479 | 
 9480 |   let score = 0;
 9481 |   if (complexName && buildingName) {
 9482 |     if (complexName === buildingName) score += 100;
 9483 |     else if (
 9484 |       complexName.length >= 3 &&
 9485 |       buildingName.length >= 3 &&
 9486 |       (complexName.includes(buildingName) || buildingName.includes(complexName))
 9487 |     ) score += 70;
 9488 |   }
 9489 |   if (buildingAddressSimilarity(complexAddress, titleAddress)) score += 60;
 9490 |   return score;
 9491 | }
 9492 | 
 9493 | function findKaptMatchedTitle(complex, matchedBuildingRows) {
 9494 |   const boundTitleKey = cleanBuildingText(complex?.__scopeTitleKeyV46);
 9495 |   const boundParcelKey = cleanBuildingText(complex?.__scopeParcelKeyV46);
 9496 |   const boundBuildingName = compactBuildingMatchText(complex?.__scopeBuildingNameV46);
 9497 | 
 9498 |   // V46: 시군구 보정에서 실제 scope 표제부와 결속된 K-APT는 대표점/주소 오차로 재탈락시키지 않는다.
 9499 |   if (boundTitleKey) {
 9500 |     const direct = (matchedBuildingRows || []).find((match) =>
 9501 |       buildingRecordKey(match?.row || {}) === boundTitleKey
 9502 |     );
 9503 |     if (direct) return direct;
 9504 |   }
 9505 | 

// ...
 9516 |             return !!titleName && (
 9517 |               titleName === boundBuildingName ||
 9518 |               titleName.includes(boundBuildingName) ||
 9519 |               boundBuildingName.includes(titleName)
 9520 |             );
 9521 |           })
 9522 |         : null;
 9523 |       return named || parcelMatches[0];
 9524 |     }
 9525 |   }
 9526 | 
 9527 |   let best = null;
 9528 |   let bestScore = 0;
 9529 |   for (const match of matchedBuildingRows || []) {
 9530 |     const classification = buildingHousingClassification(match?.row || {});
 9531 |     if (!classification.apartment) continue;
 9532 |     const score = kaptTitleMatchScore(complex, match);
 9533 |     if (score > bestScore) {
 9534 |       bestScore = score;
 9535 |       best = match;
 9536 |     }
 9537 |   }
 9538 |   return bestScore >= 60 ? best : null;
 9539 | }
 9540 | function aggregateCombinedBuildingStats({
 9541 |   buildingRecords,
 9542 |   kaptComplexes,
 9543 |   geometry,
 9544 |   locationIndex,
 9545 |   walkupMinGroundFloors,
 9546 |   scopeZipcode = null,
 9547 |   verifiedScopeParcels = null,
 9548 |   includeExpandedCoverage = false,
 9549 | }) {
 9550 |   const relevantRecords = buildingRecords.filter(isRelevantBuildingHubRecord);
 9551 |   const parcelGroups = buildBuildingParcelGroupsV11(relevantRecords);
 9552 |   const matchedBuildingRows = [];
 9553 |   const missingBuildingRows = [];
 9554 |   const matchedKapt = [];
 9555 |   const missingKapt = [];
 9556 | 
 9557 |   const scopeMatchDiagnostics = {
 9558 |     insidePolygon: 0,
 9559 |     verifiedParcelPostcode: 0,
 9560 |     verifiedAddressEdge: 0,
 9561 |     verifiedRouteEdge: 0,
 9562 |     verifiedScopeParcel: 0,
 9563 |     verifiedScopeParcelAlias: 0,
 9564 |     verifiedKaptScopeParcel: 0,
 9565 |     verifiedKaptGeocodeParcel: 0,
 9566 |     matchedTitleFallback: 0,
 9567 |     verifiedOutsideScope: 0,
 9568 |     unverifiedLocation: 0,
 9569 |     outsidePolygon: 0,
 9570 |     missingLocation: 0,
 9571 |     invalidLocation: 0,
 9572 |     matchedParcels: 0,
 9573 |     candidateParcels: parcelGroups.length,
 9574 |     candidateKapt: kaptComplexes.length,
 9575 |     matchedKapt: 0,
 9576 |   };
 9577 | 
 9578 |   const addDecision = (decision) => {
 9579 |     const mapping = {
 9580 |       inside_polygon: "insidePolygon",
 9581 |       verified_parcel_postcode: "verifiedParcelPostcode",
 9582 |       verified_address_edge: "verifiedAddressEdge",
 9583 |       verified_route_edge: "verifiedRouteEdge",
 9584 |       verified_scope_parcel: "verifiedScopeParcel",
 9585 |       verified_scope_parcel_alias: "verifiedScopeParcelAlias",
 9586 |       verified_kapt_scope_parcel: "verifiedKaptScopeParcel",
 9587 |       verified_kapt_geocode_parcel: "verifiedKaptGeocodeParcel",
 9588 |       matched_title_fallback: "matchedTitleFallback",
 9589 |       verified_outside_scope: "verifiedOutsideScope",
 9590 |       unverified_location: "unverifiedLocation",
 9591 |       outside_polygon: "outsidePolygon",
 9592 |       missing_location: "missingLocation",
 9593 |       invalid_location: "invalidLocation",
 9594 |     };
 9595 |     const key = mapping[decision?.reason];
 9596 |     if (key) scopeMatchDiagnostics[key] += 1;
 9597 |   };
 9598 | 
 9599 |   const scopeParcelMap = verifiedScopeParcels?.map instanceof Map
 9600 |     ? verifiedScopeParcels.map
 9601 |     : new Map();
 9602 |   const scopeParcelAliasIndex = buildVerifiedScopeParcelAliasIndexV20(
 9603 |     verifiedScopeParcels
 9604 |   );
 9605 | 
 9606 |   for (const group of parcelGroups) {
 9607 |     const target = buildingParcelGeocodingTargetV13(group);
 9608 |     const scopeParcelMatch = findVerifiedScopeParcelForGroupV20(
 9609 |       group,
 9610 |       scopeParcelMap,
 9611 |       scopeParcelAliasIndex
 9612 |     );
 9613 |     const verifiedScopeParcel = scopeParcelMatch?.entry || null;
 9614 |     let location = verifiedScopeParcel?.location || null;
 9615 |     let decision = null;

// ...
 9642 |     if (!decision.matched) continue;
 9643 | 
 9644 |     scopeMatchDiagnostics.matchedParcels += 1;
 9645 |     for (const row of group.rows) {
 9646 |       matchedBuildingRows.push({
 9647 |         row,
 9648 |         location,
 9649 |         parcelKey: group.key,
 9650 |         scopeMatchReason: decision.reason,
 9651 |         scopeDistanceMeters: decision.distanceMeters,
 9652 |       });
 9653 |     }
 9654 |   }
 9655 | 
 9656 |   // K-APT 대표점이 없거나 경계 밖에 찍혀도, 이미 폴리곤 내부로 검증된
 9657 |   // 건축물대장 아파트와 단지명/주소가 일치하면 그 표제부 위치를 사용한다.
 9658 |   for (const complex of kaptComplexes) {
 9659 |     const target = kaptGeocodingTarget(complex);
 9660 |     const titleMatch = findKaptMatchedTitle(complex, matchedBuildingRows);
 9661 |     const boundScopeParcelKey = cleanBuildingText(
 9662 |       complex?.__scopeParcelKeyV46 ?? complex?.scopeParcelKey
 9663 |     );
 9664 |     const boundScopeEntry = boundScopeParcelKey
 9665 |       ? (scopeParcelMap.get(boundScopeParcelKey) || null)
 9666 |       : null;
 9667 |     let location = titleMatch?.location || boundScopeEntry?.location || findBuildingStatsTargetLocation(target, locationIndex);
 9668 |     let decision = titleMatch?.location
 9669 |       ? {
 9670 |           matched: true,
 9671 |           reason: "matched_title_fallback",
 9672 |           distanceMeters: 0,
 9673 |           titleKey: buildingRecordKey(titleMatch.row),
 9674 |         }
 9675 |       : boundScopeEntry?.location
 9676 |         ? {
 9677 |             matched: true,
 9678 |             reason: "verified_kapt_scope_parcel",
 9679 |             distanceMeters: 0,
 9680 |             parcelKey: boundScopeParcelKey,
 9681 |           }
 9682 |         : location
 9683 |           ? buildingParcelScopeDecisionV13(location, geometry, scopeZipcode)
 9684 |           : { matched: false, reason: "missing_location", distanceMeters: null };
 9685 | 
 9686 |     if (!decision.matched && !titleMatch) {
 9687 |       const fallbackTitleMatch = findKaptMatchedTitle(complex, matchedBuildingRows);
 9688 |       if (fallbackTitleMatch?.location) {
 9689 |         location = fallbackTitleMatch.location;
 9690 |         decision = {
 9691 |           matched: true,
 9692 |           reason: "matched_title_fallback",
 9693 |           distanceMeters: 0,
 9694 |           titleKey: buildingRecordKey(fallbackTitleMatch.row),
 9695 |         };
 9696 |       }
 9697 |     }
 9698 | 
 9699 |     addDecision(decision);
 9700 |     if (!decision.matched || !location) {
 9701 |       missingKapt.push(complex);
 9702 |       continue;
 9703 |     }
 9704 | 
 9705 |     const geocodedBindingV51 = bindKaptComplexToGeocodedParcelV51(
 9706 |       complex,
 9707 |       location,
 9708 |       scopeParcelMap,
 9709 |       parcelGroups
 9710 |     );
 9711 |     const boundComplexV51 = geocodedBindingV51.complex;
 9712 |     if (geocodedBindingV51.binding) {
 9713 |       decision = {
 9714 |         ...decision,
 9715 |         reason: decision.reason === "inside_polygon"
 9716 |           ? "verified_kapt_geocode_parcel"
 9717 |           : decision.reason,
 9718 |         parcelKey: geocodedBindingV51.binding.parcelKey,
 9719 |         parcelBindingReason: geocodedBindingV51.binding.reason,
 9720 |       };
 9721 |       if (decision.reason === "verified_kapt_geocode_parcel") {
 9722 |         scopeMatchDiagnostics.verifiedKaptGeocodeParcel += 1;
 9723 |       }
 9724 |     }
 9725 | 
 9726 |     scopeMatchDiagnostics.matchedKapt += 1;
 9727 |     matchedKapt.push({
 9728 |       list: boundComplexV51,
 9729 |       location,
 9730 |       scopeMatchReason: decision.reason,
 9731 |       scopeDistanceMeters: decision.distanceMeters,
 9732 |       scopeParcelBinding: geocodedBindingV51.binding || null,
 9733 |     });
 9734 |   }
 9735 | 
 9736 |   const coverageParcelGroupsV50 = includeExpandedCoverage
 9737 |     ? parcelGroups
 9738 |     : scopeParcelMap.size > 0
 9739 |       ? parcelGroups.filter((group) => !!findVerifiedScopeParcelForGroupV20(
 9740 |           group,
 9741 |           scopeParcelMap,
 9742 |           scopeParcelAliasIndex
 9743 |         ))
 9744 |       : parcelGroups;
 9745 |   const coverageKaptRowsV50 = includeExpandedCoverage || scopeParcelMap.size === 0
 9746 |     ? kaptComplexes
 9747 |     : [];
 9748 |   const coverageTargets = dedupeBuildingStatsGeocodingTargets([
 9749 |     ...coverageParcelGroupsV50.map(buildingParcelGeocodingTargetV13),
 9750 |     ...coverageKaptRowsV50.map(kaptGeocodingTarget),
 9751 |   ]);
 9752 | 
 9753 |   // V50 direct-scope 확장 모드에서는 추가 법정동 후보도 coverage에 넣어, 첫 Kakao 검색에서
 9754 |   // 해결되지 않은 주소를 다음 round에 다시 전달한다. 최종 포함 여부는 좌표의 polygon 판정이다.
 9755 |   const resolvedCoverageTargetKeys = new Set();
 9756 |   const missingGeocodingTargets = [];
 9757 | 
 9758 |   for (const group of coverageParcelGroupsV50) {
 9759 |     const target = buildingParcelGeocodingTargetV13(group);
 9760 |     const scopeParcelMatch = findVerifiedScopeParcelForGroupV20(
 9761 |       group,
 9762 |       scopeParcelMap,
 9763 |       scopeParcelAliasIndex
 9764 |     );
 9765 |     const location = scopeParcelMatch?.entry?.location ||
 9766 |       findBuildingStatsTargetLocation(target, locationIndex);
 9767 | 
 9768 |     if (location) resolvedCoverageTargetKeys.add(target.key);
 9769 |     else missingGeocodingTargets.push(target);
 9770 |   }
 9771 | 
 9772 |   if (includeExpandedCoverage || scopeParcelMap.size === 0) {
 9773 |     for (const complex of coverageKaptRowsV50) {
 9774 |       const target = kaptGeocodingTarget(complex);
 9775 |       const location = findBuildingStatsTargetLocation(target, locationIndex);
 9776 |       if (location) resolvedCoverageTargetKeys.add(target.key);
 9777 |       else missingGeocodingTargets.push(target);
 9778 |     }
 9779 |   }
 9780 | 
 9781 |   const matchedScopeParcelCount = parcelGroups.reduce(
 9782 |     (count, group) => count + (
 9783 |       findVerifiedScopeParcelForGroupV20(
 9784 |         group,
 9785 |         scopeParcelMap,
 9786 |         scopeParcelAliasIndex
 9787 |       ) ? 1 : 0
 9788 |     ),
 9789 |     0
 9790 |   );
 9791 |   const sourceRecordCount = coverageTargets.length;
 9792 |   const effectiveGeocodedBuildingCount = resolvedCoverageTargetKeys.size;
 9793 |   const unlocatedBuildingCount = Math.max(
 9794 |     0,
 9795 |     sourceRecordCount - effectiveGeocodedBuildingCount
 9796 |   );
 9797 |   const coveragePercent = sourceRecordCount > 0
 9798 |     ? effectiveGeocodedBuildingCount / sourceRecordCount * 100
 9799 |     : 100;
 9800 | 
 9801 |   return {
 9802 |     relevantRecords,
 9803 |     parcelGroups,
 9804 |     matchedBuildingRows,
 9805 |     matchedKapt,
 9806 |     missingBuildingRows,
 9807 |     missingKapt,
 9808 |     missingGeocodingTargets,
 9809 |     sourceRecordCount,
 9810 |     rawSourceRecordCount: relevantRecords.length + kaptComplexes.length,
 9811 |     geocodedBuildingCount: effectiveGeocodedBuildingCount,
 9812 |     unlocatedBuildingCount,
 9813 |     coveragePercent,
 9814 |     walkupMinGroundFloors,
 9815 |     verifiedScopeParcels,
 9816 |     scopeMatchDiagnostics: {
 9817 |       ...scopeMatchDiagnostics,
 9818 |       discoveredScopeParcels: scopeParcelMap.size,
 9819 |       matchedScopeParcelCount,
 9820 |       candidateGeocodingTargets: coverageTargets.length,
 9821 |       resolvedGeocodingTargets: effectiveGeocodedBuildingCount,
 9822 |       unresolvedGeocodingTargets: missingGeocodingTargets.length,
 9823 |       scopeParcelDiagnostics: verifiedScopeParcels?.diagnostics || null,
 9824 |     },
 9825 |   };
 9826 | }
 9827 | 
 9828 | function parcelTitleMatches(parcel, indexes) {
 9829 |   return indexes.byParcelKey.get(parcel.key) || [];
 9830 | }
 9831 | 
 9832 | function bestRecapFallback(recapRows) {
 9833 |   let best = null;
 9834 |   for (const row of recapRows || []) {
 9835 |     const classification = buildingHousingClassification(row);
 9836 |     const evidence = buildingTitleUnitEvidence(row, classification);
 9837 |     if (!best || evidence.units > best.units) {
 9838 |       best = {

// ...
 9891 | 
 9892 | function titleParcelExplicitFallback(matches) {
 9893 |   return titleParcelFallback(matches).filter((item) => item.confidence === "authoritative");
 9894 | }
 9895 | 
 9896 | function buildingAddressSimilarity(a, b) {
 9897 |   const left = normalizedBuildingAddress(a);
 9898 |   const right = normalizedBuildingAddress(b);
 9899 |   if (!left || !right) return false;
 9900 |   if (left === right) return true;
 9901 | 
 9902 |   const leftNumbers = left.match(/\d+(?:-\d+)?/g) || [];
 9903 |   const rightNumbers = right.match(/\d+(?:-\d+)?/g) || [];
 9904 |   return leftNumbers.some((value) => rightNumbers.includes(value));
 9905 | }
 9906 | 
 9907 | function kaptMatchesTitleParcel(complex, matches) {
 9908 |   const kaptAddress = cleanBuildingText(complex?.address);
 9909 |   const kaptLocation = complex?.location;
 9910 |   const kaptName = compactBuildingMatchText(complex?.name || complex?.kaptName || "");
 9911 |   const boundTitleKey = cleanBuildingText(complex?.scopeTitleKey || complex?.__scopeTitleKeyV46);
 9912 |   const boundParcelKey = cleanBuildingText(complex?.scopeParcelKey || complex?.__scopeParcelKeyV46);
 9913 | 
 9914 |   for (const match of matches || []) {
 9915 |     const row = match?.row || {};
 9916 |     const classification = buildingHousingClassification(row);
 9917 |     const rowKey = buildingRecordKey(row);
 9918 |     const rowParcelKey = buildingParcelDescriptor(row)?.key || "";
 9919 |     if (boundTitleKey && rowKey === boundTitleKey) return true;
 9920 |     if (boundParcelKey && rowParcelKey === boundParcelKey) return true;
 9921 | 
 9922 |     const titleAddress = buildingRecordAddresses(row).preferredAddress;
 9923 |     if (buildingAddressSimilarity(kaptAddress, titleAddress)) return true;
 9924 |     if (
 9925 |       kaptLocation && match?.location &&
 9926 |       distanceMetersBetweenPoints(kaptLocation, match.location) <= 100
 9927 |     ) return true;
 9928 | 
 9929 |     // 하나의 아파트 단지가 여러 지번/동으로 분리된 경우 대표 K-APT 주소 한 건만으로는
 9930 |     // 일부 동이 coverage에서 빠진다. 단지명과 건축물대장명이 실질적으로 같으면 같은 단지로 본다.
 9931 |     if (classification.apartment && kaptName) {
 9932 |       const titleName = compactBuildingMatchText(
 9933 |         row?.bldNm ?? row?.bld_nm ?? row?.buildingName ?? row?.building_name ?? ""
 9934 |       );
 9935 |       if (
 9936 |         titleName &&
 9937 |         Math.min(kaptName.length, titleName.length) >= 2 &&
 9938 |         (kaptName === titleName || kaptName.includes(titleName) || titleName.includes(kaptName))
 9939 |       ) {
 9940 |         return true;
 9941 |       }
 9942 |     }
 9943 |   }
 9944 | 
 9945 |   return false;
 9946 | }
 9947 | 
 9948 | function unitCandidateQuality(row) {
 9949 |   let score = 0;
 9950 |   if (unitHoName(row)) score += 4;
 9951 |   if (unitDongName(row)) score += 2;
 9952 |   if (unitUseText(row)) score += 4;
 9953 |   const division = cleanBuildingText(
 9954 |     row?.exposPubuseGbCdNm ?? row?.expos_pubuse_gb_cd_nm
 9955 |   );
 9956 |   if (/전유/.test(division)) score += 3;
 9957 |   return score;
 9958 | }
 9959 | 
 9960 | async function finalizeCombinedBuildingStats(env, prepared, options = {}) {
 9961 |   // V35 Paid: 대부분의 구역은 최대 48필지 상세조회로 한 invocation에서 끝난다.
 9962 |   // 48필지를 넘는 대형 구역만 continuation으로 넘기며, 그 경우 K-APT/최종 집계는 마지막 배치에서만 실행한다.
 9963 |   const unitSource = await fetchMatchedBuildingUnitData(
 9964 |     env,
 9965 |     prepared.matchedBuildingRows,
 9966 |     prepared.matchedKapt,

// ...
 9974 |     return {
 9975 |       detailContinuation: unitSource.detailContinuation,
 9976 |       unitSourceComplete: false,
 9977 |       unitSourceWarnings: unitSource.warnings || [],
 9978 |     };
 9979 |   }
 9980 | 
 9981 |   const orderedKaptMatches = [...(prepared.matchedKapt || [])].sort((a, b) => {
 9982 |     const left = Number(a?.scopeDistanceMeters);
 9983 |     const right = Number(b?.scopeDistanceMeters);
 9984 |     const aDistance = Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER;
 9985 |     const bDistance = Number.isFinite(right) ? right : Number.MAX_SAFE_INTEGER;
 9986 |     return aDistance - bDistance;
 9987 |   });
 9988 |   const selectedKaptMatches = orderedKaptMatches.slice(
 9989 |     0,
 9990 |     KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
 9991 |   );
 9992 |   const deferredKaptMatches = orderedKaptMatches.slice(
 9993 |     KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
 9994 |   );
 9995 | 
 9996 |   const kaptInfoRows = await mapBuildingWithConcurrency(
 9997 |     selectedKaptMatches,
 9998 |     KAPT_INFO_CONCURRENCY,
 9999 |     async (match) => {
10000 |       const info = await fetchKaptComplexInfo(env, match.list);
10001 |       if (!info) return null;
10002 |       return normalizedKaptInfo(info, match.location);
10003 |     }
10004 |   );
10005 | 
10006 |   const normalizedKapt = [];
10007 |   const kaptInfoFailures = deferredKaptMatches.map((match) => ({
10008 |     kaptCode: kaptCodeOf(match?.list) || null,
10009 |     name: kaptNameOf(match?.list) || null,
10010 |     diagnostics: {
10011 |       error: "deferred_by_paid_safety_cap",
10012 |     },
10013 |   }));
10014 |   const seenKaptComplexes = new Set();
10015 |   for (const row of kaptInfoRows) {
10016 |     if (!row || Number(row.households) <= 0) {
10017 |       kaptInfoFailures.push({
10018 |         kaptCode: row?.kaptCode || row?.diagnostics?.kaptCode || null,
10019 |         name: row?.name || row?.diagnostics?.listName || null,
10020 |         diagnostics: row?.diagnostics || null,
10021 |       });
10022 |       continue;
10023 |     }
10024 |     const key = cleanBuildingText(row.kaptCode || row.key || row.address);
10025 |     if (!key || seenKaptComplexes.has(key)) continue;
10026 |     seenKaptComplexes.add(key);
10027 |     normalizedKapt.push(row);
10028 |   }
10029 | 
10030 |   // V51: 전유호가 이미 존재하는 필지에서도 recap-title의 상가동/혼합용도 부모를
10031 |   // 표제부 인덱스에 병합한다. 그래야 K-APT 주거 세대수와 별개로 상가 전유호가 commercial로 분류된다.
10032 |   const effectiveMatchedBuildingRowsV51 = [];
10033 |   const effectiveMatchSeenV51 = new Set();
10034 |   const pushEffectiveMatchV51 = (match, parcelKeyHint = "", source = "building_title") => {
10035 |     const row = match?.row;
10036 |     if (!row) return;
10037 |     const parcelKey = cleanBuildingText(
10038 |       parcelKeyHint || buildingParcelDescriptor(row)?.key || ""
10039 |     );
10040 |     const normalizedRow = parcelKey
10041 |       ? { ...row, __scopeParcelKeyV20: parcelKey }
10042 |       : row;
10043 |     const stable = buildingRecordKey(normalizedRow) || buildingUnitRowStableKey(normalizedRow, 0);
10044 |     const dedupeKey = `${parcelKey || "NO_PARCEL"}|${stable || normalizedBuildingAddress(buildingRecordAddresses(normalizedRow).preferredAddress)}`;
10045 |     if (!dedupeKey || effectiveMatchSeenV51.has(dedupeKey)) return;
10046 |     effectiveMatchSeenV51.add(dedupeKey);
10047 |     effectiveMatchedBuildingRowsV51.push({
10048 |       ...match,
10049 |       row: normalizedRow,
10050 |       parcelKey: parcelKey || match?.parcelKey || null,
10051 |       scopeMatchReason: match?.scopeMatchReason || source,
10052 |     });

// ...
10059 |   for (const parcelResult of unitSource.parcels || []) {
10060 |     const parcelKey = cleanBuildingText(parcelResult?.parcel?.key);
10061 |     for (const row of parcelResult?.recapRows || []) {
10062 |       const before = effectiveMatchedBuildingRowsV51.length;
10063 |       pushEffectiveMatchV51({
10064 |         row,
10065 |         location: parcelResult?.verifiedScopeEntryV51?.location || null,
10066 |         parcelKey,
10067 |       }, parcelKey, "recap_direct_parcel_v51");
10068 |       if (effectiveMatchedBuildingRowsV51.length > before) recapMergedTitleRowCountV51 += 1;
10069 |     }
10070 |   }
10071 | 
10072 |   const indexes = titleRowIndexes(effectiveMatchedBuildingRowsV51);
10073 | 
10074 |   const totals = {
10075 |     residentialUnitCount: 0,
10076 |     commercialUnitCount: 0,
10077 |     unclassifiedUnitCount: 0,
10078 |     deliveryUnitCount: 0,
10079 |     confirmedElevatorUnitCount: 0,
10080 |     inferredElevatorUnitCount: 0,
10081 |     noElevatorUnitCount: 0,
10082 |     unknownElevatorUnitCount: 0,
10083 |     residentialElevatorUnitCount: 0,
10084 |     residentialNoElevatorUnitCount: 0,
10085 |     residentialUnknownElevatorUnitCount: 0,
10086 |     commercialElevatorUnitCount: 0,
10087 |     commercialNoElevatorUnitCount: 0,
10088 |     commercialUnknownElevatorUnitCount: 0,
10089 |     passengerElevatorCount: 0,
10090 |     emergencyElevatorCount: 0,
10091 |     walkupBuildingCount: 0,
10092 |     walkupHouseholdCount: 0,
10093 |     authoritativeUnitCount: 0,
10094 |     estimatedUnitCount: 0,
10095 |   };
10096 | 
10097 |   const residentialBuildings = new Set();
10098 |   const commercialBuildings = new Set();
10099 |   const mixedUseBuildings = new Set();
10100 |   const countedUnits = new Set();
10101 |   const buildingElevatorCategories = new Map();
10102 |   const elevatorBuildingDiagnostics = new Map();
10103 |   const walkupBuildings = new Set();
10104 |   const contributorTotals = new Map();
10105 |   let commonAreaRecordCount = 0;
10106 |   let recapFallbackUnits = 0;

// ...
10115 |     recapRows: 0,
10116 |     housePriceRows: 0,
10117 |     candidateUnits: 0,
10118 |     parentlessCandidates: 0,
10119 |     ambiguousParentCandidates: 0,
10120 |     parcelsWithExclusiveUnits: 0,
10121 |     parcelsWithRecapFallback: 0,
10122 |     parcelsWithHousePriceFallback: 0,
10123 |     parcelsWithTitleFallback: 0,
10124 |     titleSupplementBuildings: 0,
10125 |     titleSupplementUnits: 0,
10126 |     titleSupplementAuthoritativeUnits: 0,
10127 |     titleSupplementEstimatedUnits: 0,
10128 |     mixedUseSplitBuildings: 0,
10129 |     mixedUseResidentialUnits: 0,
10130 |     mixedUseCommercialUnits: 0,
10131 |     kaptComplexes: normalizedKapt.length,
10132 |     verifiedScopeParcelCount: Number(unitSource?.diagnosticsV51?.verifiedScopeParcelCount || 0),
10133 |     detailScopeOnlyParcelCount: Number(unitSource?.diagnosticsV51?.detailScopeOnlyParcelCount || 0),
10134 |     detailKaptAddedParcelCount: Number(unitSource?.diagnosticsV51?.detailKaptAddedParcelCount || 0),
10135 |     recapMergedTitleRowCount: recapMergedTitleRowCountV51,
10136 |     kaptGeocodeBoundCount: Number(prepared?.scopeMatchDiagnostics?.verifiedKaptGeocodeParcel || 0),
10137 |   };
10138 | 
10139 |   const registerContributor = (key, payload) => {
10140 |     const normalizedKey = cleanBuildingText(key);
10141 |     const units = Math.max(0, Math.trunc(Number(payload?.units) || 0));
10142 |     if (!normalizedKey || !units) return;
10143 | 
10144 |     const previous = contributorTotals.get(normalizedKey) || {
10145 |       key: normalizedKey,
10146 |       name: payload?.name || null,
10147 |       address: payload?.address || null,
10148 |       source: payload?.source || null,
10149 |       estimateDetails: payload?.estimateDetails || null,
10150 |       residential: 0,
10151 |       commercial: 0,
10152 |       unclassified: 0,
10153 |       authoritative: 0,
10154 |       estimated: 0,
10155 |       total: 0,
10156 |     };
10157 | 
10158 |     const type = payload?.unitType;
10159 |     if (type === "residential") previous.residential += units;
10160 |     else if (type === "commercial") previous.commercial += units;
10161 |     else previous.unclassified += units;
10162 |     if (payload?.confidence === "estimated") previous.estimated += units;
10163 |     else previous.authoritative += units;
10164 |     previous.total += units;

// ...
10181 |       buildingElevatorCategories.set(key, next);
10182 |     }
10183 |   };
10184 | 
10185 |   const addCount = (
10186 |     unitType,
10187 |     units,
10188 |     buildingKey,
10189 |     elevator,
10190 |     contributor,
10191 |     confidence = "authoritative"
10192 |   ) => {
10193 |     const count = Math.max(0, Math.trunc(Number(units) || 0));
10194 |     if (!count) return;
10195 | 
10196 |     if (unitType === "residential") {
10197 |       totals.residentialUnitCount += count;
10198 |       residentialBuildings.add(buildingKey);
10199 |     } else if (unitType === "commercial") {
10200 |       totals.commercialUnitCount += count;
10201 |       commercialBuildings.add(buildingKey);
10202 |     } else {
10203 |       totals.unclassifiedUnitCount += count;
10204 |     }
10205 | 
10206 |     if (confidence === "estimated") totals.estimatedUnitCount += count;
10207 |     else totals.authoritativeUnitCount += count;
10208 | 
10209 |     addUnitToElevatorTotals(totals, unitType, elevator.category, count);
10210 |     recordBuildingElevator(buildingKey, elevator.category);
10211 |     registerElevatorBuildingDiagnostic(
10212 |       elevatorBuildingDiagnostics,
10213 |       buildingKey,
10214 |       elevator,
10215 |       count,
10216 |       unitType,
10217 |       contributor
10218 |     );
10219 |     registerContributor(buildingKey, {
10220 |       ...contributor,
10221 |       units: count,
10222 |       unitType,
10223 |       confidence,
10224 |     });
10225 | 
10226 |     if (
10227 |       elevator.category === "none" &&
10228 |       elevator.floors >= prepared.walkupMinGroundFloors
10229 |     ) {
10230 |       totals.walkupHouseholdCount += count;
10231 |       walkupBuildings.add(buildingKey);

// ...
10324 |       if (fallback.confidence === "estimated" || reconciled.usedFloorOverride) {
10325 |         unitDiagnostics.titleSupplementEstimatedUnits += delta;
10326 |       } else {
10327 |         unitDiagnostics.titleSupplementAuthoritativeUnits += delta;
10328 |       }
10329 |     }
10330 | 
10331 |     if (supplementedUnits > 0) {
10332 |       unitDiagnostics.parcelsWithTitleFallback += 1;
10333 |     }
10334 | 
10335 |     return { supplementedUnits, supplementedBuildings };
10336 |   };
10337 | 
10338 | 
10339 |   // K-APT에서 총세대수가 정상 확인된 단지만 먼저 집계한다.
10340 |   const kaptCoveredParcels = new Set();
10341 |   const kaptPositiveElevatorParcels = new Set();
10342 |   for (const complex of normalizedKapt) {
10343 |     const matchedParcelKeys = [];
10344 |     const boundParcelKey = cleanBuildingText(
10345 |       complex?.scopeParcelKey ?? complex?.__scopeParcelKeyV46
10346 |     );
10347 |     if (
10348 |       boundParcelKey &&
10349 |       unitSource.parcels.some((parcelResult) => parcelResult?.parcel?.key === boundParcelKey)
10350 |     ) {
10351 |       matchedParcelKeys.push(boundParcelKey);
10352 |     }
10353 | 
10354 |     for (const parcelResult of unitSource.parcels) {
10355 |       const matches = parcelTitleMatches(parcelResult.parcel, indexes);
10356 |       if (kaptMatchesTitleParcel(complex, matches)) {
10357 |         matchedParcelKeys.push(parcelResult.parcel.key);
10358 |       }
10359 |     }
10360 | 
10361 |     const uniqueMatchedParcelKeys = [...new Set(matchedParcelKeys)];
10362 |     for (const key of uniqueMatchedParcelKeys) kaptCoveredParcels.add(key);
10363 | 
10364 |     const elevator = kaptElevatorAvailability(complex);
10365 |     if (elevator.category === "confirmed") {
10366 |       for (const key of uniqueMatchedParcelKeys) kaptPositiveElevatorParcels.add(key);
10367 |     }
10368 | 
10369 |     const key = complex.key || `kapt:${complex.kaptCode}`;
10370 |     addCount(
10371 |       "residential",
10372 |       complex.households,
10373 |       key,
10374 |       elevator,
10375 |       {
10376 |         source: "K_APT",
10377 |         name: complex.name || null,
10378 |         address: complex.address || null,
10379 |         // K-APT 총세대수는 단지 단위이므로 엘베 O/X 건물수도 공식 동수만큼 가중한다.
10380 |         buildingWeight: Math.max(1, Math.trunc(Number(complex.buildingCount) || 1)),
10381 |       },
10382 |       "authoritative"
10383 |     );
10384 |     totals.passengerElevatorCount += complex.elevatorCount;
10385 |   }
10386 | 
10387 |   for (const parcelResult of unitSource.parcels) {
10388 |     const parcelMatches = parcelTitleMatches(parcelResult.parcel, indexes);
10389 |     const parcelKey = parcelResult.parcel.key;
10390 |     const coveredByKapt = kaptCoveredParcels.has(parcelKey);
10391 |     const elevatorEvidenceRows = [
10392 |       ...(parcelResult.areaRows || []),
10393 |       ...(parcelResult.exposRows || []),
10394 |       ...(parcelResult.floorRows || []),
10395 |     ];
10396 |     const parcelPositiveTitleCount = parcelMatches.reduce((count, match) => {
10397 |       const info = buildingElevatorInfo(match?.row);
10398 |       return count + ((Number(info?.passenger) || 0) + (Number(info?.emergency) || 0) > 0 ? 1 : 0);
10399 |     }, 0);
10400 |     const parcelFacilityEvidenceRows = elevatorEvidenceRows.filter(
10401 |       hasRegisteredElevatorFacilityEvidence
10402 |     );
10403 |     const sharedElevatorEvidence = {
10404 |       kaptPositive: kaptPositiveElevatorParcels.has(parcelKey),
10405 |       titlePositive: parcelPositiveTitleCount > 0,
10406 |       facilityPositive: parcelFacilityEvidenceRows.length > 0,
10407 |       titlePositiveCount: parcelPositiveTitleCount,
10408 |       facilityCount: parcelFacilityEvidenceRows.length,
10409 |     };
10410 |     const elevatorFacilityRowsFor = (parentRow) =>
10411 |       elevatorFacilityRowsForBuilding(
10412 |         elevatorEvidenceRows,
10413 |         parentRow,
10414 |         parcelResult.parcel,
10415 |         indexes,
10416 |         parcelMatches
10417 |       );
10418 | 
10419 |     unitDiagnostics.areaRows += (parcelResult.areaRows || []).length;
10420 |     unitDiagnostics.exposRows += (parcelResult.exposRows || []).length;
10421 |     unitDiagnostics.floorRows += (parcelResult.floorRows || []).length;
10422 |     unitDiagnostics.recapRows += (parcelResult.recapRows || []).length;
10423 |     unitDiagnostics.housePriceRows += (parcelResult.housePriceRows || []).length;
10424 | 
10425 |     const candidateMap = new Map();
10426 |     const mergeCandidate = (row, source) => {
10427 |       if (!row) return;
10428 |       if (isCommonAreaUnitRecord(row)) {
10429 |         commonAreaRecordCount += 1;
10430 |         return;
10431 |       }
10432 |       if (source === "area" && !isExclusiveAreaUnitRecord(row)) return;

// ...
10769 |           if (part.type === "commercial") unitDiagnostics.mixedUseCommercialUnits += part.units;
10770 |         }
10771 |       }
10772 |       if (fallback.classification?.mixedUse && titleSplit.length > 1) unitDiagnostics.mixedUseSplitBuildings += 1;
10773 |       parcelTitleUnits += effectiveUnits;
10774 |       titleFallbackUnits += effectiveUnits;
10775 |       totals.passengerElevatorCount += elevator.passenger;
10776 |       totals.emergencyElevatorCount += elevator.emergency;
10777 |     }
10778 |     if (parcelTitleUnits > 0) unitDiagnostics.parcelsWithTitleFallback += 1;
10779 |   }
10780 | 
10781 |   for (const key of residentialBuildings) {
10782 |     if (commercialBuildings.has(key)) mixedUseBuildings.add(key);
10783 |   }
10784 | 
10785 |   totals.deliveryUnitCount =
10786 |     totals.residentialUnitCount +
10787 |     totals.commercialUnitCount +
10788 |     totals.unclassifiedUnitCount;
10789 | 
10790 |   const topContributors = [...contributorTotals.values()]
10791 |     .sort((a, b) => b.total - a.total)
10792 |     .slice(0, 100);
10793 |   const kaptHouseholds = normalizedKapt.reduce((sum, row) => sum + row.households, 0);
10794 |   const elevatorSummary = summarizeElevatorBuildingDiagnostics(
10795 |     elevatorBuildingDiagnostics
10796 |   );
10797 |   const uniqueMatchedBuildingKeys = new Set(
10798 |     (effectiveMatchedBuildingRowsV51 || [])
10799 |       .map((match) => buildingRecordKey(match?.row || {}))
10800 |       .filter(Boolean)
10801 |   );
10802 | 
10803 |   // K-APT로 대체 집계한 아파트는 건축물대장 동 레코드 + K-APT 단지를 이중으로 세지 않는다.
10804 |   // 실제 K-APT 동수로 대체하고, K-APT와 연결되지 않은 건축물대장만 별도로 더한다.
10805 |   const kaptCoveredTitleKeys = new Set();
10806 |   for (const complex of normalizedKapt) {
10807 |     for (const match of effectiveMatchedBuildingRowsV51 || []) {
10808 |       const row = match?.row || {};
10809 |       if (!buildingHousingClassification(row).apartment) continue;
10810 |       if (!kaptMatchesTitleParcel(complex, [match])) continue;
10811 |       const key = buildingRecordKey(row);
10812 |       if (key) kaptCoveredTitleKeys.add(key);
10813 |     }
10814 |   }
10815 |   const unmatchedTitleBuildingCount = [...uniqueMatchedBuildingKeys]
10816 |     .filter((key) => !kaptCoveredTitleKeys.has(key)).length;
10817 |   const kaptBuildingCount = normalizedKapt.reduce(
10818 |     (sum, complex) => sum + Math.max(1, Math.trunc(Number(complex.buildingCount) || 1)),
10819 |     0
10820 |   );
10821 |   const matchedBuildingCount = unmatchedTitleBuildingCount + kaptBuildingCount;
10822 | 
10823 |   return {
10824 |     detailContinuation: unitSource.detailContinuation || { required: false, evidence: [] },
10825 |     householdCount: totals.residentialUnitCount,
10826 |     apartmentHouseholdCount: kaptHouseholds,
10827 |     nonApartmentHouseholdCount: Math.max(0, totals.residentialUnitCount - kaptHouseholds),
10828 |     unknownHouseholdCount: 0,
10829 |     residentialUnitCount: totals.residentialUnitCount,
10830 |     commercialUnitCount: totals.commercialUnitCount,
10831 |     unclassifiedUnitCount: totals.unclassifiedUnitCount,
10832 |     deliveryUnitCount: totals.deliveryUnitCount,
10833 |     residentialBuildingUnitCount: residentialBuildings.size,
10834 |     commercialBuildingUnitCount: commercialBuildings.size,
10835 |     mixedUseBuildingCount: mixedUseBuildings.size,
10836 |     exclusiveUnitRecordCount: countedUnits.size,
10837 |     commonAreaRecordCount,
10838 |     confirmedElevatorUnitCount: totals.confirmedElevatorUnitCount,
10839 |     inferredElevatorUnitCount: totals.inferredElevatorUnitCount,
10840 |     noElevatorUnitCount: totals.noElevatorUnitCount,
10841 |     unknownElevatorUnitCount: totals.unknownElevatorUnitCount,
10842 |     residentialElevatorUnitCount: totals.residentialElevatorUnitCount,
10843 |     residentialNoElevatorUnitCount: totals.residentialNoElevatorUnitCount,
10844 |     residentialUnknownElevatorUnitCount: totals.residentialUnknownElevatorUnitCount,
10845 |     commercialElevatorUnitCount: totals.commercialElevatorUnitCount,
10846 |     commercialNoElevatorUnitCount: totals.commercialNoElevatorUnitCount,
10847 |     commercialUnknownElevatorUnitCount: totals.commercialUnknownElevatorUnitCount,
10848 |     sourceRecordCount: prepared.sourceRecordCount,
10849 |     matchedBuildingCount,
10850 |     residentialBuildingCount: residentialBuildings.size,
10851 |     geocodedBuildingCount: prepared.geocodedBuildingCount,
10852 |     unlocatedBuildingCount: prepared.unlocatedBuildingCount,
10853 |     coveragePercent: prepared.coveragePercent,
10854 |     // V40: 공식 양수 등록 또는 건축HUB 승강기 시설 직접 증거만 엘베 O 건물로 집계한다.
10855 |     elevatorBuildingCount: elevatorSummary.buildingCounts.confirmed,
10856 |     noElevatorBuildingCount: elevatorSummary.buildingCounts.none,
10857 |     unknownElevatorBuildingCount: elevatorSummary.buildingCounts.unknown,
10858 |     elevatorHouseholdCount: totals.confirmedElevatorUnitCount,
10859 |     noElevatorHouseholdCount: totals.noElevatorUnitCount,
10860 |     unknownElevatorHouseholdCount: totals.unknownElevatorUnitCount,
10861 |     passengerElevatorCount: totals.passengerElevatorCount,
10862 |     emergencyElevatorCount: totals.emergencyElevatorCount,
10863 |     walkupBuildingCount: walkupBuildings.size,
10864 |     walkupHouseholdCount: totals.walkupHouseholdCount,
10865 |     unitSourceComplete:
10866 |       unitSource.complete &&
10867 |       kaptInfoFailures.length === 0 &&
10868 |       totals.estimatedUnitCount === 0,
10869 |     unitSourceWarnings: [
10870 |       ...unitSource.warnings,
10871 |       ...kaptInfoFailures.map((row) =>
10872 |         `K_APT_INFO_EMPTY: ${row.kaptCode || row.name || "unknown"}`
10873 |       ),
10874 |       ...(totals.estimatedUnitCount > 0
10875 |         ? [`ESTIMATED_UNITS: ${totals.estimatedUnitCount}`]
10876 |         : []),
10877 |     ],
10878 |     breakdown: {
10879 |       algorithm: {
10880 |         version: BUILDING_STATS_SOURCE_VERSION,
10881 |         parcelIdentityRequired: true,
10882 |         polygonInsideWins: true,
10883 |         scope: prepared.scopeMatchDiagnostics,
10884 |       },
10885 |       deliveryUnits: {
10886 |         residential: totals.residentialUnitCount,
10887 |         commercial: totals.commercialUnitCount,
10888 |         unclassified: totals.unclassifiedUnitCount,
10889 |         total: totals.deliveryUnitCount,
10890 |         exclusiveUnitRows: exclusiveUnits,
10891 |         recapFallbackUnits,
10892 |         titleFallbackUnits,
10893 |       },
10894 |       elevator: {
10895 |         unitCounts: {
10896 |           confirmed: totals.confirmedElevatorUnitCount,
10897 |           inferred: totals.inferredElevatorUnitCount,
10898 |           none: totals.noElevatorUnitCount,
10899 |           unknown: totals.unknownElevatorUnitCount,
10900 |         },
10901 |         buildingCounts: elevatorSummary.buildingCounts,
10902 |         zeroOverrideBuildingCount: elevatorSummary.zeroOverrideBuildingCount,
10903 |         inferencePolicy: {
10904 |           mode: "OFFICIAL_COUNT_OR_REGISTERED_FACILITY",
10905 |           registeredPositiveIsElevator: true,
10906 |           registeredFacilityIsElevator: true,
10907 |           registeredZeroCanBeOverriddenByFacility: true,
10908 |           [long-token-redacted]: true,
10909 |           missingValueIsUnknownWithoutFacility: true,
10910 |           inferredElevatorIncludedInConfirmed: false,
10911 |         },
10912 |         samples: elevatorSummary.samples,
10913 |       },
10914 |       dataQuality: {
10915 |         authoritativeUnitCount: totals.authoritativeUnitCount,
10916 |         estimatedUnitCount: totals.estimatedUnitCount,
10917 |         authoritativePercent: totals.deliveryUnitCount > 0
10918 |           ? Math.round(totals.authoritativeUnitCount / totals.deliveryUnitCount * 1000) / 10
10919 |           : 0,
10920 |         estimatedPercent: totals.deliveryUnitCount > 0
10921 |           ? Math.round(totals.estimatedUnitCount / totals.deliveryUnitCount * 1000) / 10
10922 |           : 0,
10923 |         matchedBuildingCount,
10924 |         candidateBuildingParcelCount: prepared.parcelGroups.length,
10925 |         candidateGeocodingTargetCount:
10926 |           prepared.scopeMatchDiagnostics?.candidateGeocodingTargets ?? null,
10927 |         resolvedGeocodingTargetCount:
10928 |           prepared.scopeMatchDiagnostics?.resolvedGeocodingTargets ?? null,
10929 |         unresolvedGeocodingTargetCount:
10930 |           prepared.scopeMatchDiagnostics?.unresolvedGeocodingTargets ?? null,
10931 |         averageUnitsPerMatchedBuilding: matchedBuildingCount > 0
10932 |           ? Math.round(totals.deliveryUnitCount / matchedBuildingCount * 100) / 100
10933 |           : 0,
10934 |         onePerBuildingSuspicion: (
10935 |           matchedBuildingCount >= 10 &&
10936 |           totals.deliveryUnitCount <= matchedBuildingCount * 1.2 &&
10937 |           exclusiveUnits === 0
10938 |         ),
10939 |         titleSupplementBuildings: unitDiagnostics.titleSupplementBuildings,
10940 |         titleSupplementUnits: unitDiagnostics.titleSupplementUnits,
10941 |         titleSupplementAuthoritativeUnits: unitDiagnostics.titleSupplementAuthoritativeUnits,
10942 |         titleSupplementEstimatedUnits: unitDiagnostics.titleSupplementEstimatedUnits,
10943 |         ambiguousParentCandidates: unitDiagnostics.ambiguousParentCandidates,
10944 |         mixedUseSplitBuildings: unitDiagnostics.mixedUseSplitBuildings,
10945 |         mixedUseResidentialUnits: unitDiagnostics.mixedUseResidentialUnits,
10946 |         mixedUseCommercialUnits: unitDiagnostics.mixedUseCommercialUnits,
10947 |         detailContinuation: unitSource.detailContinuation
10948 |           ? {
10949 |               required: unitSource.detailContinuation.required === true,
10950 |               processedParcelCount: unitSource.detailContinuation.processedParcelCount || 0,
10951 |               batchParcelCount: unitSource.detailContinuation.batchParcelCount || 0,
10952 |               remainingParcelCount: unitSource.detailContinuation.remainingParcelCount || 0,
10953 |               totalDetailParcelCount: unitSource.detailContinuation.totalDetailParcelCount || 0,
10954 |             }
10955 |           : null,
10956 |         bulkExclusive: unitSource.bulkDiagnostics || null,
10957 |       },
10958 |       kapt: {
10959 |         requestedComplexCount: prepared.matchedKapt.length,
10960 |         complexCount: normalizedKapt.length,
10961 |         failedComplexCount: kaptInfoFailures.length,
10962 |         householdCount: kaptHouseholds,
10963 |         failures: kaptInfoFailures,
10964 |         complexes: normalizedKapt.map((row) => ({
10965 |           kaptCode: row.kaptCode || null,
10966 |           name: row.name || null,
10967 |           address: row.address || null,
10968 |           households: row.households || 0,
10969 |           householdsSource: row.householdsSource || null,
10970 |           elevatorCount: row.elevatorCount || 0,
10971 |           buildingCount: row.buildingCount || 0,
10972 |           scopeTitleKey: row.scopeTitleKey || null,
10973 |           scopeParcelKey: row.scopeParcelKey || null,
10974 |           scopeMatchReason: row.scopeMatchReason || null,
10975 |           scopeMatchScore: Number(row.scopeMatchScore || 0),
10976 |           lat: finiteNumberOrNull(row?.location?.lat),
10977 |           lng: finiteNumberOrNull(row?.location?.lng),
10978 |           diagnostics: row.diagnostics || null,
10979 |         })),
10980 |       },
10981 |       source: {
10982 |         matchedParcels: unitSource.parcels.length,
10983 |         unitSourceComplete: unitSource.complete,
10984 |         warnings: unitSource.warnings,
10985 |         unitDiagnostics,
10986 |         bulkExclusive: unitSource.bulkDiagnostics || null,
10987 |         parcelQueries: unitSource.parcels.map((parcelResult) => ({
10988 |           parcelKey: parcelResult.parcel?.key || null,
10989 |           addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
10990 |           addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
10991 |           areaRows: (parcelResult.areaRows || []).length,
10992 |           exposRows: (parcelResult.exposRows || []).length,
10993 |           floorRows: (parcelResult.floorRows || []).length,

// ...
11031 | 
11032 | function buildTitleBaselineFallbackAggregate(prepared) {
11033 |   const matches = Array.isArray(prepared?.matchedBuildingRows)
11034 |     ? prepared.matchedBuildingRows
11035 |     : [];
11036 | 
11037 |   const parcelGroups = new Map();
11038 |   matches.forEach((match, index) => {
11039 |     const row = match?.row;
11040 |     if (!row || isAncillaryBuildingRecord(row)) return;
11041 |     const key = titleFallbackParcelKey(row, index);
11042 |     if (!parcelGroups.has(key)) parcelGroups.set(key, []);
11043 |     parcelGroups.get(key).push({ match, row, index });
11044 |   });
11045 | 
11046 |   const totals = {
11047 |     residentialUnitCount: 0,
11048 |     commercialUnitCount: 0,
11049 |     unclassifiedUnitCount: 0,
11050 |     confirmedElevatorUnitCount: 0,
11051 |     inferredElevatorUnitCount: 0,
11052 |     noElevatorUnitCount: 0,
11053 |     unknownElevatorUnitCount: 0,
11054 |     residentialElevatorUnitCount: 0,
11055 |     residentialNoElevatorUnitCount: 0,
11056 |     residentialUnknownElevatorUnitCount: 0,
11057 |     commercialElevatorUnitCount: 0,
11058 |     commercialNoElevatorUnitCount: 0,
11059 |     commercialUnknownElevatorUnitCount: 0,
11060 |     passengerElevatorCount: 0,
11061 |     emergencyElevatorCount: 0,
11062 |     walkupBuildingCount: 0,
11063 |     walkupHouseholdCount: 0,
11064 |   };
11065 | 
11066 |   const residentialBuildings = new Set();
11067 |   const commercialBuildings = new Set();
11068 |   const mixedUseBuildings = new Set();
11069 |   const countedBuildings = new Set();
11070 |   const contributors = [];
11071 |   const elevatorBuildingDiagnostics = new Map();
11072 |   const walkupBuildings = new Set();
11073 | 
11074 |   const add = (unitType, units, row, buildingKey, source, peerMatches = []) => {
11075 |     const count = Math.max(0, Math.trunc(Number(units) || 0));
11076 |     if (!count) return;
11077 | 
11078 |     const classification = buildingHousingClassification(row);
11079 |     const elevator = buildingElevatorProfile(
11080 |       row,
11081 |       classification,
11082 |       peerMatches,
11083 |       { unitCount: count }
11084 |     );
11085 | 
11086 |     if (unitType === "residential") {
11087 |       totals.residentialUnitCount += count;
11088 |       residentialBuildings.add(buildingKey);
11089 |     } else if (unitType === "commercial") {
11090 |       totals.commercialUnitCount += count;
11091 |       commercialBuildings.add(buildingKey);
11092 |     } else {
11093 |       totals.unclassifiedUnitCount += count;
11094 |     }
11095 | 
11096 |     addUnitToElevatorTotals(totals, unitType, elevator.category, count);
11097 |     registerElevatorBuildingDiagnostic(
11098 |       elevatorBuildingDiagnostics,
11099 |       buildingKey,
11100 |       elevator,
11101 |       count,
11102 |       unitType,
11103 |       {
11104 |         source,
11105 |         name: cleanBuildingText(row?.bldNm ?? row?.bld_nm) || null,
11106 |         address: buildingRecordAddresses(row).preferredAddress || null,
11107 |       }
11108 |     );
11109 | 
11110 |     if (
11111 |       elevator.category === "none" &&
11112 |       elevator.floors >= Number(prepared?.walkupMinGroundFloors || 3)
11113 |     ) {
11114 |       walkupBuildings.add(buildingKey);
11115 |       totals.walkupHouseholdCount += count;
11116 |     }
11117 | 
11118 |     if (!countedBuildings.has(buildingKey)) {
11119 |       countedBuildings.add(buildingKey);
11120 |       totals.passengerElevatorCount += elevator.passenger || 0;
11121 |       totals.emergencyElevatorCount += elevator.emergency || 0;

// ...
11186 |       if (item.units <= 0) continue;
11187 |       add(
11188 |         titleFallbackUnitType(item.classification),
11189 |         item.units,
11190 |         item.row,
11191 |         item.identity,
11192 |         "TITLE_BASELINE",
11193 |         items.map((entry) => entry.match)
11194 |       );
11195 |     }
11196 |   }
11197 | 
11198 |   for (const key of residentialBuildings) {
11199 |     if (commercialBuildings.has(key)) mixedUseBuildings.add(key);
11200 |   }
11201 | 
11202 |   const deliveryUnitCount =
11203 |     totals.residentialUnitCount +
11204 |     totals.commercialUnitCount +
11205 |     totals.unclassifiedUnitCount;
11206 |   const elevatorSummary = summarizeElevatorBuildingDiagnostics(
11207 |     elevatorBuildingDiagnostics
11208 |   );
11209 | 
11210 |   return {
11211 |     householdCount: totals.residentialUnitCount,
11212 |     apartmentHouseholdCount: totals.residentialUnitCount,
11213 |     nonApartmentHouseholdCount: 0,
11214 |     unknownHouseholdCount: 0,
11215 |     residentialUnitCount: totals.residentialUnitCount,
11216 |     commercialUnitCount: totals.commercialUnitCount,
11217 |     unclassifiedUnitCount: totals.unclassifiedUnitCount,
11218 |     deliveryUnitCount,
11219 |     residentialBuildingUnitCount: residentialBuildings.size,
11220 |     commercialBuildingUnitCount: commercialBuildings.size,
11221 |     mixedUseBuildingCount: mixedUseBuildings.size,
11222 |     exclusiveUnitRecordCount: 0,
11223 |     commonAreaRecordCount: 0,
11224 |     confirmedElevatorUnitCount: totals.confirmedElevatorUnitCount,
11225 |     inferredElevatorUnitCount: totals.inferredElevatorUnitCount,
11226 |     noElevatorUnitCount: totals.noElevatorUnitCount,
11227 |     unknownElevatorUnitCount: totals.unknownElevatorUnitCount,
11228 |     residentialElevatorUnitCount: totals.residentialElevatorUnitCount,
11229 |     residentialNoElevatorUnitCount: totals.residentialNoElevatorUnitCount,
11230 |     residentialUnknownElevatorUnitCount: totals.residentialUnknownElevatorUnitCount,
11231 |     commercialElevatorUnitCount: totals.commercialElevatorUnitCount,
11232 |     commercialNoElevatorUnitCount: totals.commercialNoElevatorUnitCount,
11233 |     commercialUnknownElevatorUnitCount: totals.commercialUnknownElevatorUnitCount,
11234 |     sourceRecordCount: Number(prepared?.sourceRecordCount || matches.length),
11235 |     matchedBuildingCount: matches.length,
11236 |     residentialBuildingCount: residentialBuildings.size,
11237 |     geocodedBuildingCount: Number(prepared?.geocodedBuildingCount || 0),
11238 |     unlocatedBuildingCount: Number(prepared?.unlocatedBuildingCount || 0),
11239 |     coveragePercent: Number(prepared?.coveragePercent || 0),
11240 |     // V36: 화면/통계의 엘베 O 건물 수는 공식 양수 등록만 집계한다.
11241 |     elevatorBuildingCount: elevatorSummary.buildingCounts.confirmed,
11242 |     noElevatorBuildingCount: elevatorSummary.buildingCounts.none,
11243 |     unknownElevatorBuildingCount: elevatorSummary.buildingCounts.unknown,
11244 |     elevatorHouseholdCount: totals.confirmedElevatorUnitCount,
11245 |     noElevatorHouseholdCount: totals.noElevatorUnitCount,
11246 |     unknownElevatorHouseholdCount: totals.unknownElevatorUnitCount,

// ...
11302 | }) {
11303 |   const now = new Date().toISOString();
11304 | 
11305 |   return {
11306 |     scope_type: scope.scopeType,
11307 |     scope_key: scope.scopeKey,
11308 |     geometry_hash: geometryHash,
11309 | 
11310 |     zipcode: scope.zipcode,
11311 |     subsubroute_id: scope.subsubrouteId,
11312 |     subroute_id: scope.subrouteId,
11313 |     vendor_id: scope.vendorId,
11314 |     display_name: scope.displayName,
11315 | 
11316 |     polygon_area_m2: polygonAreaM2,
11317 | 
11318 |     household_count: aggregate.householdCount,
11319 |     apartment_household_count: aggregate.apartmentHouseholdCount,
11320 |     non_apartment_household_count: aggregate.nonApartmentHouseholdCount,
11321 |     unknown_household_count: aggregate.unknownHouseholdCount,
11322 | 
11323 |     residential_unit_count: aggregate.residentialUnitCount,
11324 |     commercial_unit_count: aggregate.commercialUnitCount,
11325 |     unclassified_unit_count: aggregate.unclassifiedUnitCount,
11326 |     delivery_unit_count: aggregate.deliveryUnitCount,
11327 | 
11328 |     residential_building_unit_count: aggregate.residentialBuildingUnitCount,
11329 |     commercial_building_unit_count: aggregate.commercialBuildingUnitCount,
11330 |     mixed_use_building_count: aggregate.mixedUseBuildingCount,
11331 |     exclusive_unit_record_count: aggregate.exclusiveUnitRecordCount,
11332 |     common_area_record_count: aggregate.commonAreaRecordCount,
11333 | 
11334 |     confirmed_elevator_unit_count: aggregate.confirmedElevatorUnitCount,
11335 |     inferred_elevator_unit_count: aggregate.inferredElevatorUnitCount,
11336 |     no_elevator_unit_count: aggregate.noElevatorUnitCount,
11337 |     unknown_elevator_unit_count: aggregate.unknownElevatorUnitCount,
11338 | 
11339 |     residential_elevator_unit_count: aggregate.residentialElevatorUnitCount,
11340 |     residential_no_elevator_unit_count: aggregate.residentialNoElevatorUnitCount,
11341 |     residential_unknown_elevator_unit_count: aggregate.residentialUnknownElevatorUnitCount,
11342 |     commercial_elevator_unit_count: aggregate.commercialElevatorUnitCount,
11343 |     commercial_no_elevator_unit_count: aggregate.commercialNoElevatorUnitCount,
11344 |     commercial_unknown_elevator_unit_count: aggregate.commercialUnknownElevatorUnitCount,
11345 | 
11346 |     unit_analysis_version: BUILDING_STATS_SOURCE_VERSION,
11347 |     unit_analysis_method: "PAID_FULL_SCOPE_TITLE+DIRECT_PARCEL_EXPOS_AREA_FLOOR+LEGALDONG_KAPT+CONFIDENCE_VALIDATION",
11348 | 
11349 |     source_record_count: aggregate.sourceRecordCount,
11350 |     matched_building_count: aggregate.matchedBuildingCount,
11351 |     residential_building_count: aggregate.residentialBuildingCount,
11352 | 
11353 |     geocoded_building_count: aggregate.geocodedBuildingCount,
11354 |     unlocated_building_count: aggregate.unlocatedBuildingCount,
11355 |     coverage_percent: Math.round(aggregate.coveragePercent * 100) / 100,
11356 | 
11357 |     elevator_building_count: aggregate.elevatorBuildingCount,
11358 |     no_elevator_building_count: aggregate.noElevatorBuildingCount,
11359 |     unknown_elevator_building_count: aggregate.unknownElevatorBuildingCount,
11360 | 
11361 |     elevator_household_count: aggregate.elevatorHouseholdCount,
11362 |     no_elevator_household_count: aggregate.noElevatorHouseholdCount,
11363 |     unknown_elevator_household_count: aggregate.unknownElevatorHouseholdCount,
11364 | 
11365 |     passenger_elevator_count: aggregate.passengerElevatorCount,
11366 |     emergency_elevator_count: aggregate.emergencyElevatorCount,
11367 | 
11368 |     walkup_min_ground_floors: walkupMinGroundFloors,
11369 |     walkup_building_count: aggregate.walkupBuildingCount,
11370 |     walkup_household_count: aggregate.walkupHouseholdCount,
11371 | 
11372 |     source: sourceMode,
11373 |     source_version: sourceVersion,
11374 |     source_reference_date: latestBuildingReferenceDate(records),
11375 |     source_fetched_at: now,
11376 |     location_source: locationSource,
11377 | 
11378 |     breakdown: {
11379 |       ...(aggregate.breakdown || {}),
11380 |       sourceWarnings: Array.isArray(sourceWarnings) ? sourceWarnings : [],
11381 |     },
11382 | 
11383 |     calculated_at: now,
11384 |     expires_at: nextBuildingStatsExpiry(),
11385 |     refresh_status: "ready",
11386 |     last_refresh_attempt_at: now,
11387 |     last_refresh_error: null,
11388 |   };
11389 | }
11390 | 
11391 | // ---------- V60 deterministic parcel-cache building analysis ----------------------
11392 | // Official-source design:
11393 | // 1) Kakao/front-end only discovers verified parcels inside the route polygon.
11394 | // 2) Building HUB title records are cached by exact parcel. Large legal-dong scopes are
11395 | //    populated by resumable title-page sync; small scopes use exact parcel requests.
11396 | // 3) K-APT is an apartment-only enrichment source. It never propagates elevator status
11397 | //    to a different building merely because it shares the same parcel.
11398 | // 4) Exclusive-unit detail is fetched only for collective/mixed buildings that actually
11399 | //    need unit-level classification. No floor/area/parking unit-count estimation is used.
11400 | 
11401 | const V60_TITLE_CACHE_TABLE = "building_v60_title_cache";
11402 | const V60_TITLE_SYNC_TABLE = "building_v60_title_sync";
11403 | const V60_DETAIL_CACHE_TABLE = "building_v60_detail_cache";
11404 | const V60_KAPT_REGION_CACHE_TABLE = "building_v60_kapt_region_cache";
11405 | const V60_KAPT_COMPLEX_CACHE_TABLE = "building_v60_kapt_complex_cache";
11406 | 
11407 | const V60_TITLE_CACHE_DAYS = 32;
11408 | const V60_TITLE_EMPTY_CACHE_DAYS = 7;
11409 | const V60_DETAIL_CACHE_DAYS = 32;
11410 | const V60_KAPT_REGION_CACHE_DAYS = 14;
11411 | const V60_KAPT_COMPLEX_CACHE_DAYS = 14;
11412 | const V60_ERROR_CACHE_MINUTES = 15;
11413 | const V60_ROUTE_CACHE_DAYS = 30;
11414 | 
11415 | const V60_REGION_SYNC_SCOPE_THRESHOLD = 60;
11416 | const V60_REGION_TITLE_PAGES_PER_REQUEST = 8;
11417 | // Building HUB는 조회량이 많을 때 [05] 서비스 연결실패/빈 HTTP 200 응답이 발생할 수 있다.
11418 | // 조회 대상과 페이지 수는 그대로 두고 동시 연결만 2개로 제한해 과도한 burst를 막는다.
11419 | const V60_REGION_TITLE_PAGE_CONCURRENCY = 2;
11420 | const V60_REGION_TITLE_MAX_PAGES = 200;
11421 | const V60_DIRECT_TITLE_BATCH = 12;
11422 | const V60_DIRECT_TITLE_CONCURRENCY = 2;
11423 | const V60_KAPT_COMPLEX_BATCH = 4;
11424 | const V60_KAPT_COMPLEX_CONCURRENCY = 2;
11425 | const V60_DETAIL_BATCH = 6;
11426 | // 상세조회는 한 필지에서 area/expos 2개를 동시에 요청하므로 필지 concurrency는 1로 둔다.
11427 | // 결과/판정 로직은 바꾸지 않고 Building HUB 실제 동시 연결만 최대 2개로 유지한다.
11428 | const V60_DETAIL_CONCURRENCY = 1;
11429 | const V60_PUBLIC_TIMEOUT_MS = 8000;
11430 | // V60 Building HUB 전용 네트워크 안정화 값. K-APT timeout은 기존 V60_PUBLIC_TIMEOUT_MS를 그대로 사용한다.
11431 | const V60_BUILDING_HUB_TIMEOUT_MS = 15000;
11432 | const V60_TITLE_PAGE_TIMEOUT_MS = 15000;
11433 | const V60_BUILDING_HUB_MAX_ATTEMPTS = 3;
11434 | const V60_BUILDING_HUB_RETRY_BASE_DELAY_MS = 800;
11435 | const V60_DETAIL_MAX_PAGES = 30;
11436 | // V65: 공공데이터포털 Building HUB가 numOfRows=1000을 요청해도 실제 응답은
11437 | // 100건 단위로 잘리는 사례가 있다. 기존 30페이지 제한은 정확히 3,000건에서
11438 | // 전유부를 끊어 4천세대 이상 대단지의 뒤쪽 호/상가가 통째로 누락됐다.
11439 | // 전유부(expos)는 실제 배송 단위이므로 충분히 끝까지 읽고, 전유공용면적(area)은
11440 | // 기존 상한을 유지한다. 층별개요는 상가층 판정에만 쓰며 행 수가 훨씬 작다.
11441 | const V65_EXPOS_MAX_PAGES = 120;
11442 | const V65_FLOOR_MAX_PAGES = 40;
11443 | const V65_EXPOS_CACHE_MAX_ROWS = 12000;
11444 | const V65_DETAIL_CACHE_VERSION = "V65_COMPLETE_EXPOS_FLOOR_USE";
11445 | // V66 HsPms는 단지별 복리분양시설 건수가 작다. K-APT로 실제 아파트 단지가
11446 | // 확인된 필지만 조회하고, 관리공동부대복리시설은 존재 진단용으로만 사용한다.
11447 | const V66_HSPMS_MAX_PAGES = 20;
11448 | const V66_HSPMS_TIMEOUT_MS = 15000;
11449 | const V66_HSPMS_CONCURRENCY = 1;
11450 | const V60_CACHE_QUERY_BATCH = 80;
11451 | 
11452 | function v60IsoAfter({ days = 0, minutes = 0 } = {}) {

// ...
11588 |     "parcel_key,region_key,rows,status,fetched_at,expires_at,last_error"
11589 |   );
11590 |   return new Map(rows.filter(v60Fresh).map((row) => [row.parcel_key, row]));
11591 | }
11592 | 
11593 | async function v60LoadDetailCache(env, parcelKeys) {
11594 |   const rows = await v60LoadRowsByKeys(
11595 |     env,
11596 |     V60_DETAIL_CACHE_TABLE,
11597 |     "parcel_key",
11598 |     parcelKeys,
11599 |     "parcel_key,region_key,expos_rows,area_rows,status,fetched_at,expires_at,last_error"
11600 |   );
11601 |   return new Map(rows.filter(v60Fresh).map((row) => [row.parcel_key, row]));
11602 | }
11603 | 
11604 | async function v60LoadKaptComplexCache(env, kaptCodes) {
11605 |   const rows = await v60LoadRowsByKeys(
11606 |     env,
11607 |     V60_KAPT_COMPLEX_CACHE_TABLE,
11608 |     "kapt_code",
11609 |     kaptCodes,
11610 |     "kapt_code,bjd_code,list_row,basic_row,detail_row,status,fetched_at,expires_at,last_error"
11611 |   );
11612 |   return new Map(rows.filter(v60Fresh).map((row) => [row.kapt_code, row]));
11613 | }
11614 | 
11615 | async function v60LoadTitleSync(env, regionKey) {
11616 |   const rows = await v60SupabaseGet(env, V60_TITLE_SYNC_TABLE, {
11617 |     region_key: `eq.${regionKey}`,
11618 |     select: "region_key,total_count,page_size,total_pages,completed_pages,complete,status,fetched_at,expires_at,last_error",
11619 |     limit: "1",
11620 |   });
11621 |   const row = rows[0] || null;
11622 |   return row && v60Fresh(row) ? row : null;
11623 | }
11624 | 
11625 | async function v60LoadKaptRegionCache(env, bjdCode) {
11626 |   const rows = await v60SupabaseGet(env, V60_KAPT_REGION_CACHE_TABLE, {
11627 |     bjd_code: `eq.${bjdCode}`,
11628 |     select: "bjd_code,rows,status,fetched_at,expires_at,last_error",
11629 |     limit: "1",
11630 |   });
11631 |   const row = rows[0] || null;
11632 |   return row && v60Fresh(row) ? row : null;
11633 | }
11634 | 
11635 | function v60DedupeTitleRows(rows) {
11636 |   const result = [];
11637 |   const seen = new Set();
11638 |   for (const row of rows || []) {
11639 |     if (!row || typeof row !== "object") continue;
11640 |     const key = buildingRecordKey(row) || JSON.stringify(row);
11641 |     if (seen.has(key)) continue;
11642 |     seen.add(key);
11643 |     result.push(row);
11644 |   }
11645 |   return result;
11646 | }
11647 | 
11648 | function v60ScopeTagTitleRow(row, parcelKey) {
11649 |   return {
11650 |     ...(row || {}),
11651 |     __scopeParcelKeyV20: parcelKey,
11652 |   };
11653 | }
11654 | 

// ...
11684 |       parcel_key: parcelKey,
11685 |       region_key: regionKey,
11686 |       rows: merged,
11687 |       status: merged.length ? "ready" : "empty",
11688 |       fetched_at: now,
11689 |       expires_at: v60IsoAfter({ days: merged.length ? V60_TITLE_CACHE_DAYS : V60_TITLE_EMPTY_CACHE_DAYS }),
11690 |       last_error: null,
11691 |       updated_at: now,
11692 |     };
11693 |   });
11694 |   await v60SupabaseUpsert(env, V60_TITLE_CACHE_TABLE, rows, "parcel_key");
11695 | }
11696 | 
11697 | async function v60FetchTitlePage(env, regionKey, pageNo) {
11698 |   const region = v60RegionParts(regionKey);
11699 |   if (!region) throw httpError(400, `Invalid V60 title region: ${regionKey}`);
11700 |     const variants = kaptRegionCodeVariants(regionKey).filter((value) => /^\d{10}$/.test(value));
11701 |   let firstEmpty = null;
11702 |   let lastError = null;
11703 |   for (const legalCode of variants.length ? variants : [regionKey]) {
11704 |     const variant = v60RegionParts(legalCode);
11705 |     if (!variant) continue;
11706 |     try {
11707 |       const data = await v60FetchBuildingHubJson(
11708 |         BUILDING_HUB_TITLE_URL,
11709 |         { sigunguCd: variant.sigunguCd, bjdongCd: variant.bjdongCd, numOfRows: 1000, pageNo },
11710 |         env,
11711 |         "Building HUB V60 title page",
11712 |         V60_TITLE_PAGE_TIMEOUT_MS
11713 |       );
11714 |       const page = publicDataResponseParts(data, "Building HUB V60 title page");
11715 |       if (page.totalCount > 0 || page.items.length > 0) return page;
11716 |       if (!firstEmpty) firstEmpty = page;
11717 |     } catch (error) {
11718 |       lastError = error;
11719 |     }
11720 |   }
11721 |   if (firstEmpty) return firstEmpty;
11722 |   throw lastError || httpError(502, "Building HUB V60 title page failed");
11723 | }
11724 | 
11725 | async function v60MarkEmptyTitleParcels(env, parcelKeys) {
11726 |   const keys = [...new Set((parcelKeys || []).filter(Boolean))];
11727 |   if (!keys.length) return;
11728 |   const now = new Date().toISOString();

// ...
12026 |   }
12027 |   return v60DedupeTitleRows(rows);
12028 | }
12029 | 
12030 | function v60TitleRowsByParcel(titleCacheMap) {
12031 |   const map = new Map();
12032 |   for (const [parcelKey, cache] of titleCacheMap.entries()) {
12033 |     map.set(parcelKey, v60DedupeTitleRows(
12034 |       (Array.isArray(cache?.rows) ? cache.rows : []).map((row) => v60ScopeTagTitleRow(row, parcelKey))
12035 |     ));
12036 |   }
12037 |   return map;
12038 | }
12039 | 
12040 | async function v60FetchKaptRegion(env, bjdCode) {
12041 |   const rows = [];
12042 |   for (const variant of kaptRegionCodeVariants(bjdCode)) {
12043 |     let total = null;
12044 |     for (let pageNo = 1; pageNo <= 10; pageNo++) {
12045 |       const data = await fetchPublicDataJson(
12046 |         KAPT_LEGAL_DONG_LIST_URL,
12047 |         { bjdCode: variant, pageNo, numOfRows: 1000 },
12048 |         env,
12049 |         "K-APT V60 legal dong list",
12050 |         V60_PUBLIC_TIMEOUT_MS,
12051 |         1
12052 |       );
12053 |       const page = publicDataResponseParts(data, "K-APT V60 legal dong list");
12054 |       if (total == null) total = page.totalCount;
12055 |       rows.push(...page.items);
12056 |       if (!page.items.length || page.items.length < page.numOfRows || pageNo * page.numOfRows >= total) break;
12057 |     }
12058 |   }
12059 |   const seen = new Set();
12060 |   return rows.filter((row) => {
12061 |     const code = kaptCodeOf(row);
12062 |     if (!code || seen.has(code)) return false;
12063 |     seen.add(code);
12064 |     return true;
12065 |   });
12066 | }
12067 | 
12068 | async function v60EnsureKaptRegionLists(env, regionKeys) {
12069 |   const map = new Map();
12070 |   for (const regionKey of [...new Set(regionKeys || [])]) {
12071 |     let cached = await v60LoadKaptRegionCache(env, regionKey);
12072 |     if (!cached) {
12073 |       try {
12074 |         const rows = await v60FetchKaptRegion(env, regionKey);
12075 |         const now = new Date().toISOString();
12076 |         await v60SupabaseUpsert(env, V60_KAPT_REGION_CACHE_TABLE, {
12077 |           bjd_code: regionKey,
12078 |           rows,
12079 |           status: "ready",
12080 |           fetched_at: now,
12081 |           expires_at: v60IsoAfter({ days: V60_KAPT_REGION_CACHE_DAYS }),
12082 |           last_error: null,
12083 |           updated_at: now,
12084 |         }, "bjd_code");
12085 |         cached = { bjd_code: regionKey, rows, status: "ready", expires_at: v60IsoAfter({ days: V60_KAPT_REGION_CACHE_DAYS }) };
12086 |       } catch (error) {
12087 |         const now = new Date().toISOString();
12088 |         await v60SupabaseUpsert(env, V60_KAPT_REGION_CACHE_TABLE, {
12089 |           bjd_code: regionKey,
12090 |           rows: [],
12091 |           status: "error",
12092 |           fetched_at: now,
12093 |           expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }),
12094 |           last_error: String(error?.message || error),
12095 |           updated_at: now,
12096 |         }, "bjd_code");
12097 |         cached = { bjd_code: regionKey, rows: [], status: "error", last_error: String(error?.message || error), expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }) };
12098 |       }
12099 |     }
12100 |     map.set(regionKey, cached);
12101 |   }
12102 |   return map;
12103 | }
12104 | 
12105 | function v60RawNameText(value) {
12106 |   return cleanBuildingText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
12107 | }
12108 | 
12109 | // V63: K-APT는 같은 대단지를 2-1차/2-2차처럼 별도 관리단지로 나누고,
12110 | // 목록명에서 하이픈을 "다시"로 표기하는 경우가 있다. 건축물대장은 이들을
12111 | // "성호2차아파트"처럼 하나의 단지명으로 보유할 수 있으므로, 일반 이름 비교와 별도로
12112 | // split-phase family 이름을 만든다. 이 보정은 후보 생성/결속에만 사용하고 주소/법정동
12113 | // 검증은 기존 로직을 그대로 거친다.
12114 | function v63KaptFamilyName(value) {
12115 |   const source = cleanBuildingText(value)
12116 |     .toLowerCase()

// ...
12137 |   if (match) {
12138 |     return {
12139 |       base: match[1].replace(/-/g, ""),
12140 |       split: true,
12141 |       phase: match[2],
12142 |     };
12143 |   }
12144 | 
12145 |   return {
12146 |     base: source.replace(/-/g, ""),
12147 |     split: false,
12148 |     phase: "",
12149 |   };
12150 | }
12151 | 
12152 | function v60KaptCandidateScore(listRow, candidateNames) {
12153 |   const listNameRaw = v60RawNameText(kaptNameOf(listRow));
12154 |   const listNameCompact = compactBuildingMatchText(kaptNameOf(listRow));
12155 |   const listFamily = v63KaptFamilyName(kaptNameOf(listRow));
12156 |   let best = 0;
12157 |   for (const name of candidateNames || []) {
12158 |     const raw = v60RawNameText(name);
12159 |     const compact = compactBuildingMatchText(name);
12160 |     const candidateFamily = v63KaptFamilyName(name);
12161 |     if (!raw && !compact) continue;
12162 |     if (raw && listNameRaw && raw === listNameRaw) best = Math.max(best, 140);
12163 |     if (compact && listNameCompact && compact === listNameCompact) best = Math.max(best, 130);
12164 |     if (compact && listNameCompact && (compact.includes(listNameCompact) || listNameCompact.includes(compact))) {
12165 |       const minLen = Math.min(compact.length, listNameCompact.length);
12166 |       best = Math.max(best, minLen >= 4 ? 95 : minLen >= 2 ? 55 : 0);
12167 |     }
12168 | 
12169 |     // V63 split-complex rescue: 같은 법정동의 제목 단지명과 family 이름이 정확히 같고
12170 |     // K-APT 쪽이 실제 분할단지 표기를 가진 경우만 후보로 추가한다.
12171 |     if (
12172 |       listFamily.split &&
12173 |       listFamily.base &&
12174 |       candidateFamily.base &&
12175 |       listFamily.base === candidateFamily.base &&
12176 |       listFamily.base.length >= 4
12177 |     ) {
12178 |       best = Math.max(best, 105);
12179 |     }
12180 |   }
12181 |   return best;
12182 | }
12183 | 
12184 | function v60KaptCandidateRows(kaptRegionMap, titleRows, verifiedScopeParcels) {
12185 |   const namesByRegion = new Map();
12186 |   const pushName = (regionKey, name) => {
12187 |     const value = cleanBuildingText(name);
12188 |     if (!regionKey || !value) return;
12189 |     if (!namesByRegion.has(regionKey)) namesByRegion.set(regionKey, new Set());
12190 |     namesByRegion.get(regionKey).add(value);
12191 |   };
12192 | 
12193 |   for (const row of titleRows || []) {
12194 |     if (!v60Classification(row).apartment) continue;
12195 |     const parcel = buildingParcelDescriptor(row);
12196 |     if (!parcel) continue;
12197 |     pushName(`${parcel.sigunguCd}${parcel.bjdongCd}`, row?.bldNm ?? row?.bld_nm);
12198 |   }
12199 |   for (const entry of verifiedScopeParcels.map.values()) {
12200 |     const regionKey = scopeParcelLegalDongCodeV48(entry);
12201 |     for (const name of scopeParcelBuildingNamesV48(entry)) {
12202 |       if (/아파트|주상복합|오피스텔/.test(name.replace(/\s+/g, ""))) pushName(regionKey, name);
12203 |     }
12204 |   }
12205 | 
12206 |   const scored = [];
12207 |   for (const [regionKey, cache] of kaptRegionMap.entries()) {
12208 |     const names = [...(namesByRegion.get(regionKey) || [])];
12209 |     if (!names.length) continue;
12210 |     for (const row of Array.isArray(cache?.rows) ? cache.rows : []) {
12211 |       const score = v60KaptCandidateScore(row, names);
12212 |       if (score <= 0) continue;
12213 |       scored.push({ row, score, regionKey });
12214 |     }
12215 |   }
12216 |   scored.sort((a, b) => b.score - a.score);
12217 |   const out = [];
12218 |   const seen = new Set();
12219 |   for (const item of scored) {
12220 |     const code = kaptCodeOf(item.row);
12221 |     if (!code || seen.has(code)) continue;
12222 |     seen.add(code);
12223 |     out.push(item.row);
12224 |     if (out.length >= 32) break;
12225 |   }
12226 |   return out;
12227 | }
12228 | 
12229 | async function v60EnsureKaptComplexInfo(env, candidateRows) {
12230 |   const codes = [...new Set((candidateRows || []).map(kaptCodeOf).filter(Boolean))];
12231 |   let cacheMap = await v60LoadKaptComplexCache(env, codes);
12232 |   let missing = codes.filter((code) => !cacheMap.has(code));
12233 |   if (missing.length) {
12234 |     const listByCode = new Map(candidateRows.map((row) => [kaptCodeOf(row), row]));
12235 |     const batch = missing.slice(0, V60_KAPT_COMPLEX_BATCH);
12236 |     const results = await mapBuildingWithConcurrency(
12237 |       batch,
12238 |       V60_KAPT_COMPLEX_CONCURRENCY,
12239 |       async (code) => {
12240 |         const listRow = listByCode.get(code) || { kaptCode: code };
12241 |         try {
12242 |           const info = await fetchKaptComplexInfo(env, listRow);
12243 |           return { code, listRow, info, error: null };
12244 |         } catch (error) {
12245 |           return { code, listRow, info: null, error: String(error?.message || error) };
12246 |         }
12247 |       }
12248 |     );
12249 |     const now = new Date().toISOString();
12250 |     const writes = results.map((result) => ({
12251 |       kapt_code: result.code,
12252 |       bjd_code: kaptLegalDongCodeV48(result.listRow) || null,
12253 |       list_row: result.listRow || {},
12254 |       basic_row: result.info?.basic || {},
12255 |       detail_row: result.info?.detail || {},
12256 |       status: result.error ? "error" : "ready",
12257 |       fetched_at: now,
12258 |       expires_at: result.error
12259 |         ? v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES })
12260 |         : v60IsoAfter({ days: V60_KAPT_COMPLEX_CACHE_DAYS }),
12261 |       last_error: result.error || null,
12262 |       updated_at: now,
12263 |     }));
12264 |     if (writes.length) await v60SupabaseUpsert(env, V60_KAPT_COMPLEX_CACHE_TABLE, writes, "kapt_code");
12265 |     cacheMap = await v60LoadKaptComplexCache(env, codes);
12266 |     missing = codes.filter((code) => !cacheMap.has(code));
12267 |   }
12268 |   return {
12269 |     complete: missing.length === 0,
12270 |     cacheMap,
12271 |     codes,
12272 |     missing,
12273 |     evidence: codes.filter((code) => cacheMap.has(code)).map((code) => ({
12274 |       kaptCode: code,
12275 |       status: cacheMap.get(code)?.status || "ready",
12276 |     })),
12277 |   };
12278 | }
12279 | 
12280 | function v60CombinedKaptRow(cacheRow) {
12281 |   return {
12282 |     ...(cacheRow?.list_row || {}),
12283 |     ...(cacheRow?.basic_row || {}),
12284 |     ...(cacheRow?.detail_row || {}),
12285 |     kaptCode: cacheRow?.kapt_code || kaptCodeOf(cacheRow?.list_row || {}),
12286 |   };
12287 | }
12288 | 
12289 | function v60BestScopeKaptMatch(combinedRow, verifiedScopeParcels) {
12290 |   let best = null;
12291 |   for (const entry of verifiedScopeParcels.map.values()) {
12292 |     const candidate = kaptScopeParcelCandidateV48(combinedRow, entry);
12293 |     if (!candidate) continue;
12294 |     const compactName = compactBuildingMatchText(kaptNameOf(combinedRow));
12295 |     const strongLongName = candidate.nameExact && compactName.length >= 4;
12296 |     if (!candidate.strongAddress && !strongLongName) continue;
12297 |     if (!best || candidate.score > best.score) best = candidate;
12298 |   }
12299 |   return best;
12300 | }
12301 | 
12302 | function v63KaptFamilyTitleMatch(complex, titleRows) {
12303 |   const kaptFamily = v63KaptFamilyName(kaptNameOf(complex));
12304 |   if (!kaptFamily.split || !kaptFamily.base || kaptFamily.base.length < 4) return null;
12305 | 
12306 |   const candidates = [];
12307 |   for (const row of titleRows || []) {
12308 |     const classification = v60Classification(row);
12309 |     if (!classification.apartment) continue;
12310 | 
12311 |     const titleFamily = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
12312 |     if (!titleFamily.base || titleFamily.base !== kaptFamily.base) continue;
12313 | 
12314 |     const parcel = buildingParcelDescriptor(row);
12315 |     if (!parcel) continue;
12316 |     const addressEvidence = kaptFallbackAddressEvidence(complex, row);
12317 |     candidates.push({ row, parcel, addressEvidence });
12318 |   }
12319 |   if (!candidates.length) return null;
12320 | 
12321 |   const uniqueParcels = new Set(candidates.map((item) => item.parcel.key));
12322 |   let best = null;
12323 |   for (const item of candidates) {
12324 |     const evidence = item.addressEvidence;
12325 |     const hasAddressEvidence = evidence.parcelNumberMatch || evidence.exact || evidence.numberMatch;
12326 | 
12327 |     // family 이름만으로는 다른 단지를 잘못 결속할 수 있으므로, 같은 family의 제목 필지가
12328 |     // scope 안에서 하나뿐이거나 주소/지번 증거가 있을 때만 허용한다.
12329 |     if (uniqueParcels.size > 1 && !hasAddressEvidence) continue;
12330 | 
12331 |     let score = uniqueParcels.size === 1 ? 120 : 105;
12332 |     const reasons = ["split_family_exact"];
12333 |     if (evidence.parcelExact) { score += 120; reasons.push("parcel_exact"); }
12334 |     else if (evidence.parcelNumberMatch) { score += 90; reasons.push("parcel_number"); }
12335 |     else if (evidence.exact) { score += 80; reasons.push("address_exact"); }
12336 |     else if (evidence.numberMatch) { score += 45; reasons.push("address_number"); }
12337 | 
12338 |     const candidate = {
12339 |       row: item.row,
12340 |       score,
12341 |       reason: reasons.join("+"),
12342 |       titleKey: buildingRecordKey(item.row),
12343 |       parcelKey: item.parcel.key,
12344 |       buildingName: cleanBuildingText(item.row?.bldNm ?? item.row?.bld_nm) || "",
12345 |       titleAddress: buildingRecordAddresses(item.row).preferredAddress || "",
12346 |     };
12347 |     if (!best || candidate.score > best.score) best = candidate;
12348 |   }
12349 |   return best;
12350 | }
12351 | 
12352 | function v63SplitKaptBindingKey(match) {
12353 |   const kaptFamily = v63KaptFamilyName(
12354 |     match?.normalized?.name || kaptNameOf(match?.combined || {}) || kaptNameOf(match?.listRow || {})
12355 |   );
12356 |   const titleFamily = v63KaptFamilyName(match?.titleRow?.bldNm ?? match?.titleRow?.bld_nm ?? "");
12357 |   if (
12358 |     kaptFamily.split &&
12359 |     kaptFamily.base &&
12360 |     titleFamily.base &&
12361 |     kaptFamily.base === titleFamily.base
12362 |   ) {
12363 |     // 분할 관리단지는 같은 건축물대장 titleKey로 결속되더라도 서로 다른 K-APT 코드의
12364 |     // 공식 세대수를 모두 보존한다. 후보 자체는 code 기준으로 이미 중복 제거되어 있다.
12365 |     return `${match.parcelKey}|split-family:${kaptFamily.base}|kapt:${match.kaptCode}`;
12366 |   }
12367 |   return "";
12368 | }
12369 | 
12370 | function v60BuildKaptMatches(candidateRows, complexCacheMap, titleRows, verifiedScopeParcels) {
12371 |   const matches = [];
12372 |   for (const listRow of candidateRows || []) {
12373 |     const code = kaptCodeOf(listRow);
12374 |     const cache = complexCacheMap.get(code);
12375 |     if (!cache || cache.status !== "ready") continue;
12376 |     const info = {
12377 |       list: { ...listRow, ...(cache.list_row || {}) },
12378 |       basic: cache.basic_row || {},
12379 |       detail: cache.detail_row || {},
12380 |       diagnostics: null,
12381 |     };
12382 |     const combined = v60CombinedKaptRow(cache);
12383 |     const normalized = normalizedKaptInfo(info, null);
12384 |     if (normalized.households <= 0) continue;
12385 | 
12386 |     const titleMatch =
12387 |       kaptFallbackTitleMatch(combined, titleRows) ||
12388 |       v63KaptFamilyTitleMatch(combined, titleRows);
12389 |     const scopeMatch = v60BestScopeKaptMatch(combined, verifiedScopeParcels);
12390 |     let chosen = null;
12391 |     if (titleMatch) {
12392 |       chosen = {
12393 |         parcelKey: titleMatch.parcelKey,
12394 |         titleKey: titleMatch.titleKey,
12395 |         score: titleMatch.score + 50,
12396 |         reason: `title:${titleMatch.reason}`,
12397 |         titleRow: titleMatch.row,
12398 |       };
12399 |     }
12400 |     if (scopeMatch && (!chosen || scopeMatch.score > chosen.score)) {
12401 |       chosen = {
12402 |         parcelKey: scopeMatch.parcelKey,
12403 |         titleKey: "",
12404 |         score: scopeMatch.score,
12405 |         reason: `scope:${scopeMatch.reason}`,
12406 |         titleRow: null,
12407 |       };
12408 |     }
12409 |     if (!chosen?.parcelKey) continue;
12410 |     matches.push({
12411 |       kaptCode: code,
12412 |       listRow,
12413 |       cache,
12414 |       combined,
12415 |       normalized,
12416 |       ...chosen,
12417 |     });
12418 |   }
12419 | 
12420 |   const bestByBinding = new Map();
12421 |   for (const match of matches) {
12422 |     const splitBinding = v63SplitKaptBindingKey(match);
12423 |     const binding = splitBinding || match.titleKey || `${match.parcelKey}|${compactBuildingMatchText(match.normalized.name)}`;
12424 |     const prior = bestByBinding.get(binding);
12425 |     if (!prior || match.score > prior.score) bestByBinding.set(binding, match);
12426 |   }
12427 |   return [...bestByBinding.values()];
12428 | }
12429 | 
12430 | function v60TitleCoveredByKapt(row, kaptMatches) {
12431 |   const key = buildingRecordKey(row);
12432 |   const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
12433 |   const classification = v60Classification(row);
12434 |   if (!classification.apartment) return null;
12435 |   const titleName = compactBuildingMatchText(row?.bldNm ?? row?.bld_nm);
12436 |   for (const match of kaptMatches || []) {
12437 |     if (match.titleKey && match.titleKey === key) return match;
12438 |     if (!parcelKey || match.parcelKey !== parcelKey) continue;
12439 |     const kaptName = compactBuildingMatchText(match.normalized?.name || kaptNameOf(match.combined));
12440 |     if (!titleName || !kaptName) return match;
12441 |     if (titleName === kaptName) return match;
12442 |     if (Math.min(titleName.length, kaptName.length) >= 4 && (titleName.includes(kaptName) || kaptName.includes(titleName))) return match;
12443 | 
12444 |     // V63 split-complex rescue: 분할 K-APT(예: 2-1차/2-2차)가 건축물대장에서는
12445 |     // 하나의 umbrella 단지명으로 묶여 있으면 같은 필지의 모든 아파트 동을 K-APT가
12446 |     // 덮는 것으로 본다. 그렇지 않으면 한두 개 titleKey만 덮여 나머지 hhldCnt가 중복 합산된다.
12447 |     const titleFamily = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
12448 |     const kaptFamily = v63KaptFamilyName(match.normalized?.name || kaptNameOf(match.combined));
12449 |     if (
12450 |       kaptFamily.split &&
12451 |       titleFamily.base &&
12452 |       kaptFamily.base &&
12453 |       titleFamily.base === kaptFamily.base
12454 |     ) return match;
12455 | 
12456 |     if (!match.titleKey) return match;
12457 |   }
12458 |   return null;
12459 | }
12460 | 
12461 | function v63TitleKaptFamilyKey(row) {
12462 |   const parcel = buildingParcelDescriptor(row);
12463 |   const family = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
12464 |   if (!parcel || !family.base) return "";
12465 |   return `${parcel.sigunguCd}${parcel.bjdongCd}|${family.base}`;
12466 | }
12467 | 
12468 | function v63KaptMatchFamilyKey(match) {
12469 |   const titleKey = v63TitleKaptFamilyKey(match?.titleRow || {});
12470 |   if (titleKey) return titleKey;
12471 | 
12472 |   const combined = match?.combined || match?.listRow || {};
12473 |   const code = kaptLegalDongCodeV48(combined);
12474 |   const family = v63KaptFamilyName(match?.normalized?.name || kaptNameOf(combined));
12475 |   if (!code || !family.base) return "";
12476 |   return `${code}|${family.base}`;
12477 | }
12478 | 
12479 | function v63TitleBelongsToKaptFamily(row, kaptMatches) {
12480 |   const familyKey = v63TitleKaptFamilyKey(row);
12481 |   if (!familyKey) return false;
12482 |   return (kaptMatches || []).some((match) => v63KaptMatchFamilyKey(match) === familyKey);
12483 | }
12484 | 
12485 | function v63IsCollectiveTitle(row) {
12486 |   return cleanBuildingText(
12487 |     publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")
12488 |   ).includes("집합");
12489 | }
12490 | 
12491 | function v60NeedsDetailForTitle(row, kaptMatches) {
12492 |   if (!row || isAncillaryBuildingRecord(row)) return false;
12493 |   const classification = v60Classification(row);
12494 |   const explicit = buildingExplicitUnitEvidence(row, classification);
12495 |   const collective = v63IsCollectiveTitle(row);
12496 | 
12497 |   // V63: K-APT로 확인된 아파트와 같은 단지 family의 집합 상가/근생/혼합동은
12498 |   // 표제부 hoCnt가 양수여도 전유부를 먼저 확인한다. 별도 필지(예: 본번-2)의 상가동도
12499 |   // 같은 법정동 + 단지 family가 일치하면 이 경로를 탄다.
12500 |   if (
12501 |     collective &&
12502 |     v63TitleBelongsToKaptFamily(row, kaptMatches) &&
12503 |     (v62ApartmentShopNameHint(row) || classification.commercial || classification.mixedUse)
12504 |   ) {
12505 |     return true;
12506 |   }
12507 | 
12508 |   // V61: 전유부/전유공용면적은 집합건축물에서만 호 단위 상세근거로 사용한다.
12509 |   // 일반건축물의 '단독/다가구 + 근린생활시설' 혼합건물은 해당 API가 0건을 반환하는 경우가 많으므로
12510 |   // fmlyCnt/hhldCnt 같은 표제부의 명시적 주거 가구수를 그대로 사용하고 불필요한 상세호출을 하지 않는다.
12511 |   if (classification.apartment && v60TitleCoveredByKapt(row, kaptMatches)) {
12512 |     return classification.mixedUse && collective;
12513 |   }
12514 |   if (classification.mixedUse) return collective;
12515 |   if (classification.officetel && explicit.units <= 0) return true;
12516 |   if (classification.apartment && explicit.units <= 0) return true;
12517 |   if (classification.commercial && collective && explicit.units <= 0) return true;
12518 |   if (classification.residential && collective && explicit.units <= 0) return true;
12519 |   if (!classification.residential && !classification.commercial && collective) return true;
12520 |   return false;
12521 | }
12522 | 
12523 | function v60DetermineDetailParcels(titleRowsByParcel, kaptMatches) {
12524 |   const selected = new Set();
12525 |   const commercialKaptFamilies = new Set();
12526 | 
12527 |   // 1차: 기존 상세조회 조건 + K-APT 단지의 별도 집합 상가/근생 필지를 찾는다.
12528 |   for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
12529 |     for (const row of rows || []) {
12530 |       if (v60NeedsDetailForTitle(row, kaptMatches)) selected.add(parcelKey);
12531 | 
12532 |       const classification = v60Classification(row);
12533 |       if (
12534 |         v63IsCollectiveTitle(row) &&
12535 |         v63TitleBelongsToKaptFamily(row, kaptMatches) &&
12536 |         (classification.commercial || classification.mixedUse || v62ApartmentShopNameHint(row))
12537 |       ) {
12538 |         const familyKey = v63TitleKaptFamilyKey(row);
12539 |         if (familyKey) commercialKaptFamilies.add(familyKey);
12540 |       }
12541 |     }
12542 |   }
12543 | 
12544 |   // 2차: 같은 K-APT 단지에 별도 상가/근생 필지가 실제로 존재하면 아파트 본필지도
12545 |   // 전유부를 확인한다. K-APT가 주거 세대수는 담당하므로 주거 전유호는 이중계산되지 않고,
12546 |   // 본필지 안에 숨어 있는 상업 전유호만 추가로 복구된다.
12547 |   if (commercialKaptFamilies.size) {
12548 |     for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
12549 |       const shouldInspectApartmentParcel = (rows || []).some((row) => {
12550 |         const classification = v60Classification(row);
12551 |         if (!classification.apartment) return false;
12552 |         if (!v60TitleCoveredByKapt(row, kaptMatches)) return false;
12553 |         const familyKey = v63TitleKaptFamilyKey(row);
12554 |         return !!familyKey && commercialKaptFamilies.has(familyKey);
12555 |       });
12556 |       if (shouldInspectApartmentParcel) selected.add(parcelKey);
12557 |     }
12558 |   }
12559 | 
12560 |   return [...selected];
12561 | }
12562 | 
12563 | function v65FloorClassForOverviewRow(row) {
12564 |   const use = floorOverviewUseText(row).replace(/\s+/g, "");
12565 |   if (!use) return null;
12566 |   const residential = /오피스텔|아파트|공동주택|연립주택|다세대주택|단독주택|다가구주택|다중주택|도시형생활주택|기숙사|주택/.test(use);
12567 |   const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|업무시설/.test(use);
12568 |   if (commercial && !residential) return "commercial";
12569 |   if (residential && !commercial) return "residential";
12570 |   return null;
12571 | }
12572 | 
12573 | function v65FloorEvidenceKeys(row) {
12574 |   const buildingPk = cleanBuildingText(publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk"));
12575 |   const dong = normalizeDeliveryUnitName(unitDongName(row));
12576 |   const floor = normalizeFloorIdentityV29(unitFloorName(row));
12577 |   const keys = [];
12578 |   if (buildingPk && floor) keys.push(`PK:${buildingPk}|F:${floor}`);
12579 |   if (dong && floor) keys.push(`D:${dong}|F:${floor}`);
12580 |   return keys;

// ...
12748 |   if (ho) return [bld || "BLD", dong || "DONG", floor || "FLOOR", ho].join("|");
12749 |   const pk = cleanBuildingText(publicDataField(row, "mgmHoDetlPk", "mgm_ho_detl_pk", "mgmBldrgstPk", "mgm_bldrgst_pk"));
12750 |   if (pk) return `PK:${pk}`;
12751 |   return `ROW:${index}:${bld}:${dong}:${floor}`;
12752 | }
12753 | 
12754 | function v62ApartmentShopNameHint(row) {
12755 |   const dongName = cleanBuildingText(
12756 |     publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
12757 |   ).replace(/\s+/g, "");
12758 | 
12759 |   // 구축 공동주택 대장은 상가동의 주용도를 "공동주택"으로 잘못 남긴 사례가 많다.
12760 |   // 동명 자체에 상가/근린생활시설이 명시된 경우에만 상가 전용동으로 인정한다.
12761 |   return !!dongName && /상가|근린생활시설/.test(dongName);
12762 | }
12763 | 
12764 | function v62ParcelHasKaptMatch(row, kaptMatches) {
12765 |   const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
12766 |   if (!parcelKey) return false;
12767 |   return (kaptMatches || []).some((match) => cleanBuildingText(match?.parcelKey) === cleanBuildingText(parcelKey));
12768 | }
12769 | 
12770 | function v60Classification(row) {
12771 |   const base = buildingHousingClassification(row);
12772 |   const purpose = buildingPurposeText(row).replace(/\s+/g, "");
12773 | 
12774 |   // V62 hotfix: K-APT가 주거 세대수를 담당하더라도 "상가동/상가/근린생활시설동"은
12775 |   // 별도 배송호수다. 목적코드가 공동주택으로 남아 있어도 동명이라는 직접 증거를 우선한다.
12776 |   if (v62ApartmentShopNameHint(row)) {
12777 |     return {
12778 |       ...base,
12779 |       apartment: false,
12780 |       officetel: false,
12781 |       residential: false,
12782 |       commercial: true,
12783 |       mixedUse: false,
12784 |       housingType: "commercial",
12785 |     };
12786 |   }
12787 |   const explicitResidential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
12788 |   const explicitCommercial = /근린생활시설|판매시설|사무소|상점|점포|소매점|음식점|의료시설|병원|의원|약국|교육연구시설|학원|숙박시설|호텔|모텔|업무시설/.test(purpose);
12789 |   // V62: mainPurps가 근린생활시설이어도 etcPurps에 주택/다가구가 명시되면 실제 혼합건물이다.
12790 |   // 기존에는 이런 행이 commercial-only가 되어 fmlyCnt가 상가호수로 들어가거나 주거가 누락됐다.
12791 |   if (explicitResidential && explicitCommercial && !base.officetel) {
12792 |     return { ...base, apartment: base.apartment === true, residential: true, commercial: true, mixedUse: true, housingType: "mixed" };
12793 |   }
12794 |   if (explicitCommercial && !explicitResidential && !base.officetel) {
12795 |     return { ...base, apartment: false, residential: false, commercial: true, mixedUse: false, housingType: "commercial" };

// ...
12849 |   return sameClass.length === 1 ? sameClass[0] : null;
12850 | }
12851 | 
12852 | function v60ElevatorStatusFromTitle(row) {
12853 |   const info = buildingElevatorInfo(row);
12854 |   if (info.hasElevator) return { status: "yes", info, reason: "title_positive" };
12855 |   if (info.explicitZero) return { status: "no", info, reason: "title_zero" };
12856 |   return { status: "unknown", info, reason: "title_unknown" };
12857 | }
12858 | 
12859 | function v60KaptElevatorStatus(match, titleRowsByParcel) {
12860 |   const info = match?.normalized || {};
12861 |   const titles = v60RelevantTitles(titleRowsByParcel.get(match?.parcelKey) || [])
12862 |     .filter((row) => v60Classification(row).apartment && v60TitleCoveredByKapt(row, [match]));
12863 |   const positiveTitle = titles.find((row) => buildingElevatorInfo(row).hasElevator);
12864 |   if (Number(info.elevatorCount || 0) > 0) {
12865 |     return { status: "yes", reason: "kapt_positive", elevatorCount: Number(info.elevatorCount || 0) };
12866 |   }
12867 |   if (positiveTitle) {
12868 |     const titleInfo = buildingElevatorInfo(positiveTitle);
12869 |     return { status: "yes", reason: "title_positive_counterevidence", elevatorCount: titleInfo.total };
12870 |   }
12871 |   if (info.elevatorKnown === true) {
12872 |     const allKnownZero = titles.length === 0 || titles.every((row) => buildingElevatorInfo(row).explicitZero);
12873 |     if (allKnownZero) return { status: "no", reason: "kapt_zero", elevatorCount: 0 };
12874 |   }
12875 |   const knownTitle = titles.map(v60ElevatorStatusFromTitle).find((item) => item.status !== "unknown");
12876 |   if (knownTitle) return { ...knownTitle, elevatorCount: knownTitle.info?.total || 0 };
12877 |   return { status: "unknown", reason: "kapt_unknown", elevatorCount: 0 };
12878 | }
12879 | 
12880 | function v60ClassificationBucket(classification) {
12881 |   if (classification?.residential && !classification?.commercial) return "residential";
12882 |   if (classification?.commercial && !classification?.residential) return "commercial";
12883 |   if (classification?.residential && classification?.commercial) return "mixed";
12884 |   return "unclassified";
12885 | }
12886 | 
12887 | function v62ResolvedClassificationBucket(row, classification) {
12888 |   const direct = v60ClassificationBucket(classification);
12889 |   if (direct === "residential" || direct === "commercial") return direct;
12890 | 
12891 |   // 기존 "용도 미분류"에는 실제로 용도 데이터가 있는 행도 섞여 있었다.
12892 |   // 수량 자체는 건드리지 않고, 주용도(없으면 전체 용도 문자열)가 한쪽으로 명확할 때만
12893 |   // 주거/상업 버킷을 결정한다. 혼합/빈 용도는 계속 unclassified로 남긴다.
12894 |   const mainPurpose = cleanBuildingText(
12895 |     publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm")
12896 |   ).replace(/\s+/g, "");
12897 |   const purpose = (mainPurpose || cleanBuildingText(buildingPurposeText(row)).replace(/\s+/g, ""));
12898 |   if (!purpose) return direct;
12899 | 
12900 |   const residential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
12901 |   const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|영유아보육시설|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|위험물저장및처리시설|장례시설|업무시설/.test(purpose);
12902 | 
12903 |   if (commercial && !residential) return "commercial";
12904 |   if (residential && !commercial) return "residential";
12905 |   return direct;
12906 | }
12907 | 
12908 | function v61MixedTitleExplicitSplit(row, classification) {
12909 |   const household = firstPositiveBuildingInteger(
12910 |     row?.hhldCnt, row?.hhld_cnt, row?.householdCnt, row?.household_count,
12911 |     row?.hshldCnt, row?.hshld_cnt, row?.totHhldCnt, row?.tot_hhld_cnt
12912 |   );
12913 |   const family = firstPositiveBuildingInteger(
12914 |     row?.fmlyCnt, row?.fmly_cnt, row?.familyCnt, row?.family_count, row?.fmlyCo, row?.fmly_co
12915 |   );
12916 |   const ho = firstPositiveBuildingInteger(
12917 |     row?.hoCnt, row?.ho_cnt, row?.hoCount, row?.ho_count,
12918 |     row?.unitCnt, row?.unit_cnt, row?.unitCount, row?.unit_count, row?.roomCnt, row?.room_cnt
12919 |   );
12920 | 
12921 |   const purposeHint = v62PurposeResidentialCountHint(row);
12922 |   // V62: 국토부 표제부에서 fmlyCnt와 etcPurps의 괄호 가구수가 서로 다른 실제 사례가 있다.
12923 |   // 예: 다가구주택(4가구)인데 fmlyCnt=3. 둘 중 큰 명시값을 사용한다.
12924 |   const residential = classification?.residential ? Math.max(household, family, purposeHint) : 0;
12925 |   // hoCnt가 주거 가구수보다 큰 경우에만 그 차이를 비주거 호수로 볼 수 있다.
12926 |   // 값이 없으면 상가 호수를 임의 추정하지 않는다.
12927 |   const commercial = classification?.commercial && ho > residential ? ho - residential : 0;
12928 |   return { residential, commercial, household, family, ho, purposeHint };
12929 | }
12930 | 
12931 | 
12932 | function v66PermitWelfareText(row) {
12933 |   return [
12934 |     publicDataField(row,
12935 |       "wlfarLotouFcKindCdNm", "wlfar_lotou_fc_kind_cd_nm",
12936 |       "wlfarLotouFcKindNm", "wlfar_lotou_fc_kind_nm",
12937 |       "wlfarFcKindCdNm", "wlfar_fc_kind_cd_nm",
12938 |       "wlfarFcKindNm", "wlfar_fc_kind_nm"

// ...
13005 |   return {
13006 |     parcelKey: buildingParcelDescriptor(row)?.key || null,
13007 |     buildingName: cleanBuildingText(publicDataField(row, "bldNm", "bld_nm")) || null,
13008 |     facility: cleanBuildingText(publicDataField(
13009 |       row,
13010 |       "wlfarLotouFcKindCdNm", "wlfar_lotou_fc_kind_cd_nm",
13011 |       "wlfarLotouFcKindNm", "wlfar_lotou_fc_kind_nm",
13012 |       "wlfarFcKindCdNm", "wlfar_fc_kind_cd_nm"
13013 |     )) || null,
13014 |     purpose: cleanBuildingText(publicDataField(row, "purpsCdNm", "purps_cd_nm", "etcPurps", "etc_purps")) || null,
13015 |     area: Number(publicDataField(row, "area", "facilityArea", "facility_area")) || 0,
13016 |     count: v66PermitWelfareCurrentCount(row),
13017 |     addressable: v66PermitWelfareIsAddressable(row),
13018 |   };
13019 | }
13020 | 
13021 | async function v66FetchHousingPermitWelfareEvidence(env, kaptMatches) {
13022 |   const targets = new Map();
13023 |   for (const match of kaptMatches || []) {
13024 |     const familyKey = v63KaptMatchFamilyKey(match);
13025 |     const parcelKey = cleanBuildingText(match?.parcelKey);
13026 |     const parcel = buildingParcelKeyPartsV51(parcelKey);
13027 |     if (!familyKey || !parcelKey || !parcel) continue;
13028 |     const targetKey = `${familyKey}|${parcelKey}`;
13029 |     if (!targets.has(targetKey)) {
13030 |       targets.set(targetKey, {
13031 |         targetKey,
13032 |         familyKey,
13033 |         parcelKey,
13034 |         parcel,
13035 |         complexNames: new Set(),
13036 |       });
13037 |     }
13038 |     const target = targets.get(targetKey);
13039 |     const name = cleanBuildingText(match?.normalized?.name || kaptNameOf(match?.combined || {}));
13040 |     if (name) target.complexNames.add(name);
13041 |   }
13042 | 
13043 |   const results = await mapBuildingWithConcurrency(
13044 |     [...targets.values()],
13045 |     V66_HSPMS_CONCURRENCY,
13046 |     async (target) => {
13047 |       const [welfare, management] = await Promise.allSettled([
13048 |         v60FetchParcelRows(
13049 |           env,
13050 |           HOUSING_PERMIT_WELFARE_LOTOUT_URL,
13051 |           "Housing permit V66 welfare lot-out facility",
13052 |           target.parcel,
13053 |           { maxPages: V66_HSPMS_MAX_PAGES, maxVariants: 3, timeoutMs: V66_HSPMS_TIMEOUT_MS, pageConcurrency: 1 }
13054 |         ),
13055 |         v60FetchParcelRows(
13056 |           env,
13057 |           HOUSING_PERMIT_MGM_COOP_WELFARE_URL,
13058 |           "Housing permit V66 management common welfare facility",
13059 |           target.parcel,
13060 |           { maxPages: 5, maxVariants: 3, timeoutMs: V66_HSPMS_TIMEOUT_MS, pageConcurrency: 1 }
13061 |         ),
13062 |       ]);
13063 | 
13064 |       return {
13065 |         ...target,
13066 |         complexNames: [...target.complexNames],
13067 |         welfareRows: welfare.status === "fulfilled" ? welfare.value.rows || [] : [],

// ...
13120 |       sampleRows: rows.slice(0, 20).map(v66SummarizePermitWelfareRow),
13121 |     };
13122 |   });
13123 | 
13124 |   return {
13125 |     families: familyEvidence,
13126 |     errors: [...new Set(errors)],
13127 |     diagnosticErrors: [...new Set(diagnosticErrors)],
13128 |     requestedFamilyCount: familyEvidence.length,
13129 |     welfareRowCount: familyEvidence.reduce((sum, item) => sum + item.welfareRowCount, 0),
13130 |     explicitCommercialCount: familyEvidence.reduce((sum, item) => sum + item.commercialCount, 0),
13131 |   };
13132 | }
13133 | 
13134 | function v60CreateAggregate() {
13135 |   return {
13136 |     householdCount: 0,
13137 |     apartmentHouseholdCount: 0,
13138 |     nonApartmentHouseholdCount: 0,
13139 |     unknownHouseholdCount: 0,
13140 |     residentialUnitCount: 0,
13141 |     commercialUnitCount: 0,
13142 |     unclassifiedUnitCount: 0,
13143 |     deliveryUnitCount: 0,
13144 |     residentialBuildingUnitCount: 0,
13145 |     commercialBuildingUnitCount: 0,
13146 |     mixedUseBuildingCount: 0,
13147 |     exclusiveUnitRecordCount: 0,
13148 |     commonAreaRecordCount: 0,
13149 |     confirmedElevatorUnitCount: 0,
13150 |     inferredElevatorUnitCount: 0,
13151 |     noElevatorUnitCount: 0,
13152 |     unknownElevatorUnitCount: 0,
13153 |     residentialElevatorUnitCount: 0,
13154 |     residentialNoElevatorUnitCount: 0,
13155 |     residentialUnknownElevatorUnitCount: 0,
13156 |     commercialElevatorUnitCount: 0,
13157 |     commercialNoElevatorUnitCount: 0,
13158 |     commercialUnknownElevatorUnitCount: 0,
13159 |     sourceRecordCount: 0,
13160 |     matchedBuildingCount: 0,
13161 |     residentialBuildingCount: 0,
13162 |     geocodedBuildingCount: 0,
13163 |     unlocatedBuildingCount: 0,
13164 |     coveragePercent: 100,
13165 |     elevatorBuildingCount: 0,
13166 |     noElevatorBuildingCount: 0,
13167 |     unknownElevatorBuildingCount: 0,
13168 |     elevatorHouseholdCount: 0,
13169 |     noElevatorHouseholdCount: 0,
13170 |     unknownElevatorHouseholdCount: 0,
13171 |     passengerElevatorCount: 0,
13172 |     emergencyElevatorCount: 0,
13173 |     walkupBuildingCount: 0,
13174 |     walkupHouseholdCount: 0,
13175 |     breakdown: {},
13176 |   };
13177 | }
13178 | 
13179 | function v60AggregateBuildingStats({
13180 |   titleRowsByParcel,
13181 |   detailCacheMap,
13182 |   kaptMatches,
13183 |   verifiedScopeParcels,
13184 |   walkupMinGroundFloors,
13185 |   titleDiagnostics,
13186 |   detailDiagnostics,
13187 |   kaptDiagnostics,
13188 |   housingPermitWelfareEvidence,
13189 | }) {
13190 |   const aggregate = v60CreateAggregate();
13191 |   const buildingKeys = new Set();
13192 |   const residentialBuildingKeys = new Set();
13193 |   const elevatorBuildingKeys = new Set();
13194 |   const noElevatorBuildingKeys = new Set();
13195 |   const unknownElevatorBuildingKeys = new Set();
13196 |   const walkupBuildingKeys = new Set();
13197 |   const mixedUseKeys = new Set();
13198 |   const contributions = [];
13199 |   const detailUnitsByParent = new Map();
13200 |   const orphanDetailUnits = [];
13201 |   const detailShopUnitsByParcel = new Map();
13202 |   const commercialUnitsByKaptFamily = new Map();
13203 |   const familyKeyByTitleKey = new Map();
13204 |   for (const rows of titleRowsByParcel.values()) {
13205 |     for (const title of v60RelevantTitles(rows)) {
13206 |       const titleKey = buildingRecordKey(title);
13207 |       const familyKey = v63TitleKaptFamilyKey(title);
13208 |       if (titleKey && familyKey) familyKeyByTitleKey.set(titleKey, familyKey);
13209 |     }
13210 |   }
13211 |   let areaRowsSeen = 0;
13212 |   let exposRowsSeen = 0;
13213 | 
13214 |   const addUnits = ({ units, bucket, apartment = false, elevatorStatus = "unknown", buildingKey, source, floorCount = 0, passenger = 0, emergency = 0, meta = null, familyKey = null }) => {
13215 |     const count = Math.max(0, Math.trunc(Number(units) || 0));
13216 |     if (!count) return;
13217 |     if (bucket === "mixed") bucket = "unclassified";
13218 |     if (bucket === "residential") {
13219 |       aggregate.residentialUnitCount += count;
13220 |       aggregate.householdCount += count;
13221 |       if (apartment) aggregate.apartmentHouseholdCount += count;
13222 |       else aggregate.nonApartmentHouseholdCount += count;
13223 |       aggregate.residentialBuildingUnitCount += count;
13224 |     } else if (bucket === "commercial") {
13225 |       aggregate.commercialUnitCount += count;
13226 |       aggregate.commercialBuildingUnitCount += count;
13227 |       const resolvedFamilyKey = cleanBuildingText(familyKey || meta?.familyKey || familyKeyByTitleKey.get(buildingKey));
13228 |       if (resolvedFamilyKey) {
13229 |         commercialUnitsByKaptFamily.set(
13230 |           resolvedFamilyKey,
13231 |           Number(commercialUnitsByKaptFamily.get(resolvedFamilyKey) || 0) + count
13232 |         );
13233 |       }
13234 |     } else {
13235 |       aggregate.unclassifiedUnitCount += count;
13236 |       aggregate.unknownHouseholdCount += count;
13237 |     }
13238 | 
13239 |     if (elevatorStatus === "yes") {
13240 |       aggregate.confirmedElevatorUnitCount += count;
13241 |       if (bucket === "residential") aggregate.residentialElevatorUnitCount += count;
13242 |       if (bucket === "commercial") aggregate.commercialElevatorUnitCount += count;
13243 |     } else if (elevatorStatus === "no") {
13244 |       aggregate.noElevatorUnitCount += count;
13245 |       if (bucket === "residential") aggregate.residentialNoElevatorUnitCount += count;
13246 |       if (bucket === "commercial") aggregate.commercialNoElevatorUnitCount += count;
13247 |     } else {
13248 |       aggregate.unknownElevatorUnitCount += count;
13249 |       if (bucket === "residential") aggregate.residentialUnknownElevatorUnitCount += count;
13250 |       if (bucket === "commercial") aggregate.commercialUnknownElevatorUnitCount += count;
13251 |     }
13252 | 
13253 |     if (buildingKey) {
13254 |       buildingKeys.add(buildingKey);
13255 |       if (bucket === "residential") residentialBuildingKeys.add(buildingKey);
13256 |       if (elevatorStatus === "yes") elevatorBuildingKeys.add(buildingKey);
13257 |       else if (elevatorStatus === "no") noElevatorBuildingKeys.add(buildingKey);
13258 |       else unknownElevatorBuildingKeys.add(buildingKey);
13259 |       if (elevatorStatus === "no" && floorCount >= walkupMinGroundFloors) {
13260 |         walkupBuildingKeys.add(buildingKey);
13261 |         aggregate.walkupHouseholdCount += count;
13262 |       }
13263 |     }

// ...
13328 |           Number(detailShopUnitsByParcel.get(parcelKey) || 0) + 1
13329 |         );
13330 |       }
13331 |       const parentKey = parent ? buildingRecordKey(parent) : "";
13332 |       const item = { parcelKey, row, parent, parentKey, classification, unitKey };
13333 |       if (parentKey) {
13334 |         if (!detailUnitsByParent.has(parentKey)) detailUnitsByParent.set(parentKey, []);
13335 |         detailUnitsByParent.get(parentKey).push(item);
13336 |       } else {
13337 |         orphanDetailUnits.push(item);
13338 |       }
13339 |     });
13340 |   }
13341 | 
13342 |   // K-APT apartment contributions: one complex, one residential total. Elevator status
13343 |   // belongs only to this exact complex contribution.
13344 |   for (const match of kaptMatches || []) {
13345 |     const households = Math.max(0, Math.trunc(Number(match.normalized?.households) || 0));
13346 |     if (!households) continue;
13347 |     const elevator = v60KaptElevatorStatus(match, titleRowsByParcel);
13348 |     const buildingCount = Math.max(1, Math.trunc(Number(match.normalized?.buildingCount) || 1));
13349 |     for (let i = 0; i < buildingCount; i++) {
13350 |       const key = `kapt:${match.kaptCode}:${i + 1}`;
13351 |       buildingKeys.add(key);
13352 |       residentialBuildingKeys.add(key);
13353 |       if (elevator.status === "yes") elevatorBuildingKeys.add(key);
13354 |       else if (elevator.status === "no") noElevatorBuildingKeys.add(key);
13355 |       else unknownElevatorBuildingKeys.add(key);
13356 |     }
13357 |     aggregate.residentialUnitCount += households;
13358 |     aggregate.householdCount += households;
13359 |     aggregate.apartmentHouseholdCount += households;
13360 |     aggregate.residentialBuildingUnitCount += households;
13361 |     if (elevator.status === "yes") {
13362 |       aggregate.confirmedElevatorUnitCount += households;
13363 |       aggregate.residentialElevatorUnitCount += households;
13364 |     } else if (elevator.status === "no") {
13365 |       aggregate.noElevatorUnitCount += households;
13366 |       aggregate.residentialNoElevatorUnitCount += households;
13367 |     } else {
13368 |       aggregate.unknownElevatorUnitCount += households;
13369 |       aggregate.residentialUnknownElevatorUnitCount += households;
13370 |     }
13371 |     aggregate.passengerElevatorCount += Math.max(0, Math.trunc(Number(elevator.elevatorCount) || 0));
13372 |     if (contributions.length < 240) contributions.push({
13373 |       units: households,
13374 |       bucket: "residential",
13375 |       elevatorStatus: elevator.status,
13376 |       source: "KAPT_EXACT_COMPLEX",
13377 |       buildingKey: `kapt:${match.kaptCode}`,
13378 |       meta: { name: match.normalized?.name || null, parcelKey: match.parcelKey, reason: match.reason, elevatorReason: elevator.reason },
13379 |     });
13380 |   }
13381 | 
13382 |   // Title/detail contributions.
13383 |   for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
13384 |     for (const row of v60RelevantTitles(rows)) {
13385 |       const titleKey = buildingRecordKey(row);
13386 |       const classification = v60Classification(row);
13387 |       if (classification.mixedUse) mixedUseKeys.add(titleKey);
13388 |       const kaptCover = classification.apartment ? v60TitleCoveredByKapt(row, kaptMatches) : null;
13389 |       if (classification.apartment && kaptCover && !classification.mixedUse) continue;
13390 | 
13391 |       const assigned = detailUnitsByParent.get(titleKey) || [];
13392 |       if (assigned.length) {
13393 |         let residential = 0, commercial = 0, unclassified = 0;
13394 |         for (const item of assigned) {
13395 |           const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
13396 |           if (bucket === "residential") { if (!kaptCover) residential += 1; }
13397 |           else if (bucket === "commercial") commercial += 1;
13398 |           else unclassified += 1;
13399 |         }
13400 |         const elevator = v60ElevatorStatusFromTitle(row);
13401 |         const floors = buildingGroundFloorCount(row);
13402 |         const info = elevator.info || {};
13403 |         if (residential) addUnits({ units: residential, bucket: "residential", apartment: classification.apartment, elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: info.passenger, emergency: info.emergency, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
13404 |         if (commercial) addUnits({ units: commercial, bucket: "commercial", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
13405 |         if (unclassified) addUnits({ units: unclassified, bucket: "unclassified", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
13406 |         aggregate.exclusiveUnitRecordCount += assigned.length;
13407 |         continue;
13408 |       }
13409 | 
13410 |       // V61: 일반 혼합용도 건물의 fmlyCnt/hhldCnt는 명시적 주거 가구수다.
13411 |       // 전유부가 0건이라고 해서 해당 가구를 미분류 처리하지 않는다.
13412 |       if (classification.mixedUse) {
13413 |         const split = v61MixedTitleExplicitSplit(row, classification);
13414 |         const elevator = v60ElevatorStatusFromTitle(row);
13415 |         const floors = buildingGroundFloorCount(row);
13416 |         const info = elevator.info || {};
13417 |         let contributed = false;
13418 |         if (split.residential > 0 && !kaptCover) {
13419 |           addUnits({
13420 |             units: split.residential,
13421 |             bucket: "residential",
13422 |             apartment: classification.apartment,
13423 |             elevatorStatus: elevator.status,
13424 |             buildingKey: titleKey,
13425 |             source: split.household > 0 ? "TITLE_MIXED_hhldCnt" : "TITLE_MIXED_fmlyCnt",
13426 |             floorCount: floors,
13427 |             passenger: info.passenger,
13428 |             emergency: info.emergency,
13429 |             meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
13430 |           });
13431 |           contributed = true;
13432 |         }
13433 |         if (split.commercial > 0) {
13434 |           addUnits({
13435 |             units: split.commercial,
13436 |             bucket: "commercial",
13437 |             elevatorStatus: elevator.status,
13438 |             buildingKey: titleKey,
13439 |             source: "TITLE_MIXED_hoCnt_REMAINDER",
13440 |             floorCount: floors,
13441 |             passenger: contributed ? 0 : info.passenger,
13442 |             emergency: contributed ? 0 : info.emergency,
13443 |             meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
13444 |           });
13445 |           contributed = true;
13446 |         }
13447 |         if (contributed || kaptCover) continue;
13448 |       }
13449 | 
13450 |       if (kaptCover) continue;
13451 | 
13452 |       // 아파트 상가 전유부를 실제로 찾은 필지는 전유호가 최우선이다.
13453 |       // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
13454 |       // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
13455 |       if (
13456 |         v62ApartmentShopNameHint(row) &&
13457 |         v62ParcelHasKaptMatch(row, kaptMatches) &&
13458 |         Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
13459 |       ) {
13460 |         continue;
13461 |       }
13462 | 
13463 |       const explicit = buildingExplicitUnitEvidence(row, classification);
13464 |       const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
13465 |       let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
13466 |       let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
13467 |         ? "TITLE_PURPOSE_EXPLICIT_COUNT"
13468 |         : (explicit.source ? `TITLE_${explicit.source}` : null);
13469 |       if (units <= 0) {
13470 |         const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
13471 |         // No area/floor estimate. A non-collective main registry record is itself one
13472 |         // addressable building, so it may contribute exactly one address unit.
13473 |         if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
13474 |           units = 1;
13475 |           source = "TITLE_MAIN_BUILDING_ADDRESS";
13476 |         }
13477 |       }
13478 |       if (units <= 0) continue;
13479 |       const elevator = v60ElevatorStatusFromTitle(row);
13480 |       const bucket = v62ResolvedClassificationBucket(row, classification);
13481 |       addUnits({
13482 |         units,
13483 |         bucket,
13484 |         apartment: classification.apartment,
13485 |         elevatorStatus: elevator.status,
13486 |         buildingKey: titleKey,
13487 |         source: source || "TITLE_EXPLICIT",
13488 |         floorCount: buildingGroundFloorCount(row),
13489 |         passenger: elevator.info?.passenger || 0,
13490 |         emergency: elevator.info?.emergency || 0,
13491 |         meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
13492 |       });
13493 |     }
13494 |   }
13495 | 
13496 |   // Detail units that could not be attached to a unique title remain exact unit records;
13497 |   // their elevator status is unknown instead of borrowing another building's status.
13498 |   for (const item of orphanDetailUnits) {
13499 |     if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
13500 |       continue;
13501 |     }
13502 |     const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
13503 |     addUnits({
13504 |       units: 1,
13505 |       bucket,
13506 |       apartment: item.classification.apartment,
13507 |       elevatorStatus: "unknown",
13508 |       buildingKey: `detail:${item.parcelKey}`,
13509 |       source: "DETAIL_ORPHAN_EXACT_UNIT",
13510 |       meta: {
13511 |         parcelKey: item.parcelKey,
13512 |         ho: unitHoName(item.row) || null,
13513 |         familyKey: v63TitleKaptFamilyKey(item.row) || null,
13514 |       },
13515 |     });
13516 |     aggregate.exclusiveUnitRecordCount += 1;
13517 |   }
13518 | 
13519 |   // V66: 주택인허가 "복리분양시설"의 명시적 개소수는 단지 전체의 비주거
13520 |   // 배송단위 하한으로 사용한다. 건축물대장에 이미 잡힌 같은 K-APT family 상가와
13521 |   // 단순 합산하지 않고 max(existing, permit explicit count)로 보정해 중복을 막는다.
13522 |   const housingPermitRescues = [];
13523 |   for (const evidence of housingPermitWelfareEvidence?.families || []) {
13524 |     const familyKey = cleanBuildingText(evidence?.familyKey);
13525 |     const permitCount = Math.max(0, Math.trunc(Number(evidence?.commercialCount) || 0));
13526 |     if (!familyKey || permitCount <= 0) continue;
13527 |     const existingCount = Math.max(0, Math.trunc(Number(commercialUnitsByKaptFamily.get(familyKey)) || 0));

// ...
13544 |       });
13545 |     }
13546 |     housingPermitRescues.push({
13547 |       familyKey,
13548 |       permitExplicitCount: permitCount,
13549 |       existingRegistryCount: existingCount,
13550 |       addedCount: rescueCount,
13551 |       welfareRowCount: evidence.welfareRowCount || 0,
13552 |       addressableWelfareRowCount: evidence.addressableWelfareRowCount || 0,
13553 |       managementRowCount: evidence.managementRowCount || 0,
13554 |       parcelKeys: evidence.parcelKeys || [],
13555 |       complexNames: evidence.complexNames || [],
13556 |       sampleRows: evidence.sampleRows || [],
13557 |     });
13558 |   }
13559 | 
13560 |   aggregate.deliveryUnitCount = aggregate.residentialUnitCount + aggregate.commercialUnitCount + aggregate.unclassifiedUnitCount;
13561 |   aggregate.matchedBuildingCount = buildingKeys.size;
13562 |   aggregate.residentialBuildingCount = residentialBuildingKeys.size;
13563 |   aggregate.geocodedBuildingCount = buildingKeys.size;
13564 |   aggregate.elevatorBuildingCount = elevatorBuildingKeys.size;
13565 |   aggregate.noElevatorBuildingCount = noElevatorBuildingKeys.size;
13566 |   aggregate.unknownElevatorBuildingCount = unknownElevatorBuildingKeys.size;
13567 |   aggregate.walkupBuildingCount = walkupBuildingKeys.size;
13568 |   aggregate.elevatorHouseholdCount = aggregate.residentialElevatorUnitCount;
13569 |   aggregate.noElevatorHouseholdCount = aggregate.residentialNoElevatorUnitCount;
13570 |   aggregate.unknownElevatorHouseholdCount = aggregate.residentialUnknownElevatorUnitCount;
13571 |   aggregate.mixedUseBuildingCount = mixedUseKeys.size;
13572 | 
13573 |   const titleRows = [...titleRowsByParcel.values()].flat();
13574 |   aggregate.sourceRecordCount = titleRows.length + areaRowsSeen + exposRowsSeen + (kaptMatches || []).length + (housingPermitWelfareEvidence?.welfareRowCount || 0);
13575 |   aggregate.breakdown = {
13576 |     algorithm: {
13577 |       version: BUILDING_STATS_SOURCE_VERSION,
13578 |       mode: "V66_HSPMS_WELFARE_RESCUE",
13579 |       rules: {
13580 |         areaBasedUnitEstimation: false,
13581 |         floorBasedUnitEstimation: false,
13582 |         sameParcelElevatorPropagation: false,
13583 |         kaptAppliesOnlyToMatchedApartment: true,
13584 |         mixedUseExplicitResidentialSplit: true,
13585 |         purposeExplicitResidentialCountFallback: true,
13586 |         denseScopeDiscoveryRequired: true,
13587 |         apartmentShopDetailFirst: true,
13588 |         apartmentShopDongNameOverride: true,
13589 |         kaptSplitComplexFamilyRescue: true,
13590 |         apartmentCommercialSiblingDetailRescue: true,
13591 |         detailAreaAndExposSourceMerge: true,
13592 |         completeExposPagination: true,
13593 |         floorOverviewCommercialClassification: true,
13594 |         [long-token-redacted]: true,
13595 |         [long-token-redacted]: true,
13596 |         housingPermitCommercialReconciliation: "MAX_REGISTRY_OR_PERMIT_EXPLICIT_COUNT",
13597 |         detailCacheVersionMarker: V65_DETAIL_CACHE_VERSION,
13598 |         mainPurposeBucketFallback: true,
13599 |         nonCollectiveDetailLookupDisabled: true,
13600 |       },
13601 |       scope: {
13602 |         discoveredScopeParcels: verifiedScopeParcels.map.size,
13603 |         matchedTitleParcels: [...titleRowsByParcel.values()].filter((rows) => rows.length > 0).length,
13604 |         matchedBuildings: aggregate.matchedBuildingCount,
13605 |       },
13606 |     },
13607 |     source: {
13608 |       titleCache: titleDiagnostics,
13609 |       detailCache: detailDiagnostics,
13610 |       unitDiagnostics: {
13611 |         areaRows: areaRowsSeen,
13612 |         exposRows: exposRowsSeen,
13613 |         candidateUnits: aggregate.exclusiveUnitRecordCount,
13614 |         matchedParcels: verifiedScopeParcels.map.size,
13615 |         parentlessCandidates: orphanDetailUnits.length,
13616 |         kaptComplexes: (kaptMatches || []).length,
13617 |       },
13618 |     },
13619 |     housingPermitWelfare: {
13620 |       requestedFamilyCount: housingPermitWelfareEvidence?.requestedFamilyCount || 0,
13621 |       welfareRowCount: housingPermitWelfareEvidence?.welfareRowCount || 0,
13622 |       explicitCommercialCount: housingPermitWelfareEvidence?.explicitCommercialCount || 0,
13623 |       errors: housingPermitWelfareEvidence?.errors || [],
13624 |       diagnosticErrors: housingPermitWelfareEvidence?.diagnosticErrors || [],
13625 |       rescues: housingPermitRescues,
13626 |     },
13627 |     kapt: {
13628 |       complexCount: (kaptMatches || []).length,
13629 |       householdCount: (kaptMatches || []).reduce((sum, match) => sum + Math.max(0, Number(match.normalized?.households) || 0), 0),
13630 |       diagnostics: kaptDiagnostics,
13631 |       complexes: (kaptMatches || []).slice(0, 40).map((match) => ({
13632 |         kaptCode: match.kaptCode,
13633 |         name: match.normalized?.name || null,
13634 |         households: match.normalized?.households || 0,
13635 |         elevatorCount: match.normalized?.elevatorCount || 0,
13636 |         parcelKey: match.parcelKey,
13637 |         reason: match.reason,
13638 |       })),
13639 |     },
13640 |     elevator: {
13641 |       unitCounts: {
13642 |         confirmed: aggregate.confirmedElevatorUnitCount,
13643 |         inferred: 0,
13644 |         none: aggregate.noElevatorUnitCount,
13645 |         unknown: aggregate.unknownElevatorUnitCount,
13646 |       },
13647 |       buildingCounts: {
13648 |         confirmed: aggregate.elevatorBuildingCount,
13649 |         inferred: 0,
13650 |         none: aggregate.noElevatorBuildingCount,
13651 |         unknown: aggregate.unknownElevatorBuildingCount,
13652 |       },
13653 |       inferencePolicy: {
13654 |         enabled: false,
13655 |         sameParcelPropagation: false,
13656 |       },
13657 |     },
13658 |     contributions,
13659 |     dataQuality: {
13660 |       deliveryUnitCount: aggregate.deliveryUnitCount,
13661 |       matchedBuildingCount: aggregate.matchedBuildingCount,
13662 |       orphanDetailUnits: orphanDetailUnits.length,
13663 |     },
13664 |   };
13665 |   return aggregate;
13666 | }
13667 | 
13668 | function v60RouteCacheExpiry() {
13669 |   return v60IsoAfter({ days: V60_ROUTE_CACHE_DAYS });
13670 | }
13671 | 
13672 | async function handleBuildingStatsRequest(request, env) {
13673 |   await verifySupabaseUserByJwt(request, env);
13674 | 
13675 |   const body = await readJsonBody(request);
13676 |   const scope = normalizeBuildingStatsScope(body);
13677 |   const normalized = normalizeTerrainGeometry(body?.geometry || body?.polygon || body?.geojson);
13678 |   const geometryHash = await terrainGeometryHash(normalized);
13679 |   const polygonAreaM2 = calculateTerrainPolygonAreaM2(normalized.geometry);
13680 |   if (polygonAreaM2 == null) throw httpError(400, "Failed to calculate polygon area");
13681 | 
13682 |   const forceRefresh = body?.forceRefresh === true || body?.force_refresh === true;
13683 |   const cachedRow = await fetchBuildingStatsCache(env, scope.scopeType, scope.scopeKey);
13684 |   if (isBuildingStatsCacheFresh(cachedRow, geometryHash, forceRefresh)) {
13685 |     return jsonResp({
13686 |       ok: true,
13687 |       cached: true,
13688 |       cacheAvailable: true,

// ...
13781 |         processedParcelCount: processed,
13782 |         remainingParcelCount: titleState.unresolved.length,
13783 |         totalDirectParcelCount: titleState.scopeKeys.length,
13784 |       },
13785 |       message: titleState.regionSync
13786 |         ? "건축물대장 표제부 원천을 지역 캐시에 채우고 있습니다."
13787 |         : "누락 필지의 건축물대장 표제부를 확인하고 있습니다.",
13788 |     });
13789 |   }
13790 | 
13791 |   const titleRowsByParcel = v60TitleRowsByParcel(titleState.cacheMap);
13792 |   const allTitleRows = v60AllTitleRows(titleState.cacheMap);
13793 | 
13794 |   // Stage 2: K-APT candidate enrichment. Only apartment-looking names from this scope
13795 |   // become candidates, so a legal dong with dozens of complexes does not cause dozens
13796 |   // of basic/detail requests.
13797 |   const kaptRegionMap = await v60EnsureKaptRegionLists(env, legalDongCodes);
13798 |   const kaptCandidates = v60KaptCandidateRows(kaptRegionMap, allTitleRows, verifiedScopeParcels);
13799 |   const kaptState = await v60EnsureKaptComplexInfo(env, kaptCandidates);
13800 |   if (!kaptState.complete) {
13801 |     const processed = kaptState.codes.length - kaptState.missing.length;
13802 |     return jsonResp({
13803 |       ok: true,
13804 |       cached: false,
13805 |       stale: false,
13806 |       requiresKaptInfoContinuation: true,
13807 |       requiresGeocoding: false,
13808 |       partial: true,
13809 |       scopeType: scope.scopeType,
13810 |       scopeKey: scope.scopeKey,
13811 |       geometryHash,
13812 |       polygonAreaM2,
13813 |       kaptInfoContinuation: {
13814 |         evidence: kaptState.evidence,
13815 |         processedComplexCount: processed,
13816 |         remainingComplexCount: kaptState.missing.length,
13817 |         totalComplexCount: kaptState.codes.length,
13818 |       },
13819 |       progress: {
13820 |         processedComplexCount: processed,
13821 |         remainingComplexCount: kaptState.missing.length,
13822 |         totalComplexCount: kaptState.codes.length,
13823 |       },
13824 |       message: "폴리곤 내부 아파트 후보의 K-APT 정보만 확인하고 있습니다.",
13825 |     });
13826 |   }
13827 | 
13828 |   const kaptMatches = v60BuildKaptMatches(kaptCandidates, kaptState.cacheMap, allTitleRows, verifiedScopeParcels);
13829 | 
13830 |   // Stage 3: detail only where title/K-APT cannot provide an exact unit count or where
13831 |   // mixed-use classification requires exclusive-unit rows.
13832 |   const detailParcelKeys = v60DetermineDetailParcels(titleRowsByParcel, kaptMatches);
13833 |   const detailState = await v60EnsureDetailCaches(env, detailParcelKeys);
13834 |   if (!detailState.complete) {
13835 |     const processed = detailState.keys.length - detailState.missing.length;
13836 |     return jsonResp({
13837 |       ok: true,
13838 |       cached: false,
13839 |       stale: false,
13840 |       requiresDetailContinuation: true,
13841 |       requiresGeocoding: false,
13842 |       partial: true,
13843 |       scopeType: scope.scopeType,
13844 |       scopeKey: scope.scopeKey,
13845 |       geometryHash,
13846 |       polygonAreaM2,
13847 |       detailContinuation: {
13848 |         evidence: detailState.evidence,
13849 |         processedParcelCount: processed,
13850 |         remainingParcelCount: detailState.missing.length,
13851 |         totalDetailParcelCount: detailState.keys.length,
13852 |       },
13853 |       progress: {
13854 |         processedParcelCount: processed,
13855 |         remainingParcelCount: detailState.missing.length,
13856 |         totalDetailParcelCount: detailState.keys.length,
13857 |       },
13858 |       message: "상가·오피스텔·혼합건물의 실제 전유호만 상세조회하고 있습니다.",
13859 |     });
13860 |   }
13861 | 
13862 |   if (!detailState.sourceComplete) {
13863 |     const errors = detailState.errorRows.slice(0, 8).map((row) => `${row.parcel_key}: ${row.last_error || "detail source failed"}`);
13864 |     throw httpError(503, `건축물 상세 원천 조회 실패: ${errors.join(" | ")}`);
13865 |   }
13866 | 
13867 |   const walkupMinGroundFloors = Math.max(1, Math.trunc(Number(body?.walkupMinGroundFloors ?? body?.walkup_min_ground_floors) || 3));
13868 | 
13869 |   // V66: K-APT로 정확히 결속된 아파트 단지에만 주택인허가 복리분양시설을 조회한다.
13870 |   // 별도 HsPms 활용승인이 없거나 원천이 일시 실패해도 기존 건축물대장/K-APT 계산은 유지한다.
13871 |   const housingPermitWelfareEvidence = await v66FetchHousingPermitWelfareEvidence(env, kaptMatches);
13872 | 
13873 |   const aggregate = v60AggregateBuildingStats({
13874 |     titleRowsByParcel,
13875 |     detailCacheMap: detailState.cacheMap,
13876 |     kaptMatches,
13877 |     verifiedScopeParcels,
13878 |     walkupMinGroundFloors,
13879 |     titleDiagnostics: {
13880 |       scopeParcelCount: titleState.scopeKeys.length,
13881 |       titleParcelCount: [...titleRowsByParcel.values()].filter((rows) => rows.length > 0).length,
13882 |       titleRowCount: allTitleRows.length,
13883 |       emptyTitleParcelCount: [...titleRowsByParcel.values()].filter((rows) => rows.length === 0).length,
13884 |     },
13885 |     detailDiagnostics: {
13886 |       requestedParcelCount: detailState.keys.length,
13887 |       readyParcelCount: detailState.keys.filter((key) => detailState.cacheMap.get(key)?.status === "ready").length,
13888 |     },
13889 |     kaptDiagnostics: {
13890 |       candidateComplexCount: kaptCandidates.length,
13891 |       fetchedComplexCount: kaptState.codes.length,
13892 |       matchedComplexCount: kaptMatches.length,
13893 |       regionErrors: [...kaptRegionMap.values()].filter((row) => row?.status === "error").map((row) => row?.last_error).filter(Boolean),
13894 |       complexErrors: [...kaptState.cacheMap.values()].filter((row) => row?.status === "error").map((row) => row?.last_error).filter(Boolean),
13895 |     },
13896 |     housingPermitWelfareEvidence,
13897 |   });
13898 | 
13899 |   if (aggregate.deliveryUnitCount <= 0) {
13900 |     throw httpError(422, "폴리곤 내부 표제부는 확인했지만 배송호수 근거를 만들지 못했습니다. 0호 결과는 저장하지 않습니다.");
13901 |   }
13902 |   if (aggregate.elevatorBuildingCount > aggregate.matchedBuildingCount || aggregate.noElevatorBuildingCount > aggregate.matchedBuildingCount) {
13903 |     throw httpError(500, "V62 elevator building invariant failed");
13904 |   }
13905 | 
13906 |   const sourceWarnings = [];
13907 |   const kaptRegionErrors = [...kaptRegionMap.values()].filter((row) => row?.status === "error");
13908 |   const kaptComplexErrors = [...kaptState.cacheMap.values()].filter((row) => row?.status === "error");
13909 |   if (kaptRegionErrors.length || kaptComplexErrors.length) {
13910 |     sourceWarnings.push("K-APT 일부 원천이 일시적으로 실패하여 해당 단지는 건축물대장 표제부 기준으로 계산했습니다.");
13911 |   }
13912 |   if ((housingPermitWelfareEvidence?.errors || []).length) {
13913 |     sourceWarnings.push("주택인허가 복리분양시설 일부 원천을 조회하지 못해 해당 단지는 기존 건축물대장/K-APT 수량만 사용했습니다. HsPmsHubService 활용승인도 확인해 주세요.");
13914 |   }
13915 | 
13916 |   const row = buildingStatsDatabaseRow({
13917 |     scope,
13918 |     geometryHash,
13919 |     polygonAreaM2,
13920 |     aggregate,
13921 |     records: allTitleRows,
13922 |     walkupMinGroundFloors,
13923 |     locationSource: cleanBuildingText(body?.locationSource ?? body?.location_source) || "KAKAO_ROUTE_POLYGON_REVERSE_PARCEL",
13924 |     sourceMode: "BUILDING_HUB_V65_PARCEL_CACHE+K_APT_SPLIT_FAMILY+HSPMS_WELFARE_EXPLICIT_RESCUE",
13925 |     sourceVersion: BUILDING_STATS_SOURCE_VERSION,
13926 |     sourceWarnings,
13927 |   });
13928 |   row.expires_at = v60RouteCacheExpiry();
13929 |   row.unit_analysis_method = "V66_DETERMINISTIC_PARCEL_TITLE+SPLIT_KAPT_FAMILY+COMPLETE_EXPOS+HSPMS_WELFARE_EXPLICIT_COUNT_RESCUE+NO_AREA_ESTIMATION";
13930 | 
13931 |   const savedRow = await upsertBuildingStatsCache(env, row);
13932 |   return jsonResp({
13933 |     ok: true,
13934 |     cached: false,
13935 |     cacheAvailable: true,
13936 |     cacheVersion: BUILDING_STATS_SOURCE_VERSION,
13937 |     cacheExpiresAt: savedRow?.expires_at || row.expires_at,
13938 |     stale: false,
13939 |     provisional: false,
13940 |     requiresGeocoding: false,
13941 |     partial: false,
13942 |     warning: sourceWarnings.join(" | ") || null,
13943 |     scopeType: scope.scopeType,
13944 |     scopeKey: scope.scopeKey,
13945 |     geometryHash,
13946 |     buildingStats: buildingStatsRowToResponse(savedRow) || buildingStatsRowToResponse(row),
13947 |   });
13948 | }
13949 | async function handleZipBoundaryRequest(url) {
13950 |   const zipcode = (url.searchParams.get("zipcode") || "").trim();
13951 |   const debug = url.searchParams.get("debug") === "1";
13952 | 
13953 |   if (!/^\d{5}$/.test(zipcode)) {
13954 |     return jsonResp(
13955 |       { error: "유효한 5자리 zipcode 쿼리 파라미터가 필요함" },
13956 |       400
13957 |     );

// ...
14046 | 
14047 |     try {
14048 |       const url = new URL(request.url);
14049 |       const path = url.pathname.replace(/\/+$/, "") || "/";
14050 | 
14051 |       if (request.method === "GET" && (path === "/health" || path === "/share/health")) {
14052 |         return jsonResp({
14053 |           ok: true,
14054 |           service: "zipcode-boundary-share",
14055 |           version: ZIP_SHARE_WORKER_VERSION,
14056 |           kvReady: !!env?.ZIP_SHARE_KV,
14057 |           terrainMode: "[long-token-redacted]",
14058 |           terrainEndpoint: COPERNICUS_PROCESS_URL,
14059 |           buildingStatsVersion: BUILDING_STATS_SOURCE_VERSION,
14060 |           buildingStatsMode: "[long-token-redacted]",
14061 |           buildingHubTimeoutMs: BUILDING_HUB_TIMEOUT_MS,
14062 |           kaptTimeoutMs: KAPT_TIMEOUT_MS
14063 |         });
14064 |       }
14065 | 
14066 |       if (request.method === "POST" && (path === "/terrain" || path === "/zip/terrain")) {
14067 |         return await handleTerrainRequest(request, env);
14068 |       }
14069 | 
14070 |       if (
14071 |         request.method === "POST" &&
14072 |         (
14073 |           path === "/building/stats" ||
14074 |           path === "/households" ||
14075 |           path === "/zip/building-stats"
14076 |         )
14077 |       ) {
14078 |         return await handleBuildingStatsRequest(request, env);
14079 |       }
14080 | 
14081 |       if (request.method === "POST" && (path === "/share/create" || path === "/create")) {
14082 |         return await handleZipShareCreate(request, env);
14083 |       }
14084 | 
14085 |       if (request.method === "GET" && (path === "/share/verify" || path === "/verify")) {
14086 |         return await handleZipShareVerify(request, env, url);
14087 |       }
14088 | 
14089 |       if (request.method === "GET" && (path === "/zip/share" || path === "/share/view" || path === "/share")) {
14090 |         return await handleZipSharePreview(request, env, url);
```
