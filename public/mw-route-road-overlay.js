(function () {
"use strict";
const ENDPOINT = "https://purple-river-0717.brain-0f6.workers.dev/building-footprints/geometry";
const LIMIT = 200;
const MAX_ATTEMPTS = 80;
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

window.MW_ROUTE_ROAD_BOOT = function ({map,getPacks,getGeometry,getToken,getGeometryHash}) {
  if (!map || !window.kakao?.maps || !window.turf || !window.MW_ROAD_OVERLAY_TOOLS) return null;
  const turf = window.turf;
  const tools = window.MW_ROAD_OVERLAY_TOOLS;
  const wrap=document.getElementById("mapWrap");
  const host=document.getElementById("roadToggleHost");
  const share=document.getElementById("shareBtn");
  const appMode=document.documentElement.classList.contains("mw-app-route-mode");
  if (!wrap || (!host && !share)) return null;
  const style=document.createElement("style");
  style.textContent=[
    "#mwRouteRoadLegend{position:absolute;bottom:14px;left:14px;z-index:40;width:min(176px,calc(100% - 28px));max-height:51vh;display:flex;flex-direction:column;padding:11px;border:1px solid #c4d4df;border-radius:11px;background:rgba(255,255,255,.95);color:#1f3448;box-shadow:0 3px 14px #263f5a25;backdrop-filter:blur(4px)}",
    "#mwRouteRoadLegend[hidden]{display:none!important}",
    ".mwRouteRoadHeader{display:flex;justify-content:space-between;border-bottom:1px solid #e1e7eb;padding-bottom:6px;font-weight:800;font-size:12px}",
    ".mwRouteRoadClear{font:inherit;font-size:10px;color:#325371;border:1px solid #c8d6e1;border-radius:7px;padding:4px 7px;background:#fff;cursor:pointer;font-weight:800}",
    ".mwRouteRoadClear:disabled{opacity:.45;cursor:default}",
    ".mwRouteRoadHeaderActions{display:flex;gap:4px;align-items:center}",
    ".mwRouteRoadHide{font:inherit;font-size:10px;color:#325371;border:1px solid #c8d6e1;border-radius:7px;padding:4px 7px;background:#fff;cursor:pointer;font-weight:800}",
    ".mwRouteRoadTotals{font-size:10.5px;color:#274862;font-weight:800;line-height:1.55;padding:5px 2px 6px;border-bottom:1px solid #e0e8ef;white-space:normal}",
    ".mwRouteRoadStatus[hidden]{display:none!important}",
    ".mwRouteRoadStatus{font-size:10px;color:#53687a;line-height:1.45;margin:5px 0;overflow-wrap:anywhere}",
    ".mwRouteRoadList{display:flex;flex-direction:column;gap:3px;overflow:auto;max-height:36vh;overscroll-behavior:contain}",
    ".mwRouteRoadItem{font:inherit;font-size:11.5px;color:#283e50;display:flex;align-items:center;gap:7px;text-align:left;background:#fff;border:1px solid #dfe8ee;border-radius:7px;padding:6px;cursor:pointer}",
    ".mwRouteRoadItem[aria-pressed=true]{border-color:#2563eb;background:#e6f1ff;box-shadow:inset 0 0 0 1px #2563eb;color:#17498c}",
    ".mwRouteRoadSwatch{width:12px;height:12px;flex:0 0 12px;border-radius:3px;border:1px solid}",
    ".mwRouteRoadName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:750}",
    ".mwRouteRoadCount{font-variant-numeric:tabular-nums;font-weight:850}",
    ".mwRouteRoadMapLabel{font-size:10px;color:#213749;font-weight:800;background:#fffef7f0;border:1px solid #a8b5be;border-radius:6px;padding:3px 6px;pointer-events:none;white-space:nowrap}",
    "#mwRouteRoadToggle{flex:1 1 auto!important;min-width:0;white-space:nowrap}",
    "@media(min-width:761px){#mwRouteRoadLegend{width:min(516px,calc(100% - 28px))}.mwRouteRoadList{display:flex;flex-direction:column;align-content:stretch}.mwRouteRoadItem{min-width:0}}",
    "@media(max-width:760px){#mwRouteRoadLegend{left:8px;bottom:8px;width:min(164px,calc(100% - 16px));max-height:48vh;padding:8px}.mwRouteRoadList{max-height:36vh}}"
  ].join("");
  document.head.append(style);
  const btn=document.createElement("button");
  const labelOff="도로명 조회";
  const labelOn="도로명 숨기기";
  const labelList=appMode?"목록 보기":"도로명 목록 보기";
  btn.type="button";btn.id="mwRouteRoadToggle";btn.className="btn";btn.textContent=labelOff;
  btn.setAttribute("aria-pressed","false");
  // The app-only toolbar is hidden in the full route editor.
  // Put the editor control in the visible left action section instead.
  if(appMode&&host){
    host.append(btn);
  }else if(share){
    const actionRow=document.createElement("div");
    actionRow.id="mwRouteRoadActionRow";
    actionRow.className="row";
    actionRow.style.marginTop="8px";
    const shareRow=share.closest(".row");
    if(shareRow)shareRow.insertAdjacentElement("afterend",actionRow);
    else share.insertAdjacentElement("afterend",actionRow);
    btn.style.width="100%";
    actionRow.append(btn);
  }else if(host){
    host.append(btn);
  }
  const panel=document.createElement("div");panel.id="mwRouteRoadLegend";panel.hidden=true;
  panel.innerHTML='<div class="mwRouteRoadHeader"><span>도로명별</span><div class="mwRouteRoadHeaderActions"><button type="button" class="mwRouteRoadClear">선택 해제</button></div></div>'+
    '<div class="mwRouteRoadTotals" aria-live="polite">전체 도로명 0개 · 건물 0개</div><div class="mwRouteRoadStatus" aria-live="polite" hidden></div><div class="mwRouteRoadList"></div>';
  wrap.append(panel);
  const status=panel.querySelector(".mwRouteRoadStatus"),list=panel.querySelector(".mwRouteRoadList"),totals=panel.querySelector(".mwRouteRoadTotals");
  const clearSelection=panel.querySelector(".mwRouteRoadClear");
  const displayShapes=[],labelLayers=[];
  const routeCache=new Map();
  let on=false,epoch=0,selectedRoads=new Set(),loadedGroups=[],lastPacksKey="",pending=null;

  function cleanup(){
    for (const shape of displayShapes)shape.setMap(null);
    for (const label of labelLayers)label.setMap(null);
    displayShapes.length=0;labelLayers.length=0;
    list.replaceChildren();
  }
  function statusText(s){ status.textContent=s;status.hidden=!s; }
  async function apiCall(polygon, token, offset=0){
    const response=await fetch(ENDPOINT,{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({polygon,offset,limit:LIMIT}),
      signal:AbortSignal.timeout(45000)
    });
    const body=await response.json().catch(()=>({}));
    if (response.status===202 || body.status==="warming") return {warm:true,retry:Number(body.retryAfterSeconds)||3};
    if (!response.ok || body.status!=="ready" || !Array.isArray(body.features)){
      throw new Error(body.message||body.error||"건물 데이터 응답 오류 ("+response.status+")");
    }
    return {data:body};
  }
  async function fetchPageWithWarmup(geom,token,offset,generation) {
    for(let i=0;i<MAX_ATTEMPTS;i++){
      if(!on||epoch!==generation)return null;
      const response=await apiCall(geom,token,offset);
      if(response.data)return response.data;
      statusText("공용 건물 캐시 생성 중 · "+(i+1)+"/"+MAX_ATTEMPTS);
      await wait(Math.min(6000,Math.max(1000,response.retry*1000)));
    }
    throw new Error("공용 건물 캐시 준비 시간이 초과되었습니다. 다시 눌러주세요.");
  }
  async function gather(pack,generation,token) {
    const geometry=getGeometry(pack);
    if(!geometry)return null;
    const canonicalHash=await getGeometryHash(geometry);
    const cacheKey="polygon:"+canonicalHash;
    if(routeCache.has(cacheKey))return routeCache.get(cacheKey);
    const seen=new Map();
    let offset=0;
    for(let page=0;page<80;page++){
      if(!on||epoch!==generation)return null;
      statusText("라우트 건물 조회 "+seen.size+"개 · "+(pack?.row?.full_code||pack?.row?.code||""));
      const body=await fetchPageWithWarmup(geometry,token,offset,generation);
      if(!body)return null;
      for(const feature of body.features){
        const building=tools.toBuilding(feature);
        if(building)seen.set(building.id,building);
      }
      if(!body.hasMore)break;
      if(!body.features.length)throw new Error("건물 페이지가 비어 있습니다");
      offset+=body.features.length;
      if(page===79)throw new Error("건물 수가 너무 많아 모두 표시할 수 없습니다");
    }
    const record={geometry,buildings:[...seen.values()],hash:canonicalHash};
    routeCache.set(cacheKey,record);
    return record;
  }
  function clipped(footprint,boundary){
    try { return turf.booleanWithin(footprint,boundary) ? footprint : turf.intersect(footprint,boundary); }
    catch{try{return turf.intersect(footprint,boundary);}catch{return null;}}
  }
  function addPolygon(feature,building,color,selected){
    if(!feature?.geometry)return false;
    const g=feature.geometry;
    const components=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
    let drawn=false;
    for(const rings of components){
      const paths=(rings||[]).map(r=>(r||[]).slice(0,-1).map(p=>new kakao.maps.LatLng(p[1],p[0]))).filter(r=>r.length>=3);
      if(!paths.length)continue;
      const poly=new kakao.maps.Polygon({
        map,path:paths.length===1?paths[0]:paths,zIndex:8,clickable:true,
        strokeColor:color[1],strokeWeight:1.15,strokeOpacity:selected?.94:.24,
        fillColor:color[0],fillOpacity:selected?.72:.11
      });
      kakao.maps.event.addListener(poly,"click",()=>{
        const center=turf.centerOfMass(feature).geometry.coordinates;
        const text=building.road+(building.number?" "+building.number:"")+(building.name?" · "+building.name:"");
        statusText(text);
        map.panTo(new kakao.maps.LatLng(center[1],center[0]));
      });
      displayShapes.push(poly);drawn=true;
    }
    return drawn;
  }
  function drawLabels(){
    while(labelLayers.length)labelLayers.pop().setMap(null);
    if(Number(map.getLevel?.()||7)>5)return;
    const projection=map.getProjection?.(),positions=[];
    for(const entry of loadedGroups){
      const center=entry.points[Math.floor(entry.points.length/2)];
      if(!center || entry.name==="도로명 미확인" || (selectedRoads.size && !selectedRoads.has(entry.name)))continue;
      const pos=new kakao.maps.LatLng(center[1],center[0]);
      if(projection?.containerPointFromCoords){
        const pt=projection.containerPointFromCoords(pos);
        if(positions.some(x=>Math.abs(x.x-pt.x)<110&&Math.abs(x.y-pt.y)<34))continue;
        positions.push(pt);
      }
      const label=document.createElement("span");label.className="mwRouteRoadMapLabel";label.textContent=entry.name;label.style.borderColor=entry.color[1];
      const layer=new kakao.maps.CustomOverlay({map,position:pos,content:label,yAnchor:0.5,zIndex:12,clickable:false});
      labelLayers.push(layer);
    }
  }
  let visibleRows=[];
  function render(rows) {
    visibleRows=rows;
    cleanup();
    const grouped=new Map();let total=0;
    const dedupe=new Set();
    for(const item of rows) {
      const rec=item.record;
      for(const building of rec.buildings){
        const key=building.id;
        if(dedupe.has(key))continue;
        dedupe.add(key);
        const within=clipped(building.raw,rec.geometry);
        if(!within)continue;
        const name=tools.roadName(building.raw.properties);
        if(!grouped.has(name))grouped.set(name,{name,color:tools.colorForRoad(name),entries:[],points:[]});
        const group=grouped.get(name);
        group.entries.push({feature:within,building});
        try{group.points.push(turf.centerOfMass(within).geometry.coordinates);}catch{}
      }
    }
    loadedGroups=[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,"ko-KR"));
    for(const group of loadedGroups){
      const selected=selectedRoads.size===0||selectedRoads.has(group.name);
      for(const entry of group.entries)if(addPolygon(entry.feature,entry.building,group.color,selected))total++;
      const button=document.createElement("button");button.type="button";button.className="mwRouteRoadItem";button.setAttribute("aria-pressed",String(selectedRoads.has(group.name)));
      const swatch=document.createElement("span");swatch.className="mwRouteRoadSwatch";swatch.style.background=group.color[0];swatch.style.borderColor=group.color[1];
      const name=document.createElement("span");name.className="mwRouteRoadName";name.textContent=group.name;
      const count=document.createElement("span");count.className="mwRouteRoadCount";count.textContent=String(group.entries.length)+"개";
      button.append(swatch,name,count);
      button.onclick=()=>{
        if(selectedRoads.has(group.name))selectedRoads.delete(group.name);
        else selectedRoads.add(group.name);
        render(rows);
      };
      list.append(button);
    }
    clearSelection.disabled=selectedRoads.size===0;
    const overallObjects=loadedGroups.reduce((sum,g)=>sum+g.entries.length,0);
    const activeGroups=selectedRoads.size ? loadedGroups.filter(g=>selectedRoads.has(g.name)) : [];
    const activeObjects=activeGroups.reduce((sum,g)=>sum+g.entries.length,0);
    totals.textContent=`전체 도로명 ${loadedGroups.length}개 · 건물 ${overallObjects}개`+(selectedRoads.size ? ` / 선택 도로명 ${activeGroups.length}개 · 건물 ${activeObjects}개` : "");
    statusText(loadedGroups.length?"":"표시 가능한 건물 주소가 없습니다.");
    drawLabels();
  }
  clearSelection.onclick=()=>{selectedRoads.clear();render(visibleRows);};
  async function load() {
    const generation=++epoch;
    pending=Promise.resolve();
    const packs=(getPacks()||[]).filter(p=>getGeometry(p));
    if(!packs.length){cleanup();statusText("먼저 캠프·라우트 폴리곤을 조회하세요.");return;}
    statusText("라우트별 공용 건물 데이터 불러오는 중…");
    const token=await getToken();
    const rows=[];
    for(let i=0;i<packs.length;i++){
      if(!on||epoch!==generation)return;
      const record=await gather(packs[i],generation,token);
      if(!record)return;
      rows.push({pack:packs[i],record});
      render(rows);
    }
    if(on&&epoch===generation)render(rows);
  }
  function refresh(){
    if(!on)return;
    load().catch(err=>{statusText("조회 실패: "+String(err?.message||err));});
  }
  function reset(){
    on=false;epoch++;selectedRoads.clear();loadedGroups=[];visibleRows=[];cleanup();panel.hidden=true;
    totals.textContent="전체 도로명 0개 · 건물 0개";btn.setAttribute("aria-pressed","false");btn.textContent=labelOff;
  }
  btn.onclick=()=>{
    if(on){
      if(panel.hidden){panel.hidden=false;btn.textContent=labelOn;return;}
      reset();return;
    }
    on=true;panel.hidden=false;btn.textContent=labelOn;btn.setAttribute("aria-pressed","true");
    refresh();
  };
  kakao.maps.event.addListener(map,"idle",()=>{if(on&&loadedGroups.length)drawLabels();});
  return {onRoutesChange:refresh,reset,isOn:()=>on,
    showPanel:()=>{if(on){panel.hidden=false;btn.textContent=labelOn;}},
    hidePanel:()=>{if(on){panel.hidden=true;btn.textContent=labelList;}}
  };
};
})();
