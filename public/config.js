// MarooWell Frontend Config
// Frontend에는 Supabase publishable key만 둡니다. service_role/secret key는 절대 노출하지 않습니다.
window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: ["sb_publishable_", "FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H"].join(""),
  ADMIN_API_BASE: "https://admin-access.maroowell.com",
  CLEANSING_HISTORY_API_BASE: "https://cleansinghistory.maroowell.com",
  PATHS: {
    login: "/",
    index: "/zipcode_search",
    route: "/coupangRouteMap.html",
    dragon_car_index: "/dragon_car_index.html",
    maroowell_info: "/maroowell_info.html"
  }
};

(() => {
  "use strict";
  if (window.__MW_COMMON_FETCH_V120__) return;
  if (typeof window.fetch !== "function") return;
  window.__MW_COMMON_FETCH_V120__ = true;

  const cfg = window.MARUWELL_CONFIG || {};
  const supabaseBase = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(cfg.SUPABASE_ANON_KEY || "");
  const nativeFetch = window.fetch.bind(window);
  const supabaseOrigin = (() => { try { return new URL(supabaseBase).origin; } catch { return ""; } })();
  const accessCache = new Map();
  const ACCESS_TTL = 20_000;

  function toUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, location.href);
      if (input instanceof URL) return input;
      if (input && typeof input.url === "string") return new URL(input.url, location.href);
    } catch {}
    return null;
  }
  function methodOf(input, init) { return String(init?.method || input?.method || "GET").toUpperCase(); }
  function headersOf(input, init) {
    const headers = new Headers(input?.headers || undefined);
    if (init?.headers) new Headers(init.headers).forEach((v,k) => headers.set(k,v));
    return headers;
  }
  function jsonBody(init) {
    if (!init || typeof init.body !== "string") return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }
  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" } });
  }
  function errorText(text, fallback) {
    try { const j = JSON.parse(text); return String(j?.message || j?.error || j?.details || j?.hint || fallback); }
    catch { return String(text || fallback); }
  }
  function bearer(headers) { return String(headers.get("Authorization") || ""); }

  async function directFreshbagBulk(input, init, headers) {
    const payload = jsonBody(init);
    const rows = Array.isArray(payload?.rows) ? payload.rows : null;
    if (!rows) return nativeFetch(input, init);
    if (!rows.length) return jsonResponse({ok:true,upserted:0,mode:"supabase-bulk"});
    if (rows.length > 2000) return jsonResponse({ok:false,error:"한 번에 업로드 가능한 최대 행 수는 2,000건입니다."},413);
    const auth = bearer(headers);
    if (!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ok:false,error:"로그인 세션이 필요합니다."},401);
    const url = new URL(`${supabaseBase}/rest/v1/coupang_freshbag`);
    url.searchParams.set("on_conflict","data_year,month_no,wave,camp,route_norm");
    const res = await nativeFetch(url.href,{method:"POST",headers:{apikey:publishableKey,Authorization:auth,"Content-Type":"application/json",Accept:"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows),cache:"no-store"});
    const text = await res.text();
    return res.ok ? jsonResponse({ok:true,upserted:rows.length,mode:"supabase-bulk"}) : jsonResponse({ok:false,error:errorText(text,`Supabase bulk upsert 실패 (HTTP ${res.status})`)},res.status);
  }

  async function directAccountQuery(input, init, headers) {
    const payload = jsonBody(init) || {};
    const period = payload.period || {};
    const auth = bearer(headers);
    if (!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ok:false,error:"로그인 세션이 필요합니다."},401);
    const rows=[]; const pageSize=1000; const maxRows=50000;
    for (let offset=0; offset<maxRows; offset+=pageSize) {
      const url = new URL(`${supabaseBase}/rest/v1/maroowell_account`);
      url.searchParams.set("select","*");
      const year=Number(period.year||0), start=Number(period.startMonth||0), end=Number(period.endMonth||0);
      if (Number.isInteger(year)&&year>0) url.searchParams.set("date_year",`eq.${year}`);
      if (start>=1&&start<=12) url.searchParams.set("date_month",`gte.${start}`);
      if (end>=1&&end<=12) url.searchParams.set("date_month",`lte.${end}`);
      url.searchParams.set("order","delivery_date.asc.nullslast,camp.asc.nullslast,route.asc.nullslast");
      url.searchParams.set("limit",String(pageSize)); url.searchParams.set("offset",String(offset));
      const res=await nativeFetch(url.href,{headers:{apikey:publishableKey,Authorization:auth,Accept:"application/json"},cache:"no-store"});
      const text=await res.text();
      if(!res.ok) return jsonResponse({ok:false,error:errorText(text,`정산 직접 조회 실패 (HTTP ${res.status})`)},res.status);
      let batch=[]; try{batch=JSON.parse(text)}catch{}
      if(!Array.isArray(batch)) return jsonResponse({ok:false,error:"정산 조회 응답 형식이 올바르지 않습니다."},502);
      rows.push(...batch); if(batch.length<pageSize) return jsonResponse({ok:true,rows,mode:"supabase-filtered"});
    }
    return jsonResponse({ok:false,error:"조회 결과가 50,000행을 초과했습니다."},413);
  }

  // 라우트 단가 목록은 Supabase RLS로 직접 읽는다. 백엔드가 원청단가 컬럼을 누락해도
  // 최고관리자/관리자에게 DB의 24/25/26년 원청단가가 그대로 전달된다.
  async function directRoutePriceList(headers) {
    const auth = bearer(headers);
    if (!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ok:false,error:"로그인 세션이 필요합니다."},401);
    const url = new URL(`${supabaseBase}/rest/v1/maroowell_route`);
    url.searchParams.set("select","*");
    url.searchParams.set("order","seq.asc");
    const res = await nativeFetch(url.href,{headers:{apikey:publishableKey,Authorization:auth,Accept:"application/json"},cache:"no-store"});
    const text = await res.text();
    if(!res.ok) return jsonResponse({ok:false,error:errorText(text,`라우트 단가 조회 실패 (HTTP ${res.status})`)},res.status);
    let rows=[]; try{rows=JSON.parse(text)}catch{}
    return Array.isArray(rows) ? jsonResponse({ok:true,rows,mode:"supabase-direct-v120"}) : jsonResponse({ok:false,error:"라우트 단가 응답 형식 오류"},502);
  }

  async function refreshWebSessionToken() {
    if (!window.supabase?.createClient || !supabaseBase || !publishableKey) return "";
    let storage; try { storage = window.sessionStorage; } catch { storage = undefined; }
    try {
      const client = window.supabase.createClient(supabaseBase,publishableKey,{
        auth:{persistSession:!!storage,storage,autoRefreshToken:false,detectSessionInUrl:false},
        global:{fetch:nativeFetch}
      });
      let {data:{session}} = await client.auth.getSession();
      if (!session?.refresh_token) return session?.access_token || "";
      const refreshed = await client.auth.refreshSession();
      return refreshed?.data?.session?.access_token || "";
    } catch { return ""; }
  }

  async function routeInfoWithRetry(input, init, url) {
    let res = await nativeFetch(input,init);
    if (res.status !== 401) return res;
    const token = await refreshWebSessionToken();
    if (!token) return res;
    const nextHeaders = headersOf(input,init);
    nextHeaders.set("Authorization","Bearer "+token);
    res = await nativeFetch(url.href,{...init,headers:nextHeaders,cache:"no-store"});
    return res;
  }

  function isAccessRequest(url, method) {
    if (!url || url.origin!==supabaseOrigin) return false;
    if (method==="POST") return url.pathname==="/rest/v1/rpc/mw_my_access" || url.pathname==="/rest/v1/rpc/mw_my_account_state";
    return method==="GET" && url.pathname==="/rest/v1/cleansing_history_access" && url.searchParams.get("select")==="can_select";
  }
  async function cachedAccessFetch(input,init,url,method,headers) {
    const key=`${method}|${url.href}|${bearer(headers)}|${typeof init?.body==="string"?init.body:""}`;
    const hit=accessCache.get(key), now=Date.now();
    if(hit&&hit.exp>now) return new Response(hit.body,{status:hit.status,headers:hit.headers});
    const res=await nativeFetch(input,init); const body=await res.clone().text();
    if(res.ok) accessCache.set(key,{body,status:res.status,headers:Array.from(res.headers.entries()),exp:now+ACCESS_TTL});
    return res;
  }

  window.fetch = async function mwFetchV120(input,init) {
    const url=toUrl(input), method=methodOf(input,init), headers=headersOf(input,init);
    if(url && method==="POST" && url.origin!==supabaseOrigin && url.pathname.endsWith("/freshbag/upsert")) return directFreshbagBulk(input,init,headers);
    if(url && method==="POST" && url.origin!==supabaseOrigin && url.pathname.endsWith("/account/query")) return directAccountQuery(input,init,headers);
    if(url && method==="POST" && url.origin!==supabaseOrigin && url.pathname.endsWith("/route-price/list")) return directRoutePriceList(headers);
    if(url && method==="POST" && /\/route-info\//.test(url.pathname)) return routeInfoWithRetry(input,init,url);
    if(isAccessRequest(url,method)) return cachedAccessFetch(input,init,url,method,headers);
    return nativeFetch(input,init);
  };
})();

// 라우트 편집기의 분석 scope는 subsubroute/route_polygon만 허용한다.
(() => {
  if (window.__MW_ROUTE_ANALYSIS_SCOPE_GUARD_V120__) return;
  const currentPath=String(location.pathname||"").replace(/\.html$/i,"").replace(/\/$/,"");
  if(currentPath!=="/coupangRouteMap" || typeof window.fetch!=="function") return;
  window.__MW_ROUTE_ANALYSIS_SCOPE_GUARD_V120__=true;
  const previousFetch=window.fetch.bind(window);
  const finitePositive=(...xs)=>{for(const x of xs){const n=Number(x);if(Number.isSafeInteger(n)&&n>0)return n}return null};
  window.fetch=async function(input,init){
    let url; try{url=typeof input==="string"?new URL(input,location.href):new URL(input.url)}catch{return previousFetch(input,init)}
    const method=String(init?.method||input?.method||"GET").toUpperCase();
    if(url.hostname!=="zip.maroowell.com" || !["/terrain","/building/stats"].includes(url.pathname) || method!=="POST" || typeof init?.body!=="string") return previousFetch(input,init);
    let p; try{p=JSON.parse(init.body)}catch{return previousFetch(input,init)}
    delete p.subrouteId; delete p.subroute_id;
    let scope=String(p.scopeType||p.scope_type||"").trim();
    if(scope==="subroute") scope="subsubroute";
    if(scope==="zipcode") throw new Error("라우트 편집기에서는 zipcode 분석 scope를 사용할 수 없습니다.");
    if(scope==="subsubroute") {
      const id=finitePositive(p.subsubrouteId,p.subsubroute_id,p.scopeKey,p.scope_key);
      if(!id) throw new Error("라우트 분석에는 유효한 subsubroutes.id가 필요합니다.");
      Object.assign(p,{scopeType:"subsubroute",scope_type:"subsubroute",scopeKey:String(id),scope_key:String(id),subsubrouteId:id,subsubroute_id:id});
      delete p.zipcode; delete p.zip_code; delete p.postalCode; delete p.postal_code;
    }
    return previousFetch(input,{...init,body:JSON.stringify(p)});
  };
})();

// maroowell_route_info 검색 UX 보강: 클릭 즉시 상태를 보여주고, 앱에서 camp/route 파라미터로
// 들어온 경우 초기화가 완료된 후 자동 조회한다. 실제 조회는 페이지의 loadData가 수행한다.
window.addEventListener("DOMContentLoaded",()=>{
  const path=String(location.pathname||"").replace(/\.html$/i,"").replace(/\/$/,"");
  if(path==="/maroowell_route_info") {
    const campInput=document.getElementById("campInput"), routeInput=document.getElementById("routeSearchInput"), loadBtn=document.getElementById("loadBtn"), status=document.getElementById("statusText");
    if(loadBtn) loadBtn.addEventListener("click",()=>{ if(status) status.textContent="조회 요청 중..."; },true);
    const params=new URLSearchParams(location.search); const camp=String(params.get("camp")||"").trim(), route=String(params.get("route")||"").trim();
    if(camp&&campInput&&routeInput&&loadBtn){campInput.value=camp;routeInput.value=route;let n=0;const t=setInterval(()=>{n++;const s=status?.textContent||"";if((s.includes("Camp")&&s.includes("Route"))||n>40){clearInterval(t);loadBtn.click()}},200)}
  }

  if(path!=="/admin_access") return;
  const cfg=window.MARUWELL_CONFIG||{};
  const list=document.getElementById("accountSearchList");
  if(!list) return;
  const addDeleteButtons=()=>{
    list.querySelectorAll("article.item").forEach(article=>{
      if(article.querySelector("[data-delete-account]")) return;
      const source=article.querySelector("[data-account-action][data-user-id]");
      const userId=source?.getAttribute("data-user-id");
      if(!userId) return;
      const actions=article.querySelector(".accountActions"); if(!actions) return;
      const btn=document.createElement("button"); btn.type="button"; btn.className="btn red small"; btn.textContent="계정 삭제"; btn.dataset.deleteAccount=userId;
      actions.appendChild(btn);
    });
  };
  const observer=new MutationObserver(addDeleteButtons); observer.observe(list,{childList:true,subtree:true}); addDeleteButtons();
  list.addEventListener("click",async e=>{
    const btn=e.target.closest("[data-delete-account]"); if(!btn)return;
    e.preventDefault(); e.stopPropagation();
    const userId=btn.dataset.deleteAccount; const article=btn.closest("article.item"); const label=article?.querySelector(".name")?.textContent?.trim()||"선택 계정";
    if(!confirm(`${label} 계정을 완전히 삭제할까요?\n\n로그인 계정과 연결된 앱/권한 정보가 삭제됩니다.`)) return;
    btn.disabled=true; btn.textContent="삭제 중...";
    try{
      if(!window.supabase?.createClient) throw new Error("Supabase SDK를 불러오지 못했습니다.");
      let storage; try{storage=sessionStorage}catch{storage=undefined}
      const client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:!!storage,storage,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data:{session}}=await client.auth.getSession(); if(!session?.access_token) throw new Error("로그인 세션이 없습니다.");
      const res=await fetch(String(cfg.SUPABASE_URL).replace(/\/$/,"")+"/functions/v1/admin-delete-account",{method:"POST",headers:{apikey:cfg.SUPABASE_ANON_KEY,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({user_id:userId}),cache:"no-store"});
      const text=await res.text(); let data={}; try{data=JSON.parse(text)}catch{data={error:text}}
      if(!res.ok) throw new Error(data.error||`HTTP ${res.status}`);
      article.remove();
      const status=document.getElementById("statusText"); if(status){status.textContent=`${label} 계정을 삭제했습니다.`;status.className="statusText ok"}
    }catch(err){alert(err?.message||String(err));btn.disabled=false;btn.textContent="계정 삭제"}
  },true);
});
