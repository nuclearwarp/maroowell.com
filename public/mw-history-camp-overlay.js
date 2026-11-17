(function(){
"use strict";
const target=String(new URLSearchParams(location.search).get("camp")||"").trim().slice(0,80);
if(!target)return;
const cfg=window.MARUWELL_CONFIG||{};
const urls=[
 cfg.BACKENDS?.coupangCamp||"https://coupangcamp.brain-0f6.workers.dev",
 cfg.BACKENDS?.coupangCampEditor||"https://purple-river-0717.brain-0f6.workers.dev"
].map(s=>String(s).replace(/\/+$/,"")+"/camps");
const icons={
 main:'<svg viewBox="0 0 24 24" fill="none" stroke="#174b9a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/></svg>',
 mobile:'<svg viewBox="0 0 24 24" fill="none" stroke="#08704b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V3m0 1c4-3 7 3 14 0v11c-7 3-10-3-14 0"/></svg>',
 sh:"<b>SH</b>"
};
// Higher contrast without fluorescent fills; close camp/SH labels share one vertical stack.
const css=[
 ".mwCampCluster{display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:auto}",
 ".mwCampPin{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:6px;max-width:270px;min-height:28px;padding:4px 9px;border:1.5px solid #3b75c8;border-left-width:4px;border-radius:8px;background:#e6f0ff;color:#133e7b;box-shadow:0 2px 9px rgba(15,23,42,.26);font-size:12px;font-weight:900;line-height:1.15;white-space:nowrap;cursor:pointer}",
 ".mwCampPin.mobile{border-color:#248759;background:#e3f5e9;color:#0b583a}",
 ".mwCampPin.sh{border-color:#bd7e26;background:#fff0d2;color:#7b4a0b}",
 ".mwCampPin.sh b{font-size:11px;font-weight:950;letter-spacing:.01em}",
 ".mwCampPin svg{width:18px;height:18px;flex:0 0 18px}",
 ".mwCampPin span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
 ".mwCampPin:hover,.mwCampPin:focus-visible{filter:brightness(.96);box-shadow:0 3px 12px rgba(15,23,42,.32);outline:2px solid #334155;outline-offset:1px}",
 "@media(max-width:720px){.mwCampPin{min-height:26px;max-width:250px;font-size:11px;padding:3px 7px}.mwCampPin svg{width:16px;height:16px;flex-basis:16px}}"
].join("");
const norm=v=>String(v||"").replace(/\s/g,"").toUpperCase();
function kind(r){
 if(String(r.camp_type||"").toUpperCase()==="SUB_HUB")return "sh";
 const mb=String(r.mb_camp||"").trim();
 return mb&&mb!=="본캠프"&&mb!==String(r.camp||"").trim()&&r.camp_type!=="M캠프"?"mobile":"main";
}
function name(r){
 return kind(r)==="sh"?(r.code||r.camp||"SH"):
 kind(r)==="mobile"?(r.mb_camp||r.camp):(r.camp||r.code);
}
function coords(r){
 if(r.latitude===null||r.latitude===undefined||r.longitude===null||r.longitude===undefined)return null;
 const lat=Number(r.latitude),lng=Number(r.longitude);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=33&&lat<=39.5&&lng>=124&&lng<=132&&lat!==0&&lng!==0?{lat,lng}:null;
}
function addressBase(s){
 return String(s||"").trim().replace(/,\s*(?:B\d+|\d+)\s*층.*$/i,"").replace(/,\s*(?:지하\s*)?\d+\s*층.*$/i,"");
}
function addrKey(s){return addressBase(s).replace(/\s+/g,"").toUpperCase();}
async function fetchRows(){
 const results=await Promise.allSettled(urls.map(async url=>{
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw Error("camp API HTTP "+response.status);
  const data=await response.json();
  return Array.isArray(data)?data:(data.rows||data.camps||[]);
 }));
 const allById=new Map();
 for(const result of results){
  if(result.status!=="fulfilled")continue;
  for(const row of result.value||[]){
   const id=String(row.id??[row.camp,row.code,row.mb_camp].join("|"));
   const previous=allById.get(id)||{};
   const merged=Object.assign({},previous,row);
   // The two camp backends have different field completeness. Never erase a usable address.
   for(const key of ["address","latitude","longitude","receiving_sh_id"]){
    if((row[key]===null||row[key]===undefined||row[key]==="")&&previous[key]!==undefined)merged[key]=previous[key];
   }
   allById.set(id,merged);
  }
 }
 if(!allById.size)throw Error("Camp backends unavailable");
 const all=[...allById.values()];
 const rows=all.filter(r=>norm(r.camp)===norm(target)&&kind(r)!=="sh");
 const ids=new Set(rows.map(r=>String(r.id)));
 const receiving=new Set(rows.map(r=>String(r.receiving_sh_id||"")).filter(Boolean));
 for(const r of all){
  if(kind(r)!=="sh")continue;
  const shName=norm(r.camp).replace(/\(SH\d*\)$/i,"");
  if(receiving.has(String(r.id))||shName===norm(target)||ids.has(String(r.parent_camp_id||""))){
   if(!ids.has(String(r.id))){rows.push(r);ids.add(String(r.id));}
  }
 }
 const weights={main:0,mobile:1,sh:2};
 return rows.sort((a,b)=>weights[kind(a)]-weights[kind(b)]||String(name(a)).localeCompare(String(name(b)),"ko"));
}
function geocode(address,geocoder){
 return new Promise(resolve=>{
  if(!address||!geocoder)return resolve(null);
  let finished=false;
  const done=value=>{if(!finished){finished=true;resolve(value);}};
  const timer=setTimeout(()=>done(null),5000);
  try{
   geocoder.addressSearch(addressBase(address),(results,status)=>{
    clearTimeout(timer);
    const row=status===kakao.maps.services.Status.OK&&results?.length?results[0]:null;
    const value=row?{latitude:row.y,longitude:row.x}:null;
    done(value?coords(value):null);
   });
  }catch(error){clearTimeout(timer);done(null);}
 });
}
async function locate(rows,geocoder){
 const known=new Map();
 // SH: use its actual registered road address even if it has an old stored coordinate.
 await Promise.all(rows.filter(r=>kind(r)==="sh").map(async r=>{
  const fromAddress=r.address?await geocode(r.address,geocoder):null;
  r._coord=fromAddress||coords(r);
  r._locationSource=fromAddress?"address":r._coord?"coordinate-fallback":"missing";
  if(r.address&&r._coord)known.set(addrKey(r.address),r._coord);
 }));
 for(const r of rows){
  if(kind(r)==="sh")continue;
  r._coord=coords(r);
  if(r._coord&&r.address)known.set(addrKey(r.address),r._coord);
 }
 // Mobile camps in the very same building inherit its known location, never another address.
 for(const r of rows){
  if(r._coord||!r.address)continue;
  r._coord=known.get(addrKey(r.address))||null;
 }
 const pending=new Map();
 await Promise.all(rows.filter(r=>!r._coord&&r.address).map(async r=>{
  const key=addrKey(r.address);
  if(!pending.has(key))pending.set(key,geocode(r.address,geocoder));
  r._coord=await pending.get(key);
  if(r._coord)known.set(key,r._coord);
 }));
 return rows;
}
function element(tag,cls,text){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;
 return el;
}
// Estimate chip bounds before rendering so overlapping positions can be stacked into one overlay.
function labelWidth(r){
 const label=String(name(r)||"");
 const textWidth=Array.from(label).reduce((n,ch)=>n+(ch.codePointAt(0)>255?12:7.5),0);
 return Math.min(270,Math.max(85,Math.ceil(textWidth+52)));
}
function layoutGroups(rows,map){
 const present=rows.filter(r=>r._coord);
 const groups=present.map(r=>({items:[r],anchor:r._coord}));
 let projection=null;
 try{projection=map.getProjection?.()}catch{}
 if(!projection?.containerPointFromCoords){
  const exact=new Map();
  for(const g of groups){
   const key=g.anchor.lat.toFixed(5)+","+g.anchor.lng.toFixed(5);
   if(!exact.has(key))exact.set(key,{items:[],anchor:g.anchor});
   exact.get(key).items.push(...g.items);
  }
  return [...exact.values()];
 }
 function rect(g){
  const pt=projection.containerPointFromCoords(new kakao.maps.LatLng(g.anchor.lat,g.anchor.lng));
  const width=Math.max(...g.items.map(labelWidth),85)+8;
  // Chip height 28px (mobile 26px), plus 1px gap and small safety margin.
  const height=g.items.length*31+4;
  return {left:pt.x-width/2-4,right:pt.x+width/2+4,top:pt.y-height-6,bottom:pt.y+5};
 }
 function intersects(a,b){
  return a.left<b.right+3&&a.right+3>b.left&&a.top<b.bottom+3&&a.bottom+3>b.top;
 }
 // Iteratively merge until no two rendered label rectangles can overlap.
 for(let i=0;i<groups.length;i++){
  let merged=false;
  for(let j=i+1;j<groups.length;j++){
   let collides=false;
   try{collides=intersects(rect(groups[i]),rect(groups[j]));}catch{}
   if(!collides)continue;
   const items=groups[i].items.concat(groups[j].items);
   const order={main:0,mobile:1,sh:2};
   items.sort((a,b)=>order[kind(a)]-order[kind(b)]||String(name(a)).localeCompare(String(name(b)),"ko"));
   const preferred=items.find(r=>kind(r)==="main")||items[0];
   groups[i]={items,anchor:preferred._coord};
   groups.splice(j,1);
   merged=true;break;
  }
  if(merged)i=-1;
 }
 return groups;
}
window.MW_CAMP_OVERLAY_BOOT=async function(map,geocoder){
 if(!map||!document.getElementById("mapWrap"))return;
 const style=element("style");style.textContent=css;document.head.appendChild(style);
 let rows=[],overlays=[],scheduled=0;
 function clear(){
  for(const overlay of overlays){try{overlay.setMap(null);}catch{}}
  overlays=[];
 }
 function draw(){
  scheduled=0;clear();
  for(const group of layoutGroups(rows,map)){
   const root=element("div","mwCampCluster");
   for(const r of group.items){
    const k=kind(r),pin=element("button","mwCampPin "+k);
    pin.type="button";pin.innerHTML=icons[k];
    pin.appendChild(element("span","",name(r)));
    pin.title=[r.camp,r.mb_camp,r.code,r.address,k==="sh"&&r._locationSource==="address"?"주소 위치":""].filter(Boolean).join(" · ");
    pin.onclick=e=>{
     e.preventDefault();e.stopPropagation();
     map.panTo(new kakao.maps.LatLng(r._coord.lat,r._coord.lng));
    };
    root.appendChild(pin);
   }
   const p=group.anchor;
   const overlay=new kakao.maps.CustomOverlay({
    position:new kakao.maps.LatLng(p.lat,p.lng),content:root,xAnchor:.5,yAnchor:1.02,zIndex:12,clickable:true
   });
   overlay.setMap(map);overlays.push(overlay);
  }
 }
 function scheduleDraw(){
  if(scheduled)clearTimeout(scheduled);
  scheduled=setTimeout(draw,80);
 }
 if(kakao.maps.event?.addListener){
  kakao.maps.event.addListener(map,"idle",scheduleDraw);
  kakao.maps.event.addListener(map,"zoom_changed",scheduleDraw);
 }
 window.addEventListener?.("resize",scheduleDraw);
 try{
  rows=await locate(await fetchRows(),geocoder);
  draw();
 }catch(error){console.warn("[history camp overlay]",error);}
};
})();