import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const code=readFileSync("public/mw-building-parcel-source.js","utf8");
const route=readFileSync("public/coupangRouteMap.html","utf8");
const zip=readFileSync("public/zipcode_search","utf8");
new Function(code);
for(const [page,html] of [["route",route],["zip",zip]]){
  for(const [,js] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
    if(js.trim())assert.doesNotThrow(()=>new Function(js),page+" embedded script must parse");
  }
  assert(html.includes('mw-building-parcel-source.js?v=20261120-1'),page+" must load official parcels module");
  assert(html.includes('MOIS_BUILDING_MANAGEMENT_ID'),page+" payload must state exact source");
}
assert(!route.includes('const discovery=await discoverScopeParcelsForRoute(memoryKey,feature,force===true)'),"route must not use Kakao flood");
assert(zip.includes('scopeDiscovery = officialDiscovery;'),"ZIP must use official parcels");
let fetchCount=0;
const mkFeature=(objectid,building_id)=>({type:"Feature",id:objectid,
  properties:{objectid,building_id,bsi_zon_no:"07420",street_name:"도림천로15길",house_number:"17"},
  geometry:{type:"Polygon",coordinates:[[[126.897,37.49],[126.898,37.49],[126.898,37.491],[126.897,37.49]]]}});
const f=[mkFeature(1,"1156013300108430005005891"),mkFeature(2,"1156013300108430005005892"),mkFeature(3,"1156013300108440008004243")];
const fakeTurf={
  booleanPointInPolygon:()=>true,
  point:(p)=>({type:"Feature",geometry:{type:"Point",coordinates:p}}),
  pointOnFeature:()=>({geometry:{coordinates:[126.898,37.49]}}),
  intersect:()=>null,
  area:()=>1000
};
const ctx={window:{},Map,Set,Error,Number,Math,Date,JSON,String,Boolean,Array,RegExp,Promise,
  TextEncoder,AbortSignal,console,setTimeout,clearTimeout,
  fetch:async(_url,options)=>{
    fetchCount++;
    assert.equal(options.headers.Authorization,"Bearer test");
    const p=JSON.parse(options.body);
    assert.equal(p.limit,300);
    if(fetchCount===1)return new Response(JSON.stringify({status:"warming",retryAfterSeconds:0.001}),{status:202});
    return new Response(JSON.stringify({status:"ready",coverage:"complete",features:f,total:f.length,hasMore:false}));
  },Response};
vm.runInNewContext(code,ctx);
const api=ctx.window.MW_BUILDING_PARCEL_SOURCE;
assert.equal(api.buildingParcelIdentity("1156013300108430005005891").legalDongCode,"1156013300");
assert.equal(api.buildingParcelIdentity("1156013300108430005005891").parcelMainNo,"843");
assert.equal(api.buildingParcelIdentity("1156013300108430005005891").parcelSubNo,"5");
assert.equal(api.buildingParcelIdentity("no"),null);
const parsed=api.buildParcels(f,{type:"Polygon",coordinates:[[[126.89,37.48],[126.91,37.48],[126.91,37.50],[126.89,37.48]]]},fakeTurf,"07420");
assert.equal(parsed.parcels.length,2,"buildings on same parcel must deduplicate by legal parcel");
assert.equal(parsed.parcels[0].hitCount,2);
assert.equal(parsed.parcels[0].key,"11560|13300|1|0843|0005");
assert.equal(parsed.parcels[0].sourceType,"BUILDING_PARCEL");
assert.equal(parsed.legalDongCodes[0],"1156013300");
const geometry={type:"Polygon",coordinates:[[[126.89,37.48],[126.91,37.48],[126.91,37.50],[126.89,37.48]]]};
const output=await api.load(geometry,"test",{turf:fakeTurf,zipcode:"07420"});
assert.equal(output.parcels.length,2);
assert.equal(output.diagnostics.source,"MOIS_BUILDING_GEOMETRY_DB");
await api.load(geometry,"test",{turf:fakeTurf,zipcode:"07420"});
assert.equal(fetchCount,2,"same polygon should be memory cached without re-fetch");
console.log("PASS: official parcel identity, deduplication, ZIP and route integration, shared cache and warmup");
