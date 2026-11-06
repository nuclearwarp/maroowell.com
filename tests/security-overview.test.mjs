import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
globalThis.crypto ||= webcrypto;
const src=readFileSync("workers/security/worker.js","utf8");
assert(!src.includes("SUPABASE_SERVICE_ROLE_KEY"));
assert(!src.includes('url.searchParams.set("table"'));
assert(src.includes("OVERVIEW_TABLES") && src.includes("readOverviewTable"));
const {default:api}=await import("data:text/javascript;base64,"+Buffer.from(
  src.replace('export { SessionStore } from "./session-store.js";','')
    .replace('import { handleBff } from "./bff.js";','const handleBff=async()=>Response.json({ok:false},{status:404});')
).toString("base64"));
const id="A".repeat(43);
const row={userId:"web-user",accessToken:"test-access-token-example",refreshToken:"test-refresh-token-example",
  expiresAt:Date.now()+3600000,csrfToken:"B".repeat(43),source:"attached"};
const env={
 SUPABASE_URL:"https://rgqerimdxkthkcewqbbe.supabase.co",
 SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",
 SESSIONS:{getByName:()=>({fresh:async()=>row,revoke:async()=>true})}
};
let role=30,admin=false;
const oldFetch=globalThis.fetch;
globalThis.fetch=async (url,init)=>{
 const path=new URL(String(url)).pathname;
 if(path==="/auth/v1/user")return Response.json({id:"web-user"});
 if(path==="/rest/v1/rpc/mw_my_access")return Response.json([{user_id:"web-user",is_maroowell:true,is_admin:admin,max_role_level:role}]);
 if(path==="/rest/v1/rpc/mw_my_account_state")return Response.json([{user_id:"web-user",approval_status:"approved",app_only:false}]);
 if(path==="/rest/v1/meta_realtime_batch")return Response.json([{id:"11111111-1111-4111-8111-111111111111",schedule_date:"2026-11-06",status:"collecting",wave:"WAVE1"}]);
 if(path==="/rest/v1/meta_realtime_current")return Response.json([{batch_id:"11111111-1111-4111-8111-111111111111",delivery_total:3}]);
 if(path==="/rest/v1/meta_realtime_fresh_current")return Response.json([]);
 if(path==="/rest/v1/meta_realtime_final")return Response.json([]);
 if(path==="/rest/v1/maroowell_schedule")return Response.json([]);
 throw Error("unexpected upstream "+path);
};
const call=(path,options={})=>api.fetch(new Request("https://maroowell.com"+path,options),env);
try{
 let r=await call("/api/web/overview?mode=realtime");
 assert.equal(r.status,401,"no cookie must be denied");
 r=await call("/api/web/overview?mode=realtime",{headers:{cookie:"__Host-mw_session="+id}});
 assert.equal(r.status,200,"team leader can read real-time snapshot");
 let body=await r.json();
 assert.equal(body.source,"server");
 assert.equal(body.batches.length,1);
 assert.equal(body.current.length,1);
 assert(!JSON.stringify(body).includes("test-access-token-example"));
 r=await call("/api/web/overview?mode=home",{headers:{cookie:"__Host-mw_session="+id}});
 assert.equal(r.status,403,"team member cannot query super-admin home");
 role=90;admin=true;
 r=await call("/api/web/overview?mode=home",{headers:{cookie:"__Host-mw_session="+id}});
 assert.equal(r.status,200,"super-admin can read home snapshot");
 r=await call("/api/web/overview?mode=home&table=profiles",{headers:{cookie:"__Host-mw_session="+id}});
 assert.equal(r.status,404,"cannot request arbitrary tables");
 r=await call("/api/web/overview?mode=home",{method:"POST",headers:{cookie:"__Host-mw_session="+id}});
 assert.equal(r.status,405,"read-only endpoint");
 console.log("PASS secure overview: session required, scoped role, strict table list, no token leak");
} finally {globalThis.fetch=oldFetch;}
