(function () {
"use strict";
// Feature-by-feature official building footprints. No sampled rectangles or inferred extents.
const API = "https://purple-river-0717.brain-0f6.workers.dev/building-footprints";
const PAGE_SIZE = 200;
const MAX_FEATURES_PER_ZIP = 8000; // Refuse silent truncation; report if unusually large.
const MAX_ZIPS = 4;
const PALETTE = [
  ["#8fcddc","#246f83"],["#a4d3b1","#38785b"],["#cab7e6","#75559e"],
  ["#ecc2a2","#9e693f"],["#b2c9e9","#426d9c"],["#e6d69b","#887232"],
  ["#e1b9cb","#994c71"],["#94d1c6","#327b70"],["#c7d6a6","#6a8046"],
  ["#d6c4b3","#816b58"],["#a6c8d2","#477682"],["#d9c3df","#845b8e"]
];
const UNKNOWN = ["#d4dbe2","#6b7c8b"];
const clean = value => String(value ?? "").trim();
function roadName(props) {
  return clean(props?.street_name || props?.streetName) || "도로명 미확인";
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
  const items = [...groups.values()].sort((a,b) => b.buildings.length-a.buildings.length || a.road.localeCompare(b.road,"ko"));
  let colorIndex = 0;
  for (const item of items) {
    item.color = item.road === "도로명 미확인" ? UNKNOWN : PALETTE[(colorIndex++) % PALETTE.length];
  }
  return items;
}
window.MW_ROAD_OVERLAY_TOOLS = Object.freeze({ roadName, toBuilding, grouping, colors: PALETTE });

window.MW_ROAD_OVERLAY_BOOT = function ({map,getSelectedZips,getFeature,onBuildingClick}) {
  if (!map || !document.getElementById("terrainSection") || !window.turf || !window.kakao?.maps) return null;
  const turf = window.turf;
  const css = [
    "#mwRoadPanel{margin:11px 0 0;padding:12px;border:1px solid #cbd9e6;border-radius:13px;background:#f8fbff}",
    ".mwRoadHead{display:flex;justify-content:space-between;align-items:center;gap:9px}",
    ".mwRoadHead strong{font-size:12px;font-weight:900;color:#26374b}",
    ".mwRoadToggle{font-size:11px!important;border:1px solid #90b5cf;border-radius:8px;padding:7px 10px;background:#e9f3fa;color:#27516c;font-weight:800;white-space:nowrap;cursor:pointer}",
    ".mwRoadToggle[aria-pressed=true]{background:#d7e9df;color:#245e44;border-color:#87b69c}",
    ".mwRoadHint{font-size:10px;color:#697b8e;line-height:1.55;margin:7px 0 0}",
    ".mwRoadStatus{font-size:11px;color:#455c72;line-height:1.5;margin-top:8px}",
    ".mwRoadLegend{max-height:255px;overflow-y:auto;margin-top:9px;display:flex;flex-direction:column;gap:5px}",
    ".mwRoadLegend[hidden]{display:none!important}",
    ".mwRoadRow{display:flex;align-items:center;text-align:left;gap:8px;width:100%;padding:7px 8px;border:1px solid #dce5ed;background:#fff;border-radius:8px;cursor:pointer}",
    ".mwRoadRow[data-selected=true]{border-color:#3e6d88;box-shadow:0 0 0 1px #3e6d88}",
    ".mwRoadSwatch{flex:0 0 13px;width:13px;height:13px;border-radius:3px;border:1px solid}",
    ".mwRoadName{flex:1;min-width:0;color:#24394e;font-weight:800;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mwRoadCount{color:#6a7a8b;font-size:10px;white-space:nowrap}",
    ".mwRoadLabel{pointer-events:none;white-space:nowrap;padding:3px 7px;border:1px solid #7895a8;background:rgba(255,255,255,.96);border-radius:6px;color:#22394b;font-size:10px;font-weight:850;box-shadow:0 1px 5px rgba(29,46,67,.16)}",
    ".mwBuildingPopup{padding:9px 12px;border:1px solid #9eb5c4;border-radius:9px;background:#fff;box-shadow:0 2px 10px #182f4940;color:#25394a;font-size:11px;max-width:280px}",
    ".mwBuildingPopup strong{display:block;font-size:12px;margin-bottom:5px;color:#133954}",
    ".mwBuildingPopup button{float:right;font-size:12px;margin-left:5px;border:0;background:transparent;cursor:pointer}"
  ].join("");
  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
  const host=document.getElementById("terrainSection");
  const panel=document.createElement("section");panel.id="mwRoadPanel";
  panel.innerHTML='<div class="mwRoadHead"><strong>건물별 도로명 분포</strong><button class="mwRoadToggle" type="button" aria-pressed="false">건물별 표시</button></div>'+
    '<div class="mwRoadHint">공식 건물 외곽선 기준으로 각 건물을 색칠합니다. 도로명은 건물 주소 자료 기준이며 정확한 도로 구역의 경계는 아닙니다.</div>'+
    '<div class="mwRoadStatus" aria-live="polite">우편번호를 지도에 표시한 뒤 건물별 표시를 누르세요.</div>'+
    '<div class="mwRoadLegend" hidden></div>';
  host.parentNode.insertBefore(panel,host);
  const button=panel.querySelector(".mwRoadToggle");
  const status=panel.querySelector(".mwRoadStatus");
  const legend=panel.querySelector(".mwRoadLegend");
  const cache=new Map();
  const drawings=[],labels=[];
  let currentPopup=null,enabled=false,seq=0,selectedRoad="",selectedZip="",queue=Promise.resolve();
  const showMessage=txt=>{status.textContent=txt};
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
    for(const e of entries){
      if(e.group.placed.length===0||e.group.road==="도로명 미확인")continue;
      const point=e.group.placed[Math.floor(e.group.placed.length/2)].point;
      if(!point)continue;
      const pos=new kakao.maps.LatLng(point[1],point[0]);
      if(projection?.containerPointFromCoords){
        const pt=projection.containerPointFromCoords(pos);
        if(used.some(x=>Math.abs(x.x-pt.x)<118&&Math.abs(x.y-pt.y)<32))continue;
        used.push(pt);
      }
      const label=document.createElement("div");label.className="mwRoadLabel";label.textContent=e.group.road;label.style.borderColor=e.group.color[1];
      const overlay=new kakao.maps.CustomOverlay({map,position:pos,content:label,yAnchor:.5,zIndex:12,clickable:false});
      labels.push(overlay);
    }
  }
  function render() {
    if(!enabled)return;
    stopShapes();
    legend.replaceChildren();
    let total=0,placed=0,skipped=0,all=[];
    const selected=zips();
    for (const zip of selected) {
      const record=cache.get(zip),feature=getFeature(zip);
      if(!record||!feature)continue;
      total+=record.buildings.length;
      for(const group of record.groups){
        group.placed=[];
        for(const b of group.buildings){
          const clipped=clipToZip(b,feature);
          if(!clipped){skipped++;continue;}
          let center=null;
          try{center=turf.centerOfMass(clipped).geometry.coordinates;}catch{}
          const dim=selectedRoad && (selectedRoad!==group.road||selectedZip!==zip);
          const cnt=renderShape(clipped,b,group.color,dim);
          if(cnt){placed++;group.placed.push({building:b,point:center});}else skipped++;
        }
        all.push({zip,group});
      }
    }
    legend.hidden=all.length===0;
    for(const e of all){
      const {group,zip}=e,key=zip+"|"+group.road;
      const item=document.createElement("button");item.type="button";item.className="mwRoadRow";
      item.dataset.selected=String(selectedRoad===group.road&&selectedZip===zip);
      const swatch=document.createElement("span");swatch.className="mwRoadSwatch";
      swatch.style.background=group.color[0];swatch.style.borderColor=group.color[1];
      const name=document.createElement("span");name.className="mwRoadName";
      name.textContent=(selected.length>1?zip+" · ":"")+group.road;
      const qty=document.createElement("span");qty.className="mwRoadCount";
      qty.textContent=group.placed.length+"동";
      item.append(swatch,name,qty);
      item.onclick=()=>{if(selectedRoad===group.road&&selectedZip===zip){selectedRoad="";selectedZip="";}else{selectedRoad=group.road;selectedZip=zip;}render();};
      legend.appendChild(item);
    }
    if(total===0)showMessage("원본에 등록된 건물이 없습니다. 임의의 네모를 그리지 않습니다.");
    else showMessage("건물 "+placed+"/"+total+"개 외곽선 표시 · 도로명 "+all.length+"개"+(skipped?" · 폴리곤 교차/도형 오류 "+skipped+"개 제외":"")+" (개별 건물 기준)");
    drawLabels(all);
  }
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
    enabled=false;seq++;selectedRoad="";selectedZip="";
    button.setAttribute("aria-pressed","false");button.textContent="건물별 표시";
    stopShapes();legend.hidden=true;showMessage("건물별 레이어가 꺼져 있습니다.");
  }
  button.onclick=()=>{if(enabled){off();return;}enabled=true;button.setAttribute("aria-pressed","true");button.textContent="건물별 숨기기";schedule();};
  if(kakao.maps.event?.addListener)kakao.maps.event.addListener(map,"idle",()=>{if(enabled)drawLabels(zips().flatMap(zip=>(cache.get(zip)?.groups||[]).map(group=>({zip,group}))));});
  return {
    onZipLoaded(zip){if(enabled&&!cache.has(zip))schedule();},
    onZipRemoved(zip){cache.delete(zip);if(enabled)schedule();},
    onSelectionChange(){if(enabled)schedule();},
    reset(){off();cache.clear();}
  };
};
})();