(() => {
  "use strict";
  if (window.__MW_META_CONNECTION__) return;
  window.__MW_META_CONNECTION__ = true;
  const SUPA = "https://rgqerimdxkthkcewqbbe.supabase.co";
  const KEY = ["sb_publishable_", "FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H"].join("");
  const LOGIN = "https://meta-direct-poc.brain-0f6.workers.dev/login-send-code";
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
      label.textContent = state.paused ? "자동 수집 정지됨" : expired ? "META 세션 만료 · 재로그인 필요" : healthy ? "META 세션 연결됨" : "META 수집 오류 · 연결 확인 필요";
      const time = state.last_success_at ? new Date(state.last_success_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "없음";
      detail.textContent = expired ? "오른쪽 META 재로그인에서 문자 인증을 완료하세요. 기존 수집 데이터는 유지됩니다." : state.paused ? "수집 정지 상태입니다. 로그인 완료 후에도 수집 재개 버튼을 별도로 확인해 주세요." : healthy ? `마지막 성공 확인: ${time}` : "정상 수집으로 표시하지 않습니다. META 재로그인 후 상태를 다시 확인해 주세요.";
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
    const admin = access.is_admin === true && Number(access.max_role_level || 0) >= 90;
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
    if (admin) {
      const login = document.createElement("a");
      login.href = LOGIN;
      login.target = "_blank";
      login.rel = "noopener noreferrer";
      login.textContent = "META 재로그인";
      login.title = "휴대폰에서도 새 창에서 문자 인증할 수 있습니다.";
      actions.append(login);
    }
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
