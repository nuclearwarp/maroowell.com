(() => {
  "use strict";
  if (window.__MW_META_BRIDGE_HOOK_V1__) return;
  window.__MW_META_BRIDGE_HOOK_V1__ = true;

  const SEARCH_URL = "/realtime-dashboard/workers/work-status/search";
  const SOURCE_COMMAND = "maroowell-meta-relay";
  const SOURCE_RESULT = "maroowell-meta-hook";
  const context = { vendorCodes: [], camps: [] };
  let searchTemplate = null;
  let sessionHeaders = {};

  function post(id, ok, result, error) {
    window.postMessage({ source: SOURCE_RESULT, version: 1, id, ok, result, error }, location.origin);
  }

  function headersObject(source) {
    const out = {};
    try {
      const headers = new Headers(source || {});
      headers.forEach((value, key) => { out[key] = value; });
    } catch (_) {}
    return out;
  }

  function rememberSessionHeaders(source) {
    const next = headersObject(source);
    for (const [key, value] of Object.entries(next)) {
      const lower = String(key).toLowerCase();
      if (["content-length", "cookie", "host", "origin", "referer"].includes(lower)) continue;
      if (lower.startsWith("sec-")) continue;
      sessionHeaders[key] = value;
    }
  }

  function contextKind(url) {
    const value = String(url || "");
    if (/my-vendor(?:\?|$)/.test(value)) return "vendor";
    if (/\/camps(?:\?|$)/.test(value)) return "camps";
    return "";
  }

  function normalizeContext(kind, payload) {
    const json = typeof payload === "string" ? JSON.parse(payload) : payload;
    const data = json?.data ?? json;
    if (kind === "vendor") {
      const codes = data?.contractedCampCodes || data?.campCodes;
      if (Array.isArray(codes)) context.vendorCodes = [...new Set(codes.map(v => String(v || "").trim()).filter(Boolean))];
      return;
    }
    const rows = Array.isArray(data) ? data : (data?.content || data?.camps || data?.items || data?.results || json?.content || json?.camps);
    if (!Array.isArray(rows)) return;
    context.camps = rows.map(row => {
      const code = String(row?.code || row?.campCode || row?.workplaceCode || "").trim();
      const name = String(row?.name || row?.campName || row?.workplaceName || row?.displayName || "").trim();
      return code ? { code, name, workplaceType: String(row?.workplaceType || "").trim() } : null;
    }).filter(Boolean);
  }

  function deliverContext(url, payload) {
    const kind = contextKind(url);
    if (!kind) return;
    try { normalizeContext(kind, payload); } catch (_) {}
  }

  function rememberTemplate(url, method, headers, body) {
    if (String(url || "").indexOf(SEARCH_URL) < 0 || !body) return;
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      if (!parsed || typeof parsed !== "object") return;
      searchTemplate = {
        url: String(url || SEARCH_URL),
        method: String(method || "POST"),
        headers: headersObject(headers),
        body: parsed
      };
    } catch (_) {}
  }

  async function rememberFetchTemplate(input, init, url) {
    try {
      const method = init?.method || input?.method || "POST";
      const headers = init?.headers || input?.headers || {};
      let body = init?.body;
      if (!body && input && typeof input.clone === "function") body = await input.clone().text();
      rememberTemplate(url, method, headers, body);
    } catch (_) {}
  }

  function installHooks() {
    const originalFetch = window.fetch;
    if (originalFetch && !window.__MW_META_ORIGINAL_FETCH__) {
      window.__MW_META_ORIGINAL_FETCH__ = originalFetch.bind(window);
      window.fetch = async function(input, init = {}) {
        const url = typeof input === "string" ? input : String(input?.url || "");
        const requestHeaders = init?.headers || input?.headers || {};
        if (contextKind(url) || url.includes(SEARCH_URL)) rememberSessionHeaders(requestHeaders);
        if (url.includes(SEARCH_URL)) rememberFetchTemplate(input, init, url).catch(() => {});
        const response = await window.__MW_META_ORIGINAL_FETCH__(input, init);
        if (contextKind(url)) {
          try { response.clone().text().then(text => deliverContext(url, text)).catch(() => {}); } catch (_) {}
        }
        return response;
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR?.prototype && !XHR.prototype.__MW_META_PATCHED__) {
      XHR.prototype.__MW_META_PATCHED__ = true;
      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;
      const originalSetRequestHeader = XHR.prototype.setRequestHeader;
      XHR.prototype.open = function(method, url) {
        this.__mwUrl = String(url || "");
        this.__mwMethod = String(method || "POST");
        this.__mwHeaders = {};
        return originalOpen.apply(this, arguments);
      };
      XHR.prototype.setRequestHeader = function(name, value) {
        try { this.__mwHeaders[String(name)] = String(value); } catch (_) {}
        return originalSetRequestHeader.apply(this, arguments);
      };
      XHR.prototype.send = function(body) {
        if (contextKind(this.__mwUrl) || String(this.__mwUrl || "").includes(SEARCH_URL)) rememberSessionHeaders(this.__mwHeaders);
        if (String(this.__mwUrl || "").includes(SEARCH_URL)) rememberTemplate(this.__mwUrl, this.__mwMethod, this.__mwHeaders, body);
        this.addEventListener("load", function() {
          try { if (contextKind(this.__mwUrl) && typeof this.responseText === "string") deliverContext(this.__mwUrl, this.responseText); } catch (_) {}
        });
        return originalSend.apply(this, arguments);
      };
    }
  }

  function requestBody(templateBody, payload, page) {
    const base = JSON.parse(JSON.stringify(templateBody || {}));
    const wanted = JSON.parse(JSON.stringify(payload || {}));
    for (const [key, value] of Object.entries(wanted)) {
      if (value === null) delete base[key];
      else base[key] = value;
    }
    base.page = page;
    return base;
  }

  async function search(payload) {
    const originalFetch = window.__MW_META_ORIGINAL_FETCH__ || window.fetch?.bind(window);
    if (!originalFetch) throw new Error("META 조회 기능을 초기화하지 못했습니다. META 화면을 새로고침해 주세요.");
    const fallbackHeaders = Object.assign({}, sessionHeaders, {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      "X-Coupang-Accept-Language": "ko-KR",
      "X-Requested-With": "XMLHttpRequest"
    });
    const template = searchTemplate || { url: SEARCH_URL, method: "POST", headers: fallbackHeaders, body: {} };

    async function postPage(page) {
      const response = await originalFetch(template.url || SEARCH_URL, {
        method: template.method || "POST",
        credentials: "include",
        headers: template.headers && Object.keys(template.headers).length ? template.headers : fallbackHeaders,
        body: JSON.stringify(requestBody(template.body, payload, page))
      });
      const text = await response.text();
      if (response.status === 401 || response.status === 403) throw new Error(`META 로그인 세션이 만료되었습니다. (HTTP ${response.status})`);
      if (!response.ok) throw new Error(`META 조회 실패 (HTTP ${response.status}) ${text.slice(0, 120)}`);
      return JSON.parse(text);
    }

    const first = await postPage(0);
    const merged = Array.isArray(first?.data?.content) ? first.data.content.slice() : [];
    const pages = Math.min(Math.max(Number(first?.data?.totalPages || 1), 1), 50);
    for (let page = 1; page < pages; page++) {
      const next = await postPage(page);
      const rows = Array.isArray(next?.data?.content) ? next.data.content : [];
      merged.push(...rows);
    }
    first.data = first.data || {};
    first.data.content = merged;
    first.data.number = 0;
    first.data.size = merged.length;
    first.data.totalElements = merged.length;
    first.data.totalPages = 1;
    return first;
  }

  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data || {};
    if (msg.source !== SOURCE_COMMAND || !msg.id) return;
    try {
      if (msg.action === "status") {
        post(msg.id, true, {
          hookReady: true,
          pageUrl: location.href,
          context: {
            vendorCodes: context.vendorCodes.slice(),
            camps: context.camps.map(row => ({ code: row.code, name: row.name, workplaceType: row.workplaceType }))
          }
        });
        return;
      }
      if (msg.action === "search") {
        const result = await search(msg.payload || {});
        post(msg.id, true, result);
        return;
      }
      throw new Error("지원하지 않는 META 브리지 요청입니다.");
    } catch (error) {
      post(msg.id, false, null, String(error?.message || error));
    }
  });

  installHooks();
})();
