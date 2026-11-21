import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import authWorker from "../workers/meta-collector/auth-v12-base.js";
const env={SUPABASE_SERVICE_ROLE_KEY:"test-service-role-secret-not-real",META_ID:"test_user",META_PW:"not-a-real-password"};
const collector=readFileSync("workers/meta-collector/entry.js","utf8");
const auth=readFileSync("workers/meta-collector/auth-v12-base.js","utf8");
assert(collector.includes('response.headers.get("x-mw-meta-auth-verified") === "1"'));
assert(collector.includes('if ((await sessionState(env))?.collector_paused === true)'));
assert(auth.includes('async function autoRecover(env)'));
assert(auth.includes('async function silentRenew(env)'));
assert(auth.includes("async function verifyNewLoginScope(jar)"));
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base="https://meta-direct-poc.brain-0f6.workers.dev/login-send-code";
const original=globalThis.fetch;
let upstream=[];
let vendorAllowed=true, metaAllowed=true;
globalThis.fetch=async (url,init={})=>{
  const path=new URL(url).pathname;
  upstream.push({path,method:init.method||"GET"});
  if(path==="/oauth2/authorization/keycloak")
    return new Response('<html><form method="POST" action="https://fly.coupang.com/keycloak/post"><input name="username"><input type="password" name="password"><input type="hidden" name="credentialId" value="x"></form></html>');
  if(path==="/keycloak/post"){
    assert.match(init.body,/username=test_user/);
    return new Response(null,{status:302,headers:{location:"https://fly.coupang.com/ui","set-cookie":"TOKEN=test; Path=/; Secure"}});
  }
  if(path==="/ui")
    return new Response('<title>CLS Quickflex Admin</title><div>You need to enable JavaScript</div>');
  if(path==="/v1/my-vendor")
    return new Response(vendorAllowed?JSON.stringify({data:{contractedCampCodes:["SG01","SG22"]}}):'not authorized',
      {status:vendorAllowed?200:401,headers:{"content-type":"application/json"}});
  if(path==="/realtime-dashboard/camps/work-status/search")
    return new Response(metaAllowed?JSON.stringify({message:"SUCCESS",data:{content:[]}}):"unauthorized",
      {status:metaAllowed?200:401,headers:{"content-type":"application/json"}});
  if(path==="/rest/v1/rpc/meta_replace_backend_session")
    return new Response(JSON.stringify({success:true}),{status:200,headers:{"content-type":"application/json"}});
  throw new Error("Unexpected external URL "+url);
};
try{
  const start=await authWorker.fetch(new Request(base),env);
  assert.equal(start.status,200);
  assert.equal(upstream.length,0,"opening the panel must not submit ID/PW or trigger SMS");
  const html=await start.text();
  assert.match(html,/META LOGIN/);
  const state=html.match(/name="state" value="([^"]+)"/)?.[1];
  assert(state?.includes("."),"encrypted one-time login state required");
  const request=()=>{
    const body=new URLSearchParams({state});
    return new Request(base,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","sec-fetch-site":"same-origin"},body});
  };
  const rejected=await authWorker.fetch(new Request(base,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","sec-fetch-site":"cross-site"},body:new URLSearchParams({state})}),env);
  assert.equal(rejected.status,403);
  assert.equal(upstream.length,0,"cross-site requests must not initiate login");

  const ok=await authWorker.fetch(request(),env);
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get("x-mw-meta-auth-verified"),"1");
  assert.match(await ok.text(),/META LOGIN OK/);
  assert.equal(upstream.filter(x=>x.path==="/rest/v1/rpc/meta_replace_backend_session").length,1);

  vendorAllowed=false;
  upstream=[];
  const bad=await authWorker.fetch(request(),env);
  assert.equal(bad.status,422);
  assert.equal(bad.headers.get("x-mw-meta-auth-verified"),null);
  assert.equal(upstream.filter(x=>x.path==="/rest/v1/rpc/meta_replace_backend_session").length,0,"API failure must not persist a session");
  console.log("PASS: manual login gate, verified-only API session save, failure protection, collector pause and session renew invariants");
}finally{globalThis.fetch=original;}
