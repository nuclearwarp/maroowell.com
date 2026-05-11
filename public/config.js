// MarooWell Frontend Config
// ✅ 여기에 Supabase Project URL / Anon(public) Key만 넣으세요.
// ⚠️ service_role key(비공개/서버용)는 절대 넣으면 안 됩니다.

window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H",
  ADMIN_API_BASE: "https://admin-access.maroowell.com",
  SCHEDULE_API_BASE: "https://schedule.maroowell.com",

  PATHS: {
    login: "/login.html",
    index: "/index.html",
    route: "/coupangRouteMap.html",
    dragon_car_index: "/dragon_car_index.html",
    maroowell_info: "/maroowell_info.html",
    dragon_car_pay: "/dragon_car_pay.html",
    maroowell_payout: "/maroowell_payout",
    maroowell_route: "/maroowell_route",
    admin_access: "/admin_access.html"
  }
};

// MetaAdmin 엑셀 생성 시, 현재 캠프 소속 여부와 무관하게 이름 기준 아이디를 최대한 보정한다.
// maroowell_schedule 본문 파일을 크게 건드리지 않고, XLSX 저장 직전에 빈 "아이디" 셀만 채운다.
(function setupMetaadminExcelIdPatch(){
  "use strict";

  if (!/\/maroowell_schedule(?:\.html)?$/i.test(location.pathname || "")) return;
  if (window.__MW_METAADMIN_EXCEL_ID_PATCH__) return;
  window.__MW_METAADMIN_EXCEL_ID_PATCH__ = true;

  const CONFIG = window.MARUWELL_CONFIG || {};
  const SCHEDULE_API_BASE = String(CONFIG.SCHEDULE_API_BASE || "https://schedule.maroowell.com").replace(/\/+$/, "");
  const idMap = new Map();

  const NAME_KEYS = ["name", "driver_name", "display_name", "real_name", "full_name", "employee_name", "courier_name", "user_name", "worker_name", "user_nm", "driverNm", "이름"];
  const ID_KEYS = ["login_id", "metaadmin_id", "meta_admin_id", "driver_login_id", "driver_id", "coupang_id", "coupang_login_id", "mb_id", "account_id", "user_login", "username", "login", "아이디"];
  const SUPABASE_LOOKUP_TABLES = ["driver_accounts", "drivers", "profiles", "coupang_accounts", "metaadmin_accounts", "user_profiles"];
  const SCHEDULE_LOOKUP_PATHS = [
    "/drivers?all=1&limit=10000",
    "/drivers?include_all=1&limit=10000",
    "/driver-accounts?all=1&limit=10000",
    "/accounts?all=1&limit=10000",
    "/metaadmin/accounts?all=1&limit=10000"
  ];

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function nameKey(v) {
    return clean(v).replace(/\s+/g, "");
  }

  function isObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function looksLikeLoginId(v) {
    const s = clean(v);
    if (!s) return false;
    if (s.length > 50) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
    if (/^\d{1,6}$/.test(s)) return false;
    return /[A-Za-z0-9]/.test(s);
  }

  function firstValue(row, keys, validator) {
    if (!isObject(row)) return "";
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const value = clean(row[key]);
      if (!value) continue;
      if (validator && !validator(value)) continue;
      return value;
    }
    return "";
  }

  function putId(name, id) {
    const nk = nameKey(name);
    const iv = clean(id);
    if (!nk || !looksLikeLoginId(iv)) return;
    if (!idMap.has(nk)) idMap.set(nk, iv);
  }

  function harvestRows(payload, depth) {
    if (depth > 5 || payload == null) return;
    if (Array.isArray(payload)) {
      for (const item of payload) harvestRows(item, depth + 1);
      return;
    }
    if (!isObject(payload)) return;

    const nm = firstValue(payload, NAME_KEYS);
    const id = firstValue(payload, ID_KEYS, looksLikeLoginId);
    if (nm && id) putId(nm, id);

    for (const key of ["rows", "data", "drivers", "accounts", "items", "users", "profiles", "result"]) {
      if (payload[key] != null) harvestRows(payload[key], depth + 1);
    }
  }

  function patchFetchHarvester() {
    if (window.__MW_METAADMIN_FETCH_HARVESTER__) return;
    window.__MW_METAADMIN_FETCH_HARVESTER__ = true;

    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") return;

    window.fetch = function patchedFetch(){
      const p = originalFetch.apply(this, arguments);
      p.then(async (res) => {
        try {
          const ct = res.headers && res.headers.get ? (res.headers.get("content-type") || "") : "";
          if (!/json/i.test(ct)) return;
          const data = await res.clone().json();
          harvestRows(data, 0);
        } catch {}
      }).catch(() => {});
      return p;
    };
  }

  async function getSessionAccessToken() {
    try {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || !window.supabase?.createClient) return "";
      const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data } = await sb.auth.getSession();
      return data?.session?.access_token || "";
    } catch {
      return "";
    }
  }

  async function loadFromScheduleApi() {
    const token = await getSessionAccessToken();
    const headers = token ? { Authorization: "Bearer " + token } : {};

    await Promise.allSettled(SCHEDULE_LOOKUP_PATHS.map(async (path) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch(SCHEDULE_API_BASE + path, { headers, cache: "no-store", signal: controller.signal });
        if (!res.ok) return;
        harvestRows(await res.json(), 0);
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }));
  }

  async function loadFromSupabase() {
    try {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || !window.supabase?.createClient) return;
      const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      await Promise.allSettled(SUPABASE_LOOKUP_TABLES.map(async (table) => {
        try {
          const { data, error } = await sb.from(table).select("*").limit(10000);
          if (error) return;
          harvestRows(data, 0);
        } catch {}
      }));
    } catch {}
  }

  async function ensureIdsForNames(names) {
    const missing = Array.from(new Set((names || []).map(nameKey).filter(Boolean))).filter(nk => !idMap.has(nk));
    if (!missing.length) return;
    await Promise.allSettled([loadFromScheduleApi(), loadFromSupabase()]);
  }

  function findHeaderIndex(headers, label) {
    return headers.findIndex(v => clean(v) === label);
  }

  async function fillWorkbookIds(wb) {
    if (!wb || !window.XLSX?.utils) return false;
    const XLSX = window.XLSX;
    let changed = false;
    const namesToResolve = [];
    const targets = [];

    for (const sheetName of wb.SheetNames || []) {
      const ws = wb.Sheets?.[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      if (!Array.isArray(rows) || rows.length < 2) continue;

      const headers = rows[0] || [];
      const nameCol = findHeaderIndex(headers, "이름");
      const idCol = findHeaderIndex(headers, "아이디");
      if (nameCol < 0 || idCol < 0) continue;

      for (let r = 1; r < rows.length; r++) {
        const name = clean(rows[r]?.[nameCol]);
        const currentId = clean(rows[r]?.[idCol]);
        if (!name) continue;

        if (currentId) {
          putId(name, currentId);
          continue;
        }

        namesToResolve.push(name);
        targets.push({ ws, row: r, col: idCol, name });
      }
    }

    if (!targets.length) return false;
    await ensureIdsForNames(namesToResolve);

    for (const target of targets) {
      const id = idMap.get(nameKey(target.name));
      if (!id) continue;
      const addr = XLSX.utils.encode_cell({ r: target.row, c: target.col });
      target.ws[addr] = { t: "s", v: id };
      changed = true;
    }

    return changed;
  }

  function patchXlsxWriteFile() {
    const XLSX = window.XLSX;
    if (!XLSX || typeof XLSX.writeFile !== "function" || XLSX.__MW_METAADMIN_PATCHED__) return false;

    const originalWriteFile = XLSX.writeFile.bind(XLSX);
    XLSX.__MW_METAADMIN_PATCHED__ = true;

    XLSX.writeFile = function patchedWriteFile(wb, filename, opts) {
      const args = arguments;
      const statusEl = document.getElementById("statusText");
      const prevStatus = statusEl ? statusEl.textContent : "";
      if (statusEl) statusEl.textContent = "엑셀 아이디 보정 중...";

      fillWorkbookIds(wb)
        .catch((err) => console.warn("[MetaAdmin Excel ID Patch]", err))
        .finally(() => {
          if (statusEl) statusEl.textContent = prevStatus;
          originalWriteFile.apply(XLSX, args);
        });
    };

    return true;
  }

  patchFetchHarvester();

  const timer = setInterval(() => {
    if (patchXlsxWriteFile()) clearInterval(timer);
  }, 100);

  setTimeout(() => clearInterval(timer), 15000);
})();
