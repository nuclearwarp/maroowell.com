const J={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const ACTIVE=["collecting","completion_candidate","overdue","error","paused"],TASK_ASSIGNEE_IDS=new Set([1,2,17,71,21,18,46]);
const clean=v=>String(v??"").trim(),n=v=>Number(v||0),enc=encodeURIComponent,json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...J,...headers}});
function cors(env,req){const origin=req.headers.get("origin")||"",allowed=clean(env.ALLOWED_ORIGIN)||"https://maroowell.com";return{"access-control-allow-origin":origin===allowed?origin:allowed,"access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","access-control-expose-headers":"content-disposition,content-length","vary":"Origin"};}
async function sb(env,path,init={}){const base=clean(env.SUPABASE_URL).replace(/\/$/,""),key=env.SUPABASE_SERVICE_ROLE_KEY;if(!base||!key)throw new Error("Missing Supabase backend secrets");const h=new Headers(init.headers||{});h.set("apikey",key);h.set("authorization",`Bearer ${key}`);if(init.body&&!h.has("content-type"))h.set("content-type","application/json");const r=await fetch(`${base}/rest/v1/${path}`,{...init,headers:h}),text=await r.text();if(!r.ok)throw Object.assign(new Error(`Supabase ${r.status}: ${text.slice(0,500)}`),{status:500});if(!text)return null;try{return JSON.parse(text)}catch{return text}}
const get=(env,path)=>sb(env,path),post=(env,path,body)=>sb(env,path,{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify(body)}),patch=(env,path,body)=>sb(env,path,{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify(body)}),del=(env,path)=>sb(env,path,{method:"DELETE",headers:{prefer:"return=representation"}});
async function authorize(env,req){const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)throw Object.assign(new Error("login_required"),{status:401});const base=clean(env.SUPABASE_URL).replace(/\/$/,""),anon=env.SUPABASE_ANON_KEY;if(!base||!anon)throw new Error("Missing Supabase auth secrets");const ur=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,authorization:`Bearer ${token}`}});if(!ur.ok)throw Object.assign(new Error("session_expired"),{status:401});const user=await ur.json(),uid=user.id,[ua,vm]=await Promise.all([get(env,`user_access?select=user_id,email,is_maroowell,is_admin&user_id=eq.${enc(uid)}&limit=1`),get(env,`vendor_members?select=vendor_id,role_level,is_active&user_id=eq.${enc(uid)}&is_active=eq.true&order=role_level.desc&limit=1`)]),access=ua?.[0],member=vm?.[0];if(!(access?.is_maroowell===true&&n(member?.role_level)>=60))throw Object.assign(new Error("manager_role_required"),{status:403});return{user,access,member,canEdit:access.is_admin===true&&n(member.role_level)>=90};}
function pushState(ds,key){if(!ds.length)return"no_device";if(ds.some(d=>d.notification_enabled===false))return ds.every(d=>d.notification_enabled===false)?"blocked":"partial";if(!ds.some(d=>d.notification_enabled===true))return"unknown";if(key&&ds.some(d=>d.notification_enabled===true&&d[key]===false))return ds.filter(d=>d.notification_enabled===true).every(d=>d[key]===false)?"blocked":"partial";return"enabled";}
function peopleRows(info,profiles,devices){const pByInfo=new Map();for(const p of profiles||[])if(p.maroowell_info_id!=null)pByInfo.set(Number(p.maroowell_info_id),p);const dByUser=new Map();for(const d of devices||[]){if(d.is_active!==true)continue;dByUser.set(d.user_id,[...(dByUser.get(d.user_id)||[]),d])}return(info||[]).filter(x=>{const role=clean(x.position_title).replace(/\s+/g,"");return role!=="퇴사"&&role!=="서브계정"}).map(x=>{const p=pByInfo.get(Number(x.pk_id)),ds=p?(dByUser.get(p.user_id)||[]):[],latest=ds.slice().sort((a,b)=>String(b.last_seen_at||"").localeCompare(String(a.last_seen_at||"")))[0];return{pk_id:x.pk_id,person_name:x.person_name,camp_code:x.camp_code,wave:x.wave,position_title:x.position_title,status:ds.length?"active":p?"registered":"not_registered",app_version:latest?.app_version||null,last_seen_at:latest?.last_seen_at||null,user_id:p?.user_id||null,active_device_count:ds.length,push_status:pushState(ds),notice_push_status:pushState(ds,"notice_channel_enabled"),emergency_push_status:pushState(ds,"emergency_channel_enabled"),notification_checked_at:latest?.notification_checked_at||null};});}
function realtimeSummary(batches,rows){const ids=new Set((batches||[]).map(x=>x.id)),camps=new Set(),people=new Set();let delivery=0,done=0,returns=0,freshbag=0,day=0,night=0,misscan=0;for(const r of rows||[]){if(!ids.has(r.batch_id))continue;if(r.camp_name)camps.add(r.camp_name);people.add(r.driver_pk!=null?`pk:${r.driver_pk}`:`${r.coupang_id||""}|${r.driver_name||""}`);delivery+=n(r.delivery_total);done+=n(r.delivery_completed);returns+=n(r.return_collected);freshbag+=n(r.freshbag_collected);misscan+=n(r.delivery_assigned);const w=String(r.wave||"").toUpperCase();if(w==="WAVE2")day++;if(w==="WAVE1")night++;}return{camp_count:camps.size,driver_count:people.size,day_count:day,night_count:night,delivery_total:delivery,delivery_completed:done,delivery_rate:delivery?Math.round(done*1000/delivery)/10:0,return_collected:returns,freshbag_collected:freshbag,misscan_total:misscan};}
async function bootstrap(env,ctx){const [categories,tasks,issues,runs,templates,memos,notices,info,profiles,devices,batches,audits]=await Promise.all([get(env,"home_categories?select=*&is_active=eq.true&order=sort_order.asc"),get(env,"home_tasks?select=*&is_archived=eq.false&order=created_at.desc&limit=300"),get(env,"home_issues?select=*&is_archived=eq.false&order=occurred_at.desc&limit=300"),get(env,"workflow_runs?select=*&is_archived=eq.false&order=created_at.desc&limit=300"),get(env,"workflow_templates?select=*&is_active=eq.true&order=name.asc,version.desc"),get(env,"home_memos?select=*&is_archived=eq.false&order=updated_at.desc&limit=100"),get(env,"app_notices?select=id,title,body,notice_type,target_scope,target_camps,show_on_home,require_ack,recipient_count,is_active,expires_at,created_at,updated_at&show_on_home=eq.true&is_active=eq.true&order=created_at.desc&limit=30"),get(env,"maroowell_info?select=pk_id,person_name,camp_code,wave,position_title&order=person_name.asc"),get(env,"profiles?select=user_id,maroowell_info_id,approval_status,app_only,default_vendor_id,camp_code,wave"),get(env,"app_push_devices?select=user_id,platform,app_version,is_active,last_seen_at,notification_enabled,notice_channel_enabled,emergency_channel_enabled,notification_checked_at"),get(env,`meta_realtime_batch?select=id,camp_name,wave,status,last_polled_at,updated_at&status=in.(${ACTIVE.join(",")})&order=updated_at.desc`),get(env,"audit_logs?select=id,created_at,actor_user_id,action,table_name,row_id,payload&order=created_at.desc&limit=100")]);const ids=(batches||[]).map(x=>x.id),live=ids.length?await get(env,`meta_realtime_current?select=batch_id,driver_pk,coupang_id,driver_name,camp_name,wave,delivery_total,delivery_completed,delivery_assigned,return_collected,freshbag_collected&batch_id=in.(${ids.join(",")})`):[],vp=(profiles||[]).find(p=>p.user_id===ctx.user.id),vi=vp?(info||[]).find(x=>Number(x.pk_id)===Number(vp.maroowell_info_id)):null;return{viewer:{email:ctx.access.email,user_id:ctx.user.id,role_level:ctx.member.role_level,maroowell_info_id:vi?.pk_id||null,person_name:vi?.person_name||null},categories,tasks,issues,workflows:runs,workflow_templates:templates,memos,notices,people:peopleRows(info,profiles,devices),realtime:realtimeSummary(batches,live),audit_logs:audits};}
async function createNotice(env,ctx,b){const title=clean(b.title),body=clean(b.body);if(!title||!body)throw Object.assign(new Error("title_and_body_required"),{status:400});const scope=clean(b.target_scope)||"all",camps=Array.isArray(b.target_camps)?b.target_camps.map(clean).filter(Boolean):[],row={vendor_id:ctx.member.vendor_id||null,sender_user_id:ctx.user.id,sender_role_level:n(ctx.member.role_level),notice_type:clean(b.notice_type)||"normal",target_scope:scope,target_camps:camps,title,body,send_push:b.send_push===true,show_on_home:true,require_ack:b.require_ack===true,is_active:true,expires_at:b.expires_at||null},created=(await post(env,"app_notices",row))?.[0];if(!created)return null;const profiles=await get(env,"profiles?select=user_id,default_vendor_id,camp_code,approval_status&approval_status=eq.approved"),targets=(profiles||[]).filter(p=>scope==="all"||!camps.length||camps.includes(clean(p.camp_code)));if(targets.length){const recipients=targets.map(p=>({notice_id:created.id,user_id:p.user_id,vendor_id:p.default_vendor_id||ctx.member.vendor_id||null,camp:p.camp_code||null,push_status:b.send_push===true?"pending":"skipped"}));await post(env,"app_notice_recipients",recipients);await patch(env,`app_notices?id=eq.${created.id}`,{recipient_count:recipients.length});created.recipient_count=recipients.length;}return created;}
async function createWorkflowTemplate(env,ctx,b){const name=clean(b.name),steps=Array.isArray(b.steps)?b.steps.map((x,i)=>({step_order:i+1,title:clean(x?.title||x),description:clean(x?.description)||null,step_type:"check",is_required:x?.is_required!==false,require_attachment:Boolean(x?.require_attachment),required_document_name:clean(x?.required_document_name)||null,created_by:ctx.user.id,updated_by:ctx.user.id})).filter(x=>x.title):[];if(!name||!steps.length)throw Object.assign(new Error("name_and_steps_required"),{status:400});const exists=await get(env,`workflow_templates?select=id&name=eq.${enc(name)}&is_active=eq.true&limit=1`);if(exists?.length)throw Object.assign(new Error("template_name_exists"),{status:409});const template=(await post(env,"workflow_templates",{category_id:b.category_id||null,name,description:clean(b.description)||null,version:1,is_active:true,created_by:ctx.user.id,updated_by:ctx.user.id}))?.[0];if(!template)throw new Error("template_create_failed");await post(env,"workflow_template_steps",steps.map(x=>({...x,template_id:template.id})));return template;}
async function attachProcessToTask(env,ctx,task,templateId,subjectInfoId=null,subjectName=null){if(!task||!templateId)return task;const run=(await post(env,"workflow_runs",{template_id:templateId,subject_type:subjectInfoId?"person":"task",subject_info_id:subjectInfoId||null,subject_name:clean(subjectName)||task.title,assignee_info_id:task.assignee_info_id||null,assignee_name:task.assignee_name||null,camp_code:task.camp_code||null,wave:task.wave||null,status:task.status||"planned",started_on:task.start_date||new Date().toISOString().slice(0,10),due_date:task.due_date||null,related_task_id:task.id,notes:task.body||null,created_by:ctx.user.id,updated_by:ctx.user.id}))?.[0];if(!run)return task;return (await patch(env,`home_tasks?id=eq.${enc(task.id)}`,{process_template_id:templateId,process_run_id:run.id,updated_by:ctx.user.id}))?.[0]||task;}
function comparableWorkflowSteps(list){
 return (list||[]).map(x=>({
  title:clean(x.title||x),description:clean(x.description)
 }));
}
async function sameWorkflowDefinition(env,template,steps,description){
 if(clean(template.description)!==clean(description))return false;
 const current=await get(env,"workflow_template_steps?select=step_order,title,description&template_id=eq."+enc(template.id)+"&order=step_order.asc");
 return JSON.stringify(comparableWorkflowSteps(current))===JSON.stringify(comparableWorkflowSteps(steps));
}
async function workflowTemplateVersion(env,ctx,b){
 const id=clean(b.template_id);
 const steps=Array.isArray(b.steps)?b.steps.map((x,i)=>({
  step_order:i+1,title:clean(x?.title||x),
  description:clean(x?.description)||null,
  step_type:"check",is_required:x?.is_required!==false,
  require_attachment:Boolean(x?.require_attachment),
  required_document_name:clean(x?.required_document_name)||null,
  created_by:ctx.user.id,updated_by:ctx.user.id
 })).filter(x=>x.title):[];
 if(!workflowUuid(id)||!steps.length)throw workflowError("template_and_steps_required",400);
 const old=(await get(env,"workflow_templates?select=*&id=eq."+enc(id)+"&limit=1"))?.[0];
 if(!old)throw workflowError("template_not_found",404);
 const description=Object.hasOwn(b,"description")?clean(b.description)||null:old.description||null;
 if(old.is_active!==true){
  // A previous save may already have created the next version, then failed
  // while uploading files. Reuse it if the content matches; never create vN+1.
  const active=(await get(env,"workflow_templates?select=*&name=eq."+enc(old.name)+"&is_active=eq.true&order=version.desc&limit=1"))?.[0];
  if(active&&await sameWorkflowDefinition(env,active,steps,description))
   return {...active,reused_version:true};
  throw workflowError("template_version_changed_refresh",409);
 }
 // Attaching or removing files does not modify the process definition.
 if(await sameWorkflowDefinition(env,old,steps,description))
  return {...old,reused_version:true};
 await patch(env,"workflow_templates?id=eq."+enc(id),{is_active:false,updated_by:ctx.user.id});
 const fresh=(await post(env,"workflow_templates",{
  category_id:old.category_id||null,name:clean(b.name)||old.name,
  description,version:n(old.version)+1,is_active:true,
  created_by:ctx.user.id,updated_by:ctx.user.id
 }))?.[0];
 if(!fresh)throw workflowError("template_create_failed",502);
 await post(env,"workflow_template_steps",steps.map(x=>({...x,template_id:fresh.id})));
 await templateAttachmentsCarryForward(env,ctx,id,fresh.id);
 return fresh;
}
async function workflowDetail(env,id){const [run,steps]=await Promise.all([get(env,`workflow_runs?select=*&id=eq.${enc(id)}&limit=1`),get(env,`workflow_run_steps?select=*&run_id=eq.${enc(id)}&order=step_order.asc`)]);const current=run?.[0]||null;const attachments=current?await workflowFileRows(env,current.template_id):[];return{run:current,steps,attachments};}

const WORKFLOW_BUCKET="home-workflow",WORKFLOW_MAX_SIZE=6*1024*1024;
const WORKFLOW_TYPES=Object.freeze({
 pdf:"application/pdf",doc:"application/msword",
 docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 xls:"application/vnd.ms-excel",
 xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
 jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",txt:"text/plain"
});
const workflowUuid=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(s||""));
function workflowError(message,status=400){return Object.assign(new Error(message),{status});}
function workflowFileName(raw){
 const name=clean(raw).replace(/[\\/\u0000-\u001f]/g,"_").slice(0,180);
 const ext=name.split(".").at(-1)?.toLowerCase();
 if(!name||!Object.hasOwn(WORKFLOW_TYPES,ext))throw workflowError("unsupported_file_type",415);
 return {name,mime:WORKFLOW_TYPES[ext]};
}
async function workflowFileRows(env,templateId){
 return get(env,"workflow_template_attachments?select=id,template_id,file_name,mime_type,size_bytes,created_at&template_id=eq."+enc(templateId)+"&order=created_at.asc");
}
async function workflowFileMetadata(env,templateId,attachmentId){
 const rows=await get(env,"workflow_template_attachments?select=*&template_id=eq."+enc(templateId)+"&id=eq."+enc(attachmentId)+"&limit=1");
 return rows?.[0]||null;
}
async function workflowStorage(env,method,path,body,mime){
 const base=clean(env.SUPABASE_URL).replace(/\/$/,""),key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw workflowError("storage_not_configured",503);
 const headers=new Headers({apikey:key,authorization:"Bearer "+key});
 if(mime)headers.set("content-type",mime);
 if(method==="POST")headers.set("x-upsert","false");
 const response=await fetch(base+"/storage/v1/object/"+WORKFLOW_BUCKET+"/"+path.split("/").map(encodeURIComponent).join("/"),
  {method,headers,body,redirect:"manual",signal:AbortSignal.timeout(18000)});
 if(response.status>=300&&response.status<400)throw workflowError("storage_redirect_denied",502);
 return response;
}
async function uploadWorkflowAttachment(env,req,ctx,templateId,url){
 if(!ctx.canEdit)throw workflowError("super_admin_required",403);
 if(!workflowUuid(templateId))throw workflowError("invalid_template_id");
 const template=(await get(env,"workflow_templates?select=id,is_active&id=eq."+enc(templateId)+"&limit=1"))?.[0];
 if(!template||template.is_active!==true)throw workflowError("active_template_required",404);
 const {name,mime}=workflowFileName(url.searchParams.get("name"));
 const len=Number(req.headers.get("content-length")||0);
 if(len>WORKFLOW_MAX_SIZE)throw workflowError("file_too_large",413);
 const raw=await req.arrayBuffer();
 if(!raw.byteLength||raw.byteLength>WORKFLOW_MAX_SIZE)throw workflowError("file_size_invalid",413);
 // Only one reference with the same name may exist in a template version.
 // For retries, compare actual file contents rather than guessing by size.
 const existing=(await get(env,"workflow_template_attachments?select=*&template_id=eq."+enc(templateId)+"&file_name=eq."+enc(name)+"&limit=1"))?.[0];
 if(existing){
  if(Number(existing.size_bytes)!==raw.byteLength)
   throw workflowError("attachment_name_exists_remove_first",409);
  const previous=await workflowStorage(env,"GET",existing.storage_path);
  if(!previous.ok)throw workflowError("existing_attachment_unavailable",502);
  const oldBytes=await previous.arrayBuffer();
  const [oldHash,newHash]=await Promise.all([
   crypto.subtle.digest("SHA-256",oldBytes),crypto.subtle.digest("SHA-256",raw)
  ]);
  const left=new Uint8Array(oldHash),right=new Uint8Array(newHash);
  if(left.length===right.length&&left.every((n,i)=>n===right[i]))
   return {...existing,reused:true};
  throw workflowError("attachment_name_exists_remove_first",409);
 }
 // Supabase Storage keys disallow spaces and non-ASCII characters. Keep the
 // original Korean filename in file_name, not in the Storage object key.
 const extension=name.split(".").at(-1).toLowerCase();
 const storagePath="workflow-templates/"+templateId+"/"+crypto.randomUUID()+"."+extension;
 const stored=await workflowStorage(env,"POST",storagePath,raw,mime);
 if(!stored.ok)throw workflowError("storage_upload_failed_"+stored.status,502);
 try{
  const row=(await post(env,"workflow_template_attachments",{
   template_id:templateId,storage_bucket:WORKFLOW_BUCKET,storage_path:storagePath,
   file_name:name,mime_type:mime,size_bytes:raw.byteLength,uploaded_by:ctx.user.id
  }))?.[0];
  if(!row)throw workflowError("attachment_metadata_failed",502);
  return row;
 }catch(error){try{await workflowStorage(env,"DELETE",storagePath)}catch{}throw error;}
}
async function downloadWorkflowAttachment(env,ctx,templateId,attachmentId,corsHeaders){
 if(!workflowUuid(templateId)||!workflowUuid(attachmentId))throw workflowError("invalid_attachment_id");
 const row=await workflowFileMetadata(env,templateId,attachmentId);
 if(!row)throw workflowError("attachment_not_found",404);
 const response=await workflowStorage(env,"GET",row.storage_path);
 if(!response.ok)throw workflowError("attachment_download_failed_"+response.status,502);
 const safeName=row.file_name.replace(/[\r\n"\\]/g,"_");
 return new Response(response.body,{status:200,headers:{
  ...corsHeaders,"content-type":"application/octet-stream","content-disposition":
  "attachment; filename*=UTF-8''"+encodeURIComponent(safeName),
  "cache-control":"private,no-store","x-content-type-options":"nosniff"
 }});
}
async function deleteWorkflowAttachment(env,ctx,templateId,attachmentId){
 if(!ctx.canEdit)throw workflowError("super_admin_required",403);
 if(!workflowUuid(templateId)||!workflowUuid(attachmentId))throw workflowError("invalid_attachment_id");
 const row=await workflowFileMetadata(env,templateId,attachmentId);
 if(!row)return {deleted:false,already_missing:true};
 const deleted=await del(env,"workflow_template_attachments?id=eq."+enc(row.id)+"&template_id=eq."+enc(templateId));
 if(!Array.isArray(deleted)||!deleted.some(x=>x.id===row.id))
  throw workflowError("attachment_delete_not_confirmed",409);
 const stillThere=await workflowFileMetadata(env,templateId,attachmentId);
 if(stillThere)throw workflowError("attachment_delete_not_persisted",409);
 const refs=await get(env,"workflow_template_attachments?select=id&storage_bucket=eq."+WORKFLOW_BUCKET+"&storage_path=eq."+enc(row.storage_path)+"&limit=1");
 if(!refs?.length){
  const removed=await workflowStorage(env,"DELETE",row.storage_path);
  if(!removed.ok)console.warn("WORKFLOW_STORAGE_DELETE_FAILED",removed.status);
 }
 return {deleted:true};
}
async function templateAttachmentsCarryForward(env,ctx,oldId,newId){
 const refs=await get(env,"workflow_template_attachments?select=storage_bucket,storage_path,file_name,mime_type,size_bytes&template_id=eq."+enc(oldId));
 const previous=await workflowFileRows(env,newId);
 const used=new Set((previous||[]).map(r=>clean(r.file_name).toLocaleLowerCase()));
 const additions=(refs||[]).filter(r=>{
  const key=clean(r.file_name).toLocaleLowerCase();
  if(used.has(key))return false;
  used.add(key);return true;
 });
 if(additions.length)await post(env,"workflow_template_attachments",additions.map(r=>({
  ...r,template_id:newId,uploaded_by:ctx.user.id
 })));
}

function validateAssignee(id){if(id!=null&&!TASK_ASSIGNEE_IDS.has(Number(id)))throw Object.assign(new Error("invalid_assignee"),{status:400});}
async function handle(env,req,url,ctx){const path=url.pathname.replace(/^\/api\/?/,""),method=req.method.toUpperCase();
if(!ctx.canEdit){
 if(method==="GET"&&path==="bootstrap"){
  const [templates,runs]=await Promise.all([
   get(env,"workflow_templates?select=*&is_active=eq.true&order=name.asc,version.desc"),
   get(env,"workflow_runs?select=*&is_archived=eq.false&order=created_at.desc&limit=150")
  ]);
  return{viewer:{user_id:ctx.user.id,email:ctx.access.email,role_level:ctx.member.role_level,can_edit:false},
   workflow_templates:templates,workflows:runs};
 }
 const isSafeGet=method==="GET"&&(
  /^workflow-templates\/[a-f0-9-]{36}$/.test(path)||
  /^workflow-templates\/[a-f0-9-]{36}\/attachments$/.test(path)||
  /^workflows\/[a-f0-9-]{36}$/.test(path)
 );
 if(!isSafeGet)throw workflowError("read_only_manager",403);
}
if(method==="GET"&&path==="bootstrap"){const data=await bootstrap(env,ctx);data.viewer.can_edit=true;return data;}
const attachList=path.match(/^workflow-templates\/([a-f0-9-]{36})\/attachments$/);
if(method==="GET"&&attachList){if(!workflowUuid(attachList[1]))throw workflowError("invalid_template_id");return workflowFileRows(env,attachList[1]);}
const body=method==="GET"?{}:await req.json().catch(()=>({}));
if(method==="POST"&&path==="tasks"){const cp=(await get(env,`profiles?select=maroowell_info_id&user_id=eq.${enc(ctx.user.id)}&limit=1`))?.[0],ci=cp?.maroowell_info_id?(await get(env,`maroowell_info?select=pk_id,person_name&pk_id=eq.${enc(cp.maroowell_info_id)}&limit=1`))?.[0]:null,row={category_id:body.category_id||null,title:clean(body.title),body:clean(body.body)||null,status:clean(body.status)||"planned",priority:clean(body.priority)||"normal",camp_code:clean(body.camp_code)||null,wave:clean(body.wave)||null,assignee_info_id:body.assignee_info_id||null,assignee_name:clean(body.assignee_name)||null,requester_info_id:ci?.pk_id||null,requester_name:clean(ci?.person_name)||null,target_version:clean(body.target_version)||null,start_date:body.start_date||null,due_date:body.due_date||null,process_template_id:body.process_template_id||null,completed_at:clean(body.status)==="completed"?new Date().toISOString():null,created_by:ctx.user.id,updated_by:ctx.user.id};if(!row.title)throw Object.assign(new Error("title_required"),{status:400});validateAssignee(row.assignee_info_id);const created=(await post(env,"home_tasks",row))?.[0]||null;return row.process_template_id?attachProcessToTask(env,ctx,created,row.process_template_id,body.process_subject_info_id||null,body.process_subject_name||null):created;}
if(method==="DELETE"&&path.startsWith("tasks/")){const id=path.split("/")[1];return(await patch(env,`home_tasks?id=eq.${enc(id)}`,{is_archived:true,updated_by:ctx.user.id}))?.[0]||null;}
if(method==="PATCH"&&path.startsWith("tasks/")){const id=path.split("/")[1],current=(await get(env,`home_tasks?select=*&id=eq.${enc(id)}&limit=1`))?.[0],row={};for(const k of["category_id","title","body","status","priority","camp_code","wave","assignee_info_id","assignee_name","target_version","start_date","due_date","completed_at","sort_order","is_archived","process_template_id"])if(k in body)row[k]=body[k];for(const k of["camp_code","wave","assignee_info_id","assignee_name","target_version","start_date","due_date","completed_at","process_template_id"])if(k in row&&(row[k]===""||row[k]===undefined))row[k]=null;validateAssignee(row.assignee_info_id);if(row.status==="completed"&&!row.completed_at)row.completed_at=new Date().toISOString();if(row.status&&row.status!=="completed")row.completed_at=null;row.updated_by=ctx.user.id;const updated=(await patch(env,`home_tasks?id=eq.${enc(id)}`,row))?.[0]||current;if(body.process_template_id&&!current?.process_run_id)return attachProcessToTask(env,ctx,updated,body.process_template_id);return updated;}
if(method==="POST"&&path==="memos"){const bodyText=clean(body.body);if(!bodyText)throw Object.assign(new Error("memo_required"),{status:400});return(await post(env,"home_memos",{body:bodyText,created_by:ctx.user.id,updated_by:ctx.user.id}))?.[0]||null;}
if(method==="PATCH"&&path.startsWith("memos/")){const id=path.split("/")[1],bodyText=clean(body.body);if(!bodyText)throw Object.assign(new Error("memo_required"),{status:400});return(await patch(env,`home_memos?id=eq.${enc(id)}`,{body:bodyText,updated_by:ctx.user.id,updated_at:new Date().toISOString()}))?.[0]||null;}
if(method==="DELETE"&&path.startsWith("memos/")){const id=path.split("/")[1];return(await patch(env,`home_memos?id=eq.${enc(id)}`,{is_archived:true,updated_by:ctx.user.id,updated_at:new Date().toISOString()}))?.[0]||null;}
if(method==="POST"&&path==="issues"){const row={category_id:body.category_id||null,title:clean(body.title),body:clean(body.body)||null,status:clean(body.status)||"open",severity:clean(body.severity)||"normal",camp_code:clean(body.camp_code)||null,wave:clean(body.wave)||null,person_info_id:body.person_info_id||null,person_name_snapshot:clean(body.person_name_snapshot)||null,resignation_notice_date:body.resignation_notice_date||null,resignation_last_work_date:body.resignation_last_work_date||null,occurred_at:body.occurred_at||new Date().toISOString(),resolved_at:["resolved","closed"].includes(clean(body.status))?new Date().toISOString():null,related_task_id:body.related_task_id||null,created_by:ctx.user.id,updated_by:ctx.user.id};if(!row.title)throw Object.assign(new Error("title_required"),{status:400});return(await post(env,"home_issues",row))?.[0]||null;}
if(method==="DELETE"&&path.startsWith("issues/")){const id=path.split("/")[1];return(await patch(env,`home_issues?id=eq.${enc(id)}`,{is_archived:true,updated_by:ctx.user.id}))?.[0]||null;}
if(method==="PATCH"&&path.startsWith("issues/")){const id=path.split("/")[1],row={};for(const k of["category_id","title","body","status","severity","camp_code","wave","person_info_id","person_name_snapshot","resignation_notice_date","resignation_last_work_date","occurred_at","resolved_at","related_task_id","is_archived"])if(k in body)row[k]=body[k];if(["resolved","closed"].includes(row.status)&&!row.resolved_at)row.resolved_at=new Date().toISOString();if(row.status&&!["resolved","closed"].includes(row.status))row.resolved_at=null;row.updated_by=ctx.user.id;return(await patch(env,`home_issues?id=eq.${enc(id)}`,row))?.[0]||null;}
if(method==="POST"&&path==="workflows"){const assigneeId=body.assignee_info_id||null;validateAssignee(assigneeId);const row={template_id:body.template_id,subject_type:body.subject_info_id?"person":"pending_person",subject_info_id:body.subject_info_id||null,subject_name:clean(body.subject_name)||null,camp_code:clean(body.camp_code)||null,wave:clean(body.wave)||null,assignee_info_id:assigneeId,assignee_name:clean(body.assignee_name)||null,status:"planned",started_on:body.started_on||new Date().toISOString().slice(0,10),due_date:body.due_date||null,notes:clean(body.notes)||null,created_by:ctx.user.id,updated_by:ctx.user.id};if(!row.template_id)throw Object.assign(new Error("template_required"),{status:400});return(await post(env,"workflow_runs",row))?.[0]||null;}
if(method==="PATCH"&&path.startsWith("workflows/")){const id=path.split("/")[1],row={};for(const k of["subject_type","subject_info_id","subject_name","camp_code","wave","assignee_info_id","assignee_name","status","due_date","notes","is_archived"])if(k in body)row[k]=body[k];for(const k of["subject_info_id","subject_name","camp_code","wave","assignee_info_id","assignee_name","due_date","notes"])if(k in row&&(row[k]===""||row[k]===undefined))row[k]=null;validateAssignee(row.assignee_info_id);if(row.subject_info_id)row.subject_type="person";row.updated_by=ctx.user.id;return(await patch(env,`workflow_runs?id=eq.${enc(id)}`,row))?.[0]||null;}
if(method==="DELETE"&&path.startsWith("workflow-templates/")){const id=path.split("/")[1];return(await patch(env,`workflow_templates?id=eq.${enc(id)}`,{is_active:false,updated_by:ctx.user.id}))?.[0]||null;}
if(method==="GET"&&/^workflow-templates\/[a-f0-9-]{36}$/.test(path)){const id=path.split("/")[1];if(!workflowUuid(id))throw workflowError("invalid_template_id");const [template,steps,attachments]=await Promise.all([get(env,`workflow_templates?select=*&id=eq.${enc(id)}&limit=1`),get(env,`workflow_template_steps?select=*&template_id=eq.${enc(id)}&order=step_order.asc`),workflowFileRows(env,id)]);return{template:template?.[0]||null,steps,attachments};}
if(method==="GET"&&path.startsWith("task-process/")){const tid=path.split("/")[1],run=(await get(env,`workflow_runs?select=*&related_task_id=eq.${enc(tid)}&is_archived=eq.false&order=created_at.desc&limit=1`))?.[0];return run?workflowDetail(env,run.id):{run:null,steps:[]};}
if(method==="GET"&&path.startsWith("workflows/"))return workflowDetail(env,path.split("/")[1]);
if(method==="PATCH"&&path.startsWith("workflow-steps/")){const id=path.split("/")[1],row={};for(const k of["status","note"])if(k in body)row[k]=body[k];row.updated_by=ctx.user.id;return(await patch(env,`workflow_run_steps?id=eq.${enc(id)}`,row))?.[0]||null;}
if(method==="POST"&&path==="workflow-templates")return createWorkflowTemplate(env,ctx,body);if(method==="POST"&&path==="workflow-templates/version")return workflowTemplateVersion(env,ctx,body);if(method==="POST"&&path==="notices")return createNotice(env,ctx,body);throw Object.assign(new Error("not_found"),{status:404});}
export default{async fetch(req,env){const c=cors(env,req);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:c});const url=new URL(req.url);try{if(url.pathname==="/health")return json({ok:true,service:"home-system",time:new Date().toISOString()},200,c);if(!url.pathname.startsWith("/api/"))return json({ok:false,error:"not_found"},404,c);const ctx=await authorize(env,req);
const path=url.pathname.replace(/^\/api\/?/,"");
const upload=path.match(/^workflow-templates\/([a-f0-9-]{36})\/attachments$/);
const attachment=path.match(/^workflow-templates\/([a-f0-9-]{36})\/attachments\/([a-f0-9-]{36})(?:\/(download))?$/);
if(upload && req.method==="POST")return json({ok:true,data:await uploadWorkflowAttachment(env,req,ctx,upload[1],url)},200,c);
if(attachment && req.method==="GET" && attachment[3])return downloadWorkflowAttachment(env,ctx,attachment[1],attachment[2],c);
if(attachment && req.method==="DELETE" && !attachment[3])return json({ok:true,data:await deleteWorkflowAttachment(env,ctx,attachment[1],attachment[2])},200,c);
const data=await handle(env,req,url,ctx);return json({ok:true,data},200,c)}catch(e){console.error(e?.name||"error");return json({ok:false,error:e?.message||String(e)},e?.status||500,c)}}};
