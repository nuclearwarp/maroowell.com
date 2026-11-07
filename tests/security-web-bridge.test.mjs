import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const bridge=readFileSync("public/mw-secure-web.js","utf8");
const login=readFileSync("public/index.html","utf8");
const worker=readFileSync("login-worker-v2.js","utf8");
const postLogin=readFileSync("public/post_login","utf8");
const postLoginScripts=[...postLogin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert(postLoginScripts.some(match=>match[1].includes("mw_web_server_auth")),"server-cookie landing branch must exist");
for(const match of postLoginScripts){if(match[1].trim())new Function(match[1]);}
assert(postLogin.includes("fetch('/api/session/me'"),"server login landing verifies cookie with server");
assert(postLogin.includes("user.max_role_level"),"server login landing checks server role");
assert(postLogin.includes("superAdmin?'/home':'/zipcode_search'"),"server login landing retains role-specific routing");
const menu=readFileSync("public/board-menu.js","utf8");
new Function(menu);
assert(menu.includes('sessionStorage.getItem("mw_web_server_auth")==="1"'));
assert(menu.includes('/api/supabase/rest/v1/rpc/'));
assert(menu.includes('me.csrf_token'));
assert(menu.includes('/api/supabase/rest/v1/cleansing_history_access'));

new Function(bridge);
assert(login.includes('fetch("/api/session/login"'),"pilot login must use server credentials");
assert(login.includes('sessionStorage.setItem("mw_web_server_auth","1")'));

const modeSource=login.slice(login.indexOf("  const params = new URLSearchParams(location.search);"),
  login.indexOf("  function getSupabaseProjectRef(url)"));
assert(modeSource.includes("const mwSecurityPilot"),"default web login mode must be defined");
const loginMode=new Function("window","navigator","location","sessionStorage",
  "const FLOW_RECOVERY='recovery'; const FLOW_SIGNUP_COMPLETE='signup-complete'; "+
  "const DEFAULT_NEXT='/post_login';"+modeSource+"return mwSecurityPilot;");
const mode=(search,ua="",bridge={})=>{
  const records=new Map();
  return loginMode(bridge,{userAgent:ua},{search},{
    removeItem(key){records.delete(key);}
  });
};
const desktopUa="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129 Safari/537.36";
assert.equal(mode("",desktopUa),true,"ordinary website must use cookie login");
assert.equal(mode("?mw_security_pilot=1",desktopUa),true,"old pilot URL remains compatible");
assert.equal(mode("?mw_security_pilot=0",desktopUa),true,"query must not downgrade browser login");
assert.equal(mode("?flow=recovery",desktopUa),false,"password recovery needs original OTP flow");
assert.equal(mode("?flow=signup-complete",desktopUa),false,"signup verification needs original OTP flow");
assert.equal(mode("?signup=1",desktopUa),false,"account signup must remain available");
assert.equal(mode("",desktopUa,{ReactNativeWebView:{postMessage(){}}}),false,
  "React Native embedded app retains compatible login");
assert.equal(mode("","Mozilla/5.0 (Linux; Android 15; Pixel; wv) AppleWebKit/537.36"),false,
  "Android WebView retains native login flow");
assert.equal(mode("","Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"),false,
  "iOS WKWebView retains native login flow");
assert.equal(mode("","Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"),true,
  "iOS Safari must use secure web login");
const loginScripts=[...login.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(const match of loginScripts)if(match[1].trim())new Function(match[1]);
assert(login.includes('if (!mwSecurityPilot && !requireSupabase()) return;'),
  "server login must work without browser Supabase SDK");
assert(login.includes('if (mwSecurityPilot) {\n      try {\n        // A cookie may survive'),
  "existing cookie must be restored before legacy client auto redirect");
console.log("PASS secure default website login and native/recovery compatibility");

assert(worker.includes('/mw-secure-web.js?v=20261106-a'));
assert(worker.includes('headers.set("Content-Type","text/html; charset=utf-8")'),"extensionless HTML must be served as text/html to avoid source rendering");
assert(!bridge.includes("service_role"),"do not ship elevated secrets");
const data=new Map([["mw_web_server_auth","1"]]);
const storage={
 getItem:k=>data.get(k)||null,
 setItem:(k,v)=>data.set(k,String(v)),
 removeItem:k=>data.delete(k)
};
const calls=[];
const fakeFetch=async (url,init)=>{
 calls.push({url:String(url),init});
 if(String(url)==="/api/session/me")return Response.json({
   ok:true,user:{user_id:"web-id",email:"example@example.test"},
   csrf_token:"A".repeat(43),expires_at:new Date(Date.now()+3600000).toISOString()
 });
 if(String(url)==="/api/session/logout")return Response.json({ok:true});
 return Response.json([{id:1}],{status:200});
};
const originalClient=()=>({auth:{},from:()=>null});
const win={fetch:fakeFetch,supabase:{createClient:originalClient}};
new Function("window","sessionStorage","location","Headers","URL","Request","Response","console",bridge)(
 win,storage,{href:"https://maroowell.com/",origin:"https://maroowell.com"},
 Headers,URL,Request,Response,console
);
const client=win.supabase.createClient("https://rgqerimdxkthkcewqbbe.supabase.co","sb_publishable_public",{});
let {data:{session}}=await client.auth.getSession();
assert.equal(session.user.id,"web-id");
assert.equal(session.access_token,"MW_SERVER_COOKIE_ONLY");
assert.equal(session.refresh_token,"MW_SERVER_COOKIE_ONLY");
assert(!JSON.stringify(session).includes("TEST_REAL_TOKEN"));
let r=await win.fetch("https://rgqerimdxkthkcewqbbe.supabase.co/rest/v1/maroowell_schedule?select=*");
assert.equal(r.status,200);
assert.equal(calls.at(-1).url,"/api/supabase/rest/v1/maroowell_schedule?select=*");
assert.equal(calls.at(-1).init.credentials,"same-origin");
await win.fetch("https://schedule.maroowell.com/api/rows",{
 method:"POST",headers:{"content-type":"application/json",authorization:"Bearer old-token"},
 body:"{}"
});
assert.equal(calls.at(-1).url,"/api/worker/schedule/api/rows");
assert.equal(new Headers(calls.at(-1).init.headers).get("authorization"),null);
assert.equal(new Headers(calls.at(-1).init.headers).get("x-csrf-token"),"A".repeat(43));
r=await win.fetch("https://unknown.brain-0f6.workers.dev/private");
assert.equal(r.status,403,"unknown worker must not bypass gateway");
await client.auth.signOut();
assert(!data.has("mw_web_server_auth"));
assert(calls.some(c=>c.url==="/api/session/logout"));
r=await win.fetch("https://rgqerimdxkthkcewqbbe.supabase.co/rest/v1/maroowell_schedule?select=*");
assert.equal(calls.at(-1).url,"https://rgqerimdxkthkcewqbbe.supabase.co/rest/v1/maroowell_schedule?select=*",
 "without server login, native/legacy requests remain unchanged");
console.log("PASS web bridge: opaque auth, authenticated routing, CSRF, no unknown-worker bypass, logout");


const {default:loginWorker}=await import("data:text/javascript;base64,"+Buffer.from(worker).toString("base64"));
const pagePaths=[
  "/","/post_login","/zipcode_search","/home","/realtime",
  "/maroowell_schedule","/maroowell_info","/maroowell_payout",
  "/dragon_car_index","/cleansing_history","/coupangRouteMap",
  "/coupang_camp","/coupang_freshbag","/maroowell_account"
];
for(const path of pagePaths){
  const filename=path==="/"?"/index.html":path==="/coupangRouteMap"?"/coupangRouteMap.html":path;
  const original=readFileSync("public"+filename,"utf8");
  const assets={fetch:async r=>Response.json(null)};
  assets.fetch=async r=>{
    const assetPath=new URL(r.url).pathname;
    return new Response(readFileSync("public"+assetPath,"utf8"),{
      status:200,headers:{"content-type":"application/octet-stream"}
    });
  };
  const response=await loginWorker.fetch(new Request("https://maroowell.com"+path),{ASSETS:assets});
  assert.equal(response.status,200,path+" should load");
  assert.match(response.headers.get("content-type")||"",/^text\/html/i,
    path+" must render HTML, not source text");
  const html=await response.text();
  const sdk=/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*supabase-js[^"']*\1[^>]*>\s*<\/script\s*>/i.exec(html);
  assert(sdk,path+" has Supabase SDK");
  const bridgeIndex=html.indexOf('/mw-secure-web.js?v=20261106-a');
  assert(bridgeIndex>=0,path+" missing secure bridge");
  assert(bridgeIndex>sdk.index+sdk[0].length-1,
    path+" must initialize secure bridge after Supabase SDK");
  const nextScript=html.indexOf("<script",sdk.index+sdk[0].length);
  assert(nextScript>=0 && html.slice(nextScript).startsWith('<script src="/mw-secure-web.js'),
    path+" must install secure bridge before later application scripts");
}
console.log("PASS server-cookie bridge script order and HTML content-type for "+pagePaths.length+" pages");
