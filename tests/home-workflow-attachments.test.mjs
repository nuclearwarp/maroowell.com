import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=readFileSync("workers/home-system/worker.js","utf8");
const {default:home}=await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
const env={SUPABASE_URL:"https://demo.supabase.co",SUPABASE_ANON_KEY:"ANON",SUPABASE_SERVICE_ROLE_KEY:"SERVICE"};
const uuid="11111111-1111-4111-8111-111111111111";
const fileId="22222222-2222-4222-8222-222222222222";
const managerId="33333333-3333-4333-8333-333333333333";
const adminId="44444444-4444-4444-8444-444444444444";
let metadata=null,uploads=0,deletions=0,activeUserId=managerId,uploadedPath=null;
const requests=[];
globalThis.fetch=async (input,init={})=>{
  const url=new URL(String(input));
  const method=String(init.method||"GET").toUpperCase();
  const headers=new Headers(init.headers||{});
  requests.push({path:url.pathname,method});
  const token=headers.get("authorization")||"";
  if(url.pathname==="/auth/v1/user")activeUserId=token==="Bearer MANAGER"?managerId:adminId;
  const isManager=activeUserId===managerId;
  const userId=activeUserId;
  const body=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
  if(url.pathname==="/auth/v1/user")return body({id:userId});
  if(url.pathname.startsWith("/storage/v1/object/home-workflow/workflow-templates/"+uuid+"/")){
    if(/[^a-zA-Z0-9._/-]/.test(decodeURIComponent(url.pathname)))return body({error:"InvalidKey"},400);
    if(method==="GET")return new Response(new Uint8Array([37,80,68,70]),{status:200});
    if(method==="DELETE"){deletions++;return body({ok:true});}
    if(method==="POST"){uploads++;uploadedPath=decodeURIComponent(url.pathname.slice("/storage/v1/object/home-workflow/".length));return body({ok:true});}
  }
  if(url.pathname==="/rest/v1/user_access")return body([{is_maroowell:true,is_admin:!isManager}]);
  if(url.pathname==="/rest/v1/vendor_members")return body([{role_level:isManager?60:90,vendor_id:uuid,is_active:true}]);
  if(url.pathname==="/rest/v1/workflow_templates"){
    if(method==="GET")return body([{id:uuid,name:"Example",version:1,is_active:true}]);
    return body([]);
  }
  if(url.pathname==="/rest/v1/workflow_runs")return body([]);
  if(url.pathname==="/rest/v1/workflow_template_steps")return body([{title:"Step 1",step_order:1}]);
  if(url.pathname==="/rest/v1/workflow_template_attachments"){
    if(method==="GET")return body(metadata?[metadata]:[]);
    if(method==="POST"){metadata={...JSON.parse(init.body),id:fileId};return body([metadata]);}
    if(method==="DELETE"){const before=metadata;metadata=null;return body(before?[before]:[]);}
  }
  throw Error("Unexpected request: "+method+" "+url.pathname);
};
async function call(path,token,method="GET",body,headers={}){
  const options={method,headers:{"authorization":"Bearer "+token,...headers}};
  if(body!==undefined)options.body=body;
  return home.fetch(new Request("https://home-system.brain-0f6.workers.dev/api/"+path,options),env);
}

let r=await call("bootstrap","MANAGER");
if(r.status!==200)console.error("bootstrap failed",r.status,await r.clone().text());
assert.equal(r.status,200);
let j=await r.json();
assert.equal(j.data.viewer.can_edit,false,"manager is read-only");
assert.equal(j.data.workflow_templates.length,1);
r=await call("workflow-templates/"+uuid,"MANAGER");
assert.equal(r.status,200);
j=await r.json();
assert.equal(j.data.steps.length,1);
assert.deepEqual(j.data.attachments,[]);
r=await call("workflow-templates","MANAGER","POST","{}",
 {"content-type":"application/json"});
assert.equal(r.status,403,"manager cannot create a process");
r=await call("workflow-templates/"+uuid+"/attachments?name=guide.pdf","MANAGER","POST","%PDF",
 {"content-type":"application/pdf"});
assert.equal(r.status,403,"manager cannot upload");
assert.equal(uploads,0);

r=await call("workflow-templates/"+uuid+"/attachments?name=guide.exe","ADMIN","POST","binary",
 {"content-type":"application/octet-stream"});
assert.equal(r.status,415,"non-allowlisted file rejected");
r=await call("workflow-templates/"+uuid+"/attachments?name=guide.pdf","ADMIN","POST",new Uint8Array(6*1024*1024+1),
 {"content-type":"application/pdf"});
assert.equal(r.status,413,"oversize file rejected before storage");
assert.equal(uploads,0);
r=await call("workflow-templates/"+uuid+"/attachments?name=file.pdf","ADMIN","POST","%PDF",
 {"content-type":"application/pdf"});
assert.equal(r.status,200,"super-admin uploads file");
assert.equal(uploads,1);
r=await call("workflow-templates/"+uuid+"/attachments","MANAGER");
assert.equal(r.status,200);
j=await r.json();
assert.equal(j.data.length,1,"manager can see attachment metadata");
r=await call("workflow-templates/"+uuid+"/attachments/"+fileId+"/download","MANAGER");
assert.equal(r.status,200,"manager can download private file");
assert.match(r.headers.get("content-disposition"),/file\.pdf/);
r=await call("workflow-templates/"+uuid+"/attachments/"+fileId,"MANAGER","DELETE");
assert.equal(r.status,403,"manager cannot delete reference");
r=await call("workflow-templates/"+uuid+"/attachments/"+fileId,"ADMIN","DELETE");
assert.equal(r.status,200,"admin can delete reference");
assert.equal(deletions,1);
r=await call("workflow-templates/"+uuid+"/attachments/"+fileId,"ADMIN","DELETE");
assert.equal(r.status,200,"repeated removal of an already-missing attachment must be idempotent");
assert.equal((await r.json()).data.already_missing,true);
assert.equal(deletions,1,"repeated deletion must not remove another Storage object");
// An attachment-only change must not generate a new process version.
r=await call("workflow-templates/version","ADMIN","POST",
 JSON.stringify({template_id:uuid,description:null,steps:[{title:"Step 1"}]}),
 {"content-type":"application/json"});
assert.equal(r.status,200);
let unchanged=await r.json();
assert.equal(unchanged.data.id,uuid,"identical process content keeps the version");
assert.equal(unchanged.data.reused_version,true);
// Regression: uploaded Korean filenames must be metadata only; Storage key ASCII.
const koreanName="1. 택배용 화물자동차 운송사업 허가신청 확인서.pdf";
r=await call("workflow-templates/"+uuid+"/attachments?name="+encodeURIComponent(koreanName),"ADMIN","POST","%PDF",{"content-type":"application/pdf"});
assert.equal(r.status,200,"original Korean filename must upload using ASCII Storage key");
assert.match(uploadedPath,/^workflow-templates\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/i);
assert.equal(metadata.file_name,koreanName,"display and download use original Korean name");
const uploadCountBeforeRetry=uploads;
r=await call("workflow-templates/"+uuid+"/attachments?name="+encodeURIComponent(koreanName),
 "ADMIN","POST","%PDF",{"content-type":"application/pdf"});
assert.equal(r.status,200,"repeated upload of same content returns existing file");
assert.equal((await r.json()).data.reused,true);
assert.equal(uploads,uploadCountBeforeRetry,"no second Storage object is created");
r=await call("workflow-templates/"+uuid+"/attachments?name="+encodeURIComponent(koreanName),
 "ADMIN","POST","NEWD",{"content-type":"application/pdf"});
assert.equal(r.status,409,"same name with different contents needs explicit replacement");
assert.equal(uploads,uploadCountBeforeRetry);
r=await call("workflow-templates/"+uuid+"/attachments/"+fileId+"/download","MANAGER");
assert.equal(r.status,200);
assert.match(r.headers.get("content-disposition"),/filename\*=UTF-8''/);
assert(r.headers.get("content-disposition").includes(encodeURIComponent(koreanName)));
console.log("PASS: manager read-only / upload and delete denied / superadmin upload and delete / size and extension policies");
