import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const MAPS=["public/coupang_camp_map_v20260928_area2","public/coupang_camp_map"];
const SDK='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
for(const file of MAPS){
 const html=readFileSync(file,"utf8");
 assert.equal(html.split(SDK).length-1,1,file+" should load the SDK once");
 assert(html.includes('fetch("/api/session/me"'),file+" must support server-cookie auth");
 assert(html.includes('sessionStorage.getItem("mw_web_server_auth")'),file+" must detect secure mode");
 assert(html.includes('sb.rpc("mw_my_account_state")'),file+" must validate legacy user account");
 assert(!html.includes('return response.ok && (access?.canClhi'),file+" must not gate on cleansing-history");
 assert(!html.includes("클렌징 히스토리를 조회할 수 있는 계정만"),file+" must not claim CLHI required");
 assert(html.includes('account?.approval_status !== "approved"'),file+" must check legacy approval");
 assert(html.includes('account?.app_only === true'),file+" must exclude app-only web sessions");
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 for(const m of scripts)if(m[1].trim())new Function(m[1]);
}
const list=readFileSync("public/coupang_camp","utf8");
assert(!list.includes("dom.map.hidden = !state.canClhi"),"map button must not be gated by CLHI");
assert(list.includes("dom.map.hidden = false"),"camp map button must be shown");
for(const m of list.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(m[1].trim())new Function(m[1]);
}
console.log("PASS: public camp-map pages are CLHI-independent; secure/legacy auth and single SDK intact");
