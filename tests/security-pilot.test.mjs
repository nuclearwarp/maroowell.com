import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("public/index.html","utf8");
const worker=readFileSync("workers/security/worker.js","utf8");
const scriptBlocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert(scriptBlocks.length>0,"login scripts expected");
for(const block of scriptBlocks){
  if(block[1].trim())new Function(block[1]);
}
assert(html.includes('params.get("mw_security_pilot") === "1"'));
assert(html.includes('if (!mwSecurityPilot) return;') || html.includes('if(!mwSecurityPilot) return;'));
assert(html.includes('await attachSecurityPilotSession();'));
assert(html.includes('let suppressAutoRedirect = mwSecurityPilot;'));
assert(html.includes('fetch("/api/session/login"'),"pilot uses cookie-based login");
assert(html.includes('sessionStorage.setItem("mw_web_server_auth","1")'),"must activate secure cookie bridge");
assert(html.includes('await fetch("/api/session/me"'));
assert(!html.includes('localStorage.setItem("access_token"'));
assert(worker.includes('endpoint==="/api/session/attach"'));
console.log("PASS migration pilot: gated login, parseable scripts, server identity gate");
