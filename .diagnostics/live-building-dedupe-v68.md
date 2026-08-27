# Live building dedupe snippets for V68

worker: purple-resonance-61ea

sha256: 1abab87288490cc81f27cdb238698dc67889b8bd74d754d6dcd7c3e27bd0ceb6

## DETAIL_ORPHAN_EXACT_UNIT #1

```js
찾은 필지는 전유호가 최우선이다.
      // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
      // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
      if (
        v62ApartmentShopNameHint(row) &&
        v62ParcelHasKaptMatch(row, kaptMatches) &&
        Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
      ) {
        continue;
      }

      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
      let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
      let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
        ? "TITLE_PURPOSE_EXPLICIT_COUNT"
        : (explicit.source ? `TITLE_${explicit.source}` : null);
      if (units <= 0) {
        const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
        // No area/floor estimate. A non-collective main registry record is itself one
        // addressable building, so it may contribute exactly one address unit.
        if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
          units = 1;
          source = "TITLE_MAIN_BUILDING_ADDRESS";
        }
      }
      if (units <= 0) continue;
      const elevator = v60ElevatorStatusFromTitle(row);
      const bucket = v62ResolvedClassificationBucket(row, classification);
      addUnits({
        units,
        bucket,
        apartment: classification.apartment,
        elevatorStatus: elevator.status,
        buildingKey: titleKey,
        source: source || "TITLE_EXPLICIT",
        floorCount: buildingGroundFloorCount(row),
        passenger: elevator.info?.passenger || 0,
        emergency: elevator.info?.emergency || 0,
        meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
      continue;
    }
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
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
        discoveredScope
```

## TITLE_MIXED_hoCnt_REMAINDER #1

```js
ial += 1; }
          else if (bucket === "commercial") commercial += 1;
          else unclassified += 1;
        }
        const elevator = v60ElevatorStatusFromTitle(row);
        const floors = buildingGroundFloorCount(row);
        const info = elevator.info || {};
        if (residential) addUnits({ units: residential, bucket: "residential", apartment: classification.apartment, elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: info.passenger, emergency: info.emergency, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (commercial) addUnits({ units: commercial, bucket: "commercial", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (unclassified) addUnits({ units: unclassified, bucket: "unclassified", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        aggregate.exclusiveUnitRecordCount += assigned.length;
        continue;
      }

      // V61: 일반 혼합용도 건물의 fmlyCnt/hhldCnt는 명시적 주거 가구수다.
      // 전유부가 0건이라고 해서 해당 가구를 미분류 처리하지 않는다.
      if (classification.mixedUse) {
        const split = v61MixedTitleExplicitSplit(row, classification);
        const elevator = v60ElevatorStatusFromTitle(row);
        const floors = buildingGroundFloorCount(row);
        const info = elevator.info || {};
        let contributed = false;
        if (split.residential > 0 && !kaptCover) {
          addUnits({
            units: split.residential,
            bucket: "residential",
            apartment: classification.apartment,
            elevatorStatus: elevator.status,
            buildingKey: titleKey,
            source: split.household > 0 ? "TITLE_MIXED_hhldCnt" : "TITLE_MIXED_fmlyCnt",
            floorCount: floors,
            passenger: info.passenger,
            emergency: info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (split.commercial > 0) {
          addUnits({
            units: split.commercial,
            bucket: "commercial",
            elevatorStatus: elevator.status,
            buildingKey: titleKey,
            source: "TITLE_MIXED_hoCnt_REMAINDER",
            floorCount: floors,
            passenger: contributed ? 0 : info.passenger,
            emergency: contributed ? 0 : info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (contributed || kaptCover) continue;
      }

      if (kaptCover) continue;

      // 아파트 상가 전유부를 실제로 찾은 필지는 전유호가 최우선이다.
      // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
      // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
      if (
        v62ApartmentShopNameHint(row) &&
        v62ParcelHasKaptMatch(row, kaptMatches) &&
        Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
      ) {
        continue;
      }

      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
      let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
      let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
        ? "TITLE_PURPOSE_EXPLICIT_COUNT"
        : (explicit.source ? `TITLE_${explicit.source}` : null);
      if (units <= 0) {
        const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
        // No area/floor estimate. A non-collective main registry record is itself one
        // addressable building, so it may contribute exactly one address unit.
        if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
          units = 1;
          source = "TITLE_MAIN_BUILDING_ADDRESS";
        }
      }
      if (units <= 0) continue;
      const elevator = v60ElevatorStatusFromTitle(row);
      const bucket = v62ResolvedClassificationBucket(row, classification);
      addUnits({
        units,
        bucket,
        apartment: classification.apartment,
        elevatorStatus: elevator.status,
        buildingKey: titleKey,
        source: source || "TITLE_EXPLICIT",
        floorCount: buildingGroundFloorCount(row),
        passenger: elevator.info?.passenger || 0,
        emergency: elevator.info?.emergency || 0,
        meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
      continue;
    }
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
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

```

## orphanDetailUnits #1

```js
ssableWelfareRowCount: addressableRows.length,
      commercialCount,
      managementRowCount: family.managementRowCount,
      errors: [...new Set(family.errors)],
      sampleRows: rows.slice(0, 20).map(v66SummarizePermitWelfareRow),
    };
  });

  return {
    families: familyEvidence,
    errors: [...new Set(errors)],
    diagnosticErrors: [...new Set(diagnosticErrors)],
    requestedFamilyCount: familyEvidence.length,
    welfareRowCount: familyEvidence.reduce((sum, item) => sum + item.welfareRowCount, 0),
    explicitCommercialCount: familyEvidence.reduce((sum, item) => sum + item.commercialCount, 0),
  };
}

function v60CreateAggregate() {
  return {
    householdCount: 0,
    apartmentHouseholdCount: 0,
    nonApartmentHouseholdCount: 0,
    unknownHouseholdCount: 0,
    residentialUnitCount: 0,
    commercialUnitCount: 0,
    unclassifiedUnitCount: 0,
    deliveryUnitCount: 0,
    residentialBuildingUnitCount: 0,
    commercialBuildingUnitCount: 0,
    mixedUseBuildingCount: 0,
    exclusiveUnitRecordCount: 0,
    commonAreaRecordCount: 0,
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
    sourceRecordCount: 0,
    matchedBuildingCount: 0,
    residentialBuildingCount: 0,
    geocodedBuildingCount: 0,
    unlocatedBuildingCount: 0,
    coveragePercent: 100,
    elevatorBuildingCount: 0,
    noElevatorBuildingCount: 0,
    unknownElevatorBuildingCount: 0,
    elevatorHouseholdCount: 0,
    noElevatorHouseholdCount: 0,
    unknownElevatorHouseholdCount: 0,
    passengerElevatorCount: 0,
    emergencyElevatorCount: 0,
    walkupBuildingCount: 0,
    walkupHouseholdCount: 0,
    breakdown: {},
  };
}

function v60AggregateBuildingStats({
  titleRowsByParcel,
  detailCacheMap,
  kaptMatches,
  verifiedScopeParcels,
  walkupMinGroundFloors,
  titleDiagnostics,
  detailDiagnostics,
  kaptDiagnostics,
  housingPermitWelfareEvidence,
}) {
  const aggregate = v60CreateAggregate();
  const buildingKeys = new Set();
  const residentialBuildingKeys = new Set();
  const elevatorBuildingKeys = new Set();
  const noElevatorBuildingKeys = new Set();
  const unknownElevatorBuildingKeys = new Set();
  const walkupBuildingKeys = new Set();
  const mixedUseKeys = new Set();
  const contributions = [];
  const detailUnitsByParent = new Map();
  const orphanDetailUnits = [];
  const detailShopUnitsByParcel = new Map();
  const commercialUnitsByKaptFamily = new Map();
  const familyKeyByTitleKey = new Map();
  for (const rows of titleRowsByParcel.values()) {
    for (const title of v60RelevantTitles(rows)) {
      const titleKey = buildingRecordKey(title);
      const familyKey = v63TitleKaptFamilyKey(title);
      if (titleKey && familyKey) familyKeyByTitleKey.set(titleKey, familyKey);
    }
  }
  let areaRowsSeen = 0;
  let exposRowsSeen = 0;

  const addUnits = ({ units, bucket, apartment = false, elevatorStatus = "unknown", buildingKey, source, floorCount = 0, passenger = 0, emergency = 0, meta = null, familyKey = null }) => {
    const count = Math.max(0, Math.trunc(Number(units) || 0));
    if (!count) return;
    if (bucket === "mixed") bucket = "unclassified";
    if (bucket === "residential") {
      aggregate.residentialUnitCount += count;
      aggregate.householdCount += count;
      if (apartment) aggregate.apartmentHouseholdCount += count;
      else aggregate.nonApartmentHouseholdCount += count;
      aggregate.residentialBuildingUnitCount += count;
    } else if (bucket === "commercial") {
      aggregate.commercialUnitCount += count;
      aggregate.commercialBuildingUnitCount += count;
      const resolvedFamilyKey = cleanBuildingText(familyKey || meta?.familyKey || familyKeyByTitleKey.get(buildingKey));
      if (resolvedFamilyKey) {
        commercialUnitsByKaptFamily.set(
          resolvedFamilyKey,
          Number(commercialUnitsByKaptFamily.get(resolvedFamilyKey) || 0) + count
        );
      }
    } else {
      aggregate.unclassifiedUnitCount += count;
      aggregate.unknownHouseholdCount += count;
    }

    if (elevatorStatus === "yes") {
      aggregate.confirmedElevatorUnitCount += count;
      if (bucket === "residential") aggregate.residentialElevatorUnitCount += count;
      if (bucket === "commercial") aggregate.commercialElevatorUnitCount += count;
    } else if (elevatorStatus === "no") {
      aggregate.noElevatorUnitCount += count;
      if (bucket === "residential") aggregate.residentialNoElevatorUnitCount += count;
      if (bucket === "commercial") aggregate.commercialNoElevatorUnitCount += count;
    } else {
      aggregate.unknownElevatorUnitCount += count;
      if (bucket === "residential") aggregate.residentialUnknownElevatorUnitCount += count;
      if (bucket === "commercial") aggregate.commercialUnknownElevatorUnitCount += count;
    }

    if (buildingKey) {
      buildingKeys.add(buildingKey);
      if (bucket === "residential") residentialBuildingKeys.add(buildingKey);
      if (elevatorStatus === "yes") elevatorBuildingKeys.add(buildingKey);
      else if (elevatorStatus === "no") noElevatorBuildingKeys.add(buildingKey);
      else unknownElevatorBuildingKeys.add(buildingKey);
      if (elevatorStatus === "no" && floorCount >= walkupMinGroundFloors) {
        walkupBuildingKeys.add(buildingKey);
        aggregate.walkupHouseholdCount += count;
      }
    }
    aggregate.passengerElevatorCount += Math.max(0, Math.trunc(Number(passenger) || 0));
    aggregate.emergencyElevatorCount += Math.max(0, Math.trunc(Number(emergency) || 0));
    if (contributions.length < 240) contributions.push({ units: count, bucket, elevatorStatus, source, buildingKey, meta });
  };

  // Unit-detail rows are prepared first so a title with actual exclusive-unit evidence
  // does not also contribute its coarse hoCnt/hhldCnt and double count.
  for (const [parcelKey, cache] of detailCacheMap.entries()) {
    if (cache?.status !== "ready") continue;
    const titles = titleRowsByParcel.get(parcelKey) || [];
    const rawAreaRows = Array.isArray(cache.area_rows) ? cache.area_rows : [];
    const rawExposRows = Array.isArray(cache.expos_rows) ? cache.expos_rows : [];
    const exclusiveAreaRows = rawAreaRows.filter((row) => {
      const name = cleanBuildingText(publicDataField(row, "exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"));
      const code = cleanBuildingText(publicDataField(row, "exposPubuseGbCd", "expos_pubuse_gb_cd"));
      return name.includes("전유") || code === "1" || (!name && !code);
    });

    // V65: 전유공용면적(area)과 전유부(expos)는 서로 완전한 상위집합 관계가
```

## orphanDetailUnits #2

```js
65: 전유공용면적(area)과 전유부(expos)는 서로 완전한 상위집합 관계가 아니다.
    // 기존 V63은 area가 한 건이라도 있으면 expos 전체를 버려서, 구축 아파트 상가처럼
    // 용도/호 정보가 expos 쪽에만 남은 호가 누락될 수 있었다. 두 원천을 동일 호 key로
    // 합치되, 용도 문자열/부모 PK/호명이 더 풍부한 행을 대표행으로 선택한다.
    const detailSourceQualityV64 = (row) => {
      let score = 0;
      const use = unitUseText(row).replace(/\s+/g, "");
      if (use) score += 10;
      if (/근린생활시설|판매시설|상점|점포|소매점|음식점|학원|의원|약국|업무시설|사무소/.test(use)) score += 30;
      if (/아파트|공동주택|주택|오피스텔/.test(use)) score += 20;
      if (unitHoName(row)) score += 8;
      if (unitFloorName(row)) score += 4;
      if (unitDongName(row)) score += 4;
      if (cleanBuildingText(publicDataField(row, "mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"))) score += 12;
      if (cleanBuildingText(publicDataField(row, "mgmHoDetlPk", "mgm_ho_detl_pk"))) score += 6;
      return score;
    };
    const mergedSourceRowsV64 = new Map();
    [...exclusiveAreaRows, ...rawExposRows].forEach((row, index) => {
      if (!row || isCommonAreaUnitRecord(row)) return;
      const unitKey = v60DetailUnitKey(row, index);
      const prior = mergedSourceRowsV64.get(unitKey);
      if (!prior || detailSourceQualityV64(row) > detailSourceQualityV64(prior)) {
        mergedSourceRowsV64.set(unitKey, row);
      }
    });
    const sourceRows = [...mergedSourceRowsV64.values()];
    areaRowsSeen += rawAreaRows.length;
    exposRowsSeen += rawExposRows.length;
    const seen = new Set();
    sourceRows.forEach((row, index) => {
      const unitKey = v60DetailUnitKey(row, index);
      if (seen.has(unitKey)) return;
      seen.add(unitKey);
      const parent = v60ParentTitleForDetail(row, titles);
      let classification = v60Classification(row);
      if (!classification.residential && !classification.commercial && parent) {
        classification = v60Classification(parent);
      }
      const resolvedBucket = v62ResolvedClassificationBucket(row, classification);
      if (
        resolvedBucket === "commercial" &&
        (v62ApartmentShopNameHint(row) || v62ApartmentShopNameHint(parent))
      ) {
        detailShopUnitsByParcel.set(
          parcelKey,
          Number(detailShopUnitsByParcel.get(parcelKey) || 0) + 1
        );
      }
      const parentKey = parent ? buildingRecordKey(parent) : "";
      const item = { parcelKey, row, parent, parentKey, classification, unitKey };
      if (parentKey) {
        if (!detailUnitsByParent.has(parentKey)) detailUnitsByParent.set(parentKey, []);
        detailUnitsByParent.get(parentKey).push(item);
      } else {
        orphanDetailUnits.push(item);
      }
    });
  }

  // K-APT apartment contributions: one complex, one residential total. Elevator status
  // belongs only to this exact complex contribution.
  for (const match of kaptMatches || []) {
    const households = Math.max(0, Math.trunc(Number(match.normalized?.households) || 0));
    if (!households) continue;
    const elevator = v60KaptElevatorStatus(match, titleRowsByParcel);
    const buildingCount = Math.max(1, Math.trunc(Number(match.normalized?.buildingCount) || 1));
    for (let i = 0; i < buildingCount; i++) {
      const key = `kapt:${match.kaptCode}:${i + 1}`;
      buildingKeys.add(key);
      residentialBuildingKeys.add(key);
      if (elevator.status === "yes") elevatorBuildingKeys.add(key);
      else if (elevator.status === "no") noElevatorBuildingKeys.add(key);
      else unknownElevatorBuildingKeys.add(key);
    }
    aggregate.residentialUnitCount += households;
    aggregate.householdCount += households;
    aggregate.apartmentHouseholdCount += households;
    aggregate.residentialBuildingUnitCount += households;
    if (elevator.status === "yes") {
      aggregate.confirmedElevatorUnitCount += households;
      aggregate.residentialElevatorUnitCount += households;
    } else if (elevator.status === "no") {
      aggregate.noElevatorUnitCount += households;
      aggregate.residentialNoElevatorUnitCount += households;
    } else {
      aggregate.unknownElevatorUnitCount += households;
      aggregate.residentialUnknownElevatorUnitCount += households;
    }
    aggregate.passengerElevatorCount += Math.max(0, Math.trunc(Number(elevator.elevatorCount) || 0));
    if (contributions.length < 240) contributions.push({
      units: households,
      bucket: "residential",
      elevatorStatus: elevator.status,
      source: "KAPT_EXACT_COMPLEX",
      buildingKey: `kapt:${match.kaptCode}`,
      meta: { name: match.normalized?.name || null, parcelKey: match.parcelKey, reason: match.reason, elevatorReason: elevator.reason },
    });
  }

  // Title/detail contributions.
  for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
    for (const row of v60RelevantTitles(rows)) {
      const titleKey = buildingRecordKey(row);
      const classification = v60Classification(row);
      if (classification.mixedUse) mixedUseKeys.add(titleKey);
      const kaptCover = classification.apartment ? v60TitleCoveredByKapt(row, kaptMatches) : null;
      if (classification.apartment && kaptCover && !classification.mixedUse) continue;

      const assigned = detailUnitsByParent.get(titleKey) || [];
      if (assigned.length) {
        let residential = 0, commercial = 0, unclassified = 0;
        for (const item of assigned) {
          const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
          if (bucket === "residential") { if (!kaptCover) residential += 1; }
          else if (bucket === "commercial") commercial += 1;
          else unclassified += 1;
        }
        const elevator = v60ElevatorStatusFromTitle(row);
        const floors = buildingGroundFloorCount(row);
        const info = elevator.info || {};
        if (residential) addUnits({ units: residential, bucket: "residential", apartment: classification.apartment, elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: info.passenger, emergency: info.emergency, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (commercial) addUnits({ units: commercial, bucket: "commercial", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (unclassified) addUnits({ units: unclassified, bucket: "unclassified", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        aggregate.exclusiveUnitRecordCount += assigned.length;
        continue;
      }

      // 
```

## orphanDetailUnits #3

```js
er, emergency: info.emergency, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (commercial) addUnits({ units: commercial, bucket: "commercial", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (unclassified) addUnits({ units: unclassified, bucket: "unclassified", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        aggregate.exclusiveUnitRecordCount += assigned.length;
        continue;
      }

      // V61: 일반 혼합용도 건물의 fmlyCnt/hhldCnt는 명시적 주거 가구수다.
      // 전유부가 0건이라고 해서 해당 가구를 미분류 처리하지 않는다.
      if (classification.mixedUse) {
        const split = v61MixedTitleExplicitSplit(row, classification);
        const elevator = v60ElevatorStatusFromTitle(row);
        const floors = buildingGroundFloorCount(row);
        const info = elevator.info || {};
        let contributed = false;
        if (split.residential > 0 && !kaptCover) {
          addUnits({
            units: split.residential,
            bucket: "residential",
            apartment: classification.apartment,
            elevatorStatus: elevator.status,
            buildingKey: titleKey,
            source: split.household > 0 ? "TITLE_MIXED_hhldCnt" : "TITLE_MIXED_fmlyCnt",
            floorCount: floors,
            passenger: info.passenger,
            emergency: info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (split.commercial > 0) {
          addUnits({
            units: split.commercial,
            bucket: "commercial",
            elevatorStatus: elevator.status,
            buildingKey: titleKey,
            source: "TITLE_MIXED_hoCnt_REMAINDER",
            floorCount: floors,
            passenger: contributed ? 0 : info.passenger,
            emergency: contributed ? 0 : info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (contributed || kaptCover) continue;
      }

      if (kaptCover) continue;

      // 아파트 상가 전유부를 실제로 찾은 필지는 전유호가 최우선이다.
      // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
      // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
      if (
        v62ApartmentShopNameHint(row) &&
        v62ParcelHasKaptMatch(row, kaptMatches) &&
        Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
      ) {
        continue;
      }

      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
      let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
      let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
        ? "TITLE_PURPOSE_EXPLICIT_COUNT"
        : (explicit.source ? `TITLE_${explicit.source}` : null);
      if (units <= 0) {
        const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
        // No area/floor estimate. A non-collective main registry record is itself one
        // addressable building, so it may contribute exactly one address unit.
        if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
          units = 1;
          source = "TITLE_MAIN_BUILDING_ADDRESS";
        }
      }
      if (units <= 0) continue;
      const elevator = v60ElevatorStatusFromTitle(row);
      const bucket = v62ResolvedClassificationBucket(row, classification);
      addUnits({
        units,
        bucket,
        apartment: classification.apartment,
        elevatorStatus: elevator.status,
        buildingKey: titleKey,
        source: source || "TITLE_EXPLICIT",
        floorCount: buildingGroundFloorCount(row),
        passenger: elevator.info?.passenger || 0,
        emergency: elevator.info?.emergency || 0,
        meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
      continue;
    }
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
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
      addressableWelfareRowC
```

## orphanDetailUnits #4

```js
         floorCount: floors,
            passenger: contributed ? 0 : info.passenger,
            emergency: contributed ? 0 : info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (contributed || kaptCover) continue;
      }

      if (kaptCover) continue;

      // 아파트 상가 전유부를 실제로 찾은 필지는 전유호가 최우선이다.
      // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
      // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
      if (
        v62ApartmentShopNameHint(row) &&
        v62ParcelHasKaptMatch(row, kaptMatches) &&
        Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
      ) {
        continue;
      }

      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
      let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
      let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
        ? "TITLE_PURPOSE_EXPLICIT_COUNT"
        : (explicit.source ? `TITLE_${explicit.source}` : null);
      if (units <= 0) {
        const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
        // No area/floor estimate. A non-collective main registry record is itself one
        // addressable building, so it may contribute exactly one address unit.
        if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
          units = 1;
          source = "TITLE_MAIN_BUILDING_ADDRESS";
        }
      }
      if (units <= 0) continue;
      const elevator = v60ElevatorStatusFromTitle(row);
      const bucket = v62ResolvedClassificationBucket(row, classification);
      addUnits({
        units,
        bucket,
        apartment: classification.apartment,
        elevatorStatus: elevator.status,
        buildingKey: titleKey,
        source: source || "TITLE_EXPLICIT",
        floorCount: buildingGroundFloorCount(row),
        passenger: elevator.info?.passenger || 0,
        emergency: elevator.info?.emergency || 0,
        meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
      continue;
    }
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
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
        floorOverviewC
```

## orphanDetailUnits #5

```js
ldingKeys.size;
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
  const minimumDenseSamples = Math.min(500, Math.max(60, Math.ceil(p
```

## orphanDetailUnits #6

```js
"MAX_REGISTRY_OR_PERMIT_EXPLICIT_COUNT",
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
     
```

## addOrphan

_not found_

## orphan #1

```js
ssableWelfareRowCount: addressableRows.length,
      commercialCount,
      managementRowCount: family.managementRowCount,
      errors: [...new Set(family.errors)],
      sampleRows: rows.slice(0, 20).map(v66SummarizePermitWelfareRow),
    };
  });

  return {
    families: familyEvidence,
    errors: [...new Set(errors)],
    diagnosticErrors: [...new Set(diagnosticErrors)],
    requestedFamilyCount: familyEvidence.length,
    welfareRowCount: familyEvidence.reduce((sum, item) => sum + item.welfareRowCount, 0),
    explicitCommercialCount: familyEvidence.reduce((sum, item) => sum + item.commercialCount, 0),
  };
}

function v60CreateAggregate() {
  return {
    householdCount: 0,
    apartmentHouseholdCount: 0,
    nonApartmentHouseholdCount: 0,
    unknownHouseholdCount: 0,
    residentialUnitCount: 0,
    commercialUnitCount: 0,
    unclassifiedUnitCount: 0,
    deliveryUnitCount: 0,
    residentialBuildingUnitCount: 0,
    commercialBuildingUnitCount: 0,
    mixedUseBuildingCount: 0,
    exclusiveUnitRecordCount: 0,
    commonAreaRecordCount: 0,
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
    sourceRecordCount: 0,
    matchedBuildingCount: 0,
    residentialBuildingCount: 0,
    geocodedBuildingCount: 0,
    unlocatedBuildingCount: 0,
    coveragePercent: 100,
    elevatorBuildingCount: 0,
    noElevatorBuildingCount: 0,
    unknownElevatorBuildingCount: 0,
    elevatorHouseholdCount: 0,
    noElevatorHouseholdCount: 0,
    unknownElevatorHouseholdCount: 0,
    passengerElevatorCount: 0,
    emergencyElevatorCount: 0,
    walkupBuildingCount: 0,
    walkupHouseholdCount: 0,
    breakdown: {},
  };
}

function v60AggregateBuildingStats({
  titleRowsByParcel,
  detailCacheMap,
  kaptMatches,
  verifiedScopeParcels,
  walkupMinGroundFloors,
  titleDiagnostics,
  detailDiagnostics,
  kaptDiagnostics,
  housingPermitWelfareEvidence,
}) {
  const aggregate = v60CreateAggregate();
  const buildingKeys = new Set();
  const residentialBuildingKeys = new Set();
  const elevatorBuildingKeys = new Set();
  const noElevatorBuildingKeys = new Set();
  const unknownElevatorBuildingKeys = new Set();
  const walkupBuildingKeys = new Set();
  const mixedUseKeys = new Set();
  const contributions = [];
  const detailUnitsByParent = new Map();
  const orphanDetailUnits = [];
  const detailShopUnitsByParcel = new Map();
  const commercialUnitsByKaptFamily = new Map();
  const familyKeyByTitleKey = new Map();
  for (const rows of titleRowsByParcel.values()) {
    for (const title of v60RelevantTitles(rows)) {
      const titleKey = buildingRecordKey(title);
      const familyKey = v63TitleKaptFamilyKey(title);
      if (titleKey && familyKey) familyKeyByTitleKey.set(titleKey, familyKey);
    }
  }
  let areaRowsSeen = 0;
  let exposRowsSeen = 0;

  const addUnits = ({ units, bucket, apartment = false, elevatorStatus = "unknown", buildingKey, source, floorCount = 0, passenger = 0, emergency = 0, meta = null, familyKey = null }) => {
    const count = Math.max(0, Math.trunc(Number(units) || 0));
    if (!count) return;
    if (bucket === "mixed") bucket = "unclassified";
    if (bucket === "residential") {
      aggregate.residentialUnitCount += count;
      aggregate.householdCount += count;
      if (apartment) aggregate.apartmentHouseholdCount += count;
      else aggregate.nonApartmentHouseholdCount += count;
      aggregate.residentialBuildingUnitCount += count;
    } else if (bucket === "commercial") {
      aggregate.commercialUnitCount += count;
      aggregate.commercialBuildingUnitCount += count;
      const resolvedFamilyKey = cleanBuildingText(familyKey || meta?.familyKey || familyKeyByTitleKey.get(buildingKey));
      if (resolvedFamilyKey) {
        commercialUnitsByKaptFamily.set(
          resolvedFamilyKey,
          Number(commercialUnitsByKaptFamily.get(resolvedFamilyKey) || 0) + count
        );
      }
    } else {
      aggregate.unclassifiedUnitCount += count;
      aggregate.unknownHouseholdCount += count;
    }

    if (elevatorStatus === "yes") {
      aggregate.confirmedElevatorUnitCount += count;
      if (bucket === "residential") aggregate.residentialElevatorUnitCount += count;
      if (bucket === "commercial") aggregate.commercialElevatorUnitCount += count;
    } else if (elevatorStatus === "no") {
      aggregate.noElevatorUnitCount += count;
      if (bucket === "residential") aggregate.residentialNoElevatorUnitCount += count;
      if (bucket === "commercial") aggregate.commercialNoElevatorUnitCount += count;
    } else {
      aggregate.unknownElevatorUnitCount += count;
      if (bucket === "residential") aggregate.residentialUnknownElevatorUnitCount += count;
      if (bucket === "commercial") aggregate.commercialUnknownElevatorUnitCount += count;
    }

    if (buildingKey) {
      buildingKeys.add(buildingKey);
      if (bucket === "residential") residentialBuildingKeys.add(buildingKey);
      if (elevatorStatus === "yes") elevatorBuildingKeys.add(buildingKey);
      else if (elevatorStatus === "no") noElevatorBuildingKeys.add(buildingKey);
      else unknownElevatorBuildingKeys.add(buildingKey);
      if (elevatorStatus === "no" && floorCount >= walkupMinGroundFloors) {
        walkupBuildingKeys.add(buildingKey);
        aggregate.walkupHouseholdCount += count;
      }
    }
    aggregate.passengerElevatorCount += Math.max(0, Math.trunc(Number(passenger) || 0));
    aggregate.emergencyElevatorCount += Math.max(0, Math.trunc(Number(emergency) || 0));
    if (contributions.length < 240) contributions.push({ units: count, bucket, elevatorStatus, source, buildingKey, meta });
  };

  // Unit-detail rows are prepared first so a title with actual exclusive-unit evidence
  // does not also contribute its coarse hoCnt/hhldCnt and double count.
  for (const [parcelKey, cache] of detailCacheMap.entries()) {
    if (cache?.status !== "ready") continue;
    const titles = titleRowsByParcel.get(parcelKey) || [];
    const rawAreaRows = Array.isArray(cache.area_rows) ? cache.area_rows : [];
    const rawExposRows = Array.isArray(cache.expos_rows) ? cache.expos_rows : [];
    const exclusiveAreaRows = rawAreaRows.filter((row) => {
      const name = cleanBuildingText(publicDataField(row, "exposPubuseGbCdNm", "expos_pubuse_gb_cd_nm"));
      const code = cleanBuildingText(publicDataField(row, "exposPubuseGbCd", "expos_pubuse_gb_cd"));
      return name.includes("전유") || code === "1" || (!name && !code);
    });

    // V65: 전유공용면적(area)과 전유부(expos)는 서로 완
```

## orphan #2

```js
65: 전유공용면적(area)과 전유부(expos)는 서로 완전한 상위집합 관계가 아니다.
    // 기존 V63은 area가 한 건이라도 있으면 expos 전체를 버려서, 구축 아파트 상가처럼
    // 용도/호 정보가 expos 쪽에만 남은 호가 누락될 수 있었다. 두 원천을 동일 호 key로
    // 합치되, 용도 문자열/부모 PK/호명이 더 풍부한 행을 대표행으로 선택한다.
    const detailSourceQualityV64 = (row) => {
      let score = 0;
      const use = unitUseText(row).replace(/\s+/g, "");
      if (use) score += 10;
      if (/근린생활시설|판매시설|상점|점포|소매점|음식점|학원|의원|약국|업무시설|사무소/.test(use)) score += 30;
      if (/아파트|공동주택|주택|오피스텔/.test(use)) score += 20;
      if (unitHoName(row)) score += 8;
      if (unitFloorName(row)) score += 4;
      if (unitDongName(row)) score += 4;
      if (cleanBuildingText(publicDataField(row, "mgmUpperBldrgstPk", "mgm_upper_bldrgst_pk", "upperMgmBldrgstPk", "upper_mgm_bldrgst_pk"))) score += 12;
      if (cleanBuildingText(publicDataField(row, "mgmHoDetlPk", "mgm_ho_detl_pk"))) score += 6;
      return score;
    };
    const mergedSourceRowsV64 = new Map();
    [...exclusiveAreaRows, ...rawExposRows].forEach((row, index) => {
      if (!row || isCommonAreaUnitRecord(row)) return;
      const unitKey = v60DetailUnitKey(row, index);
      const prior = mergedSourceRowsV64.get(unitKey);
      if (!prior || detailSourceQualityV64(row) > detailSourceQualityV64(prior)) {
        mergedSourceRowsV64.set(unitKey, row);
      }
    });
    const sourceRows = [...mergedSourceRowsV64.values()];
    areaRowsSeen += rawAreaRows.length;
    exposRowsSeen += rawExposRows.length;
    const seen = new Set();
    sourceRows.forEach((row, index) => {
      const unitKey = v60DetailUnitKey(row, index);
      if (seen.has(unitKey)) return;
      seen.add(unitKey);
      const parent = v60ParentTitleForDetail(row, titles);
      let classification = v60Classification(row);
      if (!classification.residential && !classification.commercial && parent) {
        classification = v60Classification(parent);
      }
      const resolvedBucket = v62ResolvedClassificationBucket(row, classification);
      if (
        resolvedBucket === "commercial" &&
        (v62ApartmentShopNameHint(row) || v62ApartmentShopNameHint(parent))
      ) {
        detailShopUnitsByParcel.set(
          parcelKey,
          Number(detailShopUnitsByParcel.get(parcelKey) || 0) + 1
        );
      }
      const parentKey = parent ? buildingRecordKey(parent) : "";
      const item = { parcelKey, row, parent, parentKey, classification, unitKey };
      if (parentKey) {
        if (!detailUnitsByParent.has(parentKey)) detailUnitsByParent.set(parentKey, []);
        detailUnitsByParent.get(parentKey).push(item);
      } else {
        orphanDetailUnits.push(item);
      }
    });
  }

  // K-APT apartment contributions: one complex, one residential total. Elevator status
  // belongs only to this exact complex contribution.
  for (const match of kaptMatches || []) {
    const households = Math.max(0, Math.trunc(Number(match.normalized?.households) || 0));
    if (!households) continue;
    const elevator = v60KaptElevatorStatus(match, titleRowsByParcel);
    const buildingCount = Math.max(1, Math.trunc(Number(match.normalized?.buildingCount) || 1));
    for (let i = 0; i < buildingCount; i++) {
      const key = `kapt:${match.kaptCode}:${i + 1}`;
      buildingKeys.add(key);
      residentialBuildingKeys.add(key);
      if (elevator.status === "yes") elevatorBuildingKeys.add(key);
      else if (elevator.status === "no") noElevatorBuildingKeys.add(key);
      else unknownElevatorBuildingKeys.add(key);
    }
    aggregate.residentialUnitCount += households;
    aggregate.householdCount += households;
    aggregate.apartmentHouseholdCount += households;
    aggregate.residentialBuildingUnitCount += households;
    if (elevator.status === "yes") {
      aggregate.confirmedElevatorUnitCount += households;
      aggregate.residentialElevatorUnitCount += households;
    } else if (elevator.status === "no") {
      aggregate.noElevatorUnitCount += households;
      aggregate.residentialNoElevatorUnitCount += households;
    } else {
      aggregate.unknownElevatorUnitCount += households;
      aggregate.residentialUnknownElevatorUnitCount += households;
    }
    aggregate.passengerElevatorCount += Math.max(0, Math.trunc(Number(elevator.elevatorCount) || 0));
    if (contributions.length < 240) contributions.push({
      units: households,
      bucket: "residential",
      elevatorStatus: elevator.status,
      source: "KAPT_EXACT_COMPLEX",
      buildingKey: `kapt:${match.kaptCode}`,
      meta: { name: match.normalized?.name || null, parcelKey: match.parcelKey, reason: match.reason, elevatorReason: elevator.reason },
    });
  }

  // Title/detail contributions.
  for (const [parcelKey, rows] of titleRowsByParcel.entries()) {
    for (const row of v60RelevantTitles(rows)) {
      const titleKey = buildingRecordKey(row);
      const classification = v60Classification(row);
      if (classification.mixedUse) mixedUseKeys.add(titleKey);
      const kaptCover = classification.apartment ? v60TitleCoveredByKapt(row, kaptMatches) : null;
      if (classification.apartment && kaptCover && !classification.mixedUse) continue;

      const assigned = detailUnitsByParent.get(titleKey) || [];
      if (assigned.length) {
        let residential = 0, commercial = 0, unclassified = 0;
        for (const item of assigned) {
          const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
          if (bucket === "residential") { if (!kaptCover) residential += 1; }
          else if (bucket === "commercial") commercial += 1;
          else unclassified += 1;
        }
        const elevator = v60ElevatorStatusFromTitle(row);
        const floors = buildingGroundFloorCount(row);
        const info = elevator.info || {};
        if (residential) addUnits({ units: residential, bucket: "residential", apartment: classification.apartment, elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: info.passenger, emergency: info.emergency, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (commercial) addUnits({ units: commercial, bucket: "commercial", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (unclassified) addUnits({ units: unclassified, bucket: "unclassified", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        aggregate.exclusiveUnitRecordCount += assigned.length;
        continue;
      }
```

## orphan #3

```js
er, emergency: info.emergency, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (commercial) addUnits({ units: commercial, bucket: "commercial", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        if (unclassified) addUnits({ units: unclassified, bucket: "unclassified", elevatorStatus: elevator.status, buildingKey: titleKey, source: "DETAIL_EXCLUSIVE", floorCount: floors, passenger: 0, emergency: 0, meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), parent: true } });
        aggregate.exclusiveUnitRecordCount += assigned.length;
        continue;
      }

      // V61: 일반 혼합용도 건물의 fmlyCnt/hhldCnt는 명시적 주거 가구수다.
      // 전유부가 0건이라고 해서 해당 가구를 미분류 처리하지 않는다.
      if (classification.mixedUse) {
        const split = v61MixedTitleExplicitSplit(row, classification);
        const elevator = v60ElevatorStatusFromTitle(row);
        const floors = buildingGroundFloorCount(row);
        const info = elevator.info || {};
        let contributed = false;
        if (split.residential > 0 && !kaptCover) {
          addUnits({
            units: split.residential,
            bucket: "residential",
            apartment: classification.apartment,
            elevatorStatus: elevator.status,
            buildingKey: titleKey,
            source: split.household > 0 ? "TITLE_MIXED_hhldCnt" : "TITLE_MIXED_fmlyCnt",
            floorCount: floors,
            passenger: info.passenger,
            emergency: info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (split.commercial > 0) {
          addUnits({
            units: split.commercial,
            bucket: "commercial",
            elevatorStatus: elevator.status,
            buildingKey: titleKey,
            source: "TITLE_MIXED_hoCnt_REMAINDER",
            floorCount: floors,
            passenger: contributed ? 0 : info.passenger,
            emergency: contributed ? 0 : info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (contributed || kaptCover) continue;
      }

      if (kaptCover) continue;

      // 아파트 상가 전유부를 실제로 찾은 필지는 전유호가 최우선이다.
      // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
      // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
      if (
        v62ApartmentShopNameHint(row) &&
        v62ParcelHasKaptMatch(row, kaptMatches) &&
        Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
      ) {
        continue;
      }

      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
      let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
      let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
        ? "TITLE_PURPOSE_EXPLICIT_COUNT"
        : (explicit.source ? `TITLE_${explicit.source}` : null);
      if (units <= 0) {
        const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
        // No area/floor estimate. A non-collective main registry record is itself one
        // addressable building, so it may contribute exactly one address unit.
        if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
          units = 1;
          source = "TITLE_MAIN_BUILDING_ADDRESS";
        }
      }
      if (units <= 0) continue;
      const elevator = v60ElevatorStatusFromTitle(row);
      const bucket = v62ResolvedClassificationBucket(row, classification);
      addUnits({
        units,
        bucket,
        apartment: classification.apartment,
        elevatorStatus: elevator.status,
        buildingKey: titleKey,
        source: source || "TITLE_EXPLICIT",
        floorCount: buildingGroundFloorCount(row),
        passenger: elevator.info?.passenger || 0,
        emergency: elevator.info?.emergency || 0,
        meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
      continue;
    }
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
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
      addressable
```

## orphan #4

```js
         floorCount: floors,
            passenger: contributed ? 0 : info.passenger,
            emergency: contributed ? 0 : info.emergency,
            meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
          });
          contributed = true;
        }
        if (contributed || kaptCover) continue;
      }

      if (kaptCover) continue;

      // 아파트 상가 전유부를 실제로 찾은 필지는 전유호가 최우선이다.
      // parent 연결이 안 된 전유호는 아래 orphanDetailUnits에서 정확 호수로 더해지므로
      // 여기서 표제부 hhldCnt/hoCnt를 다시 더해 중복시키지 않는다.
      if (
        v62ApartmentShopNameHint(row) &&
        v62ParcelHasKaptMatch(row, kaptMatches) &&
        Number(detailShopUnitsByParcel.get(parcelKey) || 0) > 0
      ) {
        continue;
      }

      const explicit = buildingExplicitUnitEvidence(row, classification);
      const purposeHint = classification.residential ? v62PurposeResidentialCountHint(row) : 0;
      let units = Math.max(Math.max(0, Math.trunc(Number(explicit.units) || 0)), purposeHint);
      let source = purposeHint > Math.max(0, Math.trunc(Number(explicit.units) || 0))
        ? "TITLE_PURPOSE_EXPLICIT_COUNT"
        : (explicit.source ? `TITLE_${explicit.source}` : null);
      if (units <= 0) {
        const collective = cleanBuildingText(publicDataField(row, "regstrGbCdNm", "regstr_gb_cd_nm")).includes("집합");
        // No area/floor estimate. A non-collective main registry record is itself one
        // addressable building, so it may contribute exactly one address unit.
        if (!collective && cleanBuildingText(publicDataField(row, "mainAtchGbCdNm", "main_atch_gb_cd_nm")) !== "부속건축물") {
          units = 1;
          source = "TITLE_MAIN_BUILDING_ADDRESS";
        }
      }
      if (units <= 0) continue;
      const elevator = v60ElevatorStatusFromTitle(row);
      const bucket = v62ResolvedClassificationBucket(row, classification);
      addUnits({
        units,
        bucket,
        apartment: classification.apartment,
        elevatorStatus: elevator.status,
        buildingKey: titleKey,
        source: source || "TITLE_EXPLICIT",
        floorCount: buildingGroundFloorCount(row),
        passenger: elevator.info?.passenger || 0,
        emergency: elevator.info?.emergency || 0,
        meta: { parcelKey, title: cleanBuildingText(row?.bldNm ?? row?.dongNm), purpose: classification.purpose },
      });
    }
  }

  // Detail units that could not be attached to a unique title remain exact unit records;
  // their elevator status is unknown instead of borrowing another building's status.
  for (const item of orphanDetailUnits) {
    if (item.classification.apartment && (kaptMatches || []).some((match) => match.parcelKey === item.parcelKey)) {
      continue;
    }
    const bucket = v62ResolvedClassificationBucket(item.row, item.classification);
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
        flo
```

## orphan #5

```js
ldingKeys.size;
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
  const minimumDenseSamples = Math.min(500, Math.max(60, 
```

## orphan #6

```js
"MAX_REGISTRY_OR_PERMIT_EXPLICIT_COUNT",
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
        evidence: titleState.evid
```

## supplementTitleUnitEvidence #1

```js
ey || !units) return;

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
      );

      if (fallback.classification?.mixedUse && split.length > 1) {
        unitDiagnostics.mixedUseSplitBuildings += 1;
      }

      for (const part of split) {
        addCount(part.type, part.units, buildingKey, elevator, {
          source: fallback.confidence === "estimated"
            ? `BUILDING_HUB_${sourceTag}_AREA_ESTIMATE`
            : `BUILDING_HUB_${sourceTag}_EXPLICIT_COUNT`,
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

      countedUnitCountByBuilding.set(buildingKey, targetUnits);
      supplementedUnits += delta;
      supplementedBuildings += 1;
      titleFallbackUnits += delta;
      unitDiagnostics.titleSupplementUnits += delta;
      unitDiagnostics.titleSupplementBuildings += 1;
      if (fallback.confidence === "estimated" || reconciled.usedFloorOverride) {
        unitDiagnostics.titleSupplementEstimatedUnits += delta;
      } else {
        unitDiagnostics.titleSupplementAuthoritativeUnits += delta;
      }
    }

    if (supplementedUnits > 0) {
      unitDiagnostics.parcelsWithTitleFallback += 1;
    }

    return { supplementedUnits, supplementedBuildings };
  };


  // K-APT에서 총세대수가 정상 확인된 단지만 먼저 집계한다.
  const kaptCoveredParcels = new Set();
  const kaptPositiveElevatorParcels = new Set();
  for (const complex of normalizedKapt) {
    const matchedParcelKeys = [];
    const boundParcelKey = cleanBuildingText(
      complex?.scopeParcelKey ?? complex?.__scopeParcelKeyV46
    );
    if (
      boundParcelKey &&
      unitSource.parcels.some((parcelResult) => parcelResult?.parcel?.key === boundParcelKey)
    ) {
      matchedParcelKeys.push(boundParcelKey);
```

## supplementTitleUnitEvidence #2

```js
rcelMatches.length > 1) unitDiagnostics.ambiguousParentCandidates += 1;
      }

      const parentRow = representativeMatch?.row || null;
      const parentClassification = parentRow
        ? buildingHousingClassification(parentRow)
        : buildingHousingClassification(candidate.row);
      const unitType = classifyDeliveryUnit(candidate.row, parentClassification, {
        floorRows: parcelResult.floorRows || [],
        parentRow,
        parcelMatches,
      });

      // V48: K-APT가 이 필지의 총세대수를 공식값으로 제공하면 residential 전유호는
      // Building HUB의 부모 분류가 잘못되어 있어도 중복 합산하지 않는다. commercial은 계속 센다.
      if (coveredByKapt && unitType === "residential") {
        continue;
      }

      const parentKey = parentRow
        ? (buildingRecordKey(parentRow) || parcelKey)
        : `${parcelKey}|AMBIGUOUS|${normalizeBuildingDongMatchKey(unitDongName(candidate.row)) || "UNIT"}`;
      const parentUnitCount = candidateUnitCountByBuilding.get(parentKey) || 1;
      const elevator = parentRow
        ? buildingElevatorProfile(
            parentRow,
            parentClassification,
            parcelMatches,
            {
              unitCount: parentUnitCount,
              elevatorFacilityRows: elevatorFacilityRowsFor(parentRow),
              sharedElevatorEvidence,
            }
          )
        : {
            category: "unknown",
            reason: "missing_parent_title",
            floors: 0,
            heightM: 0,
            passenger: 0,
            emergency: 0,
            unitCount: parentUnitCount,
            inferenceRules: [],
          };

      addCount(unitType, 1, parentKey, elevator, {
        source: candidate.source === "area"
          ? "BUILDING_HUB_EXCLUSIVE_AREA_UNIT"
          : "BUILDING_HUB_EXCLUSIVE_UNIT",
        name: cleanBuildingText(
          parentRow?.bldNm ?? parentRow?.bld_nm ??
          candidate.row?.bldNm ?? candidate.row?.bld_nm
        ) || null,
        address: parentRow
          ? buildingRecordAddresses(parentRow).preferredAddress || null
          : buildingRecordAddresses(candidate.row).preferredAddress || null,
      }, "authoritative");
      countedOnParcel += 1;
      exclusiveUnits += 1;
      countedUnitCountByBuilding.set(
        parentKey,
        (countedUnitCountByBuilding.get(parentKey) || 0) + 1
      );
    }

    if (countedOnParcel > 0) {
      unitDiagnostics.parcelsWithExclusiveUnits += 1;
      const countedElevatorBuildings = new Set();
      // 핵심 보정: 같은 필지에서 전유부가 일부라도 잡혔다고 해서 나머지
      // 표제부 건물을 통째로 버리지 않는다. 건물별 전유호 수와 표제부의
      // 명시 호수/연면적·층수 추정치를 비교해 부족한 차이만 보충한다.
      supplementTitleUnitEvidence(
        parcelMatches,
        parcelKey,
        coveredByKapt,
        countedUnitCountByBuilding,
        "EXCLUSIVE_RECONCILE",
        parcelResult.floorRows || [],
        elevatorEvidenceRows,
        parcelResult.parcel,
        sharedElevatorEvidence
      );

      for (const match of parcelMatches) {
        const buildingKey = buildingRecordKey(match.row) || parcelKey;
        if (countedElevatorBuildings.has(buildingKey)) continue;
        countedElevatorBuildings.add(buildingKey);

        const classification = buildingHousingClassification(match.row);
        const elevator = buildingElevatorProfile(
          match.row,
          classification,
          parcelMatches,
          {
            unitCount: countedUnitCountByBuilding.get(buildingKey) || 0,
            elevatorFacilityRows: elevatorFacilityRowsFor(match.row),
            sharedElevatorEvidence,
          }
        );
        totals.passengerElevatorCount += elevator.passenger;
        totals.emergencyElevatorCount += elevator.emergency;
      }
      continue;
    }


    // 일부 구축 집합건축물은 전유부 API가 비어도 주택가격 대장에는
    // 전유부 관리 PK가 남아 있다. 전유부/전유공용면적이 0건일 때만 사용한다.
    const housePriceUnitKeys = new Set();
    for (const row of parcelResult.housePriceRows || []) {
      const registerKind = cleanBuildingText(
        publicDataField(row, "regstrKindCdNm", "regstr_kind_cd_nm")
      );
      const ho = unitHoName(row);
      const pk = cleanBuildingText(
        publicDataField(row, "mgmBldrgstPk", "mgm_bldrgst_pk")
      );
      if (!pk) continue;
      if (!ho && !/전유/.test(registerKind)) continue;
      housePriceUnitKeys.add(pk);
    }

    if (housePriceUnitKeys.size > 0) {
      const representative = parcelMatches[0] || null;
      const parentRow = representative?.row || null;
      const classification = parentRow
        ? buildingHousingClassification(parentRow)
        : { residential: true, commercial: false, apartment: false };
      const units = housePriceUnitKeys.size;
      const elevator = parentRow
        ? buildingElevatorProfile(
            parentRow,
            classification,
            parcelMatches,
            {
              unitCount: units,
              elevatorFacilityRows: elevatorFacilityRowsFor(parentRow),
              sharedElevatorEvidence,
            }
          )
        : {
            category: "unknown",
            reason: "missing_parent_title",
            floors: 0,
            heightM: 0,
            passenger: 0,
            emergency: 0,
            unitCount: units,
            inferenceRules: [],
          };

      const housePriceSplit = splitBuildingUnitsByUse(
        units,
        classification,
        parcelResult.floorRows || [],
        parentRow,
        parcelMatches
      );
      for (const part of housePriceSplit) {
        addCount(part.type, part.units, `house-price:${parcelKey}`, elevator, {
          source: "BUILDING_HUB_HOUSE_PRICE_UNIT",
          name: cleanBuildingText(parentRow?.bldNm ?? parentRow?.bld_nm) || null,
          address: parentRow
            ? buildingRecordAddresses(parentRow).preferredAddress || null
            : null,
          estimateDetails: {
            mixedUseSplitMethod: part.method || null,
            floorDistribution: part.distribution || null,
          },
        }, "authoritative");
        if (classification?.mixedUse) {
          if (part.type === "residential") unitDiagnostics.mixedUseResidentialUnits += part.units;
          if (part.type === "commercial") unitDiagnostics.mixedUseCommercialUnits += part.units;
        }
      }
      if (classification?.mixedUse && housePriceSplit.length > 1) unitDiagnostics.mixedUseSplitBuildings += 1;
      unitDiagnostics.parcelsWithHousePriceFallback += 1;
      totals.passengerElevatorCount += elevator.passenger || 0;
      totals.emergencyElevatorCount += elevator.emergency || 0;
      continue;
    }

    const recap = bestRecapFallback(parcelResult.recapRows);
    if (recap && !(coveredByKapt && recap.classification.apartment)) {
      const titleForElevator = parcelMatches.find((match) => {
        const classification = buildingHousingClassification(match.row);
        return classifica
```

## function addCount

_not found_

## const addCount #1

```js
{
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
      );

      if (fallback.classification?.mixedUse && split.length > 1) {
        unitDiagnostics.mixedUseSplitBuildings += 1;
      }

      for (const part of split) {
        addCount(part.type, part.units, buildingKey, elevator, {
          source: fallback.confidence === "estimated"
            ? `BUILDING_HUB_${sourceTag}_AREA_ESTIMATE`
            : `BUILDING_HUB_${sourceTag}_EXPLICIT_COUNT`,
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
          if (part.type === "residential") unitDiagnostics.mixedUseResi
```

## BUILDING_STATS_SOURCE_VERSION #1

```js
n_building_stats 캐시 확인
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
const BUILDING_SCOPE_DIRECT_TITLE_EVIDENCE_MAX = 1024;
const BUILDING_SCOPE_DIRECT_TITLE_CONCURRENCY = 6;
const BUILDING_SCOPE_DIRECT_TITLE_MAX_VARIANTS = 6;
const BUILDING_SCOPE_DIRECT_TITLE_TIMEOUT_MS = 9000;

// 법정동 전체 전유부를 페이지 단위로 한 번에 읽어 폴리곤 내부 필지만 필터링한다.
// 기존의 "필지당 1회" 상세조회는 Cloudflare subrequest 한도 때문에 전체 빌라를 누락했다.
const BUILDING_BULK_UNIT_MAX_DONGS = 2;
const BUILDING_BULK_UNIT_MAX_PAGES_PER_DONG = 10;
const BUILDING_BULK_UNIT_MAX_PAGES_TOTAL = 16;
const BUILDING_BULK_UNIT_CONCURRENCY = 2;
const BUILDING_BULK_UNIT_TIMEOUT_MS = 22000;
const BUILDING_BULK_UNIT_MAX_ROWS = 50000;

// 공식 세대/호수/전유부가 없는 구축 일반지번은 표제부의 면적·층수로
// 배송호수를 추정한다. 추정값은 authoritative와 분리하고 정상 1년 캐시로 저장하지 않는다.
const BUILDING_ESTIMATE_RESIDENTIAL_GROSS_M2 = 65;
const BUILDING_ESTIMATE_OFFICETEL_GROSS_M2 = 45;
const BUILDING_ESTIMATE_DAGAGU_GROSS_M2 = 72;
const BUILDING_ESTIMATE_COMMERCIAL_GROSS_M2 = 55;
const BUILDING_ESTIMATE_MAX_UNITS_PER_FLOOR = 6;

function normalizeBuildingStatsScope(body) {
  
```

## BUILDING_STATS_SOURCE_VERSION #2

```js
t: numberValue(
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
    return false;
  }

  // 과거 로직이 건물마다 최소 1호만 넣은 캐시는 "정상 1호 이상"이어도 재사용하지 않는다.
  if (isSuspiciousOnePerBuildingCache(row)) return false;

  // 과거 로직이 승강기 0을 무조건 "없음"으로 확정한 캐시도 다시 계산한다.
  if (isSuspiciousElevatorCache(row)) return false;

  return isUsableBuildingStatsCache(row, geometryHash);
}

function normalizeLegalDongCodes(body) {
  const source = [];

  const addCode = (value, sourceName = "unknown") => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length !== 10) return;
    const bjdongCd = digits.slice(5, 10);
    const suffixNumber = Number(bjdongCd);
    source.push({
      code: digits,
      source: sourceName,
      likelyLegalDong: Number.isFinite(suffixNumber) && suffixNumber > 0 && suffixNumber < 50000,
    });
  };

  const addValue = (value, sourceName = "body") => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => addValue(item, sourceName));
      return;
    }
    if (typeof value === "object") {
      const directCode = value.legalDongCode ?? value.legal_dong_code ?? value.bCode ?? value.b_code ?? value.code;
      if (directCode != null) addCode(directCode, value.source || sourceName);
      const sigunguCd = String(value.sigunguCd ?? value.sigungu_cd ?? "").replace(/\D/g, "");
      const bjdongCd = String(value.bjdongCd ?? value.bjdong_cd ?? "").replace(/\D/g, "");
      if (sigunguCd.length === 5 && bjdongCd.length === 5) addCode(sigunguCd + bjdongCd, value.source || sourceName);
      return;
    }
    addCode(value, sourceName);
  };

  addValue(body?.legalDongCodes, "legalDongCodes");
  addValue(body?.legal_dong_codes, "legal_dong_codes");
  addValue(body?.legalDongCodeCandidates, "legalDongCodeCandidates");
  addValue(body?.legal_dong_code_candidates, "legal_dong_code_candidates");
  addValue(body?.legalDongCode, "legalDongCode");
  addValue(body?.legal_dong_code, "legal_dong_code");
  addValue(body?.lgvReplcCd, "lgvReplcCd");
  addValue(body?.lgv_replc_cd, "lgv_replc_cd");
  addValue(body?.metadata?.lgvReplcCd, "metadata.lgvReplcCd");

  const sigunguCd = String(body?.sigunguCd ?? body?.sigungu_cd ?? "").replace(/\D/g, "");
  const bjdongCd = String(body?.bjdongCd ?? body?.bjdong_cd ?? "").replace(/\D/g, "");
  if (sigunguCd.length === 5 && bjdongCd.length === 5) addCode(sigunguCd + bjdongCd, "splitCode");

  const deduped = new Map();
  for (const row of source) {
    const previous = deduped.get(row.code);
    if (!previous || (!previous.likelyLegalDong && row.likelyLegalDong)) deduped.set(row.code, row);
  }

  return [...deduped.value
```

## BUILDING_STATS_SOURCE_VERSION #3

```js
lding_count
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
    return false;
  }

  // 과거 로직이 건물마다 최소 1호만 넣은 캐시는 "정상 1호 이상"이어도 재사용하지 않는다.
  if (isSuspiciousOnePerBuildingCache(row)) return false;

  // 과거 로직이 승강기 0을 무조건 "없음"으로 확정한 캐시도 다시 계산한다.
  if (isSuspiciousElevatorCache(row)) return false;

  return isUsableBuildingStatsCache(row, geometryHash);
}

function normalizeLegalDongCodes(body) {
  const source = [];

  const addCode = (value, sourceName = "unknown") => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length !== 10) return;
    const bjdongCd = digits.slice(5, 10);
    const suffixNumber = Number(bjdongCd);
    source.push({
      code: digits,
      source: sourceName,
      likelyLegalDong: Number.isFinite(suffixNumber) && suffixNumber > 0 && suffixNumber < 50000,
    });
  };

  const addValue = (value, sourceName = "body") => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => addValue(item, sourceName));
      return;
    }
    if (typeof value === "object") {
      const directCode = value.legalDongCode ?? value.legal_dong_code ?? value.bCode ?? value.b_code ?? value.code;
      if (directCode != null) addCode(directCode, value.source || sourceName);
      const sigunguCd = String(value.sigunguCd ?? value.sigungu_cd ?? "").replace(/\D/g, "");
      const bjdongCd = String(value.bjdongCd ?? value.bjdong_cd ?? "").replace(/\D/g, "");
      if (sigunguCd.length === 5 && bjdongCd.length === 5) addCode(sigunguCd + bjdongCd, value.source || sourceName);
      return;
    }
    addCode(value, sourceName);
  };

  addValue(body?.legalDongCodes, "legalDongCodes");
  addValue(body?.legal_dong_codes, "legal_dong_codes");
  addValue(body?.legalDongCodeCandidates, "legalDongCodeCandidates");
  addValue(body?.legal_dong_code_candidates, "legal_dong_code_candidates");
  addValue(body?.legalDongCode, "legalDongCode");
  addValue(body?.legal_dong_code, "legal_dong_code");
  addValue(body?.lgvReplcCd, "lgvReplcCd");
  addValue(body?.lgv_replc_cd, "lgv_replc_cd");
  addValue(body?.metadata?.lgvReplcCd, "metadata.lgvReplcCd");

  const sigunguCd = String(body?.sigunguCd ?? body?.sigungu_cd ?? "").replace(/\D/g, "");
  const bjdongCd = String(body?.bjdongCd ?? body?.bjdong_cd ?? "").replace(/\D/g, "");
  if (sigunguCd.length === 5 && bjdongCd.length === 5) addCode(sigunguCd + bjdongCd, "splitCode");

  const deduped = new Map();
  for (const row of source) {
    const previous = deduped.get(row.code);
    if (!previous || (!previous.likelyLegalDong && row.likelyLegalDong)) deduped.set(row.code, row);
  }

  return [...deduped.values()]
    .sort((a, b) => {
      if (a.likelyLegalDong !== b.likelyLegalDong) return a.likelyLegalDong ? -1 : 1;
      return a.code.localeCompare(b.code);
    })
    .slice(0, BUILDING_HUB_MAX_LEGAL_DONG_CODES)
    .map((row) => ({
      legalDongCode: row.code,
      sigunguCd: row.code.slice(0, 5),
      bjdongCd: row.code.slice(5, 10),
      likelyLegalDong: row.likel
```

## BUILDING_STATS_SOURCE_VERSION #4

```js
g(geometryHash || "")) {
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
    return false;
  }

  // 과거 로직이 건물마다 최소 1호만 넣은 캐시는 "정상 1호 이상"이어도 재사용하지 않는다.
  if (isSuspiciousOnePerBuildingCache(row)) return false;

  // 과거 로직이 승강기 0을 무조건 "없음"으로 확정한 캐시도 다시 계산한다.
  if (isSuspiciousElevatorCache(row)) return false;

  return isUsableBuildingStatsCache(row, geometryHash);
}

function normalizeLegalDongCodes(body) {
  const source = [];

  const addCode = (value, sourceName = "unknown") => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length !== 10) return;
    const bjdongCd = digits.slice(5, 10);
    const suffixNumber = Number(bjdongCd);
    source.push({
      code: digits,
      source: sourceName,
      likelyLegalDong: Number.isFinite(suffixNumber) && suffixNumber > 0 && suffixNumber < 50000,
    });
  };

  const addValue = (value, sourceName = "body") => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => addValue(item, sourceName));
      return;
    }
    if (typeof value === "object") {
      const directCode = value.legalDongCode ?? value.legal_dong_code ?? value.bCode ?? value.b_code ?? value.code;
      if (directCode != null) addCode(directCode, value.source || sourceName);
      const sigunguCd = String(value.sigunguCd ?? value.sigungu_cd ?? "").replace(/\D/g, "");
      const bjdongCd = String(value.bjdongCd ?? value.bjdong_cd ?? "").replace(/\D/g, "");
      if (sigunguCd.length === 5 && bjdongCd.length === 5) addCode(sigunguCd + bjdongCd, value.source || sourceName);
      return;
    }
    addCode(value, sourceName);
  };

  addValue(body?.legalDongCodes, "legalDongCodes");
  addValue(body?.legal_dong_codes, "legal_dong_codes");
  addValue(body?.legalDongCodeCandidates, "legalDongCodeCandidates");
  addValue(body?.legal_dong_code_candidates, "legal_dong_code_candidates");
  addValue(body?.legalDongCode, "legalDongCode");
  addValue(body?.legal_dong_code, "legal_dong_code");
  addValue(body?.lgvReplcCd, "lgvReplcCd");
  addValue(body?.lgv_replc_cd, "lgv_replc_cd");
  addValue(body?.metadata?.lgvReplcCd, "metadata.lgvReplcCd");

  const sigunguCd = String(body?.sigunguCd ?? body?.sigungu_cd ?? "").replace(/\D/g, "");
  const bjdongCd = String(body?.bjdongCd ?? body?.bjdong_cd ?? "").replace(/\D/g, "");
  if (sigunguCd.length === 5 && bjdongCd.length === 5) addCode(sigunguCd + bjdongCd, "splitCode");

  const deduped = new Map();
  for (const row of source) {
    const previous = deduped.get(row.code);
    if (!previous || (!previous.likelyLegalDong && row.likelyLegalDong)) deduped.set(row.code, row);
  }

  return [...deduped.values()]
    .sort((a, b) => {
      if (a.likelyLegalDong !== b.likelyLegalDong) return a.likelyLegalDong ? -1 : 1;
      return a.code.localeCompare(b.code);
    })
    .slice(0, BUILDING_HUB_MAX_LEGAL_DONG_CODES)
    .map((row) => ({
      legalDongCode: row.code,
      sigunguCd: row.code.slice(0, 5),
      bjdongCd: row.code.slice(5, 10),
      likelyLegalDong: row.likelyLegalDong,
      source: row.source,
    }));
}

function publicDataServiceKey(env) {
  const raw = requireEnv(env, "BUILDING_HUB_SERVICE_KEY").trim();

  if (!raw.includes("%")) return raw;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function publicDataRetryableStatus(status) {
  const value = Number(status) || 0;
  return value === 0 || value === 408 || value === 425 || value === 429 || value >= 500;
}

function publicDataRetryableError(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  const gatewayCode = String(error?.publicDataGateway?.code || "");
  return (
    gatewayCode === "04" || gatewayCode === "05" || gatewayCode === "23" ||
    name === "aborterror" || message.includes("timeout") || message.includes("network") ||
    message.includes("fetch failed") || message.includes("connection")
  );
}

async function waitForPublicDataRetry(attempt) {
  const delay = PUBLIC_DATA_RETRY_BASE_DELAY_MS * Math.max(1, Number(attempt) || 1);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function buildingHubResponseItems(data) {
  const parts = publicDataResponseParts(data, "Bui
```

## BUILDING_STATS_SOURCE_VERSION #5

```js
nt: totals.residentialUnitCount,
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
          name: row.name || null,
          address: row.ad
```

## BUILDING_STATS_SOURCE_VERSION #6

```js
s.commercialUnknownElevatorUnitCount,
    sourceRecordCount: Number(prepared?.sourceRecordCount || matches.length),
    matchedBuildingCount: matches.length,
    residentialBuildingCount: residentialBuildings.size,
    geocodedBuildingCount: Number(prepared?.geocodedBuildingCount || 0),
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
// 3) K-APT is an apartment-only enrichment source. It never p
```

