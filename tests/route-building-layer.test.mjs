import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const route=readFileSync("public/coupangRouteMap.html","utf8");
const zipcode=readFileSync("public/zipcode_search","utf8");
const module=readFileSync("public/mw-route-road-overlay.js","utf8");
const shared=readFileSync("public/mw-zip-road-overlay.js","utf8");
new Function(module);
new Function(shared);
for(const [name,html] of [["route",route],["zipcode",zipcode]]) {
  for(const [,src] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
    if(src.trim())assert.doesNotThrow(()=>new Function(src),name+" inline Javascript syntax");
  }
}
assert(route.includes("mw-route-road-overlay.js?v=20261117-2"),"route module included");
assert(route.includes("mw-zip-road-overlay.js?v=20261117-7"),"road hash shared across pages");
assert(zipcode.includes("mw-zip-road-overlay.js?v=20261117-7"));
assert(route.includes('id="routeGeometryToggle"'));
assert(zipcode.includes('id="zipGeometryToggle"'));
assert(route.includes("poly.setMap(routeBoundariesVisible ? map : null)"));
assert(route.includes("label.setMap(routeBoundariesVisible ? map : null)"));
assert(zipcode.includes("setOriginalVisible(!state.mergeMode)"));
assert(zipcode.includes("state.boundariesVisible ? state.map : null"));
assert(route.includes("routeRoadOverlay?.onRoutesChange()"),"route loading refreshes road layer");
assert(route.includes("routeRoadOverlay?.reset()"));
assert(route.includes("getPacks: () => routePacksForTerrain()"));
assert(module.includes("getGeometryHash(geometry)"));
assert(module.includes("routeCache.set(cacheKey,record)"));
assert(module.includes("tools.colorForRoad(name)"));
assert(module.includes('selectedRoads=new Set()'));
assert(module.includes('clearSelection.onclick=()=>{selectedRoads.clear();render(visibleRows);}'));
assert(module.includes('const key=building.id;'));
assert(!module.includes('focusedRoad'));
assert(module.includes('group.entries.length'));

assert(route.includes("getToken: () => getTerrainAccessToken()"),"internal-only JWT auth");
assert(module.includes("ENDPOINT = \"https://purple-river-0717.brain-0f6.workers.dev/building-footprints/geometry\""));
const ctx={window:{},console,Math,Map,Set};
vm.runInNewContext(shared,ctx);
const {colorForRoad,canonicalRoad}=ctx.window.MW_ROAD_OVERLAY_TOOLS;
const c1=JSON.stringify(colorForRoad("디지털로37길"));
const c2=JSON.stringify(colorForRoad("디지털로 37길"));
assert.equal(canonicalRoad("디지털로 37길"),"디지털로37길");
assert.equal(c1,c2,"same street uses same color across all polygon datasets");
assert.equal(c1,JSON.stringify(colorForRoad("디지털로37길")),"stable irrespective of loading order");
console.log("PASS: both map UI modules, syntax, shared street colors, hide/show, route caching and login");
