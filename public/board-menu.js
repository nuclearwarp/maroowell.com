(() => {
  "use strict";

  if (window.__MW_BOARD_MENU_INIT__) return;
  window.__MW_BOARD_MENU_INIT__ = true;

  const MENU_MODE = window.MW_BOARD_MENU_MODE || "public";

  const PAGES = [
    {
      key: "index",
      label: "우편번호 검색기",
      path: "/index.html",
      aliases: ["/", "/index", "/index.html"],
      public: true
    },
    {
      key: "route",
      label: "라우트 편집기",
      path: "/coupangRouteMap.html",
      aliases: ["/coupangRouteMap", "/coupangRouteMap.html"],
      public: true
    },
    {
      key: "coupang-camps",
      label: "쿠팡 캠프 조회",
      path: "/coupang_camp",
      aliases: ["/coupang_camp", "/coupang_camp.html"],
      public: true
    },
    {
      key: "info",
      label: "마루웰 정보",
      path: "/maroowell_info",
      aliases: ["/maroowell_info", "/maroowell_info.html"],
      requireRoleLevel: 30
    },
    {
      key: "mw-route",
      label: "마루웰 라우트 단가",
      path: "/maroowell_route",
      aliases: ["/maroowell_route", "/maroowell_route.html"],
      requireRoleLevel: 60
    },
    {
      key: "mw-payout",
      label: "마루웰 정산",
      path: "/maroowell_payout",
      aliases: ["/maroowell_payout", "/maroowell_payout.html"],
      requireSuperAdmin: true
    },
    {
      key: "dragon-index",
      label: "용차",
      path: "/dragon_car_index",
      aliases: ["/dragon_car_index", "/dragon_car_index.html"],
      requireDragonCarAdmin: true
    },
    {
      key: "dragon-pay",
      label: "용차 정산서",
      path: "/dragon_car_pay",
      aliases: ["/dragon_car_pay", "/dragon_car_pay.html"],
      requireDragonCarAdmin: true
    },
    {
      key: "admin-access",
      label: "관리자 권한 관리",
      path: "/admin_access.html",
      aliases: ["/admin_access", "/admin_access.html", "/maroowell_access"],
      requireSuperAdmin: true
    }
  ];

  function normalizePath(path) {
    let p = String(path || "").trim();
    if (!p) return "/";

    if (p.startsWith("http://") || p.startsWith("https://")) {
      try {
        p = new URL(p).pathname || "/";
      } catch {
        return "/";
      }
    }

    p = p.replace(/[?#].*$/, "");
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

    return p || "/";
  }

  function getCurrentPath() {
    return normalizePath(location.pathname || "/");
  }

  function pathVariants(path) {
    const p = normalizePath(path);
    const set = new Set([p]);

    if (p === "/") {
      set.add("/index");
      set.add("/index.html");
    } else if (p === "/index" || p === "/index.html") {
      set.add("/");
      set.add("/index");
      set.add("/index.html");
    } else if (p.endsWith(".html")) {
      set.add(p.slice(0, -5));
    } else if (p !== "/" && !p.endsWith(".html")) {
      set.add(p + ".html");
    }

    return Array.from(set);
  }

  function isCurrentPage(page) {
    const current = getCurrentPath();
    const currentVariants = new Set(pathVariants(current));
    const pagePaths = [page.path, ...(page.aliases || [])];

    for (const item of pagePaths) {
      for (const variant of pathVariants(item)) {
        if (currentVariants.has(variant)) return true;
      }
    }
    return false;
  }

  function findCurrentPage() {
    return PAGES.find(page => isCurrentPage(page)) || null;
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function defaultAccess() {
    return {
      user_id: "",
      email: "",
      is_maroowell: false,
      is_admin: false,
      max_role_level: 0,
      is_dragon_car_admin: false,
      signed_in: false
    };
  }

  function canAccessPage(page, access) {
    if (!page) return true;
    if (page.public) return true;

    const isMaroowell = access?.is_maroowell === true;
    const isAdmin = access?.is_admin === true;
    const roleLevel = Number(access?.max_role_level || 0);
    const isDragonCarAdmin = access?.is_dragon_car_admin === true;

    if (page.requireSuperAdmin) {
      return isMaroowell && isAdmin && roleLevel >= 90;
    }

    if (page.requireDragonCarAdmin) {
      return isDragonCarAdmin;
    }

    if (page.requireRoleLevel) {
      return isMaroowell && roleLevel >= Number(page.requireRoleLevel);
    }

    return true;
  }

  function requirementText(page) {
    if (!page) return "접근 권한이 없습니다.";

    if (page.requireSuperAdmin) {
      return "마루웰 최고관리자 권한이 필요합니다.\n조건: 마루웰 권한 + 관리자 권한 + role_level 90 이상";
    }

    if (page.requireDragonCarAdmin) {
      return "용차 관리자 권한이 필요합니다.\n조건: profiles.is_dragon_car_admin = true";
    }

    if (page.requireRoleLevel >= 60) {
      return "마루웰 라우트 단가 권한이 필요합니다.\n조건: 마루웰 권한 + role_level 60 이상";
    }

    if (page.requireRoleLevel >= 30) {
      return "마루웰 기본 권한이 필요합니다.\n조건: 마루웰 권한 + role_level 30 이상";
    }

    return "접근 권한이 없습니다.";
  }

  function pageBadge(page) {
    if (page.public) return "";
    if (page.requireSuperAdmin) return "최고관리자";
    if (page.requireDragonCarAdmin) return "용차관리자";
    if (page.requireRoleLevel) return `Lv.${page.requireRoleLevel}+`;
    return "권한";
  }

  function pageSubtext(path) {
    switch (normalizePath(path)) {
      case "/index.html":
      case "/":
        return "우편번호 / 지도 조회";
      case "/coupangRouteMap":
      case "/coupangRouteMap.html":
        return "라우트 / 벤더 / 입차지 편집";
      case "/coupang_camp":
      case "/coupang_camp.html":
        return "쿠팡 캠프 / 주소조회";
      case "/maroowell_info":
      case "/maroowell_info.html":
        return "마루웰 기본 정보";
      case "/maroowell_route":
      case "/maroowell_route.html":
        return "라우트 단가 / 주소 / 원청 관리";
      case "/maroowell_payout":
      case "/maroowell_payout.html":
        return "마루웰 정산 관리";
      case "/dragon_car_index":
      case "/dragon_car_index.html":
        return "용차 관리";
      case "/dragon_car_pay":
      case "/dragon_car_pay.html":
        return "용차 정산서";
      case "/admin_access":
      case "/admin_access.html":
        return "사용자 / 관리자 권한 관리";
      default:
        return "";
    }
  }

  async function loadAccess() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = (window.MARUWELL_CONFIG || {});
    const out = defaultAccess();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
      return out;
    }

    const authStorage = (() => {
      try {
        return window.sessionStorage;
      } catch {
        return undefined;
      }
    })();

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: !!authStorage,
        storage: authStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const uid = session?.user?.id;

      if (!uid) return out;

      out.signed_in = true;
      out.user_id = uid;
      out.email = session?.user?.email || "";

      const { data, error } = await supabase
        .rpc("mw_my_access")
        .maybeSingle();

      if (error || !data) return out;

      return {
        signed_in: true,
        user_id: data.user_id || uid,
        email: data.email || session?.user?.email || "",
        is_maroowell: data.is_maroowell === true,
        is_admin: data.is_admin === true,
        max_role_level: Number(data.max_role_level || 0),
        is_dragon_car_admin: data.is_dragon_car_admin === true
      };
    } catch {
      return out;
    }
  }

  function injectStyles() {
    if (document.getElementById("mw-board-menu-style")) return;

    const style = document.createElement("style");
    style.id = "mw-board-menu-style";
    style.textContent = `
      .mw-board-backdrop{
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.42);
        backdrop-filter:blur(2px);
        z-index:99990;
        display:none;
      }
      .mw-board-backdrop.open{display:block}
      .mw-board-panel{
        position:fixed;
        top:18px;
        left:18px;
        width:min(380px, calc(100vw - 36px));
        max-height:min(78vh, 720px);
        overflow:auto;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.12);
        background:linear-gradient(180deg, rgba(15,26,45,.98), rgba(8,14,26,.98));
        box-shadow:0 22px 80px rgba(0,0,0,.45);
        z-index:99991;
        display:none;
      }
      .mw-board-panel.open{display:block}
      .mw-board-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:14px 16px 12px;
        border-bottom:1px solid rgba(255,255,255,.08);
      }
      .mw-board-title{
        font-size:16px;
        font-weight:900;
        color:#eef4ff;
        letter-spacing:.2px;
      }
      .mw-board-close{
        height:34px;
        min-width:34px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06);
        color:#d7e4ff;
        font-weight:900;
        cursor:pointer;
      }
      .mw-board-close:hover{background:rgba(255,255,255,.12)}
      .mw-board-body{padding:12px}
      .mw-board-desc{
        color:rgba(230,238,252,.68);
        font-size:12px;
        line-height:1.5;
        margin:0 2px 10px;
      }
      .mw-board-list{display:grid;gap:10px}
      .mw-board-item{
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        border-radius:16px;
        padding:14px 14px;
        color:#fff;
        cursor:pointer;
        text-align:left;
        width:100%;
        text-decoration:none;
      }
      .mw-board-item:hover{
        background:rgba(255,255,255,.08);
        border-color:rgba(255,255,255,.18);
      }
      .mw-board-item.current{
        border-color:rgba(96,165,250,.55);
        background:rgba(59,130,246,.14);
        box-shadow:inset 0 0 0 1px rgba(96,165,250,.22);
      }
      .mw-board-item-title{
        font-size:15px;
        font-weight:900;
        line-height:1.2;
        margin-bottom:6px;
      }
      .mw-board-item-sub{
        font-size:12px;
        color:rgba(230,238,252,.66);
        line-height:1.45;
      }
      .mw-board-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        margin-left:8px;
        padding:3px 8px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        color:#dbe7ff;
        font-size:11px;
        font-weight:900;
        vertical-align:middle;
      }
      .mw-denied-screen{
        position:fixed;
        inset:0;
        z-index:2147483000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:linear-gradient(180deg, rgba(11,18,32,.98), rgba(7,11,19,.99));
        color:#e6eefc;
        font-family:system-ui,-apple-system,"Noto Sans KR",Segoe UI,Roboto,Arial,sans-serif;
      }
      .mw-denied-card{
        width:min(560px, calc(100vw - 28px));
        border:1px solid rgba(255,255,255,.12);
        border-radius:22px;
        background:#101827;
        box-shadow:0 24px 70px rgba(0,0,0,.46);
        padding:24px;
      }
      .mw-denied-card h2{
        margin:0 0 10px;
        font-size:24px;
        line-height:1.2;
      }
      .mw-denied-card p{
        margin:0;
        color:#b8c3d9;
        line-height:1.65;
        white-space:pre-wrap;
        font-size:14px;
      }
      .mw-denied-meta{
        margin-top:14px;
        padding:12px 14px;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        color:#e6eefc;
        font-size:13px;
        font-weight:800;
        line-height:1.6;
        word-break:break-word;
      }
      .mw-denied-actions{
        margin-top:18px;
        display:flex;
        gap:10px;
        justify-content:flex-end;
        flex-wrap:wrap;
      }
      .mw-denied-btn{
        height:40px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:#162744;
        color:#e6eefc;
        cursor:pointer;
        font-weight:900;
      }
      .mw-denied-btn:hover{background:#1a2f55}
      .mw-denied-btn.danger{
        background:rgba(107,27,27,.35);
        border-color:rgba(255,60,60,.22);
        color:#ffccd3;
      }
    `;
    document.head.appendChild(style);
  }

  function createMenuShell() {
    const backdrop = document.createElement("div");
    backdrop.className = "mw-board-backdrop";
    backdrop.id = "mwBoardBackdrop";

    const panel = document.createElement("div");
    panel.className = "mw-board-panel";
    panel.id = "mwBoardPanel";

    panel.innerHTML = `
      <div class="mw-board-head">
        <div class="mw-board-title">게시판</div>
        <button type="button" class="mw-board-close" id="mwBoardCloseBtn">닫기</button>
      </div>
      <div class="mw-board-body">
        <div class="mw-board-desc">권한이 있는 페이지까지만 표시됩니다.</div>
        <div class="mw-board-list" id="mwBoardList"></div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    return {
      backdrop,
      panel,
      list: panel.querySelector("#mwBoardList"),
      closeBtn: panel.querySelector("#mwBoardCloseBtn")
    };
  }

  function findTrigger() {
    return (
      document.getElementById("mwBoardMenuToggle") ||
      document.querySelector("[data-mw-board-toggle]") ||
      null
    );
  }

  function safeSetTrigger(trigger) {
    if (!trigger) return;
    trigger.setAttribute("href", "#");
    trigger.setAttribute("role", "button");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.style.cursor = "pointer";
  }

  function buildMenuHtml(access) {
    const items = PAGES.filter(page => canAccessPage(page, access));

    return items.map(page => {
      const current = isCurrentPage(page);
      const badgeText = pageBadge(page);
      const badge = badgeText ? `<span class="mw-board-badge">${escapeHtml(badgeText)}</span>` : "";

      return `
        <button
          type="button"
          class="mw-board-item ${current ? "current" : ""}"
          data-path="${escapeHtml(page.path)}"
        >
          <div class="mw-board-item-title">
            ${escapeHtml(page.label)} ${badge}
          </div>
          <div class="mw-board-item-sub">${escapeHtml(pageSubtext(page.path))}</div>
        </button>
      `;
    }).join("");
  }

  function showAccessDenied(page, access) {
    injectStyles();

    const old = document.getElementById("mwDeniedScreen");
    if (old) old.remove();

    const homePath = (window.MARUWELL_CONFIG || {})?.PATHS?.index || "/index.html";
    const loginPath = (window.MARUWELL_CONFIG || {})?.PATHS?.login || "/login.html";

    const email = access?.email || "-";
    const roleLevel = Number(access?.max_role_level || 0);
    const isMaroowell = access?.is_maroowell === true;
    const isAdmin = access?.is_admin === true;
    const isDragon = access?.is_dragon_car_admin === true;

    const screen = document.createElement("div");
    screen.id = "mwDeniedScreen";
    screen.className = "mw-denied-screen";
    screen.innerHTML = `
      <div class="mw-denied-card">
        <h2>접근 권한 없음</h2>
        <p>${escapeHtml(requirementText(page))}</p>
        <div class="mw-denied-meta">
          현재 계정: ${escapeHtml(email)}<br>
          마루웰: ${isMaroowell ? "O" : "X"} /
          관리자: ${isAdmin ? "O" : "X"} /
          role_level: ${roleLevel} /
          용차관리자: ${isDragon ? "O" : "X"}
        </div>
        <div class="mw-denied-actions">
          <button type="button" class="mw-denied-btn" id="mwDeniedHomeBtn">홈으로</button>
          <button type="button" class="mw-denied-btn danger" id="mwDeniedLoginBtn">${access?.signed_in ? "로그아웃" : "로그인"}</button>
        </div>
      </div>
    `;

    document.body.appendChild(screen);
    document.body.style.overflow = "hidden";

    const homeBtn = screen.querySelector("#mwDeniedHomeBtn");
    const loginBtn = screen.querySelector("#mwDeniedLoginBtn");

    homeBtn?.addEventListener("click", () => {
      location.href = homePath;
    });

    loginBtn?.addEventListener("click", async () => {
      try {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = (window.MARUWELL_CONFIG || {});
        if (access?.signed_in && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient) {
          const authStorage = (() => {
            try { return window.sessionStorage; } catch { return undefined; }
          })();

          const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
              persistSession: !!authStorage,
              storage: authStorage,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });

          await supabase.auth.signOut();
        }
      } catch {}

      location.href = loginPath;
    });
  }

  async function init() {
    injectStyles();

    const access = await loadAccess();
    const currentPage = findCurrentPage();

    if (currentPage && !canAccessPage(currentPage, access)) {
      showAccessDenied(currentPage, access);
      return;
    }

    const trigger = findTrigger();
    if (!trigger) return;

    if (MENU_MODE === "admin" && !canAccessPage(PAGES.find(p => p.key === "admin-access"), access)) {
      return;
    }

    safeSetTrigger(trigger);

    const ui = createMenuShell();
    ui.list.innerHTML = buildMenuHtml(access);

    let opened = false;

    function openMenu() {
      if (opened) return;
      opened = true;
      ui.backdrop.classList.add("open");
      ui.panel.classList.add("open");
      document.body.style.overflow = "hidden";
    }

    function closeMenu() {
      if (!opened) return;
      opened = false;
      ui.backdrop.classList.remove("open");
      ui.panel.classList.remove("open");
      document.body.style.overflow = "";
    }

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (opened) closeMenu();
      else openMenu();
    });

    ui.closeBtn.addEventListener("click", closeMenu);
    ui.backdrop.addEventListener("click", closeMenu);

    ui.list.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-path]");
      if (!btn) return;

      const path = btn.getAttribute("data-path") || "/";
      const page = PAGES.find(item => item.path === path);

      if (page && isCurrentPage(page)) {
        closeMenu();
        return;
      }

      closeMenu();
      setTimeout(() => {
        location.href = path;
      }, 80);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
