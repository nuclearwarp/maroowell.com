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
async function upstreamJson(url, init) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  if (text.length > 100000) throw new Error("upstream_oversize");
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
    if (access.is_maroowell !== true || state.approval_status !== "approved" || state.app_only === true) {
      return {status:403,error:"access_denied"};
    }
    const roleLevel = Number(access.max_role_level || 0);
    if (!Number.isFinite(roleLevel) || roleLevel <= 0) {
      return {status:403,error:"access_denied"};
    }
    return {
      status:200,
      identity:{
        user_id:user.id,
        email:typeof access.email === "string" ? access.email : "",
        is_maroowell:true,
        is_admin:access.is_admin === true,
        max_role_level:roleLevel
      }
    };
  } catch (error) {
    console.warn("MW_SECURITY_UPSTREAM_FAILURE",error && error.name ? error.name : "unknown");
    return {status:503,error:"identity_service_unavailable"};
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && !ORIGINS.has(origin)) return respond({ok:false,error:"origin_not_allowed"},403,request);
    if (url.pathname === "/health/session-store" && url.search === "") {
      if (request.method !== "GET") return respond({ok:false,error:"method_not_allowed"},405,request);
      try {
        if (!env.SESSIONS) throw Error("missing_binding");
        const ready = await env.SESSIONS.getByName("mw-security-health-v1").ping();
        return respond({ok:ready===true,session_store:ready===true?"ready":"unavailable"},ready===true?200:503,request);
      } catch {
        return respond({ok:false,error:"session_store_unavailable"},503,request);
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
