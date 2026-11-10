import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync("admin-access-worker.js","utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
const env={SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service_test_only"};
const id="00000000-0000-4000-8000-000000000002";
let userMode="manager",writes=0,goodRead=true;
const expected={
 user_id:id,email:"example@maroowell.com",display_name:"홍길동",role_level:60,
 is_maroowell:true,is_admin:true,is_dragon_car_admin:false,
 schedule_can_write:false,clhi_can_select:true,can_edit:true
};
globalThis.fetch=async (input,init={})=>{
 const pathname=new URL(String(input)).pathname;
 const body=init.body?JSON.parse(init.body):{};
 const response=v=>Response.json(v);
 if(pathname==="/auth/v1/user")return response({id:"00000000-0000-4000-8000-000000000001",email:"super@maroowell.com"});
 if(pathname==="/rest/v1/rpc/mw_admin_permissions_snapshot"){
   if(userMode==="denied")return response({code:"42501",message:"manager_permission_required"},{status:403});
   return response({viewer:{role_level:userMode==="super"?90:60,user_id:"00000000-0000-4000-8000-000000000001"},users:goodRead?[{...expected}]:[]});
 }
 if(pathname==="/rest/v1/rpc/mw_admin_permissions_save"){
   writes++;
   assert.equal(body.p_target,id);
   assert.equal(body.p_role_level,60);
   assert.equal(body.p_dragon,false);
   assert.equal(body.p_schedule,false);
   assert.equal(body.p_clhi,true);
   return response({saved:true,user_id:id,state:{role_level:60}});
 }
 throw Error("unexpected upstream request "+pathname);
};
const request=(path,method="GET",payload,authorization="Bearer DEMO")=>worker.fetch(
 new Request("https://admin-access.maroowell.com"+path,{
  method,headers:{"authorization":authorization,"content-type":"application/json"},
  ...(payload?{body:JSON.stringify(payload)}:{})
 }),env);
let r=await request("/admin/permissions/snapshot");
assert.equal(r.status,200);
let j=await r.json();
assert.equal(j.users.length,1);
assert.equal(j.viewer.role_level,60);
r=await request("/admin/permissions/snapshot","GET",null,"");
assert.equal(r.status,401);
r=await request("/admin/permissions/save","POST",{user_id:id,role_level:60,dragon:false,schedule:false,clhi:true});
assert.equal(r.status,200);
j=await r.json();
assert.equal(j.saved,true);
assert.equal(writes,1);
r=await request("/admin/permissions/save","POST",{user_id:id,role_level:60,dragon:false,schedule:false});
assert.equal(r.status,400,"missing boolean must be rejected");
r=await request("/admin/permissions/save","POST",{user_id:id,role_level:80,dragon:false,schedule:false,clhi:true});
assert.equal(r.status,400,"unrecognized roles forbidden");
r=await request("/admin/permissions/save","POST",{user_id:"00000000-0000-4000-8000-000000000001",role_level:60,dragon:false,schedule:false,clhi:true});
assert.equal(r.status,403,"no self-role-edit");
goodRead=false;
r=await request("/admin/permissions/save","POST",{user_id:id,role_level:60,dragon:false,schedule:false,clhi:true});
assert.equal(r.status,409,"no success if persisted role is not observed");
console.log("PASS admin permissions: authenticated list, atomic RPC, input checks, deny self-edit and verify readback");
