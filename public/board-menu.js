(() => {
  "use strict";

  if (window.__MW_BOARD_MENU_INIT__) return;
  window.__MW_BOARD_MENU_INIT__ = true;

  const PAGES = [
    ["우편번호 검색기", "/zipcode_search"],
    ["라우트 편집기", "/coupangRouteMap.html"],
    ["쿠팡 캠프 조회", "/coupang_camp"],
    ["프레시백 현황 조회", "/coupang_freshbag"],
    ["클렌징 히스토리", "/cleansing_history"],
    ["프레시백 현황 업로드", "/coupang_freshbag_upload"],
    ["마루웰 정보", "/maroowell_info"],
    ["마루웰 라우트정보", "/maroowell_route_info"],
    ["마루웰 입차 스케줄", "/maroowell_schedule"],
    ["마루웰 회수율", "/maroowell_freshbag_ratio"],
    ["마루웰 회수율 업로드", "/maroowell_freshbag_ratio_upload"],
    ["마루웰 라우트 단가", "/maroowell_route"],
    ["마루웰 정산", "/maroowell_payout"],
    ["정산 데이터 조회", "/maroowell_account"],
    ["정산 업로드", "/maroowell_account_upload"],
    ["용차", "/dragon_car_index"],
    ["용차 스케줄", "/dragon_car_schedule"],
    ["용차 정산서", "/dragon_car_pay"],
    ["관리자 권한 관리", "/admin_access.html"]
  ];

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizePath(path) {
    let p = String(path || "").replace(/[?#].*$/, "");
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p || "/";
  }

  function samePath(a, b) {
    const x = normalizePath(a);
    const y = normalizePath(b);
    return x === y || x + ".html" === y || x === y + ".html";
  }

  function injectStyle() {
    if (document.getElementById("mw-board-menu-style")) return;
    const style = document.createElement("style");
    style.id = "mw-board-menu-style";
    style.textContent = `
      .mw-board-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:99990;display:none}
      .mw-board-backdrop.open{display:block}
      .mw-board-panel{position:fixed;top:18px;left:18px;width:min(390px,calc(100vw - 36px));max-height:min(78vh,720px);overflow:auto;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(15,26,45,.98),rgba(8,14,26,.98));box-shadow:0 22px 80px rgba(0,0,0,.45);z-index:99991;display:none;color:#e6eefc;font-family:system-ui,-apple-system,"Noto Sans KR",Segoe UI,Roboto,Arial,sans-serif}
      .mw-board-panel.open{display:block}
      .mw-board-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
      .mw-board-title{font-size:16px;font-weight:900}.mw-board-close{height:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#d7e4ff;font-weight:900;cursor:pointer}
      .mw-board-body{padding:12px}.mw-board-desc{color:rgba(230,238,252,.68);font-size:12px;line-height:1.5;margin:0 2px 10px}.mw-board-list{display:grid;gap:10px}
      .mw-board-item{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:16px;padding:14px;color:#fff;cursor:pointer;text-align:left;width:100%;text-decoration:none}.mw-board-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)}.mw-board-item.current{border-color:rgba(96,165,250,.55);background:rgba(59,130,246,.14)}.mw-board-item-title{font-size:15px;font-weight:900;line-height:1.2}.mw-board-item-sub{font-size:12px;color:rgba(230,238,252,.66);line-height:1.45;margin-top:6px}
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyle();
    const trigger = document.getElementById("mwBoardMenuToggle") || document.querySelector("[data-mw-board-toggle]");
    if (!trigger) return;

    trigger.setAttribute("href", "#");
    trigger.setAttribute("role", "button");
    trigger.style.cursor = "pointer";

    document.getElementById("mwBoardBackdrop")?.remove();
    document.getElementById("mwBoardPanel")?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "mwBoardBackdrop";
    backdrop.className = "mw-board-backdrop";

    const panel = document.createElement("div");
    panel.id = "mwBoardPanel";
    panel.className = "mw-board-panel";
    panel.innerHTML = `
      <div class="mw-board-head">
        <div class="mw-board-title">게시판</div>
        <button type="button" class="mw-board-close" id="mwBoardCloseBtn">닫기</button>
      </div>
      <div class="mw-board-body">
        <div class="mw-board-desc">페이지를 선택하세요.</div>
        <div class="mw-board-list">
          ${PAGES.map(([label, path]) => `
            <button type="button" class="mw-board-item ${samePath(location.pathname, path) ? "current" : ""}" data-path="${esc(path)}">
              <div class="mw-board-item-title">${esc(label)}</div>
              <div class="mw-board-item-sub">${esc(path)}</div>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    let opened = false;
    const openMenu = () => { opened = true; backdrop.classList.add("open"); panel.classList.add("open"); document.body.style.overflow = "hidden"; };
    const closeMenu = () => { opened = false; backdrop.classList.remove("open"); panel.classList.remove("open"); document.body.style.overflow = ""; };

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      opened ? closeMenu() : openMenu();
    });

    backdrop.addEventListener("click", closeMenu);
    panel.querySelector("#mwBoardCloseBtn")?.addEventListener("click", closeMenu);
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-path]");
      if (!button) return;
      const path = button.getAttribute("data-path") || "/";
      closeMenu();
      if (!samePath(location.pathname, path)) location.href = path;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();