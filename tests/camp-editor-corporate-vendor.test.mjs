import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("worker.js","utf8");
assert.match(source,/const MAROOWELL_VENDOR_CODE = "bn_6128704101"/);
assert.doesNotMatch(source,/const MAROOWELL_VENDOR_CODE = "bn_2591501828"/);

const start=source.indexOf("async function routeMaroowellVendor(env)");
const end=source.indexOf("async function requireRouteWriteAccess(",start);
assert(start>=0 && end>start);
const code=source.slice(start,end);
const calls=[];
const fn=new Function("routeFirstRow","VENDORS_TABLE","MAROOWELL_VENDOR_CODE",
  code+"\nreturn routeMaroowellVendor;"
)(async (_env,table,params)=>{
  calls.push({table,params});
  if(params.vendor_code==="eq.bn_6128704101")
    return {id:"corporate-vendor",vendor_code:"bn_6128704101",name:"Corporate Maroowell"};
  return null;
},"vendors","bn_6128704101");
const matched=await fn({});
assert.equal(matched.id,"corporate-vendor");
assert.equal(calls.length,1,"Corporate lookup should not need old-name fallback");
assert.equal(calls[0].params.vendor_code,"eq.bn_6128704101");
console.log("PASS: Camp editor and route write access use current corporate vendor code");
