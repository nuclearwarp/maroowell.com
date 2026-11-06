import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const raw=readFileSync("workers/security/bff.js","utf8");
const {handleBff,__policyForTest:policyFor}=await import(
  "data:text/javascript;base64,"+Buffer.from(raw).toString("base64")
);
const empty=(data,status=200)=>Response.json(data,{status});
const user={user_id:"test-id",is_maroowell:true,is_admin:false,max_role_level:30,is_dragon_car_admin:false};
const csrf="C".repeat(43), row={accessToken:"TEST_TOKEN",csrfToken:csrf};
let authenticated=true,upstreamRequests=[];
const deps={
 respond:(data,status)=>empty(data,status),
 sessionResponse:(data,status)=>empty(data,status),
 getBrowserSession:async()=>authenticated?{ok:true,user,row}:{ok:false,status:401,error:"authentication_required"},
 validConfig:()=>({origin:"https://rgqerimdxkthkcewqbbe.supabase.co",key:"sb_publishable_test"}),
 allowedMutation:request=>request.headers.get("origin")==="https://maroowell.com",
 csrfValid:request=>request.headers.get("x-csrf-token")===csrf
};
const actualFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
 upstreamRequests.push({url:String(url),method:options.method,headers:new Headers(options.headers)});
 if(String(url).includes("mw_payout_can_access"))return empty(false);
 return empty([{id:"123"}],200);
};
const call=(path,{method="GET",headers={},body}={})=>
  handleBff(new Request("https://maroowell.com"+path,{method,headers,body}),
    {},deps);
try{
 assert.equal(policyFor("/api/supabase/rest/v1/maroowell_schedule","GET").rule,"team_or_dragon");
 assert.equal(policyFor("/api/supabase/rest/v1/cleansing_history","GET").rule,"approved",
  "RLS-authorized non-admin cleansing readers must be preserved");
 assert.equal(policyFor("/api/supabase/rest/v1/cleansing_history","POST").rule,"admin",
  "cleansing writes remain admin-only");
 assert.equal(policyFor("/api/supabase/rest/v1/rpc/mw_set_meta_collector_paused","POST").rule,"admin");
 assert.equal(policyFor("/api/supabase/rest/v1/meta_backend_state","GET"),null);
 assert.equal(policyFor("/api/worker/unknown/health","GET"),null);
 assert.equal(policyFor("/api/supabase/rest/v1/maroowell_route","POST").rule,"manager");
 authenticated=false;
 let r=await call("/api/supabase/rest/v1/maroowell_schedule?select=schedule_date");
 assert.equal(r.status,401,"anonymous denied");
 authenticated=true;
 r=await call("/api/supabase/rest/v1/maroowell_schedule?select=schedule_date");
 assert.equal(r.status,200);
 assert.equal(r.headers.get("x-mw-bff"),"verified");
 assert(upstreamRequests.at(-1).url.includes("/rest/v1/maroowell_schedule?"));
 assert.equal(upstreamRequests.at(-1).headers.get("authorization"),"Bearer TEST_TOKEN");
 r=await call("/api/supabase/rest/v1/maroowell_route",{method:"POST",headers:{"origin":"https://maroowell.com","x-csrf-token":csrf,"content-type":"application/json"},body:"{}"});
 assert.equal(r.status,403,"not manager");
 r=await call("/api/supabase/rest/v1/maroowell_schedule",{method:"POST",headers:{"origin":"https://maroowell.com","content-type":"application/json"},body:"{}"});
 assert.equal(r.status,403,"csrf mandatory");
 r=await call("/api/supabase/rest/v1/maroowell_schedule",{method:"POST",headers:{"origin":"https://maroowell.com","x-csrf-token":csrf,"content-type":"application/json"},body:"{}"});
 assert.equal(r.status,200,"authorized schedule mutation");
 r=await call("/api/supabase/rest/v1/user_access?select=*");
 assert.equal(r.status,200,"RLS-limited access table");
 r=await call("/api/supabase/rest/v1/meta_backend_state?select=*");
 assert.equal(r.status,404,"unlisted table always blocked");
 r=await call("/api/supabase/rest/v1/rpc/mw_set_meta_collector_paused",{method:"POST",headers:{"origin":"https://maroowell.com","x-csrf-token":csrf,"content-type":"application/json"},body:"{}"});
 assert.equal(r.status,403,"team cannot pause collector");
 r=await call("/api/supabase/storage/v1/object/maroowell-info-documents/data.pdf");
 assert.equal(r.status,403,"team cannot read sensitive documents");
 r=await call("/api/worker/notconfigured/private");
 assert.equal(r.status,404);
 r=await call("/api/worker/route_legacy/../../health");
 assert.equal(r.status,404,"path traversal must be rejected");
 assert(!JSON.stringify(await r.json()).includes("TEST_TOKEN"),"no token reflected");
 console.log("PASS BFF: fail-closed table/RPC/Worker policies, role gates, CSRF, no token reflection");
}finally{globalThis.fetch=actualFetch;}
