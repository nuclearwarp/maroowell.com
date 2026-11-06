/**
 * MAROOWELL security gateway - isolated bootstrap.
 * Phase 1: verified identity only. No login, session cookie, DB proxy,
 * service-role credentials, or privileged data endpoints are exposed.
 * Tokens, request headers and upstream responses must never be logged.
 */
const ORIGINS = new Set(["https://maroowell.com", "https://www.maroowell.com"]);
const API_PATH = "/v1/auth/verify";
const HEALTH_PATH = "/health";
const SECURITY_HEADERS = {
  "cache-control": "no-store, private, max-age=0",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-resource-policy": "same-site",
  "vary": "Origin"
};
function respond(data, status, request) {
  const headers = new Headers(SECURITY_HEADERS);
  const origin = request.headers.get("origin");
  if (origin && ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET, OPTIONS");
    headers.set("access-control-allow-headers", "Authorization");
    headers.set("access-control-max-age", "300");
  }
  return new Response(JSON.stringify(data), { status:status || 200, headers });
}
function validConfig(env) {
  let u;
  try { u = new URL(String(env.SUPABASE_URL || "")); } catch { return null; }
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || "");
  if (u.origin !== "https://rgqerimdxkthkcewqbbe.supabase.co" || u.pathname !== "/") return null;
  if (!key.startsWith("sb_publishable_") || key.length > 300) return null;
  return { origin:u.origin, key };
}
function readBearer(request) {
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._-]{12,8192})$/i.exec(auth);
  return match ? match[1] : null;
}
async function upstreamJson(url, init, maxLength = 100000) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  if (text.length > maxLength) throw new Error("upstream_oversize");
  let body = null;
  try { body = text ? JSON.parse(text) : null; }
  catch { throw new Error("upstream_invalid_json"); }
  return { status:response.status, ok:response.ok, body };
}
async function verifyIdentity(request, env) {
  const token = readBearer(request);
  if (!token) return {status:401, error:"authentication_required"};
  const cfg = validConfig(env);
  if (!cfg) return {status:503, error:"security_gateway_not_configured"};
  const common = { apikey:cfg.key, authorization:"Bearer " + token, accept:"application/json" };
  try {
    const userResponse = await upstreamJson(cfg.origin + "/auth/v1/user", {method:"GET", headers:common});
    if (userResponse.status === 401 || userResponse.status === 403) {
      return {status:401,error:"invalid_or_expired_session"};
    }
    if (!userResponse.ok) return {status:503,error:"identity_service_unavailable"};
    const user = userResponse.body;
    if (!user || typeof user.id !== "string" || !user.id) {
      return {status:401,error:"invalid_or_expired_session"};
    }
    const rpcHeaders = {...common, "content-type":"application/json"};
    const [accessResponse,stateResponse] = await Promise.all([
      upstreamJson(cfg.origin + "/rest/v1/rpc/mw_my_access", {method:"POST",headers:rpcHeaders,body:"{}"}),
      upstreamJson(cfg.origin + "/rest/v1/rpc/mw_my_account_state", {method:"POST",headers:rpcHeaders,body:"{}"})
    ]);
    if (!accessResponse.ok || !stateResponse.ok) {
      return {status:503,error:"authorization_service_unavailable"};
    }
    const access = Array.isArray(accessResponse.body) ? accessResponse.body[0] : accessResponse.body;
    const state = Array.isArray(stateResponse.body) ? stateResponse.body[0] : stateResponse.body;
    if (!access || !state || access.user_id !== user.id || state.user_id !== user.id) {
      return {status:403,error:"access_denied"};
    }
    // Existing web access includes approved non-MAROOWELL vendors with no
    // vendor_members role; being authenticated is NOT an admin grant.
    if (state.approval_status !== "approved" || state.app_only === true) {
      return {status:403,error:"access_denied"};
    }
    const roleLevel = Number(access.max_role_level ?? 0);
    if (!Number.isSafeInteger(roleLevel) || roleLevel < 0 || roleLevel > 100) {
      return {status:403,error:"access_denied"};
    }
    return {
      status:200,
      identity:{
        user_id:user.id,
        email:typeof access.email === "string" ? access.email : "",
        is_maroowell:access.is_maroowell === true,
        is_admin:access.is_maroowell === true && access.is_admin === true,
        is_dragon_car_admin:access.is_dragon_car_admin === true,
        max_role_level:roleLevel
      }
    };
  } catch (error) {
    console.warn("MW_SECURITY_UPSTREAM_FAILURE",error && error.name ? error.name : "unknown");
    return {status:503,error:"identity_service_unavailable"};
  }
}

const SESSION_COOKIE = "__Host-mw_session";
const SESSION_MAX_AGE = 12 * 60 * 60;
const HOST_ORIGIN = "https://maroowell.com";

function randomString() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function sessionId(request) {
  const raw=request.headers.get("cookie")||"";
  if(raw.length>12000)return null;
  for(const entry of raw.split(";")){
    const pair=entry.trim();
    if(pair.startsWith(SESSION_COOKIE+"=")){
      const id=pair.slice(SESSION_COOKIE.length+1);
      return /^[a-zA-Z0-9_-]{43}$/.test(id)?id:null;
    }
  }
  return null;
}
function sessionResponse(data,status,request,cookieId,clear=false) {
  const response=respond(data,status,request);
  if(cookieId!==undefined) {
    const headers=new Headers(response.headers);
    headers.append("set-cookie",SESSION_COOKIE+"="+(clear?"":cookieId)+
      "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+(clear?0:SESSION_MAX_AGE));
    return new Response(response.body,{status,headers});
  }
  return response;
}
function allowedMutation(request) {
  const url=new URL(request.url);
  return url.origin===HOST_ORIGIN
    && request.headers.get("origin")===HOST_ORIGIN
    && !["cross-site","same-site"].includes(request.headers.get("sec-fetch-site")||"");
}
async function bodyJson(request) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")||""))return null;
  if(Number(request.headers.get("content-length")||"0")>4096)return null;
  const raw=await request.text();
  if(raw.length>4096)return null;
  try{const body=JSON.parse(raw);return body&&typeof body==="object"&&!Array.isArray(body)?body:null}catch{return null}
}
async function stubFor(env,name,kind="s") {
  if(!env.SESSIONS)throw new Error("session_store_unavailable");
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(kind+":"+name));
  const key=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");
  return env.SESSIONS.getByName("mw-"+kind+"-"+key);
}
async function getBrowserSession(request,env) {
  const id=sessionId(request);
  if(!id)return {ok:false,status:401,error:"authentication_required"};
  let stub, row;
  try{
    stub=await stubFor(env,id);
    row=await stub.fresh();
    if(!row)return {ok:false,status:401,error:"session_expired",clear:true};
    const checked=await verifyIdentity(
      new Request("https://security.internal/v1/auth/verify",{headers:{Authorization:"Bearer "+row.accessToken}}),env);
    if(checked.status!==200 || checked.identity?.user_id!==row.userId) {
      if(checked.status===503)return {ok:false,status:503,error:"authorization_service_unavailable"};
      await stub.revoke();
      return {ok:false,status:403,error:"access_denied",clear:true};
    }
    return {ok:true,stub,row,user:checked.identity};
  }catch(err){
    console.warn("MW_SESSION_ERROR",err?.name||"unknown");
    return {ok:false,status:503,error:"session_service_unavailable"};
  }
}
function csrfValid(request,row){
  const csrf=request.headers.get("x-csrf-token")||"";
  return /^[a-zA-Z0-9_-]{43}$/.test(csrf)&&csrf===row?.csrfToken;
}
async function sessionApi(request,env,url) {
  const endpoint=url.pathname;
  const allowed=["/api/session/login","/api/session/attach","/api/session/me","/api/session/refresh","/api/session/logout"];
  if(!allowed.includes(endpoint)||url.search)return respond({ok:false,error:"not_found"},404,request);
  const isRead=endpoint==="/api/session/me";
  if(request.method!==(isRead?"GET":"POST"))
    return respond({ok:false,error:"method_not_allowed"},405,request);
  if(!isRead&&!allowedMutation(request))
    return respond({ok:false,error:"origin_not_allowed"},403,request);
  if(endpoint==="/api/session/attach"){
    // Pilot bridge from the existing in-browser Supabase login. Tokens only
    // travel over same-origin HTTPS and are never returned to the caller.
    const body=await bodyJson(request);
    const accessToken=body?.access_token;
    const refreshToken=body?.refresh_token;
    const expiresAt=Date.now()+Number(body?.expires_in||0)*1000;
    if(typeof accessToken!=="string" || accessToken.length<20 || accessToken.length>6000
      || typeof refreshToken!=="string" || refreshToken.length<8 || refreshToken.length>2048
      || !Number.isFinite(expiresAt) || expiresAt<Date.now()+1000
      || expiresAt>Date.now()+7200000) {
      return respond({ok:false,error:"invalid_session_tokens"},400,request);
    }
    if(!env.SESSIONS || !validConfig(env))
      return respond({ok:false,error:"session_service_unavailable"},503,request);
    const checked=await verifyIdentity(
      new Request("https://security.internal/v1/auth/verify",{headers:{Authorization:"Bearer "+accessToken}}),env);
    if(checked.status!==200)
      return respond({ok:false,error:checked.status===503?"authorization_service_unavailable":"access_denied"},
        checked.status===503?503:403,request);
    try {
      const oldId=sessionId(request);
      const id=randomString();
      const stub=await stubFor(env,id);
      const issued=await stub.issue({userId:checked.identity.user_id,
        accessToken,refreshToken,expiresAt,csrfToken:randomString(),source:"attached"});
      if(!issued)return respond({ok:false,error:"session_service_unavailable"},503,request);
      if(oldId&&oldId!==id){
        try{await (await stubFor(env,oldId)).revoke()}catch{}
      }
      const row=await stub.read();
      if(!row)return respond({ok:false,error:"session_service_unavailable"},503,request);
      return sessionResponse({ok:true,user:checked.identity,csrf_token:row.csrfToken,
        expires_at:new Date(row.absoluteExpiresAt).toISOString()},200,request,id);
    }catch(error){
      console.warn("MW_SESSION_ATTACH_FAILED",error?.name||"unknown");
      return respond({ok:false,error:"session_service_unavailable"},503,request);
    }
  }
  if(endpoint==="/api/session/login"){
    const body=await bodyJson(request);
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const password=body?.password;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
      typeof password!=="string"||password.length<1||password.length>256)
      return respond({ok:false,error:"invalid_credentials"},401,request);
    const cfg=validConfig(env);
    if(!cfg||!env.SESSIONS)return respond({ok:false,error:"session_service_unavailable"},503,request);
    let throttle;
    let loginStage="rate_lookup";
    try{
      const ip=request.headers.get("cf-connecting-ip")||"unknown";
      throttle=await stubFor(env,ip,"rate");
      loginStage="rate_attempt";
      const attempt=await throttle.attempt();
      if(!attempt.allowed)return respond({ok:false,error:"rate_limited"},429,request);
      loginStage="auth_request";
      const result=await upstreamJson(cfg.origin+"/auth/v1/token?grant_type=password",{
        method:"POST",headers:{"apikey":cfg.key,"content-type":"application/json"},
        body:JSON.stringify({email,password})
      });
      if(!result.ok)return respond({ok:false,
        error:[400,401,403,422].includes(result.status)?"invalid_credentials":"auth_backend_unavailable",
        stage:"auth_http_"+result.status},[400,401,403,422].includes(result.status)?401:503,request);
      loginStage="auth_response";
      if(!result.body?.access_token||!result.body?.refresh_token||!Number(result.body?.expires_in))
        return respond({ok:false,error:"auth_backend_unavailable",stage:loginStage},503,request);
      loginStage="identity_check";
      const checked=await verifyIdentity(
        new Request("https://security.internal/v1/auth/verify",{headers:{Authorization:"Bearer "+result.body.access_token}}),env);
      if(checked.status!==200)return respond({ok:false,error:checked.status===503?"identity_service_unavailable":"access_denied",stage:loginStage},checked.status===503?503:403,request);
      loginStage="session_issue";
      const id=randomString();
      const now=Date.now();
      const stub=await stubFor(env,id);
      const saved=await stub.issue({
        userId:checked.identity.user_id,
        accessToken:result.body.access_token,refreshToken:result.body.refresh_token,
        expiresAt:now+Number(result.body.expires_in)*1000,csrfToken:randomString(),source:"server"
      });
      if(!saved)return respond({ok:false,error:"session_service_unavailable",stage:loginStage},503,request);
      loginStage="rate_reset";
      await throttle.resetAttempts();
      loginStage="session_read";
      const row=await stub.read();
      return sessionResponse({ok:true,user:checked.identity,csrf_token:row.csrfToken,
        expires_at:new Date(row.absoluteExpiresAt).toISOString()},200,request,id);
    }catch(err){
      // Deliberately no token, email, password or upstream response in logs.
      console.warn("MW_LOGIN_ERROR",loginStage,err?.name||"unknown");
      return respond({ok:false,error:"session_service_unavailable",stage:loginStage},503,request);
    }
  }
  const session=await getBrowserSession(request,env);
  if(endpoint==="/api/session/logout" && !sessionId(request))
    return sessionResponse({ok:true},200,request,"",true);
  if(!session.ok){
    if(endpoint==="/api/session/logout" && session.status!==503)
      return sessionResponse({ok:true},200,request,"",true);
    const r=respond({ok:false,error:session.error},session.status,request);
    return session.clear?sessionResponse({ok:false,error:session.error},session.status,request,"",true):r;
  }
  if(isRead)return respond({ok:true,user:session.user,csrf_token:session.row.csrfToken,
    expires_at:new Date(session.row.absoluteExpiresAt).toISOString()},200,request);
  if(!csrfValid(request,session.row))
    return respond({ok:false,error:"csrf_failed"},403,request);
  if(endpoint==="/api/session/refresh"){
    return respond({ok:true,user:session.user,csrf_token:session.row.csrfToken,
      expires_at:new Date(session.row.absoluteExpiresAt).toISOString()},200,request);
  }
  await session.stub.revoke();
  const cfg=validConfig(env);
  // Do NOT revoke the original Supabase session used by native WebViews or
  // legacy browser login: only a dedicated server-origin session owns that token.
  if(cfg&&session.row.source==="server"){
    try{
      await upstreamJson(cfg.origin+"/auth/v1/logout?scope=local",{
        method:"POST",headers:{"apikey":cfg.key,"Authorization":"Bearer "+session.row.accessToken},
      });
    }catch{}
  }
  return sessionResponse({ok:true},200,request,"",true);
}


const OVERVIEW_FIELDS=Object.freeze({"batch":"id,schedule_date,meta_work_date,camp_code,camp_name,wave,status,worker_count,last_polled_at,next_poll_at,last_error,updated_at,completion_method,completion_detected_at,work_completed_at,visible_until,metrics_status,metrics_close_at,metrics_closed_at,finalized_at","current":"batch_id,meta_worker_key,driver_pk,camp_code,camp_name,wave,coupang_id,driver_name,scheduled_routes,actual_routes,extra_routes,delivery_assigned,delivery_scanned,delivery_completed,delivery_impossible,delivery_pdd_miss,delivery_total,delivery_complete_rate,return_pending,return_collected,return_uncollected,return_uncollected_raw,return_absent_raw,return_total,return_attempt_rate,return_collection_rate,freshbag_pending,freshbag_collected,freshbag_uncollected,freshbag_total,freshbag_attempt_rate,freshbag_collection_rate,scan_started_at,all_completed_at,last_seen_at,all_done,dawn_miss,fresh_miss,raw_payload,delivery_started_at,round1_delivery_started_at,round2_scan_started_at,round2_delivery_started_at,work_completed_at","fresh":"batch_id,meta_worker_key,driver_pk,coupang_id,driver_name,delivery_assigned,delivery_scanned,delivery_completed,delivery_impossible,delivery_pdd_miss,delivery_total,delivery_complete_rate,fresh_miss","final":"batch_id,meta_worker_key,driver_pk,camp_code,camp_name,wave,coupang_id,driver_name,scheduled_routes,actual_routes,extra_routes,delivery_assigned,delivery_scanned,delivery_completed,delivery_impossible,delivery_pdd_miss,delivery_total,delivery_complete_rate,return_pending,return_collected,return_uncollected,return_uncollected_raw,return_absent_raw,return_total,return_attempt_rate,return_collection_rate,freshbag_pending,freshbag_collected,freshbag_uncollected,freshbag_total,freshbag_attempt_rate,freshbag_collection_rate,scan_started_at,delivery_started_at,round1_delivery_started_at,round2_scan_started_at,round2_delivery_started_at,work_completed_at,all_completed_at,last_seen_at,all_done,dawn_miss,fresh_miss,raw_payload,fresh_delivery_assigned,fresh_delivery_scanned,fresh_delivery_completed,fresh_delivery_impossible,fresh_delivery_pdd_miss,fresh_delivery_total,fresh_delivery_complete_rate","schedule":"schedule_date,camp,wave,route_label,driver_name,driver_display_name,driver_owner_name,driver_coupang_id,is_active"});
const OVERVIEW_TABLES=Object.freeze({
  batch:"meta_realtime_batch",current:"meta_realtime_current",
  fresh:"meta_realtime_fresh_current",final:"meta_realtime_final",
  schedule:"maroowell_schedule"
});
async function readOverviewTable(env,token,type,query={}) {
  const cfg=validConfig(env);
  if(!cfg || !Object.hasOwn(OVERVIEW_TABLES,type))throw Error("overview_configuration");
  const url=new URL("/rest/v1/"+OVERVIEW_TABLES[type],cfg.origin);
  url.searchParams.set("select",OVERVIEW_FIELDS[type]);
  for(const [k,v] of Object.entries(query))url.searchParams.set(k,v);
  const result=await upstreamJson(url.toString(),{
    method:"GET",
    headers:{apikey:cfg.key,authorization:"Bearer "+token,accept:"application/json"}
  },4000000);
  if(!result.ok || !Array.isArray(result.body))throw Error("overview_upstream");
  if(result.body.length>=1000)throw Error("overview_limit_exceeded");
  return result.body;
}
async function overviewApi(request,env,url) {
  if(url.pathname!=="/api/web/overview"||
     !["home","realtime"].includes(url.searchParams.get("mode"))||
     [...url.searchParams.keys()].some(k=>k!=="mode"))
    return respond({ok:false,error:"not_found"},404,request);
  if(request.method!=="GET")
    return respond({ok:false,error:"method_not_allowed"},405,request);
  const auth=await getBrowserSession(request,env);
  if(!auth.ok){
    return auth.clear?sessionResponse({ok:false,error:auth.error},auth.status,request,"",true)
      :respond({ok:false,error:auth.error},auth.status,request);
  }
  const mode=url.searchParams.get("mode");
  const minimum=mode==="home"?90:30;
  if(auth.user.is_maroowell!==true ||
      !Number.isFinite(Number(auth.user.max_role_level)) ||
      Number(auth.user.max_role_level)<minimum ||
      (mode==="home" && auth.user.is_admin!==true)) {
    return respond({ok:false,error:"insufficient_role"},403,request);
  }
  const nowKst=Date.now()+9*3600000;
  const cutoff=new Date(nowKst-3*86400000).toISOString().slice(0,10);
  try{
    const batches=await readOverviewTable(env,auth.row.accessToken,"batch",{
      "schedule_date":"gte."+cutoff,
      status:"in.(collecting,completion_candidate,overdue,error,paused,finalized)",
      order:"updated_at.desc",limit:"400"
    });
    if(!batches.length) return respond({
      ok:true,batches:[],current:[],fresh:[],final:[],schedule:[],
      read_at:new Date().toISOString(),source:"server"},200,request);
    const ids=[...new Set(batches.map(b=>b.id).filter(v=>/^[a-f0-9-]{36}$/i.test(String(v))))];
    const dates=[...new Set(batches.map(b=>b.schedule_date).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))))];
    if(!ids.length||!dates.length)return respond({ok:false,error:"overview_invalid_batches"},503,request);
    const idFilter="in.("+ids.join(",")+")";
    const dateFilter="in.("+dates.join(",")+")";
    const activeIds=batches.filter(b=>b.status!=="finalized").map(b=>b.id);
    const finalIds=batches.filter(b=>b.status==="finalized").map(b=>b.id);
    const activeFilter="in.("+activeIds.join(",")+")";
    const finalFilter="in.("+finalIds.join(",")+")";
    const [current,fresh,final,schedule]=await Promise.all([
      activeIds.length?readOverviewTable(env,auth.row.accessToken,"current",{batch_id:activeFilter,limit:"1000"}):[],
      activeIds.length?readOverviewTable(env,auth.row.accessToken,"fresh",{batch_id:activeFilter,limit:"1000"}):[],
      finalIds.length&&mode==="realtime"?readOverviewTable(env,auth.row.accessToken,"final",{batch_id:finalFilter,limit:"1000"}):[],
      readOverviewTable(env,auth.row.accessToken,"schedule",{schedule_date:dateFilter,is_active:"eq.true",limit:"1000"})
    ]);
    return respond({ok:true,batches,current,fresh,final,schedule,
      read_at:new Date().toISOString(),source:"server"},200,request);
  }catch(error){
    console.warn("MW_OVERVIEW_READ_FAILED",error?.message==="overview_limit_exceeded"?"row_limit":"upstream");
    return respond({ok:false,error:"overview_temporarily_unavailable"},503,request);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && !ORIGINS.has(origin)) return respond({ok:false,error:"origin_not_allowed"},403,request);
    if (url.pathname.startsWith("/api/session/")) return sessionApi(request,env,url);
    if (url.pathname.startsWith("/api/web/")) return overviewApi(request,env,url);
    if (url.pathname.startsWith("/api/supabase/") || url.pathname.startsWith("/api/worker/")) {
      return handleBff(request,env,{respond,getBrowserSession,validConfig,allowedMutation,csrfValid,sessionResponse});
    }
    if (url.pathname === "/health/session-store" && url.search === "") {
      if (request.method !== "GET") return respond({ok:false,error:"method_not_allowed"},405,request);
      try {
        if (!env.SESSIONS) throw Error("missing_binding");
        const ready = await env.SESSIONS.getByName("mw-security-health-v1").ping();
        if(ready!==true)return respond({ok:false,error:"session_store_unavailable",stage:"rpc"},503,request);
        // Ping only proves the class loads; the actual login uses DO storage.
        // Exercise that isolated rate-limit storage without touching user buckets.
        const probe = await stubFor(env,"internal-health-probe-v1","rate");
        const result = await probe.attempt();
        if(result?.allowed!==true)return respond({ok:false,error:"rate_store_unavailable",stage:"attempt"},503,request);
        await probe.resetAttempts();
        return respond({ok:true,session_store:"ready",rate_store:"ready",auth_config:validConfig(env)?"ready":"invalid"},200,request);
      } catch (err) {
        console.warn("MW_SESSION_HEALTH",err?.name||"unknown");
        return respond({ok:false,error:"rate_store_unavailable",stage:"storage"},503,request);
      }
    }
    if (url.pathname === HEALTH_PATH && url.search === "") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return respond({ok:false,error:"method_not_allowed"},405,request);
      }
      const response = respond({ok:true,service:"maroowell-security",stage:"isolated",data_proxy:false},200,request);
      return request.method === "HEAD" ? new Response(null,{status:200,headers:response.headers}) : response;
    }
    if (url.pathname !== API_PATH || url.search !== "") {
      return respond({ok:false,error:"not_found"},404,request);
    }
    if (request.method === "OPTIONS") {
      if (!origin) return respond({ok:false,error:"origin_required"},403,request);
      const headers = new Headers(SECURITY_HEADERS);
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-allow-methods", "GET, OPTIONS");
      headers.set("access-control-allow-headers", "Authorization");
      headers.set("access-control-max-age", "300");
      return new Response(null,{status:204,headers});
    }
    if (request.method !== "GET") return respond({ok:false,error:"method_not_allowed"},405,request);
    const verified = await verifyIdentity(request,env);
    if (verified.status !== 200) return respond({ok:false,error:verified.error},verified.status,request);
    return respond({ok:true,identity:verified.identity},200,request);
  }
};

export { SessionStore } from "./session-store.js";
import { handleBff } from "./bff.js";
