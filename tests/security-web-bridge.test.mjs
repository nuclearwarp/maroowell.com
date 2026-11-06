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
