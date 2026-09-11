(() => {
  "use strict";
  if (window.__MW_HOME_META_BRIDGE_V24__) return;
  window.__MW_HOME_META_BRIDGE_V24__ = true;

  const ALLOWED = new Set(["status", "search", "login"]);

  function reply(id, ok, value) {
    window.postMessage(ok
      ? { source:"maroowell-meta-extension", version:24, id, ok:true, result:value || {} }
      : { source:"maroowell-meta-extension", version:24, id, ok:false, error:String(value?.message || value || "META 브리지 오류") },
      location.origin);
  }

  function runtimeReady() {
    try { return !!chrome?.runtime?.id; } catch (_) { return false; }
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data || {};
    if (msg.source !== "maroowell-home-page" || !msg.id) return;
    const action = String(msg.action || "");
    if (!ALLOWED.has(action)) return;

    if (!runtimeReady()) {
      reply(msg.id, false, new Error("META Bridge가 다시 로드되었습니다. Home 페이지를 새로고침해 주세요."));
      return;
    }

    let request;
    try {
      request = chrome.runtime.sendMessage({ type:"META_HOME_COMMAND", id:msg.id, action, payload:msg.payload || {} });
    } catch (error) {
      reply(msg.id, false, error);
      return;
    }

    Promise.resolve(request)
      .then(response => {
        if (!response?.ok) throw new Error(String(response?.error || "META 브리지 오류"));
        reply(msg.id, true, response.result || {});
      })
      .catch(error => reply(msg.id, false, error));
  });
})();
