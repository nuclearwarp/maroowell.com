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
    lines = response.headers.getSetCookie ();
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) lines = [raw];
  }
  return lines.map(line=>String(line).split("=",1)[0]).filter(Boolean);
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

    const next = new URL