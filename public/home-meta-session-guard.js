(() => {
  "use strict";
  if (window.__MW_META_SESSION_GUARD__) return;
  window.__MW_META_SESSION_GUARD__ = true;

  const STORAGE_KEY = "mw_meta_auth_expired";
  const pending = new Map();
  const originalPostMessage = window.postMessage.bind(window);

  function isExpired() {
    try { return sessionStorage.getItem(STORAGE_KEY) === "1"; }
    catch (_) { return false; }
  }

  function setExpired(value) {
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, "1");
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function looksLikeAuthError(value) {
    const text = String(value || "");
    return /401|403|로그인.*세션|세션.*만료|로그인.*필요|저장된 META 로그인 정보|Unexpected token.*<|<!doctype html|<html/i.test(text);
  }

  window.postMessage = function(message) {
    try {
      if (message && message.source === "maroowell-home-page" && message.id) {
        pending.set(message.id, String(message.action || ""));
        if (message.action === "login") setExpired(false);
      }
    } catch (_) {}
    return originalPostMessage.apply(window, arguments);
  };

  window.addEventListener("message", event => {
    const message = event.data || {};
    if (message.source !== "maroowell-meta-extension" || !message.id) return;

    const action = pending.get(message.id) || "";
    pending.delete(message.id);

    if (message.ok === false && looksLikeAuthError(message.error)) {
      setExpired(true);
      message.error = "META 로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
      setTimeout(() => {
        const button = document.getElementById("metaLoginBtn");
        if (button) {
          button.className = "btn primary";
          button.textContent = "META 로그인";
          button.disabled = false;
        }
        const status = document.getElementById("queryStatus");
        if (status) {
          status.textContent = "META 로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
          status.classList.add("err");
        }
      }, 0);
      return;
    }

    if (action === "search" && message.ok !== false) setExpired(false);

    if (action === "status" && isExpired() && message.ok !== false) {
      message.result = message.result || {};
      message.result.connected = false;
      message.result.hookReady = false;
      message.result.context = { vendorCodes: [], camps: [] };
    }
  }, true);
})();
