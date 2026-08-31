# v60 detail cache function

## v60EnsureDetailCaches #1
```js
rue;
  if (classification.apartment && explicit.units <= 0) return true;
  if (classification.commercial && collective && explicit.units <= 0) return true;
  if (classification.residential && collective && explicit.units <= 0) return true;
  if (!classification.residential && !classification.commercial && collective) return true;
  return false;
}

function v60DetermineDetailParcels(titleRowsByParcel, kaptMatches) {
  const selected = new Set();
  const commercialKaptFamilies = new Set();

  // 1차: 기존 상세조회 조건 + K-APT 단지의 별도 집합 상가/근생 필지를 찾는다.
  for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
    for (const row of rows || []) {
      if (v60NeedsDetailForTitle(row, kaptMatches)) selected.add(parcelKey);

      const classification = v60Classification(row);
      if (
        v63IsCollectiveTitle(row) &&
        v63TitleBelongsToKaptFamily(row, kaptMatches) &&
        (classification.commercial || classification.mixedUse || v62ApartmentShopNameHint(row))
      ) {
        const familyKey = v63TitleKaptFamilyKey(row);
        if (familyKey) commercialKaptFamilies.add(familyKey);
      }
    }
  }

  // 2차: 같은 K-APT 단지에 별도 상가/근생 필지가 실제로 존재하면 아파트 본필지도
  // 전유부를 확인한다. K-APT가 주거 세대수는 담당하므로 주거 전유호는 이중계산되지 않고,
  // 본필지 안에 숨어 있는 상업 전유호만 추가로 복구된다.
  if (commercialKaptFamilies.size) {
    for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
      const shouldInspectApartmentParcel = (rows || []).some((row) => {
        const classification = v60Classification(row);
        if (!classification.apartment) return false;
        if (!v60TitleCoveredByKapt(row, kaptMatches)) return false;
        const familyKey = v63TitleKaptFamilyKey(row);
        return !!familyKey && commercialKaptFamilies.has(familyKey);
      });
      if (shouldInspectApartmentParcel) selected.add(parcelKey);
    }
  }

  return [...selected];
}

function v65FloorClassForOverviewRow(row) {
  const use = floorOverviewUseText(row).replace(/\s+/g, "");
  if (!use) return null;
  const residential = /오피스텔|아파트|공동주택|연립주택|다세대주택|단독주택|다가구주택|다중주택|도시형생활주택|기숙사|주택/.test(use);
  const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|업무시설/.test(use);
  if (commercial && !residential) return "commercial";
  if (residential && !commercial) return "residential";
  return null;
}

function v65FloorEvidenceKeys(row) {
  const buildingPk = cleanBuildingText(publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk"));
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeFloorIdentityV29(unitFloorName(row));
  const keys = [];
  if (buildingPk && floor) keys.push(`PK:${buildingPk}|F:${floor}`);
  if (dong && floor) keys.push(`D:${dong}|F:${floor}`);
  return keys;
}

function v65BuildFloorClassIndex(floorRows) {
  const sets = new Map();
  for (const row of floorRows || []) {
    const bucket = v65FloorClassForOverviewRow(row);
    if (!bucket) continue;
    for (const key of v65FloorEvidenceKeys(row)) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(bucket);
    }
  }
  const out = new Map();
  for (const [key, values] of sets.entries()) {
    // 한 층에 주거/상업이 함께 적힌 경우 개별 호를 구분할 근거가 없으므로
    // 억지 분류하지 않는다. 한쪽 용도만 명확한 층만 official hint로 사용한다.
    if (values.size === 1) out.set(key, [...values][0]);
  }
  return out;
}

function v65EnrichExposRowsWithFloorUse(exposRows, floorRows) {
  const index = v65BuildFloorClassIndex(floorRows);
  const rows = (exposRows || []).map((row) => {
    let bucket = null;
    for (const key of v65FloorEvidenceKeys(row)) {
      if (index.has(key)) { bucket = index.get(key); break; }
    }
    if (!bucket) return { ...(row || {}) };
    return {
      ...(row || {}),
      // 기존 공식 전유부 원문은 보존하고 synthetic 용도 증거만 별도 추가한다.
      __v65FloorUse: bucket === "commercial" ? "근린생활시설" : "아파트",
    };
  });
  if (rows.length) rows[0] = { ...rows[0], __v65DetailVersion: V65_DETAIL_CACHE_VERSION };
  return rows;
}

async function v60FetchDetailParcel(env, parcel) {
  // 연결 안정성을 위해 동시에 최대 2개만 호출한다. 먼저 전유부 전체와 층별개요를
  // 받고, 그 다음 전유공용면적을 기존 제한으로 조회한다.
  const [exposResult, floorResult] = await Promise.allSettled([
    v60FetchParcelRows(
      env,
      BUILDING_HUB_EXPOS_URL,
      "Building HUB V65 complete exclusive unit",
      parcel,
      { maxPages: V65_EXPOS_MAX_PAGES, maxVariants: 2, pageConcurrency: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
    ),
    v60FetchParcelRows(
      env,
      BUILDING_HUB_FLOOR_URL,
      "Building HUB V65 floor overview",
      parcel,
      { maxPages: V65_FLOOR_MAX_PAGES, maxVariants: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
    ),
  ]);

  const rawExposRows = exposResult.status === "fulfilled" ? exposResult.value.rows || [] : [];
  const floorRows = floorResult.status === "fulfilled" ? floorResult.value.rows || [] : [];
  const floorIndexV65 = v65BuildFloorClassIndex(floorRows);
  const hasCommercialFloorV65 = [...floorIndexV65.values()].some((value) => value === "commercial");

  // 3천호 이상 대단지에서 area API는 호당 공용면적 행까지 반복되어 수만 건이 된다.
  // 층별개요에 상업층이 명확하고 전유부를 끝까지 확보했다면 상가 판정에는 full area가
  // 필요하지 않으므로 30페이지 추가 호출을 생략한다. 작은/불명확 필지는 기존대로 area를 확인한다.
  const skipHugeAreaScanV65 = rawExposRows.length >= 3000 && hasCommercialFloorV65;
  const areaResult = skipHugeAreaScanV65
    ? { status: "fulfilled", value: { rows: [], error: null, variant: "skipped_v65_floor_evidence" } }
    : await Promise.allSettled([
        v60FetchParcelRows(
          env,
          BUILDING_HUB_EXPOS_AREA_URL,
          "Building HUB V65 exclusive area",
          parcel,
          { maxPages: V60_DETAIL_MAX_PAGES, maxVariants: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
        ),
      ]).then((rows) => rows[0]);

  const areaRows = areaResult.status === "fulfilled" ? areaResult.value.rows || [] : [];
  const exposRows = v65EnrichExposRowsWithFloorUse(rawExposRows, floorRows);
  const errors = [];
  if (exposResult.status === "rejected") errors.push(String(exposResult.reason?.message || exposResult.reason));
  if (floorResult.status === "rejected") errors.push(String(floorResult.reason?.message || floorResult.reason));
  if (areaResult.status === "rejected") errors.push(String(areaResult.reason?.message || areaResult.reason));
  if (!rawExposRows.length && !areaRows.length && errors.length >= 2) throw new Error(errors.join(" | "));
  return { areaRows, exposRows, floorRows, warnings: errors, areaSkippedByFloorEvidenceV65: skipHugeAreaScanV65 };
}

function v65DetailCacheIsCurrent(row) {
  if (!row || row.status !== "ready") return false;
  const firstExpos = Array.isArray(row.expos_rows) ? row.expos_rows[0] : null;
  const firstArea = Array.isArray(row.area_rows) ? row.area_rows[0] : null;
  return cleanBuildingText(
    firstExpos?.detailVersionV65 ?? firstExpos?.detail_version_v65 ??
    firstArea?.detailVersionV65 ?? firstArea?.detail_version_v65
  ) === V65_DETAIL_CACHE_VERSION;
}

async function v60EnsureDetailCaches(env, detailParcelKeys) {
  const keys = [...new Set(detailParcelKeys || [])];
  let cacheMap = await v60LoadDetailCache(env, keys);
  // V65 이전 캐시는 3,000/4,000행 절단과 층별 용도 증거 부재가 있으므로
  // 선택된 상세 필지에 한해 딱 한 번 다시 받는다.
  cacheMap = new Map([...cacheMap.entries()].filter(([, row]) => v65DetailCacheIsCurrent(row)));
  let missing = keys.filter((key) => !cacheMap.has(key));
  if (missing.length) {
    const batch = missing.slice(0, V60_DETAIL_BATCH);
    const results = await mapBuildingWithConcurrency(
      batch,
      V60_DETAIL_CONCURRENCY,
      async (parcelKey) => {
        const parcel = buildingParcelKeyPartsV51(parcelKey);
        if (!parcel) return { parcelKey, data: null, error: "invalid_parcel" };
        try {
          return { parcelKey, data: await v60FetchDetailParcel(env, parcel), error: null };
        } catch (error) {
          return { parcelKey, data: null, error: String(error?.message || error) };
        }
      }
    );
    const now = new Date().toISOString();
    const writes = results.map((result) => ({
      parcel_key: result.parcelKey,
      region_key: v60RegionKeyFromParcelKey(result.parcelKey),
      expos_rows: compactBuildingDetailRows(result.data?.exposRows || [], V65_EXPOS_CACHE_MAX_ROWS),
      area_rows: (() => {
        const rows = compactBuildingDetailRows(result.data?.areaRows || []);
        if (rows.length && !(result.data?.exposRows || []).length) {
          rows[0] = { ...rows[0], detailVersionV65: V65_DETAIL_CACHE_VERSION };
        }
        return rows;
      })(),
      status: result.error ? "error" : "ready",
      fetched_at: now,
      expires_at: result.error
        ? v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES })
        : v60IsoAfter({ days: V60_DETAIL_CACHE_DAYS }),
      last_error: result.error || (result.data?.warnings || []).join(" | ") || null,
      updated_at: now,
    }));
    if (writes.length) await v60SupabaseUpsert(env, V60_DETAIL_CACHE_TABLE, writes, "parcel_key");
    cacheMap = await v60LoadDetailCache(env, keys);
    cacheMap = new Map([...cacheMap.entries()].filter(([, row]) => v65DetailCacheIsCurrent(row)));
    missing = keys.filter((key) => !cacheMap.has(key));
  }
  const errorRows = keys.map((key) => cacheMap.get(key)).filter((row) => row?.status === "error");
  return {
    complete: missing.length === 0,
    sourceComplete: missing.length === 0 && errorRows.length === 0,
    cacheMap,
    keys,
    missing,
    errorRows,
    evidence: keys.filter((key) => cacheMap.has(key)).map((key) => ({
      parcelKey: key,
      status: cacheMap.get(key)?.status || "ready",
    })),
  };
}

function v60DetailUnitKey(row, index = 0) {
  const ho = normalizeDeliveryUnitName(unitHoName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const bld = normalizeDeliveryUnitName(cleanBuildingText(row?.bldNm ?? row?.bld_nm));
  if (ho) return [bld || "BLD", dong || "DONG", floor || "FLOOR", ho].join("|");
  const pk = cleanBuildingText(publicDataField(row, "mgmHoDetlPk", "mgm_ho_detl_pk", "mgmBldrgstPk", "mgm_bldrgst_pk"));
  if (pk) return `PK:${pk}`;
  return `ROW:${index}:${bld}:${dong}:${floor}`;
}

function v62ApartmentShopNameHint(row) {
  const dongName = cleanBuildingText(
    publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
  ).replace(/\s+/g, "");

  // 구축 공동주택 대장은 상가동의 주용도를 "공동주택"으로 잘못 남긴 사례가 많다.
  // 동명 자체에 상가/근린생활시설이 명시된 경우에만 상가 전용동으로 인정한다.
  return !!dongName && /상가|근린생활시설/.test(dongName);
}

function v62ParcelHasKaptMatch(row, kaptMatches) {
  const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
  if (!parcelKey) return false;
  return (kaptMatches || []).some((match) => cleanBuildingText(match?.parcelKey) === cleanBuildingText(parcelKey));
}

function v60Classification(row) {
  const base = buildingHousingClassification(row);
  const purpose = buildingPurposeText(row).replace(/\s+/g, "");

  // V62 hotfix: K-APT가 주거 세대수를 담당하더라도 "상가동/상가/근린생활시설동"은
  // 별도 배송호수다. 목적코드가 공동주택으로 남아 있어도 동명이라는 직접 증거를 우선한다.
  if (v62ApartmentShopNameHint(row)) {
    return {
      ...base,
      apartment: false,
      officetel: false,
      residential: false,
      commercial: true,
      mixedUse: false,
      housingType: "commercial",
    };
  }
  const explicitResidential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
  const explicitCommercial = /근린생활시설|판매시설|사무소|상점|점포|소매점|음식점|의료시설|병원|의원|약국|교육연구시설|학원|숙박시설|호텔|모텔|업무시설/.test(purpose);
  // V62: mainPurps가 근린생활시설이어도 etcPurps에 주택/다가구가 명시되면 실제 혼합건물이다.
  // 기존에는 이런 행이 commercial-only가 되어 fmlyCnt가 상가호수로 들어가거나 주거가 누락됐다.
  if (explicitResidential && explicitCommercial && !base.officetel) {
    return { ...base, apartment: base.apartment === true, residential: true, commercial: true, mixedUse: true, housingType: "mixed" };
  }
  if (explicitCommercial && !explicitResidential && !base.officetel) {
    return { ...base, apartment: false, residential: false, commercial: true, mixedUse: false, housingType: "commercial" };
  }
  return base;
}

function v62PurposeResidentialCountHint(row) {
  const purpose = cleanBuildingText(buildingPurposeText(row));
  if (!purpose) return 0;
  const counts = [];
  const patterns = [
    /\((\d{1,4})\s*(?:가구|세대|호)\)/g,
    /(?:다가구(?:용)?(?:단독)?주택|다세대주택|연립주택|도시형생활주택|주택)\s*\((\d{1,4})\s*(?:가구|세대|호)?\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(purpose))) {
      const value = Math.max(0, Math.trunc(Number(match[1]) || 0));
      if (value > 0) counts.push(value);
    }
  }
  return counts.length ? Math.max(...counts) : 0;
}

function v60RelevantTitles(rows) {
  return (rows || []).filter((row) => row && !isAncillaryBuildingRecord(row));
}

function v60ParentTitleForDetail(row, titleRows) {
  const titles = v60RelevantTitles(titleRows);
  if (!titles.length) return null;
  const upper = cleanBuildingText(publicDataField(row, "mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"));
  if (upper) {
    const exact = titles.find((title) => buildingRecordKey(title) === upper);
    if (exact) return exact;
  }
  const rowBld = v60RawNameText(row?.bldNm ?? row?.bld_nm);
  const rowDong = v60RawNameText(row?.dongNm ?? row?.dong_nm);
  if (rowBld || rowDong) {
    const named = titles.filter((title) => {
      const titleBld = v60RawNameText(title?.bldNm ?? title?.bld_nm);
      const titleDong = v60RawNameText(title?.dongNm ?? title?.dong_nm);
      return (rowBld && (rowBld === titleBld || rowBld === titleDong)) ||
        (rowDong && (rowDong === titleDong || rowDong === titleBld));
    });
    if (named.length === 1) return named[0];
  }
  if (titles.length === 1) return titles[0];
  const classification = v60Classification(row);
  const sameClass = titles.filter((title) => {
    const tc = v60Classification(title);
    if (classification.residential && !classification.commercial) return tc.residential && !tc.commercial;
    if (classification.commercial && !classification.residential) return tc.commercial && !tc.residential;
    return false;
  });
  return sameClass.length === 1 ? sameClass[0] : null;
}

function v60ElevatorStatusFromTitle(row) {
  const info = buildingElevatorInfo(row);
  if (info.hasElevator) return { status: "yes", info, reason: "title_positive" };
  if (info.explicitZero) return { status: "no", info, reason: "title_zero" };
  return { status: "unknown", info, reason: "title_unknown" };
}

function v60KaptElevatorStatus(match, titleRowsByParcel) {
  const info = match?.normalized || {};
  const titles = v60RelevantTitles(titleRowsByParcel.get(match?.parcelKey) || [])
    .filter((row) => v60Classification(row).apartment && v60TitleCoveredByKapt(row, [match]));
  const positiveTitle = titles.find((row) => buildingElevatorInfo(row).hasElevator);
  if (Number(info.elevatorCount || 0) > 0) {
    return { status: "yes", reason: "kapt_positive", elevatorCount: Number(info.elevatorCount || 0) };
  }
  if (positiveTitle) {
    const titleInfo = buildingElevatorInfo(positiveTitle);
    return { status: "yes", reason: "title_positive_counterevidence", elevatorCount: titleInfo.total };
  }
  if (info.elevatorKnown === true) {
    const allKnownZero = titles.length === 0 || titles.every((row) => buildingElevatorInfo(row).explicitZero);
    if (allKnownZero) return { status: "no", reason: "kapt_zero", elevatorCount: 0 };
  }
  const knownTitle = titles.map(v60ElevatorStatusFromTitle).find((item) => item.status !== "unknown");
  if (knownTitle) return { ...knownTitle, elevatorCount: knownTitle.info?.total || 0 };
  return { status: "unknown", reason: "kapt_unknown", elevatorCount: 0 };
}

function v60ClassificationBucket(classification) {
  if (classification?.residential && !classification?.commercial) return "residential";
  if (classification?.commercial && !classification?.residential) return "commercial";
  if (classification?.residential && classification?.commercial) return "mixed";
  return "unclassified";
}

function v62ResolvedClassificationBucket(row, classification) {
  const direct = v60ClassificationBucket(classification);
  if (direct === "residential" || direct === "commercial") return direct;

  // 기존 "용도 미분류"에는 실제로 용도 데이터가 있는 행도 섞여 있었다.
  // 수량 자체는 건드리지 않고, 주용도(없으면 전체 용도 문자열)가 한쪽으로 명확할 때만
  // 주거/상업 버킷을 결정한다. 혼합/빈 용도는 계속 unclassified로 남긴다.
  const mainPurpose = cleanBuildingText(
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm")
  ).replace(/\s+/g, "");
  const purpose = (mainPurpose || cleanBuildingText(buildingPurposeText(row)).replace(/\s+/g, ""));
  if (!purpose) return direct;

  const residential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
  const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|영유아보육시설|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|위험
```

## v60EnsureDetailCaches #2
```js


function v60RouteCacheExpiry() {
  return v60IsoAfter({ days: V60_ROUTE_CACHE_DAYS });
}

async function handleBuildingStatsRequest(request, env) {
  await verifySupabaseUserByJwt(request, env);

  const body = await readJsonBody(request);
  const scope = normalizeBuildingStatsScope(body);
  const normalized = normalizeTerrainGeometry(body?.geometry || body?.polygon || body?.geojson);
  const geometryHash = await terrainGeometryHash(normalized);
  const polygonAreaM2 = calculateTerrainPolygonAreaM2(normalized.geometry);
  if (polygonAreaM2 == null) throw httpError(400, "Failed to calculate polygon area");

  const forceRefresh = body?.forceRefresh === true || body?.force_refresh === true;
  const cachedRow = await fetchBuildingStatsCache(env, scope.scopeType, scope.scopeKey);
  if (isBuildingStatsCacheFresh(cachedRow, geometryHash, forceRefresh)) {
    return jsonResp({
      ok: true,
      cached: true,
      cacheAvailable: true,
      cacheVersion: BUILDING_STATS_SOURCE_VERSION,
      cacheExpiresAt: cachedRow?.expires_at || null,
      stale: false,
      legacyCache: false,
      needsRefresh: false,
      requiresGeocoding: false,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
      buildingStats: buildingStatsRowToResponse(cachedRow),
    });
  }

  const cacheOnly = body?.cacheOnly === true || body?.cache_only === true;
  if (cacheOnly && !forceRefresh) {
    return jsonResp({
      ok: true,
      cached: false,
      cacheAvailable: false,
      cacheVersion: BUILDING_STATS_SOURCE_VERSION,
      cacheExpiresAt: cachedRow?.expires_at || null,
      stale: false,
      requiresComputation: true,
      requiresGeocoding: false,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
    });
  }

  const rawScopeParcels = body?.scopeParcels ?? body?.scope_parcels ?? [];
  const verifiedScopeParcels = normalizeVerifiedScopeParcels(rawScopeParcels, normalized.geometry, scope.zipcode);
  const scopeDiscoveryDiagnostics = body?.scopeParcelDiscovery ?? body?.scope_parcel_discovery ?? null;
  const discoverySampleCount = Math.max(0, Math.trunc(Number(scopeDiscoveryDiagnostics?.sampleCount ?? scopeDiscoveryDiagnostics?.sample_count) || 0));
  const minimumDenseSamples = Math.min(500, Math.max(60, Math.ceil(polygonAreaM2 / 350)));
  // V62: 구버전 프론트(180-point discovery)가 큰 도시 라우트의 소필지를 누락한 채 결과를 캐시하지 못하게 차단한다.
  if (polygonAreaM2 >= 50000 && discoverySampleCount > 0 && discoverySampleCount < minimumDenseSamples) {
    throw httpError(409, `필지 탐색 밀도가 부족합니다 (${discoverySampleCount}/${minimumDenseSamples}). 최신 프론트로 새로고침 후 다시 분석해 주세요.`);
  }
  const requestedLegalDongCodes = normalizeLegalDongCodes(body);
  const scopeLegalDongCodes = [...new Set([...verifiedScopeParcels.map.keys()].map((key) => v60RegionKeyFromParcelKey(key)).filter(Boolean))];
  const legalDongCodes = [...new Set([
    ...scopeLegalDongCodes,
    ...requestedLegalDongCodes.map((row) => row?.legalDongCode).filter(Boolean),
  ])].filter((code) => /^\d{10}$/.test(code));

  if (verifiedScopeParcels.map.size === 0) {
    return jsonResp({
      ok: true,
      cached: false,
      stale: false,
      requiresScopeDiscovery: true,
      requiresGeocoding: false,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
      polygonAreaM2,
      legalDongCodes,
      message: "폴리곤 내부 필지 확인이 필요합니다.",
    });
  }

  // Stage 1: title source. Every request is bounded. The front-end already understands
  // requiresScopeTitleContinuation and simply calls this endpoint again.
  const titleState = await v60EnsureScopeTitles(env, verifiedScopeParcels);
  if (!titleState.complete) {
    const processed = titleState.scopeKeys.length - titleState.unresolved.length;
    return jsonResp({
      ok: true,
      cached: false,
      stale: false,
      requiresScopeTitleContinuation: true,
      requiresGeocoding: false,
      partial: true,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
      polygonAreaM2,
      scopeTitleContinuation: {
        evidence: titleState.evidence,
        processedParcelCount: processed,
        remainingParcelCount: titleState.unresolved.length,
        totalDirectParcelCount: titleState.scopeKeys.length,
        regionSync: titleState.regionSync ? {
          regionKey: titleState.regionSync.region_key || titleState.regionSync.regionKey || null,
          completedPages: titleState.regionSync.completedPages?.length || titleState.regionSync.completed_pages?.length || 0,
          totalPages: titleState.regionSync.total_pages || titleState.regionSync.totalPages || 0,
          remainingPages: titleState.regionSync.remainingPages || 0,
          lastError: titleState.regionSync.last_error || titleState.regionSync.lastError || null,
        } : null,
      },
      progress: {
        processedParcelCount: processed,
        remainingParcelCount: titleState.unresolved.length,
        totalDirectParcelCount: titleState.scopeKeys.length,
      },
      message: titleState.regionSync
        ? "건축물대장 표제부 원천을 지역 캐시에 채우고 있습니다."
        : "누락 필지의 건축물대장 표제부를 확인하고 있습니다.",
    });
  }

  const titleRowsByParcel = v60TitleRowsByParcel(titleState.cacheMap);
  const allTitleRows = v60AllTitleRows(titleState.cacheMap);

  // Stage 2: K-APT candidate enrichment. Only apartment-looking names from this scope
  // become candidates, so a legal dong with dozens of complexes does not cause dozens
  // of basic/detail requests.
  const kaptRegionMap = await v60EnsureKaptRegionLists(env, legalDongCodes);
  const kaptCandidates = v60KaptCandidateRows(kaptRegionMap, allTitleRows, verifiedScopeParcels);
  const kaptState = await v60EnsureKaptComplexInfo(env, kaptCandidates);
  if (!kaptState.complete) {
    const processed = kaptState.codes.length - kaptState.missing.length;
    return jsonResp({
      ok: true,
      cached: false,
      stale: false,
      requiresKaptInfoContinuation: true,
      requiresGeocoding: false,
      partial: true,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
      polygonAreaM2,
      kaptInfoContinuation: {
        evidence: kaptState.evidence,
        processedComplexCount: processed,
        remainingComplexCount: kaptState.missing.length,
        totalComplexCount: kaptState.codes.length,
      },
      progress: {
        processedComplexCount: processed,
        remainingComplexCount: kaptState.missing.length,
        totalComplexCount: kaptState.codes.length,
      },
      message: "폴리곤 내부 아파트 후보의 K-APT 정보만 확인하고 있습니다.",
    });
  }

  const kaptMatches = v60BuildKaptMatches(kaptCandidates, kaptState.cacheMap, allTitleRows, verifiedScopeParcels);

  // Stage 3: detail only where title/K-APT cannot provide an exact unit count or where
  // mixed-use classification requires exclusive-unit rows.
  const detailParcelKeys = v60DetermineDetailParcels(titleRowsByParcel, kaptMatches);
  const detailState = await v60EnsureDetailCaches(env, detailParcelKeys);
  if (!detailState.complete) {
    const processed = detailState.keys.length - detailState.missing.length;
    return jsonResp({
      ok: true,
      cached: false,
      stale: false,
      requiresDetailContinuation: true,
      requiresGeocoding: false,
      partial: true,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      geometryHash,
      polygonAreaM2,
      detailContinuation: {
        evidence: detailState.evidence,
        processedParcelCount: processed,
        remainingParcelCount: detailState.missing.length,
        totalDetailParcelCount: detailState.keys.length,
      },
      progress: {
        processedParcelCount: processed,
        remainingParcelCount: detailState.missing.length,
        totalDetailParcelCount: detailState.keys.length,
      },
      message: "상가·오피스텔·혼합건물의 실제 전유호만 상세조회하고 있습니다.",
    });
  }

  if (!detailState.sourceComplete) {
    const errors = detailState.errorRows.slice(0, 8).map((row) => `${row.parcel_key}: ${row.last_error || "detail source failed"}`);
    throw httpError(503, `건축물 상세 원천 조회 실패: ${errors.join(" | ")}`);
  }

  const walkupMinGroundFloors = Math.max(1, Math.trunc(Number(body?.walkupMinGroundFloors ?? body?.walkup_min_ground_floors) || 3));

  // V66: K-APT로 정확히 결속된 아파트 단지에만 주택인허가 복리분양시설을 조회한다.
  // 별도 HsPms 활용승인이 없거나 원천이 일시 실패해도 기존 건축물대장/K-APT 계산은 유지한다.
  const housingPermitWelfareEvidence = await v66FetchHousingPermitWelfareEvidence(env, kaptMatches);

  const aggregate = v60AggregateBuildingStats({
    titleRowsByParcel,
    detailCacheMap: detailState.cacheMap,
    kaptMatches,
    verifiedScopeParcels,
    walkupMinGroundFloors,
    titleDiagnostics: {
      scopeParcelCount: titleState.scopeKeys.length,
      titleParcelCount: [...titleRowsByParcel.values()].filter((rows) => rows.length > 0).length,
      titleRowCount: allTitleRows.length,
      emptyTitleParcelCount: [...titleRowsByParcel.values()].filter((rows) => rows.length === 0).length,
    },
    detailDiagnostics: {
      requestedParcelCount: detailState.keys.length,
      readyParcelCount: detailState.keys.filter((key) => detailState.cacheMap.get(key)?.status === "ready").length,
    },
    kaptDiagnostics: {
      candidateComplexCount: kaptCandidates.length,
      fetchedComplexCount: kaptState.codes.length,
      matchedComplexCount: kaptMatches.length,
      regionErrors: [...kaptRegionMap.values()].filter((row) => row?.status === "error").map((row) => row?.last_error).filter(Boolean),
      complexErrors: [...kaptState.cacheMap.values()].filter((row) => row?.status === "error").map((row) => row?.last_error).filter(Boolean),
    },
    housingPermitWelfareEvidence,
  });

  if (aggregate.deliveryUnitCount <= 0) {
    throw httpError(422, "폴리곤 내부 표제부는 확인했지만 배송호수 근거를 만들지 못했습니다. 0호 결과는 저장하지 않습니다.");
  }
  if (aggregate.elevatorBuildingCount > aggregate.matchedBuildingCount || aggregate.noElevatorBuildingCount > aggregate.matchedBuildingCount) {
    throw httpError(500, "V62 elevator building invariant failed");
  }

  const sourceWarnings = [];
  const kaptRegionErrors = [...kaptRegionMap.values()].filter((row) => row?.status === "error");
  const kaptComplexErrors = [...kaptState.cacheMap.values()].filter((row) => row?.status === "error");
  if (kaptRegionErrors.length || kaptComplexErrors.length) {
    sourceWarnings.push("K-APT 일부 원천이 일시적으로 실패하여 해당 단지는 건축물대장 표제부 기준으로 계산했습니다.");
  }
  if ((housingPermitWelfareEvidence?.errors || []).length) {
    sourceWarnings.push("주택인허가 복리분양시설 일부 원천을 조회하지 못해 해당 단지는 기존 건축물대장/K-APT 수량만 사용했습니다. HsPmsHubService 활용승인도 확인해 주세요.");
  }

  const row = buildingStatsDatabaseRow({
    scope,
    geometryHash,
    polygonAreaM2,
    aggregate,
    records: allTitleRows,
    walkupMinGroundFloors,
    locationSource: cleanBuildingText(body?.locationSource ?? body?.location_source) || "KAKAO_ROUTE_POLYGON_REVERSE_PARCEL",
    sourceMode: "BUILDING_HUB_V65_PARCEL_CACHE+K_APT_SPLIT_FAMILY+HSPMS_WELFARE_EXPLICIT_RESCUE",
    sourceVersion: BUILDING_STATS_SOURCE_VERSION,
    sourceWarnings,
  });
  row.expires_at = v60RouteCacheExpiry();
  row.unit_analysis_method = "V66_DETERMINISTIC_PARCEL_TITLE+SPLIT_KAPT_FAMILY+COMPLETE_EXPOS+HSPMS_WELFARE_EXPLICIT_COUNT_RESCUE+NO_AREA_ESTIMATION";

  const savedRow = await upsertBuildingStatsCache(env, row);
  return jsonResp({
    ok: true,
    cached: false,
    cacheAvailable: true,
    cacheVersion: BUILDING_STATS_SOURCE_VERSION,
    cacheExpiresAt: savedRow?.expires_at || row.expires_at,
    stale: false,
    provisional: false,
    requiresGeocoding: false,
    partial: false,
    warning: sourceWarnings.join(" | ") || null,
    scopeType: scope.scopeType,
    scopeKey: scope.scopeKey,
    geometryHash,
    buildingStats: buildingStatsRowToResponse(savedRow) || buildingStatsRowToResponse(row),
  });
}
async function handleZipBoundaryRequest(url) {
  const zipcode = (url.searchParams.get("zipcode") || "").trim();
  const debug = url.searchParams.get("debug") === "1";

  if (!/^\d{5}$/.test(zipcode)) {
    return jsonResp(
      { error: "유효한 5자리 zipcode 쿼리 파라미터가 필요함" },
      400
    );
  }

  const upstream = await fetchFromJuso(zipcode, debug);

  if (!upstream.ok) {
    return jsonResp(
      {
        error: "주소정보 API 호출 실패",
        zipcode,
        status: upstream.status || 0,
        attemptCount: upstream.attemptCount || 0,
        variant: upstream.variant || null,
        detail: upstream.detail || "",
        responseSnippet: upstream.responseSnippet || "",
        sessionStatus: upstream.sessionStatus || 0,
        hasCookie: !!upstream.hasCookie,
      },
      502
    );
  }

  const data = upstream.data;

  if (!data?.results || !Array.isArray(data.results.content)) {
    return jsonResp(
      {
        error: "응답 데이터 형식 오류",
        response: data,
      },
      500
    );
  }

  if (data.results.content.length === 0) {
    return jsonResp(
      {
        error: "해당 우편번호의 경계 데이터가 없음",
        zipcode,
      },
      404
    );
  }

  const item = data.results.content[0];

  const normalized = normalizeGeometry(item?.geom);
  if (!normalized.ok) {
    return jsonResp(
      {
        error: normalized.error,
        detail: normalized.detail || null,
        type: normalized.type || null,
        geom: normalized.geom || undefined,
      },
      500
    );
  }

  const polygon5179 = normalized.geojson.coordinates;
  const center5179 = computeCenter5179(polygon5179);

  const metadata = {
    ctpvNm: item?.ctpvNm ?? null,
    sigNm: item?.sigNm ?? null,
    sbdno: item?.sbdno ?? zipcode,
    lgvReplcCd: item?.lgvReplcCd ?? null,
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

```

## building_v60_detail_cache #1
```js
red?.geocodedBuildingCount || 0),
    unlocatedBuildingCount: Number(prepared?.unlocatedBuildingCount || 0),
    coveragePercent: Number(prepared?.coveragePercent || 0),
    // V36: 화면/통계의 엘베 O 건물 수는 공식 양수 등록만 집계한다.
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
    unitSourceComplete: false,
    unitSourceWarnings: ["TITLE_BASELINE_FALLBACK_APPLIED"],
    breakdown: {
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
          registeredZeroCanBeOverridden: true,
          minFloors: BUILDING_INFER_ELEVATOR_ZERO_MIN_FLOORS,
          minHeightM: BUILDING_INFER_ELEVATOR_ZERO_MIN_HEIGHT_M,
          collectiveMinUnits: BUILDING_INFER_ELEVATOR_COLLECTIVE_MIN_UNITS,
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
    source_fetched_at: now,
    location_source: locationSource,

    breakdown: {
      ...(aggregate.breakdown || {}),
      sourceWarnings: Array.isArray(sourceWarnings) ? sourceWarnings : [],
    },

    calculated_at: now,
    expires_at: nextBuildingStatsExpiry(),
    refresh_status: "ready",
    last_refresh_attempt_at: now,
    last_refresh_error: null,
  };
}

// ---------- V60 deterministic parcel-cache building analysis ----------------------
// Official-source design:
// 1) Kakao/front-end only discovers verified parcels inside the route polygon.
// 2) Building HUB title records are cached by exact parcel. Large legal-dong scopes are
//    populated by resumable title-page sync; small scopes use exact parcel requests.
// 3) K-APT is an apartment-only enrichment source. It never propagates elevator status
//    to a different building merely because it shares the same parcel.
// 4) Exclusive-unit detail is fetched only for collective/mixed buildings that actually
//    need unit-level classification. No floor/area/parking unit-count estimation is used.

const V60_TITLE_CACHE_TABLE = "building_v60_title_cache";
const V60_TITLE_SYNC_TABLE = "building_v60_title_sync";
const V60_DETAIL_CACHE_TABLE = "building_v60_detail_cache";
const V60_KAPT_REGION_CACHE_TABLE = "building_v60_kapt_region_cache";
const V60_KAPT_COMPLEX_CACHE_TABLE = "building_v60_kapt_complex_cache";

const V60_TITLE_CACHE_DAYS = 32;
const V60_TITLE_EMPTY_CACHE_DAYS = 7;
const V60_DETAIL_CACHE_DAYS = 32;
const V60_KAPT_REGION_CACHE_DAYS = 14;
const V60_KAPT_COMPLEX_CACHE_DAYS = 14;
const V60_ERROR_CACHE_MINUTES = 15;
const V60_ROUTE_CACHE_DAYS = 30;

const V60_REGION_SYNC_SCOPE_THRESHOLD = 60;
const V60_REGION_TITLE_PAGES_PER_REQUEST = 8;
// Building HUB는 조회량이 많을 때 [05] 서비스 연결실패/빈 HTTP 200 응답이 발생할 수 있다.
// 조회 대상과 페이지 수는 그대로 두고 동시 연결만 2개로 제한해 과도한 burst를 막는다.
const V60_REGION_TITLE_PAGE_CONCURRENCY = 2;
const V60_REGION_TITLE_MAX_PAGES = 200;
const V60_DIRECT_TITLE_BATCH = 12;
const V60_DIRECT_TITLE_CONCURRENCY = 2;
const V60_KAPT_COMPLEX_BATCH = 4;
const V60_KAPT_COMPLEX_CONCURRENCY = 2;
const V60_DETAIL_BATCH = 6;
// 상세조회는 한 필지에서 area/expos 2개를 동시에 요청하므로 필지 concurrency는 1로 둔다.
// 결과/판정 로직은 바꾸지 않고 Building HUB 실제 동시 연결만 최대 2개로 유지한다.
const V60_DETAIL_CONCURRENCY = 1;
const V60_PUBLIC_TIMEOUT_MS = 8000;
// V60 Building HUB 전용 네트워크 안정화 값. K-APT timeout은 기존 V60_PUBLIC_TIMEOUT_MS를 그대로 사용한다.
const V60_BUILDING_HUB_TIMEOUT_MS = 15000;
const V60_TITLE_PAGE_TIMEOUT_MS = 15000;
const V60_BUILDING_HUB_MAX_ATTEMPTS = 3;
const V60_BUILDING_HUB_RETRY_BASE_DELAY_MS = 800;
const V60_DETAIL_MAX_PAGES = 30;
// V65: 공공데이터포털 Building HUB가 numOfRows=1000을 요청해도 실제 응답은
// 100건 단위로 잘리는 사례가 있다. 기존 30페이지 제한은 정확히 3,000건에서
// 전유부를 끊어 4천세대 이상 대단지의 뒤쪽 호/상가가 통째로 누락됐다.
// 전유부(expos)는 실제 배송 단위이므로 충분히 끝까지 읽고, 전유공용면적(area)은
// 기존 상한을 유지한다. 층별개요는 상가층 판정에만 쓰며 행 수가 훨씬 작다.
const V65_EXPOS_MAX_PAGES = 120;
const V65_FLOOR_MAX_PAGES = 40;
const V65_EXPOS_CACHE_MAX_ROWS = 12000;
const V65_DETAIL_CACHE_VERSION = "V65_COMPLETE_EXPOS_FLOOR_USE";
// V66 HsPms는 단지별 복리분양시설 건수가 작다. K-APT로 실제 아파트 단지가
// 확인된 필지만 조회하고, 관리공동부대복리시설은 존재 진단용으로만 사용한다.
const V66_HSPMS_MAX_PAGES = 20;
const V66_HSPMS_TIMEOUT_MS = 15000;
const V66_HSPMS_CONCURRENCY = 1;
const V60_CACHE_QUERY_BATCH = 80;

function v60IsoAfter({ days = 0, minutes = 0 } = {}) {
  return new Date(Date.now() + days * 86400000 + minutes * 60000).toISOString();
}

function v60Fresh(row) {
  if (!row || typeof row !== "object") return false;
  const value = Date.parse(row.expires_at || "");
  return Number.isFinite(value) && value > Date.now();
}

function v60RegionKeyFromParcelKey(parcelKey) {
  const parts = buildingParcelKeyPartsV51(parcelKey);
  return parts ? `${parts.sigunguCd}${parts.bjdongCd}` : "";
}

function v60RegionParts(regionKey) {
  const digits = String(regionKey || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) return null;
  return { regionKey: digits, sigunguCd: digits.slice(0, 5), bjdongCd: digits.slice(5, 10) };
}

function v60RetryableBuildingHubError(error) {
  if (publicDataRetryableError(error)) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("[05]") ||
    message.includes("서비스 연결실패") ||
    message.includes("request failed: http 200") ||
    message.includes("response parse error") ||
    message.includes("empty response")
  );
}

async function v60WaitForBuildingHubRetry(attempt) {
  const delay = V60_BUILDING_HUB_RETRY_BASE_DELAY_MS * Math.max(1, Number(attempt) || 1);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

async function v60FetchBuildingHubJson(
  url,
  params,
  env,
  label,
  timeoutMs = V60_BUILDING_HUB_TIMEOUT_MS
) {
  let lastError = null;
  for (let attempt = 1; attempt <= V60_BUILDING_HUB_MAX_ATTEMPTS; attempt++) {
    try {
      // 공통 fetch 로직은 그대로 사용하되 V60에서만 1회 호출 단위로 재시도를 제어한다.
      return await fetchPublicDataJson(url, params, env, label, timeoutMs, 1);
    } catch (error) {
      lastError = error;
      if (attempt >= V60_BUILDING_HUB_MAX_ATTEMPTS || !v60RetryableBuildingHubError(error)) {
        throw error;
      }
      await v60WaitForBuildingHubRetry(attempt);
    }
  }
  throw lastError || httpError(502, `${label} request failed`);
}

function v60PostgrestIn(values) {
  return `in.(${(values || []).map((value) => `"${String(value).replace(/"/g, "")}"`).join(",")})`;
}

async function v60SupabaseGet(env, table, query = {}) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const res = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/${table}?${params.toString()}`,
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
    throw httpError(502, `V60 cache lookup failed (${table}): ${snippet(text) || `HTTP ${res.status}`}`);
  }
  return Array.isArray(rows) ? rows : [];
}

async function v60SupabaseUpsert(env, table, rows, onConflict) {
  const payload = Array.isArray(rows) ? rows.filter(Boolean) : [rows].filter(Boolean);
  if (!payload.length) return [];
  const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (onConflict) params.set("on_conflict", onConflict);
  const res = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/${table}?${params.toString()}`,
    {
      method: "POST",
      headers: terrainSupabaseHeaders(env, "resolution=merge-duplicates,return=representation"),
      body: JSON.stringify(payload),
      cf: { cacheTtl: 0, cacheEverything: false },
    },
    BUILDING_STATS_SUPABASE_TIMEOUT_MS
  );
  const text = await res.text();
  let saved = [];
  try { saved = text ? JSON.parse(text) : []; } catch {}
  if (!res.ok) {
    throw httpError(502, `V60 cache save failed (${table}): ${snippet(text) || `HTTP ${res.status}`}`);
  }
  return Array.isArray(saved) ? saved : [];
}

async function v60LoadRowsByKeys(env, table, keyColumn, keys, select = "*") {
  const unique = [...new Set((keys || []).map(cleanBuildingText).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += V60_CACHE_QUERY_BATCH) {
    const batch = unique.slice(i, i + V60_CACHE_QUERY_BATCH);
    if (!batch.length) continue;
    const rows = await v60SupabaseGet(env, table, {
      [keyColumn]: v60PostgrestIn(batch),
      select,
    });
    out.push(...rows);
  }
  return out;
}

async function v60LoadTitleCache(env, parcelKeys) {
  const rows = await v60LoadRowsByKeys(
    env,
    V60_TITLE_CACHE_TABLE,
    "parcel_key",
    parcelKeys,
    "parcel_key,region_key,rows,status,fetched_at,expires_at,last_error"
  );
  return new Map(rows.filter(v60Fresh).map((row) => [row.parcel_key, row]));
}

async function v60LoadDetailCache(env, parcelKeys) {
  const rows = await v60LoadRowsByKeys(
    env,
    V60_DETAIL_CACHE_TABLE,
    "parcel_key",
    parcelKeys,
    "parcel_key,region_key,expos_rows,area_rows,status,fetched_at,expires_at,last_error"
  );
  return new Map(rows.filter(v60Fresh).map((row) => [row.parcel_key, row]));
}

async function v60LoadKaptComplexCache(env, kaptCodes) {
  const rows = await v60LoadRowsByKeys(
    env,
    V60_KAPT_COMPLEX_CACHE_TABLE,
    "kapt_code",
    kaptCodes,
    "kapt_code,bjd_code,list_row,basic_row,detail_row,status,fetched_at,expires_at,last_error"
  );
  return new Map(rows.filter(v60Fresh).map((row) => [row.kapt_code, row]));
}

async function v60LoadTitleSync(env, regionKey) {
  const rows = await v60SupabaseGet(env, V60_TITLE_SYNC_TABLE, {
    region_key: `eq.${regionKey}`,
    select: "region_key,total_count,page_size,total_pages,completed_pages,complete,status,fetched_at,expires_at,last_error",
    limit: "1",
  });
  const row = rows[0] || null;
  return row && v60Fresh(row) ? row : null;
}

async function v60LoadKaptRegionCache(env, bjdCode) {
  const rows = await v60SupabaseGet(env, V60_KAPT_REGION_CACHE_TABLE, {
    bjd_code: `eq.${bjdCode}`,
    select: "bjd_code,rows,status,fetched_at,expires_at,last_error",
    limit: "1",
  });
  const row = rows[0] || null;
  return row && v60Fresh(row) ? row : null;
}

function v60DedupeTitleRows(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const key = buildingRecordKey(row) || JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function v60ScopeTagTitleRow(row, parcelKey) {
  return {
    ...(row || {}),
    __scopeParcelKeyV20: parcelKey,
  };
}

function v60TitleGroupsFromPage(regionKey, rows) {
  const region = v60RegionParts(regionKey);
  const groups = new Map();
  if (!region) return groups;
  const digits = (value, length) => {
    const raw = String(value ?? "").replace(/\D/g, "");
    return raw ? raw.padStart(length, "0").slice(-length) : "";
  };
  for (const row of rows || []) {
    const bun = digits(publicDataField(row, "bun"), 4);
    const ji = digits(publicDataField(row, "ji"), 4) || "0000";
    if (!bun || Number(bun) <= 0) continue;
    const platGbCd = String(publicDataField(row, "platGbCd", "plat_gb_cd") ?? "0").replace(/\D/g, "") === "1" ? "1" : "0";
    const parcelKey = [region.sigunguCd, region.bjdongCd, platGbCd, bun, ji].join("|");
    if (!groups.has(parcelKey)) groups.set(parcelKey, []);
    groups.get(parcelKey).push(v60ScopeTagTitleRow(row, parcelKey));
  }
  return groups;
}

async function v60UpsertTitleGroups(env, regionKey, groups) {
  const keys = [...groups.keys()];
  if (!keys.length) return;
  const existing = await v60LoadTitleCache(env, keys);
  const now = new Date().toISOString();
  const rows = keys.map((parcelKey) => {
    const priorRows = Array.isArray(existing.get(parcelKey)?.rows) ? existing.get(parcelKey).rows : [];
    const merged = v60DedupeTi
```

## sourceComplete #1
```js
buildingStatsSelectColumns());
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
    Math.trunc(Num
```

## sourceComplete #2
```js
P ${res.status}`
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
    (none >= delivery * 0.75 || none + unknown >= delivery * 0.95)
  );
}

function isBuildingStatsCacheFresh(
  row,
  geometryHash,
  forceRefresh
) {
  if (forceRefresh) return false;

  // 현재 분석 알고리즘과 버전이 다른 캐시는 결과값이 정상처럼 보여도 재사용하지 않는다.
  // V20/V21/V22/V23 등 이전 캐시가 남아 있으면 반드시 현재 버전으로 다시 계산한다.
  if (
    String(row?.source_version || "") !==
    BUILDING_STATS_SOURCE_VERSION
  ) {
    
```

## sourceComplete #3
```js
orContradictsTitle = Boolean(
    (fallback?.classification?.commercial && floorHasResidential) ||
    (fallback?.classification?.residential && floorHasCommercial)
  );
  const smallExplicit = baseUnits > 0 && baseUnits <= 4;
  const boundedFloorEstimate = floorUnits <= 8 && floorUnits <= baseUnits + 4;

  if (
    fallback?.confidence === "authoritative" &&
    titleSingleUse &&
    floorContradictsTitle &&
    smallExplicit &&
    floorHasResidential &&
    floorHasCommercial &&
    boundedFloorEstimate
  ) {
    return {
      units: floorUnits,
      usedFloorOverride: true,
      reason: "small_explicit_mixed_floor_reconcile",
    };
  }

  return { units: baseUnits, usedFloorOverride: false, reason: null };
}

function buildingParcelQueryVariants(parcel) {
  const source = buildingParcelKeyPartsV51(parcel) || parcel;
  const regionParcels = buildingParcelRegionVariantsV51(source);
  const candidates = regionParcels.length ? regionParcels : [source];
  const variants = [];

  // 공공데이터 원천별로 특별자치도 신·구 시군구 코드가 다르므로
  // 같은 숫자 형식끼리 current/legacy를 먼저 시도하고, 그 다음 unpadded를 시도한다.
  for (const candidate of candidates) {
    variants.push({
      name: `padded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: candidate.bun,
        ji: candidate.ji,
      },
    });
  }

  for (const candidate of candidates) {
    variants.push({
      name: `unpadded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: String(Number(candidate.bun)),
        ji: String(Number(candidate.ji || "0")),
      },
    });
  }

  if (Number(source.ji || 0) === 0) {
    for (const candidate of candidates) {
      variants.push({
        name: `omit_zero_ji_${candidate.sigunguCd}`,
        params: {
          sigunguCd: candidate.sigunguCd,
          bjdongCd: candidate.bjdongCd,
          platGbCd: candidate.platGbCd,
          bun: candidate.bun,
        },
      });
    }
  }

  const seen = new Set();
  return variants.filter((variant) => {
    const key = JSON.stringify(variant.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function buildingUnitRowStableKey(row, fallbackIndex = 0) {
  const unitPk = cleanBuildingText(
    publicDataField(
      row,
      "mgmHoDetlPk",
      "mgm_ho_detl_pk",
      "mgmExposPubuseAreaPk",
      "mgm_expos_pubuse_area_pk",
      "mgmExposPubusePk",
      "mgm_expos_pubuse_pk"
    )
  );
  if (unitPk) return `unit-pk:${unitPk}`;

  const buildingPk = cleanBuildingText(
    publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk")
  );
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const ho = normalizeDeliveryUnitName(unitHoName(row));

  // 같은 건물의 모든 전유호가 동일한 mgmBldrgstPk를 공유할 수 있으므로
  // 건물 PK만으로 dedupe하면 수십 호가 1호로 뭉개진다.
  if (ho) {
    return ["unit", buildingPk || "NO_BUILDING_PK", dong || "DONG", floor || "FLOOR", ho].join("|");
  }

  const rowNo = cleanBuildingText(publicDataField(row, "rnum", "rowNo", "row_no"));
  if (buildingPk && rowNo) return `building-row:${buildingPk}|${rowNo}`;
  if (buildingPk) return `building-row:${buildingPk}|${dong}|${floor}|${fallbackIndex}`;

  return [dong, floor, ho, rowNo, fallbackIndex].join("|");
}

function compactBuildingDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const get = (...names) => publicDataField(row, ...names);
  const out = {
    sigunguCd: get("sigunguCd", "sigungu_cd"),
    bjdongCd: get("bjdongCd", "bjdong_cd"),
    platGbCd: get("platGbCd", "plat_gb_cd"),
    bun: get("bun"),
    ji: get("ji"),
    mgmBldrgstPk: get("mgmBldrgstPk", "mgm_bldrgst_pk"),
    mgmUpperBldrgstPk: get("mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"),
    mgmHoDetlPk: get("mgmHoDetlPk", "mgm_ho_detl_pk"),
    mgmExposPubuseAreaPk: get("mgmExposPubuseAreaPk", "mgm_expos_pubuse_area_pk"),
    mgmExposPubusePk: get("mgmExposPubusePk", "mgm_expos_pubuse_pk"),
    regstrKindCdNm: get("regstrKindCdNm", "regstr_kind_cd_nm"),
    exposPubuseGbCdNm: get("exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
    bldNm: get("bldNm", "bld_nm"),
    dongNm: get("dongNm", "dong_nm"),
    flrGbCdNm: get("flrGbCdNm", "flr_gb_cd_nm"),
    flrNo: get("flrNo", "flr_no"),
    flrNoNm: get("flrNoNm", "flr_no_nm", "floorNm", "floor_no"),
    hoNm: get("hoNm", "ho_nm", "hoNo", "ho_no", "unitNm", "unit_name", "unitNo", "unit_no"),
    mainPurpsCdNm: get("mainPurpsCdNm", "main_purps_cd_nm"),
    etcPurps: get("etcPurps", "etc_purps"),
    // V65 synthetic evidence. Official floor-overview rows are collapsed to a
    // single unambiguous residential/commercial hint for the same building+floor.
    floorUseV65: get("floorUseV65", "floor_use_v65", "__v65FloorUse"),
    detailVersionV65: get("detailVersionV65", "detail_version_v65", "__v65DetailVersion"),
    area: get("area", "flrArea", "flr_area", "areaM2", "area_m2"),
    areaExct: get("areaExct", "area_exct"),
    hhldCnt: get("hhldCnt", "hhld_cnt", "householdCnt", "household_count"),
    fmlyCnt: get("fmlyCnt", "fmly_cnt", "familyCnt", "family_count"),
    hoCnt: get("hoCnt", "ho_cnt", "hoCount", "ho_count", "unitCnt", "unit_count"),
    grndFlrCnt: get("grndFlrCnt", "grnd_flr_cnt"),
    rideUseElvtCnt: get("rideUseElvtCnt", "ride_use_elvt_cnt"),
    emgenUseElvtCnt: get("emgenUseElvtCnt", "emgen_use_elvt_cnt"),
    newPlatPlc: get("newPlatPlc", "new_plat_plc"),
    platPlc: get("platPlc", "plat_plc"),
    rnum: get("rnum", "rowNo", "row_no"),
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function compactBuildingDetailRows(rows, maxRows = 4000) {
  const out = [];
  for (const row of rows || []) {
    if (out.length >= maxRows) break;
    const compact = compactBuildingDetailRow(row);
    if (compact) out.push(compact);
  }
  return out;
}

function normalizeBuildingDetailEvidenceInput(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const parcelKey = cleanBuildingText(item.parcelKey ?? item.parcel_key);
    if (!parcelKey || seen.has(parcelKey)) continue;
    seen.add(parcelKey);
    out.push({
      parcelKey,
      areaRows: compactBuildingDetailRows(item.areaRows ?? item.area_rows ?? []),
      exposRows: compactBuildingDetailRows(item.exposRows ?? item.expos_rows ?? []),
      recapRows: compactBuildingDetailRows(item.recapRows ?? item.recap_rows ?? [], 1000),
      housePriceRows: compactBuildingDetailRows(item.housePriceRows ?? item.house_price_rows ?? [], 2000),
      floorRows: compactBuildingDetailRows(item.floorRows ?? item.floor_rows ?? [], 2000),
      sourceComplete: item.sourceComplete !== false && item.source_complete !== false,
    });
    if (out.length >= BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE) break;
  }
  return out;
}

function buildingDetailEvidenceFromResult(result) {
  if (!result?.parcel?.key) return null;
  return {
    parcelKey: result.parcel.key,
    areaRows: compactBuildingDetailRows(result.areaRows || []),
    exposRows: compactBuildingDetailRows(result.exposRows || []),
    recapRows: compactBuildingDetailRows(result.recapRows || [], 1000),
    housePriceRows: compactBuildingDetailRows(result.housePriceRows || [], 2000),
    floorRows: compactBuildingDetailRows(result.floorRows || [], 2000),
    sourceComplete: result.sourceComplete !== false,
  };
}

async function fetchBuildingHubParcelPages(
  env,
  url,
  label,
  parcel,
  options = {}
) {
  const attempts = [];
  let lastError = null;

  const maxVariants = Math.max(
    1,
    Math.trunc(Number(options.maxVariants) || BUILDING_UNIT_QUERY_VARIANT_LIMIT)
  );
  const maxAttempts = Math.max(
    1,
    Math.trunc(Number(options.maxAttempts) || BUILDING_UNIT_DETAIL_MAX_ATTEMPTS)
  );

  for (const variant of buildingParcelQueryVariants(parcel).slice(0, maxVariants)) {
    const rows = [];
    let totalCount = null;
    let variantError = null;

    try {
      for (
        let pageNo = 1;
        pageNo <= BUILDING_UNIT_MAX_PAGES_PER_PARCEL;
        pageNo++
      ) {
        const data = await fetchPublicDataJson(
          url,
          {
            ...variant.params,
            numOfRows: BUILDING_UNIT_PAGE_SIZE,
            pageNo,
          },
          env,
          label,
          BUILDING_UNIT_TIMEOUT_MS,
          maxAttempts
        );

        const page = publicDataResponseParts(data, label);
        if (totalCount == null) totalCount = page.totalCount;
        rows.push(...page.items);

        if (
          page.items.length === 0 ||
          page.items.length < BUILDING_UNIT_PAGE_SIZE ||
          pageNo * BUILDING_UNIT_PAGE_SIZE >= totalCount
        ) break;
      }
    } catch (error) {
      lastError = error;
      variantError = String(error?.message || error || "failed");
    }

    attempts.push({
      name: variant.name,
      params: variant.params,
      rowCount: rows.length,
      totalCount,
      error: variantError,
    });

    if (rows.length) {
      const deduped = [];
      const seen = new Set();
      rows.forEach((row, index) => {
        const key = buildingUnitRowStableKey(row, index);
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(row);
      });

      return {
        rows: deduped,
        queryVariant: variant.name,
        attempts,
        error: null,
      };
    }
  }

  return {
    rows: [],
    queryVariant: null,
    attempts,
    error: lastError ? String(lastError?.message || lastError) : null,
  };
}


function buildingParcelLegalDongKey(parcel) {
  if (!parcel) return "";
  const sigunguCd = String(parcel.sigunguCd || "");
  const bjdongCd = String(parcel.bjdongCd || "");
  return /^\d{5}$/.test(sigunguCd) && /^\d{5}$/.test(bjdongCd)
    ? `${sigunguCd}|${bjdongCd}`
    : "";
}

async function fetchBuildingHubBulkUnitRows(
  env,
  parcelGroups,
  { url, label }
) {
  const wantedParcelKeys = new Set(
    (parcelGroups || []).map((group) => group?.parcel?.key).filter(Boolean)
  );
  const dongCounts = new Map();
  for (const group of parcelGroups || []) {
    const key = buildingParcelLegalDongKey(group?.parcel);
    if (!key) continue;
    dongCounts.set(key, (dongCounts.get(key) || 0) + 1);
  }

  const selectedDongs = [...dongCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUILDING_BULK_UNIT_MAX_DONGS)
    .map(([key]) => {
      const [sigunguCd, bjdongCd] = key.split("|");
      return { key, sigunguCd, bjdongCd };
    });

  const rowsByParcel = new Map();
  const diagnostics = [];
  const warnings = [];
  let complete = true;
  let remainingPages = BUILDING_BULK_UNIT_MAX_PAGES_TOTAL;
  let scannedRows = 0;
  let matchedRows = 0;

  const acceptRows = (rows) => {
    for (const row of rows || []) {
      scannedRows += 1;
      if (scannedRows > BUILDING_BULK_UNIT_MAX_ROWS) {
        complete = false;
        return;
      }
      const parcel = buildingParcelDescriptor(row);
      if (!parcel || !wantedParcelKeys.has(parcel.key)) continue;
      if (!rowsByParcel.has(parcel.key)) rowsByParcel.set(parcel.key, []);
      rowsByParcel.get(parcel.key).push(row);
      matchedRows += 1;
    }
  };

  for (const dong of selectedDongs) {
    if (remainingPages <= 0) {
      complete = false;
      warnings.push(`${label}:PAGE_BUDGET_EXHAUSTED`);
      break;
    }

    let firstPage;
    try {
      const data = await fetchPublicDataJson(
        url,
        {
          sigunguCd: dong.sigunguCd,
          bjdongCd: dong.bjdongCd,
          numOfRows: BUILDING_UNIT_PAGE_SIZE,
          pageNo: 1,
        },
        env,
        label,
        BUILDING_BULK_UNIT_TIMEOUT_MS,
        1
      );
      firstPage = publicDataResponseParts(data, label);
    } catch (error) {
      complete = false;
      diagnostics.push({
        legalDong: dong.key,
        status: "error",
        error: String(error?.message || error),
        totalCount: 0,
        fetchedPages: 0,
        matchedRows: 0,
      });
      warnings.push(`${label}:FAILED:${dong.key}`);
      continue;
    }

    const effectivePageSize = Math.max(
      1,
      Number(firstPage.numOfRows) || BUILDING_UNIT_PAGE_SIZE
    );
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(firstPage.totalCount, firstPage.items.length) /
        effectivePageSize
      )
    );
    const allowedPages = Math.max(
      1,
      Math.min(
        totalPages,
        BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG,
        remainingPages
      )
    );
    const beforeMatched = matchedRows;
    acceptRows(firstPage.items);

    const pageNumbers = [];
    for (let pageNo = 2; pageNo <= allowedPages; pageNo++) {
      pageNumbers.push(pageNo);
    }

    const pageResults = await mapBuildingWithConcurrency(
      pageNumbers,
      BUILDING_BULK_UNIT_CONCURRENCY,
      async (pageNo) => {
        try {
          const data = await fetchPublicDataJson(
            url,
            {
              sigunguCd: dong.sigunguCd,
              bjdongCd: dong.bjdongCd,
              numOfRows: BUILDING_UNIT_PAGE_SIZE,
              pageNo,
            },
            env,
            label,
            BUILDING_BULK_UNIT_TIMEOUT_MS,
            1
          );
          return {
            pageNo,
            page: publicDataResponseParts(data, label),
            error: null,
          };
        } catch (error) {
          return {
            pageNo,
            page: null,
            error: String(error?.message || error),
          };
        }
      }
    );

    for (const result of pageResults) {
      if (result.error) {
        complete = false;
        warnings.push(`${label}:PAGE_FAILED:${dong.key}:${result.pageNo}`);
        continue;
      }
      acceptRows(result.page.items);
    }

    remainingPages -= allowedPages;
    const truncated = allowedPages < totalPages;
    if (truncated) {
      complete = false;
      warnings.push(`${label}:TRUNCATED:${dong.key}:${allowedPages}/${totalPages}`);
    }

    diagnostics.push({
      legalDong: dong.key,
      status: truncated ? "truncated" : "ok",
      totalCount: firstPage.totalCount,
      totalPages,
      fetchedPages: allowedPages,
      matchedRows: matchedRows - beforeMatched,
    });
  }

  for (const [parcelKey, rows] of rowsByParcel) {
    const deduped = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const key = buildingUnitRowStableKey(row, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    rowsByParcel.set(parcelKey, deduped);
  }

  return {
    complete,
    warnings,
    diagnostics,
    rowsByParcel,
    selectedLegalDongs: selectedDongs.map((dong) => dong.key),
    scannedRows,
    matchedRows,
  };
}

async function fetchBuildingHubBulkExclusiveAreaUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_AREA_URL,
    label: "BULK_EXCLUSIVE_AREA",
  });
}

async function fetchBuildingHubBulkExclusiveUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_URL,
    label: "BULK_EXCLUSIVE_UNIT",
  });
}

async function fetchMatchedBuildingUnitData(
  env,
  matchedBuildingRows,
  matchedKapt = [],
  options = {}
) {
  const parcels = new Map();

  for (const match of matchedBuildingRows || []) {
    const parcel = buildingParcelDescriptor(match?.row);
    if (!parcel) continue;
    if (!parcels.has(parcel.key)) {
      parcels.set(parcel.key, { parcel, titleMatches: [] });
    }
    parcels.get(parcel.key).titleMatches.push(match);
  }

  // V57: V3X/V46 방식 유지. 폴리곤 내부라는 이유만으로 모든 필지를 상세조회하지 않는다.
  // 먼저 표제부/K-APT와 실제로 결속된 building parcel만 상세조회한다.
  // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
  const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
    ? options.verifiedScopeParcels.map
    : new Map();

  // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
  // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
  // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
  for (const match of matchedKapt || []) {
    const parcelKey = cleanBuildingText(
      match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
    );
    if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
    if (parcels.has(parcelKey)) {
      const group = parcels.get(parcelKey);
      group.addedFromKaptScopeV48 = true;
      group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
      continue;
    }
    const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey
```

## sourceComplete #4
```js
Boolean(
    (fallback?.classification?.commercial && floorHasResidential) ||
    (fallback?.classification?.residential && floorHasCommercial)
  );
  const smallExplicit = baseUnits > 0 && baseUnits <= 4;
  const boundedFloorEstimate = floorUnits <= 8 && floorUnits <= baseUnits + 4;

  if (
    fallback?.confidence === "authoritative" &&
    titleSingleUse &&
    floorContradictsTitle &&
    smallExplicit &&
    floorHasResidential &&
    floorHasCommercial &&
    boundedFloorEstimate
  ) {
    return {
      units: floorUnits,
      usedFloorOverride: true,
      reason: "small_explicit_mixed_floor_reconcile",
    };
  }

  return { units: baseUnits, usedFloorOverride: false, reason: null };
}

function buildingParcelQueryVariants(parcel) {
  const source = buildingParcelKeyPartsV51(parcel) || parcel;
  const regionParcels = buildingParcelRegionVariantsV51(source);
  const candidates = regionParcels.length ? regionParcels : [source];
  const variants = [];

  // 공공데이터 원천별로 특별자치도 신·구 시군구 코드가 다르므로
  // 같은 숫자 형식끼리 current/legacy를 먼저 시도하고, 그 다음 unpadded를 시도한다.
  for (const candidate of candidates) {
    variants.push({
      name: `padded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: candidate.bun,
        ji: candidate.ji,
      },
    });
  }

  for (const candidate of candidates) {
    variants.push({
      name: `unpadded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: String(Number(candidate.bun)),
        ji: String(Number(candidate.ji || "0")),
      },
    });
  }

  if (Number(source.ji || 0) === 0) {
    for (const candidate of candidates) {
      variants.push({
        name: `omit_zero_ji_${candidate.sigunguCd}`,
        params: {
          sigunguCd: candidate.sigunguCd,
          bjdongCd: candidate.bjdongCd,
          platGbCd: candidate.platGbCd,
          bun: candidate.bun,
        },
      });
    }
  }

  const seen = new Set();
  return variants.filter((variant) => {
    const key = JSON.stringify(variant.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function buildingUnitRowStableKey(row, fallbackIndex = 0) {
  const unitPk = cleanBuildingText(
    publicDataField(
      row,
      "mgmHoDetlPk",
      "mgm_ho_detl_pk",
      "mgmExposPubuseAreaPk",
      "mgm_expos_pubuse_area_pk",
      "mgmExposPubusePk",
      "mgm_expos_pubuse_pk"
    )
  );
  if (unitPk) return `unit-pk:${unitPk}`;

  const buildingPk = cleanBuildingText(
    publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk")
  );
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const ho = normalizeDeliveryUnitName(unitHoName(row));

  // 같은 건물의 모든 전유호가 동일한 mgmBldrgstPk를 공유할 수 있으므로
  // 건물 PK만으로 dedupe하면 수십 호가 1호로 뭉개진다.
  if (ho) {
    return ["unit", buildingPk || "NO_BUILDING_PK", dong || "DONG", floor || "FLOOR", ho].join("|");
  }

  const rowNo = cleanBuildingText(publicDataField(row, "rnum", "rowNo", "row_no"));
  if (buildingPk && rowNo) return `building-row:${buildingPk}|${rowNo}`;
  if (buildingPk) return `building-row:${buildingPk}|${dong}|${floor}|${fallbackIndex}`;

  return [dong, floor, ho, rowNo, fallbackIndex].join("|");
}

function compactBuildingDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const get = (...names) => publicDataField(row, ...names);
  const out = {
    sigunguCd: get("sigunguCd", "sigungu_cd"),
    bjdongCd: get("bjdongCd", "bjdong_cd"),
    platGbCd: get("platGbCd", "plat_gb_cd"),
    bun: get("bun"),
    ji: get("ji"),
    mgmBldrgstPk: get("mgmBldrgstPk", "mgm_bldrgst_pk"),
    mgmUpperBldrgstPk: get("mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"),
    mgmHoDetlPk: get("mgmHoDetlPk", "mgm_ho_detl_pk"),
    mgmExposPubuseAreaPk: get("mgmExposPubuseAreaPk", "mgm_expos_pubuse_area_pk"),
    mgmExposPubusePk: get("mgmExposPubusePk", "mgm_expos_pubuse_pk"),
    regstrKindCdNm: get("regstrKindCdNm", "regstr_kind_cd_nm"),
    exposPubuseGbCdNm: get("exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
    bldNm: get("bldNm", "bld_nm"),
    dongNm: get("dongNm", "dong_nm"),
    flrGbCdNm: get("flrGbCdNm", "flr_gb_cd_nm"),
    flrNo: get("flrNo", "flr_no"),
    flrNoNm: get("flrNoNm", "flr_no_nm", "floorNm", "floor_no"),
    hoNm: get("hoNm", "ho_nm", "hoNo", "ho_no", "unitNm", "unit_name", "unitNo", "unit_no"),
    mainPurpsCdNm: get("mainPurpsCdNm", "main_purps_cd_nm"),
    etcPurps: get("etcPurps", "etc_purps"),
    // V65 synthetic evidence. Official floor-overview rows are collapsed to a
    // single unambiguous residential/commercial hint for the same building+floor.
    floorUseV65: get("floorUseV65", "floor_use_v65", "__v65FloorUse"),
    detailVersionV65: get("detailVersionV65", "detail_version_v65", "__v65DetailVersion"),
    area: get("area", "flrArea", "flr_area", "areaM2", "area_m2"),
    areaExct: get("areaExct", "area_exct"),
    hhldCnt: get("hhldCnt", "hhld_cnt", "householdCnt", "household_count"),
    fmlyCnt: get("fmlyCnt", "fmly_cnt", "familyCnt", "family_count"),
    hoCnt: get("hoCnt", "ho_cnt", "hoCount", "ho_count", "unitCnt", "unit_count"),
    grndFlrCnt: get("grndFlrCnt", "grnd_flr_cnt"),
    rideUseElvtCnt: get("rideUseElvtCnt", "ride_use_elvt_cnt"),
    emgenUseElvtCnt: get("emgenUseElvtCnt", "emgen_use_elvt_cnt"),
    newPlatPlc: get("newPlatPlc", "new_plat_plc"),
    platPlc: get("platPlc", "plat_plc"),
    rnum: get("rnum", "rowNo", "row_no"),
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function compactBuildingDetailRows(rows, maxRows = 4000) {
  const out = [];
  for (const row of rows || []) {
    if (out.length >= maxRows) break;
    const compact = compactBuildingDetailRow(row);
    if (compact) out.push(compact);
  }
  return out;
}

function normalizeBuildingDetailEvidenceInput(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const parcelKey = cleanBuildingText(item.parcelKey ?? item.parcel_key);
    if (!parcelKey || seen.has(parcelKey)) continue;
    seen.add(parcelKey);
    out.push({
      parcelKey,
      areaRows: compactBuildingDetailRows(item.areaRows ?? item.area_rows ?? []),
      exposRows: compactBuildingDetailRows(item.exposRows ?? item.expos_rows ?? []),
      recapRows: compactBuildingDetailRows(item.recapRows ?? item.recap_rows ?? [], 1000),
      housePriceRows: compactBuildingDetailRows(item.housePriceRows ?? item.house_price_rows ?? [], 2000),
      floorRows: compactBuildingDetailRows(item.floorRows ?? item.floor_rows ?? [], 2000),
      sourceComplete: item.sourceComplete !== false && item.source_complete !== false,
    });
    if (out.length >= BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE) break;
  }
  return out;
}

function buildingDetailEvidenceFromResult(result) {
  if (!result?.parcel?.key) return null;
  return {
    parcelKey: result.parcel.key,
    areaRows: compactBuildingDetailRows(result.areaRows || []),
    exposRows: compactBuildingDetailRows(result.exposRows || []),
    recapRows: compactBuildingDetailRows(result.recapRows || [], 1000),
    housePriceRows: compactBuildingDetailRows(result.housePriceRows || [], 2000),
    floorRows: compactBuildingDetailRows(result.floorRows || [], 2000),
    sourceComplete: result.sourceComplete !== false,
  };
}

async function fetchBuildingHubParcelPages(
  env,
  url,
  label,
  parcel,
  options = {}
) {
  const attempts = [];
  let lastError = null;

  const maxVariants = Math.max(
    1,
    Math.trunc(Number(options.maxVariants) || BUILDING_UNIT_QUERY_VARIANT_LIMIT)
  );
  const maxAttempts = Math.max(
    1,
    Math.trunc(Number(options.maxAttempts) || BUILDING_UNIT_DETAIL_MAX_ATTEMPTS)
  );

  for (const variant of buildingParcelQueryVariants(parcel).slice(0, maxVariants)) {
    const rows = [];
    let totalCount = null;
    let variantError = null;

    try {
      for (
        let pageNo = 1;
        pageNo <= BUILDING_UNIT_MAX_PAGES_PER_PARCEL;
        pageNo++
      ) {
        const data = await fetchPublicDataJson(
          url,
          {
            ...variant.params,
            numOfRows: BUILDING_UNIT_PAGE_SIZE,
            pageNo,
          },
          env,
          label,
          BUILDING_UNIT_TIMEOUT_MS,
          maxAttempts
        );

        const page = publicDataResponseParts(data, label);
        if (totalCount == null) totalCount = page.totalCount;
        rows.push(...page.items);

        if (
          page.items.length === 0 ||
          page.items.length < BUILDING_UNIT_PAGE_SIZE ||
          pageNo * BUILDING_UNIT_PAGE_SIZE >= totalCount
        ) break;
      }
    } catch (error) {
      lastError = error;
      variantError = String(error?.message || error || "failed");
    }

    attempts.push({
      name: variant.name,
      params: variant.params,
      rowCount: rows.length,
      totalCount,
      error: variantError,
    });

    if (rows.length) {
      const deduped = [];
      const seen = new Set();
      rows.forEach((row, index) => {
        const key = buildingUnitRowStableKey(row, index);
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(row);
      });

      return {
        rows: deduped,
        queryVariant: variant.name,
        attempts,
        error: null,
      };
    }
  }

  return {
    rows: [],
    queryVariant: null,
    attempts,
    error: lastError ? String(lastError?.message || lastError) : null,
  };
}


function buildingParcelLegalDongKey(parcel) {
  if (!parcel) return "";
  const sigunguCd = String(parcel.sigunguCd || "");
  const bjdongCd = String(parcel.bjdongCd || "");
  return /^\d{5}$/.test(sigunguCd) && /^\d{5}$/.test(bjdongCd)
    ? `${sigunguCd}|${bjdongCd}`
    : "";
}

async function fetchBuildingHubBulkUnitRows(
  env,
  parcelGroups,
  { url, label }
) {
  const wantedParcelKeys = new Set(
    (parcelGroups || []).map((group) => group?.parcel?.key).filter(Boolean)
  );
  const dongCounts = new Map();
  for (const group of parcelGroups || []) {
    const key = buildingParcelLegalDongKey(group?.parcel);
    if (!key) continue;
    dongCounts.set(key, (dongCounts.get(key) || 0) + 1);
  }

  const selectedDongs = [...dongCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUILDING_BULK_UNIT_MAX_DONGS)
    .map(([key]) => {
      const [sigunguCd, bjdongCd] = key.split("|");
      return { key, sigunguCd, bjdongCd };
    });

  const rowsByParcel = new Map();
  const diagnostics = [];
  const warnings = [];
  let complete = true;
  let remainingPages = BUILDING_BULK_UNIT_MAX_PAGES_TOTAL;
  let scannedRows = 0;
  let matchedRows = 0;

  const acceptRows = (rows) => {
    for (const row of rows || []) {
      scannedRows += 1;
      if (scannedRows > BUILDING_BULK_UNIT_MAX_ROWS) {
        complete = false;
        return;
      }
      const parcel = buildingParcelDescriptor(row);
      if (!parcel || !wantedParcelKeys.has(parcel.key)) continue;
      if (!rowsByParcel.has(parcel.key)) rowsByParcel.set(parcel.key, []);
      rowsByParcel.get(parcel.key).push(row);
      matchedRows += 1;
    }
  };

  for (const dong of selectedDongs) {
    if (remainingPages <= 0) {
      complete = false;
      warnings.push(`${label}:PAGE_BUDGET_EXHAUSTED`);
      break;
    }

    let firstPage;
    try {
      const data = await fetchPublicDataJson(
        url,
        {
          sigunguCd: dong.sigunguCd,
          bjdongCd: dong.bjdongCd,
          numOfRows: BUILDING_UNIT_PAGE_SIZE,
          pageNo: 1,
        },
        env,
        label,
        BUILDING_BULK_UNIT_TIMEOUT_MS,
        1
      );
      firstPage = publicDataResponseParts(data, label);
    } catch (error) {
      complete = false;
      diagnostics.push({
        legalDong: dong.key,
        status: "error",
        error: String(error?.message || error),
        totalCount: 0,
        fetchedPages: 0,
        matchedRows: 0,
      });
      warnings.push(`${label}:FAILED:${dong.key}`);
      continue;
    }

    const effectivePageSize = Math.max(
      1,
      Number(firstPage.numOfRows) || BUILDING_UNIT_PAGE_SIZE
    );
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(firstPage.totalCount, firstPage.items.length) /
        effectivePageSize
      )
    );
    const allowedPages = Math.max(
      1,
      Math.min(
        totalPages,
        BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG,
        remainingPages
      )
    );
    const beforeMatched = matchedRows;
    acceptRows(firstPage.items);

    const pageNumbers = [];
    for (let pageNo = 2; pageNo <= allowedPages; pageNo++) {
      pageNumbers.push(pageNo);
    }

    const pageResults = await mapBuildingWithConcurrency(
      pageNumbers,
      BUILDING_BULK_UNIT_CONCURRENCY,
      async (pageNo) => {
        try {
          const data = await fetchPublicDataJson(
            url,
            {
              sigunguCd: dong.sigunguCd,
              bjdongCd: dong.bjdongCd,
              numOfRows: BUILDING_UNIT_PAGE_SIZE,
              pageNo,
            },
            env,
            label,
            BUILDING_BULK_UNIT_TIMEOUT_MS,
            1
          );
          return {
            pageNo,
            page: publicDataResponseParts(data, label),
            error: null,
          };
        } catch (error) {
          return {
            pageNo,
            page: null,
            error: String(error?.message || error),
          };
        }
      }
    );

    for (const result of pageResults) {
      if (result.error) {
        complete = false;
        warnings.push(`${label}:PAGE_FAILED:${dong.key}:${result.pageNo}`);
        continue;
      }
      acceptRows(result.page.items);
    }

    remainingPages -= allowedPages;
    const truncated = allowedPages < totalPages;
    if (truncated) {
      complete = false;
      warnings.push(`${label}:TRUNCATED:${dong.key}:${allowedPages}/${totalPages}`);
    }

    diagnostics.push({
      legalDong: dong.key,
      status: truncated ? "truncated" : "ok",
      totalCount: firstPage.totalCount,
      totalPages,
      fetchedPages: allowedPages,
      matchedRows: matchedRows - beforeMatched,
    });
  }

  for (const [parcelKey, rows] of rowsByParcel) {
    const deduped = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const key = buildingUnitRowStableKey(row, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    rowsByParcel.set(parcelKey, deduped);
  }

  return {
    complete,
    warnings,
    diagnostics,
    rowsByParcel,
    selectedLegalDongs: selectedDongs.map((dong) => dong.key),
    scannedRows,
    matchedRows,
  };
}

async function fetchBuildingHubBulkExclusiveAreaUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_AREA_URL,
    label: "BULK_EXCLUSIVE_AREA",
  });
}

async function fetchBuildingHubBulkExclusiveUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_URL,
    label: "BULK_EXCLUSIVE_UNIT",
  });
}

async function fetchMatchedBuildingUnitData(
  env,
  matchedBuildingRows,
  matchedKapt = [],
  options = {}
) {
  const parcels = new Map();

  for (const match of matchedBuildingRows || []) {
    const parcel = buildingParcelDescriptor(match?.row);
    if (!parcel) continue;
    if (!parcels.has(parcel.key)) {
      parcels.set(parcel.key, { parcel, titleMatches: [] });
    }
    parcels.get(parcel.key).titleMatches.push(match);
  }

  // V57: V3X/V46 방식 유지. 폴리곤 내부라는 이유만으로 모든 필지를 상세조회하지 않는다.
  // 먼저 표제부/K-APT와 실제로 결속된 building parcel만 상세조회한다.
  // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
  const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
    ? options.verifiedScopeParcels.map
    : new Map();

  // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
  // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
  // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
  for (const match of matchedKapt || []) {
    const parcelKey = cleanBuildingText(
      match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
    );
    if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
    if (parcels.has(parcelKey)) {
      const group = parcels.get(parcelKey);
      group.addedFromKaptScopeV48 = true;
      group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
      continue;
    }
    const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey.split("|");
    parc
```

## sourceComplete #5
```js
FloorOverride: false, reason: null };
}

function buildingParcelQueryVariants(parcel) {
  const source = buildingParcelKeyPartsV51(parcel) || parcel;
  const regionParcels = buildingParcelRegionVariantsV51(source);
  const candidates = regionParcels.length ? regionParcels : [source];
  const variants = [];

  // 공공데이터 원천별로 특별자치도 신·구 시군구 코드가 다르므로
  // 같은 숫자 형식끼리 current/legacy를 먼저 시도하고, 그 다음 unpadded를 시도한다.
  for (const candidate of candidates) {
    variants.push({
      name: `padded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: candidate.bun,
        ji: candidate.ji,
      },
    });
  }

  for (const candidate of candidates) {
    variants.push({
      name: `unpadded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: String(Number(candidate.bun)),
        ji: String(Number(candidate.ji || "0")),
      },
    });
  }

  if (Number(source.ji || 0) === 0) {
    for (const candidate of candidates) {
      variants.push({
        name: `omit_zero_ji_${candidate.sigunguCd}`,
        params: {
          sigunguCd: candidate.sigunguCd,
          bjdongCd: candidate.bjdongCd,
          platGbCd: candidate.platGbCd,
          bun: candidate.bun,
        },
      });
    }
  }

  const seen = new Set();
  return variants.filter((variant) => {
    const key = JSON.stringify(variant.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function buildingUnitRowStableKey(row, fallbackIndex = 0) {
  const unitPk = cleanBuildingText(
    publicDataField(
      row,
      "mgmHoDetlPk",
      "mgm_ho_detl_pk",
      "mgmExposPubuseAreaPk",
      "mgm_expos_pubuse_area_pk",
      "mgmExposPubusePk",
      "mgm_expos_pubuse_pk"
    )
  );
  if (unitPk) return `unit-pk:${unitPk}`;

  const buildingPk = cleanBuildingText(
    publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk")
  );
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const ho = normalizeDeliveryUnitName(unitHoName(row));

  // 같은 건물의 모든 전유호가 동일한 mgmBldrgstPk를 공유할 수 있으므로
  // 건물 PK만으로 dedupe하면 수십 호가 1호로 뭉개진다.
  if (ho) {
    return ["unit", buildingPk || "NO_BUILDING_PK", dong || "DONG", floor || "FLOOR", ho].join("|");
  }

  const rowNo = cleanBuildingText(publicDataField(row, "rnum", "rowNo", "row_no"));
  if (buildingPk && rowNo) return `building-row:${buildingPk}|${rowNo}`;
  if (buildingPk) return `building-row:${buildingPk}|${dong}|${floor}|${fallbackIndex}`;

  return [dong, floor, ho, rowNo, fallbackIndex].join("|");
}

function compactBuildingDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const get = (...names) => publicDataField(row, ...names);
  const out = {
    sigunguCd: get("sigunguCd", "sigungu_cd"),
    bjdongCd: get("bjdongCd", "bjdong_cd"),
    platGbCd: get("platGbCd", "plat_gb_cd"),
    bun: get("bun"),
    ji: get("ji"),
    mgmBldrgstPk: get("mgmBldrgstPk", "mgm_bldrgst_pk"),
    mgmUpperBldrgstPk: get("mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"),
    mgmHoDetlPk: get("mgmHoDetlPk", "mgm_ho_detl_pk"),
    mgmExposPubuseAreaPk: get("mgmExposPubuseAreaPk", "mgm_expos_pubuse_area_pk"),
    mgmExposPubusePk: get("mgmExposPubusePk", "mgm_expos_pubuse_pk"),
    regstrKindCdNm: get("regstrKindCdNm", "regstr_kind_cd_nm"),
    exposPubuseGbCdNm: get("exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
    bldNm: get("bldNm", "bld_nm"),
    dongNm: get("dongNm", "dong_nm"),
    flrGbCdNm: get("flrGbCdNm", "flr_gb_cd_nm"),
    flrNo: get("flrNo", "flr_no"),
    flrNoNm: get("flrNoNm", "flr_no_nm", "floorNm", "floor_no"),
    hoNm: get("hoNm", "ho_nm", "hoNo", "ho_no", "unitNm", "unit_name", "unitNo", "unit_no"),
    mainPurpsCdNm: get("mainPurpsCdNm", "main_purps_cd_nm"),
    etcPurps: get("etcPurps", "etc_purps"),
    // V65 synthetic evidence. Official floor-overview rows are collapsed to a
    // single unambiguous residential/commercial hint for the same building+floor.
    floorUseV65: get("floorUseV65", "floor_use_v65", "__v65FloorUse"),
    detailVersionV65: get("detailVersionV65", "detail_version_v65", "__v65DetailVersion"),
    area: get("area", "flrArea", "flr_area", "areaM2", "area_m2"),
    areaExct: get("areaExct", "area_exct"),
    hhldCnt: get("hhldCnt", "hhld_cnt", "householdCnt", "household_count"),
    fmlyCnt: get("fmlyCnt", "fmly_cnt", "familyCnt", "family_count"),
    hoCnt: get("hoCnt", "ho_cnt", "hoCount", "ho_count", "unitCnt", "unit_count"),
    grndFlrCnt: get("grndFlrCnt", "grnd_flr_cnt"),
    rideUseElvtCnt: get("rideUseElvtCnt", "ride_use_elvt_cnt"),
    emgenUseElvtCnt: get("emgenUseElvtCnt", "emgen_use_elvt_cnt"),
    newPlatPlc: get("newPlatPlc", "new_plat_plc"),
    platPlc: get("platPlc", "plat_plc"),
    rnum: get("rnum", "rowNo", "row_no"),
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function compactBuildingDetailRows(rows, maxRows = 4000) {
  const out = [];
  for (const row of rows || []) {
    if (out.length >= maxRows) break;
    const compact = compactBuildingDetailRow(row);
    if (compact) out.push(compact);
  }
  return out;
}

function normalizeBuildingDetailEvidenceInput(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const parcelKey = cleanBuildingText(item.parcelKey ?? item.parcel_key);
    if (!parcelKey || seen.has(parcelKey)) continue;
    seen.add(parcelKey);
    out.push({
      parcelKey,
      areaRows: compactBuildingDetailRows(item.areaRows ?? item.area_rows ?? []),
      exposRows: compactBuildingDetailRows(item.exposRows ?? item.expos_rows ?? []),
      recapRows: compactBuildingDetailRows(item.recapRows ?? item.recap_rows ?? [], 1000),
      housePriceRows: compactBuildingDetailRows(item.housePriceRows ?? item.house_price_rows ?? [], 2000),
      floorRows: compactBuildingDetailRows(item.floorRows ?? item.floor_rows ?? [], 2000),
      sourceComplete: item.sourceComplete !== false && item.source_complete !== false,
    });
    if (out.length >= BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE) break;
  }
  return out;
}

function buildingDetailEvidenceFromResult(result) {
  if (!result?.parcel?.key) return null;
  return {
    parcelKey: result.parcel.key,
    areaRows: compactBuildingDetailRows(result.areaRows || []),
    exposRows: compactBuildingDetailRows(result.exposRows || []),
    recapRows: compactBuildingDetailRows(result.recapRows || [], 1000),
    housePriceRows: compactBuildingDetailRows(result.housePriceRows || [], 2000),
    floorRows: compactBuildingDetailRows(result.floorRows || [], 2000),
    sourceComplete: result.sourceComplete !== false,
  };
}

async function fetchBuildingHubParcelPages(
  env,
  url,
  label,
  parcel,
  options = {}
) {
  const attempts = [];
  let lastError = null;

  const maxVariants = Math.max(
    1,
    Math.trunc(Number(options.maxVariants) || BUILDING_UNIT_QUERY_VARIANT_LIMIT)
  );
  const maxAttempts = Math.max(
    1,
    Math.trunc(Number(options.maxAttempts) || BUILDING_UNIT_DETAIL_MAX_ATTEMPTS)
  );

  for (const variant of buildingParcelQueryVariants(parcel).slice(0, maxVariants)) {
    const rows = [];
    let totalCount = null;
    let variantError = null;

    try {
      for (
        let pageNo = 1;
        pageNo <= BUILDING_UNIT_MAX_PAGES_PER_PARCEL;
        pageNo++
      ) {
        const data = await fetchPublicDataJson(
          url,
          {
            ...variant.params,
            numOfRows: BUILDING_UNIT_PAGE_SIZE,
            pageNo,
          },
          env,
          label,
          BUILDING_UNIT_TIMEOUT_MS,
          maxAttempts
        );

        const page = publicDataResponseParts(data, label);
        if (totalCount == null) totalCount = page.totalCount;
        rows.push(...page.items);

        if (
          page.items.length === 0 ||
          page.items.length < BUILDING_UNIT_PAGE_SIZE ||
          pageNo * BUILDING_UNIT_PAGE_SIZE >= totalCount
        ) break;
      }
    } catch (error) {
      lastError = error;
      variantError = String(error?.message || error || "failed");
    }

    attempts.push({
      name: variant.name,
      params: variant.params,
      rowCount: rows.length,
      totalCount,
      error: variantError,
    });

    if (rows.length) {
      const deduped = [];
      const seen = new Set();
      rows.forEach((row, index) => {
        const key = buildingUnitRowStableKey(row, index);
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(row);
      });

      return {
        rows: deduped,
        queryVariant: variant.name,
        attempts,
        error: null,
      };
    }
  }

  return {
    rows: [],
    queryVariant: null,
    attempts,
    error: lastError ? String(lastError?.message || lastError) : null,
  };
}


function buildingParcelLegalDongKey(parcel) {
  if (!parcel) return "";
  const sigunguCd = String(parcel.sigunguCd || "");
  const bjdongCd = String(parcel.bjdongCd || "");
  return /^\d{5}$/.test(sigunguCd) && /^\d{5}$/.test(bjdongCd)
    ? `${sigunguCd}|${bjdongCd}`
    : "";
}

async function fetchBuildingHubBulkUnitRows(
  env,
  parcelGroups,
  { url, label }
) {
  const wantedParcelKeys = new Set(
    (parcelGroups || []).map((group) => group?.parcel?.key).filter(Boolean)
  );
  const dongCounts = new Map();
  for (const group of parcelGroups || []) {
    const key = buildingParcelLegalDongKey(group?.parcel);
    if (!key) continue;
    dongCounts.set(key, (dongCounts.get(key) || 0) + 1);
  }

  const selectedDongs = [...dongCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUILDING_BULK_UNIT_MAX_DONGS)
    .map(([key]) => {
      const [sigunguCd, bjdongCd] = key.split("|");
      return { key, sigunguCd, bjdongCd };
    });

  const rowsByParcel = new Map();
  const diagnostics = [];
  const warnings = [];
  let complete = true;
  let remainingPages = BUILDING_BULK_UNIT_MAX_PAGES_TOTAL;
  let scannedRows = 0;
  let matchedRows = 0;

  const acceptRows = (rows) => {
    for (const row of rows || []) {
      scannedRows += 1;
      if (scannedRows > BUILDING_BULK_UNIT_MAX_ROWS) {
        complete = false;
        return;
      }
      const parcel = buildingParcelDescriptor(row);
      if (!parcel || !wantedParcelKeys.has(parcel.key)) continue;
      if (!rowsByParcel.has(parcel.key)) rowsByParcel.set(parcel.key, []);
      rowsByParcel.get(parcel.key).push(row);
      matchedRows += 1;
    }
  };

  for (const dong of selectedDongs) {
    if (remainingPages <= 0) {
      complete = false;
      warnings.push(`${label}:PAGE_BUDGET_EXHAUSTED`);
      break;
    }

    let firstPage;
    try {
      const data = await fetchPublicDataJson(
        url,
        {
          sigunguCd: dong.sigunguCd,
          bjdongCd: dong.bjdongCd,
          numOfRows: BUILDING_UNIT_PAGE_SIZE,
          pageNo: 1,
        },
        env,
        label,
        BUILDING_BULK_UNIT_TIMEOUT_MS,
        1
      );
      firstPage = publicDataResponseParts(data, label);
    } catch (error) {
      complete = false;
      diagnostics.push({
        legalDong: dong.key,
        status: "error",
        error: String(error?.message || error),
        totalCount: 0,
        fetchedPages: 0,
        matchedRows: 0,
      });
      warnings.push(`${label}:FAILED:${dong.key}`);
      continue;
    }

    const effectivePageSize = Math.max(
      1,
      Number(firstPage.numOfRows) || BUILDING_UNIT_PAGE_SIZE
    );
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(firstPage.totalCount, firstPage.items.length) /
        effectivePageSize
      )
    );
    const allowedPages = Math.max(
      1,
      Math.min(
        totalPages,
        BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG,
        remainingPages
      )
    );
    const beforeMatched = matchedRows;
    acceptRows(firstPage.items);

    const pageNumbers = [];
    for (let pageNo = 2; pageNo <= allowedPages; pageNo++) {
      pageNumbers.push(pageNo);
    }

    const pageResults = await mapBuildingWithConcurrency(
      pageNumbers,
      BUILDING_BULK_UNIT_CONCURRENCY,
      async (pageNo) => {
        try {
          const data = await fetchPublicDataJson(
            url,
            {
              sigunguCd: dong.sigunguCd,
              bjdongCd: dong.bjdongCd,
              numOfRows: BUILDING_UNIT_PAGE_SIZE,
              pageNo,
            },
            env,
            label,
            BUILDING_BULK_UNIT_TIMEOUT_MS,
            1
          );
          return {
            pageNo,
            page: publicDataResponseParts(data, label),
            error: null,
          };
        } catch (error) {
          return {
            pageNo,
            page: null,
            error: String(error?.message || error),
          };
        }
      }
    );

    for (const result of pageResults) {
      if (result.error) {
        complete = false;
        warnings.push(`${label}:PAGE_FAILED:${dong.key}:${result.pageNo}`);
        continue;
      }
      acceptRows(result.page.items);
    }

    remainingPages -= allowedPages;
    const truncated = allowedPages < totalPages;
    if (truncated) {
      complete = false;
      warnings.push(`${label}:TRUNCATED:${dong.key}:${allowedPages}/${totalPages}`);
    }

    diagnostics.push({
      legalDong: dong.key,
      status: truncated ? "truncated" : "ok",
      totalCount: firstPage.totalCount,
      totalPages,
      fetchedPages: allowedPages,
      matchedRows: matchedRows - beforeMatched,
    });
  }

  for (const [parcelKey, rows] of rowsByParcel) {
    const deduped = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const key = buildingUnitRowStableKey(row, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    rowsByParcel.set(parcelKey, deduped);
  }

  return {
    complete,
    warnings,
    diagnostics,
    rowsByParcel,
    selectedLegalDongs: selectedDongs.map((dong) => dong.key),
    scannedRows,
    matchedRows,
  };
}

async function fetchBuildingHubBulkExclusiveAreaUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_AREA_URL,
    label: "BULK_EXCLUSIVE_AREA",
  });
}

async function fetchBuildingHubBulkExclusiveUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_URL,
    label: "BULK_EXCLUSIVE_UNIT",
  });
}

async function fetchMatchedBuildingUnitData(
  env,
  matchedBuildingRows,
  matchedKapt = [],
  options = {}
) {
  const parcels = new Map();

  for (const match of matchedBuildingRows || []) {
    const parcel = buildingParcelDescriptor(match?.row);
    if (!parcel) continue;
    if (!parcels.has(parcel.key)) {
      parcels.set(parcel.key, { parcel, titleMatches: [] });
    }
    parcels.get(parcel.key).titleMatches.push(match);
  }

  // V57: V3X/V46 방식 유지. 폴리곤 내부라는 이유만으로 모든 필지를 상세조회하지 않는다.
  // 먼저 표제부/K-APT와 실제로 결속된 building parcel만 상세조회한다.
  // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
  const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
    ? options.verifiedScopeParcels.map
    : new Map();

  // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
  // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
  // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
  for (const match of matchedKapt || []) {
    const parcelKey = cleanBuildingText(
      match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
    );
    if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
    if (parcels.has(parcelKey)) {
      const group = parcels.get(parcelKey);
      group.addedFromKaptScopeV48 = true;
      group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
      continue;
    }
    const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey.split("|");
    parcels.set(parcelKey, {
      parcel: { key: parcelKey, sigunguCd, bjdongCd, platGbCd, bun, ji },
      titleMatches: [],
      addedFromKaptScopeV48: true,
      kaptMatchesV51: [match],
    });
  }

  const parcelGroups = [...parcels.values()];
  const priorDetailEvidence = normalizeBuildingDetailEvidenceInput(
    options?.detailEvidence ?? options?.detail_evidence ?? []
  );
  const priorDetailEvidenceMap = new Map(
    priorDetailEvidence.map((item) => [item.parcelKey, item])
  );

  // V56 persistent detail cache: 알고리즘은 그대로 두고 과거에 정상 조회한 동일 필지 원천만 재사용한다.
  const detailCacheByRegion = new Map();
  const detailCacheIndex = new Map();
  for (const group of 
```

## sourceComplete #6
```js
eason: null };
}

function buildingParcelQueryVariants(parcel) {
  const source = buildingParcelKeyPartsV51(parcel) || parcel;
  const regionParcels = buildingParcelRegionVariantsV51(source);
  const candidates = regionParcels.length ? regionParcels : [source];
  const variants = [];

  // 공공데이터 원천별로 특별자치도 신·구 시군구 코드가 다르므로
  // 같은 숫자 형식끼리 current/legacy를 먼저 시도하고, 그 다음 unpadded를 시도한다.
  for (const candidate of candidates) {
    variants.push({
      name: `padded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: candidate.bun,
        ji: candidate.ji,
      },
    });
  }

  for (const candidate of candidates) {
    variants.push({
      name: `unpadded_${candidate.sigunguCd}`,
      params: {
        sigunguCd: candidate.sigunguCd,
        bjdongCd: candidate.bjdongCd,
        platGbCd: candidate.platGbCd,
        bun: String(Number(candidate.bun)),
        ji: String(Number(candidate.ji || "0")),
      },
    });
  }

  if (Number(source.ji || 0) === 0) {
    for (const candidate of candidates) {
      variants.push({
        name: `omit_zero_ji_${candidate.sigunguCd}`,
        params: {
          sigunguCd: candidate.sigunguCd,
          bjdongCd: candidate.bjdongCd,
          platGbCd: candidate.platGbCd,
          bun: candidate.bun,
        },
      });
    }
  }

  const seen = new Set();
  return variants.filter((variant) => {
    const key = JSON.stringify(variant.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function buildingUnitRowStableKey(row, fallbackIndex = 0) {
  const unitPk = cleanBuildingText(
    publicDataField(
      row,
      "mgmHoDetlPk",
      "mgm_ho_detl_pk",
      "mgmExposPubuseAreaPk",
      "mgm_expos_pubuse_area_pk",
      "mgmExposPubusePk",
      "mgm_expos_pubuse_pk"
    )
  );
  if (unitPk) return `unit-pk:${unitPk}`;

  const buildingPk = cleanBuildingText(
    publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk")
  );
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const ho = normalizeDeliveryUnitName(unitHoName(row));

  // 같은 건물의 모든 전유호가 동일한 mgmBldrgstPk를 공유할 수 있으므로
  // 건물 PK만으로 dedupe하면 수십 호가 1호로 뭉개진다.
  if (ho) {
    return ["unit", buildingPk || "NO_BUILDING_PK", dong || "DONG", floor || "FLOOR", ho].join("|");
  }

  const rowNo = cleanBuildingText(publicDataField(row, "rnum", "rowNo", "row_no"));
  if (buildingPk && rowNo) return `building-row:${buildingPk}|${rowNo}`;
  if (buildingPk) return `building-row:${buildingPk}|${dong}|${floor}|${fallbackIndex}`;

  return [dong, floor, ho, rowNo, fallbackIndex].join("|");
}

function compactBuildingDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const get = (...names) => publicDataField(row, ...names);
  const out = {
    sigunguCd: get("sigunguCd", "sigungu_cd"),
    bjdongCd: get("bjdongCd", "bjdong_cd"),
    platGbCd: get("platGbCd", "plat_gb_cd"),
    bun: get("bun"),
    ji: get("ji"),
    mgmBldrgstPk: get("mgmBldrgstPk", "mgm_bldrgst_pk"),
    mgmUpperBldrgstPk: get("mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"),
    mgmHoDetlPk: get("mgmHoDetlPk", "mgm_ho_detl_pk"),
    mgmExposPubuseAreaPk: get("mgmExposPubuseAreaPk", "mgm_expos_pubuse_area_pk"),
    mgmExposPubusePk: get("mgmExposPubusePk", "mgm_expos_pubuse_pk"),
    regstrKindCdNm: get("regstrKindCdNm", "regstr_kind_cd_nm"),
    exposPubuseGbCdNm: get("exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
    bldNm: get("bldNm", "bld_nm"),
    dongNm: get("dongNm", "dong_nm"),
    flrGbCdNm: get("flrGbCdNm", "flr_gb_cd_nm"),
    flrNo: get("flrNo", "flr_no"),
    flrNoNm: get("flrNoNm", "flr_no_nm", "floorNm", "floor_no"),
    hoNm: get("hoNm", "ho_nm", "hoNo", "ho_no", "unitNm", "unit_name", "unitNo", "unit_no"),
    mainPurpsCdNm: get("mainPurpsCdNm", "main_purps_cd_nm"),
    etcPurps: get("etcPurps", "etc_purps"),
    // V65 synthetic evidence. Official floor-overview rows are collapsed to a
    // single unambiguous residential/commercial hint for the same building+floor.
    floorUseV65: get("floorUseV65", "floor_use_v65", "__v65FloorUse"),
    detailVersionV65: get("detailVersionV65", "detail_version_v65", "__v65DetailVersion"),
    area: get("area", "flrArea", "flr_area", "areaM2", "area_m2"),
    areaExct: get("areaExct", "area_exct"),
    hhldCnt: get("hhldCnt", "hhld_cnt", "householdCnt", "household_count"),
    fmlyCnt: get("fmlyCnt", "fmly_cnt", "familyCnt", "family_count"),
    hoCnt: get("hoCnt", "ho_cnt", "hoCount", "ho_count", "unitCnt", "unit_count"),
    grndFlrCnt: get("grndFlrCnt", "grnd_flr_cnt"),
    rideUseElvtCnt: get("rideUseElvtCnt", "ride_use_elvt_cnt"),
    emgenUseElvtCnt: get("emgenUseElvtCnt", "emgen_use_elvt_cnt"),
    newPlatPlc: get("newPlatPlc", "new_plat_plc"),
    platPlc: get("platPlc", "plat_plc"),
    rnum: get("rnum", "rowNo", "row_no"),
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function compactBuildingDetailRows(rows, maxRows = 4000) {
  const out = [];
  for (const row of rows || []) {
    if (out.length >= maxRows) break;
    const compact = compactBuildingDetailRow(row);
    if (compact) out.push(compact);
  }
  return out;
}

function normalizeBuildingDetailEvidenceInput(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const parcelKey = cleanBuildingText(item.parcelKey ?? item.parcel_key);
    if (!parcelKey || seen.has(parcelKey)) continue;
    seen.add(parcelKey);
    out.push({
      parcelKey,
      areaRows: compactBuildingDetailRows(item.areaRows ?? item.area_rows ?? []),
      exposRows: compactBuildingDetailRows(item.exposRows ?? item.expos_rows ?? []),
      recapRows: compactBuildingDetailRows(item.recapRows ?? item.recap_rows ?? [], 1000),
      housePriceRows: compactBuildingDetailRows(item.housePriceRows ?? item.house_price_rows ?? [], 2000),
      floorRows: compactBuildingDetailRows(item.floorRows ?? item.floor_rows ?? [], 2000),
      sourceComplete: item.sourceComplete !== false && item.source_complete !== false,
    });
    if (out.length >= BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE) break;
  }
  return out;
}

function buildingDetailEvidenceFromResult(result) {
  if (!result?.parcel?.key) return null;
  return {
    parcelKey: result.parcel.key,
    areaRows: compactBuildingDetailRows(result.areaRows || []),
    exposRows: compactBuildingDetailRows(result.exposRows || []),
    recapRows: compactBuildingDetailRows(result.recapRows || [], 1000),
    housePriceRows: compactBuildingDetailRows(result.housePriceRows || [], 2000),
    floorRows: compactBuildingDetailRows(result.floorRows || [], 2000),
    sourceComplete: result.sourceComplete !== false,
  };
}

async function fetchBuildingHubParcelPages(
  env,
  url,
  label,
  parcel,
  options = {}
) {
  const attempts = [];
  let lastError = null;

  const maxVariants = Math.max(
    1,
    Math.trunc(Number(options.maxVariants) || BUILDING_UNIT_QUERY_VARIANT_LIMIT)
  );
  const maxAttempts = Math.max(
    1,
    Math.trunc(Number(options.maxAttempts) || BUILDING_UNIT_DETAIL_MAX_ATTEMPTS)
  );

  for (const variant of buildingParcelQueryVariants(parcel).slice(0, maxVariants)) {
    const rows = [];
    let totalCount = null;
    let variantError = null;

    try {
      for (
        let pageNo = 1;
        pageNo <= BUILDING_UNIT_MAX_PAGES_PER_PARCEL;
        pageNo++
      ) {
        const data = await fetchPublicDataJson(
          url,
          {
            ...variant.params,
            numOfRows: BUILDING_UNIT_PAGE_SIZE,
            pageNo,
          },
          env,
          label,
          BUILDING_UNIT_TIMEOUT_MS,
          maxAttempts
        );

        const page = publicDataResponseParts(data, label);
        if (totalCount == null) totalCount = page.totalCount;
        rows.push(...page.items);

        if (
          page.items.length === 0 ||
          page.items.length < BUILDING_UNIT_PAGE_SIZE ||
          pageNo * BUILDING_UNIT_PAGE_SIZE >= totalCount
        ) break;
      }
    } catch (error) {
      lastError = error;
      variantError = String(error?.message || error || "failed");
    }

    attempts.push({
      name: variant.name,
      params: variant.params,
      rowCount: rows.length,
      totalCount,
      error: variantError,
    });

    if (rows.length) {
      const deduped = [];
      const seen = new Set();
      rows.forEach((row, index) => {
        const key = buildingUnitRowStableKey(row, index);
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(row);
      });

      return {
        rows: deduped,
        queryVariant: variant.name,
        attempts,
        error: null,
      };
    }
  }

  return {
    rows: [],
    queryVariant: null,
    attempts,
    error: lastError ? String(lastError?.message || lastError) : null,
  };
}


function buildingParcelLegalDongKey(parcel) {
  if (!parcel) return "";
  const sigunguCd = String(parcel.sigunguCd || "");
  const bjdongCd = String(parcel.bjdongCd || "");
  return /^\d{5}$/.test(sigunguCd) && /^\d{5}$/.test(bjdongCd)
    ? `${sigunguCd}|${bjdongCd}`
    : "";
}

async function fetchBuildingHubBulkUnitRows(
  env,
  parcelGroups,
  { url, label }
) {
  const wantedParcelKeys = new Set(
    (parcelGroups || []).map((group) => group?.parcel?.key).filter(Boolean)
  );
  const dongCounts = new Map();
  for (const group of parcelGroups || []) {
    const key = buildingParcelLegalDongKey(group?.parcel);
    if (!key) continue;
    dongCounts.set(key, (dongCounts.get(key) || 0) + 1);
  }

  const selectedDongs = [...dongCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUILDING_BULK_UNIT_MAX_DONGS)
    .map(([key]) => {
      const [sigunguCd, bjdongCd] = key.split("|");
      return { key, sigunguCd, bjdongCd };
    });

  const rowsByParcel = new Map();
  const diagnostics = [];
  const warnings = [];
  let complete = true;
  let remainingPages = BUILDING_BULK_UNIT_MAX_PAGES_TOTAL;
  let scannedRows = 0;
  let matchedRows = 0;

  const acceptRows = (rows) => {
    for (const row of rows || []) {
      scannedRows += 1;
      if (scannedRows > BUILDING_BULK_UNIT_MAX_ROWS) {
        complete = false;
        return;
      }
      const parcel = buildingParcelDescriptor(row);
      if (!parcel || !wantedParcelKeys.has(parcel.key)) continue;
      if (!rowsByParcel.has(parcel.key)) rowsByParcel.set(parcel.key, []);
      rowsByParcel.get(parcel.key).push(row);
      matchedRows += 1;
    }
  };

  for (const dong of selectedDongs) {
    if (remainingPages <= 0) {
      complete = false;
      warnings.push(`${label}:PAGE_BUDGET_EXHAUSTED`);
      break;
    }

    let firstPage;
    try {
      const data = await fetchPublicDataJson(
        url,
        {
          sigunguCd: dong.sigunguCd,
          bjdongCd: dong.bjdongCd,
          numOfRows: BUILDING_UNIT_PAGE_SIZE,
          pageNo: 1,
        },
        env,
        label,
        BUILDING_BULK_UNIT_TIMEOUT_MS,
        1
      );
      firstPage = publicDataResponseParts(data, label);
    } catch (error) {
      complete = false;
      diagnostics.push({
        legalDong: dong.key,
        status: "error",
        error: String(error?.message || error),
        totalCount: 0,
        fetchedPages: 0,
        matchedRows: 0,
      });
      warnings.push(`${label}:FAILED:${dong.key}`);
      continue;
    }

    const effectivePageSize = Math.max(
      1,
      Number(firstPage.numOfRows) || BUILDING_UNIT_PAGE_SIZE
    );
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(firstPage.totalCount, firstPage.items.length) /
        effectivePageSize
      )
    );
    const allowedPages = Math.max(
      1,
      Math.min(
        totalPages,
        BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG,
        remainingPages
      )
    );
    const beforeMatched = matchedRows;
    acceptRows(firstPage.items);

    const pageNumbers = [];
    for (let pageNo = 2; pageNo <= allowedPages; pageNo++) {
      pageNumbers.push(pageNo);
    }

    const pageResults = await mapBuildingWithConcurrency(
      pageNumbers,
      BUILDING_BULK_UNIT_CONCURRENCY,
      async (pageNo) => {
        try {
          const data = await fetchPublicDataJson(
            url,
            {
              sigunguCd: dong.sigunguCd,
              bjdongCd: dong.bjdongCd,
              numOfRows: BUILDING_UNIT_PAGE_SIZE,
              pageNo,
            },
            env,
            label,
            BUILDING_BULK_UNIT_TIMEOUT_MS,
            1
          );
          return {
            pageNo,
            page: publicDataResponseParts(data, label),
            error: null,
          };
        } catch (error) {
          return {
            pageNo,
            page: null,
            error: String(error?.message || error),
          };
        }
      }
    );

    for (const result of pageResults) {
      if (result.error) {
        complete = false;
        warnings.push(`${label}:PAGE_FAILED:${dong.key}:${result.pageNo}`);
        continue;
      }
      acceptRows(result.page.items);
    }

    remainingPages -= allowedPages;
    const truncated = allowedPages < totalPages;
    if (truncated) {
      complete = false;
      warnings.push(`${label}:TRUNCATED:${dong.key}:${allowedPages}/${totalPages}`);
    }

    diagnostics.push({
      legalDong: dong.key,
      status: truncated ? "truncated" : "ok",
      totalCount: firstPage.totalCount,
      totalPages,
      fetchedPages: allowedPages,
      matchedRows: matchedRows - beforeMatched,
    });
  }

  for (const [parcelKey, rows] of rowsByParcel) {
    const deduped = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const key = buildingUnitRowStableKey(row, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    rowsByParcel.set(parcelKey, deduped);
  }

  return {
    complete,
    warnings,
    diagnostics,
    rowsByParcel,
    selectedLegalDongs: selectedDongs.map((dong) => dong.key),
    scannedRows,
    matchedRows,
  };
}

async function fetchBuildingHubBulkExclusiveAreaUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_AREA_URL,
    label: "BULK_EXCLUSIVE_AREA",
  });
}

async function fetchBuildingHubBulkExclusiveUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_URL,
    label: "BULK_EXCLUSIVE_UNIT",
  });
}

async function fetchMatchedBuildingUnitData(
  env,
  matchedBuildingRows,
  matchedKapt = [],
  options = {}
) {
  const parcels = new Map();

  for (const match of matchedBuildingRows || []) {
    const parcel = buildingParcelDescriptor(match?.row);
    if (!parcel) continue;
    if (!parcels.has(parcel.key)) {
      parcels.set(parcel.key, { parcel, titleMatches: [] });
    }
    parcels.get(parcel.key).titleMatches.push(match);
  }

  // V57: V3X/V46 방식 유지. 폴리곤 내부라는 이유만으로 모든 필지를 상세조회하지 않는다.
  // 먼저 표제부/K-APT와 실제로 결속된 building parcel만 상세조회한다.
  // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
  const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
    ? options.verifiedScopeParcels.map
    : new Map();

  // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
  // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
  // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
  for (const match of matchedKapt || []) {
    const parcelKey = cleanBuildingText(
      match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
    );
    if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
    if (parcels.has(parcelKey)) {
      const group = parcels.get(parcelKey);
      group.addedFromKaptScopeV48 = true;
      group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
      continue;
    }
    const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey.split("|");
    parcels.set(parcelKey, {
      parcel: { key: parcelKey, sigunguCd, bjdongCd, platGbCd, bun, ji },
      titleMatches: [],
      addedFromKaptScopeV48: true,
      kaptMatchesV51: [match],
    });
  }

  const parcelGroups = [...parcels.values()];
  const priorDetailEvidence = normalizeBuildingDetailEvidenceInput(
    options?.detailEvidence ?? options?.detail_evidence ?? []
  );
  const priorDetailEvidenceMap = new Map(
    priorDetailEvidence.map((item) => [item.parcelKey, item])
  );

  // V56 persistent detail cache: 알고리즘은 그대로 두고 과거에 정상 조회한 동일 필지 원천만 재사용한다.
  const detailCacheByRegion = new Map();
  const detailCacheIndex = new Map();
  for (const group of parcelGroups) {
    con
```

## sourceComplete #7
```js
cel = buildingParcelDescriptor(row);
      if (!parcel || !wantedParcelKeys.has(parcel.key)) continue;
      if (!rowsByParcel.has(parcel.key)) rowsByParcel.set(parcel.key, []);
      rowsByParcel.get(parcel.key).push(row);
      matchedRows += 1;
    }
  };

  for (const dong of selectedDongs) {
    if (remainingPages <= 0) {
      complete = false;
      warnings.push(`${label}:PAGE_BUDGET_EXHAUSTED`);
      break;
    }

    let firstPage;
    try {
      const data = await fetchPublicDataJson(
        url,
        {
          sigunguCd: dong.sigunguCd,
          bjdongCd: dong.bjdongCd,
          numOfRows: BUILDING_UNIT_PAGE_SIZE,
          pageNo: 1,
        },
        env,
        label,
        BUILDING_BULK_UNIT_TIMEOUT_MS,
        1
      );
      firstPage = publicDataResponseParts(data, label);
    } catch (error) {
      complete = false;
      diagnostics.push({
        legalDong: dong.key,
        status: "error",
        error: String(error?.message || error),
        totalCount: 0,
        fetchedPages: 0,
        matchedRows: 0,
      });
      warnings.push(`${label}:FAILED:${dong.key}`);
      continue;
    }

    const effectivePageSize = Math.max(
      1,
      Number(firstPage.numOfRows) || BUILDING_UNIT_PAGE_SIZE
    );
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(firstPage.totalCount, firstPage.items.length) /
        effectivePageSize
      )
    );
    const allowedPages = Math.max(
      1,
      Math.min(
        totalPages,
        BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG,
        remainingPages
      )
    );
    const beforeMatched = matchedRows;
    acceptRows(firstPage.items);

    const pageNumbers = [];
    for (let pageNo = 2; pageNo <= allowedPages; pageNo++) {
      pageNumbers.push(pageNo);
    }

    const pageResults = await mapBuildingWithConcurrency(
      pageNumbers,
      BUILDING_BULK_UNIT_CONCURRENCY,
      async (pageNo) => {
        try {
          const data = await fetchPublicDataJson(
            url,
            {
              sigunguCd: dong.sigunguCd,
              bjdongCd: dong.bjdongCd,
              numOfRows: BUILDING_UNIT_PAGE_SIZE,
              pageNo,
            },
            env,
            label,
            BUILDING_BULK_UNIT_TIMEOUT_MS,
            1
          );
          return {
            pageNo,
            page: publicDataResponseParts(data, label),
            error: null,
          };
        } catch (error) {
          return {
            pageNo,
            page: null,
            error: String(error?.message || error),
          };
        }
      }
    );

    for (const result of pageResults) {
      if (result.error) {
        complete = false;
        warnings.push(`${label}:PAGE_FAILED:${dong.key}:${result.pageNo}`);
        continue;
      }
      acceptRows(result.page.items);
    }

    remainingPages -= allowedPages;
    const truncated = allowedPages < totalPages;
    if (truncated) {
      complete = false;
      warnings.push(`${label}:TRUNCATED:${dong.key}:${allowedPages}/${totalPages}`);
    }

    diagnostics.push({
      legalDong: dong.key,
      status: truncated ? "truncated" : "ok",
      totalCount: firstPage.totalCount,
      totalPages,
      fetchedPages: allowedPages,
      matchedRows: matchedRows - beforeMatched,
    });
  }

  for (const [parcelKey, rows] of rowsByParcel) {
    const deduped = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const key = buildingUnitRowStableKey(row, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    rowsByParcel.set(parcelKey, deduped);
  }

  return {
    complete,
    warnings,
    diagnostics,
    rowsByParcel,
    selectedLegalDongs: selectedDongs.map((dong) => dong.key),
    scannedRows,
    matchedRows,
  };
}

async function fetchBuildingHubBulkExclusiveAreaUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_AREA_URL,
    label: "BULK_EXCLUSIVE_AREA",
  });
}

async function fetchBuildingHubBulkExclusiveUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_URL,
    label: "BULK_EXCLUSIVE_UNIT",
  });
}

async function fetchMatchedBuildingUnitData(
  env,
  matchedBuildingRows,
  matchedKapt = [],
  options = {}
) {
  const parcels = new Map();

  for (const match of matchedBuildingRows || []) {
    const parcel = buildingParcelDescriptor(match?.row);
    if (!parcel) continue;
    if (!parcels.has(parcel.key)) {
      parcels.set(parcel.key, { parcel, titleMatches: [] });
    }
    parcels.get(parcel.key).titleMatches.push(match);
  }

  // V57: V3X/V46 방식 유지. 폴리곤 내부라는 이유만으로 모든 필지를 상세조회하지 않는다.
  // 먼저 표제부/K-APT와 실제로 결속된 building parcel만 상세조회한다.
  // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
  const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
    ? options.verifiedScopeParcels.map
    : new Map();

  // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
  // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
  // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
  for (const match of matchedKapt || []) {
    const parcelKey = cleanBuildingText(
      match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
    );
    if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
    if (parcels.has(parcelKey)) {
      const group = parcels.get(parcelKey);
      group.addedFromKaptScopeV48 = true;
      group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
      continue;
    }
    const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey.split("|");
    parcels.set(parcelKey, {
      parcel: { key: parcelKey, sigunguCd, bjdongCd, platGbCd, bun, ji },
      titleMatches: [],
      addedFromKaptScopeV48: true,
      kaptMatchesV51: [match],
    });
  }

  const parcelGroups = [...parcels.values()];
  const priorDetailEvidence = normalizeBuildingDetailEvidenceInput(
    options?.detailEvidence ?? options?.detail_evidence ?? []
  );
  const priorDetailEvidenceMap = new Map(
    priorDetailEvidence.map((item) => [item.parcelKey, item])
  );

  // V56 persistent detail cache: 알고리즘은 그대로 두고 과거에 정상 조회한 동일 필지 원천만 재사용한다.
  const detailCacheByRegion = new Map();
  const detailCacheIndex = new Map();
  for (const group of parcelGroups) {
    const regionKey = v56RegionKeyFromParcel(group.parcel);
    if (!regionKey || detailCacheByRegion.has(regionKey)) continue;
    const loaded = await v56FetchRawCacheRows(env, regionKey, "DETAIL_PARCEL_V56");
    detailCacheByRegion.set(regionKey, loaded);
    for (const row of loaded.rows || []) {
      const key = String(row?.cache_key || "").trim();
      if (key) detailCacheIndex.set(key, row);
    }
  }

  const warnings = [
    "V29_DIRECT_PARCEL_DETAIL: 법정동 전체 bulk 전유부 대신 폴리곤 매칭 필지를 직접 조회합니다.",
  ];
  let complete = priorDetailEvidence.every((item) => item.sourceComplete !== false);
  const resultByKey = new Map();
  const detailCandidates = [];

  // V29: 법정동 전체 전유부는 대림동처럼 수백 페이지인 곳에서 앞 10페이지만 읽고
  // 잘리는 문제가 있었다. 정확도를 위해 matched parcel을 전부 직접조회 대상으로 둔다.
  for (const group of parcelGroups) {
    const priorEvidence = priorDetailEvidenceMap.get(group.parcel.key) || null;
    if (priorEvidence) {
      resultByKey.set(group.parcel.key, {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        areaRows: priorEvidence.areaRows || [],
        exposRows: priorEvidence.exposRows || [],
        recapRows: priorEvidence.recapRows || [],
        housePriceRows: priorEvidence.housePriceRows || [],
        floorRows: priorEvidence.floorRows || [],
        sourceComplete: priorEvidence.sourceComplete !== false,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        queryDiagnostics: {
          optimized: true,
          skippedReason: "detail_continuation_evidence_v29",
        },
      });
      continue;
    }

    const persistentCacheKey = v56RawCacheKey("DETAIL_PARCEL_V56", group.parcel.key);
    const persistentCached = v56CachedDetailResult(
      detailCacheIndex.get(persistentCacheKey),
      group.parcel,
      group.titleMatches
    );
    if (persistentCached) {
      persistentCached.addedFromKaptScopeV48 = group.addedFromKaptScopeV48 === true;
      persistentCached.kaptMatchesV51 = group.kaptMatchesV51 || [];
      resultByKey.set(group.parcel.key, persistentCached);
      continue;
    }

    const titleEvidenceRows = titleParcelFallback(group.titleMatches);
    const expectedTitleUnits = titleEvidenceRows.reduce(
      (sum, item) => sum + Math.max(0, Math.trunc(Number(item?.units) || 0)),
      0
    );

    // V57 speed-up without accuracy loss: 표제부 자체에 authoritative 세대/호수와 승강기 값이 모두 있고
    // 순수 주거 건물이라면 전유부/공용면적/층별개요/총괄표제/주택가격을 다시 5번 조회하지 않는다.
    // 혼합용도/상가/오피스텔/표제부 세대수 없음/승강기 미상은 기존 V29 상세조회 경로를 그대로 탄다.
    const authoritativeTitleRowsV57 = titleEvidenceRows.filter((item) => item?.confidence === "authoritative");
    const simpleResidentialTitleV57 = (
      titleEvidenceRows.length > 0 &&
      authoritativeTitleRowsV57.length === titleEvidenceRows.length &&
      titleEvidenceRows.every((item) => {
        const c = item?.classification || {};
        return c.residential === true && c.commercial !== true && c.mixedUse !== true && c.officetel !== true;
      }) &&
      titleEvidenceRows.every((item) => buildingElevatorInfo(item?.row || {}).known === true)
    );
    const kaptApartmentSufficientV57 = (
      group.addedFromKaptScopeV48 === true &&
      (group.kaptMatchesV51 || []).some((match) => {
        const list = match?.list || {};
        return Number(list?.households || 0) > 0 && list?.elevatorKnown === true;
      }) &&
      !(group.titleMatches || []).some((match) => {
        const c = buildingHousingClassification(match?.row || {});
        return c.commercial || c.mixedUse || c.officetel;
      })
    );

    if (simpleResidentialTitleV57 || kaptApartmentSufficientV57) {
      resultByKey.set(group.parcel.key, {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        areaRows: [],
        exposRows: [],
        recapRows: [],
        housePriceRows: [],
        floorRows: [],
        sourceComplete: true,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        queryDiagnostics: {
          optimized: true,
          skippedReason: simpleResidentialTitleV57
            ? "v57_authoritative_simple_residential_title"
            : "v57_kapt_apartment_sufficient",
        },
      });
      continue;
    }

    const expectedBuildingCount = new Set(
      (group.titleMatches || [])
        .map((match) => buildingRecordKey(match?.row || {}))
        .filter(Boolean)
    ).size;
    const densityPriority = titleEvidenceRows.reduce((score, item) => {
      const classification = item?.classification || {};
      const purpose = String(classification?.purpose || "");
      if (classification.officetel) score += 80;
      if (classification.mixedUse) score += 120;
      if (/다세대|연립|다가구|도시형생활주택/.test(purpose)) score += 50;
      if (/업무시설|사무소|근린생활시설|판매시설|병원|의원|의료시설/.test(purpose)) score += 60;
      return score;
    }, 0);

    detailCandidates.push({
      ...group,
      priority:
        (group.addedFromVerifiedScopeV51 ? 100000 : 0) +
        (group.addedFromKaptScopeV48 ? 80000 : 0) +
        densityPriority + expectedTitleUnits * 10 + expectedBuildingCount * 5,
      initialAreaRows: [],
      initialExposRows: [],
    });
  }

  detailCandidates.sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));
  const selectedCandidates = detailCandidates.slice(
    0,
    BUILDING_STATS_MAX_DETAIL_PARCELS_PER_REQUEST
  );
  const deferredCandidates = detailCandidates.slice(
    BUILDING_STATS_MAX_DETAIL_PARCELS_PER_REQUEST
  );

  if (deferredCandidates.length) {
    warnings.push(
      `DETAIL_CONTINUATION_V29: 이번 요청에서 직접 상세조회 ${selectedCandidates.length}필지를 처리하고 ` +
      `${deferredCandidates.length}필지를 다음 배치로 넘깁니다.`
    );
  }

  const emptySource = (reason) => ({
    rows: [],
    queryVariant: null,
    attempts: [],
    error: null,
    skippedReason: reason || null,
  });

  const selectedResults = await mapBuildingWithConcurrency(
    selectedCandidates,
    BUILDING_UNIT_FETCH_CONCURRENCY,
    async ({ parcel, titleMatches, addedFromVerifiedScopeV51, addedFromKaptScopeV48, verifiedScopeEntryV51, kaptMatchesV51 }) => {
      const fetchOne = async (url, label) => {
        try {
          return await fetchBuildingHubParcelPages(
            env,
            url,
            label,
            parcel,
            {
              maxVariants: BUILDING_UNIT_QUERY_VARIANT_LIMIT,
              maxAttempts: BUILDING_UNIT_DETAIL_MAX_ATTEMPTS,
            }
          );
        } catch (error) {
          complete = false;
          warnings.push(
            `${parcel.key} ${label}: ${String(error?.message || error || "failed")}`
          );
          return {
            rows: [],
            queryVariant: null,
            attempts: [],
            error: String(error?.message || error || "failed"),
          };
        }
      };

      const expos = await fetchOne(
        BUILDING_HUB_EXPOS_URL,
        "Building HUB exclusive-unit direct parcel V29"
      );
      const area = await fetchOne(
        BUILDING_HUB_EXPOS_AREA_URL,
        "Building HUB exclusive/common-area direct parcel V29"
      );
      const floor = await fetchOne(
        BUILDING_HUB_FLOOR_URL,
        "Building HUB floor-overview direct parcel V29"
      );

      const exposHasUnits = (expos.rows || []).some((row) =>
        !isCommonAreaUnitRecord(row) &&
        (!!unitHoName(row) || !!buildingUnitRowStableKey(row))
      );
      const areaHasUnits = (area.rows || []).some((row) =>
        !isCommonAreaUnitRecord(row) &&
        isExclusiveAreaUnitRecord(row) &&
        (!!unitHoName(row) || !!buildingUnitRowStableKey(row))
      );

      const titleHasCommercialOrMixedV51 = (titleMatches || []).some((match) => {
        const classification = buildingHousingClassification(match?.row || {});
        return classification.commercial || classification.mixedUse;
      });
      const shouldFetchRecapV51 = Boolean(
        !titleMatches?.length ||
        addedFromVerifiedScopeV51 ||
        addedFromKaptScopeV48 ||
        !titleHasCommercialOrMixedV51 ||
        (!exposHasUnits && !areaHasUnits)
      );
      let recap = emptySource(shouldFetchRecapV51 ? null : "strong_title_and_exclusive_units_available");
      if (shouldFetchRecapV51) {
        recap = await fetchOne(
          BUILDING_HUB_RECAP_TITLE_URL,
          "Building HUB recap-title direct parcel V51"
        );
      }

      const recapHasUnits = !!bestRecapFallback(recap.rows || []);
      let housePrice = emptySource("earlier_source_available");
      if (!exposHasUnits && !areaHasUnits && !recapHasUnits) {
        housePrice = await fetchOne(
          BUILDING_HUB_HOUSE_PRICE_URL,
          "Building HUB house-price direct parcel V29"
        );
      }

      const sourceComplete = ![area, expos, floor, recap, housePrice]
        .some((source) => source && source.error);

      return {
        parcel,
        titleMatches,
        addedFromVerifiedScopeV51: addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: verifiedScopeEntryV51 || null,
        kaptMatchesV51: kaptMatchesV51 || [],
        areaRows: area.rows || [],
        exposRows: expos.rows || [],
        recapRows: recap.rows || [],
        housePriceRows: housePrice.rows || [],
        floorRows: floor.rows || [],
        sourceComplete,
        queryDiagnostics: {
          optimized: true,
          directParcelV29: true,
          area,
          expos,
          floor,
          recap,
          housePrice,
        },
      };
    }
  );

  for (const result of selectedResults) {
    resultByKey.set(result.parcel.key, result);
    if (result.sourceComplete === false) complete = false;
  }

  const v56DetailCacheWrites = selectedResults
    .filter((result) => result?.sourceComplete !== false && result?.parcel?.key)
    .map((result) => v56RawCacheRow({
      sourceType: "DETAIL_PARCEL_V56",
      regionKey: v56RegionKeyFromParcel(result.parcel),
      parcelKey: result.parcel.key,
      identity: result.parcel.key,
      payload: {
        areaRows: result.areaRows || [],
        exposRows: result.exposRows || [],
        recapRows: result.recapRows || [
```

## sourceComplete #8
```js
UNIT_TIMEOUT_MS,
        1
      );
      firstPage = publicDataResponseParts(data, label);
    } catch (error) {
      complete = false;
      diagnostics.push({
        legalDong: dong.key,
        status: "error",
        error: String(error?.message || error),
        totalCount: 0,
        fetchedPages: 0,
        matchedRows: 0,
      });
      warnings.push(`${label}:FAILED:${dong.key}`);
      continue;
    }

    const effectivePageSize = Math.max(
      1,
      Number(firstPage.numOfRows) || BUILDING_UNIT_PAGE_SIZE
    );
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(firstPage.totalCount, firstPage.items.length) /
        effectivePageSize
      )
    );
    const allowedPages = Math.max(
      1,
      Math.min(
        totalPages,
        BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG,
        remainingPages
      )
    );
    const beforeMatched = matchedRows;
    acceptRows(firstPage.items);

    const pageNumbers = [];
    for (let pageNo = 2; pageNo <= allowedPages; pageNo++) {
      pageNumbers.push(pageNo);
    }

    const pageResults = await mapBuildingWithConcurrency(
      pageNumbers,
      BUILDING_BULK_UNIT_CONCURRENCY,
      async (pageNo) => {
        try {
          const data = await fetchPublicDataJson(
            url,
            {
              sigunguCd: dong.sigunguCd,
              bjdongCd: dong.bjdongCd,
              numOfRows: BUILDING_UNIT_PAGE_SIZE,
              pageNo,
            },
            env,
            label,
            BUILDING_BULK_UNIT_TIMEOUT_MS,
            1
          );
          return {
            pageNo,
            page: publicDataResponseParts(data, label),
            error: null,
          };
        } catch (error) {
          return {
            pageNo,
            page: null,
            error: String(error?.message || error),
          };
        }
      }
    );

    for (const result of pageResults) {
      if (result.error) {
        complete = false;
        warnings.push(`${label}:PAGE_FAILED:${dong.key}:${result.pageNo}`);
        continue;
      }
      acceptRows(result.page.items);
    }

    remainingPages -= allowedPages;
    const truncated = allowedPages < totalPages;
    if (truncated) {
      complete = false;
      warnings.push(`${label}:TRUNCATED:${dong.key}:${allowedPages}/${totalPages}`);
    }

    diagnostics.push({
      legalDong: dong.key,
      status: truncated ? "truncated" : "ok",
      totalCount: firstPage.totalCount,
      totalPages,
      fetchedPages: allowedPages,
      matchedRows: matchedRows - beforeMatched,
    });
  }

  for (const [parcelKey, rows] of rowsByParcel) {
    const deduped = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const key = buildingUnitRowStableKey(row, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });
    rowsByParcel.set(parcelKey, deduped);
  }

  return {
    complete,
    warnings,
    diagnostics,
    rowsByParcel,
    selectedLegalDongs: selectedDongs.map((dong) => dong.key),
    scannedRows,
    matchedRows,
  };
}

async function fetchBuildingHubBulkExclusiveAreaUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_AREA_URL,
    label: "BULK_EXCLUSIVE_AREA",
  });
}

async function fetchBuildingHubBulkExclusiveUnits(env, parcelGroups) {
  return fetchBuildingHubBulkUnitRows(env, parcelGroups, {
    url: BUILDING_HUB_EXPOS_URL,
    label: "BULK_EXCLUSIVE_UNIT",
  });
}

async function fetchMatchedBuildingUnitData(
  env,
  matchedBuildingRows,
  matchedKapt = [],
  options = {}
) {
  const parcels = new Map();

  for (const match of matchedBuildingRows || []) {
    const parcel = buildingParcelDescriptor(match?.row);
    if (!parcel) continue;
    if (!parcels.has(parcel.key)) {
      parcels.set(parcel.key, { parcel, titleMatches: [] });
    }
    parcels.get(parcel.key).titleMatches.push(match);
  }

  // V57: V3X/V46 방식 유지. 폴리곤 내부라는 이유만으로 모든 필지를 상세조회하지 않는다.
  // 먼저 표제부/K-APT와 실제로 결속된 building parcel만 상세조회한다.
  // scopeParcels는 누락 표제부를 직접 찾는 입력으로는 계속 쓰지만, 상세대상 자체를 강제로 늘리지 않는다.
  const verifiedScopeMapV51 = options?.verifiedScopeParcels?.map instanceof Map
    ? options.verifiedScopeParcels.map
    : new Map();

  // V48: Building HUB 표제부가 0건/오분류여도 K-APT가 폴리곤 scope 필지에 직접 결속되면
  // 그 필지를 상세조회 대상으로 추가한다. 이 경로로 아파트 공식 세대수는 K-APT에서,
  // 같은 필지의 근린생활시설/상가 전유호는 Building HUB 상세 API에서 별도로 복구한다.
  for (const match of matchedKapt || []) {
    const parcelKey = cleanBuildingText(
      match?.list?.__scopeParcelKeyV46 ?? match?.list?.scopeParcelKey ?? match?.scopeParcelKey
    );
    if (!/^\d{5}\|\d{5}\|[01]\|\d{4}\|\d{4}$/.test(parcelKey)) continue;
    if (parcels.has(parcelKey)) {
      const group = parcels.get(parcelKey);
      group.addedFromKaptScopeV48 = true;
      group.kaptMatchesV51 = [...(group.kaptMatchesV51 || []), match];
      continue;
    }
    const [sigunguCd, bjdongCd, platGbCd, bun, ji] = parcelKey.split("|");
    parcels.set(parcelKey, {
      parcel: { key: parcelKey, sigunguCd, bjdongCd, platGbCd, bun, ji },
      titleMatches: [],
      addedFromKaptScopeV48: true,
      kaptMatchesV51: [match],
    });
  }

  const parcelGroups = [...parcels.values()];
  const priorDetailEvidence = normalizeBuildingDetailEvidenceInput(
    options?.detailEvidence ?? options?.detail_evidence ?? []
  );
  const priorDetailEvidenceMap = new Map(
    priorDetailEvidence.map((item) => [item.parcelKey, item])
  );

  // V56 persistent detail cache: 알고리즘은 그대로 두고 과거에 정상 조회한 동일 필지 원천만 재사용한다.
  const detailCacheByRegion = new Map();
  const detailCacheIndex = new Map();
  for (const group of parcelGroups) {
    const regionKey = v56RegionKeyFromParcel(group.parcel);
    if (!regionKey || detailCacheByRegion.has(regionKey)) continue;
    const loaded = await v56FetchRawCacheRows(env, regionKey, "DETAIL_PARCEL_V56");
    detailCacheByRegion.set(regionKey, loaded);
    for (const row of loaded.rows || []) {
      const key = String(row?.cache_key || "").trim();
      if (key) detailCacheIndex.set(key, row);
    }
  }

  const warnings = [
    "V29_DIRECT_PARCEL_DETAIL: 법정동 전체 bulk 전유부 대신 폴리곤 매칭 필지를 직접 조회합니다.",
  ];
  let complete = priorDetailEvidence.every((item) => item.sourceComplete !== false);
  const resultByKey = new Map();
  const detailCandidates = [];

  // V29: 법정동 전체 전유부는 대림동처럼 수백 페이지인 곳에서 앞 10페이지만 읽고
  // 잘리는 문제가 있었다. 정확도를 위해 matched parcel을 전부 직접조회 대상으로 둔다.
  for (const group of parcelGroups) {
    const priorEvidence = priorDetailEvidenceMap.get(group.parcel.key) || null;
    if (priorEvidence) {
      resultByKey.set(group.parcel.key, {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        areaRows: priorEvidence.areaRows || [],
        exposRows: priorEvidence.exposRows || [],
        recapRows: priorEvidence.recapRows || [],
        housePriceRows: priorEvidence.housePriceRows || [],
        floorRows: priorEvidence.floorRows || [],
        sourceComplete: priorEvidence.sourceComplete !== false,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        queryDiagnostics: {
          optimized: true,
          skippedReason: "detail_continuation_evidence_v29",
        },
      });
      continue;
    }

    const persistentCacheKey = v56RawCacheKey("DETAIL_PARCEL_V56", group.parcel.key);
    const persistentCached = v56CachedDetailResult(
      detailCacheIndex.get(persistentCacheKey),
      group.parcel,
      group.titleMatches
    );
    if (persistentCached) {
      persistentCached.addedFromKaptScopeV48 = group.addedFromKaptScopeV48 === true;
      persistentCached.kaptMatchesV51 = group.kaptMatchesV51 || [];
      resultByKey.set(group.parcel.key, persistentCached);
      continue;
    }

    const titleEvidenceRows = titleParcelFallback(group.titleMatches);
    const expectedTitleUnits = titleEvidenceRows.reduce(
      (sum, item) => sum + Math.max(0, Math.trunc(Number(item?.units) || 0)),
      0
    );

    // V57 speed-up without accuracy loss: 표제부 자체에 authoritative 세대/호수와 승강기 값이 모두 있고
    // 순수 주거 건물이라면 전유부/공용면적/층별개요/총괄표제/주택가격을 다시 5번 조회하지 않는다.
    // 혼합용도/상가/오피스텔/표제부 세대수 없음/승강기 미상은 기존 V29 상세조회 경로를 그대로 탄다.
    const authoritativeTitleRowsV57 = titleEvidenceRows.filter((item) => item?.confidence === "authoritative");
    const simpleResidentialTitleV57 = (
      titleEvidenceRows.length > 0 &&
      authoritativeTitleRowsV57.length === titleEvidenceRows.length &&
      titleEvidenceRows.every((item) => {
        const c = item?.classification || {};
        return c.residential === true && c.commercial !== true && c.mixedUse !== true && c.officetel !== true;
      }) &&
      titleEvidenceRows.every((item) => buildingElevatorInfo(item?.row || {}).known === true)
    );
    const kaptApartmentSufficientV57 = (
      group.addedFromKaptScopeV48 === true &&
      (group.kaptMatchesV51 || []).some((match) => {
        const list = match?.list || {};
        return Number(list?.households || 0) > 0 && list?.elevatorKnown === true;
      }) &&
      !(group.titleMatches || []).some((match) => {
        const c = buildingHousingClassification(match?.row || {});
        return c.commercial || c.mixedUse || c.officetel;
      })
    );

    if (simpleResidentialTitleV57 || kaptApartmentSufficientV57) {
      resultByKey.set(group.parcel.key, {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        areaRows: [],
        exposRows: [],
        recapRows: [],
        housePriceRows: [],
        floorRows: [],
        sourceComplete: true,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        queryDiagnostics: {
          optimized: true,
          skippedReason: simpleResidentialTitleV57
            ? "v57_authoritative_simple_residential_title"
            : "v57_kapt_apartment_sufficient",
        },
      });
      continue;
    }

    const expectedBuildingCount = new Set(
      (group.titleMatches || [])
        .map((match) => buildingRecordKey(match?.row || {}))
        .filter(Boolean)
    ).size;
    const densityPriority = titleEvidenceRows.reduce((score, item) => {
      const classification = item?.classification || {};
      const purpose = String(classification?.purpose || "");
      if (classification.officetel) score += 80;
      if (classification.mixedUse) score += 120;
      if (/다세대|연립|다가구|도시형생활주택/.test(purpose)) score += 50;
      if (/업무시설|사무소|근린생활시설|판매시설|병원|의원|의료시설/.test(purpose)) score += 60;
      return score;
    }, 0);

    detailCandidates.push({
      ...group,
      priority:
        (group.addedFromVerifiedScopeV51 ? 100000 : 0) +
        (group.addedFromKaptScopeV48 ? 80000 : 0) +
        densityPriority + expectedTitleUnits * 10 + expectedBuildingCount * 5,
      initialAreaRows: [],
      initialExposRows: [],
    });
  }

  detailCandidates.sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));
  const selectedCandidates = detailCandidates.slice(
    0,
    BUILDING_STATS_MAX_DETAIL_PARCELS_PER_REQUEST
  );
  const deferredCandidates = detailCandidates.slice(
    BUILDING_STATS_MAX_DETAIL_PARCELS_PER_REQUEST
  );

  if (deferredCandidates.length) {
    warnings.push(
      `DETAIL_CONTINUATION_V29: 이번 요청에서 직접 상세조회 ${selectedCandidates.length}필지를 처리하고 ` +
      `${deferredCandidates.length}필지를 다음 배치로 넘깁니다.`
    );
  }

  const emptySource = (reason) => ({
    rows: [],
    queryVariant: null,
    attempts: [],
    error: null,
    skippedReason: reason || null,
  });

  const selectedResults = await mapBuildingWithConcurrency(
    selectedCandidates,
    BUILDING_UNIT_FETCH_CONCURRENCY,
    async ({ parcel, titleMatches, addedFromVerifiedScopeV51, addedFromKaptScopeV48, verifiedScopeEntryV51, kaptMatchesV51 }) => {
      const fetchOne = async (url, label) => {
        try {
          return await fetchBuildingHubParcelPages(
            env,
            url,
            label,
            parcel,
            {
              maxVariants: BUILDING_UNIT_QUERY_VARIANT_LIMIT,
              maxAttempts: BUILDING_UNIT_DETAIL_MAX_ATTEMPTS,
            }
          );
        } catch (error) {
          complete = false;
          warnings.push(
            `${parcel.key} ${label}: ${String(error?.message || error || "failed")}`
          );
          return {
            rows: [],
            queryVariant: null,
            attempts: [],
            error: String(error?.message || error || "failed"),
          };
        }
      };

      const expos = await fetchOne(
        BUILDING_HUB_EXPOS_URL,
        "Building HUB exclusive-unit direct parcel V29"
      );
      const area = await fetchOne(
        BUILDING_HUB_EXPOS_AREA_URL,
        "Building HUB exclusive/common-area direct parcel V29"
      );
      const floor = await fetchOne(
        BUILDING_HUB_FLOOR_URL,
        "Building HUB floor-overview direct parcel V29"
      );

      const exposHasUnits = (expos.rows || []).some((row) =>
        !isCommonAreaUnitRecord(row) &&
        (!!unitHoName(row) || !!buildingUnitRowStableKey(row))
      );
      const areaHasUnits = (area.rows || []).some((row) =>
        !isCommonAreaUnitRecord(row) &&
        isExclusiveAreaUnitRecord(row) &&
        (!!unitHoName(row) || !!buildingUnitRowStableKey(row))
      );

      const titleHasCommercialOrMixedV51 = (titleMatches || []).some((match) => {
        const classification = buildingHousingClassification(match?.row || {});
        return classification.commercial || classification.mixedUse;
      });
      const shouldFetchRecapV51 = Boolean(
        !titleMatches?.length ||
        addedFromVerifiedScopeV51 ||
        addedFromKaptScopeV48 ||
        !titleHasCommercialOrMixedV51 ||
        (!exposHasUnits && !areaHasUnits)
      );
      let recap = emptySource(shouldFetchRecapV51 ? null : "strong_title_and_exclusive_units_available");
      if (shouldFetchRecapV51) {
        recap = await fetchOne(
          BUILDING_HUB_RECAP_TITLE_URL,
          "Building HUB recap-title direct parcel V51"
        );
      }

      const recapHasUnits = !!bestRecapFallback(recap.rows || []);
      let housePrice = emptySource("earlier_source_available");
      if (!exposHasUnits && !areaHasUnits && !recapHasUnits) {
        housePrice = await fetchOne(
          BUILDING_HUB_HOUSE_PRICE_URL,
          "Building HUB house-price direct parcel V29"
        );
      }

      const sourceComplete = ![area, expos, floor, recap, housePrice]
        .some((source) => source && source.error);

      return {
        parcel,
        titleMatches,
        addedFromVerifiedScopeV51: addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: verifiedScopeEntryV51 || null,
        kaptMatchesV51: kaptMatchesV51 || [],
        areaRows: area.rows || [],
        exposRows: expos.rows || [],
        recapRows: recap.rows || [],
        housePriceRows: housePrice.rows || [],
        floorRows: floor.rows || [],
        sourceComplete,
        queryDiagnostics: {
          optimized: true,
          directParcelV29: true,
          area,
          expos,
          floor,
          recap,
          housePrice,
        },
      };
    }
  );

  for (const result of selectedResults) {
    resultByKey.set(result.parcel.key, result);
    if (result.sourceComplete === false) complete = false;
  }

  const v56DetailCacheWrites = selectedResults
    .filter((result) => result?.sourceComplete !== false && result?.parcel?.key)
    .map((result) => v56RawCacheRow({
      sourceType: "DETAIL_PARCEL_V56",
      regionKey: v56RegionKeyFromParcel(result.parcel),
      parcelKey: result.parcel.key,
      identity: result.parcel.key,
      payload: {
        areaRows: result.areaRows || [],
        exposRows: result.exposRows || [],
        recapRows: result.recapRows || [],
        housePriceRows: result.housePriceRows || [],
        floorRows: result.floorRows || [],
        sourceComplete: true,
      },
      days: BUILDING_V56_DETAIL_PARCEL_CACHE_DAYS,
    }));
  if (v56DetailCacheWrites.length) {
    const saved = await v56UpsertRawCacheRows(env, v56DetailCacheWrites);
    if (!saved.ok) warnings.push(`V56_DETAIL_CACHE_WRITE_FAILED:${saved.error}`);
  }

  for (const group of deferredCandidates) {
    const reason = "deferred_to_detail_continuation_v29";
    resultByKey.set(group.parcel.key, {
      parcel: group.parcel,
      titleMatches: group.titleMatches,
      addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
      addedFromKaptScopeV48: group.addedFromK
```

## missing = #1
```js
if (!geometry || typeof geometry !== "object") return false;

  if (geometry.type === "Polygon") {
    return pointInBuildingPolygon(
      lng,
      lat,
      geometry.coordinates
    );
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((polygon) =>
      pointInBuildingPolygon(lng, lat, polygon)
    );
  }

  return false;
}

function normalizeBuildingLocationPoint(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);

    if (
      first >= 120 && first <= 135 &&
      second >= 30 && second <= 45
    ) {
      return {
        lng: first,
        lat: second,
        zonecode: null,
        identityVerified: false,
        addressVerified: false,
        legalDongCode: null,
        parcelMainNo: null,
        parcelSubNo: null,
      };
    }

    if (
      second >= 120 && second <= 135 &&
      first >= 30 && first <= 45
    ) {
      return {
        lng: second,
        lat: first,
        zonecode: null,
        identityVerified: false,
        addressVerified: false,
        legalDongCode: null,
        parcelMainNo: null,
        parcelSubNo: null,
      };
    }

    return null;
  }

  if (!value || typeof value !== "object") return null;

  const lat = Number(value.lat ?? value.latitude ?? value.y);
  const lng = Number(value.lng ?? value.lon ?? value.longitude ?? value.x);

  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < 30 || lat > 45 || lng < 120 || lng > 135
  ) {
    return null;
  }

  const rawZonecode = String(
    value.zonecode ?? value.zoneCode ?? value.zone_no ?? value.zoneNo ??
    value.postcode ?? value.postalCode ?? ""
  ).replace(/\D/g, "");

  const legalDongCode = String(
    value.legalDongCode ?? value.legal_dong_code ??
    value.bCode ?? value.b_code ?? ""
  ).replace(/\D/g, "");

  const normalizeNo = (v) => {
    const digits = String(v ?? "").replace(/\D/g, "");
    return digits ? String(Number(digits)) : "0";
  };

  return {
    lat,
    lng,
    zonecode: rawZonecode.length === 5 ? rawZonecode : null,
    identityVerified:
      value.identityVerified === true || value.identity_verified === true,
    addressVerified:
      value.addressVerified === true || value.address_verified === true,
    legalDongCode: legalDongCode.length === 10 ? legalDongCode : null,
    parcelMainNo: normalizeNo(
      value.parcelMainNo ?? value.parcel_main_no ?? value.mainAddressNo ?? value.main_address_no
    ),
    parcelSubNo: normalizeNo(
      value.parcelSubNo ?? value.parcel_sub_no ?? value.subAddressNo ?? value.sub_address_no
    ),
    matchType: cleanBuildingText(value.matchType ?? value.match_type) || null,
    matchedAddress: cleanBuildingText(value.matchedAddress ?? value.matched_address) || null,
    matchScore: finiteNumberOrNull(value.matchScore ?? value.match_score),
  };
}

function buildBuildingLocationIndex(input) {
  const index = new Map();

  const put = (key, point) => {
    const normalizedKey = cleanBuildingText(key);
    const normalizedPoint = normalizeBuildingLocationPoint(point);

    if (!normalizedKey || !normalizedPoint) return;
    index.set(normalizedKey, normalizedPoint);
  };

  const putAddress = (value, point) => {
    const normalized = normalizedBuildingAddress(value);
    if (normalized) put(normalized, point);
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;

      const point = normalizeBuildingLocationPoint(item);
      if (!point) continue;

      put(
        item.key ??
        item.recordKey ??
        item.record_key,
        point
      );

      put(
        item.mgmBldrgstPk ??
        item.mgm_bldrgst_pk ??
        item.managementKey,
        point
      );

      const addressValues = [
        item.address,
        item.roadAddress,
        item.road_address,
        item.parcelAddress,
        item.parcel_address,
        ...(Array.isArray(item.addressAliases)
          ? item.addressAliases
          : []),
        ...(Array.isArray(item.address_aliases)
          ? item.address_aliases
          : []),
      ];

      for (const address of addressValues) {
        putAddress(address, point);
      }
    }

    return index;
  }

  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      put(key, value);
    }
  }

  return index;
}

function findBuildingRecordLocation(row, locationIndex) {
  const direct = normalizeBuildingLocationPoint({
    lat:
      row?.lat ??
      row?.latitude,
    lng:
      row?.lng ??
      row?.lon ??
      row?.longitude,
  });

  if (direct) return direct;

  const key = buildingRecordKey(row);
  if (locationIndex.has(key)) {
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
  if (!data || typeof data !== "object") return null;
  const root = data.OpenAPI_ServiceResponse ?? data.openAPI_ServiceResponse ?? data.openapi_service_response ?? data;
  const header = root?.cmmMsgHeader ?? root?.cmm_msg_header ?? data?.cmmMsgHeader ?? data?.cmm_msg_header ?? null;
  if (!header || typeof header !== "object") return null;
  const code = String(publicDataField(header, "returnReasonCode", "return_reason_code", "resultCode", "code") ?? "").trim();
  const auth = String(publicDataField(header, "returnAuthMsg", "return_auth_msg", "resultMsg", "message") ?? "").trim();
  const err = String(publicDataField(header, "errMsg", "err_msg", "error") ?? "").trim();
  if (!code && !auth && !err) return null;
  if (code === "00" || code === "0") return null;
  return { code, auth, err };
}

function publicDataGatewayErrorFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const found = publicDataGatewayErrorFromObject(JSON.parse(raw));
      if (found) return found;
    } catch {}
  }
  const tag = (names) => {
    for (const name of names) {
      const match = raw.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
      if (match) return decodeBuildingXmlEntities(match[1]).trim();
    }
    return "";
  };
  const code = tag(["returnReasonCode", "return_reason_code"]);
  const auth = tag(["returnAuthMsg", "return_auth_msg"]);
  const err = tag(["errMsg", "err_msg"]);
  if (!code && !auth && !err) return null;
  if (code === "00" || code === "0") return null;
  return { code, auth, err };
}

function publicDataGatewayHttpError(label, info) {
  const code = String(info?.code || "").trim();
  const auth = String(info?.auth || "").trim();
  const errText = String(info?.err || "").trim();
  const descriptions = {
    "04": "공공데이터 제공기관 연결 오류",
    "05": "공공데이터 제공기관 응답 시간초과",
    "10": "공공데이터 요청 파라미터 오류",
    "11": "공공데이터 필수 파라미터 누락",
    "20": "공공데이터 서비스 접근 권한 오류",
    "21": "공공데이터 서비스키 일시 중지",
    "22": "공공데이터 일일 호출한도 초과",
    "23": "공공데이터 초당 호출한도 초과",
    "30": "공공데이터 서비스키 미등록",
    "31": "공공데이터 서비스키 만료",
    "32": "공공데이터 등록되지 않은 IP",
    "33": "공공데이터 서명되지 않은 호출",
  };
  const description = descriptions[code] || auth || errText || "공공데이터 게이트웨이 오류";
  const error = httpError(code === "22" || code === "23" ? 429 : 502, `${label}: ${description}${code ? ` [${code}]` : ""}${auth ? ` ${auth}` : ""}`);
  error.publicDataGateway = { code, auth, err: errText, label };
  return error;
}

function parseBuildingPublicDataXml(text) {
  const raw = String(text || "");
  const items = [];
  const itemPattern = /<(item|Item)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = itemPattern.exec(raw)) !== null) {
    const item = parseBuildingXmlObject(match[2]);
    if (Object.keys(item).length) items.push(item);
  }

  const header = {
    resultCode: firstBuildingXmlTag(raw, ["resultCode", "result_code"]),
    resultMsg: firstBuildingXmlTag(raw, ["resultMsg", "result_msg"]),
  };

  const body = {
    items: { item: items },
    totalCount: firstBuildingXmlTag(raw, ["totalCount", "total_count"]),
    pageNo: firstBuildingXmlTag(raw, ["pageNo", "page_no"]),
    numOfRows: firstBuildingXmlTag(raw, ["numOfRows", "num_of_rows"]),
  };

  // K-APT 기본/상세정보 XML은 body 바로 아래 item 한 건인 경우가 있다.
  if (items.length === 1) body.item = items[0];

  return { response: { header, body } };
}

function parseBuildingPublicDataJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const gatewayError = publicDataGatewayErrorFromText(raw);
  if (gatewayError) throw publicDataGatewayHttpError("공공데이터포털", gatewayError);

  // 건축HUB 관리 PK는 JavaScript 안전 정수 범위를 넘을 수 있다.
  // 모든 *Pk / *_pk 긴 정수를 문자열로 보존한다.
  const protectedText = raw.replace(
    /("[^"]*(?:Pk|_pk)"\s*:\s*)(-?\d{16,})(?=\s*[,}])/g,
    '$1"$2"'
  );

  try {
    return JSON.parse(protectedText);
  } catch (jsonError) {
    if (/^\s*</.test(raw)) {
      return parseBuildingPublicDataXml(raw);
    }
    throw jsonError;
  }
}

function publicDataResponseParts(data, label) {
  const gatewayError = publicDataGatewayErrorFromObject(data);
  if (gatewayError) throw publicDataGatewayHttpError(label, gatewayError);
  const response = data?.response ?? data?.Response ?? data ?? {};
  const header =
    response?.header ?? response?.Header ??
    data?.header ?? data?.Header ??
    res
```

## missing = #2
```js
v60ScopeTagTitleRow(row, parcelKey));
    }
  }
  return v60DedupeTitleRows(rows);
}

function v60TitleRowsByParcel(titleCacheMap) {
  const map = new Map();
  for (const [parcelKey, cache] of titleCacheMap.entries()) {
    map.set(parcelKey, v60DedupeTitleRows(
      (Array.isArray(cache?.rows) ? cache.rows : []).map((row) => v60ScopeTagTitleRow(row, parcelKey))
    ));
  }
  return map;
}

async function v60FetchKaptRegion(env, bjdCode) {
  const rows = [];
  for (const variant of kaptRegionCodeVariants(bjdCode)) {
    let total = null;
    for (let pageNo = 1; pageNo <= 10; pageNo++) {
      const data = await fetchPublicDataJson(
        KAPT_LEGAL_DONG_LIST_URL,
        { bjdCode: variant, pageNo, numOfRows: 1000 },
        env,
        "K-APT V60 legal dong list",
        V60_PUBLIC_TIMEOUT_MS,
        1
      );
      const page = publicDataResponseParts(data, "K-APT V60 legal dong list");
      if (total == null) total = page.totalCount;
      rows.push(...page.items);
      if (!page.items.length || page.items.length < page.numOfRows || pageNo * page.numOfRows >= total) break;
    }
  }
  const seen = new Set();
  return rows.filter((row) => {
    const code = kaptCodeOf(row);
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

async function v60EnsureKaptRegionLists(env, regionKeys) {
  const map = new Map();
  for (const regionKey of [...new Set(regionKeys || [])]) {
    let cached = await v60LoadKaptRegionCache(env, regionKey);
    if (!cached) {
      try {
        const rows = await v60FetchKaptRegion(env, regionKey);
        const now = new Date().toISOString();
        await v60SupabaseUpsert(env, V60_KAPT_REGION_CACHE_TABLE, {
          bjd_code: regionKey,
          rows,
          status: "ready",
          fetched_at: now,
          expires_at: v60IsoAfter({ days: V60_KAPT_REGION_CACHE_DAYS }),
          last_error: null,
          updated_at: now,
        }, "bjd_code");
        cached = { bjd_code: regionKey, rows, status: "ready", expires_at: v60IsoAfter({ days: V60_KAPT_REGION_CACHE_DAYS }) };
      } catch (error) {
        const now = new Date().toISOString();
        await v60SupabaseUpsert(env, V60_KAPT_REGION_CACHE_TABLE, {
          bjd_code: regionKey,
          rows: [],
          status: "error",
          fetched_at: now,
          expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }),
          last_error: String(error?.message || error),
          updated_at: now,
        }, "bjd_code");
        cached = { bjd_code: regionKey, rows: [], status: "error", last_error: String(error?.message || error), expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }) };
      }
    }
    map.set(regionKey, cached);
  }
  return map;
}

function v60RawNameText(value) {
  return cleanBuildingText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

// V63: K-APT는 같은 대단지를 2-1차/2-2차처럼 별도 관리단지로 나누고,
// 목록명에서 하이픈을 "다시"로 표기하는 경우가 있다. 건축물대장은 이들을
// "성호2차아파트"처럼 하나의 단지명으로 보유할 수 있으므로, 일반 이름 비교와 별도로
// split-phase family 이름을 만든다. 이 보정은 후보 생성/결속에만 사용하고 주소/법정동
// 검증은 기존 로직을 그대로 거친다.
function v63KaptFamilyName(value) {
  const source = cleanBuildingText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―_]/g, "-")
    .replace(/다시/g, "-")
    .replace(/아파트|오피스텔|주상복합|연립주택|연립|빌라/g, "")
    .replace(/-{2,}/g, "-");

  if (!source) return { base: "", split: false, phase: "" };

  // 예: 성호2-1차 / 성호2-2차 -> 성호2차
  let match = source.match(/^(.*?\d+)-(\d+)차$/);
  if (match) {
    return {
      base: `${match[1]}차`.replace(/-/g, ""),
      split: true,
      phase: match[2],
    };
  }

  // 예: OO2차-1단지 / OO2차2단지 -> OO2차
  match = source.match(/^(.*?차)-?(\d+)단지$/);
  if (match) {
    return {
      base: match[1].replace(/-/g, ""),
      split: true,
      phase: match[2],
    };
  }

  return {
    base: source.replace(/-/g, ""),
    split: false,
    phase: "",
  };
}

function v60KaptCandidateScore(listRow, candidateNames) {
  const listNameRaw = v60RawNameText(kaptNameOf(listRow));
  const listNameCompact = compactBuildingMatchText(kaptNameOf(listRow));
  const listFamily = v63KaptFamilyName(kaptNameOf(listRow));
  let best = 0;
  for (const name of candidateNames || []) {
    const raw = v60RawNameText(name);
    const compact = compactBuildingMatchText(name);
    const candidateFamily = v63KaptFamilyName(name);
    if (!raw && !compact) continue;
    if (raw && listNameRaw && raw === listNameRaw) best = Math.max(best, 140);
    if (compact && listNameCompact && compact === listNameCompact) best = Math.max(best, 130);
    if (compact && listNameCompact && (compact.includes(listNameCompact) || listNameCompact.includes(compact))) {
      const minLen = Math.min(compact.length, listNameCompact.length);
      best = Math.max(best, minLen >= 4 ? 95 : minLen >= 2 ? 55 : 0);
    }

    // V63 split-complex rescue: 같은 법정동의 제목 단지명과 family 이름이 정확히 같고
    // K-APT 쪽이 실제 분할단지 표기를 가진 경우만 후보로 추가한다.
    if (
      listFamily.split &&
      listFamily.base &&
      candidateFamily.base &&
      listFamily.base === candidateFamily.base &&
      listFamily.base.length >= 4
    ) {
      best = Math.max(best, 105);
    }
  }
  return best;
}

function v60KaptCandidateRows(kaptRegionMap, titleRows, verifiedScopeParcels) {
  const namesByRegion = new Map();
  const pushName = (regionKey, name) => {
    const value = cleanBuildingText(name);
    if (!regionKey || !value) return;
    if (!namesByRegion.has(regionKey)) namesByRegion.set(regionKey, new Set());
    namesByRegion.get(regionKey).add(value);
  };

  for (const row of titleRows || []) {
    if (!v60Classification(row).apartment) continue;
    const parcel = buildingParcelDescriptor(row);
    if (!parcel) continue;
    pushName(`${parcel.sigunguCd}${parcel.bjdongCd}`, row?.bldNm ?? row?.bld_nm);
  }
  for (const entry of verifiedScopeParcels.map.values()) {
    const regionKey = scopeParcelLegalDongCodeV48(entry);
    for (const name of scopeParcelBuildingNamesV48(entry)) {
      if (/아파트|주상복합|오피스텔/.test(name.replace(/\s+/g, ""))) pushName(regionKey, name);
    }
  }

  const scored = [];
  for (const [regionKey, cache] of kaptRegionMap.entries()) {
    const names = [...(namesByRegion.get(regionKey) || [])];
    if (!names.length) continue;
    for (const row of Array.isArray(cache?.rows) ? cache.rows : []) {
      const score = v60KaptCandidateScore(row, names);
      if (score <= 0) continue;
      scored.push({ row, score, regionKey });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const item of scored) {
    const code = kaptCodeOf(item.row);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(item.row);
    if (out.length >= 32) break;
  }
  return out;
}

async function v60EnsureKaptComplexInfo(env, candidateRows) {
  const codes = [...new Set((candidateRows || []).map(kaptCodeOf).filter(Boolean))];
  let cacheMap = await v60LoadKaptComplexCache(env, codes);
  let missing = codes.filter((code) => !cacheMap.has(code));
  if (missing.length) {
    const listByCode = new Map(candidateRows.map((row) => [kaptCodeOf(row), row]));
    const batch = missing.slice(0, V60_KAPT_COMPLEX_BATCH);
    const results = await mapBuildingWithConcurrency(
      batch,
      V60_KAPT_COMPLEX_CONCURRENCY,
      async (code) => {
        const listRow = listByCode.get(code) || { kaptCode: code };
        try {
          const info = await fetchKaptComplexInfo(env, listRow);
          return { code, listRow, info, error: null };
        } catch (error) {
          return { code, listRow, info: null, error: String(error?.message || error) };
        }
      }
    );
    const now = new Date().toISOString();
    const writes = results.map((result) => ({
      kapt_code: result.code,
      bjd_code: kaptLegalDongCodeV48(result.listRow) || null,
      list_row: result.listRow || {},
      basic_row: result.info?.basic || {},
      detail_row: result.info?.detail || {},
      status: result.error ? "error" : "ready",
      fetched_at: now,
      expires_at: result.error
        ? v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES })
        : v60IsoAfter({ days: V60_KAPT_COMPLEX_CACHE_DAYS }),
      last_error: result.error || null,
      updated_at: now,
    }));
    if (writes.length) await v60SupabaseUpsert(env, V60_KAPT_COMPLEX_CACHE_TABLE, writes, "kapt_code");
    cacheMap = await v60LoadKaptComplexCache(env, codes);
    missing = codes.filter((code) => !cacheMap.has(code));
  }
  return {
    complete: missing.length === 0,
    cacheMap,
    codes,
    missing,
    evidence: codes.filter((code) => cacheMap.has(code)).map((code) => ({
      kaptCode: code,
      status: cacheMap.get(code)?.status || "ready",
    })),
  };
}

function v60CombinedKaptRow(cacheRow) {
  return {
    ...(cacheRow?.list_row || {}),
    ...(cacheRow?.basic_row || {}),
    ...(cacheRow?.detail_row || {}),
    kaptCode: cacheRow?.kapt_code || kaptCodeOf(cacheRow?.list_row || {}),
  };
}

function v60BestScopeKaptMatch(combinedRow, verifiedScopeParcels) {
  let best = null;
  for (const entry of verifiedScopeParcels.map.values()) {
    const candidate = kaptScopeParcelCandidateV48(combinedRow, entry);
    if (!candidate) continue;
    const compactName = compactBuildingMatchText(kaptNameOf(combinedRow));
    const strongLongName = candidate.nameExact && compactName.length >= 4;
    if (!candidate.strongAddress && !strongLongName) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function v63KaptFamilyTitleMatch(complex, titleRows) {
  const kaptFamily = v63KaptFamilyName(kaptNameOf(complex));
  if (!kaptFamily.split || !kaptFamily.base || kaptFamily.base.length < 4) return null;

  const candidates = [];
  for (const row of titleRows || []) {
    const classification = v60Classification(row);
    if (!classification.apartment) continue;

    const titleFamily = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
    if (!titleFamily.base || titleFamily.base !== kaptFamily.base) continue;

    const parcel = buildingParcelDescriptor(row);
    if (!parcel) continue;
    const addressEvidence = kaptFallbackAddressEvidence(complex, row);
    candidates.push({ row, parcel, addressEvidence });
  }
  if (!candidates.length) return null;

  const uniqueParcels = new Set(candidates.map((item) => item.parcel.key));
  let best = null;
  for (const item of candidates) {
    const evidence = item.addressEvidence;
    const hasAddressEvidence = evidence.parcelNumberMatch || evidence.exact || evidence.numberMatch;

    // family 이름만으로는 다른 단지를 잘못 결속할 수 있으므로, 같은 family의 제목 필지가
    // scope 안에서 하나뿐이거나 주소/지번 증거가 있을 때만 허용한다.
    if (uniqueParcels.size > 1 && !hasAddressEvidence) continue;

    let score = uniqueParcels.size === 1 ? 120 : 105;
    const reasons = ["split_family_exact"];
    if (evidence.parcelExact) { score += 120; reasons.push("parcel_exact"); }
    else if (evidence.parcelNumberMatch) { score += 90; reasons.push("parcel_number"); }
    else if (evidence.exact) { score += 80; reasons.push("address_exact"); }
    else if (evidence.numberMatch) { score += 45; reasons.push("address_number"); }

    const candidate = {
      row: item.row,
      score,
      reason: reasons.join("+"),
      titleKey: buildingRecordKey(item.row),
      parcelKey: item.parcel.key,
      buildingName: cleanBuildingText(item.row?.bldNm ?? item.row?.bld_nm) || "",
      titleAddress: buildingRecordAddresses(item.row).preferredAddress || "",
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function v63SplitKaptBindingKey(match) {
  const kaptFamily = v63KaptFamilyName(
    match?.normalized?.name || kaptNameOf(match?.combined || {}) || kaptNameOf(match?.listRow || {})
  );
  const titleFamily = v63KaptFamilyName(match?.titleRow?.bldNm ?? match?.titleRow?.bld_nm ?? "");
  if (
    kaptFamily.split &&
    kaptFamily.base &&
    titleFamily.base &&
    kaptFamily.base === titleFamily.base
  ) {
    // 분할 관리단지는 같은 건축물대장 titleKey로 결속되더라도 서로 다른 K-APT 코드의
    // 공식 세대수를 모두 보존한다. 후보 자체는 code 기준으로 이미 중복 제거되어 있다.
    return `${match.parcelKey}|split-family:${kaptFamily.base}|kapt:${match.kaptCode}`;
  }
  return "";
}

function v60BuildKaptMatches(candidateRows, complexCacheMap, titleRows, verifiedScopeParcels) {
  const matches = [];
  for (const listRow of candidateRows || []) {
    const code = kaptCodeOf(listRow);
    const cache = complexCacheMap.get(code);
    if (!cache || cache.status !== "ready") continue;
    const info = {
      list: { ...listRow, ...(cache.list_row || {}) },
      basic: cache.basic_row || {},
      detail: cache.detail_row || {},
      diagnostics: null,
    };
    const combined = v60CombinedKaptRow(cache);
    const normalized = normalizedKaptInfo(info, null);
    if (normalized.households <= 0) continue;

    const titleMatch =
      kaptFallbackTitleMatch(combined, titleRows) ||
      v63KaptFamilyTitleMatch(combined, titleRows);
    const scopeMatch = v60BestScopeKaptMatch(combined, verifiedScopeParcels);
    let chosen = null;
    if (titleMatch) {
      chosen = {
        parcelKey: titleMatch.parcelKey,
        titleKey: titleMatch.titleKey,
        score: titleMatch.score + 50,
        reason: `title:${titleMatch.reason}`,
        titleRow: titleMatch.row,
      };
    }
    if (scopeMatch && (!chosen || scopeMatch.score > chosen.score)) {
      chosen = {
        parcelKey: scopeMatch.parcelKey,
        titleKey: "",
        score: scopeMatch.score,
        reason: `scope:${scopeMatch.reason}`,
        titleRow: null,
      };
    }
    if (!chosen?.parcelKey) continue;
    matches.push({
      kaptCode: code,
      listRow,
      cache,
      combined,
      normalized,
      ...chosen,
    });
  }

  const bestByBinding = new Map();
  for (const match of matches) {
    const splitBinding = v63SplitKaptBindingKey(match);
    const binding = splitBinding || match.titleKey || `${match.parcelKey}|${compactBuildingMatchText(match.normalized.name)}`;
    const prior = bestByBinding.get(binding);
    if (!prior || match.score > prior.score) bestByBinding.set(binding, match);
  }
  return [...bestByBinding.values()];
}

function v60TitleCoveredByKapt(row, kaptMatches) {
  const key = buildingRecordKey(row);
  const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
  const classification = v60Classification(row);
  if (!classification.apartment) return null;
  const titleName = compactBuildingMatchText(row?.bldNm ?? row?.bld_nm);
  for (const match of kaptMatches || []) {
    if (match.titleKey && match.titleKey === key) return match;
    if (!parcelKey || match.parcelKey !== parcelKey) continue;
    const kaptName = compactBuildingMatchText(match.normalized?.name || kaptNameOf(match.combined));
    if (!titleName || !kaptName) return match;
    if (titleName === kaptName) return match;
    if (Math.min(titleName.length, kaptName.length) >= 4 && (titleName.includes(kaptName) || kaptName.includes(titleName))) return match;

    // V63 split-complex rescue: 분할 K-APT(예: 2-1차/2-2차)가 건축물대장에서는
    // 하나의 umbrella 단지명으로 묶여 있으면 같은 필지의 모든 아파트 동을 K-APT가
    // 덮는 것으로 본다. 그렇지 않으면 한두 개 titleKey만 덮여 나머지 hhldCnt가 중복 합산된다.
    const titleFamily = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
    const kaptFamily = v63KaptFamilyName(match.normalized?.name || kaptNameOf(match.combined));
    if (
      kaptFamily.split &&
      titleFamily.base &&
      kaptFamily.base &&
      titleFamily.base === kaptFamily.base
    ) return match;

    if (!match.titleKey) return match;
  }
  return null;
}

function v63TitleKaptFamilyKey(row) {
  const parcel = buildingParcelDescriptor(row);
  const family = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
  if (!parcel || !family.base) return "";
  return `${parcel.sigunguCd}${parcel.bjdongCd}|${family.base}`;
}

function v63KaptMatchFamilyKey(match) {
  const titleKey = v63TitleKaptFamilyKey(match?.titleRow || {});
  if (titleKey) return titleKey;

  const combined = match?.combined || match?.listRow || {};
  const code = kaptLegalDongCodeV48(combined);
  const family = v63KaptFamilyName(match?.normalized?.name || kaptNameOf(combined));
  if (!code || !family.base) return "";
  return `${code}|${family.base}`;
}

function v63TitleBelongsToKaptFamily(row, kaptMatches) {
  const familyKey = v63TitleKaptFamilyKey(row);
  if (!familyKey) return false;
  return (kaptMatches || []).some((match) => v63KaptMatchFamilyKey(match) === familyKey);
}

function v63IsCollectiveTitle(row) {
  return cleanBuildingText(
    publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")
  ).includes("집합");
}

function v60NeedsDetailForTitle(row, kaptMatches) {
  if (!row || isAncillaryBuildingRecord(row)) return false;
  const classification = v60Classification(row);
  const explicit = buildingExplicitUnitEvidence(row, classification);
  const collective = v63IsCollectiveTitle(row);

  /
```

## missing = #3
```js
await v60LoadKaptRegionCache(env, regionKey);
    if (!cached) {
      try {
        const rows = await v60FetchKaptRegion(env, regionKey);
        const now = new Date().toISOString();
        await v60SupabaseUpsert(env, V60_KAPT_REGION_CACHE_TABLE, {
          bjd_code: regionKey,
          rows,
          status: "ready",
          fetched_at: now,
          expires_at: v60IsoAfter({ days: V60_KAPT_REGION_CACHE_DAYS }),
          last_error: null,
          updated_at: now,
        }, "bjd_code");
        cached = { bjd_code: regionKey, rows, status: "ready", expires_at: v60IsoAfter({ days: V60_KAPT_REGION_CACHE_DAYS }) };
      } catch (error) {
        const now = new Date().toISOString();
        await v60SupabaseUpsert(env, V60_KAPT_REGION_CACHE_TABLE, {
          bjd_code: regionKey,
          rows: [],
          status: "error",
          fetched_at: now,
          expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }),
          last_error: String(error?.message || error),
          updated_at: now,
        }, "bjd_code");
        cached = { bjd_code: regionKey, rows: [], status: "error", last_error: String(error?.message || error), expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }) };
      }
    }
    map.set(regionKey, cached);
  }
  return map;
}

function v60RawNameText(value) {
  return cleanBuildingText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

// V63: K-APT는 같은 대단지를 2-1차/2-2차처럼 별도 관리단지로 나누고,
// 목록명에서 하이픈을 "다시"로 표기하는 경우가 있다. 건축물대장은 이들을
// "성호2차아파트"처럼 하나의 단지명으로 보유할 수 있으므로, 일반 이름 비교와 별도로
// split-phase family 이름을 만든다. 이 보정은 후보 생성/결속에만 사용하고 주소/법정동
// 검증은 기존 로직을 그대로 거친다.
function v63KaptFamilyName(value) {
  const source = cleanBuildingText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―_]/g, "-")
    .replace(/다시/g, "-")
    .replace(/아파트|오피스텔|주상복합|연립주택|연립|빌라/g, "")
    .replace(/-{2,}/g, "-");

  if (!source) return { base: "", split: false, phase: "" };

  // 예: 성호2-1차 / 성호2-2차 -> 성호2차
  let match = source.match(/^(.*?\d+)-(\d+)차$/);
  if (match) {
    return {
      base: `${match[1]}차`.replace(/-/g, ""),
      split: true,
      phase: match[2],
    };
  }

  // 예: OO2차-1단지 / OO2차2단지 -> OO2차
  match = source.match(/^(.*?차)-?(\d+)단지$/);
  if (match) {
    return {
      base: match[1].replace(/-/g, ""),
      split: true,
      phase: match[2],
    };
  }

  return {
    base: source.replace(/-/g, ""),
    split: false,
    phase: "",
  };
}

function v60KaptCandidateScore(listRow, candidateNames) {
  const listNameRaw = v60RawNameText(kaptNameOf(listRow));
  const listNameCompact = compactBuildingMatchText(kaptNameOf(listRow));
  const listFamily = v63KaptFamilyName(kaptNameOf(listRow));
  let best = 0;
  for (const name of candidateNames || []) {
    const raw = v60RawNameText(name);
    const compact = compactBuildingMatchText(name);
    const candidateFamily = v63KaptFamilyName(name);
    if (!raw && !compact) continue;
    if (raw && listNameRaw && raw === listNameRaw) best = Math.max(best, 140);
    if (compact && listNameCompact && compact === listNameCompact) best = Math.max(best, 130);
    if (compact && listNameCompact && (compact.includes(listNameCompact) || listNameCompact.includes(compact))) {
      const minLen = Math.min(compact.length, listNameCompact.length);
      best = Math.max(best, minLen >= 4 ? 95 : minLen >= 2 ? 55 : 0);
    }

    // V63 split-complex rescue: 같은 법정동의 제목 단지명과 family 이름이 정확히 같고
    // K-APT 쪽이 실제 분할단지 표기를 가진 경우만 후보로 추가한다.
    if (
      listFamily.split &&
      listFamily.base &&
      candidateFamily.base &&
      listFamily.base === candidateFamily.base &&
      listFamily.base.length >= 4
    ) {
      best = Math.max(best, 105);
    }
  }
  return best;
}

function v60KaptCandidateRows(kaptRegionMap, titleRows, verifiedScopeParcels) {
  const namesByRegion = new Map();
  const pushName = (regionKey, name) => {
    const value = cleanBuildingText(name);
    if (!regionKey || !value) return;
    if (!namesByRegion.has(regionKey)) namesByRegion.set(regionKey, new Set());
    namesByRegion.get(regionKey).add(value);
  };

  for (const row of titleRows || []) {
    if (!v60Classification(row).apartment) continue;
    const parcel = buildingParcelDescriptor(row);
    if (!parcel) continue;
    pushName(`${parcel.sigunguCd}${parcel.bjdongCd}`, row?.bldNm ?? row?.bld_nm);
  }
  for (const entry of verifiedScopeParcels.map.values()) {
    const regionKey = scopeParcelLegalDongCodeV48(entry);
    for (const name of scopeParcelBuildingNamesV48(entry)) {
      if (/아파트|주상복합|오피스텔/.test(name.replace(/\s+/g, ""))) pushName(regionKey, name);
    }
  }

  const scored = [];
  for (const [regionKey, cache] of kaptRegionMap.entries()) {
    const names = [...(namesByRegion.get(regionKey) || [])];
    if (!names.length) continue;
    for (const row of Array.isArray(cache?.rows) ? cache.rows : []) {
      const score = v60KaptCandidateScore(row, names);
      if (score <= 0) continue;
      scored.push({ row, score, regionKey });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const item of scored) {
    const code = kaptCodeOf(item.row);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(item.row);
    if (out.length >= 32) break;
  }
  return out;
}

async function v60EnsureKaptComplexInfo(env, candidateRows) {
  const codes = [...new Set((candidateRows || []).map(kaptCodeOf).filter(Boolean))];
  let cacheMap = await v60LoadKaptComplexCache(env, codes);
  let missing = codes.filter((code) => !cacheMap.has(code));
  if (missing.length) {
    const listByCode = new Map(candidateRows.map((row) => [kaptCodeOf(row), row]));
    const batch = missing.slice(0, V60_KAPT_COMPLEX_BATCH);
    const results = await mapBuildingWithConcurrency(
      batch,
      V60_KAPT_COMPLEX_CONCURRENCY,
      async (code) => {
        const listRow = listByCode.get(code) || { kaptCode: code };
        try {
          const info = await fetchKaptComplexInfo(env, listRow);
          return { code, listRow, info, error: null };
        } catch (error) {
          return { code, listRow, info: null, error: String(error?.message || error) };
        }
      }
    );
    const now = new Date().toISOString();
    const writes = results.map((result) => ({
      kapt_code: result.code,
      bjd_code: kaptLegalDongCodeV48(result.listRow) || null,
      list_row: result.listRow || {},
      basic_row: result.info?.basic || {},
      detail_row: result.info?.detail || {},
      status: result.error ? "error" : "ready",
      fetched_at: now,
      expires_at: result.error
        ? v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES })
        : v60IsoAfter({ days: V60_KAPT_COMPLEX_CACHE_DAYS }),
      last_error: result.error || null,
      updated_at: now,
    }));
    if (writes.length) await v60SupabaseUpsert(env, V60_KAPT_COMPLEX_CACHE_TABLE, writes, "kapt_code");
    cacheMap = await v60LoadKaptComplexCache(env, codes);
    missing = codes.filter((code) => !cacheMap.has(code));
  }
  return {
    complete: missing.length === 0,
    cacheMap,
    codes,
    missing,
    evidence: codes.filter((code) => cacheMap.has(code)).map((code) => ({
      kaptCode: code,
      status: cacheMap.get(code)?.status || "ready",
    })),
  };
}

function v60CombinedKaptRow(cacheRow) {
  return {
    ...(cacheRow?.list_row || {}),
    ...(cacheRow?.basic_row || {}),
    ...(cacheRow?.detail_row || {}),
    kaptCode: cacheRow?.kapt_code || kaptCodeOf(cacheRow?.list_row || {}),
  };
}

function v60BestScopeKaptMatch(combinedRow, verifiedScopeParcels) {
  let best = null;
  for (const entry of verifiedScopeParcels.map.values()) {
    const candidate = kaptScopeParcelCandidateV48(combinedRow, entry);
    if (!candidate) continue;
    const compactName = compactBuildingMatchText(kaptNameOf(combinedRow));
    const strongLongName = candidate.nameExact && compactName.length >= 4;
    if (!candidate.strongAddress && !strongLongName) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function v63KaptFamilyTitleMatch(complex, titleRows) {
  const kaptFamily = v63KaptFamilyName(kaptNameOf(complex));
  if (!kaptFamily.split || !kaptFamily.base || kaptFamily.base.length < 4) return null;

  const candidates = [];
  for (const row of titleRows || []) {
    const classification = v60Classification(row);
    if (!classification.apartment) continue;

    const titleFamily = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
    if (!titleFamily.base || titleFamily.base !== kaptFamily.base) continue;

    const parcel = buildingParcelDescriptor(row);
    if (!parcel) continue;
    const addressEvidence = kaptFallbackAddressEvidence(complex, row);
    candidates.push({ row, parcel, addressEvidence });
  }
  if (!candidates.length) return null;

  const uniqueParcels = new Set(candidates.map((item) => item.parcel.key));
  let best = null;
  for (const item of candidates) {
    const evidence = item.addressEvidence;
    const hasAddressEvidence = evidence.parcelNumberMatch || evidence.exact || evidence.numberMatch;

    // family 이름만으로는 다른 단지를 잘못 결속할 수 있으므로, 같은 family의 제목 필지가
    // scope 안에서 하나뿐이거나 주소/지번 증거가 있을 때만 허용한다.
    if (uniqueParcels.size > 1 && !hasAddressEvidence) continue;

    let score = uniqueParcels.size === 1 ? 120 : 105;
    const reasons = ["split_family_exact"];
    if (evidence.parcelExact) { score += 120; reasons.push("parcel_exact"); }
    else if (evidence.parcelNumberMatch) { score += 90; reasons.push("parcel_number"); }
    else if (evidence.exact) { score += 80; reasons.push("address_exact"); }
    else if (evidence.numberMatch) { score += 45; reasons.push("address_number"); }

    const candidate = {
      row: item.row,
      score,
      reason: reasons.join("+"),
      titleKey: buildingRecordKey(item.row),
      parcelKey: item.parcel.key,
      buildingName: cleanBuildingText(item.row?.bldNm ?? item.row?.bld_nm) || "",
      titleAddress: buildingRecordAddresses(item.row).preferredAddress || "",
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function v63SplitKaptBindingKey(match) {
  const kaptFamily = v63KaptFamilyName(
    match?.normalized?.name || kaptNameOf(match?.combined || {}) || kaptNameOf(match?.listRow || {})
  );
  const titleFamily = v63KaptFamilyName(match?.titleRow?.bldNm ?? match?.titleRow?.bld_nm ?? "");
  if (
    kaptFamily.split &&
    kaptFamily.base &&
    titleFamily.base &&
    kaptFamily.base === titleFamily.base
  ) {
    // 분할 관리단지는 같은 건축물대장 titleKey로 결속되더라도 서로 다른 K-APT 코드의
    // 공식 세대수를 모두 보존한다. 후보 자체는 code 기준으로 이미 중복 제거되어 있다.
    return `${match.parcelKey}|split-family:${kaptFamily.base}|kapt:${match.kaptCode}`;
  }
  return "";
}

function v60BuildKaptMatches(candidateRows, complexCacheMap, titleRows, verifiedScopeParcels) {
  const matches = [];
  for (const listRow of candidateRows || []) {
    const code = kaptCodeOf(listRow);
    const cache = complexCacheMap.get(code);
    if (!cache || cache.status !== "ready") continue;
    const info = {
      list: { ...listRow, ...(cache.list_row || {}) },
      basic: cache.basic_row || {},
      detail: cache.detail_row || {},
      diagnostics: null,
    };
    const combined = v60CombinedKaptRow(cache);
    const normalized = normalizedKaptInfo(info, null);
    if (normalized.households <= 0) continue;

    const titleMatch =
      kaptFallbackTitleMatch(combined, titleRows) ||
      v63KaptFamilyTitleMatch(combined, titleRows);
    const scopeMatch = v60BestScopeKaptMatch(combined, verifiedScopeParcels);
    let chosen = null;
    if (titleMatch) {
      chosen = {
        parcelKey: titleMatch.parcelKey,
        titleKey: titleMatch.titleKey,
        score: titleMatch.score + 50,
        reason: `title:${titleMatch.reason}`,
        titleRow: titleMatch.row,
      };
    }
    if (scopeMatch && (!chosen || scopeMatch.score > chosen.score)) {
      chosen = {
        parcelKey: scopeMatch.parcelKey,
        titleKey: "",
        score: scopeMatch.score,
        reason: `scope:${scopeMatch.reason}`,
        titleRow: null,
      };
    }
    if (!chosen?.parcelKey) continue;
    matches.push({
      kaptCode: code,
      listRow,
      cache,
      combined,
      normalized,
      ...chosen,
    });
  }

  const bestByBinding = new Map();
  for (const match of matches) {
    const splitBinding = v63SplitKaptBindingKey(match);
    const binding = splitBinding || match.titleKey || `${match.parcelKey}|${compactBuildingMatchText(match.normalized.name)}`;
    const prior = bestByBinding.get(binding);
    if (!prior || match.score > prior.score) bestByBinding.set(binding, match);
  }
  return [...bestByBinding.values()];
}

function v60TitleCoveredByKapt(row, kaptMatches) {
  const key = buildingRecordKey(row);
  const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
  const classification = v60Classification(row);
  if (!classification.apartment) return null;
  const titleName = compactBuildingMatchText(row?.bldNm ?? row?.bld_nm);
  for (const match of kaptMatches || []) {
    if (match.titleKey && match.titleKey === key) return match;
    if (!parcelKey || match.parcelKey !== parcelKey) continue;
    const kaptName = compactBuildingMatchText(match.normalized?.name || kaptNameOf(match.combined));
    if (!titleName || !kaptName) return match;
    if (titleName === kaptName) return match;
    if (Math.min(titleName.length, kaptName.length) >= 4 && (titleName.includes(kaptName) || kaptName.includes(titleName))) return match;

    // V63 split-complex rescue: 분할 K-APT(예: 2-1차/2-2차)가 건축물대장에서는
    // 하나의 umbrella 단지명으로 묶여 있으면 같은 필지의 모든 아파트 동을 K-APT가
    // 덮는 것으로 본다. 그렇지 않으면 한두 개 titleKey만 덮여 나머지 hhldCnt가 중복 합산된다.
    const titleFamily = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
    const kaptFamily = v63KaptFamilyName(match.normalized?.name || kaptNameOf(match.combined));
    if (
      kaptFamily.split &&
      titleFamily.base &&
      kaptFamily.base &&
      titleFamily.base === kaptFamily.base
    ) return match;

    if (!match.titleKey) return match;
  }
  return null;
}

function v63TitleKaptFamilyKey(row) {
  const parcel = buildingParcelDescriptor(row);
  const family = v63KaptFamilyName(row?.bldNm ?? row?.bld_nm ?? "");
  if (!parcel || !family.base) return "";
  return `${parcel.sigunguCd}${parcel.bjdongCd}|${family.base}`;
}

function v63KaptMatchFamilyKey(match) {
  const titleKey = v63TitleKaptFamilyKey(match?.titleRow || {});
  if (titleKey) return titleKey;

  const combined = match?.combined || match?.listRow || {};
  const code = kaptLegalDongCodeV48(combined);
  const family = v63KaptFamilyName(match?.normalized?.name || kaptNameOf(combined));
  if (!code || !family.base) return "";
  return `${code}|${family.base}`;
}

function v63TitleBelongsToKaptFamily(row, kaptMatches) {
  const familyKey = v63TitleKaptFamilyKey(row);
  if (!familyKey) return false;
  return (kaptMatches || []).some((match) => v63KaptMatchFamilyKey(match) === familyKey);
}

function v63IsCollectiveTitle(row) {
  return cleanBuildingText(
    publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")
  ).includes("집합");
}

function v60NeedsDetailForTitle(row, kaptMatches) {
  if (!row || isAncillaryBuildingRecord(row)) return false;
  const classification = v60Classification(row);
  const explicit = buildingExplicitUnitEvidence(row, classification);
  const collective = v63IsCollectiveTitle(row);

  // V63: K-APT로 확인된 아파트와 같은 단지 family의 집합 상가/근생/혼합동은
  // 표제부 hoCnt가 양수여도 전유부를 먼저 확인한다. 별도 필지(예: 본번-2)의 상가동도
  // 같은 법정동 + 단지 family가 일치하면 이 경로를 탄다.
  if (
    collective &&
    v63TitleBelongsToKaptFamily(row, kaptMatches) &&
    (v62ApartmentShopNameHint(row) || classification.commercial || classification.mixedUse)
  ) {
    return true;
  }

  // V61: 전유부/전유공용면적은 집합건축물에서만 호 단위 상세근거로 사용한다.
  // 일반건축물의 '단독/다가구 + 근린생활시설' 혼합건물은 해당 API가 0건을 반환하는 경우가 많으므로
  // fmlyCnt/hhldCnt 같은 표제부의 명시적 주거 가구수를 그대로 사용하고 불필요한 상세호출을 하지 않는다.
  if (classification.apartment && v60TitleCoveredByKapt(row, kaptMatches)) {
    return classification.mixedUse && collective;
  }
  if (classification.mixedUse) return collective;
  if (classification.officetel && explicit.units <= 0) return true;
  if (classification.apartment && explicit.units <= 0) return true;
  if (classification.commercial && collective && explicit.units <= 0) return true;
  if (classification.residential && collective && explicit.units <= 0) return true;
  if (!classification.residential && !classification.commercial && collective) return true;
  return false;
}

function v60DetermineDetailParcels(titleRowsByParcel, kaptMatches) {
  const selected = new Set();
  const commercialKaptFamilies = new Set();

  // 1차: 기존 상세조회 조건 + K-APT 단지의 별도 집합 상가/근생 필지를 찾는다.
  for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
    for (const row of rows || []) {
      if (v60NeedsDetailForTitle(row, kapt
```

## missing = #4
```js
false;
}

function v60DetermineDetailParcels(titleRowsByParcel, kaptMatches) {
  const selected = new Set();
  const commercialKaptFamilies = new Set();

  // 1차: 기존 상세조회 조건 + K-APT 단지의 별도 집합 상가/근생 필지를 찾는다.
  for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
    for (const row of rows || []) {
      if (v60NeedsDetailForTitle(row, kaptMatches)) selected.add(parcelKey);

      const classification = v60Classification(row);
      if (
        v63IsCollectiveTitle(row) &&
        v63TitleBelongsToKaptFamily(row, kaptMatches) &&
        (classification.commercial || classification.mixedUse || v62ApartmentShopNameHint(row))
      ) {
        const familyKey = v63TitleKaptFamilyKey(row);
        if (familyKey) commercialKaptFamilies.add(familyKey);
      }
    }
  }

  // 2차: 같은 K-APT 단지에 별도 상가/근생 필지가 실제로 존재하면 아파트 본필지도
  // 전유부를 확인한다. K-APT가 주거 세대수는 담당하므로 주거 전유호는 이중계산되지 않고,
  // 본필지 안에 숨어 있는 상업 전유호만 추가로 복구된다.
  if (commercialKaptFamilies.size) {
    for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
      const shouldInspectApartmentParcel = (rows || []).some((row) => {
        const classification = v60Classification(row);
        if (!classification.apartment) return false;
        if (!v60TitleCoveredByKapt(row, kaptMatches)) return false;
        const familyKey = v63TitleKaptFamilyKey(row);
        return !!familyKey && commercialKaptFamilies.has(familyKey);
      });
      if (shouldInspectApartmentParcel) selected.add(parcelKey);
    }
  }

  return [...selected];
}

function v65FloorClassForOverviewRow(row) {
  const use = floorOverviewUseText(row).replace(/\s+/g, "");
  if (!use) return null;
  const residential = /오피스텔|아파트|공동주택|연립주택|다세대주택|단독주택|다가구주택|다중주택|도시형생활주택|기숙사|주택/.test(use);
  const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|업무시설/.test(use);
  if (commercial && !residential) return "commercial";
  if (residential && !commercial) return "residential";
  return null;
}

function v65FloorEvidenceKeys(row) {
  const buildingPk = cleanBuildingText(publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk"));
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeFloorIdentityV29(unitFloorName(row));
  const keys = [];
  if (buildingPk && floor) keys.push(`PK:${buildingPk}|F:${floor}`);
  if (dong && floor) keys.push(`D:${dong}|F:${floor}`);
  return keys;
}

function v65BuildFloorClassIndex(floorRows) {
  const sets = new Map();
  for (const row of floorRows || []) {
    const bucket = v65FloorClassForOverviewRow(row);
    if (!bucket) continue;
    for (const key of v65FloorEvidenceKeys(row)) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(bucket);
    }
  }
  const out = new Map();
  for (const [key, values] of sets.entries()) {
    // 한 층에 주거/상업이 함께 적힌 경우 개별 호를 구분할 근거가 없으므로
    // 억지 분류하지 않는다. 한쪽 용도만 명확한 층만 official hint로 사용한다.
    if (values.size === 1) out.set(key, [...values][0]);
  }
  return out;
}

function v65EnrichExposRowsWithFloorUse(exposRows, floorRows) {
  const index = v65BuildFloorClassIndex(floorRows);
  const rows = (exposRows || []).map((row) => {
    let bucket = null;
    for (const key of v65FloorEvidenceKeys(row)) {
      if (index.has(key)) { bucket = index.get(key); break; }
    }
    if (!bucket) return { ...(row || {}) };
    return {
      ...(row || {}),
      // 기존 공식 전유부 원문은 보존하고 synthetic 용도 증거만 별도 추가한다.
      __v65FloorUse: bucket === "commercial" ? "근린생활시설" : "아파트",
    };
  });
  if (rows.length) rows[0] = { ...rows[0], __v65DetailVersion: V65_DETAIL_CACHE_VERSION };
  return rows;
}

async function v60FetchDetailParcel(env, parcel) {
  // 연결 안정성을 위해 동시에 최대 2개만 호출한다. 먼저 전유부 전체와 층별개요를
  // 받고, 그 다음 전유공용면적을 기존 제한으로 조회한다.
  const [exposResult, floorResult] = await Promise.allSettled([
    v60FetchParcelRows(
      env,
      BUILDING_HUB_EXPOS_URL,
      "Building HUB V65 complete exclusive unit",
      parcel,
      { maxPages: V65_EXPOS_MAX_PAGES, maxVariants: 2, pageConcurrency: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
    ),
    v60FetchParcelRows(
      env,
      BUILDING_HUB_FLOOR_URL,
      "Building HUB V65 floor overview",
      parcel,
      { maxPages: V65_FLOOR_MAX_PAGES, maxVariants: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
    ),
  ]);

  const rawExposRows = exposResult.status === "fulfilled" ? exposResult.value.rows || [] : [];
  const floorRows = floorResult.status === "fulfilled" ? floorResult.value.rows || [] : [];
  const floorIndexV65 = v65BuildFloorClassIndex(floorRows);
  const hasCommercialFloorV65 = [...floorIndexV65.values()].some((value) => value === "commercial");

  // 3천호 이상 대단지에서 area API는 호당 공용면적 행까지 반복되어 수만 건이 된다.
  // 층별개요에 상업층이 명확하고 전유부를 끝까지 확보했다면 상가 판정에는 full area가
  // 필요하지 않으므로 30페이지 추가 호출을 생략한다. 작은/불명확 필지는 기존대로 area를 확인한다.
  const skipHugeAreaScanV65 = rawExposRows.length >= 3000 && hasCommercialFloorV65;
  const areaResult = skipHugeAreaScanV65
    ? { status: "fulfilled", value: { rows: [], error: null, variant: "skipped_v65_floor_evidence" } }
    : await Promise.allSettled([
        v60FetchParcelRows(
          env,
          BUILDING_HUB_EXPOS_AREA_URL,
          "Building HUB V65 exclusive area",
          parcel,
          { maxPages: V60_DETAIL_MAX_PAGES, maxVariants: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
        ),
      ]).then((rows) => rows[0]);

  const areaRows = areaResult.status === "fulfilled" ? areaResult.value.rows || [] : [];
  const exposRows = v65EnrichExposRowsWithFloorUse(rawExposRows, floorRows);
  const errors = [];
  if (exposResult.status === "rejected") errors.push(String(exposResult.reason?.message || exposResult.reason));
  if (floorResult.status === "rejected") errors.push(String(floorResult.reason?.message || floorResult.reason));
  if (areaResult.status === "rejected") errors.push(String(areaResult.reason?.message || areaResult.reason));
  if (!rawExposRows.length && !areaRows.length && errors.length >= 2) throw new Error(errors.join(" | "));
  return { areaRows, exposRows, floorRows, warnings: errors, areaSkippedByFloorEvidenceV65: skipHugeAreaScanV65 };
}

function v65DetailCacheIsCurrent(row) {
  if (!row || row.status !== "ready") return false;
  const firstExpos = Array.isArray(row.expos_rows) ? row.expos_rows[0] : null;
  const firstArea = Array.isArray(row.area_rows) ? row.area_rows[0] : null;
  return cleanBuildingText(
    firstExpos?.detailVersionV65 ?? firstExpos?.detail_version_v65 ??
    firstArea?.detailVersionV65 ?? firstArea?.detail_version_v65
  ) === V65_DETAIL_CACHE_VERSION;
}

async function v60EnsureDetailCaches(env, detailParcelKeys) {
  const keys = [...new Set(detailParcelKeys || [])];
  let cacheMap = await v60LoadDetailCache(env, keys);
  // V65 이전 캐시는 3,000/4,000행 절단과 층별 용도 증거 부재가 있으므로
  // 선택된 상세 필지에 한해 딱 한 번 다시 받는다.
  cacheMap = new Map([...cacheMap.entries()].filter(([, row]) => v65DetailCacheIsCurrent(row)));
  let missing = keys.filter((key) => !cacheMap.has(key));
  if (missing.length) {
    const batch = missing.slice(0, V60_DETAIL_BATCH);
    const results = await mapBuildingWithConcurrency(
      batch,
      V60_DETAIL_CONCURRENCY,
      async (parcelKey) => {
        const parcel = buildingParcelKeyPartsV51(parcelKey);
        if (!parcel) return { parcelKey, data: null, error: "invalid_parcel" };
        try {
          return { parcelKey, data: await v60FetchDetailParcel(env, parcel), error: null };
        } catch (error) {
          return { parcelKey, data: null, error: String(error?.message || error) };
        }
      }
    );
    const now = new Date().toISOString();
    const writes = results.map((result) => ({
      parcel_key: result.parcelKey,
      region_key: v60RegionKeyFromParcelKey(result.parcelKey),
      expos_rows: compactBuildingDetailRows(result.data?.exposRows || [], V65_EXPOS_CACHE_MAX_ROWS),
      area_rows: (() => {
        const rows = compactBuildingDetailRows(result.data?.areaRows || []);
        if (rows.length && !(result.data?.exposRows || []).length) {
          rows[0] = { ...rows[0], detailVersionV65: V65_DETAIL_CACHE_VERSION };
        }
        return rows;
      })(),
      status: result.error ? "error" : "ready",
      fetched_at: now,
      expires_at: result.error
        ? v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES })
        : v60IsoAfter({ days: V60_DETAIL_CACHE_DAYS }),
      last_error: result.error || (result.data?.warnings || []).join(" | ") || null,
      updated_at: now,
    }));
    if (writes.length) await v60SupabaseUpsert(env, V60_DETAIL_CACHE_TABLE, writes, "parcel_key");
    cacheMap = await v60LoadDetailCache(env, keys);
    cacheMap = new Map([...cacheMap.entries()].filter(([, row]) => v65DetailCacheIsCurrent(row)));
    missing = keys.filter((key) => !cacheMap.has(key));
  }
  const errorRows = keys.map((key) => cacheMap.get(key)).filter((row) => row?.status === "error");
  return {
    complete: missing.length === 0,
    sourceComplete: missing.length === 0 && errorRows.length === 0,
    cacheMap,
    keys,
    missing,
    errorRows,
    evidence: keys.filter((key) => cacheMap.has(key)).map((key) => ({
      parcelKey: key,
      status: cacheMap.get(key)?.status || "ready",
    })),
  };
}

function v60DetailUnitKey(row, index = 0) {
  const ho = normalizeDeliveryUnitName(unitHoName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const bld = normalizeDeliveryUnitName(cleanBuildingText(row?.bldNm ?? row?.bld_nm));
  if (ho) return [bld || "BLD", dong || "DONG", floor || "FLOOR", ho].join("|");
  const pk = cleanBuildingText(publicDataField(row, "mgmHoDetlPk", "mgm_ho_detl_pk", "mgmBldrgstPk", "mgm_bldrgst_pk"));
  if (pk) return `PK:${pk}`;
  return `ROW:${index}:${bld}:${dong}:${floor}`;
}

function v62ApartmentShopNameHint(row) {
  const dongName = cleanBuildingText(
    publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
  ).replace(/\s+/g, "");

  // 구축 공동주택 대장은 상가동의 주용도를 "공동주택"으로 잘못 남긴 사례가 많다.
  // 동명 자체에 상가/근린생활시설이 명시된 경우에만 상가 전용동으로 인정한다.
  return !!dongName && /상가|근린생활시설/.test(dongName);
}

function v62ParcelHasKaptMatch(row, kaptMatches) {
  const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
  if (!parcelKey) return false;
  return (kaptMatches || []).some((match) => cleanBuildingText(match?.parcelKey) === cleanBuildingText(parcelKey));
}

function v60Classification(row) {
  const base = buildingHousingClassification(row);
  const purpose = buildingPurposeText(row).replace(/\s+/g, "");

  // V62 hotfix: K-APT가 주거 세대수를 담당하더라도 "상가동/상가/근린생활시설동"은
  // 별도 배송호수다. 목적코드가 공동주택으로 남아 있어도 동명이라는 직접 증거를 우선한다.
  if (v62ApartmentShopNameHint(row)) {
    return {
      ...base,
      apartment: false,
      officetel: false,
      residential: false,
      commercial: true,
      mixedUse: false,
      housingType: "commercial",
    };
  }
  const explicitResidential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
  const explicitCommercial = /근린생활시설|판매시설|사무소|상점|점포|소매점|음식점|의료시설|병원|의원|약국|교육연구시설|학원|숙박시설|호텔|모텔|업무시설/.test(purpose);
  // V62: mainPurps가 근린생활시설이어도 etcPurps에 주택/다가구가 명시되면 실제 혼합건물이다.
  // 기존에는 이런 행이 commercial-only가 되어 fmlyCnt가 상가호수로 들어가거나 주거가 누락됐다.
  if (explicitResidential && explicitCommercial && !base.officetel) {
    return { ...base, apartment: base.apartment === true, residential: true, commercial: true, mixedUse: true, housingType: "mixed" };
  }
  if (explicitCommercial && !explicitResidential && !base.officetel) {
    return { ...base, apartment: false, residential: false, commercial: true, mixedUse: false, housingType: "commercial" };
  }
  return base;
}

function v62PurposeResidentialCountHint(row) {
  const purpose = cleanBuildingText(buildingPurposeText(row));
  if (!purpose) return 0;
  const counts = [];
  const patterns = [
    /\((\d{1,4})\s*(?:가구|세대|호)\)/g,
    /(?:다가구(?:용)?(?:단독)?주택|다세대주택|연립주택|도시형생활주택|주택)\s*\((\d{1,4})\s*(?:가구|세대|호)?\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(purpose))) {
      const value = Math.max(0, Math.trunc(Number(match[1]) || 0));
      if (value > 0) counts.push(value);
    }
  }
  return counts.length ? Math.max(...counts) : 0;
}

function v60RelevantTitles(rows) {
  return (rows || []).filter((row) => row && !isAncillaryBuildingRecord(row));
}

function v60ParentTitleForDetail(row, titleRows) {
  const titles = v60RelevantTitles(titleRows);
  if (!titles.length) return null;
  const upper = cleanBuildingText(publicDataField(row, "mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"));
  if (upper) {
    const exact = titles.find((title) => buildingRecordKey(title) === upper);
    if (exact) return exact;
  }
  const rowBld = v60RawNameText(row?.bldNm ?? row?.bld_nm);
  const rowDong = v60RawNameText(row?.dongNm ?? row?.dong_nm);
  if (rowBld || rowDong) {
    const named = titles.filter((title) => {
      const titleBld = v60RawNameText(title?.bldNm ?? title?.bld_nm);
      const titleDong = v60RawNameText(title?.dongNm ?? title?.dong_nm);
      return (rowBld && (rowBld === titleBld || rowBld === titleDong)) ||
        (rowDong && (rowDong === titleDong || rowDong === titleBld));
    });
    if (named.length === 1) return named[0];
  }
  if (titles.length === 1) return titles[0];
  const classification = v60Classification(row);
  const sameClass = titles.filter((title) => {
    const tc = v60Classification(title);
    if (classification.residential && !classification.commercial) return tc.residential && !tc.commercial;
    if (classification.commercial && !classification.residential) return tc.commercial && !tc.residential;
    return false;
  });
  return sameClass.length === 1 ? sameClass[0] : null;
}

function v60ElevatorStatusFromTitle(row) {
  const info = buildingElevatorInfo(row);
  if (info.hasElevator) return { status: "yes", info, reason: "title_positive" };
  if (info.explicitZero) return { status: "no", info, reason: "title_zero" };
  return { status: "unknown", info, reason: "title_unknown" };
}

function v60KaptElevatorStatus(match, titleRowsByParcel) {
  const info = match?.normalized || {};
  const titles = v60RelevantTitles(titleRowsByParcel.get(match?.parcelKey) || [])
    .filter((row) => v60Classification(row).apartment && v60TitleCoveredByKapt(row, [match]));
  const positiveTitle = titles.find((row) => buildingElevatorInfo(row).hasElevator);
  if (Number(info.elevatorCount || 0) > 0) {
    return { status: "yes", reason: "kapt_positive", elevatorCount: Number(info.elevatorCount || 0) };
  }
  if (positiveTitle) {
    const titleInfo = buildingElevatorInfo(positiveTitle);
    return { status: "yes", reason: "title_positive_counterevidence", elevatorCount: titleInfo.total };
  }
  if (info.elevatorKnown === true) {
    const allKnownZero = titles.length === 0 || titles.every((row) => buildingElevatorInfo(row).explicitZero);
    if (allKnownZero) return { status: "no", reason: "kapt_zero", elevatorCount: 0 };
  }
  const knownTitle = titles.map(v60ElevatorStatusFromTitle).find((item) => item.status !== "unknown");
  if (knownTitle) return { ...knownTitle, elevatorCount: knownTitle.info?.total || 0 };
  return { status: "unknown", reason: "kapt_unknown", elevatorCount: 0 };
}

function v60ClassificationBucket(classification) {
  if (classification?.residential && !classification?.commercial) return "residential";
  if (classification?.commercial && !classification?.residential) return "commercial";
  if (classification?.residential && classification?.commercial) return "mixed";
  return "unclassified";
}

function v62ResolvedClassificationBucket(row, classification) {
  const direct = v60ClassificationBucket(classification);
  if (direct === "residential" || direct === "commercial") return direct;

  // 기존 "용도 미분류"에는 실제로 용도 데이터가 있는 행도 섞여 있었다.
  // 수량 자체는 건드리지 않고, 주용도(없으면 전체 용도 문자열)가 한쪽으로 명확할 때만
  // 주거/상업 버킷을 결정한다. 혼합/빈 용도는 계속 unclassified로 남긴다.
  const mainPurpose = cleanBuildingText(
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm")
  ).replace(/\s+/g, "");
  const purpose = (mainPurpose || cleanBuildingText(buildingPurposeText(row)).replace(/\s+/g, ""));
  if (!purpose) return direct;

  const residential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
  const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|영유아보육시설|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|위험물저장및처리시설|장례시설|업무시설/.test(purpose);

  if (commercial && !residential) return "commercial";
  if (residential && !commercial) return "residential";
  return direct;
}

function v61MixedTitleExplicitSplit(row, classification) {
  const household = firstPositiveBuildingInteger(
    row?.hhldCnt, row?.hhld_cnt, row?.householdCnt, row?.househol
```

## missing = #5
```js
식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|업무시설/.test(use);
  if (commercial && !residential) return "commercial";
  if (residential && !commercial) return "residential";
  return null;
}

function v65FloorEvidenceKeys(row) {
  const buildingPk = cleanBuildingText(publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk"));
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const floor = normalizeFloorIdentityV29(unitFloorName(row));
  const keys = [];
  if (buildingPk && floor) keys.push(`PK:${buildingPk}|F:${floor}`);
  if (dong && floor) keys.push(`D:${dong}|F:${floor}`);
  return keys;
}

function v65BuildFloorClassIndex(floorRows) {
  const sets = new Map();
  for (const row of floorRows || []) {
    const bucket = v65FloorClassForOverviewRow(row);
    if (!bucket) continue;
    for (const key of v65FloorEvidenceKeys(row)) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(bucket);
    }
  }
  const out = new Map();
  for (const [key, values] of sets.entries()) {
    // 한 층에 주거/상업이 함께 적힌 경우 개별 호를 구분할 근거가 없으므로
    // 억지 분류하지 않는다. 한쪽 용도만 명확한 층만 official hint로 사용한다.
    if (values.size === 1) out.set(key, [...values][0]);
  }
  return out;
}

function v65EnrichExposRowsWithFloorUse(exposRows, floorRows) {
  const index = v65BuildFloorClassIndex(floorRows);
  const rows = (exposRows || []).map((row) => {
    let bucket = null;
    for (const key of v65FloorEvidenceKeys(row)) {
      if (index.has(key)) { bucket = index.get(key); break; }
    }
    if (!bucket) return { ...(row || {}) };
    return {
      ...(row || {}),
      // 기존 공식 전유부 원문은 보존하고 synthetic 용도 증거만 별도 추가한다.
      __v65FloorUse: bucket === "commercial" ? "근린생활시설" : "아파트",
    };
  });
  if (rows.length) rows[0] = { ...rows[0], __v65DetailVersion: V65_DETAIL_CACHE_VERSION };
  return rows;
}

async function v60FetchDetailParcel(env, parcel) {
  // 연결 안정성을 위해 동시에 최대 2개만 호출한다. 먼저 전유부 전체와 층별개요를
  // 받고, 그 다음 전유공용면적을 기존 제한으로 조회한다.
  const [exposResult, floorResult] = await Promise.allSettled([
    v60FetchParcelRows(
      env,
      BUILDING_HUB_EXPOS_URL,
      "Building HUB V65 complete exclusive unit",
      parcel,
      { maxPages: V65_EXPOS_MAX_PAGES, maxVariants: 2, pageConcurrency: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
    ),
    v60FetchParcelRows(
      env,
      BUILDING_HUB_FLOOR_URL,
      "Building HUB V65 floor overview",
      parcel,
      { maxPages: V65_FLOOR_MAX_PAGES, maxVariants: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
    ),
  ]);

  const rawExposRows = exposResult.status === "fulfilled" ? exposResult.value.rows || [] : [];
  const floorRows = floorResult.status === "fulfilled" ? floorResult.value.rows || [] : [];
  const floorIndexV65 = v65BuildFloorClassIndex(floorRows);
  const hasCommercialFloorV65 = [...floorIndexV65.values()].some((value) => value === "commercial");

  // 3천호 이상 대단지에서 area API는 호당 공용면적 행까지 반복되어 수만 건이 된다.
  // 층별개요에 상업층이 명확하고 전유부를 끝까지 확보했다면 상가 판정에는 full area가
  // 필요하지 않으므로 30페이지 추가 호출을 생략한다. 작은/불명확 필지는 기존대로 area를 확인한다.
  const skipHugeAreaScanV65 = rawExposRows.length >= 3000 && hasCommercialFloorV65;
  const areaResult = skipHugeAreaScanV65
    ? { status: "fulfilled", value: { rows: [], error: null, variant: "skipped_v65_floor_evidence" } }
    : await Promise.allSettled([
        v60FetchParcelRows(
          env,
          BUILDING_HUB_EXPOS_AREA_URL,
          "Building HUB V65 exclusive area",
          parcel,
          { maxPages: V60_DETAIL_MAX_PAGES, maxVariants: 2, timeoutMs: V60_BUILDING_HUB_TIMEOUT_MS }
        ),
      ]).then((rows) => rows[0]);

  const areaRows = areaResult.status === "fulfilled" ? areaResult.value.rows || [] : [];
  const exposRows = v65EnrichExposRowsWithFloorUse(rawExposRows, floorRows);
  const errors = [];
  if (exposResult.status === "rejected") errors.push(String(exposResult.reason?.message || exposResult.reason));
  if (floorResult.status === "rejected") errors.push(String(floorResult.reason?.message || floorResult.reason));
  if (areaResult.status === "rejected") errors.push(String(areaResult.reason?.message || areaResult.reason));
  if (!rawExposRows.length && !areaRows.length && errors.length >= 2) throw new Error(errors.join(" | "));
  return { areaRows, exposRows, floorRows, warnings: errors, areaSkippedByFloorEvidenceV65: skipHugeAreaScanV65 };
}

function v65DetailCacheIsCurrent(row) {
  if (!row || row.status !== "ready") return false;
  const firstExpos = Array.isArray(row.expos_rows) ? row.expos_rows[0] : null;
  const firstArea = Array.isArray(row.area_rows) ? row.area_rows[0] : null;
  return cleanBuildingText(
    firstExpos?.detailVersionV65 ?? firstExpos?.detail_version_v65 ??
    firstArea?.detailVersionV65 ?? firstArea?.detail_version_v65
  ) === V65_DETAIL_CACHE_VERSION;
}

async function v60EnsureDetailCaches(env, detailParcelKeys) {
  const keys = [...new Set(detailParcelKeys || [])];
  let cacheMap = await v60LoadDetailCache(env, keys);
  // V65 이전 캐시는 3,000/4,000행 절단과 층별 용도 증거 부재가 있으므로
  // 선택된 상세 필지에 한해 딱 한 번 다시 받는다.
  cacheMap = new Map([...cacheMap.entries()].filter(([, row]) => v65DetailCacheIsCurrent(row)));
  let missing = keys.filter((key) => !cacheMap.has(key));
  if (missing.length) {
    const batch = missing.slice(0, V60_DETAIL_BATCH);
    const results = await mapBuildingWithConcurrency(
      batch,
      V60_DETAIL_CONCURRENCY,
      async (parcelKey) => {
        const parcel = buildingParcelKeyPartsV51(parcelKey);
        if (!parcel) return { parcelKey, data: null, error: "invalid_parcel" };
        try {
          return { parcelKey, data: await v60FetchDetailParcel(env, parcel), error: null };
        } catch (error) {
          return { parcelKey, data: null, error: String(error?.message || error) };
        }
      }
    );
    const now = new Date().toISOString();
    const writes = results.map((result) => ({
      parcel_key: result.parcelKey,
      region_key: v60RegionKeyFromParcelKey(result.parcelKey),
      expos_rows: compactBuildingDetailRows(result.data?.exposRows || [], V65_EXPOS_CACHE_MAX_ROWS),
      area_rows: (() => {
        const rows = compactBuildingDetailRows(result.data?.areaRows || []);
        if (rows.length && !(result.data?.exposRows || []).length) {
          rows[0] = { ...rows[0], detailVersionV65: V65_DETAIL_CACHE_VERSION };
        }
        return rows;
      })(),
      status: result.error ? "error" : "ready",
      fetched_at: now,
      expires_at: result.error
        ? v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES })
        : v60IsoAfter({ days: V60_DETAIL_CACHE_DAYS }),
      last_error: result.error || (result.data?.warnings || []).join(" | ") || null,
      updated_at: now,
    }));
    if (writes.length) await v60SupabaseUpsert(env, V60_DETAIL_CACHE_TABLE, writes, "parcel_key");
    cacheMap = await v60LoadDetailCache(env, keys);
    cacheMap = new Map([...cacheMap.entries()].filter(([, row]) => v65DetailCacheIsCurrent(row)));
    missing = keys.filter((key) => !cacheMap.has(key));
  }
  const errorRows = keys.map((key) => cacheMap.get(key)).filter((row) => row?.status === "error");
  return {
    complete: missing.length === 0,
    sourceComplete: missing.length === 0 && errorRows.length === 0,
    cacheMap,
    keys,
    missing,
    errorRows,
    evidence: keys.filter((key) => cacheMap.has(key)).map((key) => ({
      parcelKey: key,
      status: cacheMap.get(key)?.status || "ready",
    })),
  };
}

function v60DetailUnitKey(row, index = 0) {
  const ho = normalizeDeliveryUnitName(unitHoName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const bld = normalizeDeliveryUnitName(cleanBuildingText(row?.bldNm ?? row?.bld_nm));
  if (ho) return [bld || "BLD", dong || "DONG", floor || "FLOOR", ho].join("|");
  const pk = cleanBuildingText(publicDataField(row, "mgmHoDetlPk", "mgm_ho_detl_pk", "mgmBldrgstPk", "mgm_bldrgst_pk"));
  if (pk) return `PK:${pk}`;
  return `ROW:${index}:${bld}:${dong}:${floor}`;
}

function v62ApartmentShopNameHint(row) {
  const dongName = cleanBuildingText(
    publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
  ).replace(/\s+/g, "");

  // 구축 공동주택 대장은 상가동의 주용도를 "공동주택"으로 잘못 남긴 사례가 많다.
  // 동명 자체에 상가/근린생활시설이 명시된 경우에만 상가 전용동으로 인정한다.
  return !!dongName && /상가|근린생활시설/.test(dongName);
}

function v62ParcelHasKaptMatch(row, kaptMatches) {
  const parcelKey = buildingParcelDescriptor(row)?.key || cleanBuildingText(row?.__scopeParcelKeyV20);
  if (!parcelKey) return false;
  return (kaptMatches || []).some((match) => cleanBuildingText(match?.parcelKey) === cleanBuildingText(parcelKey));
}

function v60Classification(row) {
  const base = buildingHousingClassification(row);
  const purpose = buildingPurposeText(row).replace(/\s+/g, "");

  // V62 hotfix: K-APT가 주거 세대수를 담당하더라도 "상가동/상가/근린생활시설동"은
  // 별도 배송호수다. 목적코드가 공동주택으로 남아 있어도 동명이라는 직접 증거를 우선한다.
  if (v62ApartmentShopNameHint(row)) {
    return {
      ...base,
      apartment: false,
      officetel: false,
      residential: false,
      commercial: true,
      mixedUse: false,
      housingType: "commercial",
    };
  }
  const explicitResidential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
  const explicitCommercial = /근린생활시설|판매시설|사무소|상점|점포|소매점|음식점|의료시설|병원|의원|약국|교육연구시설|학원|숙박시설|호텔|모텔|업무시설/.test(purpose);
  // V62: mainPurps가 근린생활시설이어도 etcPurps에 주택/다가구가 명시되면 실제 혼합건물이다.
  // 기존에는 이런 행이 commercial-only가 되어 fmlyCnt가 상가호수로 들어가거나 주거가 누락됐다.
  if (explicitResidential && explicitCommercial && !base.officetel) {
    return { ...base, apartment: base.apartment === true, residential: true, commercial: true, mixedUse: true, housingType: "mixed" };
  }
  if (explicitCommercial && !explicitResidential && !base.officetel) {
    return { ...base, apartment: false, residential: false, commercial: true, mixedUse: false, housingType: "commercial" };
  }
  return base;
}

function v62PurposeResidentialCountHint(row) {
  const purpose = cleanBuildingText(buildingPurposeText(row));
  if (!purpose) return 0;
  const counts = [];
  const patterns = [
    /\((\d{1,4})\s*(?:가구|세대|호)\)/g,
    /(?:다가구(?:용)?(?:단독)?주택|다세대주택|연립주택|도시형생활주택|주택)\s*\((\d{1,4})\s*(?:가구|세대|호)?\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(purpose))) {
      const value = Math.max(0, Math.trunc(Number(match[1]) || 0));
      if (value > 0) counts.push(value);
    }
  }
  return counts.length ? Math.max(...counts) : 0;
}

function v60RelevantTitles(rows) {
  return (rows || []).filter((row) => row && !isAncillaryBuildingRecord(row));
}

function v60ParentTitleForDetail(row, titleRows) {
  const titles = v60RelevantTitles(titleRows);
  if (!titles.length) return null;
  const upper = cleanBuildingText(publicDataField(row, "mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"));
  if (upper) {
    const exact = titles.find((title) => buildingRecordKey(title) === upper);
    if (exact) return exact;
  }
  const rowBld = v60RawNameText(row?.bldNm ?? row?.bld_nm);
  const rowDong = v60RawNameText(row?.dongNm ?? row?.dong_nm);
  if (rowBld || rowDong) {
    const named = titles.filter((title) => {
      const titleBld = v60RawNameText(title?.bldNm ?? title?.bld_nm);
      const titleDong = v60RawNameText(title?.dongNm ?? title?.dong_nm);
      return (rowBld && (rowBld === titleBld || rowBld === titleDong)) ||
        (rowDong && (rowDong === titleDong || rowDong === titleBld));
    });
    if (named.length === 1) return named[0];
  }
  if (titles.length === 1) return titles[0];
  const classification = v60Classification(row);
  const sameClass = titles.filter((title) => {
    const tc = v60Classification(title);
    if (classification.residential && !classification.commercial) return tc.residential && !tc.commercial;
    if (classification.commercial && !classification.residential) return tc.commercial && !tc.residential;
    return false;
  });
  return sameClass.length === 1 ? sameClass[0] : null;
}

function v60ElevatorStatusFromTitle(row) {
  const info = buildingElevatorInfo(row);
  if (info.hasElevator) return { status: "yes", info, reason: "title_positive" };
  if (info.explicitZero) return { status: "no", info, reason: "title_zero" };
  return { status: "unknown", info, reason: "title_unknown" };
}

function v60KaptElevatorStatus(match, titleRowsByParcel) {
  const info = match?.normalized || {};
  const titles = v60RelevantTitles(titleRowsByParcel.get(match?.parcelKey) || [])
    .filter((row) => v60Classification(row).apartment && v60TitleCoveredByKapt(row, [match]));
  const positiveTitle = titles.find((row) => buildingElevatorInfo(row).hasElevator);
  if (Number(info.elevatorCount || 0) > 0) {
    return { status: "yes", reason: "kapt_positive", elevatorCount: Number(info.elevatorCount || 0) };
  }
  if (positiveTitle) {
    const titleInfo = buildingElevatorInfo(positiveTitle);
    return { status: "yes", reason: "title_positive_counterevidence", elevatorCount: titleInfo.total };
  }
  if (info.elevatorKnown === true) {
    const allKnownZero = titles.length === 0 || titles.every((row) => buildingElevatorInfo(row).explicitZero);
    if (allKnownZero) return { status: "no", reason: "kapt_zero", elevatorCount: 0 };
  }
  const knownTitle = titles.map(v60ElevatorStatusFromTitle).find((item) => item.status !== "unknown");
  if (knownTitle) return { ...knownTitle, elevatorCount: knownTitle.info?.total || 0 };
  return { status: "unknown", reason: "kapt_unknown", elevatorCount: 0 };
}

function v60ClassificationBucket(classification) {
  if (classification?.residential && !classification?.commercial) return "residential";
  if (classification?.commercial && !classification?.residential) return "commercial";
  if (classification?.residential && classification?.commercial) return "mixed";
  return "unclassified";
}

function v62ResolvedClassificationBucket(row, classification) {
  const direct = v60ClassificationBucket(classification);
  if (direct === "residential" || direct === "commercial") return direct;

  // 기존 "용도 미분류"에는 실제로 용도 데이터가 있는 행도 섞여 있었다.
  // 수량 자체는 건드리지 않고, 주용도(없으면 전체 용도 문자열)가 한쪽으로 명확할 때만
  // 주거/상업 버킷을 결정한다. 혼합/빈 용도는 계속 unclassified로 남긴다.
  const mainPurpose = cleanBuildingText(
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm")
  ).replace(/\s+/g, "");
  const purpose = (mainPurpose || cleanBuildingText(buildingPurposeText(row)).replace(/\s+/g, ""));
  if (!purpose) return direct;

  const residential = /공동주택|아파트|연립주택|다세대주택|단독주택|다가구주택|다가구용단독주택|다중주택|도시형생활주택|기숙사|오피스텔|주택/.test(purpose);
  const commercial = /상가|근린생활시설|생활편익시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|영유아보육시설|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설|위험물저장및처리시설|장례시설|업무시설/.test(purpose);

  if (commercial && !residential) return "commercial";
  if (residential && !commercial) return "residential";
  return direct;
}

function v61MixedTitleExplicitSplit(row, classification) {
  const household = firstPositiveBuildingInteger(
    row?.hhldCnt, row?.hhld_cnt, row?.householdCnt, row?.household_count,
    row?.hshldCnt, row?.hshld_cnt, row?.totHhldCnt, row?.tot_hhld_cnt
  );
  const family = firstPositiveBuildingInteger(
    row?.fmlyCnt, row?.fmly_cnt, row?.familyCnt, row?.family_count, row?.fmlyCo, row?.fmly_co
  );
  const ho = firstPositiveBuildingInteger(
    row?.hoCnt, row?.ho_cnt, row?.hoCount, row?.ho_count,
    row?.unitCnt, row?.unit_cnt, row?.unitCount, row?.unit_count, row?.roomCnt, row?.room_cnt
  );

  const purposeHint = v62PurposeResidentialCountHint(row);
  // V62: 국토부 표제부에서 fmlyCnt와 etcPurps의 괄호 가구수가 서로 다른 실제 사례가 있다.
  // 예: 다가구주택(4가구)인데 fmlyCnt=3. 둘 중 큰 명시값을 사용한다.
  const residential = classification?.residential ? Math.max(household, family, purposeHint) : 0;
  // hoCnt가 주거 가구수보다 큰 경우에만 그 차이를 비주거 호수로 볼 수 있다.
  // 값이 없으면 상가 호수를 임의 추정하지 않는다.
  const commercial = classification?.commercial && ho > residential ? ho - residential : 0;
  return { residential, commercial, household, family, ho, purposeHint };
}


function v66PermitWelfareText(row) {
  return [
    publicDataField(row,
      "wlfarLotouFcKindCdNm", "wlfar_lotou_fc_kind_cd_nm",
      "wlfarLotouFcKindNm", "wlfar_lotou_fc_kind_nm",
      "wlfarFcKindCdNm", "wlfar_fc_kind_cd_nm",
      "wlfarFcKindNm", "wlfar_fc_kind_nm"
    ),
    publicDataField(row, "etcFc", "etc_fc", "etcFclty", "etc_fclty", "etcFacility", "etc_facility"),
    publicDataField(row, "purpsCdNm", "purps_cd_nm", "mainPurpsCdNm", "main_purps_cd_nm"),
    publicDataField(row, "etcPurps", "etc_purps", "etcPurpose", "etc_purpose"),
    publicDataField(row, "bldNm", "bld_nm", "buildingName", "building_name"),
  ].map(cleanBuildingText).filter(Boolean).join(" ");
}

function v66PermitWelfareCurrentCount(row) {
  if (!row || typeof row !== "object") return 0;

  const direct = [
    publicDataField(row, "openCnt", "open_cnt", "open
```