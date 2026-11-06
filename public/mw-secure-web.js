/* MAROOWELL browser-only secure session bridge.
 * Activate only after an explicit server-auth login. Native app WebViews and
 * existing sessions retain their legacy flows until migration is certified.
 * No real JWT or refresh token is ever returned to JavaScript in secure mode.
 */
(()=>{"use strict";
 if(window.__MW_WEB_SECURE_BRIDGE__)return;
 window.__MW_WEB_SECURE_BRIDGE__=true;
 const SUPA_HOST="rgqerimdxkthkcewqbbe.supabase.co";
 const FLAG="mw_web_server_auth";
 const ACTIVE=()=>{try{return sessionStorage.getItem(FLAG)==="1"}catch{return false}};
 window.__MW_SECURE_FETCH_ACTIVE__=ACTIVE;
 const originalFetch=window.fetch.bind(window);
 const nativeCreateClient=window.supabase?.createClient?.bind(window.supabase);
 const workerOrigins=Object.freeze({
  "route.maroowell.com":"route",
  "purple-river-0717.brain-0f6.workers.dev":"route_legacy",
  "schedule.maroowell.com":"schedule",
  "home-system.brain-0f6.workers.dev":"home",
  "maroowellinfo.brain-0f6.workers.dev":"info",
  "maroowellroute.brain-0f6.workers.dev":"route_price",
  "routeinfo.brain-0f6.workers.dev":"route_info",
  "payout.maroowell.com":"payout",
  "admin-access.maroowell.com":"admin_access",
  "cleansinghistory.maroowell.com":"cleansing",
  "maroowellaccount.brain-0f6.workers.dev":"account",
  "freshbag.brain-0f6.workers.dev":"freshbag",
  "maroowellfreshbag.brain-0f6.workers.dev":"mw_freshbag",
  "coupangcamp.brain-0f6.workers.dev":"camp",
  "zip.maroowell.com":"zip",
  "meta-direct-poc.brain-0f6.workers.dev":"meta"
 });
 const blocked=new Set(["api/session","api/web","api/worker","api/supabase"]);
 let cached=null,promise=null;
 const realSession=async(force=false)=>{
  if(!force && cached && Date.now()<cached.until)return cached.data;
  if(promise)return promise;
  promise=(async()=>{
   const response=await originalFetch("/api/session/me",{method:"GET",cache:"no-store",credentials:"same-origin",redirect:"error"});
   if(!response.ok){
    cached=null;
    return null;
   }
   const json=await response.json();
   if(json?.ok!==true||typeof json.user?.user_id!=="string")return null;
   cached={data:json,until:Date.now()+5000};
   return json;
  })().finally(()=>{promise=null});
  return promise;
 };
 const fakeSession=(obj)=>{
  if(!obj)return null;
  const expiry=Date.parse(obj.expires_at)||Date.now()+1800000;
  const user={id:obj.user.user_id,email:obj.user.email||"",aud:"authenticated",
    app_metadata:{},user_metadata:{}};
  return{access_token:"MW_SERVER_COOKIE_ONLY",refresh_token:"MW_SERVER_COOKIE_ONLY",
   token_type:"bearer",expires_at:Math.floor(expiry/1000),
   expires_in:Math.max(0,Math.floor((expiry-Date.now())/1000)),user};
 };
 async function csrf(){
  const session=await realSession(true);
  if(!session||typeof session.csrf_token!=="string")throw Error("secure_session_required");
  return session.csrf_token;
 }
 function urlFor(input){
  try{return new URL(typeof input==="string"?input:input instanceof URL?input.href:input?.url,location.href)}
  catch{return null}
 }
 function reqMethod(input,init){return String(init?.method||input?.method||"GET").toUpperCase()}
 function mergedHeaders(input,init){
  const h=new Headers(input?.headers||undefined);
  if(init?.headers)new Headers(init.headers).forEach((v,k)=>h.set(k,v));
  return h;
 }
 function blockedResponse(){
  return new Response(JSON.stringify({ok:false,error:"secure_web_route_not_enabled"}),{
   status:403,headers:{"content-type":"application/json","cache-control":"no-store"}
  });
 }
 async function secureFetch(input,init){
  if(!ACTIVE())return originalFetch(input,init);
  const url=urlFor(input);
  if(!url)return originalFetch(input,init);
  if(url.origin===location.origin && !url.pathname.startsWith("/api/")){
   return originalFetch(input,init);
  }
  // Internal BFF/session requests must never be rewritten recursively.
  if(url.origin===location.origin && url.pathname.startsWith("/api/")){
   return originalFetch(input,init);
  }
  let rewritten=null;
  if(url.hostname===SUPA_HOST){
   if(/^\/(rest\/v1\/|storage\/v1\/object\/|functions\/v1\/)/.test(url.pathname)){
    rewritten="/api/supabase"+url.pathname+url.search;
   }else{
    // A secure browser never sends auth tokens directly to Supabase.
    return blockedResponse();
   }
  }else if(Object.hasOwn(workerOrigins,url.hostname)){
   rewritten="/api/worker/"+workerOrigins[url.hostname]+url.pathname+url.search;
  }else if(/(?:\.maroowell\.com|\.workers\.dev)$/.test(url.hostname)){
   return blockedResponse();
  }else{
   return originalFetch(input,init);
  }
  const method=reqMethod(input,init);
  const headers=mergedHeaders(input,init);
  headers.delete("authorization");headers.delete("apikey");
  headers.delete("cookie");headers.delete("host");
  if(!["GET","HEAD"].includes(method)){
   try{headers.set("x-csrf-token",await csrf())}
   catch{return new Response(JSON.stringify({ok:false,error:"session_expired"}),{
    status:401,headers:{"content-type":"application/json"}
   })}
  }
  const options={...init,method,headers,credentials:"same-origin",cache:"no-store",redirect:"error"};
  if(input instanceof Request && init?.body===undefined && !["GET","HEAD"].includes(method)){
   options.body=await input.clone().arrayBuffer();
  }
  return originalFetch(rewritten,options);
 }
 window.fetch=secureFetch;
 if(!nativeCreateClient)return;
 window.supabase.createClient=function(url,key,options={}){
  if(!ACTIVE())return nativeCreateClient(url,key,options);
  const opts={...options,
   global:{...(options.global||{}),fetch:secureFetch},
   auth:{...(options.auth||{}),autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  };
  const client=nativeCreateClient(url,key,opts);
  const listeners=new Set();
  const emit=(event,session)=>{for(const cb of listeners)try{cb(event,session)}catch(e){console.warn("MW_AUTH_LISTENER",e?.name||"unknown")}};
  client.auth.getSession=async()=>({data:{session:fakeSession(await realSession())},error:null});
  client.auth.getUser=async()=>({data:{user:fakeSession(await realSession())?.user||null},error:null});
  client.auth.refreshSession=async()=>{
   let current=await realSession(true);
   if(!current)return{data:{session:null,user:null},error:{message:"Login required"}};
   const response=await originalFetch("/api/session/refresh",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":await csrf()},body:"{}"
   });
   if(!response.ok)return{data:{session:null,user:null},error:{message:"Session refresh failed"}};
   cached=null;current=await realSession(true);
   const session=fakeSession(current);emit("TOKEN_REFRESHED",session);
   return{data:{session,user:session?.user||null},error:null};
  };
  client.auth.signOut=async()=>{
   const current=await realSession(true);
   if(current?.csrf_token){
    const response=await originalFetch("/api/session/logout",{
     method:"POST",credentials:"same-origin",cache:"no-store",
     headers:{"x-csrf-token":current.csrf_token}
    });
    if(!response.ok)return{error:{message:"Server logout failed"}};
   }
   cached=null;sessionStorage.removeItem(FLAG);
   sessionStorage.removeItem("mw_security_pilot_active");
   emit("SIGNED_OUT",null);
   return{error:null};
  };
  client.auth.setSession=async()=>({data:{session:fakeSession(await realSession()),user:fakeSession(await realSession())?.user||null},error:null});
  client.auth.onAuthStateChange=callback=>{
   listeners.add(callback);
   Promise.resolve().then(async()=>{if(listeners.has(callback))callback("INITIAL_SESSION",fakeSession(await realSession()))}).catch(()=>{});
   return{data:{subscription:{unsubscribe(){listeners.delete(callback)}}}};
  };
  return client;
 };
})();