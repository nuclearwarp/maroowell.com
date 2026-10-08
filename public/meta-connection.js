(() => {
  "use strict";
  if (window.__MW_META_CONNECTION__) return;
  window.__MW_META_CONNECTION__ = true;
  const SUPA = "https://rgqerimdxkthkcewqbbe.supabase.co";
  const KEY = ["sb_publishable_", "FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H"].join("");
  let sb, panel, label, detail, reloadButton, busy = false;
  const first = data => Array.isArray(data) ? data[0] : data;
  async function reload() {
    if (busy || !sb || !panel || document.hidden) return;
    busy = true;
    reloadButton.disabled = true;
    try {
      const { data, error } = await sb.rpc("mw_meta_collector_state");
      if (error) throw error;
      const state = first(data);
      if (!state) throw new Error("수집 상태 조회 권한을 확인해 주세요.");
      const expired = state.status === "expired";
      const healthy = state.status === "active" && !state.paused;
      panel.dataset.state = healthy ? "active" : "warning";
      label.textContent = state.paused ? "자동 수집 정지됨" : expired ? "META 세션 복구 중" : healthy ? "META 자동 수집 연결됨" : "META 수집 상태 확인 필요";
      const time = state.last_success_at ? new Date(state.last_success_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "없음";
      detail.textContent = expired ? "백엔드 세션 복구가 필요합니다. 기존 수집 데이터는 유지됩니다." : state.paused ? "자동 수집이 정지된 상태입니다." : healthy ? `마지막 성공 확인: ${time}` : "백엔드 수집 상태를 확인하는 중입니다.";
      panel.title = state.last_error || "";
    } catch (error) {
      panel.dataset.state = "warning";
      label.textContent = "META 상태 확인 실패";
      detail.textContent = error.message || "상태 조회를 다시 시도하세요.";
    } finally {
      busy = false;
      reloadButton.disabled = false;
    }
  }
  async function boot() {
    if (!window.supabase?.createClient) return;
    sb = window.supabase.createClient(SUPA, KEY, { auth: { persistSession: true, storage: sessionStorage, autoRefreshToken: true, detectSessionInUrl: false } });
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError || !sessionData?.session) return;
    const [accessResult, accountResult] = await Promise.all([sb.rpc("mw_my_access").maybeSingle(), sb.rpc("mw_my_account_state").maybeSingle()]);
    if (accessResult.error || accountResult.error) return;
    const access = first(accessResult.data), account = first(accountResult.data);
    if (!access?.is_maroowell || Number(access.max_role_level || 0) < 30 || account?.approval_status !== "approved" || account?.app_only === true) return;
    const style = document.createElement("style");
    style.textContent = '.mwMetaConnection{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:13px 15px;margin:0 0 12px;border:1px solid #cbd5e1;border-radius:14px;background:#fff}.mwMetaConnection[data-state="warning"]{background:#fff7ed;border-color:#fb923c}.mwMetaConnection strong{font-size:14px;color:#172b36}.mwMetaConnection p{font-size:12px;margin:5px 0 0;line-height:1.5;color:#475569}.mwMetaConnectionActions{display:flex;gap:8px;flex-wrap:wrap}.mwMetaConnection a,.mwMetaConnection button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#17364a;text-decoration:none;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.mwMetaConnection a{background:#17364a;color:#fff;border-color:#17364a}@media(max-width:640px){.mwMetaConnectionActions{width:100%}.mwMetaConnectionActions>*{flex:1}}';
    document.head.append(style);
    panel = document.createElement("section");
    panel.className = "mwMetaConnection";
    panel.setAttribute("aria-live", "polite");
    const text = document.createElement("div");
    label = document.createElement("strong");
    detail = document.createElement("p");
    label.textContent = "META 연결 상태 확인 중";
    text.append(label, detail);
    const actions = document.createElement("div");
    actions.className = "mwMetaConnectionActions";
    reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = "연결 상태 확인";
    reloadButton.addEventListener("click", reload);
    actions.append(reloadButton);
    panel.append(text, actions);
    const header = document.querySelector("header.topbar");
    if (header) header.after(panel); else document.querySelector("main")?.prepend(panel);
    await reload();
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reload(); });
    window.setInterval(reload, 60000);
  }
  const start = () => boot().catch(error => console.warn("META connection UI:", error?.message));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
