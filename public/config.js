// MarooWell Frontend Config
// ✅ 여기에 Supabase Project URL / Anon(public) Key만 넣으세요.
// ⚠️ service_role key(비공개/서버용)는 절대 넣으면 안 됩니다.

window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H",
  ADMIN_API_BASE: "https://admin-access.maroowell.com",
  CLEANSING_HISTORY_API_BASE: "https://cleansinghistory.maroowell.com",

  PATHS: {
    // login.html을 index.html로 바꿨으므로 기본 로그인 진입점은 루트
    login: "/",

    // 기존 index.html 우편번호 검색기를 public/zipcode_search로 옮겼으므로
    index: "/zipcode_search",

    route: "/coupangRouteMap.html",
    dragon_car_index: "/dragon_car_index.html",
    maroowell_info: "/maroowell_info.html",
  }
};

(() => {
  "use strict";

  const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
  const isFreshbagPage = path === "/coupang_freshbag" || path === "/coupang_freshbag.html";

  if (!isFreshbagPage) return;
  if (window.__MW_FRESHBAG_UPLOAD_SWITCH__) return;
  window.__MW_FRESHBAG_UPLOAD_SWITCH__ = true;

  function initFreshbagUploadSwitch() {
    const wrap = document.querySelector(".wrap");
    const top = wrap?.querySelector(":scope > .top");
    const userPill = document.getElementById("userPill");

    if (!wrap || !top || !userPill || document.getElementById("mwFreshbagUploadSwitchBtn")) return;

    const style = document.createElement("style");
    style.id = "mwFreshbagUploadSwitchStyle";
    style.textContent = `
      .mw-freshbag-upload-switch-btn{
        min-height:32px!important;
        height:32px!important;
        padding:0 13px!important;
        border-radius:999px!important;
        border:1px solid #bfdbfe!important;
        background:#eff6ff!important;
        color:#1d4ed8!important;
        font-size:12px!important;
        font-weight:800!important;
        box-shadow:0 6px 14px rgba(15,23,42,.06)!important;
        white-space:nowrap!important;
      }
      .mw-freshbag-upload-switch-btn.is-upload{
        border-color:#bbf7d0!important;
        background:#f0fdf4!important;
        color:#15803d!important;
      }
      #mwFreshbagViewPanel[hidden],#mwFreshbagUploadPanel[hidden]{display:none!important}
      #mwFreshbagUploadPanel{display:block;margin-top:0}
      .mw-freshbag-upload-frame{
        display:block;
        width:100%;
        height:calc(100vh - 112px);
        min-height:720px;
        border:0;
        border-radius:20px;
        background:#f6f8fc;
        box-shadow:0 12px 30px rgba(15,23,42,.08);
      }
      @media(max-width:900px){
        .mw-freshbag-upload-switch-btn{height:30px!important;min-height:30px!important;padding:0 10px!important;font-size:11px!important}
        .mw-freshbag-upload-frame{height:calc(100vh - 160px);min-height:680px;border-radius:18px}
      }
    `;
    document.head.appendChild(style);

    const viewPanel = document.createElement("div");
    viewPanel.id = "mwFreshbagViewPanel";

    let node = top.nextSibling;
    while (node) {
      const next = node.nextSibling;
      viewPanel.appendChild(node);
      node = next;
    }
    wrap.appendChild(viewPanel);

    const uploadPanel = document.createElement("div");
    uploadPanel.id = "mwFreshbagUploadPanel";
    uploadPanel.hidden = true;
    uploadPanel.innerHTML = `
      <iframe
        id="mwFreshbagUploadFrame"
        class="mw-freshbag-upload-frame"
        title="프레시백 현황 업로드"
        data-src="/coupang_freshbag_upload"
        loading="lazy"
      ></iframe>
    `;
    wrap.appendChild(uploadPanel);

    const btn = document.createElement("button");
    btn.id = "mwFreshbagUploadSwitchBtn";
    btn.type = "button";
    btn.className = "mw-freshbag-upload-switch-btn";
    btn.textContent = "Upload";
    userPill.parentNode.insertBefore(btn, userPill);

    const titleEl = top.querySelector(".title");
    const subEl = top.querySelector(".sub");
    const viewTitle = titleEl?.textContent || "프레시백 현황 조회";
    const viewSub = subEl?.textContent || "";

    function setMode(mode, updateHash = true) {
      const uploadMode = mode === "upload";
      const frame = document.getElementById("mwFreshbagUploadFrame");

      viewPanel.hidden = uploadMode;
      uploadPanel.hidden = !uploadMode;
      btn.textContent = uploadMode ? "View" : "Upload";
      btn.classList.toggle("is-upload", uploadMode);
      btn.setAttribute("aria-pressed", uploadMode ? "true" : "false");

      if (titleEl) titleEl.textContent = uploadMode ? "프레시백 현황 업로드" : viewTitle;
      if (subEl) subEl.textContent = uploadMode ? "엑셀 업로드 화면입니다. View 버튼을 누르면 조회 화면으로 돌아갑니다." : viewSub;

      if (uploadMode && frame && !frame.getAttribute("src")) {
        frame.setAttribute("src", frame.dataset.src || "/coupang_freshbag_upload");
      }

      if (updateHash && window.history?.replaceState) {
        history.replaceState(null, "", `${location.pathname}${location.search}${uploadMode ? "#upload" : ""}`);
      }
    }

    btn.addEventListener("click", () => setMode(uploadPanel.hidden ? "upload" : "view"));

    if (location.hash === "#upload") setMode("upload", false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFreshbagUploadSwitch, { once:true });
  } else {
    initFreshbagUploadSwitch();
  }
})();
