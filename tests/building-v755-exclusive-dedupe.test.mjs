import {readFileSync} from "node:fs";
import {strict as assert} from "node:assert";
import vm from "node:vm";
const src = readFileSync(".diagnostics/building_v754/reconcile_v755.js","utf8");
const c=vm.createContext({console});
vm.runInContext(src+";globalThis.reconcile=v755ReconcileExclusiveBuckets;",c);
function sample(expos,res,commercial,unknown){
  const classified=res+commercial;
  return {residentialUnitCount:res+1036,commercialUnitCount:commercial+25,
    unclassifiedUnitCount:unknown,deliveryUnitCount:res+1036+commercial+25+unknown,
    exclusiveUnitRecordCount:2*expos,confirmedElevatorUnitCount:res+commercial+unknown+1036,
    noElevatorUnitCount:25,unknownElevatorUnitCount:0,
    breakdown:{contributions:[
      {source:"DETAIL_EXCLUSIVE",buildingKey:"abc",meta:{parcelKey:"p"},bucket:"residential",units:res,elevatorStatus:"yes"},
      {source:"DETAIL_EXCLUSIVE",buildingKey:"abc",meta:{parcelKey:"p"},bucket:"commercial",units:commercial,elevatorStatus:"yes"},
      {source:"DETAIL_EXCLUSIVE",buildingKey:"abc",meta:{parcelKey:"p"},bucket:"unclassified",units:unknown,elevatorStatus:"yes"}],
      source:{unitDiagnostics:{exposRows:expos,candidateUnits:2*expos}},
      dataQuality:{deliveryUnitCount:res+1036+commercial+25+unknown},
      elevator:{unitCounts:{confirmed:res+commercial+unknown+1036,none:25,unknown:0}},
      algorithm:{rules:{}}}};
}
const a=sample(734,732,2,732); c.reconcile(a);
assert.equal(a.deliveryUnitCount,1795);
assert.equal(a.unclassifiedUnitCount,0);
assert.equal(a.exclusiveUnitRecordCount,734);
assert.equal(a.confirmedElevatorUnitCount,1770);
assert.equal(a.breakdown.contributions.length,2);
assert.equal(a.breakdown.dataQuality.deliveryUnitCount,1795);
const b=sample(899,897,2,899);c.reconcile(b);
assert.equal(b.unclassifiedUnitCount,0);assert.equal(b.exclusiveUnitRecordCount,899);
const legit=sample(734,732,2,732);legit.exclusiveUnitRecordCount=734;c.reconcile(legit);
assert.equal(legit.unclassifiedUnitCount,732,"without evidence do not delete legitimate unclassified");
const partial=sample(734,732,2,732);partial.breakdown.contributions[2].buildingKey="elsewhere";c.reconcile(partial);
assert.equal(partial.unclassifiedUnitCount,732,"different building cannot be deduplicated");
console.log("PASS: 03902 / 03918 exact duplicated source buckets removed, unrelated/uncertain preserved");
