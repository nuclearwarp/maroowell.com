(() => {
  "use strict";
  if (window.__MW_META_RELAY_V2__) return;
  window.__MW_META_RELAY_V2__ = true;

  let seq = 0;
  function callMain(action, payload, timeoutMs = 45000) {
    const id = `relay-${Date.now().toString(36)}-${(++seq).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("META 페이지 응답 시간 초과"));
      }, timeoutMs);
      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const msg = event.data || {};
        if (msg.source !== "maroowell-meta-hook" || msg.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (msg.ok === false) reject(new Error(String(msg.error || "META 페이지 오류")));
        else resolve(msg.result || {});
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "maroowell-meta-relay", version: 2, id, action, payload }, location.origin);
    });
  }

  async function publishSnapshot() {
    try {
      const snapshot = await callMain("snapshot", {}, 3500);
      await chrome.runtime.sendMessage({ type: "META_CAPTURE_SNAPSHOT", snapshot });
    } catch (_) {}
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "META_BRIDGE_COMMAND") return false;
    const action = String(message.action || "");
    if (!["status", "search", "snapshot"].includes(action)) {
      sendResponse({ ok: false, error: "지원하지 않는 META 브리지 요청입니다." });
      return false;
    }
    callMain(action, message.payload || {}, action === "status" || action === "snapshot" ? 3500 : 45000)
      .then(result => {
        if (action === "snapshot") chrome.runtime.sendMessage({ type: "META_CAPTURE_SNAPSHOT", snapshot: result }).catch(() => {});
        sendResponse({ ok: true, result });
      })
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  [250, 1200, 3000, 6000, 10000].forEach(ms => setTimeout(publishSnapshot, ms));
  setInterval(publishSnapshot, 2000);
})();
