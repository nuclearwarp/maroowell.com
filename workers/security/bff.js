/**
 * MAROOWELL BFF (browser-only backend-for-frontend).
 * Reject anything not listed explicitly below. Always use the authenticated
 * user's JWT, never a service-role key. All writes require CSRF + origin.
 * Existing native apps continue using their original Supabase APIs.
 */
const TABLES = Object.freeze({
  user_access:["approved","admin"], profiles:["approved","admin"],
  vendor_members:["approved","admin"],vendors:["approved","admin"],
  camps:["approved","admin"],subsubroutes:["approved","admin"],
  coupang_freshbag:["approved","admin"],
  cleansing_history:["approved","admin"],cleansing_history_access:["approved",null],
  dragon_car:["team_or_dragon","dragon"],dragon_car_subtraction:["dragon","dragon"],
  maroowell_account:["team","admin"],maroowell_freshbag_ration:["mw","admin"],
  maroowell_freshbag_ration_month_total:["mw","admin"],
  maroowell_info:["manager","manager"],
  maroowell_document_types:["manager","admin"],
  maroowell_info_documents:["manager","manager"],
  maroowell_route:["manager","manager"],
  maroowell_route_rates:["manager","manager"],
  maroowell_rate_periods:["manager","manager"],
  maroowell_route_info:["mw","manager"],
  maroowell_route_delivery_points:["mw","manager"],
  maroowell_sub_sub_route:["mw","manager"],
  maroowell_route_point_attachments:["mw","manager"],
  maroowell_schedule:["team_or_dragon","team_or_dragon"],
  maroowell_schedule_update_status:["team","admin"],
  maroowell_schedule_write_access:["team",null],
  meta_realtime_batch:["team",null],
  meta_realtime_current:["team",null],
  meta_realtime_fresh_current:["team",null],
  meta_realtime_final:["team",null],
  app_min_versions:["admin","admin"],app_source_versions:["admin","admin"],
  app_notices:["admin","admin"],app_notice_recipients:["admin","admin"],
  app_notice_popup_dismissals:["approved","approved"],
  app_push_devices:["admin","admin"],app_user_camps:["admin","admin"]
});
const RPCS = Object.freeze({
  mw_my_access:["approved",false],
  mw_my_account_state:["approved",false],
  mw_is_super_admin:["approved",false],
  mw_payout_can_access:["approved",false],
  mw_account_statistics:["team",false],
  mw_meta_collector_state:["team",false],
  mw_set_meta_collector_paused:["admin",true],
  mw_route_price_save:["manager",true]
});
const BUCKETS = Object.freeze({
  "maroowell-info-documents":["manager","manager"],
  "app-notice-images":["admin","admin"]
});
// The remote targets are constants. Requests cannot supply hostnames or
// resolve redirects to arbitrary URLs.
const WORKERS = Object.freeze({
  route:{base:"https://route.maroowell.com",read:"approved",write:"manager"},
  route_legacy:{base:"https://purple-river-0717.brain-0f6.workers.dev",read:"approved",write:"manager"},
  schedule:{base:"https://schedule.maroowell.com",read:"team_or_dragon",write:"team_or_dragon"},
  home:{base:"https://home-system.brain-0f6.workers.dev",read:"manager",write:"admin"},
  info:{base:"https://maroowellinfo.brain-0f6.workers.dev",read:"manager",write:"manager"},
  route_price:{base:"https://maroowellroute.brain-0f6.workers.dev",read:"manager",write:"manager"},
  route_info:{base:"https://routeinfo.brain-0f6.workers.dev",read:"mw",write:"manager"},
  payout:{base:"https://payout.maroowell.com",read:"payout",write:"payout"},
  admin_access:{base:"https://admin-access.maroowell.com",read:"admin",write:"admin"},
  cleansing:{base:"https://cleansinghistory.maroowell.com",read:"approved",write:"approved"},
  account:{base:"https://maroowellaccount.brain-0f6.workers.dev",read:"team",write:"admin"},
  freshbag:{base:"https://freshbag.brain-0f6.workers.dev",read:"approved",write:"admin"},
  mw_freshbag:{base:"https://maroowellfreshbag.brain-0f6.workers.dev",read:"mw",write:"admin"},
  camp:{base:"https://coupangcamp.brain-0f6.workers.dev",read:"approved",write:"manager"},
  zip:{base:"https://zip.maroowell.com",read:"approved",write:"manager"},
  meta:{base:"https://meta-direct-poc.brain-0f6.workers.dev",read:"admin",write:"admin"}
});
const BODY_LIMIT=8*1024*1024;
function allowedRole(identity, level) {
  const mw=identity?.is_maroowell===true;
  const role=Number(identity?.max_role_level||0);
  const admin=mw&&identity?.is_admin===true&&role>=90;
  const dragon=identity?.is_dragon_car_admin===true;
  switch(level){
    case "approved":return !!identity?.user_id;
    case "mw":return mw;
    case "team":return mw&&role>=30;
    case "manager":return mw&&role>=60;
    case "admin":return admin;
    case "dragon":return dragon;
    case "team_or_dragon":return (mw&&role>=30)||dragon;
    case "manager_or_dragon":return (mw&&role>=60)||dragon;
    default:return false;
  }
}
function policyFor(path, method){
  const write=!["GET","HEAD"].includes(method);
  let match=path.match(/^\/api\/supabase\/rest\/v1\/([a-z][a-z0-9_]*)$/);
  if(match){
    const table=match[1], perms=TABLES[table];
    return perms&&perms[write?1:0]?{upstream:"/rest/v1/"+table,rule:perms[write?1:0],kind:"supabase"}:null;
  }
  match=path.match(/^\/api\/supabase\/rest\/v1\/rpc\/([a-z][a-z0-9_]*)$/);
  if(match){
    const rpc=match[1],perms=RPCS[rpc];
    // RPCs are POST reads for historical PostgREST compatibility.
    if(!perms||!(method==="POST"||method==="GET"))return null;
    return{upstream:"/rest/v1/rpc/"+rpc,rule:perms[0],kind:"supabase",mutates:perms[1]};
  }
  match=path.match(/^\/api\/supabase\/storage\/v1\/object\/(.+)$/);
  if(match){
    const segments=match[1].split("/").map(x=>{try{return decodeURIComponent(x)}catch{return""}});
    const bucket=segments[0]==="sign"||segments[0]==="public"||segments[0]==="authenticated" ? segments[1]:segments[0];
    const perms=BUCKETS[bucket];
    if(!perms||segments.some(x=>!x||x===".."||x==="."))return null;
    return{upstream:"/storage/v1/object/"+match[1],rule:perms[write?1:0],kind:"supabase",bucket};
  }
  match=path.match(/^\/api\/supabase\/functions\/v1\/([a-z][a-z0-9_-]*)$/);
  if(match){
    const allowed=Object.freeze({
      "send-push":"admin","push-admin":"admin","upload-data":"admin"
    });
    return allowed[match[1]]?{upstream:"/functions/v1/"+match[1],rule:allowed[match[1]],kind:"supabase"}:null;
  }
  match=path.match(/^\/api\/worker\/([a-z_]+)(\/.*)?$/);
  if(match){
    const target=WORKERS[match[1]],rest=match[2]||"/";
    if(!target||rest.includes("\\")||rest.includes("//")||rest.split("/").some(x=>x==="."||x===".."))return null;
    // High-impact vendor modifications require administrative permission,
    // even though normal route reads are available to regular users.
    const vendorAdmin=match[1].startsWith("route")&&rest.startsWith("/vendors/admin");
    // Manager-grade access only for the new, server-authorized permission API.
    // Legacy admin endpoints retain their super-admin rule in the BFF.
    const permissionV3=match[1]==="admin_access"&&(
      (method==="GET"&&rest==="/admin/permissions/snapshot")||
      (method==="POST"&&rest==="/admin/permissions/save")
    );
    // These POST endpoints calculate/read analysis, not vendor configuration.
    // Treat as approved-user computations; same-origin CSRF remains mandatory.
    const zipAnalysis=match[1]==="zip"&&write&&method==="POST"&&
      (rest==="/terrain"||rest==="/building/stats");
    return{upstream:rest,rule:vendorAdmin?"admin":permissionV3?"manager":zipAnalysis?"approved":target[write?"write":"read"],kind:"worker",base:target.base,worker:match[1]};
  }
  return null;
}
async function dataAsBytes(request){
  if(["GET","HEAD"].includes(request.method))return undefined;
  if(Number(request.headers.get("content-length")||0)>BODY_LIMIT)throw Error("body_too_large");
  const reader=request.body?.getReader();
  if(!reader)return undefined;
  let size=0;const chunks=[];
  try{
    for(;;){
      const{done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>BODY_LIMIT)throw Error("body_too_large");
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const output=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}
  return output;
}
async function checkPayout(cfg,token){
  const r=await fetch(cfg.origin+"/rest/v1/rpc/mw_payout_can_access",{
    method:"POST",redirect:"manual",signal:AbortSignal.timeout(6000),
    headers:{apikey:cfg.key,authorization:"Bearer "+token,"content-type":"application/json"},
    body:"{}"
  });
  if(r.status>=300&&r.status<400)return false;
  if(!r.ok)return false;
  const body=await r.json();
  return body===true||(Array.isArray(body)&&body[0]===true);
}
export async function handleBff(request,env,dependencies){
  const{respond,getBrowserSession,validConfig,allowedMutation,csrfValid,sessionResponse}=dependencies;
  const url=new URL(request.url);
  const policy=policyFor(url.pathname,request.method);
  if(!policy||url.search.length>16000)return respond({ok:false,error:"resource_not_allowed"},404,request);
  const method=request.method.toUpperCase();
  if(!["GET","HEAD","POST","PATCH","PUT","DELETE"].includes(method))
    return respond({ok:false,error:"method_not_allowed"},405,request);
  const session=await getBrowserSession(request,env);
  if(!session.ok){
    return session.clear?sessionResponse({ok:false,error:session.error},session.status,request,"",true)
      :respond({ok:false,error:session.error},session.status,request);
  }
  const mutation=!(method==="GET"||method==="HEAD");
  // A read-only RPC called with POST still needs an origin and CSRF token.
  if(mutation&&(!allowedMutation(request)||!csrfValid(request,session.row)))
    return respond({ok:false,error:"csrf_denied"},403,request);
  const cfg=validConfig(env);
  if(!cfg)return respond({ok:false,error:"backend_unavailable"},503,request);
  const user=session.user;
  let authorized=policy.rule==="payout"?false:allowedRole(user,policy.rule);
  if(policy.rule==="payout") {
    try{authorized=await checkPayout(cfg,session.row.accessToken);}catch{authorized=false;}
  }
  if(!authorized)return respond({ok:false,error:"insufficient_role"},403,request);
  const targetBase=policy.kind==="supabase"?cfg.origin:policy.base;
  // No arbitrary caller-supplied hostname or redirection to another host.
  const target=new URL(policy.upstream+url.search,targetBase);
  if(target.origin!==new URL(targetBase).origin)return respond({ok:false,error:"invalid_target"},400,request);
  let body;
  try{body=await dataAsBytes(request);}catch{return respond({ok:false,error:"body_too_large"},413,request);}
  const h=new Headers();
  const allowHeaders=["accept","content-type","prefer","range","content-range","x-upsert","accept-profile","content-profile"];
  for(const key of allowHeaders)if(request.headers.has(key))h.set(key,request.headers.get(key));
  h.set("authorization","Bearer "+session.row.accessToken);
  if(policy.kind==="supabase")h.set("apikey",cfg.key);
  if(policy.kind==="worker")h.set("origin","https://maroowell.com");
  if(!h.has("accept"))h.set("accept","application/json");
  // Terrain and building statistics are expensive, resumable ZIP analyses.
  // Match their browser-side budgets (30s and 180s) instead of aborting every
  // authenticated Worker request at 20s. Keep the default limit elsewhere.
  const upstreamTimeoutMs=policy.kind==="worker"&&policy.worker==="zip"
    ?(policy.upstream==="/building/stats"?185000:
      policy.upstream==="/terrain"?35000:20000)
    :20000;
  // Calling a same-zone Worker through its public route can return 522.
  // ZIP terrain/building calls must go directly through Cloudflare's service
  // binding, keeping the original URL, user JWT, CSRF and allowlist checks.
  const zipBound=policy.kind==="worker"&&policy.worker==="zip";
  if(zipBound && (!env.ZIP_ANALYSIS || typeof env.ZIP_ANALYSIS.fetch!=="function"))
    return respond({ok:false,error:"zip_binding_unavailable"},503,request);
  let upstream;
  try{
    const fetchOptions={
      method,headers:h,body,redirect:"manual",signal:AbortSignal.timeout(upstreamTimeoutMs)
    };
    upstream=zipBound
      ?await env.ZIP_ANALYSIS.fetch(new Request(target.toString(),fetchOptions))
      :await fetch(target.toString(),fetchOptions);
  }catch(error){
    console.warn("MW_BFF_UPSTREAM_ERROR",policy.kind,policy.worker||"supabase",error?.name||"unknown");
    return respond({ok:false,error:"upstream_unavailable"},503,request);
  }
  if(upstream.status>=300&&upstream.status<400)
    return respond({ok:false,error:"upstream_redirect_denied"},502,request);
  const outHeaders=new Headers({
    "cache-control":"private,no-store,max-age=0",
    "x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer"
  });
  for(const name of ["content-type","content-range","range","accept-ranges","content-disposition","etag"]){
    if(upstream.headers.has(name))outHeaders.set(name,upstream.headers.get(name));
  }
  outHeaders.set("x-mw-bff","verified");
  return new Response(method==="HEAD"?null:upstream.body,{status:upstream.status,headers:outHeaders});
}
export const __policyForTest=policyFor;
