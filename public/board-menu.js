(() => {
  "use strict";

  if (window.__MW_BOARD_MENU_INIT__) return;
  window.__MW_BOARD_MENU_INIT__ = true;

  const MENU_MODE = window.MW_BOARD_MENU_MODE || "public"; 
  // "public"  -> index, coupangRouteMap
  // "admin"   -> maroowell_info, dragon_car_index, dragon_car_pay

  const PAGES = [
    { key: "index", label: "우편번호 검색기", path: "/index.html", adminOnly: false },
    { key: "route", label: "라우트 편집기", path: "/coupangRouteMap.html", adminOnly: false },
    { key: "info", label: "마루웰 정보", path: "/maroowell_info.html", adminOnly: true },
    { key: "dragon-index", label: "용차", path: "/dragon_car_index.html", adminOnly: true },
    { key: "dragon-pay", label: "용차 정산", path: "/dragon_car_pay.html", adminOnly: true }
  ];

  function normalizePath(path) {
    const p = String(path || "").trim();
    if (!p) return "/";
    return p.endsWith("/") ? p.slice(0, -1) : p;
  }

  function getCurrentPath() {
    return normalizePath(location.pathname || "/");
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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

      .mw-board-backdrop.open{
        display:block;
      }

      .mw-board-panel{
        position:fixed;
        top:18px;
        left:18px;
        width:min(360px, calc(100vw - 36px));
        max-height:min(78vh, 720px);
        overflow:auto;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.12);
        background:linear-gradient(180deg, rgba(15,26,45,.98), rgba(8,14,26,.98));
        box-shadow:0 22px 80px rgba(0,0,0,.45);
        z-index:99991;
        display:none;
      }

      .mw-board-panel.open{
        display:block;
      }

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

      .mw-board-close:hover{
        background:rgba(255,255,255,.12);
      }

      .mw-board-body{
        padding:12px;
      }

      .mw-board-desc{
        color:rgba(230,238,252,.68);
        font-size:12px;
        line-height:1.5;
        margin:0 2px 10px;
      }

      .mw-board-list{
        display:grid;
        gap:10px;
      }

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
        <div class="mw-board-desc">원하는 페이지를 눌러 이동할 수 있습니다.</div>
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

  function pageSubtext(path) {
    switch (path) {
      case "/index.html":
        return "우편번호 / 지도 조회";
      case "/coupangRouteMap.html":
        return "라우트 / 벤더 / 입차지 편집";
      case "/maroowell_info.html":
        return "직원 / 정산 베이스 정보";
      case "/dragon_car_index.html":
        return "용차 관리";
      case "/dragon_car_pay.html":
        return "월별 업체 / 기사 정산서";
      default:
        return "";
    }
  }

  async function loadAccess() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = (window.MARUWELL_CONFIG || {});
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
      return { is_maroowell: false, is_admin: false };
    }

    const authStorage = (() => {
      try { return window.sessionStorage; } catch {}
      return null;
    })();

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: !!authStorage,
        storage: authStorage || undefined,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return { is_maroowell: false, is_admin: false };

      const { data, error } = await supabase
        .from("user_access")
        .select("is_maroowell,is_admin")
        .eq("user_id", uid)
        .maybeSingle();

      if (error || !data) {
        return { is_maroowell: false, is_admin: false };
      }

      return {
        is_maroowell: data.is_maroowell === true,
        is_admin: data.is_admin === true
      };
    } catch {
      return { is_maroowell: false, is_admin: false };
    }
  }

  function buildMenuHtml(canSeeAdmin) {
    const currentPath = getCurrentPath();

    const items = PAGES.filter(page => {
      if (!page.adminOnly) return true;
      return canSeeAdmin;
    });

    return items.map(page => {
      const isCurrent = normalizePath(page.path) === currentPath;
      const badge = page.adminOnly ? `<span class="mw-board-badge">관리자</span>` : "";
      return `
        <button
          type="button"
          class="mw-board-item ${isCurrent ? "current" : ""}"
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

  async function init() {
    const trigger = findTrigger();
    if (!trigger) return;

    const access = await loadAccess();
    const canSeeAdminBoards = access.is_maroowell && access.is_admin;

    if (MENU_MODE === "admin" && !canSeeAdminBoards) {
      return;
    }

    injectStyles();
    safeSetTrigger(trigger);

    const ui = createMenuShell();
    ui.list.innerHTML = buildMenuHtml(canSeeAdminBoards);

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
      const currentPath = getCurrentPath();

      if (normalizePath(path) === currentPath) {
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
