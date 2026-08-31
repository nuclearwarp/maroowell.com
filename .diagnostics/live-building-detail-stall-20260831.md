# Live building detail stall snippets 2026-08-31

sha256: 247463bef34888e75073f9fba0314de914620bc87275caed1f1c39f2ee617dad

## requiresDetailContinuation #1

```js
nt) || 0));
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
     
```

## detailContinuation #1

```js
label}: ${String(error?.message || error || "failed")}`
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
      addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
      verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
      kaptMatchesV51: group.kaptMatchesV51 || [],
      areaRows: [],
      exposRows: [],
      recapRows: [],
      housePriceRows: [],
      floorRows: [],
      sourceComplete: true,
      queryDiagnostics: {
        optimized: true,
        skippedReason: reason,
      },
    });
  }

  const accumulatedDetailEvidence = [
    ...priorDetailEvidence,
    ...selectedResults
      .map(buildingDetailEvidenceFromResult)
      .filter(Boolean),
  ].slice(0, BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE);

  return {
    complete,
    detailContinuation: {
      required: deferredCandidates.length > 0,
      processedParcelCount: accumulatedDetailEvidence.length,
      batchParcelCount: selectedResults.length,
      remainingParcelCount: deferredCandidates.length,
      totalDetailParcelCount: accumulatedDetailEvidence.length + deferredCandidates.length,
      evidence: accumulatedDetailEvidence,
    },
    warnings,
    diagnosticsV51: {
      verifiedScopeParcelCount: verifiedScopeMapV51.size,
      detailScopeOnlyParcelCount: parcelGroups.filter((group) => group.addedFromVerifiedScopeV51 && !(group.titleMatches || []).length).length,
      detailKaptAddedParcelCount: parcelGroups.filter((group) => group.addedFromKaptScopeV48).length,
      recapRequestedParcelCount: selectedResults.filter((row) => !row?.queryDiagnostics?.recap?.skippedReason).length,
    },
    bulkDiagnostics: {
      complete: true,
      skipped: true,
      mode: "V29_DIRECT_PARCEL_ONLY",
      reason: "법정동 bulk 전유부가 10/757처럼 잘리는 지역에서 과소집계를 방지하기 위해 사용하지 않음",
      areaCoverage: null,
      area: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
      expos: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
    },
    parcels: parcelGroups.map((group) =>
      resultByKey.get(group.parcel.key) || {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        areaRows: [],
        exposRows: [],
        recapRows: [],
        housePriceRows: [],
        floorRows: [],
        sourceComplete: true,
        queryDiagnostics: {
          optimized: true,
          skippedReason: "no_result_v29",
        },
      }
    ),
  };
}

function titleRowIndexes(matchedBuildingRows) {
  const byManagementKey = new Map();
  const byParcelKey = new Map();

  for (const match of matchedBuildingRows || []) {
    const row = match.row;
    const mgmKey = cleanBuildingText(row?.mgmBldrgstPk ?? row?.mgm_bldrgst_pk);
    if (mgmKey) byManagementKey.set(mgmKey, match);

    const parcel = buildingParcelDescriptor(row);
    if (parcel) {
      if (!byParcelKey.has(parcel.key)) byParcelKey.set(parcel.key, []);
      byParcelKey.get(parcel.key).push(match);
    }
  }

  return { byManagementKey, byParcelKey };
}

function normalizeBuildingDongMatchKey(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^제(?=\d)/, "")
    .replace(/동$/, "");
}

function findParentTitleMatch(unitRow, parcel, indexes) {
  const parentKey = unitParentManagementKey(unitRow);
  if (parentKey && indexes.byManagementKey.has(parentKey)) {
    return indexes.byManagementKey.get(parentKey);
  }

  const candidates = indexes.byParcelKey.get(parcel.key) || [];
  if (!candidates.length) return null;

  const unitDong = normalizeBuildingDongMatchKey(unitDongName(unitRow));
  if (unitDong) {
    const dongMatches = candidates.filter((match) =>
      normalizeBuildingDongMatchKey(match.row?.dongNm ?? match.row?.dong_nm) === unitDong
    );
    if (dongMatches.length === 1) return dongMatches[0];
  }

  const unitBuildingName = normalizeDeliveryUnitName(
    publicDataField(unitRow, "bldNm", "bld_nm") ?? ""
  );
  if (unitBuildingName) {
    const nameMatches = candidates.filter((match) =>
      normalizeDeliveryUnitName(match.row?.bldNm ?? match.row?.bld_nm) === unitBuildingName
    );
    if (nameMatches.length === 1) return nameMatches[0];
  }

  // 같은 필지에 표제부가 하나뿐이면 안전하게 연결한다. 여러 건물이 있는
  // 필지에서 무조건 첫 번째 건물에 연결하면 모든 전유호가 한 건물로 몰리고
  // 나머지 건물의 호수가 통째로 사라진다.
  return candidates.length === 1 ? candidates[0] : null;
}

function addUnitToElevatorTotals(totals, unitType, elevatorCategory, units) {
  const count = Math.max(0, Math.trunc(Number(units) || 0));
  if (!count) return;

  if (elevatorCategory === "confirmed") {
    totals.confirmedElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialElevatorUnitCount += count;
    return;
  }

  if (elevatorCategory === "inferred") {
    // V36 compatibility guard: 과거/혼합 경로에서 inferred가 들어와도
    // 엘베 O로 합산하지 않고 미확인으로 처리한다.
    totals.unknownElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialUnknownElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialUnknownElevatorUnitCount += count;
    return;
  }

  if (elevatorCategory === "none") {
    totals.noElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialNoElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialNoElevatorUnitCount += count;
    return;
  }

  totals.unknownElevatorUnitCount += count;
  if (unitType === "residential") totals.residentialUnknownElevatorUnitCount += count;
  if (unitType === "commercial") totals.commercialUnknownElevatorUnitCount += count;
}

function buildingLocalMeters(lng, lat, refLng, refLat) {
  const latRad = Number(refLat) * Math.PI / 180;
  return {
    x: (Number(lng) - Number(refLng)) * 111320 * Math.cos(latRad),
    y: (Number(lat) - Number(refLat)) * 110540,
  };
}

function buildingPointToSegmentDistanceMeters(
  pointLng,
  pointLat,
  aLng,
  aLat,
  bLng,
  bLat
) {
  const a = buildingLocalMeters(aLng, aLat, pointLng, pointLat);
  const b = buildingLocalMeters(bLng, bLat, pointLng, pointLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!Number.isFinite(lengthSquared) || lengthSquared <= 1e-12) {
    return Math.hypot(a.x, a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)
  );

  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function buildingDistanceToRingMeters(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return Infinity;

  let minDistance = Infinity;

  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];

    if (
      !Array.isArray(current) ||
      current.length < 2 ||
      !Array.isArray(next) ||
      next.length < 2
    ) {
      continue;
    }

    const distance = buildingPointToSegmentDistanceMeters(
      lng,
      lat,
      Number(current[0]),
      Number(current[1]),
      Number(next[0]),
      Number(next[1])
    );

    if (Number.isFinite(distance) && distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

function buildingDistanceToGeometryMeters(lng, lat, geometry) {
  if (!geometry || typeof geometry !== "object") return Infinity;

  if (pointInBuildingGeometry(lng, lat, geometry)) return 0;

  let minDistance = Infinity;
  const polygons = geometry.type === "Polygon
```

## detailContinuation #2

```js
eParcels?.diagnostics || null,
    },
  };
}

function parcelTitleMatches(parcel, indexes) {
  return indexes.byParcelKey.get(parcel.key) || [];
}

function bestRecapFallback(recapRows) {
  let best = null;
  for (const row of recapRows || []) {
    const classification = buildingHousingClassification(row);
    const evidence = buildingTitleUnitEvidence(row, classification);
    if (!best || evidence.units > best.units) {
      best = {
        row,
        classification,
        units: evidence.units,
        confidence: evidence.confidence,
        evidenceSource: evidence.source,
      };
    }
  }
  return best && best.units > 0 ? best : null;
}

function titleParcelFallback(matches) {
  const rows = [];
  const seen = new Set();

  for (const match of matches || []) {
    const row = match?.row;
    if (!row) continue;
    const key = buildingRecordKey(row);
    if (!key || seen.has(key) || isAncillaryBuildingRecord(row)) continue;
    seen.add(key);

    const classification = buildingHousingClassification(row);
    const evidence = buildingTitleUnitEvidence(row, classification);
    if (evidence.units > 0) {
      rows.push({
        row,
        classification,
        units: evidence.units,
        confidence: evidence.confidence,
        evidenceSource: evidence.source,
        estimateDetails: evidence.estimateDetails || null,
        match,
      });
    }
  }

  if (!rows.length) return [];

  const apartmentRows = rows.filter((item) => item.classification.apartment);
  if (apartmentRows.length > 1) {
    const values = apartmentRows.map((item) => item.units);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min || max >= values.reduce((sum, value) => sum + value, 0) * 0.8) {
      const selected = apartmentRows.find((item) => item.units === max);
      return [selected, ...rows.filter((item) => !item.classification.apartment)];
    }
  }

  return rows;
}

function titleParcelExplicitFallback(matches) {
  return titleParcelFallback(matches).filter((item) => item.confidence === "authoritative");
}

function buildingAddressSimilarity(a, b) {
  const left = normalizedBuildingAddress(a);
  const right = normalizedBuildingAddress(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftNumbers = left.match(/\d+(?:-\d+)?/g) || [];
  const rightNumbers = right.match(/\d+(?:-\d+)?/g) || [];
  return leftNumbers.some((value) => rightNumbers.includes(value));
}

function kaptMatchesTitleParcel(complex, matches) {
  const kaptAddress = cleanBuildingText(complex?.address);
  const kaptLocation = complex?.location;
  const kaptName = compactBuildingMatchText(complex?.name || complex?.kaptName || "");
  const boundTitleKey = cleanBuildingText(complex?.scopeTitleKey || complex?.__scopeTitleKeyV46);
  const boundParcelKey = cleanBuildingText(complex?.scopeParcelKey || complex?.__scopeParcelKeyV46);

  for (const match of matches || []) {
    const row = match?.row || {};
    const classification = buildingHousingClassification(row);
    const rowKey = buildingRecordKey(row);
    const rowParcelKey = buildingParcelDescriptor(row)?.key || "";
    if (boundTitleKey && rowKey === boundTitleKey) return true;
    if (boundParcelKey && rowParcelKey === boundParcelKey) return true;

    const titleAddress = buildingRecordAddresses(row).preferredAddress;
    if (buildingAddressSimilarity(kaptAddress, titleAddress)) return true;
    if (
      kaptLocation && match?.location &&
      distanceMetersBetweenPoints(kaptLocation, match.location) <= 100
    ) return true;

    // 하나의 아파트 단지가 여러 지번/동으로 분리된 경우 대표 K-APT 주소 한 건만으로는
    // 일부 동이 coverage에서 빠진다. 단지명과 건축물대장명이 실질적으로 같으면 같은 단지로 본다.
    if (classification.apartment && kaptName) {
      const titleName = compactBuildingMatchText(
        row?.bldNm ?? row?.bld_nm ?? row?.buildingName ?? row?.building_name ?? ""
      );
      if (
        titleName &&
        Math.min(kaptName.length, titleName.length) >= 2 &&
        (kaptName === titleName || kaptName.includes(titleName) || titleName.includes(kaptName))
      ) {
        return true;
      }
    }
  }

  return false;
}

function unitCandidateQuality(row) {
  let score = 0;
  if (unitHoName(row)) score += 4;
  if (unitDongName(row)) score += 2;
  if (unitUseText(row)) score += 4;
  const division = cleanBuildingText(
    row?.exposPubuseGbCdNm ?? row?.expos_pubuse_gb_cd_nm
  );
  if (/전유/.test(division)) score += 3;
  return score;
}

async function finalizeCombinedBuildingStats(env, prepared, options = {}) {
  // V35 Paid: 대부분의 구역은 최대 48필지 상세조회로 한 invocation에서 끝난다.
  // 48필지를 넘는 대형 구역만 continuation으로 넘기며, 그 경우 K-APT/최종 집계는 마지막 배치에서만 실행한다.
  const unitSource = await fetchMatchedBuildingUnitData(
    env,
    prepared.matchedBuildingRows,
    prepared.matchedKapt,
    {
      detailEvidence: options?.detailEvidence ?? options?.detail_evidence ?? [],
      verifiedScopeParcels: prepared.verifiedScopeParcels || null,
    }
  );

  if (unitSource?.detailContinuation?.required === true) {
    return {
      detailContinuation: unitSource.detailContinuation,
      unitSourceComplete: false,
      unitSourceWarnings: unitSource.warnings || [],
    };
  }

  const orderedKaptMatches = [...(prepared.matchedKapt || [])].sort((a, b) => {
    const left = Number(a?.scopeDistanceMeters);
    const right = Number(b?.scopeDistanceMeters);
    const aDistance = Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER;
    const bDistance = Number.isFinite(right) ? right : Number.MAX_SAFE_INTEGER;
    return aDistance - bDistance;
  });
  const selectedKaptMatches = orderedKaptMatches.slice(
    0,
    KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
  );
  const deferredKaptMatches = orderedKaptMatches.slice(
    KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
  );

  const kaptInfoRows = await mapBuildingWithConcurrency(
    selectedKaptMatches,
    KAPT_INFO_CONCURRENCY,
    async (match) => {
      const info = await fetchKaptComplexInfo(env, match.list);
      if (!info) return null;
      return normalizedKaptInfo(info, match.location);
    }
  );

  const normalizedKapt = [];
  const kaptInfoFailures = deferredKaptMatches.map((match) => ({
    kaptCode: kaptCodeOf(match?.list) || null,
    name: kaptNameOf(match?.list) || null,
    diagnostics: {
      error: "deferred_by_paid_safety_cap",
    },
  }));
  const seenKaptComplexes = new Set();
  for (const row of kaptInfoRows) {
    if (!row || Number(row.households) <= 0) {
      kaptInfoFailures.push({
        kaptCode: row?.kaptCode || row?.diagnostics?.kaptCode || null,
        name: row?.name || row?.diagnostics?.listName || null,
        diagnostics: row?.diagnostics || null,
      });
      continue;
    }
    const key = cleanBuildingText(row.kaptCode || row.key || row.address);
    if (!key || seenKaptComplexes.has(key)) continue;
    seenKaptComplexes.add(key);
    normalizedKapt.push(row);
  }

  // V51: 전유호가 이미 존재하는 필지에서도 recap-title의 상가동/혼합용도 부모를
  // 표제부 인덱스에 병합한다. 그래야 K-APT 주거 세대수와 별개로 상가 전유호가 commercial로 분류된다.
  const effectiveMatchedBuildingRowsV51 = [];
  const effectiveMatchSeenV51 = new Set();
  const pushEffectiveMatchV51 = (match, parcelKeyHint = "", source = "building_title") => {
    const row = match?.row;
    if (!row) return;
    const parcelKey = cleanBuildingText(
      parcelKeyHint || buildingParcelDescriptor(row)?.key || ""
    );
    const normalizedRow = parcelKey
      ? { ...row, __scopeParcelKeyV20: parcelKey }
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
    else previous
```

## detailContinuation #3

```js
lTitleMatches(parcel, indexes) {
  return indexes.byParcelKey.get(parcel.key) || [];
}

function bestRecapFallback(recapRows) {
  let best = null;
  for (const row of recapRows || []) {
    const classification = buildingHousingClassification(row);
    const evidence = buildingTitleUnitEvidence(row, classification);
    if (!best || evidence.units > best.units) {
      best = {
        row,
        classification,
        units: evidence.units,
        confidence: evidence.confidence,
        evidenceSource: evidence.source,
      };
    }
  }
  return best && best.units > 0 ? best : null;
}

function titleParcelFallback(matches) {
  const rows = [];
  const seen = new Set();

  for (const match of matches || []) {
    const row = match?.row;
    if (!row) continue;
    const key = buildingRecordKey(row);
    if (!key || seen.has(key) || isAncillaryBuildingRecord(row)) continue;
    seen.add(key);

    const classification = buildingHousingClassification(row);
    const evidence = buildingTitleUnitEvidence(row, classification);
    if (evidence.units > 0) {
      rows.push({
        row,
        classification,
        units: evidence.units,
        confidence: evidence.confidence,
        evidenceSource: evidence.source,
        estimateDetails: evidence.estimateDetails || null,
        match,
      });
    }
  }

  if (!rows.length) return [];

  const apartmentRows = rows.filter((item) => item.classification.apartment);
  if (apartmentRows.length > 1) {
    const values = apartmentRows.map((item) => item.units);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min || max >= values.reduce((sum, value) => sum + value, 0) * 0.8) {
      const selected = apartmentRows.find((item) => item.units === max);
      return [selected, ...rows.filter((item) => !item.classification.apartment)];
    }
  }

  return rows;
}

function titleParcelExplicitFallback(matches) {
  return titleParcelFallback(matches).filter((item) => item.confidence === "authoritative");
}

function buildingAddressSimilarity(a, b) {
  const left = normalizedBuildingAddress(a);
  const right = normalizedBuildingAddress(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftNumbers = left.match(/\d+(?:-\d+)?/g) || [];
  const rightNumbers = right.match(/\d+(?:-\d+)?/g) || [];
  return leftNumbers.some((value) => rightNumbers.includes(value));
}

function kaptMatchesTitleParcel(complex, matches) {
  const kaptAddress = cleanBuildingText(complex?.address);
  const kaptLocation = complex?.location;
  const kaptName = compactBuildingMatchText(complex?.name || complex?.kaptName || "");
  const boundTitleKey = cleanBuildingText(complex?.scopeTitleKey || complex?.__scopeTitleKeyV46);
  const boundParcelKey = cleanBuildingText(complex?.scopeParcelKey || complex?.__scopeParcelKeyV46);

  for (const match of matches || []) {
    const row = match?.row || {};
    const classification = buildingHousingClassification(row);
    const rowKey = buildingRecordKey(row);
    const rowParcelKey = buildingParcelDescriptor(row)?.key || "";
    if (boundTitleKey && rowKey === boundTitleKey) return true;
    if (boundParcelKey && rowParcelKey === boundParcelKey) return true;

    const titleAddress = buildingRecordAddresses(row).preferredAddress;
    if (buildingAddressSimilarity(kaptAddress, titleAddress)) return true;
    if (
      kaptLocation && match?.location &&
      distanceMetersBetweenPoints(kaptLocation, match.location) <= 100
    ) return true;

    // 하나의 아파트 단지가 여러 지번/동으로 분리된 경우 대표 K-APT 주소 한 건만으로는
    // 일부 동이 coverage에서 빠진다. 단지명과 건축물대장명이 실질적으로 같으면 같은 단지로 본다.
    if (classification.apartment && kaptName) {
      const titleName = compactBuildingMatchText(
        row?.bldNm ?? row?.bld_nm ?? row?.buildingName ?? row?.building_name ?? ""
      );
      if (
        titleName &&
        Math.min(kaptName.length, titleName.length) >= 2 &&
        (kaptName === titleName || kaptName.includes(titleName) || titleName.includes(kaptName))
      ) {
        return true;
      }
    }
  }

  return false;
}

function unitCandidateQuality(row) {
  let score = 0;
  if (unitHoName(row)) score += 4;
  if (unitDongName(row)) score += 2;
  if (unitUseText(row)) score += 4;
  const division = cleanBuildingText(
    row?.exposPubuseGbCdNm ?? row?.expos_pubuse_gb_cd_nm
  );
  if (/전유/.test(division)) score += 3;
  return score;
}

async function finalizeCombinedBuildingStats(env, prepared, options = {}) {
  // V35 Paid: 대부분의 구역은 최대 48필지 상세조회로 한 invocation에서 끝난다.
  // 48필지를 넘는 대형 구역만 continuation으로 넘기며, 그 경우 K-APT/최종 집계는 마지막 배치에서만 실행한다.
  const unitSource = await fetchMatchedBuildingUnitData(
    env,
    prepared.matchedBuildingRows,
    prepared.matchedKapt,
    {
      detailEvidence: options?.detailEvidence ?? options?.detail_evidence ?? [],
      verifiedScopeParcels: prepared.verifiedScopeParcels || null,
    }
  );

  if (unitSource?.detailContinuation?.required === true) {
    return {
      detailContinuation: unitSource.detailContinuation,
      unitSourceComplete: false,
      unitSourceWarnings: unitSource.warnings || [],
    };
  }

  const orderedKaptMatches = [...(prepared.matchedKapt || [])].sort((a, b) => {
    const left = Number(a?.scopeDistanceMeters);
    const right = Number(b?.scopeDistanceMeters);
    const aDistance = Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER;
    const bDistance = Number.isFinite(right) ? right : Number.MAX_SAFE_INTEGER;
    return aDistance - bDistance;
  });
  const selectedKaptMatches = orderedKaptMatches.slice(
    0,
    KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
  );
  const deferredKaptMatches = orderedKaptMatches.slice(
    KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
  );

  const kaptInfoRows = await mapBuildingWithConcurrency(
    selectedKaptMatches,
    KAPT_INFO_CONCURRENCY,
    async (match) => {
      const info = await fetchKaptComplexInfo(env, match.list);
      if (!info) return null;
      return normalizedKaptInfo(info, match.location);
    }
  );

  const normalizedKapt = [];
  const kaptInfoFailures = deferredKaptMatches.map((match) => ({
    kaptCode: kaptCodeOf(match?.list) || null,
    name: kaptNameOf(match?.list) || null,
    diagnostics: {
      error: "deferred_by_paid_safety_cap",
    },
  }));
  const seenKaptComplexes = new Set();
  for (const row of kaptInfoRows) {
    if (!row || Number(row.households) <= 0) {
      kaptInfoFailures.push({
        kaptCode: row?.kaptCode || row?.diagnostics?.kaptCode || null,
        name: row?.name || row?.diagnostics?.listName || null,
        diagnostics: row?.diagnostics || null,
      });
      continue;
    }
    const key = cleanBuildingText(row.kaptCode || row.key || row.address);
    if (!key || seenKaptComplexes.has(key)) continue;
    seenKaptComplexes.add(key);
    normalizedKapt.push(row);
  }

  // V51: 전유호가 이미 존재하는 필지에서도 recap-title의 상가동/혼합용도 부모를
  // 표제부 인덱스에 병합한다. 그래야 K-APT 주거 세대수와 별개로 상가 전유호가 commercial로 분류된다.
  const effectiveMatchedBuildingRowsV51 = [];
  const effectiveMatchSeenV51 = new Set();
  const pushEffectiveMatchV51 = (match, parcelKeyHint = "", source = "building_title") => {
    const row = match?.row;
    if (!row) return;
    const parcelKey = cleanBuildingText(
      parcelKeyHint || buildingParcelDescriptor(row)?.key || ""
    );
    const normalizedRow = parcelKey
      ? { ...row, __scopeParcelKeyV20: parcelKey }
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
    co
```

## detailContinuation #4

```js
{
  return indexes.byParcelKey.get(parcel.key) || [];
}

function bestRecapFallback(recapRows) {
  let best = null;
  for (const row of recapRows || []) {
    const classification = buildingHousingClassification(row);
    const evidence = buildingTitleUnitEvidence(row, classification);
    if (!best || evidence.units > best.units) {
      best = {
        row,
        classification,
        units: evidence.units,
        confidence: evidence.confidence,
        evidenceSource: evidence.source,
      };
    }
  }
  return best && best.units > 0 ? best : null;
}

function titleParcelFallback(matches) {
  const rows = [];
  const seen = new Set();

  for (const match of matches || []) {
    const row = match?.row;
    if (!row) continue;
    const key = buildingRecordKey(row);
    if (!key || seen.has(key) || isAncillaryBuildingRecord(row)) continue;
    seen.add(key);

    const classification = buildingHousingClassification(row);
    const evidence = buildingTitleUnitEvidence(row, classification);
    if (evidence.units > 0) {
      rows.push({
        row,
        classification,
        units: evidence.units,
        confidence: evidence.confidence,
        evidenceSource: evidence.source,
        estimateDetails: evidence.estimateDetails || null,
        match,
      });
    }
  }

  if (!rows.length) return [];

  const apartmentRows = rows.filter((item) => item.classification.apartment);
  if (apartmentRows.length > 1) {
    const values = apartmentRows.map((item) => item.units);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min || max >= values.reduce((sum, value) => sum + value, 0) * 0.8) {
      const selected = apartmentRows.find((item) => item.units === max);
      return [selected, ...rows.filter((item) => !item.classification.apartment)];
    }
  }

  return rows;
}

function titleParcelExplicitFallback(matches) {
  return titleParcelFallback(matches).filter((item) => item.confidence === "authoritative");
}

function buildingAddressSimilarity(a, b) {
  const left = normalizedBuildingAddress(a);
  const right = normalizedBuildingAddress(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftNumbers = left.match(/\d+(?:-\d+)?/g) || [];
  const rightNumbers = right.match(/\d+(?:-\d+)?/g) || [];
  return leftNumbers.some((value) => rightNumbers.includes(value));
}

function kaptMatchesTitleParcel(complex, matches) {
  const kaptAddress = cleanBuildingText(complex?.address);
  const kaptLocation = complex?.location;
  const kaptName = compactBuildingMatchText(complex?.name || complex?.kaptName || "");
  const boundTitleKey = cleanBuildingText(complex?.scopeTitleKey || complex?.__scopeTitleKeyV46);
  const boundParcelKey = cleanBuildingText(complex?.scopeParcelKey || complex?.__scopeParcelKeyV46);

  for (const match of matches || []) {
    const row = match?.row || {};
    const classification = buildingHousingClassification(row);
    const rowKey = buildingRecordKey(row);
    const rowParcelKey = buildingParcelDescriptor(row)?.key || "";
    if (boundTitleKey && rowKey === boundTitleKey) return true;
    if (boundParcelKey && rowParcelKey === boundParcelKey) return true;

    const titleAddress = buildingRecordAddresses(row).preferredAddress;
    if (buildingAddressSimilarity(kaptAddress, titleAddress)) return true;
    if (
      kaptLocation && match?.location &&
      distanceMetersBetweenPoints(kaptLocation, match.location) <= 100
    ) return true;

    // 하나의 아파트 단지가 여러 지번/동으로 분리된 경우 대표 K-APT 주소 한 건만으로는
    // 일부 동이 coverage에서 빠진다. 단지명과 건축물대장명이 실질적으로 같으면 같은 단지로 본다.
    if (classification.apartment && kaptName) {
      const titleName = compactBuildingMatchText(
        row?.bldNm ?? row?.bld_nm ?? row?.buildingName ?? row?.building_name ?? ""
      );
      if (
        titleName &&
        Math.min(kaptName.length, titleName.length) >= 2 &&
        (kaptName === titleName || kaptName.includes(titleName) || titleName.includes(kaptName))
      ) {
        return true;
      }
    }
  }

  return false;
}

function unitCandidateQuality(row) {
  let score = 0;
  if (unitHoName(row)) score += 4;
  if (unitDongName(row)) score += 2;
  if (unitUseText(row)) score += 4;
  const division = cleanBuildingText(
    row?.exposPubuseGbCdNm ?? row?.expos_pubuse_gb_cd_nm
  );
  if (/전유/.test(division)) score += 3;
  return score;
}

async function finalizeCombinedBuildingStats(env, prepared, options = {}) {
  // V35 Paid: 대부분의 구역은 최대 48필지 상세조회로 한 invocation에서 끝난다.
  // 48필지를 넘는 대형 구역만 continuation으로 넘기며, 그 경우 K-APT/최종 집계는 마지막 배치에서만 실행한다.
  const unitSource = await fetchMatchedBuildingUnitData(
    env,
    prepared.matchedBuildingRows,
    prepared.matchedKapt,
    {
      detailEvidence: options?.detailEvidence ?? options?.detail_evidence ?? [],
      verifiedScopeParcels: prepared.verifiedScopeParcels || null,
    }
  );

  if (unitSource?.detailContinuation?.required === true) {
    return {
      detailContinuation: unitSource.detailContinuation,
      unitSourceComplete: false,
      unitSourceWarnings: unitSource.warnings || [],
    };
  }

  const orderedKaptMatches = [...(prepared.matchedKapt || [])].sort((a, b) => {
    const left = Number(a?.scopeDistanceMeters);
    const right = Number(b?.scopeDistanceMeters);
    const aDistance = Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER;
    const bDistance = Number.isFinite(right) ? right : Number.MAX_SAFE_INTEGER;
    return aDistance - bDistance;
  });
  const selectedKaptMatches = orderedKaptMatches.slice(
    0,
    KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
  );
  const deferredKaptMatches = orderedKaptMatches.slice(
    KAPT_MAX_INFO_COMPLEXES_PER_REQUEST
  );

  const kaptInfoRows = await mapBuildingWithConcurrency(
    selectedKaptMatches,
    KAPT_INFO_CONCURRENCY,
    async (match) => {
      const info = await fetchKaptComplexInfo(env, match.list);
      if (!info) return null;
      return normalizedKaptInfo(info, match.location);
    }
  );

  const normalizedKapt = [];
  const kaptInfoFailures = deferredKaptMatches.map((match) => ({
    kaptCode: kaptCodeOf(match?.list) || null,
    name: kaptNameOf(match?.list) || null,
    diagnostics: {
      error: "deferred_by_paid_safety_cap",
    },
  }));
  const seenKaptComplexes = new Set();
  for (const row of kaptInfoRows) {
    if (!row || Number(row.households) <= 0) {
      kaptInfoFailures.push({
        kaptCode: row?.kaptCode || row?.diagnostics?.kaptCode || null,
        name: row?.name || row?.diagnostics?.listName || null,
        diagnostics: row?.diagnostics || null,
      });
      continue;
    }
    const key = cleanBuildingText(row.kaptCode || row.key || row.address);
    if (!key || seenKaptComplexes.has(key)) continue;
    seenKaptComplexes.add(key);
    normalizedKapt.push(row);
  }

  // V51: 전유호가 이미 존재하는 필지에서도 recap-title의 상가동/혼합용도 부모를
  // 표제부 인덱스에 병합한다. 그래야 K-APT 주거 세대수와 별개로 상가 전유호가 commercial로 분류된다.
  const effectiveMatchedBuildingRowsV51 = [];
  const effectiveMatchSeenV51 = new Set();
  const pushEffectiveMatchV51 = (match, parcelKeyHint = "", source = "building_title") => {
    const row = match?.row;
    if (!row) return;
    const parcelKey = cleanBuildingText(
      parcelKeyHint || buildingParcelDescriptor(row)?.key || ""
    );
    const normalizedRow = parcelKey
      ? { ...row, __scopeParcelKeyV20: parcelKey }
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
    contributorTotals.set(normalizedK
```

## detailContinuation #5

```js
        mixedUseSplitMethod: part.method || null,
            floorDistribution: part.distribution || null,
          },
        }, recap.confidence || "authoritative");
        if (recap.classification?.mixedUse) {
          if (part.type === "residential") unitDiagnostics.mixedUseResidentialUnits += part.units;
          if (part.type === "commercial") unitDiagnostics.mixedUseCommercialUnits += part.units;
        }
      }
      if (recap.classification?.mixedUse && recapSplit.length > 1) unitDiagnostics.mixedUseSplitBuildings += 1;
      recapFallbackUnits += recap.units;
      unitDiagnostics.parcelsWithRecapFallback += 1;
      totals.passengerElevatorCount += elevator.passenger || 0;
      totals.emergencyElevatorCount += elevator.emergency || 0;
      continue;
    }

    let parcelTitleUnits = 0;
    for (const fallback of titleParcelFallback(parcelMatches)) {
      if (coveredByKapt && fallback.classification.apartment) continue;
      const key = buildingRecordKey(fallback.row) || parcelKey;
      const floorEstimate = floorOverviewEstimatedUnitEvidence(
        parcelResult.floorRows || [],
        fallback.row,
        fallback.classification,
        parcelMatches
      );
      const reconciled = reconcileTitleUnitsWithFloorEvidence(fallback, floorEstimate);
      const effectiveUnits = Math.max(fallback.units, reconciled.units || 0);
      const elevator = buildingElevatorProfile(
        fallback.row,
        fallback.classification,
        parcelMatches,
        {
          unitCount: effectiveUnits,
          elevatorFacilityRows: elevatorFacilityRowsFor(fallback.row),
          sharedElevatorEvidence,
        }
      );

      const titleSplit = splitBuildingUnitsByUse(
        effectiveUnits,
        fallback.classification,
        parcelResult.floorRows || [],
        fallback.row,
        parcelMatches
      );
      for (const part of titleSplit) {
        addCount(part.type, part.units, key, elevator, {
          source: fallback.confidence === "estimated"
            ? "BUILDING_HUB_TITLE_AREA_ESTIMATE"
            : "BUILDING_HUB_TITLE_FALLBACK",
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
        failures: kaptInfoFailure
```

## detailContinuation #6

```js
rt.method || null,
            floorDistribution: part.distribution || null,
          },
        }, recap.confidence || "authoritative");
        if (recap.classification?.mixedUse) {
          if (part.type === "residential") unitDiagnostics.mixedUseResidentialUnits += part.units;
          if (part.type === "commercial") unitDiagnostics.mixedUseCommercialUnits += part.units;
        }
      }
      if (recap.classification?.mixedUse && recapSplit.length > 1) unitDiagnostics.mixedUseSplitBuildings += 1;
      recapFallbackUnits += recap.units;
      unitDiagnostics.parcelsWithRecapFallback += 1;
      totals.passengerElevatorCount += elevator.passenger || 0;
      totals.emergencyElevatorCount += elevator.emergency || 0;
      continue;
    }

    let parcelTitleUnits = 0;
    for (const fallback of titleParcelFallback(parcelMatches)) {
      if (coveredByKapt && fallback.classification.apartment) continue;
      const key = buildingRecordKey(fallback.row) || parcelKey;
      const floorEstimate = floorOverviewEstimatedUnitEvidence(
        parcelResult.floorRows || [],
        fallback.row,
        fallback.classification,
        parcelMatches
      );
      const reconciled = reconcileTitleUnitsWithFloorEvidence(fallback, floorEstimate);
      const effectiveUnits = Math.max(fallback.units, reconciled.units || 0);
      const elevator = buildingElevatorProfile(
        fallback.row,
        fallback.classification,
        parcelMatches,
        {
          unitCount: effectiveUnits,
          elevatorFacilityRows: elevatorFacilityRowsFor(fallback.row),
          sharedElevatorEvidence,
        }
      );

      const titleSplit = splitBuildingUnitsByUse(
        effectiveUnits,
        fallback.classification,
        parcelResult.floorRows || [],
        fallback.row,
        parcelMatches
      );
      for (const part of titleSplit) {
        addCount(part.type, part.units, key, elevator, {
          source: fallback.confidence === "estimated"
            ? "BUILDING_HUB_TITLE_AREA_ESTIMATE"
            : "BUILDING_HUB_TITLE_FALLBACK",
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
        complexes: normalize
```

## detailContinuation #7

```js
tCount,
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
          name: row.name || null,
          address: row.address || null,
          households: row.households || 0,
          householdsSource: row.householdsSource || null,
          elevatorCount: row.elevatorCount || 0,
          buildingCount: row.buildingCount || 0,
          scopeTitleKey: row.scopeTitleKey || null,
          scopeParcelKey: row.scopeParcelKey || null,
          scopeMatchReason: row.scopeMatchReason || null,
          scopeMatchScore: Number(row.scopeMatchScore || 0),
          lat: finiteNumberOrNull(row?.location?.lat),
          lng: finiteNumberOrNull(row?.location?.lng),
          diagnostics: row.diagnostics || null,
        })),
      },
      source: {
        matchedParcels: unitSource.parcels.length,
        unitSourceComplete: unitSource.complete,
        warnings: unitSource.warnings,
        unitDiagnostics,
        bulkExclusive: unitSource.bulkDiagnostics || null,
        parcelQueries: unitSource.parcels.map((parcelResult) => ({
          parcelKey: parcelResult.parcel?.key || null,
          addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
          addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
          areaRows: (parcelResult.areaRows || []).length,
          exposRows: (parcelResult.exposRows || []).length,
          floorRows: (parcelResult.floorRows || []).length,
          recapRows: (parcelResult.recapRows || []).length,
          housePriceRows: (parcelResult.housePriceRows || []).length,
          queries: parcelResult.queryDiagnostics || null,
        })),
      },
      topContributors,
    },
  };
}



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
        hhldCnt: nonNegativeBuildingInteger(row?.hhldCnt ?? row?.hhld_cnt),
        fmlyCnt: nonNegativeBuildingInteger(row?.fmlyCnt ?? row?.fmly_cnt),
        hoCnt: nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt),
        floors: buildingGroundFloorCount(row),
      },
    });
  };

  for (const [parcelKey, items] of parcelGroups) {
    const unique = [];
    const seen = new Set();

    for (const item of items) {
      
```

## detailContinuation #8

```js
levatorUnitCount: totals.residentialUnknownElevatorUnitCount,
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
          name: row.name || null,
          address: row.address || null,
          households: row.households || 0,
          householdsSource: row.householdsSource || null,
          elevatorCount: row.elevatorCount || 0,
          buildingCount: row.buildingCount || 0,
          scopeTitleKey: row.scopeTitleKey || null,
          scopeParcelKey: row.scopeParcelKey || null,
          scopeMatchReason: row.scopeMatchReason || null,
          scopeMatchScore: Number(row.scopeMatchScore || 0),
          lat: finiteNumberOrNull(row?.location?.lat),
          lng: finiteNumberOrNull(row?.location?.lng),
          diagnostics: row.diagnostics || null,
        })),
      },
      source: {
        matchedParcels: unitSource.parcels.length,
        unitSourceComplete: unitSource.complete,
        warnings: unitSource.warnings,
        unitDiagnostics,
        bulkExclusive: unitSource.bulkDiagnostics || null,
        parcelQueries: unitSource.parcels.map((parcelResult) => ({
          parcelKey: parcelResult.parcel?.key || null,
          addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
          addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
          areaRows: (parcelResult.areaRows || []).length,
          exposRows: (parcelResult.exposRows || []).length,
          floorRows: (parcelResult.floorRows || []).length,
          recapRows: (parcelResult.recapRows || []).length,
          housePriceRows: (parcelResult.housePriceRows || []).length,
          queries: parcelResult.queryDiagnostics || null,
        })),
      },
      topContributors,
    },
  };
}



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
        hhldCnt: nonNegativeBuildingInteger(row?.hhldCnt ?? row?.hhld_cnt),
        fmlyCnt: nonNegativeBuildingInteger(row?.fmlyCnt ?? row?.fmly_cnt),
        hoCnt: nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt),
        floors: buildingGroundFloorCount(row),
      },
    });
  };

  for (const [parcelKey, items] of parcelGroups) {
    const unique = [];
    const seen = new Set();

    for (const item of items) {
      const identity = titleFallbackI
```

## remainingParcelCount #1

```js
celDescriptorFromEntryV20(entry);
    if (!parcel) continue;
    if (priorEvidenceMap.has(parcel.key)) continue;
    const alreadyMatched = [...verifiedScopeParcelAliasKeysV20(entry)]
      .some((alias) => existingAliases.has(alias));
    if (alreadyMatched) continue;
    allPendingTargets.push({ entry, parcel });
  }

  // Region 단위로 raw title parcel cache를 한 번만 읽는다.
  const cacheIndex = new Map();
  const regionKeys = [...new Set(allPendingTargets.map((item) => v56RegionKeyFromParcel(item.parcel)).filter(Boolean))];
  for (const regionKey of regionKeys) {
    const loaded = await v56FetchRawCacheRows(env, regionKey, "TITLE_PARCEL_V56");
    for (const row of loaded.rows || []) {
      const key = String(row?.cache_key || "").trim();
      if (key) cacheIndex.set(key, row);
    }
  }

  const cachedResults = [];
  const livePendingTargets = [];
  for (const item of allPendingTargets) {
    const cacheKey = v56RawCacheKey("TITLE_PARCEL_V56", item.parcel.key);
    const cached = cacheIndex.get(cacheKey);
    if (v56RawCacheFresh(cached) && cached?.payload && Array.isArray(cached.payload.rows)) {
      const tagged = cached.payload.rows.map((row) => ({
        ...row,
        __scopeParcelKeyV20: item.parcel.key,
        __scopeParcelMatchAddressV20: item.entry?.matchedAddress || null,
      }));
      cachedResults.push({ parcel: item.parcel, rows: tagged, attempts: [{ name: "raw_cache_v56", rowCount: tagged.length }], error: null, cached: true });
    } else {
      livePendingTargets.push(item);
    }
  }

  const targets = livePendingTargets.slice(0, BUILDING_SCOPE_DIRECT_TITLE_MAX_PARCELS);
  const deferredTargets = livePendingTargets.slice(BUILDING_SCOPE_DIRECT_TITLE_MAX_PARCELS);
  const liveResults = await mapBuildingWithConcurrency(
    targets,
    BUILDING_SCOPE_DIRECT_TITLE_CONCURRENCY,
    async ({ entry, parcel }) => {
      const attempts = [];
      let lastError = null;
      const variants = buildingParcelQueryVariants(parcel).slice(0, BUILDING_SCOPE_DIRECT_TITLE_MAX_VARIANTS);
      for (const variant of variants) {
        try {
          const data = await fetchPublicDataJson(
            BUILDING_HUB_TITLE_URL,
            { ...variant.params, numOfRows: BUILDING_HUB_PAGE_SIZE, pageNo: 1 },
            env,
            "Building HUB direct scope title V56",
            BUILDING_SCOPE_DIRECT_TITLE_TIMEOUT_MS,
            1
          );
          const page = publicDataResponseParts(data, "Building HUB direct scope title V56");
          attempts.push({ variant: variant.name, rowCount: page.items.length, totalCount: page.totalCount, error: null });
          if (page.items.length) {
            return {
              parcel,
              rows: page.items.map((row) => ({
                ...row,
                __scopeParcelKeyV20: parcel.key,
                __scopeParcelMatchAddressV20: entry?.matchedAddress || null,
              })),
              attempts,
              error: null,
            };
          }
        } catch (error) {
          lastError = error;
          attempts.push({ variant: variant.name, rowCount: 0, totalCount: 0, error: String(error?.message || error) });
        }
      }
      return { parcel, rows: [], attempts, error: lastError ? String(lastError?.message || lastError) : null };
    }
  );

  const allResults = [...cachedResults, ...liveResults];
  const rows = [];
  let matchedParcelCount = 0;
  let failedParcelCount = 0;
  for (const result of allResults) {
    diagnostics.push({
      source: result.cached ? "SCOPE_PARCEL_TITLE_CACHE_V56" : "SCOPE_PARCEL_DIRECT_TITLE_V56",
      parcelKey: result.parcel?.key || null,
      status: result.rows.length ? "ok" : (result.error ? "error" : "empty"),
      itemCount: result.rows.length,
      attempts: result.attempts,
      error: result.error,
    });
    if (result.rows.length) {
      matchedParcelCount += 1;
      rows.push(...result.rows);
    } else if (result.error) failedParcelCount += 1;
  }

  const cacheWrites = liveResults
    .filter((result) => !result.error && result?.parcel?.key)
    .map((result) => v56RawCacheRow({
      sourceType: "TITLE_PARCEL_V56",
      regionKey: v56RegionKeyFromParcel(result.parcel),
      parcelKey: result.parcel.key,
      identity: result.parcel.key,
      payload: { rows: result.rows || [] },
      days: BUILDING_V56_TITLE_PARCEL_CACHE_DAYS,
    }));
  if (cacheWrites.length) await v56UpsertRawCacheRows(env, cacheWrites);

  const accumulatedEvidence = [
    ...priorEvidence,
    ...allResults.map(scopeTitleEvidenceFromResultV29).filter(Boolean),
  ].slice(0, BUILDING_SCOPE_DIRECT_TITLE_EVIDENCE_MAX);
  const accumulatedRows = dedupeBuildingRecords([...priorRows, ...rows]);

  return {
    rows: accumulatedRows,
    requestedParcelCount: targets.length,
    matchedParcelCount,
    failedParcelCount,
    continuation: {
      required: deferredTargets.length > 0,
      processedParcelCount: accumulatedEvidence.length,
      batchParcelCount: targets.length,
      remainingParcelCount: deferredTargets.length,
      totalDirectParcelCount: accumulatedEvidence.length + deferredTargets.length,
      evidence: accumulatedEvidence,
    },
  };
}

function unitParentManagementKey(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "mgmUpperBldrgstPk",
      "mgm_upper_bldrgst_pk",
      "upperMgmBldrgstPk",
      "upper_mgm_bldrgst_pk",
      "mgmUpBldrgstPk",
      "mgm_up_bldrgst_pk",
      // 건축HUB PK 전환 이후 일부 전유부 응답은 상위 PK 별칭이 비고
      // mgmBldrgstPk가 표제부 관리 PK와 직접 일치하는 형태로 내려온다.
      // 실제 표제부 인덱스에 존재할 때만 사용하므로 안전한 fallback이다.
      "mgmBldrgstPk",
      "mgm_bldrgst_pk"
    )
  );
}

function unitHoName(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "hoNm",
      "ho_nm",
      "hoNo",
      "ho_no",
      "unitNm",
      "unit_name",
      "unitNo",
      "unit_no"
    )
  );
}

function unitDongName(row) {
  return cleanBuildingText(
    publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
  );
}

function unitFloorName(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "flrNoNm",
      "flr_no_nm",
      "flrNo",
      "flr_no",
      "flrGbCdNm",
      "floorNm",
      "floor_no"
    )
  );
}

function unitUseText(row) {
  return [
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm"),
    publicDataField(row, "etcPurps", "etc_purps"),
    publicDataField(row, "floorUseV65", "floor_use_v65", "__v65FloorUse"),
    publicDataField(row, "exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
    publicDataField(row, "regstrKindCdNm", "regstr_kind_cd_nm"),
  ].map(cleanBuildingText).filter(Boolean).join(" ");
}

function isCommonAreaUnitRecord(row) {
  const text = unitUseText(row).replace(/\s+/g, "");
  return (
    /공용/.test(text) ||
    /복도|계단|승강기홀|엘리베이터홀|기계실|전기실|주차장|주차시설|저수조|관리사무소|경비실|옥탑|공조실|창고\(공용\)/.test(text)
  );
}

// V40: 표제부의 승강기 수가 0/미기재여도 건축HUB의 전유공용/층별개요에
// 승강기·엘리베이터 시설이 실제로 등재되어 있으면 단순 층수 추정이 아니라
// 등록 시설의 직접 증거로 취급한다. 과거의 광범위한 층수 기반 추정은 되살리지 않는다.
function hasRegisteredElevatorFacilityEvidence(row) {
  if (!row || typeof row !== "object") return false;
  const text = [
    unitUseText(row),
    floorOverviewUseText(row),
    publicDataField(row, "etcPurps", "etc_purps"),
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm"),
    publicDataField(row, "exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
  ].map(cleanBuildingText).filter(Boolean).join(" ").replace(/\s+/g, "");

  if (!text || /승강기없음|엘리베이터없음/.test(text)) return false;
  return /승강기|엘리베이터/.test(text);
}

function elevatorFacilityRowsForBuilding(
  evidenceRows,
  parentRow,
  parcel,
  indexes,
  parcelMatches
) {
  const rows = (Array.isArray(evidenceRows) ? evidenceRows : [])
    .filter(hasRegisteredElevatorFacilityEvidence);
  if (!rows.length || !parentRow) return [];

  const parentKey = buildingRecordKey(parentRow);
  const out = [];

  for (const row of rows) {
    const match = findParentTitleMatch(row, parcel, indexes);
    if (match?.row) {
      const matchKey = buildingRecordKey(match.row);
      if (parentKey && matchKey && matchKey === parentKey) out.push(row);
      continue;
    }

    // 같은 필지의 표제부가 하나뿐이면 시설행도 그 건물에 안전하게 귀속한다.
    if ((parcelMatches || []).length === 1) out.push(row);
  }

  return out;
}

function normalizeDeliveryUnitName(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/호$/g, "")
    .replace(/[^0-9A-Z가-힣_-]/g, "");
}

function unitRecordKey(row, parcelKey = "") {
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const ho = normalizeDeliveryUnitName(unitHoName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const buildingName = normalizeDeliveryUnitName(
    publicDataField(row, "bldNm", "bld_nm") ?? ""
  );

  // 가장 안정적인 배송 단위는 필지 + 동 + 호명칭이다.
  if (ho) {
    return [
      parcelKey,
      dong || buildingName || "DONG",
      !dong ? (floor || "FLOOR") : "",
      ho,
    ].join("|");
  }

  // 구형 전유부는 호명칭이 비어도 전유부 자체 관리 PK가 행마다 고유할 수 있다.
  const registerPk = cleanBuildingText(
    publicDataField(
      row,
      "mgmHoDetlPk",
      "mgm_ho_detl_pk",
      "mgmExposPubuseAreaPk",
      "mgm_expos_pubuse_area_pk",
      "mgmExposPubusePk",
      "mgm_expos_pubuse_pk",
      "mgmBldrgstPk",
      "mgm_bldrgst_pk"
    )
  );

  return registerPk ? `${parcelKey}|pk:${registerPk}` : "";
}

function isExclusiveAreaUnitRecord(row) {
  if (!row || isCommonAreaUnitRecord(row)) return false;
  const division = cleanBuildingText(
    row?.exposPubuseGbCdNm ??
    row?.expos_pubuse_gb_cd_nm
  ).replace(/\s+/g, "");

  if (/공용/.test(division)) return false;
  if (/전유/.test(division)) return true;

  // 구형 대장에서 구분코드명이 비어도 호명칭과 전유 용도가 있으면 전유호로 본다.
  return !!unitHoName(row);
}

function normalizeFloorIdentityV29(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/지하/g, "B")
    .replace(/층/g, "")
    .replace(/^제/, "");
}

function classifyUnitFromFloorOverviewV29(unitRow, parentClassification, floorRows, parentRow, parcelMatches) {
  const unitFloor = normalizeFloorIdentityV29(unitFloorName(unitRow));
  if (!unitFloor || !parentRow) return null;
  const rows = floorRowsForTitleBuilding(floorRows || [], parentRow, parcelMatches || []);
  if (!rows.length) return null;

  const matched = rows.filter((row) => {
    const rowFloor = normalizeFloorIdentityV29(
      publicDataField(row, "flrNoNm", "flr_no_nm", "flrNo", "flr_no", "floorNm", "floor_no")
    );
    return rowFloor && rowFloor === unitFloor;
  });
  if (!matched.length) return null;

  const types = new Set(
    matched
      .map((row) => classifyFloorOverview(row, parentClassification))
      .filter((type) => type === "residential" || type === "commercial")
  );
  return types.size === 1 ? [...types][0] : null;
}

function classifyDeliveryUnit(unitRow, parentClassification, context = {}) {
  const unitText = unitUseText(unitRow).replace(/\s+/g, "");

  if (/오피스텔|아파트|공동주택|연립주택|다세대주택|단독주택|다가구주택|다중주택|도시형생활주택|기숙사|주택/.test(unitText)) {
    return "residential";
  }

  const specificCommercial = /근린생활시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설/.test(unitText);
  if (specificCommercial) return "commercial";

  if (/업무시설/.test(unitText)) {
    if (parentClassification?.officetel) return "residential";
    return "commercial";
  }

  // V29: 혼합건물에서 전유부 용도가 비어도 층별개요의 동일 층 용도가 있으면
  // 그 값을 우선 사용한다. V28의 대량 '용도 미분류'를 줄이는 핵심 보정이다.
  const floorType = classifyUnitFromFloorOverviewV29(
    unitRow,
    parentClassification,
    context?.floorRows || [],
    context?.parentRow || null,
    context?.parcelMatches || []
  );
  if (floorType) return floorType;

  // 오피스텔 부모인데 개별 전유부 용도만 비어 있는 경우 주거 전유호가 대부분이다.
  // 단, 1층 등 층별개요에서 상업으로 확인되면 위에서 이미 commercial로 분류된다.
  if (parentClassification?.officetel) return "residential";
  if (parentClassification?.mixedUse) return 
```

## remainingParcelCount #2

```js
: String(error?.message || error || "failed"),
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
      addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
      verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
      kaptMatchesV51: group.kaptMatchesV51 || [],
      areaRows: [],
      exposRows: [],
      recapRows: [],
      housePriceRows: [],
      floorRows: [],
      sourceComplete: true,
      queryDiagnostics: {
        optimized: true,
        skippedReason: reason,
      },
    });
  }

  const accumulatedDetailEvidence = [
    ...priorDetailEvidence,
    ...selectedResults
      .map(buildingDetailEvidenceFromResult)
      .filter(Boolean),
  ].slice(0, BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE);

  return {
    complete,
    detailContinuation: {
      required: deferredCandidates.length > 0,
      processedParcelCount: accumulatedDetailEvidence.length,
      batchParcelCount: selectedResults.length,
      remainingParcelCount: deferredCandidates.length,
      totalDetailParcelCount: accumulatedDetailEvidence.length + deferredCandidates.length,
      evidence: accumulatedDetailEvidence,
    },
    warnings,
    diagnosticsV51: {
      verifiedScopeParcelCount: verifiedScopeMapV51.size,
      detailScopeOnlyParcelCount: parcelGroups.filter((group) => group.addedFromVerifiedScopeV51 && !(group.titleMatches || []).length).length,
      detailKaptAddedParcelCount: parcelGroups.filter((group) => group.addedFromKaptScopeV48).length,
      recapRequestedParcelCount: selectedResults.filter((row) => !row?.queryDiagnostics?.recap?.skippedReason).length,
    },
    bulkDiagnostics: {
      complete: true,
      skipped: true,
      mode: "V29_DIRECT_PARCEL_ONLY",
      reason: "법정동 bulk 전유부가 10/757처럼 잘리는 지역에서 과소집계를 방지하기 위해 사용하지 않음",
      areaCoverage: null,
      area: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
      expos: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
    },
    parcels: parcelGroups.map((group) =>
      resultByKey.get(group.parcel.key) || {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        areaRows: [],
        exposRows: [],
        recapRows: [],
        housePriceRows: [],
        floorRows: [],
        sourceComplete: true,
        queryDiagnostics: {
          optimized: true,
          skippedReason: "no_result_v29",
        },
      }
    ),
  };
}

function titleRowIndexes(matchedBuildingRows) {
  const byManagementKey = new Map();
  const byParcelKey = new Map();

  for (const match of matchedBuildingRows || []) {
    const row = match.row;
    const mgmKey = cleanBuildingText(row?.mgmBldrgstPk ?? row?.mgm_bldrgst_pk);
    if (mgmKey) byManagementKey.set(mgmKey, match);

    const parcel = buildingParcelDescriptor(row);
    if (parcel) {
      if (!byParcelKey.has(parcel.key)) byParcelKey.set(parcel.key, []);
      byParcelKey.get(parcel.key).push(match);
    }
  }

  return { byManagementKey, byParcelKey };
}

function normalizeBuildingDongMatchKey(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^제(?=\d)/, "")
    .replace(/동$/, "");
}

function findParentTitleMatch(unitRow, parcel, indexes) {
  const parentKey = unitParentManagementKey(unitRow);
  if (parentKey && indexes.byManagementKey.has(parentKey)) {
    return indexes.byManagementKey.get(parentKey);
  }

  const candidates = indexes.byParcelKey.get(parcel.key) || [];
  if (!candidates.length) return null;

  const unitDong = normalizeBuildingDongMatchKey(unitDongName(unitRow));
  if (unitDong) {
    const dongMatches = candidates.filter((match) =>
      normalizeBuildingDongMatchKey(match.row?.dongNm ?? match.row?.dong_nm) === unitDong
    );
    if (dongMatches.length === 1) return dongMatches[0];
  }

  const unitBuildingName = normalizeDeliveryUnitName(
    publicDataField(unitRow, "bldNm", "bld_nm") ?? ""
  );
  if (unitBuildingName) {
    const nameMatches = candidates.filter((match) =>
      normalizeDeliveryUnitName(match.row?.bldNm ?? match.row?.bld_nm) === unitBuildingName
    );
    if (nameMatches.length === 1) return nameMatches[0];
  }

  // 같은 필지에 표제부가 하나뿐이면 안전하게 연결한다. 여러 건물이 있는
  // 필지에서 무조건 첫 번째 건물에 연결하면 모든 전유호가 한 건물로 몰리고
  // 나머지 건물의 호수가 통째로 사라진다.
  return candidates.length === 1 ? candidates[0] : null;
}

function addUnitToElevatorTotals(totals, unitType, elevatorCategory, units) {
  const count = Math.max(0, Math.trunc(Number(units) || 0));
  if (!count) return;

  if (elevatorCategory === "confirmed") {
    totals.confirmedElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialElevatorUnitCount += count;
    return;
  }

  if (elevatorCategory === "inferred") {
    // V36 compatibility guard: 과거/혼합 경로에서 inferred가 들어와도
    // 엘베 O로 합산하지 않고 미확인으로 처리한다.
    totals.unknownElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialUnknownElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialUnknownElevatorUnitCount += count;
    return;
  }

  if (elevatorCategory === "none") {
    totals.noElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialNoElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialNoElevatorUnitCount += count;
    return;
  }

  totals.unknownElevatorUnitCount += count;
  if (unitType === "residential") totals.residentialUnknownElevatorUnitCount += count;
  if (unitType === "commercial") totals.commercialUnknownElevatorUnitCount += count;
}

function buildingLocalMeters(lng, lat, refLng, refLat) {
  const latRad = Number(refLat) * Math.PI / 180;
  return {
    x: (Number(lng) - Number(refLng)) * 111320 * Math.cos(latRad),
    y: (Number(lat) - Number(refLat)) * 110540,
  };
}

function buildingPointToSegmentDistanceMeters(
  pointLng,
  pointLat,
  aLng,
  aLat,
  bLng,
  bLat
) {
  const a = buildingLocalMeters(aLng, aLat, pointLng, pointLat);
  const b = buildingLocalMeters(bLng, bLat, pointLng, pointLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!Number.isFinite(lengthSquared) || lengthSquared <= 1e-12) {
    return Math.hypot(a.x, a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)
  );

  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function buildingDistanceToRingMeters(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return Infinity;

  let minDistance = Infinity;

  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];

    if (
      !Array.isArray(current) ||
      current.length < 2 ||
      !Array.isArray(next) ||
      next.length < 2
    ) {
      continue;
    }

    const distance = buildingPointToSegmentDistanceMeters(
      lng,
      lat,
      Number(current[0]),
      Number(current[1]),
      Number(next[0]),
      Number(next[1])
    );

    if (Number.isFinite(distance) && distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

function buildingDistanceToGeometryMeters(lng, lat, geometry) {
  if (!geometry || typeof geometry !== "object") return Infinity;

  if (pointInBuildingGeometry(lng, lat, geometry)) return 0;

  let minDistance = Infinity;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  for (const polygon of polygons || []) {
    for (const ring of polygon 
```

## remainingParcelCount #3

```js
ecordCount: prepared.sourceRecordCount,
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
          name: row.name || null,
          address: row.address || null,
          households: row.households || 0,
          householdsSource: row.householdsSource || null,
          elevatorCount: row.elevatorCount || 0,
          buildingCount: row.buildingCount || 0,
          scopeTitleKey: row.scopeTitleKey || null,
          scopeParcelKey: row.scopeParcelKey || null,
          scopeMatchReason: row.scopeMatchReason || null,
          scopeMatchScore: Number(row.scopeMatchScore || 0),
          lat: finiteNumberOrNull(row?.location?.lat),
          lng: finiteNumberOrNull(row?.location?.lng),
          diagnostics: row.diagnostics || null,
        })),
      },
      source: {
        matchedParcels: unitSource.parcels.length,
        unitSourceComplete: unitSource.complete,
        warnings: unitSource.warnings,
        unitDiagnostics,
        bulkExclusive: unitSource.bulkDiagnostics || null,
        parcelQueries: unitSource.parcels.map((parcelResult) => ({
          parcelKey: parcelResult.parcel?.key || null,
          addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
          addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
          areaRows: (parcelResult.areaRows || []).length,
          exposRows: (parcelResult.exposRows || []).length,
          floorRows: (parcelResult.floorRows || []).length,
          recapRows: (parcelResult.recapRows || []).length,
          housePriceRows: (parcelResult.housePriceRows || []).length,
          queries: parcelResult.queryDiagnostics || null,
        })),
      },
      topContributors,
    },
  };
}



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
        hhldCnt: nonNegativeBuildingInteger(row?.hhldCnt ?? row?.hhld_cnt),
        fmlyCnt: nonNegativeBuildingInteger(row?.fmlyCnt ?? row?.fmly_cnt),
        hoCnt: nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt),
        floors: buildingGroundFloorCount(row),
      },
    });
  };

  for (const [parcelKey, items] of parcelGroups) {
    const unique = [];
    const seen = new Set();

    for (const item of items) {
      const identity = titleFallbackIdentity(item.row, item.index);
      if (seen.has(identity)) continue;
      seen.add(identity);
      unique.push({ ...item, identity });
    }

    const apartmentRows = [];
    const otherRows = [];

    for (const item of unique) {
      const classification = buildingHousingClassification(ite
```

## remainingParcelCount #4

```js
uildingCount,
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
          name: row.name || null,
          address: row.address || null,
          households: row.households || 0,
          householdsSource: row.householdsSource || null,
          elevatorCount: row.elevatorCount || 0,
          buildingCount: row.buildingCount || 0,
          scopeTitleKey: row.scopeTitleKey || null,
          scopeParcelKey: row.scopeParcelKey || null,
          scopeMatchReason: row.scopeMatchReason || null,
          scopeMatchScore: Number(row.scopeMatchScore || 0),
          lat: finiteNumberOrNull(row?.location?.lat),
          lng: finiteNumberOrNull(row?.location?.lng),
          diagnostics: row.diagnostics || null,
        })),
      },
      source: {
        matchedParcels: unitSource.parcels.length,
        unitSourceComplete: unitSource.complete,
        warnings: unitSource.warnings,
        unitDiagnostics,
        bulkExclusive: unitSource.bulkDiagnostics || null,
        parcelQueries: unitSource.parcels.map((parcelResult) => ({
          parcelKey: parcelResult.parcel?.key || null,
          addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
          addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
          areaRows: (parcelResult.areaRows || []).length,
          exposRows: (parcelResult.exposRows || []).length,
          floorRows: (parcelResult.floorRows || []).length,
          recapRows: (parcelResult.recapRows || []).length,
          housePriceRows: (parcelResult.housePriceRows || []).length,
          queries: parcelResult.queryDiagnostics || null,
        })),
      },
      topContributors,
    },
  };
}



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
        hhldCnt: nonNegativeBuildingInteger(row?.hhldCnt ?? row?.hhld_cnt),
        fmlyCnt: nonNegativeBuildingInteger(row?.fmlyCnt ?? row?.fmly_cnt),
        hoCnt: nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt),
        floors: buildingGroundFloorCount(row),
      },
    });
  };

  for (const [parcelKey, items] of parcelGroups) {
    const unique = [];
    const seen = new Set();

    for (const item of items) {
      const identity = titleFallbackIdentity(item.row, item.index);
      if (seen.has(identity)) continue;
      seen.add(identity);
      unique.push({ ...item, identity });
    }

    const apartmentRows = [];
    const otherRows = [];

    for (const item of unique) {
      const classification = buildingHousingClassification(item.row);
      const units = buildingTitleUnitFallbac
```

## remainingParcelCount #5

```js
     reason: match.reason,
      })),
    },
    elevator: {
      unitCounts: {
        confirmed: aggregate.confirmedElevatorUnitCount,
        inferred: 0,
        none: aggregate.noElevatorUnitCount,
        unknown: aggregate.unknownElevatorUnitCount,
      },
      buildingCounts: {
        confirmed: aggregate.elevatorBuildingCount,
        inferred: 0,
        none: aggregate.noElevatorBuildingCount,
        unknown: aggregate.unknownElevatorBuildingCount,
      },
      inferencePolicy: {
        enabled: false,
        sameParcelPropagation: false,
      },
    },
    contributions,
    dataQuality: {
      deliveryUnitCount: aggregate.deliveryUnitCount,
      matchedBuildingCount: aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
    },
  };
  return aggregate;
}

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
  row.unit_analysis_method = "V66_DETERMINISTIC_PARC
```

## remainingParcelCount #6

```js
hanDetailUnits: orphanDetailUnits.length,
    },
  };
  return aggregate;
}

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
  const zipcode = (url.se
```

## remainingParcelCount #7

```js
9, `필지 탐색 밀도가 부족합니다 (${discoverySampleCount}/${minimumDenseSamples}). 최신 프론트로 새로고침 후 다시 분석해 주세요.`);
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
          buildingStatsVersion: BUILDIN
```

## remainingParcelCount #8

```js
egalDongCodes = [...new Set([...verifiedScopeParcels.map.keys()].map((key) => v60RegionKeyFromParcelKey(key)).filter(Boolean))];
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
          kaptTimeoutM
```

## processedParcelCount #1

```js
t allPendingTargets = [];
  for (const entry of scopeMap.values()) {
    const parcel = scopeParcelDescriptorFromEntryV20(entry);
    if (!parcel) continue;
    if (priorEvidenceMap.has(parcel.key)) continue;
    const alreadyMatched = [...verifiedScopeParcelAliasKeysV20(entry)]
      .some((alias) => existingAliases.has(alias));
    if (alreadyMatched) continue;
    allPendingTargets.push({ entry, parcel });
  }

  // Region 단위로 raw title parcel cache를 한 번만 읽는다.
  const cacheIndex = new Map();
  const regionKeys = [...new Set(allPendingTargets.map((item) => v56RegionKeyFromParcel(item.parcel)).filter(Boolean))];
  for (const regionKey of regionKeys) {
    const loaded = await v56FetchRawCacheRows(env, regionKey, "TITLE_PARCEL_V56");
    for (const row of loaded.rows || []) {
      const key = String(row?.cache_key || "").trim();
      if (key) cacheIndex.set(key, row);
    }
  }

  const cachedResults = [];
  const livePendingTargets = [];
  for (const item of allPendingTargets) {
    const cacheKey = v56RawCacheKey("TITLE_PARCEL_V56", item.parcel.key);
    const cached = cacheIndex.get(cacheKey);
    if (v56RawCacheFresh(cached) && cached?.payload && Array.isArray(cached.payload.rows)) {
      const tagged = cached.payload.rows.map((row) => ({
        ...row,
        __scopeParcelKeyV20: item.parcel.key,
        __scopeParcelMatchAddressV20: item.entry?.matchedAddress || null,
      }));
      cachedResults.push({ parcel: item.parcel, rows: tagged, attempts: [{ name: "raw_cache_v56", rowCount: tagged.length }], error: null, cached: true });
    } else {
      livePendingTargets.push(item);
    }
  }

  const targets = livePendingTargets.slice(0, BUILDING_SCOPE_DIRECT_TITLE_MAX_PARCELS);
  const deferredTargets = livePendingTargets.slice(BUILDING_SCOPE_DIRECT_TITLE_MAX_PARCELS);
  const liveResults = await mapBuildingWithConcurrency(
    targets,
    BUILDING_SCOPE_DIRECT_TITLE_CONCURRENCY,
    async ({ entry, parcel }) => {
      const attempts = [];
      let lastError = null;
      const variants = buildingParcelQueryVariants(parcel).slice(0, BUILDING_SCOPE_DIRECT_TITLE_MAX_VARIANTS);
      for (const variant of variants) {
        try {
          const data = await fetchPublicDataJson(
            BUILDING_HUB_TITLE_URL,
            { ...variant.params, numOfRows: BUILDING_HUB_PAGE_SIZE, pageNo: 1 },
            env,
            "Building HUB direct scope title V56",
            BUILDING_SCOPE_DIRECT_TITLE_TIMEOUT_MS,
            1
          );
          const page = publicDataResponseParts(data, "Building HUB direct scope title V56");
          attempts.push({ variant: variant.name, rowCount: page.items.length, totalCount: page.totalCount, error: null });
          if (page.items.length) {
            return {
              parcel,
              rows: page.items.map((row) => ({
                ...row,
                __scopeParcelKeyV20: parcel.key,
                __scopeParcelMatchAddressV20: entry?.matchedAddress || null,
              })),
              attempts,
              error: null,
            };
          }
        } catch (error) {
          lastError = error;
          attempts.push({ variant: variant.name, rowCount: 0, totalCount: 0, error: String(error?.message || error) });
        }
      }
      return { parcel, rows: [], attempts, error: lastError ? String(lastError?.message || lastError) : null };
    }
  );

  const allResults = [...cachedResults, ...liveResults];
  const rows = [];
  let matchedParcelCount = 0;
  let failedParcelCount = 0;
  for (const result of allResults) {
    diagnostics.push({
      source: result.cached ? "SCOPE_PARCEL_TITLE_CACHE_V56" : "SCOPE_PARCEL_DIRECT_TITLE_V56",
      parcelKey: result.parcel?.key || null,
      status: result.rows.length ? "ok" : (result.error ? "error" : "empty"),
      itemCount: result.rows.length,
      attempts: result.attempts,
      error: result.error,
    });
    if (result.rows.length) {
      matchedParcelCount += 1;
      rows.push(...result.rows);
    } else if (result.error) failedParcelCount += 1;
  }

  const cacheWrites = liveResults
    .filter((result) => !result.error && result?.parcel?.key)
    .map((result) => v56RawCacheRow({
      sourceType: "TITLE_PARCEL_V56",
      regionKey: v56RegionKeyFromParcel(result.parcel),
      parcelKey: result.parcel.key,
      identity: result.parcel.key,
      payload: { rows: result.rows || [] },
      days: BUILDING_V56_TITLE_PARCEL_CACHE_DAYS,
    }));
  if (cacheWrites.length) await v56UpsertRawCacheRows(env, cacheWrites);

  const accumulatedEvidence = [
    ...priorEvidence,
    ...allResults.map(scopeTitleEvidenceFromResultV29).filter(Boolean),
  ].slice(0, BUILDING_SCOPE_DIRECT_TITLE_EVIDENCE_MAX);
  const accumulatedRows = dedupeBuildingRecords([...priorRows, ...rows]);

  return {
    rows: accumulatedRows,
    requestedParcelCount: targets.length,
    matchedParcelCount,
    failedParcelCount,
    continuation: {
      required: deferredTargets.length > 0,
      processedParcelCount: accumulatedEvidence.length,
      batchParcelCount: targets.length,
      remainingParcelCount: deferredTargets.length,
      totalDirectParcelCount: accumulatedEvidence.length + deferredTargets.length,
      evidence: accumulatedEvidence,
    },
  };
}

function unitParentManagementKey(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "mgmUpperBldrgstPk",
      "mgm_upper_bldrgst_pk",
      "upperMgmBldrgstPk",
      "upper_mgm_bldrgst_pk",
      "mgmUpBldrgstPk",
      "mgm_up_bldrgst_pk",
      // 건축HUB PK 전환 이후 일부 전유부 응답은 상위 PK 별칭이 비고
      // mgmBldrgstPk가 표제부 관리 PK와 직접 일치하는 형태로 내려온다.
      // 실제 표제부 인덱스에 존재할 때만 사용하므로 안전한 fallback이다.
      "mgmBldrgstPk",
      "mgm_bldrgst_pk"
    )
  );
}

function unitHoName(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "hoNm",
      "ho_nm",
      "hoNo",
      "ho_no",
      "unitNm",
      "unit_name",
      "unitNo",
      "unit_no"
    )
  );
}

function unitDongName(row) {
  return cleanBuildingText(
    publicDataField(row, "dongNm", "dong_nm", "dongName", "dong_name")
  );
}

function unitFloorName(row) {
  return cleanBuildingText(
    publicDataField(
      row,
      "flrNoNm",
      "flr_no_nm",
      "flrNo",
      "flr_no",
      "flrGbCdNm",
      "floorNm",
      "floor_no"
    )
  );
}

function unitUseText(row) {
  return [
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm"),
    publicDataField(row, "etcPurps", "etc_purps"),
    publicDataField(row, "floorUseV65", "floor_use_v65", "__v65FloorUse"),
    publicDataField(row, "exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
    publicDataField(row, "regstrKindCdNm", "regstr_kind_cd_nm"),
  ].map(cleanBuildingText).filter(Boolean).join(" ");
}

function isCommonAreaUnitRecord(row) {
  const text = unitUseText(row).replace(/\s+/g, "");
  return (
    /공용/.test(text) ||
    /복도|계단|승강기홀|엘리베이터홀|기계실|전기실|주차장|주차시설|저수조|관리사무소|경비실|옥탑|공조실|창고\(공용\)/.test(text)
  );
}

// V40: 표제부의 승강기 수가 0/미기재여도 건축HUB의 전유공용/층별개요에
// 승강기·엘리베이터 시설이 실제로 등재되어 있으면 단순 층수 추정이 아니라
// 등록 시설의 직접 증거로 취급한다. 과거의 광범위한 층수 기반 추정은 되살리지 않는다.
function hasRegisteredElevatorFacilityEvidence(row) {
  if (!row || typeof row !== "object") return false;
  const text = [
    unitUseText(row),
    floorOverviewUseText(row),
    publicDataField(row, "etcPurps", "etc_purps"),
    publicDataField(row, "mainPurpsCdNm", "main_purps_cd_nm"),
    publicDataField(row, "exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"),
  ].map(cleanBuildingText).filter(Boolean).join(" ").replace(/\s+/g, "");

  if (!text || /승강기없음|엘리베이터없음/.test(text)) return false;
  return /승강기|엘리베이터/.test(text);
}

function elevatorFacilityRowsForBuilding(
  evidenceRows,
  parentRow,
  parcel,
  indexes,
  parcelMatches
) {
  const rows = (Array.isArray(evidenceRows) ? evidenceRows : [])
    .filter(hasRegisteredElevatorFacilityEvidence);
  if (!rows.length || !parentRow) return [];

  const parentKey = buildingRecordKey(parentRow);
  const out = [];

  for (const row of rows) {
    const match = findParentTitleMatch(row, parcel, indexes);
    if (match?.row) {
      const matchKey = buildingRecordKey(match.row);
      if (parentKey && matchKey && matchKey === parentKey) out.push(row);
      continue;
    }

    // 같은 필지의 표제부가 하나뿐이면 시설행도 그 건물에 안전하게 귀속한다.
    if ((parcelMatches || []).length === 1) out.push(row);
  }

  return out;
}

function normalizeDeliveryUnitName(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/호$/g, "")
    .replace(/[^0-9A-Z가-힣_-]/g, "");
}

function unitRecordKey(row, parcelKey = "") {
  const dong = normalizeDeliveryUnitName(unitDongName(row));
  const ho = normalizeDeliveryUnitName(unitHoName(row));
  const floor = normalizeDeliveryUnitName(unitFloorName(row));
  const buildingName = normalizeDeliveryUnitName(
    publicDataField(row, "bldNm", "bld_nm") ?? ""
  );

  // 가장 안정적인 배송 단위는 필지 + 동 + 호명칭이다.
  if (ho) {
    return [
      parcelKey,
      dong || buildingName || "DONG",
      !dong ? (floor || "FLOOR") : "",
      ho,
    ].join("|");
  }

  // 구형 전유부는 호명칭이 비어도 전유부 자체 관리 PK가 행마다 고유할 수 있다.
  const registerPk = cleanBuildingText(
    publicDataField(
      row,
      "mgmHoDetlPk",
      "mgm_ho_detl_pk",
      "mgmExposPubuseAreaPk",
      "mgm_expos_pubuse_area_pk",
      "mgmExposPubusePk",
      "mgm_expos_pubuse_pk",
      "mgmBldrgstPk",
      "mgm_bldrgst_pk"
    )
  );

  return registerPk ? `${parcelKey}|pk:${registerPk}` : "";
}

function isExclusiveAreaUnitRecord(row) {
  if (!row || isCommonAreaUnitRecord(row)) return false;
  const division = cleanBuildingText(
    row?.exposPubuseGbCdNm ??
    row?.expos_pubuse_gb_cd_nm
  ).replace(/\s+/g, "");

  if (/공용/.test(division)) return false;
  if (/전유/.test(division)) return true;

  // 구형 대장에서 구분코드명이 비어도 호명칭과 전유 용도가 있으면 전유호로 본다.
  return !!unitHoName(row);
}

function normalizeFloorIdentityV29(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/지하/g, "B")
    .replace(/층/g, "")
    .replace(/^제/, "");
}

function classifyUnitFromFloorOverviewV29(unitRow, parentClassification, floorRows, parentRow, parcelMatches) {
  const unitFloor = normalizeFloorIdentityV29(unitFloorName(unitRow));
  if (!unitFloor || !parentRow) return null;
  const rows = floorRowsForTitleBuilding(floorRows || [], parentRow, parcelMatches || []);
  if (!rows.length) return null;

  const matched = rows.filter((row) => {
    const rowFloor = normalizeFloorIdentityV29(
      publicDataField(row, "flrNoNm", "flr_no_nm", "flrNo", "flr_no", "floorNm", "floor_no")
    );
    return rowFloor && rowFloor === unitFloor;
  });
  if (!matched.length) return null;

  const types = new Set(
    matched
      .map((row) => classifyFloorOverview(row, parentClassification))
      .filter((type) => type === "residential" || type === "commercial")
  );
  return types.size === 1 ? [...types][0] : null;
}

function classifyDeliveryUnit(unitRow, parentClassification, context = {}) {
  const unitText = unitUseText(unitRow).replace(/\s+/g, "");

  if (/오피스텔|아파트|공동주택|연립주택|다세대주택|단독주택|다가구주택|다중주택|도시형생활주택|기숙사|주택/.test(unitText)) {
    return "residential";
  }

  const specificCommercial = /근린생활시설|판매시설|사무소|상점|점포|소매점|음식점|휴게음식점|일반음식점|의료시설|병원|의원|약국|교육연구시설|학원|교습소|숙박시설|호텔|모텔|위락시설|문화및집회시설|운동시설|노유자시설|자동차관련시설|공장|창고시설|방송통신시설|종교시설|관광휴게시설/.test(unitText);
  if (specificCommercial) return "commercial";

  if (/업무시설/.test(unitText)) {
    if (parentClassification?.officetel) return "residential";
    return "commercial";
  }

  // V29: 혼합건물에서 전유부 용도가 비어도 층별개요의 동일 층 용도가 있으면
  // 그 값을 우선 사용한다. V28의 대량 '용도 미분류'를 줄이는 핵심 보정이다.
  const floorType = classifyUnitFromFloorOverviewV29(
    unitRow,
    parentClassification,
    context?.floorRows || [],
    context?.parentRow || null,
    context?.parcelMatches || []
  );
  if (floorType) return floorType;

  // 오피스텔 부모인데 개별 전유부 용도만 비어 있는 경우 주거 전유호가 대부분이다.
  // 단, 1층 등 층별개요에서 상업으로 확인되면 위에서 이미 commercial로 분류된다.
  if (pare
```

## processedParcelCount #2

```js
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
      addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
      verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
      kaptMatchesV51: group.kaptMatchesV51 || [],
      areaRows: [],
      exposRows: [],
      recapRows: [],
      housePriceRows: [],
      floorRows: [],
      sourceComplete: true,
      queryDiagnostics: {
        optimized: true,
        skippedReason: reason,
      },
    });
  }

  const accumulatedDetailEvidence = [
    ...priorDetailEvidence,
    ...selectedResults
      .map(buildingDetailEvidenceFromResult)
      .filter(Boolean),
  ].slice(0, BUILDING_STATS_MAX_DETAIL_CONTINUATION_EVIDENCE);

  return {
    complete,
    detailContinuation: {
      required: deferredCandidates.length > 0,
      processedParcelCount: accumulatedDetailEvidence.length,
      batchParcelCount: selectedResults.length,
      remainingParcelCount: deferredCandidates.length,
      totalDetailParcelCount: accumulatedDetailEvidence.length + deferredCandidates.length,
      evidence: accumulatedDetailEvidence,
    },
    warnings,
    diagnosticsV51: {
      verifiedScopeParcelCount: verifiedScopeMapV51.size,
      detailScopeOnlyParcelCount: parcelGroups.filter((group) => group.addedFromVerifiedScopeV51 && !(group.titleMatches || []).length).length,
      detailKaptAddedParcelCount: parcelGroups.filter((group) => group.addedFromKaptScopeV48).length,
      recapRequestedParcelCount: selectedResults.filter((row) => !row?.queryDiagnostics?.recap?.skippedReason).length,
    },
    bulkDiagnostics: {
      complete: true,
      skipped: true,
      mode: "V29_DIRECT_PARCEL_ONLY",
      reason: "법정동 bulk 전유부가 10/757처럼 잘리는 지역에서 과소집계를 방지하기 위해 사용하지 않음",
      areaCoverage: null,
      area: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
      expos: { complete: true, selectedLegalDongs: [], scannedRows: 0, matchedRows: 0, pages: [] },
    },
    parcels: parcelGroups.map((group) =>
      resultByKey.get(group.parcel.key) || {
        parcel: group.parcel,
        titleMatches: group.titleMatches,
        addedFromVerifiedScopeV51: group.addedFromVerifiedScopeV51 === true,
        addedFromKaptScopeV48: group.addedFromKaptScopeV48 === true,
        verifiedScopeEntryV51: group.verifiedScopeEntryV51 || null,
        kaptMatchesV51: group.kaptMatchesV51 || [],
        areaRows: [],
        exposRows: [],
        recapRows: [],
        housePriceRows: [],
        floorRows: [],
        sourceComplete: true,
        queryDiagnostics: {
          optimized: true,
          skippedReason: "no_result_v29",
        },
      }
    ),
  };
}

function titleRowIndexes(matchedBuildingRows) {
  const byManagementKey = new Map();
  const byParcelKey = new Map();

  for (const match of matchedBuildingRows || []) {
    const row = match.row;
    const mgmKey = cleanBuildingText(row?.mgmBldrgstPk ?? row?.mgm_bldrgst_pk);
    if (mgmKey) byManagementKey.set(mgmKey, match);

    const parcel = buildingParcelDescriptor(row);
    if (parcel) {
      if (!byParcelKey.has(parcel.key)) byParcelKey.set(parcel.key, []);
      byParcelKey.get(parcel.key).push(match);
    }
  }

  return { byManagementKey, byParcelKey };
}

function normalizeBuildingDongMatchKey(value) {
  return cleanBuildingText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^제(?=\d)/, "")
    .replace(/동$/, "");
}

function findParentTitleMatch(unitRow, parcel, indexes) {
  const parentKey = unitParentManagementKey(unitRow);
  if (parentKey && indexes.byManagementKey.has(parentKey)) {
    return indexes.byManagementKey.get(parentKey);
  }

  const candidates = indexes.byParcelKey.get(parcel.key) || [];
  if (!candidates.length) return null;

  const unitDong = normalizeBuildingDongMatchKey(unitDongName(unitRow));
  if (unitDong) {
    const dongMatches = candidates.filter((match) =>
      normalizeBuildingDongMatchKey(match.row?.dongNm ?? match.row?.dong_nm) === unitDong
    );
    if (dongMatches.length === 1) return dongMatches[0];
  }

  const unitBuildingName = normalizeDeliveryUnitName(
    publicDataField(unitRow, "bldNm", "bld_nm") ?? ""
  );
  if (unitBuildingName) {
    const nameMatches = candidates.filter((match) =>
      normalizeDeliveryUnitName(match.row?.bldNm ?? match.row?.bld_nm) === unitBuildingName
    );
    if (nameMatches.length === 1) return nameMatches[0];
  }

  // 같은 필지에 표제부가 하나뿐이면 안전하게 연결한다. 여러 건물이 있는
  // 필지에서 무조건 첫 번째 건물에 연결하면 모든 전유호가 한 건물로 몰리고
  // 나머지 건물의 호수가 통째로 사라진다.
  return candidates.length === 1 ? candidates[0] : null;
}

function addUnitToElevatorTotals(totals, unitType, elevatorCategory, units) {
  const count = Math.max(0, Math.trunc(Number(units) || 0));
  if (!count) return;

  if (elevatorCategory === "confirmed") {
    totals.confirmedElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialElevatorUnitCount += count;
    return;
  }

  if (elevatorCategory === "inferred") {
    // V36 compatibility guard: 과거/혼합 경로에서 inferred가 들어와도
    // 엘베 O로 합산하지 않고 미확인으로 처리한다.
    totals.unknownElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialUnknownElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialUnknownElevatorUnitCount += count;
    return;
  }

  if (elevatorCategory === "none") {
    totals.noElevatorUnitCount += count;
    if (unitType === "residential") totals.residentialNoElevatorUnitCount += count;
    if (unitType === "commercial") totals.commercialNoElevatorUnitCount += count;
    return;
  }

  totals.unknownElevatorUnitCount += count;
  if (unitType === "residential") totals.residentialUnknownElevatorUnitCount += count;
  if (unitType === "commercial") totals.commercialUnknownElevatorUnitCount += count;
}

function buildingLocalMeters(lng, lat, refLng, refLat) {
  const latRad = Number(refLat) * Math.PI / 180;
  return {
    x: (Number(lng) - Number(refLng)) * 111320 * Math.cos(latRad),
    y: (Number(lat) - Number(refLat)) * 110540,
  };
}

function buildingPointToSegmentDistanceMeters(
  pointLng,
  pointLat,
  aLng,
  aLat,
  bLng,
  bLat
) {
  const a = buildingLocalMeters(aLng, aLat, pointLng, pointLat);
  const b = buildingLocalMeters(bLng, bLat, pointLng, pointLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!Number.isFinite(lengthSquared) || lengthSquared <= 1e-12) {
    return Math.hypot(a.x, a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)
  );

  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function buildingDistanceToRingMeters(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return Infinity;

  let minDistance = Infinity;

  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];

    if (
      !Array.isArray(current) ||
      current.length < 2 ||
      !Array.isArray(next) ||
      next.length < 2
    ) {
      continue;
    }

    const distance = buildingPointToSegmentDistanceMeters(
      lng,
      lat,
      Number(current[0]),
      Number(current[1]),
      Number(next[0]),
      Number(next[1])
    );

    if (Number.isFinite(distance) && distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

function buildingDistanceToGeometryMeters(lng, lat, geometry) {
  if (!geometry || typeof geometry !== "object") return Infinity;

  if (pointInBuildingGeometry(lng, lat, geometry)) return 0;

  let minDistance = Infinity;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
     
```

## processedParcelCount #3

```js
UnitCount,
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
          name: row.name || null,
          address: row.address || null,
          households: row.households || 0,
          householdsSource: row.householdsSource || null,
          elevatorCount: row.elevatorCount || 0,
          buildingCount: row.buildingCount || 0,
          scopeTitleKey: row.scopeTitleKey || null,
          scopeParcelKey: row.scopeParcelKey || null,
          scopeMatchReason: row.scopeMatchReason || null,
          scopeMatchScore: Number(row.scopeMatchScore || 0),
          lat: finiteNumberOrNull(row?.location?.lat),
          lng: finiteNumberOrNull(row?.location?.lng),
          diagnostics: row.diagnostics || null,
        })),
      },
      source: {
        matchedParcels: unitSource.parcels.length,
        unitSourceComplete: unitSource.complete,
        warnings: unitSource.warnings,
        unitDiagnostics,
        bulkExclusive: unitSource.bulkDiagnostics || null,
        parcelQueries: unitSource.parcels.map((parcelResult) => ({
          parcelKey: parcelResult.parcel?.key || null,
          addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
          addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
          areaRows: (parcelResult.areaRows || []).length,
          exposRows: (parcelResult.exposRows || []).length,
          floorRows: (parcelResult.floorRows || []).length,
          recapRows: (parcelResult.recapRows || []).length,
          housePriceRows: (parcelResult.housePriceRows || []).length,
          queries: parcelResult.queryDiagnostics || null,
        })),
      },
      topContributors,
    },
  };
}



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
        hhldCnt: nonNegativeBuildingInteger(row?.hhldCnt ?? row?.hhld_cnt),
        fmlyCnt: nonNegativeBuildingInteger(row?.fmlyCnt ?? row?.fmly_cnt),
        hoCnt: nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt),
        floors: buildingGroundFloorCount(row),
      },
    });
  };

  for (const [parcelKey, items] of parcelGroups) {
    const unique = [];
    const seen = new Set();

    for (const item of items) {
      const identity = titleFallbackIdentity(item.row, item.index);
      if (seen.has(identity)) continue;
      seen.add(identity);
      unique.push({ ...
```

## processedParcelCount #4

```js
.commercialNoElevatorUnitCount,
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
          name: row.name || null,
          address: row.address || null,
          households: row.households || 0,
          householdsSource: row.householdsSource || null,
          elevatorCount: row.elevatorCount || 0,
          buildingCount: row.buildingCount || 0,
          scopeTitleKey: row.scopeTitleKey || null,
          scopeParcelKey: row.scopeParcelKey || null,
          scopeMatchReason: row.scopeMatchReason || null,
          scopeMatchScore: Number(row.scopeMatchScore || 0),
          lat: finiteNumberOrNull(row?.location?.lat),
          lng: finiteNumberOrNull(row?.location?.lng),
          diagnostics: row.diagnostics || null,
        })),
      },
      source: {
        matchedParcels: unitSource.parcels.length,
        unitSourceComplete: unitSource.complete,
        warnings: unitSource.warnings,
        unitDiagnostics,
        bulkExclusive: unitSource.bulkDiagnostics || null,
        parcelQueries: unitSource.parcels.map((parcelResult) => ({
          parcelKey: parcelResult.parcel?.key || null,
          addedFromVerifiedScopeV51: parcelResult.addedFromVerifiedScopeV51 === true,
          addedFromKaptScopeV48: parcelResult.addedFromKaptScopeV48 === true,
          areaRows: (parcelResult.areaRows || []).length,
          exposRows: (parcelResult.exposRows || []).length,
          floorRows: (parcelResult.floorRows || []).length,
          recapRows: (parcelResult.recapRows || []).length,
          housePriceRows: (parcelResult.housePriceRows || []).length,
          queries: parcelResult.queryDiagnostics || null,
        })),
      },
      topContributors,
    },
  };
}



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
        hhldCnt: nonNegativeBuildingInteger(row?.hhldCnt ?? row?.hhld_cnt),
        fmlyCnt: nonNegativeBuildingInteger(row?.fmlyCnt ?? row?.fmly_cnt),
        hoCnt: nonNegativeBuildingInteger(row?.hoCnt ?? row?.ho_cnt),
        floors: buildingGroundFloorCount(row),
      },
    });
  };

  for (const [parcelKey, items] of parcelGroups) {
    const unique = [];
    const seen = new Set();

    for (const item of items) {
      const identity = titleFallbackIdentity(item.row, item.index);
      if (seen.has(identity)) continue;
      seen.add(identity);
      unique.push({ ...item, identity });
    }

    const apartmentRows = 
```

## processedParcelCount #5

```js
,
        parcelKey: match.parcelKey,
        reason: match.reason,
      })),
    },
    elevator: {
      unitCounts: {
        confirmed: aggregate.confirmedElevatorUnitCount,
        inferred: 0,
        none: aggregate.noElevatorUnitCount,
        unknown: aggregate.unknownElevatorUnitCount,
      },
      buildingCounts: {
        confirmed: aggregate.elevatorBuildingCount,
        inferred: 0,
        none: aggregate.noElevatorBuildingCount,
        unknown: aggregate.unknownElevatorBuildingCount,
      },
      inferencePolicy: {
        enabled: false,
        sameParcelPropagation: false,
      },
    },
    contributions,
    dataQuality: {
      deliveryUnitCount: aggregate.deliveryUnitCount,
      matchedBuildingCount: aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
    },
  };
  return aggregate;
}

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
  row.unit_
```

## processedParcelCount #6

```js
aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
    },
  };
  return aggregate;
}

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
async function handleZipBoundar
```

## processedParcelCount #7

```js
mumDenseSamples) {
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
          terrainEndpoint: COPERNICUS_PROCESS_URL
```

## processedParcelCount #8

```js
alizeLegalDongCodes(body);
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
          buildingHubTimeoutMs: BUILDI
```

## detailParcel #1

```js
립주택|다세대주택|단독주택|다가구주택|다중주택|도시형생활주택|기숙사|주택/.test(use);
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
    if (classification.residential && !classification.commercial) retur
```

## detailParcel #2

```js
use);
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
    if (cla
```

## detailParcel #3

```js
dScopeParcels = normalizeVerifiedScopeParcels(rawScopeParcels, normalized.geometry, scope.zipcode);
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
        
```

## detailParcel #4

```js
 = body?.scopeParcelDiscovery ?? body?.scope_parcel_discovery ?? null;
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
      const
```

## pendingDetail

_not found_

## building_v60_detail_cache #1

```js
) {
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
    V60_DET
```

## loadV60Detail

_not found_

## fetchV60Detail

_not found_

## V65_DETAIL_CACHE_VERSION #1

```js
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

function v60Tit
```

## V65_DETAIL_CACHE_VERSION #2

```js
aptMatches) {
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
  const purpose = buildingPurposeText(row
```

## V65_DETAIL_CACHE_VERSION #3

```js
g, "");
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

```

## V65_DETAIL_CACHE_VERSION #4

```js
uildFloorClassIndex(floorRows);
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
    if (allKnownZero) return { status: "no", reason: "kapt_zero", elevatorCou
```

## V65_DETAIL_CACHE_VERSION #5

```js
eanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    const kaptParcelCovered = (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey);
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
    // V68: K-APT가 총세대수를 확정한 동일 필지에서 부모 연결 실패로 생긴
    // 아파트/미분류 전유호는 같은 세대를 다시 세는 것이므로 제외한다.
    // 명확한 상가 및 별도 비아파트 주거 전유호는 보존한다.
    if (kaptParcelCovered && (item.classification.apartment || bucket === "unclassified")) {
      continue;
    }
    addUnits({
      units: 1,
      bucket,
      apartment: item.classification.apartment,
      elevatorStatus: "unknown",
      buildingKey: `detail:${item.parcelKey}`,
      source: "DETAIL_ORPHAN_EXACT_UNIT",
      meta: {
        parcelKey: item.parcelKey,
        ho: unitHoName(item.row) || null,
        familyKey: v63TitleKaptFamilyKey(item.row) || null,
      },
    });
    aggregate.exclusiveUnitRecordCount += 1;
  }

  // V66: 주택인허가 "복리분양시설"의 명시적 개소수는 단지 전체의 비주거
  // 배송단위 하한으로 사용한다. 건축물대장에 이미 잡힌 같은 K-APT family 상가와
  // 단순 합산하지 않고 max(existing, permit explicit count)로 보정해 중복을 막는다.
  const housingPermitRescues = [];
  for (const evidence of housingPermitWelfareEvidence?.families || []) {
    const familyKey = cleanBuildingText(evidence?.familyKey);
    const permitCount = Math.max(0, Math.trunc(Number(evidence?.commercialCount) || 0));
    if (!familyKey || permitCount <= 0) continue;
    const existingCount = Math.max(0, Math.trunc(Number(commercialUnitsByKaptFamily.get(familyKey)) || 0));
    const rescueCount = Math.max(0, permitCount - existingCount);
    if (rescueCount > 0) {
      addUnits({
        units: rescueCount,
        bucket: "commercial",
        elevatorStatus: "unknown",
        buildingKey: `hspms:welfare:${familyKey}`,
        source: "HSPMS_WELFARE_LOTOUT_EXPLICIT_COUNT_RESCUE",
        familyKey,
        meta: {
          familyKey,
          permitExplicitCount: permitCount,
          existingRegistryCount: existingCount,
          parcelKeys: evidence.parcelKeys || [],
          complexNames: evidence.complexNames || [],
        },
      });
    }
    housingPermitRescues.push({
      familyKey,
      permitExplicitCount: permitCount,
      existingRegistryCount: existingCount,
      addedCount: rescueCount,
      welfareRowCount: evidence.welfareRowCount || 0,
      addressableWelfareRowCount: evidence.addressableWelfareRowCount || 0,
      managementRowCount: evidence.managementRowCount || 0,
      parcelKeys: evidence.parcelKeys || [],
      complexNames: evidence.complexNames || [],
      sampleRows: evidence.sampleRows || [],
    });
  }

  aggregate.deliveryUnitCount = aggregate.residentialUnitCount + aggregate.commercialUnitCount + aggregate.unclassifiedUnitCount;
  aggregate.matchedBuildingCount = buildingKeys.size;
  aggregate.residentialBuildingCount = residentialBuildingKeys.size;
  aggregate.geocodedBuildingCount = buildingKeys.size;
  aggregate.elevatorBuildingCount = elevatorBuildingKeys.size;
  aggregate.noElevatorBuildingCount = noElevatorBuildingKeys.size;
  aggregate.unknownElevatorBuildingCount = unknownElevatorBuildingKeys.size;
  aggregate.walkupBuildingCount = walkupBuildingKeys.size;
  aggregate.elevatorHouseholdCount = aggregate.residentialElevatorUnitCount;
  aggregate.noElevatorHouseholdCount = aggregate.residentialNoElevatorUnitCount;
  aggregate.unknownElevatorHouseholdCount = aggregate.residentialUnknownElevatorUnitCount;
  aggregate.mixedUseBuildingCount = mixedUseKeys.size;

  const titleRows = [...titleRowsByParcel.values()].flat();
  aggregate.sourceRecordCount = titleRows.length + areaRowsSeen + exposRowsSeen + (kaptMatches || []).length + (housingPermitWelfareEvidence?.welfareRowCount || 0);
  aggregate.breakdown = {
    algorithm: {
      version: BUILDING_STATS_SOURCE_VERSION,
      mode: "V66_HSPMS_WELFARE_RESCUE",
      rules: {
        areaBasedUnitEstimation: false,
        floorBasedUnitEstimation: false,
        sameParcelElevatorPropagation: false,
        kaptAppliesOnlyToMatchedApartment: true,
        mixedUseExplicitResidentialSplit: true,
        purposeExplicitResidentialCountFallback: true,
        denseScopeDiscoveryRequired: true,
        apartmentShopDetailFirst: true,
        apartmentShopDongNameOverride: true,
        kaptSplitComplexFamilyRescue: true,
        apartmentCommercialSiblingDetailRescue: true,
        detailAreaAndExposSourceMerge: true,
        completeExposPagination: true,
        floorOverviewCommercialClassification: true,
        housingPermitWelfareLotoutExplicitCountRescue: true,
        housingPermitManagementWelfareDiagnosticOnly: true,
        housingPermitCommercialReconciliation: "MAX_REGISTRY_OR_PERMIT_EXPLICIT_COUNT",
        detailCacheVersionMarker: V65_DETAIL_CACHE_VERSION,
        mainPurposeBucketFallback: true,
        nonCollectiveDetailLookupDisabled: true,
      },
      scope: {
        discoveredScopeParcels: verifiedScopeParcels.map.size,
        matchedTitleParcels: [...titleRowsByParcel.values()].filter((rows) => rows.length > 0).length,
        matchedBuildings: aggregate.matchedBuildingCount,
      },
    },
    source: {
      titleCache: titleDiagnostics,
      detailCache: detailDiagnostics,
      unitDiagnostics: {
        areaRows: areaRowsSeen,
        exposRows: exposRowsSeen,
        candidateUnits: aggregate.exclusiveUnitRecordCount,
        matchedParcels: verifiedScopeParcels.map.size,
        parentlessCandidates: orphanDetailUnits.length,
        kaptComplexes: (kaptMatches || []).length,
      },
    },
    housingPermitWelfare: {
      requestedFamilyCount: housingPermitWelfareEvidence?.requestedFamilyCount || 0,
      welfareRowCount: housingPermitWelfareEvidence?.welfareRowCount || 0,
      explicitCommercialCount: housingPermitWelfareEvidence?.explicitCommercialCount || 0,
      errors: housingPermitWelfareEvidence?.errors || [],
      diagnosticErrors: housingPermitWelfareEvidence?.diagnosticErrors || [],
      rescues: housingPermitRescues,
    },
    kapt: {
      complexCount: (kaptMatches || []).length,
      householdCount: (kaptMatches || []).reduce((sum, match) => sum + Math.max(0, Number(match.normalized?.households) || 0), 0),
      diagnostics: kaptDiagnostics,
      complexes: (kaptMatches || []).slice(0, 40).map((match) => ({
        kaptCode: match.kaptCode,
        name: match.normalized?.name || null,
        households: match.normalized?.households || 0,
        elevatorCount: match.normalized?.elevatorCount || 0,
        parcelKey: match.parcelKey,
        reason: match.reason,
      })),
    },
    elevator: {
      unitCounts: {
        confirmed: aggregate.confirmedElevatorUnitCount,
        inferred: 0,
        none: aggregate.noElevatorUnitCount,
        unknown: aggregate.unknownElevatorUnitCount,
      },
      buildingCounts: {
        confirmed: aggregate.elevatorBuildingCount,
        inferred: 0,
        none: aggregate.noElevatorBuildingCount,
        unknown: aggregate.unknownElevatorBuildingCount,
      },
      inferencePolicy: {
        enabled: false,
        sameParcelPropagation: false,
      },
    },
    contributions,
    dataQuality: {
      deliveryUnitCount: aggregate.deliveryUnitCount,
      matchedBuildingCount: aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
    },
  };
  return aggregate;
}

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
          regionKey: titleState.regionSync.region_key |
```

## nonCollectiveDetailLookupDisabled #1

```js
 },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    const kaptParcelCovered = (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey);
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
    // V68: K-APT가 총세대수를 확정한 동일 필지에서 부모 연결 실패로 생긴
    // 아파트/미분류 전유호는 같은 세대를 다시 세는 것이므로 제외한다.
    // 명확한 상가 및 별도 비아파트 주거 전유호는 보존한다.
    if (kaptParcelCovered && (item.classification.apartment || bucket === "unclassified")) {
      continue;
    }
    addUnits({
      units: 1,
      bucket,
      apartment: item.classification.apartment,
      elevatorStatus: "unknown",
      buildingKey: `detail:${item.parcelKey}`,
      source: "DETAIL_ORPHAN_EXACT_UNIT",
      meta: {
        parcelKey: item.parcelKey,
        ho: unitHoName(item.row) || null,
        familyKey: v63TitleKaptFamilyKey(item.row) || null,
      },
    });
    aggregate.exclusiveUnitRecordCount += 1;
  }

  // V66: 주택인허가 "복리분양시설"의 명시적 개소수는 단지 전체의 비주거
  // 배송단위 하한으로 사용한다. 건축물대장에 이미 잡힌 같은 K-APT family 상가와
  // 단순 합산하지 않고 max(existing, permit explicit count)로 보정해 중복을 막는다.
  const housingPermitRescues = [];
  for (const evidence of housingPermitWelfareEvidence?.families || []) {
    const familyKey = cleanBuildingText(evidence?.familyKey);
    const permitCount = Math.max(0, Math.trunc(Number(evidence?.commercialCount) || 0));
    if (!familyKey || permitCount <= 0) continue;
    const existingCount = Math.max(0, Math.trunc(Number(commercialUnitsByKaptFamily.get(familyKey)) || 0));
    const rescueCount = Math.max(0, permitCount - existingCount);
    if (rescueCount > 0) {
      addUnits({
        units: rescueCount,
        bucket: "commercial",
        elevatorStatus: "unknown",
        buildingKey: `hspms:welfare:${familyKey}`,
        source: "HSPMS_WELFARE_LOTOUT_EXPLICIT_COUNT_RESCUE",
        familyKey,
        meta: {
          familyKey,
          permitExplicitCount: permitCount,
          existingRegistryCount: existingCount,
          parcelKeys: evidence.parcelKeys || [],
          complexNames: evidence.complexNames || [],
        },
      });
    }
    housingPermitRescues.push({
      familyKey,
      permitExplicitCount: permitCount,
      existingRegistryCount: existingCount,
      addedCount: rescueCount,
      welfareRowCount: evidence.welfareRowCount || 0,
      addressableWelfareRowCount: evidence.addressableWelfareRowCount || 0,
      managementRowCount: evidence.managementRowCount || 0,
      parcelKeys: evidence.parcelKeys || [],
      complexNames: evidence.complexNames || [],
      sampleRows: evidence.sampleRows || [],
    });
  }

  aggregate.deliveryUnitCount = aggregate.residentialUnitCount + aggregate.commercialUnitCount + aggregate.unclassifiedUnitCount;
  aggregate.matchedBuildingCount = buildingKeys.size;
  aggregate.residentialBuildingCount = residentialBuildingKeys.size;
  aggregate.geocodedBuildingCount = buildingKeys.size;
  aggregate.elevatorBuildingCount = elevatorBuildingKeys.size;
  aggregate.noElevatorBuildingCount = noElevatorBuildingKeys.size;
  aggregate.unknownElevatorBuildingCount = unknownElevatorBuildingKeys.size;
  aggregate.walkupBuildingCount = walkupBuildingKeys.size;
  aggregate.elevatorHouseholdCount = aggregate.residentialElevatorUnitCount;
  aggregate.noElevatorHouseholdCount = aggregate.residentialNoElevatorUnitCount;
  aggregate.unknownElevatorHouseholdCount = aggregate.residentialUnknownElevatorUnitCount;
  aggregate.mixedUseBuildingCount = mixedUseKeys.size;

  const titleRows = [...titleRowsByParcel.values()].flat();
  aggregate.sourceRecordCount = titleRows.length + areaRowsSeen + exposRowsSeen + (kaptMatches || []).length + (housingPermitWelfareEvidence?.welfareRowCount || 0);
  aggregate.breakdown = {
    algorithm: {
      version: BUILDING_STATS_SOURCE_VERSION,
      mode: "V66_HSPMS_WELFARE_RESCUE",
      rules: {
        areaBasedUnitEstimation: false,
        floorBasedUnitEstimation: false,
        sameParcelElevatorPropagation: false,
        kaptAppliesOnlyToMatchedApartment: true,
        mixedUseExplicitResidentialSplit: true,
        purposeExplicitResidentialCountFallback: true,
        denseScopeDiscoveryRequired: true,
        apartmentShopDetailFirst: true,
        apartmentShopDongNameOverride: true,
        kaptSplitComplexFamilyRescue: true,
        apartmentCommercialSiblingDetailRescue: true,
        detailAreaAndExposSourceMerge: true,
        completeExposPagination: true,
        floorOverviewCommercialClassification: true,
        housingPermitWelfareLotoutExplicitCountRescue: true,
        housingPermitManagementWelfareDiagnosticOnly: true,
        housingPermitCommercialReconciliation: "MAX_REGISTRY_OR_PERMIT_EXPLICIT_COUNT",
        detailCacheVersionMarker: V65_DETAIL_CACHE_VERSION,
        mainPurposeBucketFallback: true,
        nonCollectiveDetailLookupDisabled: true,
      },
      scope: {
        discoveredScopeParcels: verifiedScopeParcels.map.size,
        matchedTitleParcels: [...titleRowsByParcel.values()].filter((rows) => rows.length > 0).length,
        matchedBuildings: aggregate.matchedBuildingCount,
      },
    },
    source: {
      titleCache: titleDiagnostics,
      detailCache: detailDiagnostics,
      unitDiagnostics: {
        areaRows: areaRowsSeen,
        exposRows: exposRowsSeen,
        candidateUnits: aggregate.exclusiveUnitRecordCount,
        matchedParcels: verifiedScopeParcels.map.size,
        parentlessCandidates: orphanDetailUnits.length,
        kaptComplexes: (kaptMatches || []).length,
      },
    },
    housingPermitWelfare: {
      requestedFamilyCount: housingPermitWelfareEvidence?.requestedFamilyCount || 0,
      welfareRowCount: housingPermitWelfareEvidence?.welfareRowCount || 0,
      explicitCommercialCount: housingPermitWelfareEvidence?.explicitCommercialCount || 0,
      errors: housingPermitWelfareEvidence?.errors || [],
      diagnosticErrors: housingPermitWelfareEvidence?.diagnosticErrors || [],
      rescues: housingPermitRescues,
    },
    kapt: {
      complexCount: (kaptMatches || []).length,
      householdCount: (kaptMatches || []).reduce((sum, match) => sum + Math.max(0, Number(match.normalized?.households) || 0), 0),
      diagnostics: kaptDiagnostics,
      complexes: (kaptMatches || []).slice(0, 40).map((match) => ({
        kaptCode: match.kaptCode,
        name: match.normalized?.name || null,
        households: match.normalized?.households || 0,
        elevatorCount: match.normalized?.elevatorCount || 0,
        parcelKey: match.parcelKey,
        reason: match.reason,
      })),
    },
    elevator: {
      unitCounts: {
        confirmed: aggregate.confirmedElevatorUnitCount,
        inferred: 0,
        none: aggregate.noElevatorUnitCount,
        unknown: aggregate.unknownElevatorUnitCount,
      },
      buildingCounts: {
        confirmed: aggregate.elevatorBuildingCount,
        inferred: 0,
        none: aggregate.noElevatorBuildingCount,
        unknown: aggregate.unknownElevatorBuildingCount,
      },
      inferencePolicy: {
        enabled: false,
        sameParcelPropagation: false,
      },
    },
    contributions,
    dataQuality: {
      deliveryUnitCount: aggregate.deliveryUnitCount,
      matchedBuildingCount: aggregate.matchedBuildingCount,
      orphanDetailUnits: orphanDetailUnits.length,
    },
  };
  return aggregate;
}

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
          completedPages: titleS
```
