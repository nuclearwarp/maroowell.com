import fs from "node:fs";
import assert from "node:assert/strict";
const code=fs.readFileSync("login-worker-v2.js","utf8");
const {default: worker}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const htmlPages=["admin_access","coupangRouteMap","coupangland","naverSearch","route-map-20260925","route-map-v69-20260925","route-map-v70-20260925","route-map-v71-20260925","route-map-v73-20260925","share","vendors","zipcode_share"];
let calls=[];
const env={ASSETS:{fetch:async request=>{const u=new URL(request.url);calls.push(u.pathname);return new Response("mock page",{status:200,headers:{"Content-Type":"text/html"}})}}};
for(const name of htmlPages){
  calls=[];
  const clean=await worker.fetch(new Request("https://maroowell.com/"+name+"?foo=bar"),env);
  assert.equal(clean.status,200,"clean path "+name);
  assert.deepEqual(calls,["/"+name+".html"],"asset path "+name);
  calls=[];
  const legacy=await worker.fetch(new Request("https://maroowell.com/"+name+".html?foo=bar"),env);
  assert.equal(legacy.status,308,name+" redirect status");
  assert.equal(legacy.headers.get("location"),"https://maroowell.com/"+name+"?foo=bar");
  assert.equal(calls.length,0,"redirect should not fetch assets");
}
calls=[];
const root=await worker.fetch(new Request("https://maroowell.com/index.html?a=3"),env);
assert.equal(root.status,308);assert.equal(root.headers.get("location"),"https://maroowell.com/?a=3");
for(const ext of ["/google5f7b08e3324d0794.html","/home","/realtime","/api/health"]){
 calls=[];const r=await worker.fetch(new Request("https://maroowell.com"+ext),env);
 assert.equal(r.status,200);assert.equal(calls[0],ext,"Must not remap existing "+ext);
}
console.log("PASS: "+(htmlPages.length*2+5)+" clean links, legacy redirects, query preservation, standalone paths");
