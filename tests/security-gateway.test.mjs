import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync("workers/security/worker.js","utf8");
assert(!src.includes("SUPABASE_SERVICE_ROLE_KEY"),"no service role allowed");
assert(!src.includes("env.ASSETS"),"must not affect site assets");
assert(!src.includes("api/supabase"),"no generic DB proxy");
const {default:gateway}=await import("data:text/javascript;base64,"+Buffer.from(
  src.replace('export { SessionStore } from "./session-store.js";', '')
).toString("base64"));
const url="https://maroowell-security.test";
const env={SUPABASE_URL:"https://rgqerimdxkthkcewqbbe.supabase.co",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"};
const make=(p,o={})=>new Request(url+p,o);
let count=0;
const original=globalThis.fetch;
globalThis.fetch=async (u)=>{
  count++;
  if(u.endsWith("/auth/v1/user"))return Response.json({id:"test-user"});
  if(u.endsWith("/rpc/mw_my_access"))return Response.json([{user_id:"test-user",email:"test@example.test",is_maroowell:true,max_role_level:30,is_admin:false}]);
  if(u.endsWith("/rpc/mw_my_account_state"))return Response.json([{user_id:"test-user",approval_status:"approved",app_only:false}]);
  throw Error("Unexpected upstream");
};
try{
  let r=await gateway.fetch(make("/health"),env);
  let doResult=await gateway.fetch(make("/health/session-store"),env);
  assert.equal(doResult.status,503,"unconfigured session storage must fail closed");
  env.SESSIONS={getByName:()=>({ping:async()=>true})};
  doResult=await gateway.fetch(make("/health/session-store"),env);
  assert.equal(doResult.status,200,"durable object binding works");
  assert.equal((await doResult.json()).session_store,"ready");
  assert.equal(r.status,200);
  assert.equal((await r.json()).data_proxy,false);
  r=await gateway.fetch(make("/v1/auth/verify"),env);
  assert.equal(r.status,401);
  assert.equal(count,0);
  r=await gateway.fetch(make("/v1/auth/verify",{headers:{Origin:"https://evil.test",authorization:"Bearer abcdabcdabcd"}}),env);
  assert.equal(r.status,403);
  assert.equal(r.headers.get("access-control-allow-origin"),null);
  r=await gateway.fetch(make("/v1/auth/verify",{method:"OPTIONS",headers:{Origin:"https://maroowell.com","Access-Control-Request-Headers":"Authorization"}}),env);
  assert.equal(r.status,204);
  assert.equal(r.headers.get("access-control-allow-origin"),"https://maroowell.com");
  r=await gateway.fetch(make("/v1/auth/verify",{method:"POST"}),env);
  assert.equal(r.status,405);
  r=await gateway.fetch(make("/rest/v1/profiles"),env);
  assert.equal(r.status,404);
  r=await gateway.fetch(make("/v1/auth/verify",{headers:{authorization:"Bearer abcdabcdabcd"}}),env);
  assert.equal(r.status,200);
  assert.equal((await r.json()).identity.max_role_level,30);
  assert.equal(r.headers.get("cache-control").includes("no-store"),true);
  globalThis.fetch=async(u)=>{
    if(u.endsWith("/auth/v1/user"))return Response.json({id:"test-user"});
    if(u.endsWith("/rpc/mw_my_access"))return Response.json([{user_id:"test-user",is_maroowell:true,max_role_level:90}]);
    if(u.endsWith("/rpc/mw_my_account_state"))return Response.json([{user_id:"test-user",approval_status:"pending",app_only:false}]);
    throw Error("Unexpected upstream");
  };
  r=await gateway.fetch(make("/v1/auth/verify",{headers:{authorization:"Bearer abcdabcdabcd"}}),env);
  assert.equal(r.status,403);
  globalThis.fetch=async()=>Response.json({error:"expired"},{status:401});
  r=await gateway.fetch(make("/v1/auth/verify",{headers:{authorization:"Bearer abcdabcdabcd"}}),env);
  assert.equal(r.status,401);
  r=await gateway.fetch(make("/v1/auth/verify",{headers:{authorization:"Bearer abcdabcdabcd"}}),{});
  assert.equal(r.status,503);
  console.log("PASS 9 isolated gateway security checks");
}finally{globalThis.fetch=original;}
