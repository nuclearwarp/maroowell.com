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
    dragon_car_pay: "/dragon_car_pay.html",
    maroowell_payout: "/maroowell_payout",
    maroowell_route: "/maroowell_route",
    cleansing_history: "/cleansing_history",
    admin_access: "/admin_access.html"
  }
};

(() => {
  "use strict";

  const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
  if (path !== "/cleansing_history" && path !== "/cleansing_history.html") return;

  const PATCH_ID = "mw-clhi-page-fix-20260608";
  const MODAL_ID = "clhiVendorAddModal";

  const numericValue = value => {
    const text = String(value ?? "").replace(/[,%₩,\s]/g, "").trim();
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  };

  function injectCleansingHistoryFixStyle() {
    if (document.getElementById(PATCH_ID)) return;

    const style = document.createElement("style");
    style.id = PATCH_ID;
    style.textContent = `
      .zipCell .zipLink,
      .zipLink,
      tbody tr.rowClean .zipLink,
      tbody tr.rowWarn .zipLink,
      tbody tr.rowClean .zipCell .zipLink,
      tbody tr.rowWarn .zipCell .zipLink{
        color:#0f172a!important;
        text-decoration:none!important;
        text-underline-offset:0!important;
        font-weight:300!important;
      }

      .zipCell .zipLink:hover,
      .zipLink:hover{
        color:#0f172a!important;
        text-decoration:none!important;
      }

      .main{
        overflow:auto!important;
        max-width:100vw!important;
        -webkit-overflow-scrolling:touch!important;
        scrollbar-gutter:stable both-edges!important;
      }

      .board{
        width:max-content!important;
        min-width:max-content!important;
        max-width:none!important;
        overflow:visible!important;
      }

      #table{
        display:block!important;
        width:max-content!important;
        min-width:max-content!important;
        max-width:none!important;
        overflow:visible!important;
      }

      #table > table{
        width:max-content!important;
        min-width:max-content!important;
        max-width:none!important;
        table-layout:fixed!important;
      }

      .head{
        min-width:1180px!important;
      }

      .clhi-vendor-add{
        min-width:112px!important;
      }

      .clhi-modal-backdrop{
        position:fixed;
        inset:0;
        z-index:2147483500;
        display:none;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:rgba(15,23,42,.28);
        backdrop-filter:blur(4px);
      }

      .clhi-modal-backdrop.open{
        display:flex;
      }

      .clhi-modal{
        width:min(760px,calc(100vw - 24px));
        max-height:min(86vh,760px);
        overflow:auto;
        border:1px solid #d8e0ee;
        border-radius:22px;
        background:#ffffff;
        box-shadow:0 24px 80px rgba(15,23,42,.22);
        color:#0f172a;
        font-family:"문경감홍사과체","Noto Sans KR",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }

      .clhi-modal-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding:18px 20px 12px;
        border-bottom:1px solid #d8e0ee;
      }

      .clhi-modal-head h3{
        margin:0;
        font-size:20px;
        line-height:1.2;
        font-weight:420;
        letter-spacing:-.04em;
      }

      .clhi-modal-head p{
        margin:5px 0 0;
        color:#64748b;
        font-size:11px;
        font-weight:300;
      }

      .clhi-modal-close{
        width:34px;
        height:34px;
        border-radius:999px;
        border:1px solid #cbd5e1;
        background:#ffffff;
        color:#0f172a;
        cursor:pointer;
        font-size:12px;
        font-weight:400;
      }

      .clhi-modal-body{
        padding:16px 20px 18px;
      }

      .clhi-form-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:11px;
      }

      .clhi-form-field label{
        display:block;
        margin:0 0 5px 2px;
        color:#64748b;
        font-size:10px;
        font-weight:300;
      }

      .clhi-form-field input,
      .clhi-form-field select{
        width:100%;
        height:34px;
        border-radius:10px;
        border:1px solid #cbd5e1;
        background:#f8fafc;
        color:#0f172a;
        padding:0 9px;
        outline:none;
        font-size:11px;
        font-weight:300;
      }

      .clhi-form-field input:focus,
      .clhi-form-field select:focus{
        border-color:#60a5fa;
        background:#ffffff;
        box-shadow:0 0 0 3px rgba(37,99,235,.12);
      }

      .clhi-modal-actions{
        display:flex;
        justify-content:flex-end;
        gap:8px;
        margin-top:16px;
      }

      .clhi-modal-btn{
        height:36px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid #cbd5e1;
        background:#ffffff;
        color:#0f172a;
        cursor:pointer;
        font-size:11px;
        font-weight:400;
      }

      .clhi-modal-btn.save{
        border-color:#16a34a;
        background:linear-gradient(180deg,#22c55e,#16a34a);
        color:#ffffff;
      }

      .clhi-modal-status{
        margin-top:11px;
        min-height:18px;
        color:#64748b;
        font-size:11px;
        line-height:1.45;
        font-weight:300;
        white-space:pre-wrap;
      }

      .clhi-modal-status.err{
        color:#dc2626;
      }

      @media(max-width:720px){
        .clhi-form-grid{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }
      }

      @media(max-width:460px){
        .clhi-form-grid{
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function currentValue(id, fallback = "") {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : fallback;
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "clhi-modal-backdrop";
    modal.innerHTML = `
      <div class="clhi-modal" role="dialog" aria-modal="true" aria-label="신규 벤더 추가">
        <div class="clhi-modal-head">
          <div>
            <h3>신규 벤더 추가</h3>
            <p>week / camp / wave / route는 필수입니다. 저장 후 현재 조건으로 다시 조회합니다.</p>
          </div>
          <button type="button" class="clhi-modal-close" data-clhi-close="1">닫기</button>
        </div>
        <div class="clhi-modal-body">
          <div class="clhi-form-grid">
            <div class="clhi-form-field"><label>Week *</label><input data-clhi-field="week" placeholder="예: 2026 - 23W"></div>
            <div class="clhi-form-field"><label>Camp *</label><input data-clhi-field="camp" placeholder="예: 구리3"></div>
            <div class="clhi-form-field"><label>Wave *</label><select data-clhi-field="wave"><option value="2W">주간</option><option value="1W">야간</option></select></div>
            <div class="clhi-form-field"><label>Route *</label><input data-clhi-field="route" placeholder="예: 608A, 608B"></div>
            <div class="clhi-form-field"><label>우편번호</label><input data-clhi-field="zip" placeholder="예: 02443 02442"></div>
            <div class="clhi-form-field"><label>배송 필요</label><input data-clhi-field="demand" inputmode="numeric"></div>
            <div class="clhi-form-field"><label>배송 완료</label><input data-clhi-field="complete" inputmode="numeric"></div>
            <div class="clhi-form-field"><label>수행률</label><input data-clhi-field="execution_rate" inputmode="decimal" placeholder="예: 97.71"></div>
            <div class="clhi-form-field"><label>등급</label><input data-clhi-field="execution_rate_grade" placeholder="예: 2등급"></div>
            <div class="clhi-form-field"><label>사유</label><select data-clhi-field="reason"><option value="수행률">수행률</option><option value="반품">반품</option><option value="">없음</option></select></div>
            <div class="clhi-form-field"><label>단가</label><input data-clhi-field="price" inputmode="numeric"></div>
            <div class="clhi-form-field"><label>벤더사</label><input data-clhi-field="vendor_name"></div>
            <div class="clhi-form-field"><label>사업자번호</label><input data-clhi-field="business_number"></div>
          </div>
          <div class="clhi-modal-status" data-clhi-status="1"></div>
          <div class="clhi-modal-actions">
            <button type="button" class="clhi-modal-btn" data-clhi-close="1">취소</button>
            <button type="button" class="clhi-modal-btn save" data-clhi-save="1">저장</button>
          </div>
        </div>
      </div>
    `;

    modal.addEventListener("click", event => {
      if (event.target === modal || event.target.closest("[data-clhi-close]")) {
        closeVendorModal();
      }
    });

    modal.querySelector("[data-clhi-save]")?.addEventListener("click", () => {
      saveVendorFromModal().catch(err => {
        const status = modal.querySelector("[data-clhi-status]");
        if (status) {
          status.classList.add("err");
          status.textContent = err?.message || String(err);
        }
      });
    });

    document.body.appendChild(modal);
    return modal;
  }

  function setModalField(name, value) {
    const modal = ensureModal();
    const field = modal.querySelector(`[data-clhi-field="${name}"]`);
    if (field) field.value = value || "";
  }

  function getModalField(name) {
    const modal = ensureModal();
    const field = modal.querySelector(`[data-clhi-field="${name}"]`);
    return field ? String(field.value || "").trim() : "";
  }

  function openVendorModal() {
    injectCleansingHistoryFixStyle();
    const modal = ensureModal();
    modal.querySelector("[data-clhi-status]")?.classList.remove("err");
    const status = modal.querySelector("[data-clhi-status]");
    if (status) status.textContent = "";

    setModalField("week", currentValue("week"));
    setModalField("camp", currentValue("camp"));
    setModalField("wave", currentValue("wave") || "2W");
    setModalField("route", currentValue("route"));
    setModalField("vendor_name", currentValue("vendor"));
    setModalField("business_number", currentValue("biz"));
    setModalField("reason", currentValue("reason") || "수행률");

    modal.classList.add("open");
    requestAnimationFrame(() => modal.querySelector('[data-clhi-field="week"]')?.focus());
  }

  function closeVendorModal() {
    document.getElementById(MODAL_ID)?.classList.remove("open");
  }

  async function getAccessToken() {
    const cfg = window.MARUWELL_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase?.createClient) {
      throw new Error("Supabase 설정을 확인할 수 없습니다.");
    }

    const storage = (() => {
      try { return window.sessionStorage; } catch { return undefined; }
    })();

    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth:{
        persistSession:!!storage,
        storage,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다.");
    return token;
  }

  function modalPatch() {
    const patch = {
      week:getModalField("week") || null,
      camp:getModalField("camp") || null,
      wave:getModalField("wave") || null,
      route:getModalField("route") || null,
      zip:getModalField("zip") || null,
      demand:numericValue(getModalField("demand")),
      complete:numericValue(getModalField("complete")),
      execution_rate:numericValue(getModalField("execution_rate")),
      execution_rate_grade:getModalField("execution_rate_grade") || null,
      reason:getModalField("reason") || null,
      price:numericValue(getModalField("price")),
      vendor_name:getModalField("vendor_name") || null,
      business_number:getModalField("business_number") || null
    };

    if (!patch.week || !patch.camp || !patch.wave || !patch.route) {
      throw new Error("Week / Camp / Wave / Route는 필수입니다.");
    }

    return patch;
  }

  async function saveVendorFromModal() {
    const modal = ensureModal();
    const status = modal.querySelector("[data-clhi-status]");
    const saveButton = modal.querySelector("[data-clhi-save]");
    const patch = modalPatch();
    const cfg = window.MARUWELL_CONFIG || {};
    const apiBase = String(cfg.CLEANSING_HISTORY_API_BASE || "https://cleansinghistory.maroowell.com").replace(/\/+$/, "");
    const token = await getAccessToken();

    if (status) {
      status.classList.remove("err");
      status.textContent = "저장 중...";
    }
    if (saveButton) saveButton.disabled = true;

    try {
      const res = await fetch(apiBase + "/api/cleansing-history", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer " + token
        },
        body:JSON.stringify(patch)
      });

      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }

      if (!res.ok || data?.ok === false) {
        const detail = typeof data === "object" ? (data.error || data.message || data.detail) : data;
        throw new Error(String(detail || "신규 벤더 저장 실패"));
      }

      if (status) status.textContent = "저장 완료. 다시 조회합니다.";
      closeVendorModal();
      document.getElementById("search")?.click();
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  function patchCleansingHistoryPage() {
    injectCleansingHistoryFixStyle();

    const addButton = document.getElementById("add");
    if (addButton && addButton.dataset.clhiVendorPatch !== "1") {
      addButton.dataset.clhiVendorPatch = "1";
      addButton.textContent = "신규 벤더 추가";
      addButton.classList.add("clhi-vendor-add");
      addButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        openVendorModal();
      }, true);
    }
  }

  function schedulePatch() {
    let count = 0;
    const run = () => {
      patchCleansingHistoryPage();
      count += 1;
      if (count < 8) window.setTimeout(run, 250);
    };
    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(schedulePatch, 300), { once:true });
  } else {
    window.setTimeout(schedulePatch, 300);
  }

  window.addEventListener("load", () => window.setTimeout(schedulePatch, 300), { once:true });
})();
