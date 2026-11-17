(function(){
"use strict";
const target=String(new URLSearchParams(location.search).get("camp")||"").trim().slice(0,80);
if(!target)return;
const cfg=window.MARUWELL_CONFIG||{};
const urls=[cfg.BACKENDS?.coupangCamp||"https://coupangcamp.brain-0f6.workers.dev",cfg.BACKENDS?.coupangCampEditor||"https://purple-river-0717.brain-0f6.workers.dev"].map(s=>String(s).replace(/\/+$/,"")+"/camps");
const icons={
main:'<svg viewBox="0 0 24 24" fill="none" stroke="#315f87" stroke-width="2"><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/></svg>',
mobile:'<svg viewBox="0 0 24 24" fill="none" stroke="#517452" stroke-width="2"><path d="M5 21V3m0 1c4-3 7 3 14 0v11c-7 3-10-3-14 0"/></svg>',
sh:"<b>SH</b>"
};
const css='.mwCampPin{display:flex;align-items:center;gap:5px;max-width:245px;padding:4px 7px;border:1px solid #93a8bb;border-radius:9px;background:#fff;color:#213547;box-shadow:0 2px 7px #0f172a22;font-size:11px;font-weight:850;white-space:nowrap;cursor:pointer}.mwCampPin.mobile{border-color:#a5bea5;background:#f8fcf8}.mwCampPin.sh{border-color:#cbd5e1;background:#f8fafc}.mwCampPin svg,.mwCampSymbol svg{width:17px;height:17px;flex:0 0 17px}.mwCampCluster{display:flex;flex-direction:column;align-items:flex-start;gap:3px}.mwCampCluster .mwCampPin{max-width:240px;font-size:10px;padding:3px 6px}.mwCampCluster .mwCampPin svg{width:14px;height:14px;flex-basis:14px}@media(max-width:720px){.mwCampPin{font-size:9px}}';
function norm(v){return String(v||"").replace(/\s/g,"").toUpperCase()}
function kind(r){if(String(r.camp_type||"").toUpperCase()==="SUB_HUB")return "sh";const mb=String(r.mb_camp||"").trim();return mb&&mb!=="본캠프"&&mb!==String(r.camp||"").trim()&&r.camp_type!=="M캠프"?"mobile":"main"}
function name(r){return kind(r)==="sh"?(r.code||r.camp||"SH"):kind(r)==="mobile"?(r.mb_camp||r.camp):(r.camp||r.code)}
function coords(r){const lat=Number(r.latitude),lng=Number(r.longitude);return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=33&&lat<=39.5&&lng>=124&&lng<=132&&lat!==0&&lng!==0?{lat,lng}:null}
function addrKey(s){return String(s||"").trim().replace(/,\s*(?:B\d+|\d+)\s*층.*$/i,"").replace(/,\s*(?:지하\s*)?\d+\s*층.*$/i,"").replace(/\s+/g,"").toUpperCase()}
function addressBase(s){return String(s||"").trim().replace(/,\s*(?:B\d+|\d+)\s*층.*$/i,"").replace(/,\s*(?:지하\s*)?\d+\s*층.*$/i,"")}
async function fetchRows(){
 const results=await Promise.allSettled(urls.map(async url=>{const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);const x=await r.json();return Array.isArray(x)?x:(x.rows||x.camps||[])}));
 const allById=new Map();
 for(const entry of results){if(entry.status!=="fulfilled")continue;for(const r of entry.value||[]){const id=String(r.id??[r.camp,r.code,r.mb_camp].join("|"));allById.set(id,Object.assign({},allById.get(id)||{},r))}}
 if(!allById.size)throw Error("Camp backend unavailable");
 const all=[...allById.values()],rows=all.filter(r=>norm(r.camp)===norm(target)&&kind(r)!=="sh");
 const receiving=new Set(rows.map(r=>String(r.receiving_sh_id||"")).filter(Boolean)),ids=new Set(rows.map(r=>String(r.id)));
 for(const r of all){if(kind(r)!=="sh")continue;const sn=norm(r.camp).replace(/\(SH\d*\)$/i,"");if(receiving.has(String(r.id))||sn===norm(target)||ids.has(String(r.parent_camp_id||""))){if(!ids.has(String(r.id))){rows.push(r);ids.add(String(r.id))}}}
 const weights={main:0,mobile:1,sh:2};return rows.sort((a,b)=>weights[kind(a)]-weights[kind(b)]||String(name(a)).localeCompare(String(name(b)),"ko"));
}
function geocode(address,geocoder){return new Promise(resolve=>{if(!address||!geocoder)return resolve(null);let finished=false;const done=x=>{if(!finished){finished=true;resolve(x)}};const timer=setTimeout(()=>done(null),4500);try{geocoder.addressSearch(addressBase(address),(results,status)=>{clearTimeout(timer);done(status===kakao.maps.services.Status.OK&&results?.length?{lat:Number(results[0].y),lng:Number(results[0].x)}:null)})}catch{clearTimeout(timer);done(null)}})}
async function locate(rows,geocoder){const known=new Map();for(const r of rows){r._coord=coords(r);if(r._coord&&r.address)known.set(addrKey(r.address),r._coord)}for(const r of rows){if(!r._coord&&r.address)r._coord=known.get(addrKey(r.address))||null}for(const r of rows){if(r._coord||!r.address)continue;r._coord=await geocode(r.address,geocoder);if(r._coord)known.set(addrKey(r.address),r._coord)}return rows}
function element(tag,cl,text){const e=document.createElement(tag);if(cl)e.className=cl;if(text!==undefined)e.textContent=text;return e}
window.MW_CAMP_OVERLAY_BOOT=async function(map,geocoder){
 const wrap=document.getElementById("mapWrap");if(!wrap||!map)return;
 const style=element("style");style.textContent=css;document.head.appendChild(style);
 let overlays=[],rows=[];
 function clear(){overlays.forEach(o=>{try{o.setMap(null)}catch{}});overlays=[]}
 function draw(){clear();const groups=new Map();
  for(const r of rows){if(!r._coord)continue;const key=r._coord.lat.toFixed(5)+","+r._coord.lng.toFixed(5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  for(const group of groups.values()){const root=element("div","mwCampCluster");for(const r of group){const k=kind(r),pin=element("button","mwCampPin "+k);pin.type="button";pin.innerHTML=icons[k];pin.appendChild(element("span","",name(r)));pin.title=[r.camp,r.mb_camp,r.code,r.address].filter(Boolean).join(" · ");pin.onclick=e=>{e.preventDefault();e.stopPropagation();map.panTo(new kakao.maps.LatLng(r._coord.lat,r._coord.lng))};root.appendChild(pin)}const c=group[0]._coord,o=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(c.lat,c.lng),content:root,xAnchor:.5,yAnchor:1.02,zIndex:9});o.setMap(map);overlays.push(o)}
 }
 try{rows=await locate(await fetchRows(),geocoder);draw()}catch(e){console.warn("[history camp overlay]",e)}
};
})();