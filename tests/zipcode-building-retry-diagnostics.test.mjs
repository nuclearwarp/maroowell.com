import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("public/zipcode_search","utf8");
assert(html.includes("const BUILDING_STATS_FETCH_RETRY_COUNT = 2;"));
assert(html.includes("const BUILDING_STATS_FETCH_RETRY_DELAY_MS = 15000;"));
assert(html.includes("data-building-log="));
assert(html.includes("rows.slice(-400)"));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
let n=0;
for(const [,source] of scripts) if(source.trim()){new Function(source);n++}
assert(n>0);
const begin=html.indexOf("      function transientBuildingResponse(error) {");
const end=html.indexOf("      function downloadBuildingRequestLog()",begin);
assert(begin>0&&end>begin);
const f=new Function("isBuildingAuthRejected","BUILDING_STATS_FETCH_RETRY_DELAY_MS",html.slice(begin,end)+";return {transientBuildingResponse,buildingRetryDelay};")(
()=>false,15000);
assert.equal(f.transientBuildingResponse({httpStatus:503,message:"Building HUB expos [05]"}),true);
assert.equal(f.transientBuildingResponse({httpStatus:200,message:"Building HUB area: upstream HTTP 200 empty body"}),true);
assert.equal(f.transientBuildingResponse({httpStatus:0,message:"no geometry"}),false);
assert.equal(f.buildingRetryDelay({responseData:{}},0),15000);
assert.equal(f.buildingRetryDelay({responseData:{}},1),45000);
assert.equal(f.buildingRetryDelay({responseData:{retryAfterSeconds:70}},0),70000);
console.log("PASS: scripts, provider transient detection, capped 15/45s recovery, capped diagnostics");
