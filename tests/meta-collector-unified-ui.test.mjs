import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const realtime=readFileSync("public/realtime","utf8");
const home=readFileSync("public/home","utf8");
const collector=readFileSync("workers/meta-collector/entry.js","utf8");
for(const [name,html] of [["realtime",realtime],["home",home]]) {
  for(const [,js] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
    if(js.trim())assert.doesNotThrow(()=>new Function(js),name+" inline JavaScript");
  }
}
assert(realtime.includes('b.textContent="자동 수집 OFF"'));
assert(realtime.includes('S.collectorPaused=state.paused'));
assert(realtime.includes('openMetaCollectorLogin();'));
assert(realtime.includes('await collectorControlRequest(true)'));
assert(realtime.includes('window.addEventListener("focus"'));
assert(home.includes('metaControlRequest("POST",true)'));
assert(home.includes('if(btn.dataset.paused==="true")'));
assert(home.includes('window.addEventListener("focus"'));
assert(collector.includes('path === "/login-submit-code" && request.method === "POST" && response.ok'));
assert(collector.includes('collector_paused:false'));
assert(collector.includes('if ((await sessionState(env))?.collector_paused === true)'));
console.log("PASS: top and home META controls reflect DB pause; login-confirmed resume only");
