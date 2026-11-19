(function () {
"use strict";
// Feature-by-feature official building footprints. No sampled rectangles or inferred extents.
const API = "https://purple-river-0717.brain-0f6.workers.dev/building-footprints";
const PAGE_SIZE = 200;
const MAX_FEATURES_PER_ZIP = 8000; // Refuse silent truncation; report if unusually large.
const MAX_ZIPS = 4;
const PALETTE = [
  ["#90c1da","#2c84af"],
  ["#6666db","#19199a"],
  ["#db6666","#9a1919"],
  ["#dbdb66","#9a9a19"],
  ["#e387e3","#bd1fbd"],
  ["#e3a687","#bd531f"],
  ["#7dc57d","#2e842e"],
  ["#9090da","#2c2caf"],
  ["#a8ebd5","#28a078"],
  ["#b466db","#6f199a"],
  ["#deb5de","#9e409e"],
  ["#c57dad","#842e68"],
  ["#e4d2af","#937028"],
  ["#87e387","#288e28"],
  ["#c5897d","#843d2e"],
  ["#66dbc8","#198e84"],
  ["#b3a8eb","#5c40aa"],
  ["#d0c071","#8f7d24"],
  ["#db66c8","#9a1984"],
  ["#d199b5","#a2396e"],
  ["#ebeba8","#8e8e24"],
  ["#7da1c5","#2e5984"],
  ["#a2d199","#4b8039"],
  ["#9171d0","#47248f"],
  ["#a8d5eb","#328ca5"],
  ["#debcb5","#986045"],
  ["#b587e3","#6e1fbd"],
  ["#7dc5ad","#2e8468"],
  ["#b3eba8","#489f2c"],
  ["#7181d0","#24368f"],
];
const UNKNOWN = ["#d4dbe2","#6b7c8b"];
const clean = value => String(value ?? "").trim();
function canonicalRoad(value) {
  return clean(value).normalize("NFKC").replace(/\s+/g, "");
}
// Stable road-name color across different ZIP polygons, route maps, and lookup order.
// Same canonical road => same palette entry, even after refresh or another selection.
function colorForRoad(value) {
  const road = canonicalRoad(value);
  if (!road || road === "도로명미확인") return UNKNOWN;
  let h = 2166136261 ^ 1218;
  for (const codePoint of road) {
    h ^= codePoint.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  // Mix high and low hash bits so similar road names (e.g. 13/15) do not
  // systematically choose nearby colors in this 30-color categorical set.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return PALETTE[(h >>> 0) % PALETTE.length];
}
function roadName(props) {
  return canonicalRoad(props?.street_name || props?.streetName) || "도로명 미확인";
}
function toBuilding(feature) {
  const p = feature?.properties || {};
  const zip = clean(p.bsi_zon_no).padStart(5,"0");
  const id = clean(p.objectid || feature.id || p.building_id);
  if (!id || !feature?.geometry || !["Polygon","MultiPolygon"].includes(feature.geometry.type)) return null;
  const name = clean(p.building_name || p.buld_nm_dc);
  const road = roadName(p);
  const number = clean(p.house_number);
  return { id, managementId: clean(p.building_id), zipcode: zip, road, number, name, geometry: feature.geometry, raw: feature };
}
function grouping(buildings) {
  const groups = new Map();
  for (const building of buildings) {
    if (!groups.has(building.road)) groups.set(building.road, { road: building.road, buildings: [], color:null });
    groups.get(building.road).buildings.push(building);
  }
  const items = [...groups.values()].sort((a,b) => a.road.localeCompare(b.road,"ko-KR"));
  for (const item of items) {
    item.color = colorForRoad(item.road);
  }
  return items;
}
window.MW_ROAD_OVERLAY_TOOLS = Object.freeze({ roadName, toBuilding, grouping, canonicalRoad, colorForRoad, colors: PALETTE });

window.MW_ROAD_OVERLAY_BOOT = function ({map,getSelectedZips,getFeature,onBuildingClick}) {
  if (!map || !document.getElementById("terrainSection") || !window.turf || !window.kakao?.maps) return null;
  const turf = window.turf;
  const css = [
    "#mwRoadPanel{position:absolute;left:14px;bottom:18px;z-index:35;width:min(252px,calc(100% - 28px));max-height:min(52vh,480px);display:flex;flex-direction:column;padding:10px;border:1px solid rgba(129,149,164,.55);border-radius:12px;background:rgba(255,255,255,.94);box-shadow:0 5px 20px rgba(26,45,66,.18);backdrop-filter:blur(5px);pointer-events:auto;color:#25394e}",
    "#mwRoadPanel[hidden]{display:none!important}",
    ".mwRoadHead{display:flex;align-items:center;justify-content:space-between;gap:7px;padding-bottom:5px;border-bottom:1px solid #e4ebf0}",
    ".mwRoadHead strong{font-size:12px;font-weight:900;color:#26374b}",
    ".mwRoadToggle{font-size:11px!important;border:1px solid #90b5cf!important;border-radius:8px!important;padding:7px 10px!important;background:#e9f3fa!important;color:#27516c!important;font-weight:800!important;white-space:nowrap;cursor:pointer}",
    ".mwRoadToggle[aria-pressed=true]{background:#d7e9df!important;color:#245e44!important;border-color:#87b69c!important}",
    ".mwRoadHint{font-size:10px;color:#697b8e;line-height:1.4;margin:7px 0 0}",
    ".mwRoadClear{font-size:10px;border:1px solid #c8d6e1;border-radius:7px;padding:4px 7px;background:#fff;color:#325371;font-weight:800;cursor:pointer;white-space:nowrap}",
    ".mwRoadClear:disabled{opacity:.45;cursor:default}",
    ".mwRoadStatus[hidden]{display:none!important}",
    ".mwRoadStatus{font-size:10px;color:#455c72;line-height:1.35;margin:5px 0;overflow-wrap:anywhere}",
    ".mwRoadLegend{min-height:0;max-height:min(35vh,332px);overflow:auto;margin-top:5px;display:flex;flex-direction:column;gap:3px;overscroll-behavior:contain}",
    ".mwRoadLegend[hidden]{display:none!important}",
    ".mwRoadRow{display:flex;align-items:center;text-align:left;gap:7px;width:100%;min-height:29px;padding:5px 7px;border:1px solid #e1e9ef;background:#fff;border-radius:7px;cursor:pointer}",
    ".mwRoadRow[data-selected=true]{border-color:#3e6d88;box-shadow:0 0 0 1px #3e6d88}",
    ".mwRoadSwatch{flex:0 0 13px;width:13px;height:13px;border-radius:3px;border:1px solid}",
    ".mwRoadName{flex:1;min-width:0;color:#24394e;font-weight:800;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mwRoadCount{color:#31475d;font-size:11px;font-weight:850;white-space:nowrap;font-variant-numeric:tabular-nums}",
    "@media(max-width:720px){#mwRoadPanel{left:8px;bottom:8px;width:min(205px,calc(100% - 16px));max-height:38vh;padding:8px}.mwRoadLegend{max-height:25vh}.mwRoadRow{min-height:26px;padding:3px 5px}}",
    ".mwRoadLabel{pointer-events:none;white-space:nowrap;padding:3px 7px;border:1px solid #7895a8;background:rgba(255,255,255,.96);border-radius:6px;color:#22394b;font-size:10px;font-weight:850;box-shadow:0 1px 5px rgba(29,46,67,.16)}",
    ".mwBuildingPopup{padding:9px 12px;border:1px solid #9eb5c4;border-radius:9px;background:#fff;box-shadow:0 2px 10px #182f4940;color:#25394a;font-size:11px;max-width:280px}",
    ".mwBuildingPopup strong{display:block;font-size:12px;margin-bottom:5px;color:#133954}",
    ".mwBuildingPopup button{float:right;font-size:12px;margin-left:5px;border:0;background:transparent;cursor:pointer}"
  ].join("");
  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
  const wrap=document.getElementById("mapWrap");
  const shareButton=document.getElementById("shareMapBtn");
  if(!wrap||!shareButton)return null;
  const button=document.createElement("button");
  button.className="mwRoadToggle";
  button.type="button";
  button.textContent="건물별 표시";
  button.setAttribute("aria-pressed","false");
  button.title="도로명별 건물 외곽선 표시";
  shareButton.insertAdjacentElement("afterend",button);
  const panel=document.createElement("section");
  panel.id="mwRoadPanel";
  panel.hidden=true;
  panel.setAttribute("aria-label","지도 도로명별 건물 범례");
  panel.innerHTML='<div class="mwRoadHead"><strong>도로명별 건물</strong><button type="button" class="mwRoadClear">선택 해제</button></div>'+
    '<div class="mwRoadStatus" aria-live="polite" hidden></div>'+
    '<div class="mwRoadLegend" hidden></div>'+
    '<div class="mwRoadHint">실제 건물 외곽선 · 도로명별 색상</div>';
  wrap.appendChild(panel);
  const status=panel.querySelector(".mwRoadStatus");
  const legend=panel.querySelector(".mwRoadLegend");
  const clearSelection=panel.querySelector(".mwRoadClear");
  const cache=new Map();
  const drawings=[],labels=[];
  let currentPopup=null,enabled=false,seq=0,selectedRoads=new Set(),queue=Promise.resolve();
  let renderedRoadGroups=[]; // aggregated per-road data for map idle label refresh
  const showMessage=txt=>{status.textContent=txt;status.hidden=!txt;};
  const zips=()=>[...getSelectedZips()].filter(z=>getFeature(z)).slice(0,MAX_ZIPS);

  async function fetchBuildings(zip,token) {
    const seen=new Set(),buildings=[];
    let offset=0,round=0;
    while (enabled && seq===token) {
      const url=new URL(API);
      url.searchParams.set("zipcode",zip);
      url.searchParams.set("offset",String(offset));
      url.searchParams.set("limit",String(PAGE_SIZE));
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),35000);
      let response, data;
      try {
        response=await fetch(url.toString(),{signal:controller.signal});
        data=await response.json();
      } finally {clearTimeout(timer);}
      if(!response.ok || data.ok!==true || !Array.isArray(data.features))throw Error(data.error || "건물 외곽선 서버 오류");
      if(data.zipcode!==zip || data.offset!==offset)throw Error("건물 외곽선 페이지 순서 불일치");
      if(!data.features.length && data.hasMore)throw Error("페이지가 비었는데 다음 페이지가 있다고 응답");
      for (const item of data.features) {
        const b=toBuilding(item);
        if(!b || b.zipcode!==zip)continue;
        if(seen.has(b.id))continue;
        seen.add(b.id);
        buildings.push(b);
      }
      round++;
      if(buildings.length>MAX_FEATURES_PER_ZIP || round>MAX_FEATURES_PER_ZIP/PAGE_SIZE+3)throw Error("대량 건물 조회 제한 도달: 전체 건물 처리 미완료");
      showMessage(zip+" 건물 외곽선 "+buildings.length+"개 확인 중…");
      if(!data.hasMore)break;
      if(!Number.isInteger(data.nextOffset) || data.nextOffset<=offset)throw Error("다음 페이지 위치 오류");
      offset=data.nextOffset;
    }
    if(!enabled || seq!==token)return null;
    return {zip,buildings,groups:grouping(buildings)};
  }

  function closePopup() {if(currentPopup){currentPopup.setMap(null);currentPopup=null;}}
  function info(building,position,color) {
    closePopup();
    onBuildingClick?.();
    const box=document.createElement("div");box.className="mwBuildingPopup";
    const close=document.createElement("button");close.textContent="×";close.type="button";close.onclick=e=>{e.stopPropagation();closePopup();};
    const title=document.createElement("strong");
    title.textContent=building.name || building.road+(building.number?" "+building.number:"");
    box.append(close,title);
    for (const value of [
      "도로명: "+building.road+(building.number?" "+building.number:""),
      "우편번호: "+building.zipcode,
      "건물관리번호: "+(building.managementId || "미등록")
    ]) {
      const line=document.createElement("div");line.textContent=value;box.appendChild(line);
    }
    box.style.borderLeft="4px solid "+color[1];
    currentPopup=new kakao.maps.CustomOverlay({map,position,content:box,yAnchor:1.25,zIndex:20,clickable:true});
  }
  function stopShapes() {
    closePopup();
    for(const poly of drawings)poly.setMap(null);
    for(const label of labels)label.setMap(null);
    drawings.length=0;labels.length=0;
  }
  function clipToZip(building,feature) {
    const footprint=building.raw;
    try {
      if(turf.booleanWithin(footprint,feature))return footprint;
      return turf.intersect(footprint,feature);
    }catch {
      try{return turf.intersect(footprint,feature);}catch{return null;}
    }
  }
  function renderShape(geometry,building,color,dim) {
    const geom=geometry.geometry;
    if(!geom || !["Polygon","MultiPolygon"].includes(geom.type))return 0;
    const list=geom.type==="Polygon"?[geom.coordinates]:geom.coordinates;
    let count=0;
    for(const rings of list) {
      const paths=(rings||[]).map(r=>(r||[]).slice(0,-1).map(pt=>new kakao.maps.LatLng(pt[1],pt[0]))).filter(a=>a.length>=3);
      if(!paths.length)continue;
      const poly=new kakao.maps.Polygon({
        map,path:paths.length===1?paths[0]:paths,strokeColor:color[1],
        strokeOpacity:dim?.24:.94,strokeWeight:1.35,fillColor:color[0],
        fillOpacity:dim?.12:.76,zIndex:9,clickable:true
      });
      const where=()=>{try{
        const c=turf.centerOfMass(geometry).geometry.coordinates;
        return new kakao.maps.LatLng(c[1],c[0]);
      }catch{return map.getCenter();}};
      kakao.maps.event.addListener(poly,"click",()=>info(building,where(),color));
      drawings.push(poly);count++;
    }
    return count;
  }
  function drawLabels(entries){
    for (const label of labels)label.setMap(null);
    labels.length=0;
    if(Number(map.getLevel?.()||7)>5)return;
    const used=[],projection=map.getProjection?.();
    for(const e of entries || []){
      const group=e?.group;
      if(!group || !Array.isArray(group.placed) || group.placed.length===0 || group.road==="도로명 미확인")continue;
      const point=group.placed[Math.floor(group.placed.length/2)]?.point;
      if(!Array.isArray(point) || point.length<2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))continue;
      const pos=new kakao.maps.LatLng(point[1],point[0]);
      if(projection?.containerPointFromCoords){
        const pt=projection.containerPointFromCoords(pos);
        if(used.some(x=>Math.abs(x.x-pt.x)<118&&Math.abs(x.y-pt.y)<32))continue;
        used.push(pt);
      }
      const label=document.createElement("div");label.className="mwRoadLabel";label.textContent=group.road;label.style.borderColor=group.color[1];
      const overlay=new kakao.maps.CustomOverlay({map,position:pos,content:label,yAnchor:.5,zIndex:12,clickable:false});
      labels.push(overlay);
    }
  }
  function render() {
    if(!enabled)return;
    stopShapes();
    legend.replaceChildren();
    const grouped=new Map();
    const seenBuildings=new Set();
    for(const zip of zips()){
      const record=cache.get(zip),feature=getFeature(zip);
      if(!record||!feature)continue;
      for(const group of record.groups){
        const road=group.road;
        if(!grouped.has(road))grouped.set(road,{road,color:colorForRoad(road),placed:[]});
        const entry=grouped.get(road);
        for(const building of group.buildings){
          // The same source object may occur in overlapping ZIP sources;
          // it represents one building, even when shown by multiple polygons.
          if(seenBuildings.has(building.id))continue;
          const clipped=clipToZip(building,feature);
          if(!clipped)continue;
          seenBuildings.add(building.id);
          let center=null;
          try{center=turf.centerOfMass(clipped).geometry.coordinates;}catch{}
          entry.placed.push({building,geometry:clipped,point:center});
        }
      }
    }
    const allGroups=[...grouped.values()].filter(g=>g.placed.length)
      .sort((a,b)=>a.road.localeCompare(b.road,"ko-KR"));
    legend.hidden=!allGroups.length;
    const available=new Set(allGroups.map(g=>g.road));
    for(const road of selectedRoads)if(!available.has(road))selectedRoads.delete(road);
    for(const group of allGroups){
      const dim=selectedRoads.size>0&&!selectedRoads.has(group.road);
      for(const entry of group.placed)renderShape(entry.geometry,entry.building,group.color,dim);
      const item=document.createElement("button");
      item.type="button";
      item.className="mwRoadRow";
      item.dataset.selected=String(selectedRoads.has(group.road));
      item.setAttribute("aria-pressed",String(selectedRoads.has(group.road)));
      const swatch=document.createElement("span");swatch.className="mwRoadSwatch";
      swatch.style.background=group.color[0];swatch.style.borderColor=group.color[1];
      const name=document.createElement("span");name.className="mwRoadName";name.textContent=group.road;
      const qty=document.createElement("span");qty.className="mwRoadCount";qty.textContent=String(group.placed.length);
      item.append(swatch,name,qty);
      item.onclick=()=>{
        if(selectedRoads.has(group.road))selectedRoads.delete(group.road);
        else selectedRoads.add(group.road);
        render();
      };
      legend.appendChild(item);
    }
    clearSelection.disabled=selectedRoads.size===0;
    if(allGroups.length)showMessage("");
    else showMessage("해당 구역에서 표시 가능한 건물 주소가 없습니다.");
    renderedRoadGroups=allGroups.map(group=>({group}));
    drawLabels(renderedRoadGroups);
  }
  clearSelection.onclick=()=>{selectedRoads.clear();render();};
  async function run(token){
    if(!enabled||token!==seq)return;
    const requested=zips();
    if(!requested.length){stopShapes();legend.hidden=true;showMessage("지도표시로 우편번호 폴리곤을 먼저 조회하세요.");return;}
    if(getSelectedZips().length>MAX_ZIPS)showMessage("한 번에 우편번호 "+MAX_ZIPS+"개만 표시합니다.");
    for(const zip of requested){
      if(!enabled||seq!==token)return;
      if(cache.has(zip))continue;
      showMessage(zip+" 실제 건물 외곽선 조회 중…");
      const result=await fetchBuildings(zip,token);
      if(!result)return;
      cache.set(zip,result);
      render();
    }
    if(enabled&&seq===token)render();
  }
  function schedule(){
    const t=++seq;
    queue=queue.catch(()=>{}).then(()=>run(t)).catch(error=>{
      if(t!==seq||!enabled)return;
      stopShapes();legend.replaceChildren();legend.hidden=true;
      showMessage("건물별 조회 실패: "+String(error?.message||error)+" · 일부 건물을 임의로 표시하지 않았습니다.");
    });
  }
  function off(){
    enabled=false;seq++;selectedRoads.clear();renderedRoadGroups=[];
    button.setAttribute("aria-pressed","false");button.textContent="건물별 표시";panel.hidden=true;
    stopShapes();legend.hidden=true;showMessage("건물별 레이어가 꺼져 있습니다.");
  }
  button.onclick=()=>{if(enabled){off();return;}enabled=true;panel.hidden=false;button.setAttribute("aria-pressed","true");button.textContent="건물별 숨기기";schedule();};
  if(kakao.maps.event?.addListener)kakao.maps.event.addListener(map,"idle",()=>{if(enabled)drawLabels(renderedRoadGroups);});
  return {
    onZipLoaded(zip){if(enabled&&!cache.has(zip))schedule();},
    onZipRemoved(zip){cache.delete(zip);if(enabled)schedule();},
    onSelectionChange(){if(enabled)schedule();},
    reset(){off();cache.clear();}
  };
};
})();