import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync("public/mw-history-camp-overlay.js","utf8");
const all=[];
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.className="";this.textContent="";all.push(this)}
 appendChild(node){this.children.push(node)}
 append(...nodes){this.children.push(...nodes)}
}
const doc={head:new Element("head"),getElementById:id=>id==="mapWrap"?new Element("wrap"):null,createElement:t=>new Element(t)};
const input=[
 {id:1,camp:"일산2",code:"SG02",camp_type:"로켓",mb_camp:"본캠프",address:"경기도 김포시 고촌읍 아라육로 75, 4층",latitude:37.58981,longitude:126.7922,receiving_sh_id:150},
 {id:150,camp:"일산2(SH)",code:"ISN2_SH",camp_type:"SUB_HUB",address:"경기도 김포시 고촌읍 아라육로 75",latitude:37.58965,longitude:126.79153}
];
const overlays=[],events={};
class Overlay {constructor(o){this.options=o;overlays.push(this)}setMap(map){this.map=map}}
class LatLng {constructor(lat,lng){this.lat=lat;this.lng=lng}}
const map={
 getProjection:()=>({containerPointFromCoords:point=>({x:(point.lng-126)*5000,y:(38-point.lat)*5000})}),
 panTo(){},getLevel(){return 5},setLevel(){}
};
const searched=[];
const geocoder={addressSearch(addr,callback){searched.push(addr);callback([{x:"126.79215",y:"37.58980"}],"OK")}};
const context={
 window:{MARUWELL_CONFIG:{},addEventListener:()=>{}},location:{search:"?camp=%EC%9D%BC%EC%82%B02"},
 URLSearchParams,document:doc,console,Number,String,Map,Set,Promise,Error,
 setTimeout,clearTimeout,
 fetch:async()=>({ok:true,json:async()=>({rows:input})}),
 kakao:{maps:{LatLng,CustomOverlay:Overlay,event:{addListener:(m,name,cb)=>events[name]=cb},services:{Status:{OK:"OK"}}}}
};
vm.runInNewContext(source,context);
await context.window.MW_CAMP_OVERLAY_BOOT(map,geocoder);
assert(searched.some(x=>x.includes("아라육로 75")),"SH road address is geocoded, not ignored");
assert.equal(overlays.filter(x=>x.map).length,1,"nearby main and SH share one overlay");
const group=overlays.at(-1).options.content;
assert.equal(group.children.length,2,"all stacked labels remain visible");
assert(group.children[0].className.includes("main"),"main camp first");
assert(group.children[1].className.includes("sh"),"SH below main camp");
assert.equal(typeof events.idle,"function","map movement triggers layout recalculation");
console.log("PASS: SH geocoded from road address, pixel overlap stacked vertically, 2 labels, map idle reflow");
