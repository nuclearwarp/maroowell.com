(()=>{
  "use strict";
  if(window.__mwRouteEnhance)return; window.__mwRouteEnhance=1;
  const ROUTE="https://route.maroowell.com/route", TERRAIN="https://zip.maroowell.com/terrain";
  const S={rows:new Map(),sig:"",last:0,clear:false,timer:0,seq:0,client:null,selected:"",original:null,key:"",data:null};
  const nativeFetch=window.fetch.bind(window), $=id=>document.getElementById(id), txt=v=>String(v??"").trim();
  const codes=v=>txt(v).split(/[^0-9a-zA-Z_-]+/).map(x=>x.trim()).filter(Boolean);
  const routeParts=v=>{const c=txt(v).replace(/\s+/g,""),m=c.match(/^(.+?[A-Za-z])(\d{1,2})$/);return{full:c,route:m?m[1]:c,sub:m?m[2].padStart(2,"0"):null}};
  const isRoute=u=>{try{const x=new URL(u,location.href);return x.origin+ x.pathname.replace(/\/+$/i,"")===ROUTE}catch{return false}};
  const uiSig=()=>`${txt($("campInput")?.value)}|${txt($("codeInput")?.value)}`;
  const reset=()=>{S.rows.clear();S.key="";S.data=null};
  function capture(rows){
    const now=Date.now(),sig=uiSig();
    if(S.clear||!S.sig||S.sig!==sig||now-S.last>2500){reset();S.clear=false}
    S.sig=sig;S.last=now;
    (rows||[]).forEach(r=>{if(r&&typeof r==="object")S.rows.set(String(r.id??`${txt(r.camp)}|${txt(r.full_code||r.code)}`),r)});
    clearTimeout(S.timer);S.timer=setTimeout(()=>analyze(false),700);
  }
  function patchSave(init){
    if(typeof init?.body!=="string")return init;
    let b;try{b=JSON.parse(init.body)}catch{return init}
    if(!b||b.id==null||!Object.prototype.hasOwnProperty.call(b,"polygon_wgs84"))return init;
    const camp=txt($("campInput")?.value),cs=codes($("codeInput")?.value);if(camp)b.camp=camp;
    if(cs.length===1){const p=routeParts(cs[0]);Object.assign(b,{code:p.full,full_code:p.full,route_code:p.route,subroute_code:p.sub})}
    const h=new Headers(init.headers||{});h.set("Content-Type","application/json");return{...init,headers:h,body:JSON.stringify(b)};
  }
  window.fetch=async(input,init={})=>{
    const url=typeof input==="string"||input instanceof URL?String(input):String(input?.url||""),method=txt(init.method||input?.method||"GET").toUpperCase();
    const res=await nativeFetch(input,isRoute(url)&&method==="POST"?patchSave(init):init);
    if(isRoute(url)&&method==="GET"&&res.ok)res.clone().json().then(d=>capture(d?.rows||[])).catch(()=>{});
    if(isRoute(url)&&method==="POST"&&res.ok)S.clear=true;
    return res;
  };
  function rings(v){if(typeof v==="string")try{v=JSON.parse(v)}catch{return[]}if(!Array.isArray(v)||!v.length)return[];const f=v[0];return Array.isArray(f)&&typeof f[0]==="number"?[v]:Array.isArray(f)&&Array.isArray(f[0])?v:[]}
  function close(r){const a=[];(r||[]).forEach(p=>{const x=Number(p?.[0]),y=Number(p?.[1]);if(Number.isFinite(x)&&Number.isFinite(y))a.push([x,y])});if(a.length<3)return null;const f=a[0],l=a[a.length-1];if(f[0]!==l[0]||f[1]!==l[1])a.push([...f]);return a.length>=4?a:null}
  function geometry(rows){const ps=[];rows.forEach(r=>rings(r.polygon_wgs84).forEach(x=>{x=close(x);if(x)ps.push([x])}));return !ps.length?null:ps.length===1?{type:"Polygon",coordinates:ps[0]}:{type:"MultiPolygon",coordinates:ps}}
  async function hash(s){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(s)));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
  async function target(rows,g){
    const camp=txt($("campInput")?.value)||txt(rows[0]?.camp),code=txt($("codeInput")?.value),ids=rows.map(r=>r.id).filter(v=>v!=null).map(String).sort((a,b)=>a.localeCompare(b,"en",{numeric:true})),subs=[...new Set(rows.map(r=>r.subroute_id).filter(v=>v!=null).map(String))];
    let type,key,ssid=null,sid=null;
    if(rows.length===1&&ids.length){type="subsubroute";key=ids[0];ssid=Number(key)}else if(subs.length===1){type="subroute";key=subs[0];sid=Number(key)}else{type=code?"route_set":"camp";key=`set_${(await hash(`${type}|${ids.length?ids.join(","):JSON.stringify(g)}`)).slice(0,32)}`}
    return{type,key,ssid:Number.isFinite(ssid)?ssid:null,sid:Number.isFinite(sid)?sid:null,name:[camp,code||(type==="camp"?"전체":"")].filter(Boolean).join(" "),camp,code};
  }
  function client(){if(S.client)return S.client;const c=window.MARUWELL_CONFIG||{},st=(()=>{try{return sessionStorage}catch{return null}})();if(!window.supabase?.createClient||!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY)throw Error("로그인 정보를 확인할 수 없습니다.");return S.client=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY,{auth:{persistSession:!!st,storage:st||undefined,autoRefreshToken:true,detectSessionInUrl:false}})}
  async function token(){const{data,error}=await client().auth.getSession();if(error)throw error;if(!data?.session?.access_token)throw Error("로그인이 만료되었습니다.");return data.session.access_token}
  const fmt=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toLocaleString("ko-KR",{maximumFractionDigits:d}):"-";
  function els(){return{t:$("mwTerrainTarget"),s:$("mwTerrainStatus"),r:$("mwTerrainResult"),b:$("mwTerrainBtn")}}
  function msg(m,k="idle"){const e=els();if(!e.s||!e.r)return;e.s.textContent=m;e.s.dataset.kind=k;e.r.innerHTML=""}
  const bar=(l,v,c)=>{v=Math.max(0,Math.min(100,Number(v)||0));return`<div class="mwTR ${c}"><span>${l}</span><i><b style="width:${v}%"></b></i><strong>${fmt(v)}%</strong></div>`};
  function render(d,t){const x=d?.terrain||d,s=x?.slope||{},range=Number.isFinite(Number(x?.effectiveRange))?x.effectiveRange:x?.elevationRange,e=els();if(!e.t||!e.s||!e.r)return;e.t.textContent=t.name||"현재 조회 구역";e.s.textContent="";e.r.innerHTML=`<h4>표고</h4><p>최저 <b>${fmt(x?.minElevation)}m</b> · 최고 <b>${fmt(x?.maxElevation)}m</b></p><p>평균 <b>${fmt(x?.meanElevation)}m</b> · 고저차 <b>${fmt(range)}m</b></p><h4>경사도 분포</h4>${bar("평지",s.flatPercent,"flat")}${bar("완경사",s.gentlePercent,"gentle")}${bar("급경사",s.steepPercent,"steep")}`}
  async function analyze(manual){
    const rows=[...S.rows.values()].filter(r=>rings(r.polygon_wgs84).length);if(!rows.length){if(manual)msg("먼저 캠프와 라우트를 불러오세요.","warn");return}const g=geometry(rows);if(!g)return msg("분석할 폴리곤이 없습니다.","warn");const t=await target(rows,g),local=`${t.type}:${t.key}:${JSON.stringify(g).length}`,e=els();if(e.t)e.t.textContent=t.name;if(!manual&&S.key===local&&S.data)return render(S.data,t);const seq=++S.seq;if(e.b)e.b.disabled=true;msg("지형 정보를 조회하고 있습니다.","loading");
    try{const body={scopeType:t.type,scopeKey:t.key,scope_type:t.type,scope_key:t.key,geometry:g,displayName:t.name,display_name:t.name,camp:t.camp,code:t.code,subsubrouteId:t.ssid,subsubroute_id:t.ssid,subrouteId:t.sid,subroute_id:t.sid},res=await nativeFetch(TERRAIN,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await token()}`},body:JSON.stringify(body),cache:"no-store"}),text=await res.text();let d;try{d=text?JSON.parse(text):null}catch{}if(!res.ok)throw Error(d?.error||d?.message||text||`HTTP ${res.status}`);if(seq!==S.seq)return;S.key=local;S.data=d;render(d,t)}catch(err){if(seq===S.seq)msg(`지형 정보 조회 실패: ${err?.message||err}`,"error")}finally{if(seq===S.seq&&e.b)e.b.disabled=false}
  }
  function selected(){const m=txt($("selectedInfo")?.textContent).match(/\(id=([^\)]+)\)/);return m?txt(m[1]):""}
  function dirty(){if(!S.selected||!S.original)return false;const cs=codes($("codeInput")?.value),c=cs.length===1?cs[0]:txt($("codeInput")?.value);return txt($("campInput")?.value)!==txt(S.original.camp)||c!==txt(S.original.full_code||S.original.code)}
  function hint(){S.selected=selected();S.original=S.selected?(S.rows.get(S.selected)||S.original):null;const h=$("mwRouteRenameHint"),d=dirty();$("campInput")?.classList.toggle("mwDirty",d);$("codeInput")?.classList.toggle("mwDirty",d);if(!h)return;h.dataset.dirty=d?"1":"0";h.textContent=!S.selected?"라우트 선택 후 캠프·라우트 번호를 바꾸고 저장할 수 있습니다.":d?`ID ${S.selected}를 유지한 채 변경값으로 저장됩니다.`:`선택 ID ${S.selected} · 캠프·라우트 번호 수정 가능`}
  function install(){
    const action=document.querySelector(".routeActionGroup");if(!action||$("mwTerrainGroup"))return;const h=document.createElement("div");h.id="mwRouteRenameHint";h.className="mwRenameHint";$("codeInput")?.closest(".group")?.appendChild(h);const g=document.createElement("div");g.id="mwTerrainGroup";g.className="group mwTerrainGroup";g.innerHTML=`<div class="mwTH"><div><strong>지형 정보</strong><small id="mwTerrainTarget">현재 조회 구역</small></div><button id="mwTerrainBtn" class="btn" type="button">다시 조회</button></div><div id="mwTerrainStatus" class="mwTS">캠프와 라우트를 불러오면 자동 조회됩니다.</div><div id="mwTerrainResult" class="mwTerrainResult"></div>`;action.insertAdjacentElement("afterend",g);
    const st=document.createElement("style");st.textContent=`.mwRenameHint{margin-top:8px;padding:8px 10px;border-radius:10px;background:#f8fafc;border:1px solid #d8e0ee;color:#64748b;font-size:11px;font-weight:900}.mwRenameHint[data-dirty="1"]{background:#fff7ed;border-color:#fdba74;color:#9a3412}input.mwDirty{border-color:#f59e0b!important;background:#fffbeb!important;box-shadow:0 0 0 3px rgba(245,158,11,.12)!important}.mwTH{display:flex;align-items:center;justify-content:space-between;gap:10px}.mwTH strong{display:block;font-size:13px}.mwTH small{display:block;margin-top:3px;color:#64748b;font-weight:900}.mwTH .btn{flex:0 0 auto}.mwTS{margin-top:10px;padding:9px 10px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;font-size:11px;font-weight:900}.mwTS:empty{display:none}.mwTS[data-kind="loading"]{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8}.mwTS[data-kind="warn"]{background:#fffbeb;border-color:#fde68a;color:#9a5c00}.mwTS[data-kind="error"]{background:#fff1f2;border-color:#fecdd3;color:#be123c}.mwTerrainResult{margin-top:10px}.mwTerrainResult h4{margin:10px 0 6px;font-size:11px;color:#475569}.mwTerrainResult h4:first-child{margin-top:0}.mwTerrainResult p{margin:0;font-size:12px;line-height:1.55;color:#475569}.mwTerrainResult b{color:#0f172a}.mwTR{display:grid;grid-template-columns:46px 1fr 48px;gap:8px;align-items:center;margin:7px 0;font-size:11px;font-weight:900;color:#475569}.mwTR i{height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden}.mwTR i b{display:block;height:100%;background:#64748b}.mwTR.flat i b{background:#22c55e}.mwTR.gentle i b{background:#f59e0b}.mwTR.steep i b{background:#ef4444}.mwTR strong{text-align:right;color:#0f172a}`;document.head.appendChild(st);
    $("loadBtn")?.addEventListener("click",()=>{reset();S.sig=uiSig();msg("라우트 조회가 끝나면 자동 분석합니다.","loading")},true);
    $("saveBtn")?.addEventListener("click",e=>{if(!S.selected)return;if(!txt($("campInput")?.value)||codes($("codeInput")?.value).length!==1){e.preventDefault();e.stopImmediatePropagation();msg("캠프와 라우트 번호를 각각 하나씩 입력해야 저장할 수 있습니다.","warn")}},true);
    const enter=e=>{if(e.key==="Enter"&&!e.isComposing&&dirty()){e.preventDefault();e.stopImmediatePropagation();$("saveBtn")?.click()}};$("campInput")?.addEventListener("keydown",enter,true);$("codeInput")?.addEventListener("keydown",enter,true);$("campInput")?.addEventListener("input",hint);$("codeInput")?.addEventListener("input",hint);$("mwTerrainBtn")?.addEventListener("click",()=>analyze(true));const si=$("selectedInfo");if(si)new MutationObserver(hint).observe(si,{childList:true,characterData:true,subtree:true});hint();
  }
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",install,{once:true}):install();
})();
