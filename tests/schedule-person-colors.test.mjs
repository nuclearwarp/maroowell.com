import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("public/maroowell_schedule","utf8");
const paletteMatch=html.match(/const LIGHT_PALETTE = (\[[^\n]+\]);/);
assert(paletteMatch, "schedule palette");
const palette=JSON.parse(paletteMatch[1]);
assert(palette.length>=40 && new Set(palette).size===palette.length, "at least 40 unique colors");
const start=html.indexOf("      function personColorHash(key){");
const end=html.indexOf("      function splitPersonNames(value){",start);
assert(start>=0 && end>start, "deterministic color assignment functions");
const clean=v=>String(v??"").trim();
const keyOf=v=>clean(v).replace(/\s+/g,"").toUpperCase();
const state={personColorMap:new Map()};
const f=new Function("state","keyOf","clean","resolveAccount","LIGHT_PALETTE",
 html.slice(start,end)+";return {assignColorKey,colorForValue,textColorForBg,personColorPattern,personCellStyle};"
)(state,keyOf,clean,v=>({colorKey:v}),palette);
const names=[...Array(30)].map((_,i)=>"기사"+String(i).padStart(2,"0")).concat(["최영하","이병훈"]);
const owners=[...names].sort((a,b)=>a.localeCompare(b,"ko"));
for(const name of owners)f.assignColorKey(name);
assert.equal(new Set(state.personColorMap.values()).size,32,"distinct people have distinct colors");
const before=[...state.personColorMap].sort();
state.personColorMap.clear();
for(const name of owners)f.assignColorKey(name);
assert.deepEqual([...state.personColorMap].sort(),before,"stable after page reload");
assert.notEqual(f.colorForValue("최영하"),f.colorForValue("이병훈"));
function luminance(hex){
 const v=parseInt(hex.slice(1),16);
 const c=[(v>>16)&255,(v>>8)&255,v&255].map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
for(const bg of palette){
 const fg=f.textColorForBg(bg);
 const contrast=(Math.max(luminance(bg),luminance(fg))+.05)/(Math.min(luminance(bg),luminance(fg))+.05);
 assert(contrast>=4.5,"contrast of "+bg+" "+contrast);
 assert(f.personCellStyle(bg).includes("background-image:"));
}
assert(html.includes("const colorOwners=[...new Set(drivers.map"),"roster preseed");
assert(html.includes('input.style.setProperty("background-image", personColorPattern(bg), "important")'),"input recolors");
assert(html.includes('div.style.setProperty("background-image",personColorPattern(bg)'),"image output pattern");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(const m of scripts)if(m[1].trim())new Function(m[1]);
console.log("PASS: high-contrast palette, 32 distinct owners, stable identities, script syntax and export");
