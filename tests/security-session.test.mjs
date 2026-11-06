import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
globalThis.crypto ||= webcrypto;
const workerSource=readFileSync("workers/security/worker.js","utf8");
const storageSource=readFileSync("workers/security/session-store.js","utf8");
assert(!workerSource.includes("SUPABASE_SERVICE_ROLE_KEY"));
assert(!workerSource.includes('"/api/supabase"'));
assert(workerSource.includes('"__Host-mw_session"'));
const workerCode=workerSource.replace('export { SessionStore } from "./session-store.js";','');
const {default:gateway}=await import("data:text/javascript;base64,"+Buffer.from(workerCode).toString("base64"));
const storageCode=storageSource.replace(/import\s+\{\s*DurableObject\s*\}\s+from\s+"cloudflare:workers";/,'class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env}}').replace("export class SessionStore","class SessionStore")+";globalThis.__SessionStore=SessionStore;";
const storeFactory=new Function(storageCode);
storeFactory();
const SessionStore=globalThis.__SessionStore;
delete globalThis.__SessionStore;
const instances=new Map();
const env={
  SUPABASE_URL:"https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_PUBLISHABLE_KEY:"sb_publishable_testpublic",
  SESSIONS:{getByName(name){
    if(!instances.has(name)){
      const data=new Map();
      const storage={
        get:async k=>data.get(k),
        put:async(k,v)=>{data.set(k,v);},
        delete:async k=>{data.delete(k);},
        deleteAll:async()=>{data.clear();},
        setAlarm:async()=>{}
      };
      instances.set(name,new SessionStore({storage},env));
    }
    return instances.get(name);
  }}
};
let approval="approved";
let credentialStatus=200;
let requestCount=0;
let refreshCalls=0;
let logoutCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,init)=>{
  requestCount++;
  const u=String(url);
  if(u.includes("/auth/v1/token?grant_type=password")) {
    return credentialStatus===200
      ?Response.json({access_token:"test_access_token_00000000001",refresh_token:"test_refresh_token_00000000001",expires_in:3600})
      :Response.json({error:"invalid credentials"},{status:credentialStatus});
  }
  if(u.includes("/auth/v1/token?grant_type=refresh_token")){
    refreshCalls++;
    await new Promise(r=>setTimeout(r,5));
    return Response.json({access_token:"test_access_token_00000000002",refresh_token:"test_refresh_token_00000000002",expires_in:3600});
  }
  if(u.endsWith("/auth/v1/user"))return Response.json({id:"test-user-id"});
  if(u.endsWith("mw_my_access"))return Response.json([{user_id:"test-user-id",email:"test@example.test",is_maroowell:true,max_role_level:50,is_admin:false}]);
  if(u.endsWith("mw_my_account_state"))return Response.json([{user_id:"test-user-id",approval_status:approval,app_only:false}]);
  if(u.includes("/auth/v1/logout")){logoutCalls++;return Response.json({});}
  throw Error("unexpected upstream "+u);
};
const req=(path,options={})=>new Request("https://maroowell.com"+path,options);
const login=(origin="https://maroowell.com",ip="192.0.2.11")=>req("/api/session/login",{method:"POST",headers:{origin,"sec-fetch-site":"same-origin","content-type":"application/json","cf-connecting-ip":ip},body:JSON.stringify({email:"test@example.test",password:"fictional-password"})});
try{
  let r=await gateway.fetch(req("/api/session/me"),env);
  assert.equal(r.status,401);
  r=await gateway.fetch(login("https://wrong.example"),env);
  assert.equal(r.status,403);
  r=await gateway.fetch(login(),env);
  assert.equal(r.status,200,"valid approved user receives new session");
  const payload=await r.json();
  const cookie=r.headers.get("set-cookie");
  assert.match(cookie,/__Host-mw_session=[a-zA-Z0-9_-]{43}/);
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert(!JSON.stringify(payload).includes("test_access_token"));
  assert(!JSON.stringify(payload).includes("test_refresh_token"));
  const rawCookie=cookie.split(";")[0];
  const csrf=payload.csrf_token;
  r=await gateway.fetch(req("/api/session/me",{headers:{cookie:rawCookie}}),env);
  assert.equal(r.status,200);
  assert.equal((await r.json()).user.user_id,"test-user-id");
  r=await gateway.fetch(req("/api/session/logout",{method:"POST",headers:{origin:"https://maroowell.com","sec-fetch-site":"same-origin",cookie:rawCookie}}),env);
  assert.equal(r.status,403,"CSRF token required");
  r=await gateway.fetch(req("/api/session/logout",{method:"POST",headers:{origin:"https://maroowell.com","sec-fetch-site":"same-origin",cookie:rawCookie,"x-csrf-token":csrf}}),env);
  assert.equal(r.status,200);
  assert.match(r.headers.get("set-cookie"),/Max-Age=0/);
  r=await gateway.fetch(req("/api/session/me",{headers:{cookie:rawCookie}}),env);
  assert.equal(r.status,401,"revoked session cannot be replayed");
  // Legacy login can attach an existing valid Supabase session only from same origin.
  const attachRequest=(origin="https://maroowell.com")=>req("/api/session/attach",{
    method:"POST",headers:{origin,"sec-fetch-site":"same-origin","content-type":"application/json"},
    body:JSON.stringify({access_token:"test_access_token_00000000001",
      refresh_token:"test_refresh_token_00000000001",expires_in:3600})
  });
  r=await gateway.fetch(attachRequest("https://attacker.example"),env);
  assert.equal(r.status,403,"cross-origin attach must be denied");
  r=await gateway.fetch(attachRequest(),env);
  assert.equal(r.status,200,"valid existing session may be attached");
  const attached=await r.json();
  assert.equal(attached.user.user_id,"test-user-id");
  assert(!JSON.stringify(attached).includes("test_access_token"));
  assert(!JSON.stringify(attached).includes("test_refresh_token"));
  const attachedCookie=r.headers.get("set-cookie").split(";")[0];
  assert.match(attachedCookie,/^__Host-mw_session=[A-Za-z0-9_-]{43}$/);
  r=await gateway.fetch(req("/api/session/me",{headers:{cookie:attachedCookie}}),env);
  assert.equal(r.status,200);
  r=await gateway.fetch(req("/api/session/logout",{method:"POST",
    headers:{origin:"https://maroowell.com","sec-fetch-site":"same-origin",
      cookie:attachedCookie,"x-csrf-token":attached.csrf_token}}),env);
  assert.equal(r.status,200,"attached server session must support revocation");
  r=await gateway.fetch(req("/api/session/me",{headers:{cookie:attachedCookie}}),env);
  assert.equal(r.status,401,"attached session cannot be replayed after revoke");
  assert.equal(logoutCalls,1,"attached session logout must NOT sign out the original Supabase session");
  assert.equal(refreshCalls,0,"attached session must NOT rotate the browser/native refresh token");
  // Expire one attached session: the server must refuse it without refreshing the client token.
  r=await gateway.fetch(attachRequest(),env);
  assert.equal(r.status,200);
  const expiredCookie=r.headers.get("set-cookie").split(";")[0];
  const id=expiredCookie.split("=")[1];
  const hash=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode("s:"+id));
  const key="mw-s-"+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
  const record=await instances.get(key).read();
  await instances.get(key).replaceTokens(record.refreshToken,{
    accessToken:record.accessToken,refreshToken:record.refreshToken,
    expiresAt:Date.now()-1000
  });
  r=await gateway.fetch(req("/api/session/me",{headers:{cookie:expiredCookie}}),env);
  assert.equal(r.status,401);
  assert.equal(refreshCalls,0,"expired attached session never refreshes the shared credential");
  approval="pending";
  r=await gateway.fetch(login("https://maroowell.com","192.0.2.12"),env);
  assert.equal(r.status,403,"pending user cannot create session");
  approval="approved";
  credentialStatus=401;
  for(let i=0;i<10;i++){
    r=await gateway.fetch(login("https://maroowell.com","192.0.2.99"),env);
    assert.equal(r.status,401);
  }
  r=await gateway.fetch(login("https://maroowell.com","192.0.2.99"),env);
  assert.equal(r.status,429,"repeated bad credentials throttled");
  r=await gateway.fetch(req("/api/supabase/rest/v1/private_table"),env);
  assert.equal(r.status,404,"arbitrary table proxy remains blocked");
  console.log("PASS session security: login, cookie, approved user, CSRF, revoke, rate limit, deny by default");
}finally{globalThis.fetch=originalFetch;}
