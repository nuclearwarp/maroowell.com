const SUPABASE_URL = "https://rgqerimdxkthkcewqbbe.supabase.co";
const META_SEARCH_URL = "https://fly.coupang.com/realtime-dashboard/camps/work-status/search";
const AUTH_START = "https://fly.coupang.com/oauth2/authorization/keycloak";
const FLY_REALTIME = "https://fly.coupang.com/ui/dashboard/realtime";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

function out(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function page(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer"
    }
  });
}

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function kstDate() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function decodeHtml(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(s = "") {
  return decodeHtml(s)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attrs(tag) {
  const obj = {};
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(tag))) {
    obj[m[1].toLowerCase()] = decodeHtml(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return obj;
}

function parseForms(html, baseUrl) {
  const forms = [];
  const fre = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let fm;

  while ((fm = fre.exec(html))) {
    const fa = attrs(fm[1]);
    const inputs = [];
    const ire = /<input\b([^>]*)>/gi;
    let im;

    while ((im = ire.exec(fm[2]))) inputs.push(attrs(im[1]));

    let action = fa.action || baseUrl;
    try { action = new URL(action, baseUrl).toString(); } catch (_) {}

    forms.push({
      method: (fa.method || "GET").toUpperCase(),
      action,
      inputs
    });
  }

  return forms;
}

function pageDiagnostics(html = "", url = "") {
  const visibleText = stripHtml(html).slice(0, 1600);
  const forms = parseForms(html, url);
  return {
    title: (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim(),
    visibleText,
    forms: forms.map(f => ({
      method: f.method,
      action: (() => { try { const u = new URL(f.action); return u.origin + u.pathname; } catch (_) { return f.action; } })(),
      inputs: f.inputs.map(i => ({ name: i.name || null, type: i.type || "text", hasValue: Boolean(i.value) }))
    }))
  };
}

class CookieJar {
  constructor(items = []) {
    this.items = new Map();
    for (const c of items) {
      if (!c?.name || !c?.domain) continue;
      this.items.set(this.key(c), { ...c });
    }
  }

  key(c) {
    return `${c.domain}|${c.path || "/"}|${c.name}`;
  }

  dump() {
    return [...this.items.values()].map(c => ({ ...c }));
  }

  absorb(response, requestUrl) {
    const u = new URL(requestUrl);
    let lines = [];

    if (typeof response.headers.getSetCookie === "function") {
      lines = response.headers.getSetCookie();
    } else {
      const raw = response.headers.get("set-cookie");
      if (raw) lines = [raw];
    }

    for (const line of lines) {
      if (!line) continue;
      const parts = line.split(";").map(x => x.trim());
      const eq = parts[0].indexOf("=");
      if (eq <= 0) continue;

      const c = {
        name: parts[0].slice(0, eq),
        value: parts[0].slice(eq + 1),
        domain: u.hostname.toLowerCase(),
        path: "/",
        hostOnly: true,
        secure: false
      };

      let expired = false;
      for (const p of parts.slice(1)) {
        const j = p.indexOf("=");
        const k = (j >= 0 ? p.slice(0, j) : p).trim().toLowerCase();
        const v = j >= 0 ? p.slice(j + 1).trim() : "";

        if (k === "domain" && v) {
          c.domain = v.replace(/^\./, "").toLowerCase();
          c.hostOnly = false;
        } else if (k === "path" && v) {
          c.path = v;
        } else if (k === "secure") {
          c.secure = true;
        } else if (k === "max-age" && Number(v) <= 0) {
          expired = true;
        } else if (k === "expires") {
          const t = Date.parse(v);
          if (Number.isFinite(t) && t <= Date.now()) expired = true;
        }
      }

      const key = this.key(c);
      if (expired || c.value === "") this.items.delete(key);
      else this.items.set(key, c);
    }
  }

  header(url) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "/";
    const matched = [];

    for (const c of this.items.values()) {
      const domainOk = c.hostOnly
        ? host === c.domain
        : host === c.domain || host.endsWith("." + c.domain);
      const pathOk = path.startsWith(c.path || "/");
      const secureOk = !c.secure || u.protocol === "https:";
      if (domainOk && pathOk && secureOk) matched.push(c);
    }

    // Browser cookie ordering: longer Path first. This matters when the same
    // cookie name exists on multiple Keycloak paths.
    matched.sort((a, b) => (b.path || "/").length - (a.path || "/").length);
    return matched.map(c => `${c.name}=${c.value}`).join("; ");
  }

  namesFor(url) {
    const h = this.header(url);
    if (!h) return [];
    return h.split(/;\s*/).map(x => x.split("=")[0]).filter(Boolean);
  }
}

async function requestWithJar(jar, url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = jar.header(url);
  if (cookie) headers.set("cookie", cookie);
  headers.set("user-agent", UA);

  const r = await fetch(url, { ...init, headers, redirect: "manual" });
  jar.absorb(r, url);
  return r;
}

async function follow(jar, url, init = {}, max = 15) {
  let current = url;
  let method = init.method || "GET";
  let body = init.body;
  let headers = new Headers(init.headers || {});
  const hops = [];

  for (let i = 0; i < max; i++) {
    const r = await requestWithJar(jar, current, { method, body, headers });
    const location = r.headers.get("location");
    hops.push({ status: r.status, url: current, location: location || null });

    if (![301, 302, 303, 307, 308].includes(r.status) || !location) {
      return { response: r, url: current, hops };
    }

    const next = new URL(location, current).toString();
    if ([301, 302, 303].includes(r.status) && method !== "GET" && method !== "HEAD") {
      method = "GET";
      body = undefined;
      headers = new Headers();
    }
    current = next;
  }

  throw new Error("redirect limit exceeded");
}

function safeUrlSummary(value) {
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}${u.search ? "?" + [...u.searchParams.keys()].join("&") : ""}`;
  } catch (_) {
    return String(value || "");
  }
}

function setCookieNames(response) {
  let lines = [];
  if (typeof response.headers.getSetCookie === "function") {
    lines = response.headers.getSetCookie();
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) lines = [raw];
  }
  return lines.map(line => String(line).split("=", 1)[0]).filter(Boolean);
}

function browserNavHeaders(fromUrl, toUrl, method = "GET") {
  const h = new Headers();
  h.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
  h.set("accept-language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
  h.set("cache-control", "max-age=0");
  h.set("upgrade-insecure-requests", "1");
  h.set("sec-fetch-dest", "document");
  h.set("sec-fetch-mode", "navigate");
  h.set("sec-fetch-user", "?1");

  if (fromUrl) {
    h.set("referer", fromUrl);
    try {
      const a = new URL(fromUrl);
      const b = new URL(toUrl);
      if (a.origin === b.origin) h.set("sec-fetch-site", "same-origin");
      else if (a.hostname.endsWith(".coupang.com") && b.hostname.endsWith(".coupang.com")) h.set("sec-fetch-site", "same-site");
      else h.set("sec-fetch-site", "cross-site");
    } catch (_) {
      h.set("sec-fetch-site", "none");
    }
  } else {
    h.set("sec-fetch-site", "none");
  }

  if (method !== "GET" && method !== "HEAD") {
    try { h.set("origin", new URL(toUrl).origin); } catch (_) {}
  }
  return h;
}

async function followBrowserTrace(jar, url, init = {}, max = 15) {
  let current = url;
  let method = (init.method || "GET").toUpperCase();
  let body = init.body;
  let previous = init.referer || init.headers?.referer || null;
  let extra = new Headers(init.headers || {});
  const hops = [];

  for (let i = 0; i < max; i++) {
    const headers = browserNavHeaders(previous, current, method);
    for (const [k, v] of extra.entries()) headers.set(k, v);

    const r = await requestWithJar(jar, current, { method, body, headers });
    const location = r.headers.get("location");
    hops.push({
      status: r.status,
      url: safeUrlSummary(current),
      location: location ? safeUrlSummary(new URL(location, current).toString()) : null,
      setCookieNames: setCookieNames(r),
      cookieNames: jar.namesFor(current)
    });

    if (![301, 302, 303, 307, 308].includes(r.status) || !location) {
      return { response: r, url: current, hops, text: await r.text() };
    }

    const next = new URL(location, current).toString();
    previous = current;

    if ([301, 302, 303].includes(r.status) && method !== "GET" && method !== "HEAD") {
      method = "GET";
      body = undefined;
      extra = new Headers();
    }

    current = next;
  }

  throw new Error("redirect limit exceeded");
}

function chooseLoginForm(forms) {
  return forms.find(f => f.inputs.some(i => (i.type || "").toLowerCase() === "password")) || null;
}

function formBody(form, id, pw) {
  // Chrome에서 실제로 확인된 QuickFlex 최초 로그인 POST와 동일하게 보낸다.
  // submit 버튼 값(login 등)은 포함하지 않는다.
  const p = new URLSearchParams();
  const inputs = form?.inputs || [];

  const username = inputs.find(i => (i.name || "").toLowerCase() === "username");
  const password = inputs.find(i => (i.name || "").toLowerCase() === "password");
  const credentialId = inputs.find(i => (i.name || "").toLowerCase() === "credentialid");

  p.set(username?.name || "username", id);
  p.set(password?.name || "password", pw);
  p.set(credentialId?.name || "credentialId", credentialId?.value || "");

  return p;
}

function chooseMfaTypeForm(forms) {
  return forms.find(f => f.inputs.some(i => (i.name || "").toLowerCase() === "mfatype")) || null;
}

function mfaTypeBody(form) {
  const p = new URLSearchParams();
  let selected = null;

  for (const i of form.inputs) {
    if (!i.name) continue;
    const type = (i.type || "text").toLowerCase();
    const lname = i.name.toLowerCase();

    if (lname === "mfatype") {
      selected = i.value || "";
      p.set(i.name, selected);
    } else if (type === "hidden") {
      p.set(i.name, i.value || "");
    }
  }

  return { body: p, selected };
}



function controlDebugRows(form) {
  if (!form) return [];
  return (form.inputs || []).map(i => ({
    name: i.name || null,
    id: i.id || null,
    type: i.type || "text",
    value: i.value ?? null,
    onclick: i.onclick || null,
    onchange: i.onchange || null,
    formaction: i.formaction || null,
    class: i.class || null,
    dataAction: i["data-action"] || i["data-action-type"] || i["data-realaactiontype"] || null
  }));
}

function buttonDebugRows(html = "") {
  const rows = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = re.exec(html)) && rows.length < 20) {
    const a = attrs(m[1]);
    rows.push({
      name: a.name || null,
      id: a.id || null,
      type: a.type || "submit",
      value: a.value ?? null,
      onclick: a.onclick || null,
      class: a.class || null,
      text: stripHtml(m[2]).slice(0, 180)
    });
  }
  return rows;
}

function relevantScriptSnippets(html = "") {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;

  while ((m = re.exec(html)) && out.length < 20) {
    const tagAttrs = attrs(m[1] || "");
    const body = m[2] || "";
    const src = tagAttrs.src || null;

    if (src) {
      out.push({ kind: "external", src });
      continue;
    }

    if (!/(doSubmit|doReSend|resetLogin|realActionType|\brat\b|mfa-submit|actionType|auth-mfa-code)/i.test(body)) continue;

    const clean = body.replace(/\r/g, "").trim();
    out.push({
      kind: "inline",
      body: clean.slice(0, 12000),
      truncated: clean.length > 12000
    });
  }

  return out;
}

function findFunctionBodies(html = "") {
  const scripts = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) scripts.push(m[1] || "");
  const all = scripts.join("\n");
  const names = ["doSubmit", "doReSend", "resetLogin"];
  const found = {};

  for (const name of names) {
    const start = all.search(new RegExp(`function\\s+${name}\\s*\\(`));
    if (start < 0) {
      found[name] = null;
      continue;
    }

    const brace = all.indexOf("{", start);
    if (brace < 0) {
      found[name] = all.slice(start, start + 2500);
      continue;
    }

    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = -1;

    for (let i = brace; i < all.length; i++) {
      const ch = all[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    found[name] = all.slice(start, end > 0 ? end : start + 4000);
  }

  return found;
}

function relevantMarkupSnippets(html = "") {
  const out = [];
  for (const term of ["realActionType", "actionType"]) {
    let pos = 0;
    while (out.length < 12) {
      const i = html.indexOf(term, pos);
      if (i < 0) break;
      const snippet = html.slice(Math.max(0, i - 350), Math.min(html.length, i + 650))
        .replace(/\s+/g, " ")
        .trim();
      if (snippet && !out.includes(snippet)) out.push(snippet);
      pos = i + term.length;
    }
  }
  return out;
}

function chooseOtpForm(forms) {
  return forms.find(f => f.inputs.some(i => (i.name || "").toLowerCase() === "code")) || null;
}

function otpBody(form, code) {
  const p = new URLSearchParams();

  // QuickFlex 실제 페이지의 doSubmit() 원문:
  //   rat.value = "Submit";
  //   document.forms["mfa-form"].submit();
  // form.submit()은 submitter(actionType) 값을 포함하지 않으므로
  // 실제 JS 동작 그대로 code + realActionType만 보낸다.
  p.set("code", code);
  p.set("realActionType", "Submit");

  return p;
}

async function supabaseGetState(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");

  const r = await fetch(`${SUPABASE_URL}/rest/v1/meta_backend_state?id=eq.1&select=cookie_bundle,status,last_success_at,last_http_status`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });

  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const rows = await r.json();
  return rows?.[0] || null;
}

function jarFromFlyBundle(bundle) {
  const items = [];
  for (const part of String(bundle || "").split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    items.push({
      name: part.slice(0, eq),
      value: part.slice(eq + 1),
      domain: "fly.coupang.com",
      path: "/",
      hostOnly: true,
      secure: true
    });
  }
  return new CookieJar(items);
}

async function supabasePatch(env, patch) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");

  const r = await fetch(`${SUPABASE_URL}/rest/v1/meta_backend_state?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal"
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });

  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

function bytesToB64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function stateCryptoKey(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  const seed = new TextEncoder().encode(`maroowell-meta-mfa-state-v1:${env.SUPABASE_SERVICE_ROLE_KEY}`);
  const digest = await crypto.subtle.digest("SHA-256", seed);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function sealState(env, obj) {
  const key = await stateCryptoKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return `${bytesToB64Url(iv)}.${bytesToB64Url(enc)}`;
}

async function openState(env, token) {
  const [a, b] = String(token || "").split(".");
  if (!a || !b) throw new Error("MFA 상태 토큰 형식 오류");
  const key = await stateCryptoKey(env);
  const iv = b64UrlToBytes(a);
  const enc = b64UrlToBytes(b);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, enc);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function credentialSubmit(env, jar) {
  if (!env.META_ID || !env.META_PW) throw new Error("META_ID 또는 META_PW 없음");

  const first = await follow(jar, AUTH_START);
  const firstHtml = await first.response.text();
  const loginForm = chooseLoginForm(parseForms(firstHtml, first.url));
  if (!loginForm) throw new Error("로그인 form을 찾지 못함");

  const loginBody = formBody(loginForm, env.META_ID, env.META_PW);

  // 최초 ID/PW submit도 일반 fetch가 아니라 실제 document navigation에 가깝게 보낸다.
  const next = await followBrowserTrace(jar, loginForm.action, {
    method: loginForm.method === "GET" ? "GET" : "POST",
    referer: first.url,
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: loginForm.method === "GET" ? undefined : loginBody.toString()
  });

  return {
    response: next.response,
    url: next.url,
    html: next.text,
    loginTrace: next.hops,
    loginFields: [...loginBody.keys()]
  };
}

async function sendMfaCode(env) {
  const jar = new CookieJar();
  const cred = await credentialSubmit(env, jar);
  const mfaForm = chooseMfaTypeForm(parseForms(cred.html, cred.url));

  if (!mfaForm) {
    return {
      ok: false,
      status: cred.response.status,
      url: cred.url,
      diagnostics: pageDiagnostics(cred.html, cred.url)
    };
  }

  const choice = mfaTypeBody(mfaForm);
  const next = await follow(jar, mfaForm.action, {
    method: mfaForm.method === "GET" ? "GET" : "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: new URL(mfaForm.action).origin,
      referer: cred.url
    },
    body: mfaForm.method === "GET" ? undefined : choice.body.toString()
  });

  const html = await next.response.text();
  const otpForm = chooseOtpForm(parseForms(html, next.url));

  if (!otpForm) {
    return {
      ok: false,
      selected: choice.selected,
      status: next.response.status,
      url: next.url,
      diagnostics: pageDiagnostics(html, next.url)
    };
  }

  return {
    ok: true,
    selected: choice.selected,
    jar,
    otpForm,
    otpHtml: html,
    referer: next.url,
    diagnostics: pageDiagnostics(html, next.url)
  };
}

async function queryMeta(jar) {
  const payload = {
    campCodes: ["S604", "S656", "S602", "CL01A", "CL18", "M045"],
    page: 0,
    size: 50,
    sortDirection: "ASC",
    sortType: "DELIVERY_COMPLETED_RATIO",
    waveCode: "WAVE2",
    workDate: kstDate()
  };

  const r = await requestWithJar(jar, META_SEARCH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "accept-language": "ko-KR",
      "content-type": "application/json;charset=UTF-8",
      origin: "https://fly.coupang.com",
      referer: FLY_REALTIME,
      "x-coupang-accept-language": "ko-KR",
      "x-requested-with": "XMLHttpRequest"
    },
    body: JSON.stringify(payload)
  });

  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}

  const success = r.status === 200 && (json?.message === "SUCCESS" || Array.isArray(json?.data?.content));
  return { response: r, text, json, success };
}

function otpPage(masked, token) {
  return page(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>META 2단계 인증</title>
<style>
body{font-family:Arial,sans-serif;background:#f5f6f8;margin:0;padding:40px 18px;color:#111}
.card{max-width:460px;margin:0 auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 10px}.sub{color:#555;line-height:1.55;margin-bottom:22px}
input{width:100%;box-sizing:border-box;font-size:26px;letter-spacing:8px;text-align:center;padding:14px;border:1px solid #ccc;border-radius:12px}
button{width:100%;margin-top:14px;border:0;border-radius:12px;padding:15px;font-size:16px;font-weight:700;background:#111;color:#fff;cursor:pointer}
.note{font-size:13px;color:#777;margin-top:14px;line-height:1.5}
</style>
</head>
<body>
<div class="card">
<h1>META 문자 인증</h1>
<div class="sub">${esc(masked || "등록된 휴대폰")}으로 새 인증번호가 발송됐음.<br>방금 받은 <b>최신 6자리 코드</b> 입력하면 됨.</div>
<form method="post" action="/login-submit-code" autocomplete="off">
<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus placeholder="000000">
<input type="hidden" name="state" value="${esc(token)}">
<button type="submit">인증하고 META 접속 테스트</button>
</form>
<div class="note">이 페이지를 새로고침하면 안 됨. 코드가 만료되면 /login-send-code 를 다시 열면 새 코드가 발송됨.</div>
</div>
</body>
</html>`);
}

async function loginSendCode(env) {
  const mfa = await sendMfaCode(env);
  if (!mfa.ok) return out({ ok: false, stage: "mfa-send", ...mfa }, 422);

  const state = {
    v: 1,
    createdAt: Date.now(),
    cookies: mfa.jar.dump(),
    otpForm: mfa.otpForm,
    otpHtml: mfa.otpHtml || "",
    referer: mfa.referer
  };

  const token = await sealState(env, state);
  return otpPage(mfa.selected, token);
}

async function loginSubmitCode(request, env) {
  const fd = await request.formData();
  const code = String(fd.get("code") || "").trim();
  const token = String(fd.get("state") || "");

  if (!/^\d{6}$/.test(code)) {
    return page("<h2>인증번호는 숫자 6자리여야 함.</h2><p><a href='/login-send-code'>새 코드 다시 받기</a></p>", 400);
  }

  let state;
  try {
    state = await openState(env, token);
  } catch (e) {
    return page(`<h2>MFA 상태 복원 실패</h2><pre>${esc(e.message)}</pre><p><a href='/login-send-code'>처음부터 다시 시도</a></p>`, 400);
  }

  if (!state.createdAt || Date.now() - state.createdAt > 10 * 60 * 1000) {
    return page("<h2>인증 세션이 만료됐음.</h2><p><a href='/login-send-code'>새 코드 다시 받기</a></p>", 410);
  }

  const jar = new CookieJar(state.cookies || []);
  const form = state.otpForm;
  if (!form?.action) throw new Error("저장된 OTP form 없음");

  const otpPayload = otpBody(form, code);
  const verify = await followBrowserTrace(jar, form.action, {
    method: form.method === "GET" ? "GET" : "POST",
    referer: state.referer || form.action,
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.method === "GET" ? undefined : otpPayload.toString()
  });

  const verifyHtml = verify.text;
  const verifyDiag = pageDiagnostics(verifyHtml, verify.url);
  const otpControlValues = form.inputs
    .filter(i => ["realactiontype", "actiontype", "mfatype"].includes((i.name || "").toLowerCase()))
    .map(i => ({ name: i.name, type: i.type || "text", value: i.value || "" }));

  const meta = await queryMeta(jar);

  if (!meta.success) {
    const stillOtp = Boolean(chooseOtpForm(parseForms(verifyHtml, verify.url)));
    return page(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>META 인증 실패</title>
<body style="font-family:Arial;padding:30px">
<h2>아직 META 로그인 완료가 안 됨</h2>
<p>OTP 화면 남아있음: <b>${stillOtp ? "YES" : "NO"}</b></p>
<p>인증 후 최종 URL: <code>${esc(verify.url)}</code></p>
<p>페이지 제목: <b>${esc(verifyDiag.title)}</b></p>
<p>META HTTP: <b>${meta.response.status}</b></p>
<h3>실제 Worker OTP POST</h3>
<pre style="white-space:pre-wrap">${esc(JSON.stringify({
  fields: [...otpPayload.keys()],
  realActionType: otpPayload.get("realActionType"),
  actionTypeIncluded: otpPayload.has("actionType")
}, null, 2))}</pre>
<h3>원본 OTP 폼 필드</h3>
<pre style="white-space:pre-wrap">${esc(JSON.stringify(otpControlValues, null, 2))}</pre>
<h3>인증 Redirect Trace</h3>
<pre style="white-space:pre-wrap">${esc(JSON.stringify(verify.hops, null, 2))}</pre>
<h3>최종 인증 페이지</h3>
<pre style="white-space:pre-wrap">${esc(verifyDiag.visibleText || meta.text.slice(0, 800))}</pre>
<p><a href="/login-send-code">새 코드로 다시 시도</a></p>
</body></html>`, 422);
  }

  const cookieBundle = jar.header(FLY_REALTIME);
  await supabasePatch(env, {
    cookie_bundle: cookieBundle,
    status: "active",
    last_success_at: new Date().toISOString(),
    last_http_status: 200,
    last_error: null
  });

  const names = jar.namesFor(FLY_REALTIME);
  return page(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>META 성공</title>
<body style="font-family:Arial;background:#f5f6f8;padding:40px 18px">
<div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 8px 30px rgba(0,0,0,.08)">
<h1 style="margin-top:0">✅ 자동 로그인 + 문자 인증 + META 조회 성공</h1>
<p><b>META HTTP:</b> 200</p>
<p><b>message:</b> ${esc(meta.json?.message || "SUCCESS")}</p>
<p><b>DB 저장:</b> meta_backend_state.cookie_bundle 갱신 완료</p>
<p><b>FLY 쿠키:</b> ${esc(names.join(", "))}</p>
<p>이제 DB에 저장된 새 세션으로 서버 수집을 계속 테스트하면 됨.</p>
<p><a href="/test-db">DB 쿠키만으로 META 재조회 테스트</a></p>
</div></body></html>`);
}

async function testDb(env) {
  const state = await supabaseGetState(env);
  if (!state?.cookie_bundle) {
    return out({ ok: false, stage: "db-cookie", error: "DB cookie_bundle 비어 있음" }, 422);
  }

  const jar = jarFromFlyBundle(state.cookie_bundle);
  const meta = await queryMeta(jar);

  await supabasePatch(env, meta.success ? {
    status: "active",
    last_success_at: new Date().toISOString(),
    last_http_status: 200,
    last_error: null
  } : {
    status: "expired",
    last_http_status: meta.response.status,
    last_error: `DB cookie META ${meta.response.status}: ${meta.text.slice(0, 250)}`
  });

  return out({
    ok: meta.success,
    stage: "db-cookie-meta-query",
    dbStatus: state.status,
    metaHttpStatus: meta.response.status,
    metaMessage: meta.json?.message || null,
    flyCookieCount: jar.namesFor(FLY_REALTIME).length,
    flyCookieNames: jar.namesFor(FLY_REALTIME),
    preview: meta.success ? null : meta.text.slice(0, 500)
  }, meta.success ? 200 : 422);
}



async function loginOtpInspect(env) {
  const mfa = await sendMfaCode(env);
  if (!mfa.ok) return out({ ok: false, stage: "mfa-send", ...mfa }, 422);

  const form = mfa.otpForm;
  return out({
    ok: true,
    stage: "otp-form-inspect",
    note: "문자 발송까지 완료. 이 endpoint는 OTP를 제출하지 않음.",
    selectedMfaType: mfa.selected || null,
    formMethod: form?.method || null,
    formAction: form?.action ? safeUrlSummary(form.action) : null,
    controls: controlDebugRows(form),
    buttons: buttonDebugRows(mfa.otpHtml || ""),
    scriptSnippets: relevantScriptSnippets(mfa.otpHtml || ""),
    functionBodies: findFunctionBodies(mfa.otpHtml || ""),
    markupSnippets: relevantMarkupSnippets(mfa.otpHtml || ""),
    visibleText: mfa.diagnostics?.visibleText || null
  });
}

async function loginStep2(env) {
  const mfa = await sendMfaCode(env);
  if (!mfa.ok) return out({ ok: false, stage: "mfa-send", ...mfa }, 422);
  return out({
    ok: true,
    stage: "sms-sent",
    selectedMfaType: mfa.selected,
    title: mfa.diagnostics.title,
    visibleText: mfa.diagnostics.visibleText,
    next: "/login-send-code"
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/login-send-code" && request.method === "GET") {
        return await loginSendCode(env);
      }

      if (path === "/login-submit-code" && request.method === "POST") {
        return await loginSubmitCode(request, env);
      }

      if (path === "/login-otp-inspect") {
        return await loginOtpInspect(env);
      }

      if (path === "/login-step2") {
        return await loginStep2(env);
      }

      if (path === "/test-db") {
        return await testDb(env);
      }

      return out({
        ok: true,
        message: "META auto-login POC v11",
        flow: [
          "0. Chrome 실측 반영: 로그인=username/password/credentialId, OTP=code+realActionType=Submit",
          "1. GET /login-send-code",
          "2. 최신 SMS 6자리 입력",
          "3. POST /login-submit-code",
          "4. META 200이면 Supabase cookie_bundle 자동 갱신",
          "5. GET /test-db 로 DB 쿠키 단독 재조회 확인"
        ]
      });
    } catch (e) {
      return out({ ok: false, error: String(e?.message || e) }, 500);
    }
  }
};
