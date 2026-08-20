// MarooWell Frontend Config
// Frontend에는 Supabase publishable key만 둡니다. service_role/secret key는 절대 노출하지 않습니다.

window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: ["sb_publishable_", "FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H"].join(""),
  ADMIN_API_BASE: "https://admin-access.maroowell.com",
  CLEANSING_HISTORY_API_BASE: "https://cleansinghistory.maroowell.com",

  PATHS: {
    login: "/",
    index: "/zipcode_search",
    route: "/coupangRouteMap.html",
    dragon_car_index: "/dragon_car_index.html",
    maroowell_info: "/maroowell_info.html",
  }
};

// 공통 네트워크 최적화
// 1) 프레시백 대량 업로드를 Worker의 행 단위 INSERT 대신 PostgREST bulk upsert 1회로 전환
// 2) 정산 통계 조회는 기간 조건을 DB에 직접 전달하고 페이지네이션하여 전체 테이블 스캔 방지
// 3) 권한 RPC의 짧은 중복 호출을 같은 탭에서 합쳐 DB/RLS 반복 부하 완화
(() => {
  if (window.__MW_FETCH_OPTIMIZER_INSTALLED__) return;
  if (typeof window.fetch !== "function") return;

  window.__MW_FETCH_OPTIMIZER_INSTALLED__ = true;

  const cfg = window.MARUWELL_CONFIG || {};
  const supabaseBase = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(cfg.SUPABASE_ANON_KEY || "");
  if (!supabaseBase || !publishableKey) return;

  const nativeFetch = window.fetch.bind(window);
  const supabaseOrigin = new URL(supabaseBase).origin;
  const responseCache = new Map();
  const inflight = new Map();
  const CACHE_TTL_MS = 20_000;

  function toUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, location.href);
      if (input instanceof URL) return input;
      if (input && typeof input.url === "string") return new URL(input.url, location.href);
    } catch {}
    return null;
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function requestHeaders(input, init) {
    const headers = new Headers(input?.headers || undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    return headers;
  }

  function jsonBody(init) {
    if (!init || typeof init.body !== "string" || !init.body) return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  function responseErrorText(text, fallback) {
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return String(parsed?.message || parsed?.error || parsed?.details || parsed?.hint || fallback);
    } catch {
      return String(text).slice(0, 1000) || fallback;
    }
  }

  function isCacheableAccessRequest(url, method) {
    if (!url || url.origin !== supabaseOrigin) return false;
    if (method === "POST") {
      return url.pathname === "/rest/v1/rpc/mw_my_access" ||
        url.pathname === "/rest/v1/rpc/mw_my_account_state";
    }
    if (method === "GET" && url.pathname === "/rest/v1/cleansing_history_access") {
      return url.searchParams.get("select") === "can_select";
    }
    return false;
  }

  async function cachedFetch(input, init, url, method, headers) {
    const auth = headers.get("Authorization") || "";
    const body = typeof init?.body === "string" ? init.body : "";
    const key = `${method}|${url.href}|${auth}|${body}`;
    const now = Date.now();
    const hit = responseCache.get(key);

    if (hit && hit.expiresAt > now) {
      return new Response(hit.body, {
        status: hit.status,
        statusText: hit.statusText,
        headers: hit.headers
      });
    }

    if (hit) responseCache.delete(key);
    if (inflight.has(key)) {
      const saved = await inflight.get(key);
      return new Response(saved.body, {
        status: saved.status,
        statusText: saved.statusText,
        headers: saved.headers
      });
    }

    const task = (async () => {
      const res = await nativeFetch(input, init);
      const clone = res.clone();
      const bodyText = await clone.text();
      const saved = {
        body: bodyText,
        status: res.status,
        statusText: res.statusText,
        headers: Array.from(res.headers.entries()),
        expiresAt: Date.now() + CACHE_TTL_MS
      };
      if (res.ok) responseCache.set(key, saved);
      return saved;
    })();

    inflight.set(key, task);
    try {
      const saved = await task;
      return new Response(saved.body, {
        status: saved.status,
        statusText: saved.statusText,
        headers: saved.headers
      });
    } finally {
      inflight.delete(key);
    }
  }

  async function directFreshbagBulkUpsert(input, init, headers) {
    const payload = jsonBody(init);
    const rows = Array.isArray(payload?.rows) ? payload.rows : null;
    if (!rows) return nativeFetch(input, init);
    if (!rows.length) return jsonResponse({ ok: true, upserted: 0, mode: "supabase-bulk" });
    if (rows.length > 2000) {
      return jsonResponse({ ok: false, error: "한 번에 업로드 가능한 최대 행 수는 2,000건입니다." }, 413);
    }

    const auth = headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/i.test(auth)) {
      return jsonResponse({ ok: false, error: "로그인 세션이 필요합니다." }, 401);
    }

    const url = new URL(`${supabaseBase}/rest/v1/coupang_freshbag`);
    url.searchParams.set("on_conflict", "data_year,month_no,wave,camp,route_norm");

    const res = await nativeFetch(url.href, {
      method: "POST",
      headers: {
        "apikey": publishableKey,
        "Authorization": auth,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(rows),
      cache: "no-store"
    });

    const text = await res.text();
    if (!res.ok) {
      return jsonResponse({
        ok: false,
        error: responseErrorText(text, `Supabase bulk upsert 실패 (HTTP ${res.status})`)
      }, res.status);
    }

    return jsonResponse({ ok: true, upserted: rows.length, mode: "supabase-bulk" });
  }

  async function directAccountQuery(input, init, headers) {
    const payload = jsonBody(init) || {};
    const period = payload.period || {};
    const auth = headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/i.test(auth)) {
      return jsonResponse({ ok: false, error: "로그인 세션이 필요합니다." }, 401);
    }

    const year = Number(period.year || 0);
    const startMonth = Number(period.startMonth || 0);
    const endMonth = Number(period.endMonth || 0);
    const pageSize = 1000;
    const maxRows = 50000;
    const rows = [];

    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const url = new URL(`${supabaseBase}/rest/v1/maroowell_account`);
      url.searchParams.set("select", "*");
      if (Number.isInteger(year) && year > 0) url.searchParams.set("date_year", `eq.${year}`);
      if (Number.isInteger(startMonth) && startMonth >= 1 && startMonth <= 12) {
        url.searchParams.set("date_month", `gte.${startMonth}`);
      }
      if (Number.isInteger(endMonth) && endMonth >= 1 && endMonth <= 12) {
        url.searchParams.set("date_month", `lte.${endMonth}`);
      }
      url.searchParams.set("order", "delivery_date.asc.nullslast,camp.asc.nullslast,route.asc.nullslast");
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(offset));

      const res = await nativeFetch(url.href, {
        method: "GET",
        headers: {
          "apikey": publishableKey,
          "Authorization": auth,
          "Accept": "application/json"
        },
        cache: "no-store"
      });

      const text = await res.text();
      if (!res.ok) {
        return jsonResponse({
          ok: false,
          error: responseErrorText(text, `정산 직접 조회 실패 (HTTP ${res.status})`)
        }, res.status);
      }

      let batch = [];
      try { batch = JSON.parse(text); } catch {}
      if (!Array.isArray(batch)) {
        return jsonResponse({ ok: false, error: "정산 조회 응답 형식이 올바르지 않습니다." }, 502);
      }

      rows.push(...batch);
      if (batch.length < pageSize) {
        return jsonResponse({ ok: true, rows, mode: "supabase-filtered" });
      }
    }

    return jsonResponse({
      ok: false,
      error: "조회 결과가 50,000행을 초과했습니다. 연도/월 범위를 좁혀서 조회하세요."
    }, 413);
  }

  window.fetch = async function mwOptimizedFetch(input, init) {
    const url = toUrl(input);
    const method = requestMethod(input, init);
    const headers = requestHeaders(input, init);

    if (url && method === "POST" && url.origin !== supabaseOrigin && url.pathname.endsWith("/freshbag/upsert")) {
      return directFreshbagBulkUpsert(input, init, headers);
    }

    if (url && method === "POST" && url.origin !== supabaseOrigin && url.pathname.endsWith("/account/query")) {
      return directAccountQuery(input, init, headers);
    }

    if (isCacheableAccessRequest(url, method)) {
      return cachedFetch(input, init, url, method, headers);
    }

    return nativeFetch(input, init);
  };
})();

// Android 앱의 날짜 상세에서 /maroowell_route_info?camp=...&route=... 로 들어오면
// 기존 카카오 라우트정보 화면의 검색칸을 채우고 초기화가 끝난 뒤 자동 조회합니다.
window.addEventListener("DOMContentLoaded", () => {
  const path = String(location.pathname || "").replace(/\.html$/i, "").replace(/\/$/, "");
  if (path !== "/maroowell_route_info") return;

  const params = new URLSearchParams(location.search);
  const camp = String(params.get("camp") || "").trim();
  const route = String(params.get("route") || "").trim();
  if (!camp) return;

  const campInput = document.getElementById("campInput");
  const routeInput = document.getElementById("routeSearchInput");
  const loadBtn = document.getElementById("loadBtn");
  if (!campInput || !routeInput || !loadBtn) return;

  campInput.value = camp;
  routeInput.value = route;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const status = document.getElementById("statusText")?.textContent || "";
    const ready = status.includes("Camp") && status.includes("Route") && status.includes("조회");
    if (ready) {
      clearInterval(timer);
      loadBtn.click();
      return;
    }
    if (attempts >= 50) clearInterval(timer);
  }, 200);
});
