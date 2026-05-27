(() => {
  "use strict";

  if (window.__MW_BOARD_MENU_INIT__) return;
  window.__MW_BOARD_MENU_INIT__ = true;

  const PAGES = [
    { key:"zipcode_search", label:"우편번호 검색기", path:"/zipcode_search", aliases:["/zipcode_search","/zipcode_search.html"], public:true, desc:"우편번호 / 지도 조회" },
    { key:"route", label:"라우트 편집기", path:"/coupangRouteMap.html", aliases:["/coupangRouteMap","/coupangRouteMap.html"], public:true, desc:"라우트 / 벤더 / 입차지 편집" },
    { key:"coupang-camps", label:"쿠팡 캠프 조회", path:"/coupang_camp", aliases:["/coupang_camp","/coupang_camp.html"], public:true, desc:"쿠팡 캠프 / 주소조회" },
    { key:"freshbag-view", label:"프레시백 현황 조회", path:"/coupang_freshbag", aliases:["/coupang_freshbag","/coupang_freshbag.html"], public:true, desc:"프레시백 가중요인 현황 조회" },
    { key:"cleansing_history", label:"클렌징 히스토리", path:"/cleansing_history", aliases:["/cleansing_history","/cleansing_history.html"], requireClhi:true, desc:"클렌징 히스토리 조회" },
    { key:"freshbag-upload", label:"프레시백 현황 업로드", path:"/coupang_freshbag_upload", aliases:["/coupang_freshbag_upload","/coupang_freshbag_upload.html"], requireSuperAdmin:true, desc:"프레시백 엑셀 업로드" },
    { key:"info", label:"마루웰 정보", path:"/maroowell_info", aliases:["/maroowell_info","/maroowell_info.html"], requireRoleLevel:30, desc:"마루웰 기본 정보" },
    { key:"mw-route-info", label:"마루웰 라우트정보", path:"/maroowell_route_info", aliases:["/maroowell_route_info","/maroowell_route_info.html"], requireMaroowell:true, desc:"마루웰 라우트 정보 조회" },
    { key:"mw-schedule", label:"마루웰 입차 스케줄", path:"/maroowell_schedule", aliases:["/maroowell_schedule","/maroowell_schedule.html"], requireRoleLevel:30, desc:"마루웰 입차 스케줄" },
    { key:"mw-freshbag-ratio", label:"마루웰 회수율", path:"/maroowell_freshbag_ratio", aliases:["/maroowell_freshbag_ratio","/maroowell_freshbag_ratio.html"], requireMaroowell:true, desc:"마루웰 프레시백 회수율 조회" },
    { key:"mw-freshbag-ratio-upload", label:"마루웰 회수율 업로드", path:"/maroowell_freshbag_ratio_upload", aliases:["/maroowell_freshbag_ratio_upload","/maroowell_freshbag_ratio_upload.html"], requireSuperAdmin:true, desc:"마루웰 회수율 엑셀 업로드" },
    { key:"mw-route", label:"마루웰 라우트 단가", path:"/maroowell_route", aliases:["/maroowell_route","/maroowell_route.html"], requireRoleLevel:60, desc:"라우트 단가 / 주소 / 원청 관리" },
    { key:"mw-payout", label:"마루웰 정산", path:"/maroowell_payout", aliases:["/maroowell_payout","/maroowell_payout.html"], requireSuperAdmin:true, desc:"마루웰 정산 관리" },
    { key:"mw-account", label:"정산 데이터 조회", path:"/maroowell_account", aliases:["/maroowell_account","/maroowell_account.html"], requireRoleLevel:30, desc:"정산 통계 조회" },
    { key:"mw-account-upload", label:"정산 업로드", path:"/maroowell_account_upload", aliases:["/maroowell_account_upload","/maroowell_account_upload.html"], requireSuperAdmin:true, desc:"정산 업로드" },
    { key:"dragon-index", label:"용차", path:"/dragon_car_index", aliases:["/dragon_car_index","/dragon_car_index.html"], requireDragonCarAdmin:true, desc:"용차 관리" },
    { key:"dragon-schedule", label:"용차 스케줄", path:"/dragon_car_schedule", aliases:["/dragon_car_schedule","/dragon_car_schedule.html"], requireTeamOrDragonCarAdmin:true, desc:"용차 기사 출근 / 휴무 스케줄" },
    { key:"dragon-pay", label:"용차 정산서", path:"/dragon_car_pay", aliases:["/dragon_car_pay","/dragon_car_pay.html"], requireDragonCarAdmin:true, desc:"용차 정산서" },
    { key:"admin-access", label:"관리자 권한 관리", path:"/admin_access.html", aliases:["/admin_access","/admin_access.html","/maroowell_access"], requireSuperAdmin:true, desc:"사용자 / 관리자 권한 관리" }
  ];

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
      try {
        value = new URL(value).pathname || "/";
      } catch {
        return "/";
      }
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
    user_id: "",
    email: "",
    is_maroowell: false,
    is_admin: false,
    max_role_level: 0,
    is_dragon_car_admin: false,
    can_clhi: false,
    signed_in: false
  });

  const isSuper = access =>
    access?.is_maroowell === true &&
    access?.is_admin === true &&
    Number(access?.max_role_level || 0) >= 90;

  function canAccessPage(page, access) {
    if (!page || page.public) return true;

    const mw = access?.is_maroowell === true;
    const role = Number(access?.max_role_level || 0);
    const dragon = access?.is_dragon_car_admin === true;

    if (page.requireSuperAdmin) return isSuper(access);
    if (page.requireClhi) return isSuper(access) || access?.can_clhi === true;
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

  async function loadAccess() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.MARUWELL_CONFIG || {};
    const out = defaultAccess();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) return out;

    const storage = (() => {
      try {
        return sessionStorage;
      } catch {
        return undefined;
      }
    })();

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: !!storage,
        storage,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    try {
      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData?.session;
      const uid = session?.user?.id;

      if (!uid) return out;

      out.signed_in = true;
      out.user_id = uid;
      out.email = session?.user?.email || "";

      const { data } = await sb.rpc("mw_my_access").maybeSingle();

      if (data) {
        out.is_maroowell = data.is_maroowell === true;
        out.is_admin = data.is_admin === true;
        out.max_role_level = Number(data.max_role_level || 0);
        out.is_dragon_car_admin = data.is_dragon_car_admin === true;
      }

      if (isSuper(out)) {
        out.can_clhi = true;
      } else {
        const { data: clhi } = await sb
          .from("cleansing_history_access")
          .select("can_select")
          .eq("user_id", uid)
          .maybeSingle();

        out.can_clhi = clhi?.can_select === true;
      }

      return out;
    } catch {
      return out;
    }
  }

  function injectStyles() {
    if (document.getElementById("mw-board-menu-style")) return;

    const style = document.createElement("style");
    style.id = "mw-board-menu-style";
    style.textContent = `
      .mw-board-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);z-index:99990;display:none}
      .mw-board-backdrop.open{display:block}
      .mw-board-panel{position:fixed;top:18px;left:18px;width:min(380px,calc(100vw - 36px));max-height:min(78vh,720px);overflow:auto;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(15,26,45,.98),rgba(8,14,26,.98));box-shadow:0 22px 80px rgba(0,0,0,.45);z-index:99991;display:none}
      .mw-board-panel.open{display:block}
      .mw-board-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
      .mw-board-title{font-size:16px;font-weight:900;color:#eef4ff}
      .mw-board-close{height:34px;min-width:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#d7e4ff;font-weight:900;cursor:pointer}
      .mw-board-body{padding:12px}
      .mw-board-desc{color:rgba(230,238,252,.68);font-size:12px;line-height:1.5;margin:0 2px 10px}
      .mw-board-list{display:grid;gap:10px}
      .mw-board-item{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:16px;padding:14px;color:#fff;cursor:pointer;text-align:left;width:100%;text-decoration:none;display:block}
      .mw-board-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)}
      .mw-board-item.current{border-color:rgba(96,165,250,.55);background:rgba(59,130,246,.14);box-shadow:inset 0 0 0 1px rgba(96,165,250,.22)}
      .mw-board-item-title{font-size:15px;font-weight:900;line-height:1.2;margin-bottom:6px}
      .mw-board-item-sub{font-size:12px;color:rgba(230,238,252,.66);line-height:1.45}
      .mw-board-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#dbe7ff;font-size:11px;font-weight:900;vertical-align:middle}
      .mw-denied-screen{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(180deg,rgba(11,18,32,.98),rgba(7,11,19,.99));color:#e6eefc;font-family:system-ui,-apple-system,'Noto Sans KR',Segoe UI,Roboto,Arial,sans-serif}
      .mw-denied-card{width:min(560px,calc(100vw - 28px));border:1px solid rgba(255,255,255,.12);border-radius:22px;background:#101827;box-shadow:0 24px 70px rgba(0,0,0,.46);padding:24px}
      .mw-denied-card h2{margin:0 0 10px;font-size:24px}
      .mw-denied-card p{margin:0;color:#b8c3d9;line-height:1.65;white-space:pre-wrap;font-size:14px}
      .mw-denied-meta{margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:#e6eefc;font-size:13px;font-weight:800;line-height:1.6;word-break:break-word}
      .mw-denied-actions{margin-top:18px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
      .mw-denied-btn{height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:#162744;color:#e6eefc;cursor:pointer;font-weight:900}
      .mw-denied-btn.danger{background:rgba(107,27,27,.35);border-color:rgba(255,60,60,.22);color:#ffccd3}
    `;
    document.head.appendChild(style);
  }

  function showDenied(page, access) {
    injectStyles();

    document.body.innerHTML = `
      <div class="mw-denied-screen">
        <div class="mw-denied-card">
          <h2>접근 권한 없음</h2>
          <p>${esc(requirementText(page))}</p>
          <div class="mw-denied-meta">현재 계정: ${esc(access?.email || "로그인 확인 불가")}</div>
          <div class="mw-denied-actions">
            <button class="mw-denied-btn" id="mwDeniedHome">홈으로</button>
            <button class="mw-denied-btn danger" id="mwDeniedLogin">로그인</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("mwDeniedHome")?.addEventListener("click", () => {
      location.href = "/zipcode_search";
    });

    document.getElementById("mwDeniedLogin")?.addEventListener("click", () => {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`;
    });
  }

  function renderMenu(access) {
    injectStyles();

    const backdrop = document.createElement("div");
    backdrop.className = "mw-board-backdrop";

    const panel = document.createElement("div");
    panel.className = "mw-board-panel";

    const visiblePages = PAGES.filter(page => canAccessPage(page, access));
    const current = findCurrentPage();

    panel.innerHTML = `
      <div class="mw-board-head">
        <div class="mw-board-title">마루웰 메뉴</div>
        <button type="button" class="mw-board-close">닫기</button>
      </div>
      <div class="mw-board-body">
        <p class="mw-board-desc">접근 가능한 페이지가 표시됩니다.</p>
        <div class="mw-board-list">
          ${visiblePages.map(page => `
            <a class="mw-board-item ${current?.key === page.key ? "current" : ""}" href="${esc(page.path)}">
              <div class="mw-board-item-title">
                ${esc(page.label)}
                ${pageBadge(page) ? `<span class="mw-board-badge">${esc(pageBadge(page))}</span>` : ""}
              </div>
              <div class="mw-board-item-sub">${esc(page.desc || "")}</div>
            </a>
          `).join("")}
        </div>
      </div>
    `;

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
    const access = await loadAccess();

    if (current && !canAccessPage(current, access)) {
      showDenied(current, access);
      return;
    }

    renderMenu(access);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
