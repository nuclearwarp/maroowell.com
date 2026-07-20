(() => {
  "use strict";
  if (window.__MW_ZIP_ENHANCE__) return;
  window.__MW_ZIP_ENHANCE__ = true;

  const R = { map:null, all:[], byZip:new Map(), terrain:new Map(), selected:"", timer:0, ignoreMapUntil:0 };
  const zip = v => (String(v ?? "").match(/\d{5}/) || [""])[0];
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const meter = v => num(v) == null ? "-" : `${num(v).toLocaleString("ko-KR",{maximumFractionDigits:1})}m`;
  const pct = v => num(v) == null ? "-" : `${num(v).toLocaleString("ko-KR",{maximumFractionDigits:1})}%`;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await nativeFetch(input, init);
    const url = String(input instanceof Request ? input.url : input || "");
    if (/\/terrain(?:[/?#]|$)/i.test(url)) {
      let requestZip = "";
      try { requestZip = zip(JSON.parse(init?.body || "{}").zipcode); } catch {}
      res.clone().json().then(data => {
        const z = zip(data?.zipcode || requestZip);
        if (z && data?.terrain) { R.terrain.set(z, data.terrain); refresh(); }
      }).catch(() => {});
    }
    return res;
  };

  function styleRecord(rec, on) {
    if (!rec?.poly) return;
    const o = rec.opt;
    try {
      rec.poly.setOptions(on ? {
        strokeWeight:Math.max(6,(o.strokeWeight||3)+3), strokeColor:darken(o.strokeColor),
        strokeOpacity:1, fillColor:o.fillColor, fillOpacity:Math.max(.38,o.fillOpacity||.24), zIndex:1000,
        clickable:true
      } : { ...o, clickable:true });
    } catch {}
  }

  function darken(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex||"")) return hex || "#1d4ed8";
    return "#"+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*.72).toString(16).padStart(2,"0")).join("");
  }

  function applySelected() {
    for (const rec of R.all) styleRecord(rec, !!R.selected && rec.zip === R.selected);
    document.querySelectorAll("#zipList .chip").forEach(el => el.classList.toggle("mw-selected", zip(el.querySelector("b")?.textContent) === R.selected));
    document.querySelectorAll("#terrainList [data-terrain-zip]").forEach(el => el.classList.toggle("mw-selected", zip(el.dataset.terrainZip) === R.selected));
  }

  function clearSelected() { R.selected=""; applySelected(); }

  function boundsFor(z) {
    const rows = R.byZip.get(z) || [];
    if (!rows.length || !window.kakao?.maps) return null;
    const b = new kakao.maps.LatLngBounds(); let count=0;
    const visit = value => {
      if (!value) return;
      if (typeof value.getLat === "function") { b.extend(value); count++; return; }
      if (Array.isArray(value)) value.forEach(visit);
    };
    rows.forEach(r => visit(r.path));
    return count ? b : null;
  }

  function scrollInfo(z) {
    const card = document.querySelector(`#terrainList [data-terrain-zip="${CSS.escape(z)}"]`);
    if (!card) return;
    const panel = document.getElementById("panel");
    if (document.body.classList.contains("panel-collapsed")) document.getElementById("panelToggle")?.click();
    setTimeout(() => {
      if (panel) panel.scrollTo({top:Math.max(0,card.offsetTop-18),behavior:"smooth"});
      card.classList.add("mw-pulse"); setTimeout(()=>card.classList.remove("mw-pulse"),850);
    },90);
  }

  function select(z, fit=false, scroll=false) {
    z=zip(z); if (!z) return;
    R.selected=z; applySelected();
    if (fit && R.map) { const b=boundsFor(z); if (b) try { R.map.setBounds(b,40,40,40,40); } catch { try { R.map.setBounds(b); } catch {} } }
    if (scroll) scrollInfo(z);
  }

  function assign(z) {
    z=zip(z); if (!z) return;
    const rec=[...R.all].reverse().find(r=>!r.zip);
    if (!rec) return;
    rec.zip=z;
    if(!R.byZip.has(z)) R.byZip.set(z,[]);
    R.byZip.get(z).push(rec);
    try { rec.poly.setOptions({ clickable:true }); } catch {}
    try {
      kakao.maps.event.addListener(rec.poly,"click",()=>{
        R.ignoreMapUntil=Date.now()+300;
        select(z,false,true);
      });
    } catch {}
  }

  function patchKakao() {
    const K=window.kakao?.maps; if(!K || K.__MW_ZIP_PATCH__) return;
    K.__MW_ZIP_PATCH__=true;
    const OM=K.Map, OP=K.Polygon, OO=K.CustomOverlay;
    function M(...a){
      const m=new OM(...a);
      R.map=m;
      try{kakao.maps.event.addListener(m,"click",()=>{if(Date.now()>=R.ignoreMapUntil)clearSelected();});}catch{}
      return m;
    }
    function P(o={}){
      const options={...o,clickable:true};
      const p=new OP(options);
      R.map=R.map||o.map||null;
      R.all.push({poly:p,zip:"",path:o.path,opt:{strokeWeight:o.strokeWeight||3,strokeColor:o.strokeColor||o.fillColor||"#2563eb",strokeOpacity:o.strokeOpacity??1,strokeStyle:o.strokeStyle||"solid",fillColor:o.fillColor||o.strokeColor||"#2563eb",fillOpacity:o.fillOpacity??.24,zIndex:o.zIndex||0}});
      return p;
    }
    function O(o={}){
      const ov=new OO(o), c=o.content, z=zip(c?.textContent||c?.innerText);
      if(z){
        assign(z);
        if(c?.addEventListener){
          c.style.cursor="pointer";
          c.addEventListener("click",e=>{
            e.preventDefault();e.stopPropagation();
            R.ignoreMapUntil=Date.now()+300;
            select(z,false,true);
          });
        }
      }
      return ov;
    }
    M.prototype=OM.prototype; P.prototype=OP.prototype; O.prototype=OO.prototype;
    try{Object.setPrototypeOf(M,OM);Object.setPrototypeOf(P,OP);Object.setPrototypeOf(O,OO);}catch{}
    K.Map=M; K.Polygon=P; K.CustomOverlay=O;
  }

  function waitAndSelect(z) {
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if ((R.byZip.get(z)||[]).length) {
        clearInterval(timer);
        select(z,true,false);
      } else if (tries>=30) {
        clearInterval(timer);
      }
    },100);
  }

  function chipEnhance() {
    document.querySelectorAll("#zipList .chip").forEach(el=>{
      const z=zip(el.querySelector("b")?.textContent); if(!z)return;
      el.dataset.mwZip=z; el.tabIndex=0; el.setAttribute("role","button"); el.title=`${z} 폴리곤 선택`;
      if(el.dataset.mwBound)return; el.dataset.mwBound="1";
      const go=e=>{
        if(e.target.closest("button"))return;
        e.preventDefault();
        if((R.byZip.get(z)||[]).length) select(z,true,false);
        else {
          document.getElementById("searchBtn")?.click();
          waitAndSelect(z);
        }
      };
      el.addEventListener("click",go);
      el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")go(e);});
    });
  }

  function bar(label,value,cls){return `<div class="mw-slope-row ${cls}"><span>${label}</span><i><b style="width:${Math.max(0,Math.min(100,num(value)||0))}%"></b></i><strong>${pct(value)}</strong></div>`;}
  function cleanCards() {
    document.querySelectorAll("#terrainList [data-terrain-zip]").forEach(card=>{
      const z=zip(card.dataset.terrainZip), t=R.terrain.get(z); if(!z||!t)return;
      const s=t.slope;
      const sig=JSON.stringify([t.minElevation,t.maxElevation,t.meanElevation,t.elevationRange,s?.flatPercent,s?.gentlePercent,s?.steepPercent]);
      if(card.dataset.mwSig===sig)return; card.dataset.mwSig=sig;
      card.innerHTML=`<div class="terrainCardTop"><span class="terrainZip">${esc(z)} 지형 정보</span></div><h4>표고</h4><p>최저 <strong>${meter(t.minElevation)}</strong> · 최고 <strong>${meter(t.maxElevation)}</strong></p><p>평균 <strong>${meter(t.meanElevation)}</strong> · 고저차 <strong>${meter(t.elevationRange)}</strong></p><h4>경사도 분포</h4>${s?`<div class="mw-slope">${bar("평지",s.flatPercent,"flat")}${bar("완경사",s.gentlePercent,"gentle")}${bar("급경사",s.steepPercent,"steep")}</div>`:`<p class="mw-wait">경사도 데이터를 계산하고 있습니다.</p>`}`;
    });
  }

  function refresh(){clearTimeout(R.timer);R.timer=setTimeout(()=>{chipEnhance();cleanCards();applySelected();},0);}
  function styles(){
    const s=document.createElement("style");s.textContent=`
      #zipList .chip{cursor:pointer;transition:.16s}#zipList .chip:hover{border-color:#93c5fd;background:#f8fbff}#zipList .chip.mw-selected{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
      .terrainSourceBadge,.terrainSub{display:none!important}.terrainCard{transition:.18s}.terrainCard.mw-selected{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.12)}.terrainCard.mw-pulse{animation:mwp .85s ease}.terrainCard h4{margin:10px 0 5px;color:#334155;font-size:10px}.terrainCard p{margin:4px 0;color:#475569;font-size:11px}.terrainCard p strong{color:#0f172a;font-size:12px}.mw-slope{display:grid;gap:7px;margin-top:7px}.mw-slope-row{display:grid;grid-template-columns:42px 1fr 42px;gap:8px;align-items:center;font-size:10px}.mw-slope-row span,.mw-slope-row strong{font-weight:1000}.mw-slope-row strong{text-align:right}.mw-slope-row i{height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden}.mw-slope-row i b{display:block;height:100%;background:#60a5fa}.mw-slope-row.gentle i b{background:#f59e0b}.mw-slope-row.steep i b{background:#ef4444}.mw-wait{color:#94a3b8!important}@keyframes mwp{50%{box-shadow:0 0 0 7px rgba(37,99,235,.2)}}`;
    document.head.appendChild(s);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    patchKakao(); styles();
    const o=new MutationObserver(refresh); ["zipList","terrainList"].forEach(id=>{const e=document.getElementById(id);if(e)o.observe(e,{childList:true,subtree:true});});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")clearSelected();});
    refresh();
  },{once:true});
})();