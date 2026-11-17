import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const history=readFileSync("public/cleansing_history","utf8");
const zipcode=readFileSync("public/zipcode_search","utf8");
const js=readFileSync("public/mw-history-camp-overlay.js","utf8");
assert(history.includes("zipLinks(r.zip, r.camp)"));
assert(history.includes("encodeURIComponent(String(camp).trim())"));
assert(zipcode.includes('src="/mw-history-camp-overlay.js"'));
assert(zipcode.includes("window.MW_CAMP_OVERLAY_BOOT(state.map,state.kakaoGeocoder)"));
const nodes=[];
class El{
 constructor(tag){this.tagName=tag;this.children=[];this.textContent="";this.dataset={};this.style={};this.hidden=false;nodes.push(this)}
 append(...c){this.children.push(...c)}
 appendChild(c){this.children.push(c)}
 replaceChildren(...c){this.children=[...c]}
 setAttribute(){}
}
const wrap=new El("mapWrap");
const document={createElement:t=>new El(t),head:new El("head"),getElementById:id=>id==="mapWrap"?wrap:null};
const fixture=[
{id:70,camp:"안양1",code:"SG14",mb_camp:"본캠프",camp_type:"로켓",address:"경기 안양시 동안구 흥안대로439번길 30, 4층",latitude:37.3942,longitude:126.9726,receiving_sh_id:180},
...["7","2","B1","B2"].map((floor,i)=>({id:403+i,camp:"안양1",code:"MC"+i,mb_camp:"관양동"+floor+"F MB",camp_type:"로켓",address:"경기 안양시 동안구 흥안대로439번길 30, "+floor+"층",latitude:null,longitude:null})),
{id:180,camp:"안양1(SH)",code:"AYG1_SH",camp_type:"SUB_HUB",latitude:37.39388,longitude:126.97279}
];
let added=0;
class Overlay{constructor(opts){this.opts=opts}setMap(map){if(map)added++}}
const context={window:{MARUWELL_CONFIG:{}},location:{search:"?zips=14000&camp=%EC%95%88%EC%96%911"},URLSearchParams,document,console,Number,String,Map,Set,Promise,Error,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({rows:fixture})}),kakao:{maps:{LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng}},CustomOverlay:Overlay,services:{Status:{OK:"OK"}}}}};
vm.runInNewContext(js,context);
assert.equal(typeof context.window.MW_CAMP_OVERLAY_BOOT,"function");
await context.window.MW_CAMP_OVERLAY_BOOT({panTo(){},getLevel(){return 5},setLevel(){}},null);
const panel=wrap.children[0],list=panel.children[1];
assert.equal(list.children.length,6,"all 4 mobile camps plus main and SH in panel");
assert.equal(added,2,"all MB camps share the main camp location, with separate SH location");
assert(list.children.some(r=>r.children[1].children[0].textContent.includes("AYG1_SH")));
assert(nodes.some(n=>n.className?.includes("mwCampPin")&&n.children.some(x=>x.textContent?.includes("관양동"))));
console.log("PASS: camp URL, 6 rows, mobile markers, linked SH and coordinate sharing");
