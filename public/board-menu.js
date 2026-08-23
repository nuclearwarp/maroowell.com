(() => {
  "use strict";

  if (window.__MW_BOARD_MENU_INIT__) return;
  window.__MW_BOARD_MENU_INIT__ = true;

  const BUILD = "20260823-push-board-v1";
  const PAGES = [
    { key:"mw-schedule", label:"마루웰 입차 스케줄", path:"/maroowell_schedule", aliases:["/maroowell_schedule","/maroowell_schedule.html"], requireRoleLevel:30, desc:"마루웰 입차 스케줄" },
    { key:"mw-push", label:"PUSH 알림", path:"/maroowell_push", aliases:["/maroowell_push","/maroowell_push.html"], requireRoleLevel:30, desc:"긴급 PUSH / 팀 공지 발송" },
    { key:"info", label:"마루웰 정보", path:"/maroowell_info", aliases:["/maroowell_info","/maroowell_info.html"], requireRoleLevel:60, desc:"마루웰 기본 정보" },
    { key:"zipcode_search", label:"우편번호 검색기", path:"/zipcode_search", aliases:["/zipcode_search","/zipcode_search.html"], public:true, desc:"우편번호 / 지도 조회" },
    { key:"route", label:"라우트 편집기", path:"/coupangRouteMap.html", aliases:["/coupangRouteMap","/coupangRouteMap.html"], public:true, desc:"라우트 / 벤더 / 입차지 편집" },
    { key:"coupang-camps", label:"쿠팡 캠프 조회", path:"/coupang_camp", aliases:["/coupang_camp","/coupang_camp.html"], public:true, desc:"쿠팡 캠프 / 주소조회" },
    { key:"freshbag-view", label:"프레시백 현황 조회", path:"/coupang_freshbag", aliases:["/coupang_freshbag","/coupang_freshbag.html"], public:true, desc:"프레시백 가중요인 현황 조회 / 업로드" },
    { key:"cleansing_history", label:"클렌징 히스토리", path:"/cleansing_history", aliases:["/cleansing_history","/cleansing_history.html"], requireClhi:true, desc:"클렌징 히스토리 조회" },
    { key:"mw-route-info", label:"마루웰 라우트정보", path:"/maroowell_route_info", aliases:["/maroowell_route_info","/maroowell_route_info.html"], requireMaroowell:true, desc:"마루웰 라우트 정보 조회" },
    { key:"mw-freshbag-ratio", label:"마루웰 회수율", path:"/maroowell_freshbag_ratio", aliases:["/maroowell_freshbag_ratio","/maroowell_freshbag_ratio.html"], requireMaroowell:true, desc:"마루웰 프레시백 회수율 조회" },
    { key:"mw-route", label:"마루웰 라우트 단가", path:"/maroowell_route", aliases:["/maroowell_route","/maroowell_route.html"], requireRoleLevel:60, desc:"라우트 단가 / 주소 / 원청 관리" },
    { key:"mw-payout", label:"마루웰 정산", path:"/maroowell_payout", aliases:["/maroowell_payout","/maroowell_payout.html"], requireSuperAdmin:true, desc:"마루웰 정산 관리" },
    { key:"mw-account", label:"배송/반품 통계 조회", path:"/maroowell_account", aliases:["/maroowell_account","/maroowell_account.html"], requireRoleLevel:30, desc:"배송/반품 일별,월별,라우트별 통계 조회" },
    { key:"mw-account-upload", label:"정산 업로드", path:"/maroowell_account_upload", aliases:["/maroowell_account_upload","/maroowell_account_upload.html"], requireSuperAdmin:true, desc:"정산 업로드" },
    { key:"dragon-index", label:"용차", path:"/dragon_car_index", aliases:["/dragon_car_index","/dragon_car_index.html"], requireDragonCarAdmin:true, desc:"용차 관리" },
    { key:"dragon-schedule", label:"용차 스케줄", path:"/dragon_car_schedule", aliases:["/dragon_car_schedule","/dragon_car_schedule.html"], requireTeamOrDragonCarAdmin:true, desc:"용차 기사 출근 / 휴무 스케줄" },
    { key:"dragon-pay", label:"용차 정산서", path:"/dragon_car_pay", aliases:["/dragon_car_pay","/dragon_car_pay.html"], requireDragonCarAdmin:true, desc:"용차 정산서" },
    { key:"admin-access", label:"관리자 권한 관리", path:"/admin_access.html", aliases:["/admin_access","/admin_access.html","/maroowell_access"], requireSuperAdmin:true, desc:"사용자 / 관리자 권한 관리" }
  ];

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  function normalizePath(path) {
    let value = String(path || "").trim();
    if (!value) return "/";
    if (value.startsWith("http://") || value.startsWith("https://")) {
      try { value = new URL(value).pathname || "/"; } catch { return "/"; }
    }
    value = value.replace(/[?#].*$/, "");
    if (!value.startsWith("/")) value = "/" + value;
    if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
    return value || "/";
  }

  function pathVariants(path) {
    const value = normalizePath(path);
    const set = new Set([value]);
    if (value === "/") {
      set.add("/index");
      set.add("/index.html");
    } else if (value === "/index" || value === "/index.html") {
      set.add("/");
      set.add("/index");
      set.add("/index.html");
    } else if (value.endsWith(".html")) {
      set.add(value.slice(0, -5));
    } else {
      set.add(value + ".html");
    }
    return [...set];
  }

  function isCurrentPage(page) {
    const current = new Set(pathVariants(location.pathname || "/"));
    for (const item of [page.path, ...(page.aliases || [])]) {
      for (const value of pathVariants(item)) {
        if (current.has(value)) return true;
      }
    }
    return false;
  }

  const findCurrentPage = () => PAGES.find(isCurrentPage) || null;
  const defaultAccess = () => ({
    user_id:"",
    email:"",
    is_maroowell:false,
    is_admin:false,
    max_role_level:0,
    is_dragon_car_admin:false,
    can_clhi:false,
    signed_in:false,
    approval_status:"pending",
    app_only:false
  });
  const isSuper = access => access?.is_maroowell === true && access?.is_admin === true && Number(access?.max_role_level || 0) >= 90;

  function canAccessPage(page, access) {
    if (!page || page.public) return true;
    if (!access?.signed_in) return false;
    if (access.approval_status !== "approved") return false;
    if (access.app_only === true) return false;

    const mw = access.is_maroowell === true;
    const role = Number(access.max_role_level || 0);
    const dragon = access.is_dragon_car_admin === true;

    if (page.requireSuperAdmin) return isSuper(access);
    if (page.requireClhi) return isSuper(access) || access.can_clhi === true;
    if (page.requireTeamOrDragonCarAdmin) return (mw && role >= 30) || dragon;
    if (page.requireDragonCarAdmin) return dragon;
    if (page.requireMaroowell) return mw;
    if (page.requireRoleLevel) return mw && role >= Number(page.requireRoleLevel);
    return true;
  }

  function pageBadge(page) {
    if (page.public) return "";
    if (page.requireSuperAdmin) return "최고관리자";
    if (page.requireClhi) return "클히";
    if (page.requireTeamOrDragonCarAdmin) return "팀장/용차";
    if (page.requireDragonCarAdmin) return "용차관리자";
    if (page.requireMaroowell) return "마루웰";
    if (Number(page.requireRoleLevel) >= 60) return "관리자";
    if (Number(page.requireRoleLevel) >= 30) return "팀장";
    return "권한";
  }

  function requirementText(page) {
    if (!page) return "접근 권한이 없습니다.";
    if (page.requireClhi) return "클렌징 히스토리 조회 권한이 필요합니다.\n조건: 최고관리자 또는 cleansing_history_access.can_select = true";
    if (page.requireSuperAdmin) return "최고관리자 권한이 필요합니다.\n조건: 마루웰 권한 + 관리자 권한 + role_level 90 이상";
    if (page.requireTeamOrDragonCarAdmin) return "마루웰 팀장 이상 또는 용차 관리자 권한이 필요합니다.\n조건: 마루웰 권한 + role_level 30 이상 또는 용차관리자 권한";
    if (page.requireDragonCarAdmin) return "용차 관리자 권한이 필요합니다.\n조건: profiles.is_dragon_car_admin = true";
    if (page.requireMaroowell) return "마루웰 소속 권한이 필요합니다.\n조건: user_access.is_maroowell = true";
    if (Number(page.requireRoleLevel) >= 60) return "관리자 권한이 필요합니다.\n조건: 마루웰 권한 + role_level 60 이상";
    if (Number(page.requireRoleLevel) >= 30) return "팀장 권한이 필요합니다.\n조건: 마루웰 권한 + role_level 30 이상";
    return "접근 권한이 없습니다.";
  }

  function getSupabaseProjectRef(url) {
    try { return new URL(url).hostname.split(".")[0] || ""; }
    catch { return ""; }
  }

  function decodeStoredAuthValue(value) {
    const raw = String(value || "");
    if (!raw.startsWith("base64-")) return raw;
    try {
      let encoded = raw.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      encoded += "=".repeat((4 - (encoded.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  }

  function parseStoredSession(value) {
    const decoded = decodeStoredAuthValue(value);
    if (!decoded) return null;
    try {
      const parsed = JSON.parse(decoded);
      return parsed?.currentSession || parsed?.session || parsed || null;
    } catch {
      return null;
    }
  }

  function readSessionFromStorage(storage, baseKey) {
    try {
      const direct = storage?.getItem(baseKey);
      if (direct) return parseStoredSession(direct);

      const chunks = [];
      for (let i = 0; storage && i < storage.length; i++) {
        const key = storage.key(i) || "";
        const escaped = baseKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = key.match(new RegExp(`^${escaped}\\.(\\d+)$`));
        if (!match) continue;
        chunks.push({ index:Number(match[1]), value:storage.getItem(key) || "" });
      }
      if (!chunks.length) return null;
      chunks.sort((a, b) => a.index - b.index);
      return parseStoredSession(chunks.map(item => item.value).join(""));
    } catch {
      return null;
    }
  }

  function decodeJwtPayload(token) {
    try {
      const part = String(token || "").split(".")[1];
      if (!part) return null;
      let encoded = part.replace(/-/g, "+").replace(/_/g, "/");
      encoded += "=".repeat((4 - (encoded.length % 4)) % 4);
      return JSON.parse(decodeURIComponent(Array.from(
        atob(encoded),
        ch => "%" + ch.charCodeAt(0).toString(16).padStart(2, "0")
      ).join("")));
    } catch {
      return null;
    }
  }

  function sessionExpiry(session) {
    const jwt = decodeJwtPayload(session?.access_token || "") || {};
    return Number(session?.expires_at || jwt.exp || 0);
  }

  function readStoredSession(supabaseUrl) {
    const projectRef = getSupabaseProjectRef(supabaseUrl);
    if (!projectRef) return null;
    const baseKey = `sb-${projectRef}-auth-token`;
    const candidates = [];

    for (const storage of [window.localStorage, window.sessionStorage]) {
      const session = readSessionFromStorage(storage, baseKey);
      if (session?.access_token) candidates.push(session);
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => sessionExpiry(b) - sessionExpiry(a));
    return candidates[0];
  }

  function isSessionFresh(session, skewSeconds = 5) {
    const token = String(session?.access_token || "");
    if (!token) return false;
    const exp = sessionExpiry(session);
    if (!exp) return true;
    return exp > (Date.now() / 1000) + Math.max(0, Number(skewSeconds) || 0);
  }

  function sessionEmail(session) {
    const jwt = decodeJwtPayload(session?.access_token || "") || {};
    return String(session?.user?.email || jwt.email || "");
  }

  function broadcastSessionRequest(supabaseUrl) {
    const projectRef = getSupabaseProjectRef(supabaseUrl);
    if (!projectRef || !("BroadcastChannel" in window)) return;

    const channelName = "mw-auth-bridge:" + projectRef;
    const tabId = "board-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const requestId = tabId + ":" + Date.now().toString(36);
    let channel = null;

    try {
      channel = new BroadcastChannel(channelName);
      channel.addEventListener("message", event => {
        const msg = event.data || {};
        if (msg.projectRef !== projectRef || msg.type !== "MW_SESSION_RESPONSE" || msg.requestId !== requestId) return;
        try {
          const base = "sb-" + projectRef + "-auth-token";
          const matchesKey = key => !!key && (key === base || key.startsWith(base + ".") || key.startsWith(base + "-code-verifier"));
          for (const row of msg.entries || []) {
            if (!row || !matchesKey(row.key)) continue;
            for (const storage of [window.localStorage, window.sessionStorage]) {
              if (row.value == null) storage.removeItem(row.key);
              else storage.setItem(row.key, row.value);
            }
          }
        } catch {}
      });
      channel.postMessage({ type:"MW_SESSION_REQUEST", projectRef, requestId, fromTabId:tabId });
      setTimeout(() => {
        try { channel?.close(); } catch {}
      }, 2500);
    } catch {}
  }

  async function waitForFreshSession(supabaseUrl, previousToken = "", timeoutMs = 5000) {
    broadcastSessionRequest(supabaseUrl);
    const deadline = Date.now() + Math.max(500, Number(timeoutMs) || 5000);

    while (Date.now() < deadline) {
      const session = readStoredSession(supabaseUrl);
      const token = String(session?.access_token || "");
      if (token && isSessionFresh(session)) {
        if (!previousToken || token !== previousToken || sessionExpiry(session) > Date.now() / 1000 + 5) {
          return session;
        }
      }
      await wait(150);
    }

    const finalSession = readStoredSession(supabaseUrl);
    return isSessionFresh(finalSession) ? finalSession : null;
  }

  function firstRow(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value && typeof value === "object" ? value : null;
  }

  async function supabaseJson(path, { token, method = "GET", body } = {}) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.MARUWELL_CONFIG || {};
    const base = String(SUPABASE_URL || "").replace(/\/+$/, "");
    if (!base || !SUPABASE_ANON_KEY) {
      const error = new Error("Supabase 웹 설정이 없습니다.");
      error.status = 500;
      throw error;
    }

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store"
      });
    } catch (cause) {
      const error = new Error(cause?.message || "권한 서버에 연결하지 못했습니다.");
      error.status = 0;
      throw error;
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text || null; }

    if (!response.ok) {
      const message =
        (data && typeof data === "object" && (data.message || data.error || data.details || data.hint)) ||
        (typeof data === "string" ? data : "") ||
        `HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async function loadAccessWithSession(session) {
    const token = String(session?.access_token || "");
    if (!token) {
      const error = new Error("로그인 세션이 없습니다.");
      error.status = 401;
      throw error;
    }

    const jwt = decodeJwtPayload(token) || {};
    const uid = String(session?.user?.id || jwt.sub || "");
    if (!uid) {
      const error = new Error("로그인 사용자 정보를 확인할 수 없습니다.");
      error.status = 401;
      throw error;
    }

    const [accessRaw, accountRaw] = await Promise.all([
      supabaseJson("/rest/v1/rpc/mw_my_access", { token, method:"POST", body:{} }),
      supabaseJson("/rest/v1/rpc/mw_my_account_state", { token, method:"POST", body:{} })
    ]);

    const data = firstRow(accessRaw);
    const accountState = firstRow(accountRaw);
    if (!data || !accountState) {
      const error = new Error("권한 응답이 비어 있습니다.");
      error.status = 502;
      throw error;
    }

    const out = defaultAccess();
    out.signed_in = true;
    out.user_id = uid;
    out.email = String(session?.user?.email || jwt.email || data.email || "");
    out.is_maroowell = data.is_maroowell === true;
    out.is_admin = data.is_admin === true;
    out.max_role_level = Number(data.max_role_level || 0);
    out.is_dragon_car_admin = data.is_dragon_car_admin === true;
    out.approval_status = String(accountState.approval_status || "pending");
    out.app_only = accountState.app_only === true;

    if (isSuper(out)) {
      out.can_clhi = true;
    } else {
      const query = new URLSearchParams({
        select:"can_select",
        user_id:`eq.${uid}`,
        limit:"1"
      });
      const rows = await supabaseJson(`/rest/v1/cleansing_history_access?${query.toString()}`, { token });
      out.can_clhi = Array.isArray(rows) && rows[0]?.can_select === true;
    }

    return out;
  }

  async function loadAccess() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.MARUWELL_CONFIG || {};
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const error = new Error("Supabase 웹 설정이 누락되었습니다.");
      error.status = 500;
      throw error;
    }

    let session = readStoredSession(SUPABASE_URL);
    if (!session?.access_token) {
      session = await waitForFreshSession(SUPABASE_URL, "", 3000);
    }
    if (!session?.access_token) return defaultAccess();

    if (!isSessionFresh(session)) {
      const oldToken = String(session.access_token || "");
      session = await waitForFreshSession(SUPABASE_URL, oldToken, 5000);
      if (!session?.access_token) {
        const stored = readStoredSession(SUPABASE_URL);
        const email = sessionEmail(stored);
        const error = new Error(email
          ? `로그인 세션 갱신이 지연되고 있습니다. (${email}) 잠시 후 다시 확인해주세요.`
          : "로그인 세션 갱신이 지연되고 있습니다. 잠시 후 다시 확인해주세요.");
        error.status = 401;
        throw error;
      }
    }

    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await loadAccessWithSession(session);
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || 0);

        if (status === 401) {
          const previousToken = String(session?.access_token || "");
          const refreshed = await waitForFreshSession(SUPABASE_URL, previousToken, 5000);
          if (refreshed?.access_token) session = refreshed;
        }

        if (attempt < 3) await wait(350 * (attempt + 1));
      }
    }

    throw lastError || new Error("권한 정보를 확인하지 못했습니다.");
  }

  function injectStyles() {
    if (document.getElementById("mw-board-menu-style")) return;
    const style = document.createElement("style");
    style.id = "mw-board-menu-style";
    style.textContent = `
      .mw-board-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);z-index:99990;display:none}.mw-board-backdrop.open{display:block}
      .mw-board-panel{position:fixed;top:18px;left:18px;width:min(380px,calc(100vw - 36px));max-height:min(78vh,720px);overflow:auto;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(15,26,45,.98),rgba(8,14,26,.98));box-shadow:0 22px 80px rgba(0,0,0,.45);z-index:99991;display:none}.mw-board-panel.open{display:block}
      .mw-board-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}.mw-board-title{font-size:16px;font-weight:900;color:#eef4ff}.mw-board-close{height:34px;min-width:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#d7e4ff;font-weight:900;cursor:pointer}
      .mw-board-body{padding:12px}.mw-board-desc{color:rgba(230,238,252,.68);font-size:12px;line-height:1.5;margin:0 2px 10px}.mw-board-list{display:grid;gap:10px}.mw-board-item{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:16px;padding:14px;color:#fff;cursor:pointer;text-align:left;width:100%;text-decoration:none;display:block}.mw-board-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)}.mw-board-item.current{border-color:rgba(96,165,250,.55);background:rgba(59,130,246,.14);box-shadow:inset 0 0 0 1px rgba(96,165,250,.22)}.mw-board-item-title{font-size:15px;font-weight:900;line-height:1.2;margin-bottom:6px}.mw-board-item-sub{font-size:12px;color:rgba(230,238,252,.66);line-height:1.45}.mw-board-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#dbe7ff;font-size:11px;font-weight:900;vertical-align:middle}
      .mw-denied-screen{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(180deg,rgba(11,18,32,.98),rgba(7,11,19,.99));color:#e6eefc;font-family:system-ui,-apple-system,'Noto Sans KR',Segoe UI,Roboto,Arial,sans-serif}.mw-denied-card{width:min(560px,calc(100vw - 28px));border:1px solid rgba(255,255,255,.12);border-radius:22px;background:#101827;box-shadow:0 24px 70px rgba(0,0,0,.46);padding:24px}.mw-denied-card h2{margin:0 0 10px;font-size:24px}.mw-denied-card p{margin:0;color:#b8c3d9;line-height:1.65;white-space:pre-wrap;font-size:14px}.mw-denied-meta{margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:#e6eefc;font-size:13px;font-weight:800;line-height:1.6;word-break:break-word}.mw-denied-actions{margin-top:18px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}.mw-denied-btn{height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:#162744;color:#e6eefc;cursor:pointer;font-weight:900}.mw-denied-btn.danger{background:rgba(107,27,27,.35);border-color:rgba(255,60,60,.22);color:#ffccd3}`;
    document.head.appendChild(style);
  }

  function mountAccessScreen(title, message, meta, { retry = false, login = true } = {}) {
    injectStyles();
    const existing = document.getElementById("mwAccessGuardScreen");
    if (existing) existing.remove();

    const box = document.createElement("div");
    box.id = "mwAccessGuardScreen";
    box.className = "mw-denied-screen";
    box.innerHTML = `<div class="mw-denied-card"><h2>${esc(title)}</h2><p>${esc(message)}</p>${meta ? `<div class="mw-denied-meta">${esc(meta)}</div>` : ""}<div class="mw-denied-actions">${retry ? '<button class="mw-denied-btn" id="mwAccessRetry">다시 확인</button>' : '<button class="mw-denied-btn" id="mwAccessHome">홈으로</button>'}${login ? '<button class="mw-denied-btn danger" id="mwAccessLogin">로그인</button>' : ""}</div></div>`;
    document.body.appendChild(box);

    document.getElementById("mwAccessRetry")?.addEventListener("click", () => location.reload());
    document.getElementById("mwAccessHome")?.addEventListener("click", () => { location.href = "/zipcode_search"; });
    document.getElementById("mwAccessLogin")?.addEventListener("click", () => { location.href = `/?next=${encodeURIComponent(location.pathname + location.search)}`; });
  }

  function showLoginRequired() {
    mountAccessScreen(
      "로그인이 필요합니다",
      "로그인 세션을 확인할 수 없습니다. 로그인 후 다시 접속해주세요.",
      "권한 없음으로 처리한 것이 아니라 로그인 세션이 없는 상태입니다.",
      { retry:true, login:true }
    );
  }

  function showDenied(page, access) {
    const meta = [
      `현재 계정: ${access?.email || "확인 불가"}`,
      `is_maroowell=${access?.is_maroowell === true}`,
      `is_admin=${access?.is_admin === true}`,
      `role_level=${Number(access?.max_role_level || 0)}`
    ].join(" · ");
    mountAccessScreen("접근 권한 없음", requirementText(page), meta, { retry:false, login:true });
  }

  function showAccessLookupError(error) {
    const status = Number(error?.status || 0);
    const prefix = status ? `HTTP ${status} · ` : "";
    mountAccessScreen(
      "권한 확인 실패",
      "로그인 권한을 확인하지 못했습니다. 일시적인 인증/네트워크 오류를 권한 없음으로 처리하지 않았습니다.",
      prefix + String(error?.message || "일시적인 권한 조회 오류"),
      { retry:true, login:true }
    );
  }

  function renderMenu(access) {
    injectStyles();
    const backdrop = document.createElement("div");
    backdrop.className = "mw-board-backdrop";
    const panel = document.createElement("div");
    panel.className = "mw-board-panel";
    const visiblePages = PAGES.filter(page => canAccessPage(page, access));
    const current = findCurrentPage();

    panel.innerHTML = `<div class="mw-board-head"><div class="mw-board-title">마루웰 메뉴</div><button type="button" class="mw-board-close">닫기</button></div><div class="mw-board-body"><p class="mw-board-desc">접근 가능한 페이지가 표시됩니다.</p><div class="mw-board-list">${visiblePages.map(page => `<a class="mw-board-item ${current?.key === page.key ? "current" : ""}" href="${esc(page.path)}"><div class="mw-board-item-title">${esc(page.label)}${pageBadge(page) ? `<span class="mw-board-badge">${esc(pageBadge(page))}</span>` : ""}</div><div class="mw-board-item-sub">${esc(page.desc || "")}</div></a>`).join("")}</div></div>`;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    const open = () => {
      backdrop.classList.add("open");
      panel.classList.add("open");
    };
    const close = () => {
      backdrop.classList.remove("open");
      panel.classList.remove("open");
    };

    backdrop.addEventListener("click", close);
    panel.querySelector(".mw-board-close")?.addEventListener("click", close);
    const toggle = document.getElementById("mwBoardMenuToggle");
    if (toggle) {
      toggle.addEventListener("click", event => {
        event.preventDefault();
        open();
      });
    }
  }

  async function init() {
    const current = findCurrentPage();
    console.info("[board-menu] build", BUILD);

    try {
      const access = await loadAccess();

      if (current && !current.public && !access.signed_in) {
        showLoginRequired();
        return;
      }

      if (current && !canAccessPage(current, access)) {
        showDenied(current, access);
        return;
      }

      renderMenu(access);
    } catch (error) {
      console.error("[board-menu] access lookup failed", error);
      showAccessLookupError(error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once:true });
  } else {
    init();
  }
})();