import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const paths=["public/index.html","public/home","public/realtime"];
for(const path of paths){
  const html=readFileSync(path,"utf8");
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert(scripts.length>0,path+": inline scripts missing");
  for(const [i,item] of scripts.entries()){
    if(item[1].trim())new Function(item[1]);
  }
}
const login=readFileSync("public/index.html","utf8");
const home=readFileSync("public/home","utf8");
const realtime=readFileSync("public/realtime","utf8");
assert(login.includes('sessionStorage.setItem("mw_security_pilot_active","1")'));
assert(login.includes('sessionStorage.removeItem("mw_security_pilot_active")'));
for(const [mode,page] of [["home",home],["realtime",realtime]]){
  assert(page.includes('sessionStorage.getItem("mw_security_pilot_active")!=="1"'));
  assert(page.includes('fetch("/api/web/overview?mode='+mode+'"'));
  assert(page.includes('const secureData=await securityOverview()'));
  assert(page.includes(':await S.sb'),"legacy fallback must remain for native WebView");
  assert(!page.includes('fetch("/api/web/overview?mode='+mode+'",{method:"POST"'));
}
assert(realtime.includes('sessionStorage.setItem(CAMP_FILTER_STORAGE'));
assert(realtime.includes('saveCampFilter()'));
console.log("PASS safe home/realtime server-data pilot with unchanged native WebView fallback");
