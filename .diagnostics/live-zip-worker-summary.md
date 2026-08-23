# Live Cloudflare building Worker target block

worker: purple-resonance-61ea

```text
v2_http=200
bytes=489449
content_type=multipart/form-data; boundary=43f02777e8c08b02129461b4aa4af4e309891faca17c153a89ed56152b4e
source_sha256=27506de4374c9fad9fd6cfd2f3c83ed8d7a1a10c96c84d5e470c9a87014159b1
source_version=BUILDING_HUB_KAPT_V66_HSPMS_WELFARE_RESCUE_2026-08-15
target_start=317152 target_end=335540
```

## Aggregation block

```js
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
    }

    for (const parcelResult of unitSource.parcels) {
      const matches = parcelTitleMatches(parcelResult.parcel, indexes);
      if (kaptMatchesTitleParcel(complex, matches)) {
        matchedParcelKeys.push(parcelResult.parcel.key);
      }
    }

    const uniqueMatchedParcelKeys = [...new Set(matchedParcelKeys)];
    for (const key of uniqueMatchedParcelKeys) kaptCoveredParcels.add(key);

    const elevator = kaptElevatorAvailability(complex);
    if (elevator.category === "confirmed") {
      for (const key of uniqueMatchedParcelKeys) kaptPositiveElevatorParcels.add(key);
    }

    const key = complex.key || `kapt:${complex.kaptCode}`;
    addCount(
      "residential",
      complex.households,
      key,
      elevator,
      {
        source: "K_APT",
        name: complex.name || null,
        address: complex.address || null,
        // K-APT 총세대수는 단지 단위이므로 엘베 O/X 건물수도 공식 동수만큼 가중한다.
        buildingWeight: Math.max(1, Math.trunc(Number(complex.buildingCount) || 1)),
      },
      "authoritative"
    );
    totals.passengerElevatorCount += complex.elevatorCount;
  }

  for (const parcelResult of unitSource.parcels) {
    const parcelMatches = parcelTitleMatches(parcelResult.parcel, indexes);
    const parcelKey = parcelResult.parcel.key;
    const coveredByKapt = kaptCoveredParcels.has(parcelKey);
    const elevatorEvidenceRows = [
      ...(parcelResult.areaRows || []),
      ...(parcelResult.exposRows || []),
      ...(parcelResult.floorRows || []),
    ];
    const parcelPositiveTitleCount = parcelMatches.reduce((count, match) => {
      const info = buildingElevatorInfo(match?.row);
      return count + ((Number(info?.passenger) || 0) + (Number(info?.emergency) || 0) > 0 ? 1 : 0);
    }, 0);
    const parcelFacilityEvidenceRows = elevatorEvidenceRows.filter(
      hasRegisteredElevatorFacilityEvidence
    );
    const sharedElevatorEvidence = {
      kaptPositive: kaptPositiveElevatorParcels.has(parcelKey),
      titlePositive: parcelPositiveTitleCount > 0,
      facilityPositive: parcelFacilityEvidenceRows.length > 0,
      titlePositiveCount: parcelPositiveTitleCount,
      facilityCount: parcelFacilityEvidenceRows.length,
    };
    const elevatorFacilityRowsFor = (parentRow) =>
      elevatorFacilityRowsForBuilding(
        elevatorEvidenceRows,
        parentRow,
        parcelResult.parcel,
        indexes,
        parcelMatches
      );

    unitDiagnostics.areaRows += (parcelResult.areaRows || []).length;
    unitDiagnostics.exposRows += (parcelResult.exposRows || []).length;
    unitDiagnostics.floorRows += (parcelResult.floorRows || []).length;
    unitDiagnostics.recapRows += (parcelResult.recapRows || []).length;
    unitDiagnostics.housePriceRows += (parcelResult.housePriceRows || []).length;

    const candidateMap = new Map();
    const mergeCandidate = (row, source) => {
      if (!row) return;
      if (isCommonAreaUnitRecord(row)) {
        commonAreaRecordCount += 1;
        return;
      }
      if (source === "area" && !isExclusiveAreaUnitRecord(row)) return;
      // 전유공용면적은 호명칭이 있어야 여러 면적행을 한 배송호로 합칠 수 있다.
      if (source === "area" && !unitHoName(row)) return;

      const key = unitRecordKey(row, parcelKey);
      if (!key) return;
      const previous = candidateMap.get(key);
      if (!previous || unitCandidateQuality(row) > unitCandidateQuality(previous.row)) {
        candidateMap.set(key, { key, row, source });
      }
    };

    for (const row of parcelResult.areaRows || []) mergeCandidate(row, "area");
    for (const row of parcelResult.exposRows || []) mergeCandidate(row, "expos");

    const unitCandidates = [...candidateMap.values()];
    unitDiagnostics.candidateUnits += unitCandidates.length;

    const candidateUnitCountByBuilding = new Map();
    const countedUnitCountByBuilding = new Map();
    for (const candidate of unitCandidates) {
      const parentMatch = findParentTitleMatch(
        candidate.row,
        parcelResult.parcel,
        indexes
      );
      const representativeMatch = parentMatch || (parcelMatches.length === 1 ? parcelMatches[0] : null);
      const parentRow = representativeMatch?.row || null;
      const key = parentRow
        ? (buildingRecordKey(parentRow) || parcelKey)
        : `${parcelKey}|AMBIGUOUS|${normalizeBuildingDongMatchKey(unitDongName(candidate.row)) || "UNIT"}`;
      candidateUnitCountByBuilding.set(
        key,
        (candidateUnitCountByBuilding.get(key) || 0) + 1
      );
    }

    let countedOnParcel = 0;

    for (const candidate of unitCandidates) {
      if (!candidate.key || countedUnits.has(candidate.key)) continue;
      countedUnits.add(candidate.key);

      const parentMatch = findParentTitleMatch(
        candidate.row,
        parcelResult.parcel,
        indexes
      );
      const representativeMatch = parentMatch || (parcelMatches.length === 1 ? parcelMatches[0] : null);
      if (!parentMatch) {
        unitDiagnostics.parentlessCandidates += 1;
        if (parcelMatches.length > 1) unitDiagnostics.ambiguousParentCandidates += 1;
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
        return classification.housingType === recap.classification.housingType;
      }) || parcelMatches[0];
      const elevator = titleForElevator
        ? buildingElevatorProfile(
            titleForElevator.row,
            recap.classification,
            parcelMatches,
            {
              unitCount: recap.units,
              elevatorFacilityRows: elevatorFacilityRowsFor(titleForElevator.row),
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
            unitCount: recap.units,
            inferenceRules: [],
          };
      const recapSplit = splitBuildingUnitsByUse(
        recap.units,
        recap.classification,
        parcelResult.floorRows || [],
        recap.row,
        parcelMatches
      );
      for (const part of recapSplit) {
        addCount(part.type, part.units, `recap:${parcelKey}`, elevator, {
          source: "BUILDING_HUB_RECAP_TITLE",
          name: cleanBuildingText(recap.row?.bldNm ?? recap.row?.bld_nm) || null,
          address: buildingRecordAddresses(recap.row).preferredAddress || null,
          estimateDetails: {
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
    (sum, 
```
