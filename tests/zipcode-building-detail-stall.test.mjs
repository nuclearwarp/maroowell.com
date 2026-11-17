import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync("public/zipcode_search","utf8");
assert(s.includes("const DETAIL_STALL_GRACE_MS = 12 * 60 * 1000"));
assert(s.includes("source.nextPage ||"));
assert(s.includes("source.receivedRows ||"));
assert(s.includes("detailStallRounds >= 60"));
assert(s.includes("recordBuildingRequestLog({"));
assert(s.includes('stage:"detail_continuation",event:"stalled"'));
assert(s.includes("Math.min(15000,2000*detailStallRounds)"));
assert(!s.includes("if (detailStallRounds >= BUILDING_CONTINUATION_MAX_STALL_ROUNDS) {"));
const blocks=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(const [,body] of blocks)if(body.trim())new Function(body);
function signature(p){const source=p.sourceProgress||{};return [p.processedParcelCount,p.remainingParcelCount,source.parcelKey||"",source.phase||"",source.nextPage||"",source.pages||"",source.receivedRows||""].join(":")}
assert.notEqual(signature({processedParcelCount:0,remainingParcelCount:1,sourceProgress:{phase:"area",nextPage:15}}),signature({processedParcelCount:0,remainingParcelCount:1,sourceProgress:{phase:"area",nextPage:20}}));
assert.equal(signature({processedParcelCount:0,remainingParcelCount:1,sourceProgress:{phase:"area",nextPage:15}}),signature({processedParcelCount:0,remainingParcelCount:1,sourceProgress:{phase:"area",nextPage:15}}));
console.log("PASS: source page progress extends continuation safely; bounded stall and cooloff");
