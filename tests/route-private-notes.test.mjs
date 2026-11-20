import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import worker from "../worker.js";
const html=readFileSync("public/coupangRouteMap.html","utf8");
const src=readFileSync("worker.js","utf8");
for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(code.trim())assert.doesNotThrow(()=>new Function(code),"coupangRouteMap inline script must parse");
}
for(const el of ["routeNotesGroup","routeTopType","routeSpecialMemo","routeNotesSaveBtn","routeNotesStatus"]){
  assert(html.includes('id="'+el+'"'),"missing "+el);
}
for(const top of ["하이탑","정탑","로우탑"]){
  assert(html.includes('value="'+top+'"'),"missing truck type "+top);
}
assert(html.includes("fetchSelectedRouteNotes(id)"));
assert(html.includes('apiJson("POST",API_BASE+"/route/notes"'));
assert(html.includes('document.getElementById("routeNotesGroup").style.display="none"'),"app viewer cannot see restricted notes");
assert(src.includes('if (path === "/route/notes")'));
assert(src.includes('await requireRouteWriteAccess(request, env);'));
assert(src.includes('out.forEach(redactRouteMemo);'),"public listing must not return access passwords");
assert(src.includes('return json({ row: redactRouteMemo(row) }'),"public route write response must not leak note");
assert(src.includes('["하이탑","정탑","로우탑"]'),"worker must validate values");
assert(src.includes("memo.length > 3000"),"worker must validate length");
const unauthorizedGet=await worker.fetch(new Request("https://example.com/route/notes?id=1"),{});
assert.equal(unauthorizedGet.status,401);
const unauthorizedPost=await worker.fetch(new Request("https://example.com/route/notes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:1,top_type:"하이탑",route_memo:"test"})}),{});
assert.equal(unauthorizedPost.status,401);
console.log("PASS: private route note API auth, public memo redaction, route editor UI and type options");
