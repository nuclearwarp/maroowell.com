// Ensure the global typography stylesheet is always loaded last so legacy page CSS cannot override it.
(() => {
  "use strict";
  const TYPOGRAPHY_HREF = "/mw-global-font.css?v=20260925-3";
  function installTypography() {
    try {
      const head = document.head || document.documentElement;
      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .find(el => /\/mw-global-font\.css(?:\?|$)/.test(String(el.getAttribute("href") || "")));
      const link = existing || document.createElement("link");
      link.rel = "stylesheet";
      link.href = TYPOGRAPHY_HREF;
      if (existing) existing.remove();
      head.appendChild(link);
    } catch {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installTypography, { once:true });
  } else {
    installTypography();
  }
})();

// MarooWell Frontend Config
// Frontend에는 Supabase publishable key만 둡니다. service_role/secret key는 절대 노출하지 않습니다.
window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: ["sb_publishable_", "FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H"].join(""),
  ADMIN_API_BASE: "https://admin-access.maroowell.com",
  CLEANSING_HISTORY_API_BASE: "https://cleansinghistory.maroowell.com",
  PATHS: {
    login: "/",
    index: "/post_login",
    route: "/route-map-v71-20260925.html",
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
    if (payload.statisticsVersion === 1) {
      const res = await nativeFetch(`${supabaseBase}/rest/v1/rpc/mw_account_statistics`, {
        method: "POST",
        headers: {apikey:publishableKey, Authorization:auth, "Content-Type":"application/json", Accept:"application/json"},
        body: JSON.stringify({
          p_year: period.year ?? null,
          p_start_month: period.startMonth ?? null,
          p_end_month: period.endMonth ?? null
        }),
        cache: "no-store",
        signal: init?.signal
      });
      const text = await res.text();
      if (!res.ok) return jsonResponse({ok:false,error:errorText(text,`통계 조회 실패 (HTTP ${res.status})`)},res.status);
      let data; try { data = JSON.parse(text); } catch {}
      if (!data?.ok || !Array.isArray(data.rows)) return jsonResponse({ok:false,error:"통계 조회 응답 형식이 올바르지 않습니다."},502);
      return jsonResponse(data);
    }
    // Compatibility for an already-open page that predates statisticsVersion.
    const rows=[]; const pageSize=1000; const maxRows=50000;
    for (let offset=0; offset<maxRows; offset+=pageSize) {
      const url = new URL(`${supabaseBase}/rest/v1/maroowell_account`);
      url.searchParams.set("select","row_id,classify,id,route,delivery_date,camp,wave,parcel,return,source_sheet,date_year,date_month");
      const year=Number(period.year||0), start=Number(period.startMonth||0), end=Number(period.endMonth||0);
      if (Number.isInteger(year)&&year>0) url.searchParams.set("date_year",`eq.${year}`);
      if (start>=1&&start<=12) url.searchParams.append("date_month",`gte.${start}`);
      if (end>=1&&end<=12) url.searchParams.append("date_month",`lte.${end}`);
      url.searchParams.set("order","delivery_date.asc.nullslast,camp.asc.nullslast,route.asc.nullslast,row_id.asc");
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
    const h={apikey:publishableKey,Authorization:auth,Accept:"application/json"};
    const [routesRes,ratesRes,periodsRes]=await Promise.all([
      nativeFetch(`${supabaseBase}/rest/v1/maroowell_route?select=*&order=seq.asc`,{headers:h,cache:"no-store"}),
      nativeFetch(`${supabaseBase}/rest/v1/maroowell_route_rates?select=route_seq,period_code,origin_price,fixed_price,backup_price&order=route_seq.asc,period_code.asc`,{headers:h,cache:"no-store"}),
      nativeFetch(`${supabaseBase}/rest/v1/maroowell_rate_periods?select=period_code,period_label,effective_from,effective_to,sort_order,is_active&order=sort_order.asc`,{headers:h,cache:"no-store"})
    ]);
    const responses=[routesRes,ratesRes,periodsRes];    for(const res of responses){if(!res.ok){const text=await res.text();return jsonResponse({ok:false,error:errorText(text,`라우트 단가 조회 실패 (HTTP ${res.status})`)},res.status)}}
    const routes=await routesRes.json(), rates=await ratesRes.json(), periods=await periodsRes.json();
    const byRoute=new Map();
    for(const r of Array.isArray(rates)?rates:[]){const key=String(r.route_seq);if(!byRoute.has(key))byRoute.set(key,{});byRoute.get(key)[String(r.period_code)]=r}
    const rows=(Array.isArray(routes)?routes:[]).map(route=>{
      const rateMap=byRoute.get(String(route.seq))||{};
      const out={...route};
      for(const y of ["2024","2025","2026"]){const rr=rateMap[y]||{};const yy=y.slice(2);out[`${yy}_origin_price`]=rr.origin_price??route[`${yy}y_orgin_price`]??null;out[`${yy}_fixed_price`]=rr.fixed_price??(y==="2026"?route.fixed_price:null);out[`${yy}_backup_price`]=rr.backup_price??(y==="2026"?route.backup_price:null)}
      return out;
    });
    return jsonResponse({ok:true,rows,periods:Array.isArray(periods)?periods:[],mode:"supabase-rate-history-v1"});
  }

  async function directRoutePriceSave(headers,payload) {
    const auth=bearer(headers);
    if(!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ok:false,error:"로그인 세션이 필요합니다."},401);
    const baseHeaders={apikey:publishableKey,Authorization:auth,"Content-Type":"application/json",Accept:"application/json"};
    const baseKeys=new Set(["camp","route","wave","contract_date","address","route_tip"]);
    const years=["2024","2025","2026"];
    const rateKey=(yy,t)=>`${yy.slice(2)}_${t}_price`;    async function call(path,method,body,prefer="return=minimal"){
      const h={...baseHeaders,Prefer:prefer};
      const res=await nativeFetch(`${supabaseBase}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
      const text=await res.text();
      if(!res.ok)throw new Error(errorText(text,`라우트 단가 저장 실패 (HTTP ${res.status})`));
      if(!text)return null;
      try{return JSON.parse(text)}catch{return null}
    }
    function splitRow(row){
      const base={};
      for(const k of baseKeys)if(Object.prototype.hasOwnProperty.call(row,k))base[k]=row[k];
      const rates=[];
      for(const y of years){
        const rr={period_code:y};let touched=false;
        for(const t of ["origin","fixed","backup"]){const k=rateKey(y,t);if(Object.prototype.hasOwnProperty.call(row,k)){rr[`${t}_price`]=row[k];touched=true}}
        if(touched)rates.push(rr)
      }
      return{base,rates}
    }
    try{      for(const seq of (Array.isArray(payload?.deleteIds)?payload.deleteIds:[])){
        await call(`/rest/v1/maroowell_route?seq=eq.${encodeURIComponent(seq)}`,"DELETE")
      }
      for(const row of (Array.isArray(payload?.updateRows)?payload.updateRows:[])){
        const seq=row?.seq;if(seq==null)continue;
        const {base,rates}=splitRow(row);
        if(Object.keys(base).length)await call(`/rest/v1/maroowell_route?seq=eq.${encodeURIComponent(seq)}`,"PATCH",base);
        if(rates.length){
          const body=rates.map(r=>({...r,route_seq:seq}));
          await call('/rest/v1/maroowell_route_rates?on_conflict=route_seq,period_code',"POST",body,"resolution=merge-duplicates,return=minimal")
        }
      }
      for(const row of (Array.isArray(payload?.newRows)?payload.newRows:[])){
        const {base,rates}=splitRow(row);
        const inserted=await call('/rest/v1/maroowell_route?select=seq',"POST",base,"return=representation");
        const seq=Array.isArray(inserted)?inserted[0]?.seq:null;
        if(seq==null)throw new Error("신규 라우트 seq를 확인할 수 없습니다.");
        const allRates=years.map(y=>{const found=rates.find(r=>r.period_code===y)||{period_code:y};return{...found,route_seq:seq}});
        await call('/rest/v1/maroowell_route_rates?on_conflict=route_seq,period_code',"POST",allRates,"resolution=merge-duplicates,return=minimal");
      }      return jsonResponse({ok:true,mode:"supabase-rate-history-v1"});
    }catch(e){return jsonResponse({ok:false,error:e?.message||String(e)},400)}
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
    if(hit&&hit.exp>now) return hit.res.clone();
    const res=await nativeFetch(input,init), buf=await res.arrayBuffer(), h=new Headers(res.headers), saved=new Response(buf.slice(0),{status:res.status,statusText:res.statusText,headers:h});
    accessCache.set(key,{exp:now+ACCESS_TTL,res:saved});
    return new Response(buf,{status:res.status,statusText:res.statusText,headers:h});
  }

  window.fetch = async function(input, init) {
    const url = toUrl(input), method = methodOf(input,init), headers = headersOf(input,init);
    if (url && url.origin===supabaseOrigin && method==="POST" && url.pathname==="/rest/v1/coupang_freshbag") return directFreshbagBulk(input,init,headers);
    if (url && url.origin===supabaseOrigin && method==="POST" && url.pathname==="/rest/v1/rpc/mw_account_statistics") return directAccountQuery(input,init,headers);
    if (url && url.origin===supabaseOrigin && method==="GET" && url.pathname==="/rest/v1/maroowell_route") return directRoutePriceList(headers);
    if (url && url.origin===supabaseOrigin && method==="POST" && url.pathname==="/rest/v1/rpc/mw_route_price_save") return directRoutePriceSave(headers,jsonBody(init)||{});
    if (url && url.origin===supabaseOrigin && url.pathname.includes("/rest/v1/maroowell_route_info")) return routeInfoWithRetry(input,init,url);
    if (isAccessRequest(url,method)) return cachedAccessFetch(input,init,url,method,headers);
    return nativeFetch(input,init);
  };
})();
