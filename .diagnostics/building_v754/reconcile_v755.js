// V75.5: avoid counting the same complete Building HUB exclusive-unit source
// as both explicitly classified units and unclassified units.
// Applies only when page-complete raw source cardinality proves exact double counting.
function v755ReconcileExclusiveBuckets(aggregate) {
  const breakdown = aggregate && aggregate.breakdown;
  const contributions = breakdown && breakdown.contributions;
  const source = breakdown && breakdown.source && breakdown.source.unitDiagnostics;
  if (!Array.isArray(contributions) || !source) return aggregate;
  const receivedRows = Number(source.exposRows || 0);
  const countedRows = Number(aggregate.exclusiveUnitRecordCount || 0);
  // Require bucket-overlap proof at the same parent; partial duplicate passes are valid.
  if (!Number.isSafeInteger(receivedRows) || receivedRows <= 0 ||
      countedRows <= receivedRows || countedRows > receivedRows * 2) return aggregate;
  const groups = new Map();
  for (const row of contributions) {
    if (row.source !== 'DETAIL_EXCLUSIVE' || !row.buildingKey) continue;
    const key = String(row.buildingKey) + '|' + String(row.meta?.parcelKey || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let removed = 0;
  const kept = new Set();
  const removalsByElevator = {yes: 0, no: 0, unknown: 0};
  for (const list of groups.values()) {
    const classified = list.filter(r => r.bucket === 'residential' || r.bucket === 'commercial')
      .reduce((n, r) => n + Math.max(0, Number(r.units) || 0), 0);
    const unknown = list.filter(r => r.bucket === 'unclassified');
    const unknownTotal = unknown.reduce((n, r) => n + Math.max(0, Number(r.units) || 0), 0);
    if (classified <= 0 || unknownTotal <= 0 || unknownTotal > classified) continue;
    // Cannot prove duplicate raw-unit identity when multiple unknown chunks are present.
    if (unknown.length !== 1) continue;
    const row = unknown[0];
    const elevator = ['yes','no'].includes(row.elevatorStatus) ? row.elevatorStatus : 'unknown';
    removalsByElevator[elevator] += unknownTotal;
    removed += unknownTotal;
    kept.add(row);
  }
  if (!removed || removed > Number(aggregate.unclassifiedUnitCount || 0) ||
      countedRows - removed !== receivedRows) return aggregate;
  const nextConfirmed = Number(aggregate.confirmedElevatorUnitCount || 0) - removalsByElevator.yes;
  const nextNo = Number(aggregate.noElevatorUnitCount || 0) - removalsByElevator.no;
  const nextUnknown = Number(aggregate.unknownElevatorUnitCount || 0) - removalsByElevator.unknown;
  if (Math.min(nextConfirmed, nextNo, nextUnknown) < 0) return aggregate;
  aggregate.unclassifiedUnitCount -= removed;
  aggregate.deliveryUnitCount = aggregate.residentialUnitCount + aggregate.commercialUnitCount + aggregate.unclassifiedUnitCount;
  aggregate.exclusiveUnitRecordCount = receivedRows;
  aggregate.confirmedElevatorUnitCount = nextConfirmed;
  aggregate.noElevatorUnitCount = nextNo;
  aggregate.unknownElevatorUnitCount = nextUnknown;
  const counts = breakdown.elevator?.unitCounts;
  if (counts) {
    counts.confirmed = Math.max(0, Number(counts.confirmed || 0) - removalsByElevator.yes);
    counts.none = Math.max(0, Number(counts.none || 0) - removalsByElevator.no);
    counts.unknown = Math.max(0, Number(counts.unknown || 0) - removalsByElevator.unknown);
  }
  if (breakdown.dataQuality) {
    breakdown.dataQuality.deliveryUnitCount = aggregate.deliveryUnitCount;
    breakdown.dataQuality.duplicateExclusiveUnitsRemoved = removed;
  }
  if (breakdown.source?.unitDiagnostics) {
    breakdown.source.unitDiagnostics.candidateUnits = aggregate.exclusiveUnitRecordCount;
  }
  if (breakdown.algorithm?.rules) {
    breakdown.algorithm.rules.exclusiveBucketOverlapReconciled = 'V75_5_VERIFIED_DUPLICATE_PASS';
  }
  breakdown.contributions = contributions.filter(row => !kept.has(row));
  return aggregate;
}
