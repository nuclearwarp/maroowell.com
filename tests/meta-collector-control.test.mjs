import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../worker.js";

const home=fs.readFileSync("public/home","utf8");
const meta=fs.readFileSync("workers/meta-collector/entry.js","utf8");
const schedule=fs.readFileSync("workers/schedule-api/worker.js","utf8");
const api=fs.readFileSync("worker.js","utf8");
for(const [,js] of home.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(js.trim())assert.doesNotThrow(()=>new Function(js),"home inline Javascript should parse");
}
assert(home.includes('id="metaCollectorToggle"'));
assert(home.includes("S.isAdmin"));
assert(home.includes('metaControlRequest("POST",!paused)'));
assert(meta.includes('if ((await sessionState(env))?.collector_paused === true)'));
assert(meta.includes('if (state?.collector_paused === true)'));
assert(!meta.includes('collector_paused: false,'));
assert(api.includes('if (path === "/meta/collector-control")'));
assert(api.includes('access.roleLevel<90'));
assert(api.includes('select:"collector_paused,collector_paused_at"'));
assert(!api.includes('select:"*"') || api.includes('collector_paused,collector_paused_at'));
const unauthorized=await worker.fetch(new Request("https://example.org/meta/collector-control"),{});
assert.equal(unauthorized.status,401);
assert(schedule.includes('"주식회사 마루웰/MARWL",6128704101'));
assert(!schedule.includes('"마루웰/MARUL",2591501828'));
console.log("PASS: META pause authorization and controls, schedule XLSX company data");
