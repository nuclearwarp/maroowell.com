import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const html=readFileSync("public/zipcode_search","utf8");
const js=readFileSync("public/mw-zip-road-overlay.js","utf8");
assert(html.includes("/mw-zip-road-overlay.js?v=20261117-1"));
assert(html.includes("window.MW_ROAD_OVERLAY_BOOT({"));
assert(html.includes("state.roadOverlay?.onZipLoaded(zip)"));
assert(html.includes("state.roadOverlay?.onZipRemoved(zip)"));
assert(html.includes("state.roadOverlay?.reset()"));
for(const [,source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(source.trim())new Function(source)}
const ctx={window:{},console,Math,Number,String,Set,Map};
vm.runInNewContext(js,ctx);
const {extractRoadName,groupRoadSamples,selectEvenly}=ctx.window.MW_ROAD_OVERLAY_TOOLS;
assert.equal(extractRoadName({roadAddress:"서울특별시 영등포구 도림천로13길 12"}),"도림천로13길");
assert.equal(extractRoadName({roadAddress:"서울특별시 영등포구 도림천로11길 8"}),"도림천로11길");
assert.equal(extractRoadName({roadAddress:"서울특별시 영등포구 선유로 3"}),"선유로");
assert.equal(extractRoadName({roadAddress:"서울특별시 영등포구 당산동 123"}),"");
const items=[
 {lng:126.90,lat:37.50,roadAddress:"서울특별시 영등포구 도림천로13길 12"},
 {lng:126.91,lat:37.51,roadAddress:"서울특별시 영등포구 도림천로13길 13"},
 {lng:126.92,lat:37.52,roadAddress:"서울특별시 영등포구 도림천로11길 8"},
 {lng:126.93,lat:37.53,roadAddress:"서울특별시 영등포구 도림천로13길 12"},
];
const groups=groupRoadSamples(items);
assert.equal(groups.length,2);
assert.equal(groups[0].name,"도림천로13길");
assert.equal(groups[0].samples.length,3);
assert.equal(groups[0].addresses.size,2);
assert.equal(groups[1].name,"도림천로11길");
assert.notEqual(groups[0].color.fill,groups[1].color.fill);
assert.equal(selectEvenly(items,2).length,2);
assert.equal(selectEvenly([{lat:null,lng:Infinity},...items],2).length,2);
assert(js.includes("turf.intersect(turf.polygon([corners]), feature)"),"drawings must be clipped inside zipcode polygon");
assert(js.includes("String(result.zonecode) !== zip"),"exclude reverse-geocoded mismatching postal codes");
console.log("PASS: editor wiring, scripts syntax, road extraction, sample groups, soft colors, polygon clipping and zip guards");
