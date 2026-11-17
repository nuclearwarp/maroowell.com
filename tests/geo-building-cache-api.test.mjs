import assert from "node:assert/strict";
import worker from "../worker.js";
import {handleGeoBuildingsApi,geoBuildingInternals} from "../geo_building_service.js";

const polygon={type:"Polygon",coordinates:[[[126.895,37.492],[126.904,37.492],[126.904,37.498],[126.895,37.498],[126.895,37.492]]]};
const p=geoBuildingInternals.collectGeometry(polygon);
assert.deepEqual(p.bbox,[126.895,37.492,126.904,37.498]);
const tiles=geoBuildingInternals.keysForBbox(p.bbox);
assert.equal(tiles.length,2);
assert.throws(()=>geoBuildingInternals.collectGeometry({type:"Point",coordinates:[127,37]}),/Polygon/);
assert.throws(()=>geoBuildingInternals.collectGeometry({type:"Polygon",coordinates:[[[126,37],[127,37],[126,38],[127,38]]]}),/closed/);
assert.throws(()=>geoBuildingInternals.keysForBbox([126,37,127,38]),/36/);

const feature={
 type:"Feature",id:1,
 properties:{objectid:1,building_id:"building-1",bsi_zon_no:"07420",street_name:"도림천로13길",house_number:"7"},
 geometry:{type:"Polygon",coordinates:[[[126.898,37.494],[126.8981,37.494],[126.8981,37.4941],[126.898,37.494]]]}
};
const coverage=new Map();
let imports=0,origins=0;
const database=async(_env,path,init)=>{
 const url=new URL("https://db.test"+path);
 if(url.pathname==="/rest/v1/mw_geo_cache_coverage"){
   const keys=(url.searchParams.get("cache_key")||"").match(/(?:zip:\d{5}|tile:\d+:\d+)/g)||[];
   return keys.map(k=>coverage.get(k)).filter(Boolean);
 }
 if(!url.pathname.startsWith("/rest/v1/rpc/"))throw Error("unknown db call "+path);
 const action=url.pathname.split("/").at(-1),body=JSON.parse(init.body);
 if(action==="mw_geo_claim"){
   const old=coverage.get(body.p_key);
   if(old)return false;
   coverage.set(body.p_key,{cache_key:body.p_key,state:"loading",expires_at:null,locked_until:new Date(Date.now()+120000).toISOString()});
   return true;
 }
 if(action==="mw_geo_upsert"){imports+=body.p_features.length;return body.p_features.length;}
 if(action==="mw_geo_finish"){
   coverage.set(body.p_key,{cache_key:body.p_key,state:"ready",expires_at:new Date(Date.now()+86400000).toISOString(),locked_until:null});
   return true;
 }
 if(action==="mw_geo_link_scope"){
   assert.equal(body.p_type,"zipcode");
   assert.equal(body.p_pk,"07420");
   assert.match(body.p_hash,/^[0-9a-f]{64}$/);
   return true;
 }
 if(action==="mw_geo_query")return {type:"FeatureCollection",features:[feature],total:1,hasMore:false,offset:body.p_offset,limit:body.p_limit,source:"MOIS_KR_Buildings_v2"};
 throw Error("unknown rpc "+action);
};
const saved=globalThis.fetch;
globalThis.fetch=async input=>{
 const src=new URL(String(input));assert.equal(src.hostname,"portal.esrikr.com");
 origins++;
 return new Response(JSON.stringify({type:"FeatureCollection",features:[feature]}),{status:200,headers:{"content-type":"application/json"}});
};
const context=(url,method="GET",body)=>({
 request:new Request(url,{method,headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined}),
 url:new URL(url),env:{},database,key:{id:"test",client_code:"chunwoo"},audit:async()=>{}
});
try{
 const zip=await handleGeoBuildingsApi(context("https://api.test/api/v1/buildings?zipcode=07420"));
 assert.equal(zip.status,200);
 const result=await zip.json();assert.equal(result.total,1);assert.equal(result.status,"ready");assert.equal(result.coverage,"complete");
 assert.equal(origins,1);
 const again=await handleGeoBuildingsApi(context("https://api.test/api/v1/buildings?zipcode=07420"));
 assert.equal(again.status,200);assert.equal(origins,1,"second request hits DB and never external API");
 const requestUrl="https://api.test/api/v1/buildings/query";
 const first=await handleGeoBuildingsApi(context(requestUrl,"POST",{polygon,limit:50}));
 assert.equal(first.status,202,"only one tile warmed per request");
 const second=await handleGeoBuildingsApi(context(requestUrl,"POST",{polygon,limit:50}));
 assert.equal(second.status,200);
 assert.equal((await second.json()).features[0].properties.street_name,"도림천로13길");
 assert.equal(imports,3);
 const third=await handleGeoBuildingsApi(context(requestUrl,"POST",{polygon}));
 assert.equal(third.status,200);assert.equal(origins,3,"polygon cache shared across later callers");
 const pendingKey="tile:12700:3750";
 coverage.set(pendingKey,{cache_key:pendingKey,state:"loading",expires_at:null,locked_until:new Date(Date.now()+120000).toISOString()});
 const small={type:"Polygon",coordinates:[[[127.001,37.501],[127.004,37.501],[127.004,37.504],[127.001,37.501]]]};
 const busy=await handleGeoBuildingsApi(context(requestUrl,"POST",{polygon:small}));
 assert.equal(busy.status,202);assert.equal(busy.headers.get("Retry-After"),"3");
 assert.equal(origins,3,"in-progress tile must not refetch upstream");
 const unauthorized=await worker.fetch(new Request("https://api.test/api/v1/buildings?zipcode=07420"),{});
 assert.equal(unauthorized.status,401);
 const invalid=await handleGeoBuildingsApi(context(requestUrl,"POST",{polygon:{type:"Point",coordinates:[127,37]}})).catch(e=>e);
 assert.equal(invalid.status,400);
 console.log("PASS: auth gate, live cache fill, 202 on partial coverage, 200 on complete coverage, shared cache, shape validation");
}finally{globalThis.fetch=saved}
