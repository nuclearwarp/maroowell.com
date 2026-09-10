(() => {
  "use strict";
  if (window.__MW_HOME_META_BRIDGE_V1__) return;
  window.__MW_HOME_META_BRIDGE_V1__ = true;

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data || {};
    if (msg.source !== "maroowell-home-page" || !msg.id) return;
    const action = String(msg.action || "");
    if (!["status", "search"].includes(action)) return;

    chrome.runtime.sendMessage({ type: "META_HOME_COMMAND", id: msg.id, action, payload: msg.payload || {} })
      .then(response => {
        if (!response?.ok) throw new Error(String(response?.error || "META 브리지 오류"));
        window.postMessage({ source: "maroowell-meta-extension", version: 1, id: msg.id, ok: true, result: response.result || {} }, location.origin);
      })
      .catch(error => {
        window.postMessage({ source: "maroowell-meta-extension", version: 1, id: msg.id, ok: false, error: String(error?.message || error) }, location.origin);
      });
  });
})();
