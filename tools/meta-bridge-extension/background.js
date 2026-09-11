"use strict";

const FLY_ORIGIN = "https://fly.coupang.com";
const FLY_REALTIME = `${FLY_ORIGIN}/ui/dashboard/realtime`;
const SEARCH_PATH = "/realtime-dashboard/workers/work-status/search";
const SNAPSHOT_KEY = "mw_meta_bridge_snapshot_v2";
const MIN_REQUEST_GAP_MS = 150;

let requestChain = Promise.resolve();
let lastRequestStartedAt = 0;
let memorySnapshot = null;
let loginWindowId = null;
let loginTabId = null;
let backgroundReady = false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForRequestGap() {
  const waitMs = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestStartedAt);
  if (waitMs > 0) await sleep(waitMs);
  lastRequestStartedAt = Date.now();
}

function enqueueSearch(task) {
  const next = requestChain.then(task, task);
  requestChain = next.catch(() => {});
  return next;
}

try {
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
} catch (_) {}

function cleanHeaders(source) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    const lower = String(key).toLowerCase();
    if (["content-length", "cookie", "host", "origin", "referer"].includes(lower)) continue;
    if (lower.startsWith("sec-")) continue;
    out[key] = String(value);
  }
  return out;
}

function normalizeSnapshot(raw) {
  const snapshot = raw && typeof raw === "object" ? raw : {};
  const context = snapshot.context && typeof snapshot.context === "object" ? snapshot.context : {};
  const template = snapshot.searchTemplate && typeof snapshot.searchTemplate === "object" ? snapshot.searchTemplate : null;
  return {
    hookReady: snapshot.hookReady === true,
    pageUrl: String(snapshot.pageUrl || ""),
    updatedAt: Number(snapshot.updatedAt || Date.now()),
    capturedAt: Date.now(),
    context: {
      vendorCodes: Array.isArray(context.vendorCodes) ? context.vendorCodes.map(v => String(v || "").trim()).filter(Boolean) : [],
      camps: Array.isArray(context.camps) ? context.camps.map(row => ({
        code: String(row?.code || "").trim(),
        name: String(row?.name || "").trim(),
        workplaceType: String(row?.workplaceType || "").trim()
      })).filter(row => row.code) : []
    },
    sessionHeaders: cleanHeaders(snapshot.sessionHeaders || {}),
    searchTemplate: template ? {
      url: String(template.url || SEARCH_PATH),
      method: String(template.method || "POST").toUpperCase(),
      headers: cleanHeaders(template.headers || {}),
      body: template.body && typeof template.body === "object" ? template.body : {}
    } : null
  };
}

async function saveSnapshot(raw) {
  memorySnapshot = normalizeSnapshot(raw);
  await chrome.storage.session.set({ [SNAPSHOT_KEY]: memorySnapshot });
  return memorySnapshot;
}

async function loadSnapshot() {
  if (memorySnapshot) return memorySnapshot;
  try {
    const row = await chrome.storage.session.get(SNAPSHOT_KEY);
    memorySnapshot = row?.[SNAPSHOT_KEY] || null;
  } catch (_) {}
  return memorySnapshot;
}

async function clearSnapshot() {
  memorySnapshot = null;
  backgroundReady = false;
  try { await chrome.storage.session.remove(SNAPSHOT_KEY); } catch (_) {}
}

function isFlySender(sender) {
  const url = String(sender?.url || sender?.tab?.url || "");
  return url.startsWith(`${FLY_ORIGIN}/`);
}

function isHomeSender(sender) {
  try {
    const url = new URL(String(sender?.url || sender?.tab?.url || ""));
    return url.origin === "https://maroowell.com" && (url.pathname === "/home" || url.pathname === "/home/");
  } catch (_) {
    return false;
  }
}

async function findMetaTab() {
  const tabs = await chrome.tabs.query({ url: `${FLY_ORIGIN}/*` });
  if (!tabs.length) return null;
  return tabs.sort((a, b) => {
    const ar = String(a.url || "").includes("/ui/dashboard/realtime") ? 1 : 0;
    const br = String(b.url || "").includes("/ui/dashboard/realtime") ? 1 : 0;
    if (ar !== br) return br - ar;
    if (!!a.active !== !!b.active) return b.active ? 1 : -1;
    return Number(b.id || 0) - Number(a.id || 0);
  })[0];
}

async function tabCommand(action, payload = {}) {
  const tab = await findMetaTab();
  if (!tab?.id) throw new Error("열려 있는 META 페이지가 없습니다.");
  const response = await chrome.tabs.sendMessage(tab.id, { type: "META_BRIDGE_COMMAND", action, payload });
  if (!response?.ok) throw new Error(String(response?.error || "META 페이지 브리지 오류"));
  return response.result || {};
}

async function openLoginWindow() {
  const existing = await findMetaTab();
  if (existing?.id) {
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
    await chrome.tabs.update(existing.id, { active: true }).catch(() => {});
    return { opened: true, reused: true };
  }

  const created = await chrome.windows.create({
    url: FLY_REALTIME,
    type: "popup",
    width: 1180,
    height: 900,
    focused: true
  });
  loginWindowId = created?.id ?? null;
  loginTabId = created?.tabs?.[0]?.id ?? null;
  return { opened: true, reused: false };
}

async function closeLoginWindow() {
  if (loginWindowId == null) return;
  const id = loginWindowId;
  loginWindowId = null;
  loginTabId = null;
  try { await chrome.windows.remove(id); } catch (_) {}
}

function requestBody(templateBody, payload, page) {
  const base = JSON.parse(JSON.stringify(templateBody || {}));
  const wanted = JSON.parse(JSON.stringify(payload || {}));
  for (const [key, value] of Object.entries(wanted)) {
    if (value === null || value === "" || value === "ALL") delete base[key];
    else base[key] = value;
  }
  base.page = page;
  return base;
}

function mergedHeaders(snapshot) {
  return cleanHeaders({
    ...(snapshot?.sessionHeaders || {}),
    ...(snapshot?.searchTemplate?.headers || {}),
    Accept: "application/json",
    "Content-Type": "application/json;charset=UTF-8",
    "X-Coupang-Accept-Language": "ko-KR",
    "X-Requested-With": "XMLHttpRequest"
  });
}

async function backgroundPostPage(snapshot, payload, page) {
  const template = snapshot?.searchTemplate || { url: SEARCH_PATH, method: "POST", body: {} };
  const url = new URL(String(template.url || SEARCH_PATH), FLY_ORIGIN);
  if (url.origin !== FLY_ORIGIN) throw new Error("허용되지 않은 META 조회 주소입니다.");

  await waitForRequestGap();
  const response = await fetch(url.href, {
    method: String(template.method || "POST").toUpperCase(),
    credentials: "include",
    cache: "no-store",
    headers: mergedHeaders(snapshot),
    body: JSON.stringify(requestBody(template.body || {}, payload, page))
  });
  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    const error = new Error(`META 로그인 세션이 만료되었습니다. (HTTP ${response.status})`);
    error.authExpired = true;
    throw error;
  }
  if (!response.ok) throw new Error(`META 조회 실패 (HTTP ${response.status}) ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : {};
}

async function backgroundSearch(payload) {
  const snapshot = await loadSnapshot();
  if (!snapshot?.hookReady || !snapshot?.context?.vendorCodes?.length) {
    throw new Error("저장된 META 로그인 정보가 없습니다. META 로그인을 먼저 해 주세요.");
  }

  const first = await backgroundPostPage(snapshot, payload, 0);
  const merged = Array.isArray(first?.data?.content) ? first.data.content.slice() : [];
  const pages = Math.min(Math.max(Number(first?.data?.totalPages || 1), 1), 50);
  for (let page = 1; page < pages; page++) {
    const next = await backgroundPostPage(snapshot, payload, page);
    const rows = Array.isArray(next?.data?.content) ? next.data.content : [];
    merged.push(...rows);
  }
  first.data = first.data || {};
  first.data.content = merged;
  first.data.number = 0;
  first.data.size = merged.length;
  first.data.totalElements = merged.length;
  first.data.totalPages = 1;
  backgroundReady = true;
  return first;
}

async function refreshSnapshotFromOpenTab() {
  try {
    return await saveSnapshot(await tabCommand("snapshot", {}));
  } catch (_) {
    return await loadSnapshot();
  }
}

async function status() {
  let snapshot = await loadSnapshot();
  const tab = await findMetaTab();
  if (tab?.id) snapshot = await refreshSnapshotFromOpenTab();

  const connected = !!snapshot?.hookReady && Array.isArray(snapshot?.context?.vendorCodes) && snapshot.context.vendorCodes.length > 0;
  if (connected) backgroundReady = true;

  return {
    connected,
    hookReady: !!snapshot?.hookReady,
    backgroundReady: backgroundReady === true,
    popupOpen: !!tab?.id,
    pageUrl: String(snapshot?.pageUrl || tab?.url || ""),
    capturedAt: Number(snapshot?.capturedAt || 0),
    context: snapshot?.context || { vendorCodes: [], camps: [] }
  };
}

async function search(payload) {
  try {
    return await backgroundSearch(payload);
  } catch (backgroundError) {
    try {
      const result = await tabCommand("search", payload);
      await refreshSnapshotFromOpenTab();
      return result;
    } catch (tabError) {
      if (backgroundError?.authExpired) await clearSnapshot();
      throw new Error(backgroundError?.message || tabError?.message || "META 조회에 실패했습니다.");
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "META_CAPTURE_SNAPSHOT") {
    if (!isFlySender(sender)) {
      sendResponse({ ok: false, error: "허용되지 않은 META 스냅샷입니다." });
      return false;
    }

    saveSnapshot(message.snapshot || {})
      .then(async snapshot => {
        const ready = !!snapshot?.hookReady && Array.isArray(snapshot?.context?.vendorCodes) && snapshot.context.vendorCodes.length > 0;
        if (ready) {
          backgroundReady = true;
          if (loginWindowId != null) {
            await closeLoginWindow();
          } else if (sender?.tab?.windowId != null) {
            try {
              const win = await chrome.windows.get(sender.tab.windowId);
              if (win?.type === "popup") await chrome.windows.remove(sender.tab.windowId);
            } catch (_) {}
          }
        }
        sendResponse({ ok: true, backgroundReady: ready });
      })
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.type !== "META_HOME_COMMAND") return false;
  if (!isHomeSender(sender)) {
    sendResponse({ ok: false, error: "허용되지 않은 호출 페이지입니다." });
    return false;
  }

  const action = String(message.action || "");
  if (!["status", "search", "login"].includes(action)) {
    sendResponse({ ok: false, error: "지원하지 않는 요청입니다." });
    return false;
  }

  const task = action === "status"
    ? status()
    : action === "login"
      ? openLoginWindow()
      : enqueueSearch(() => search(message.payload || {}));

  task.then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === loginWindowId) {
    loginWindowId = null;
    loginTabId = null;
  }
});

chrome.runtime.onStartup.addListener(() => {
  memorySnapshot = null;
  backgroundReady = false;
});

try {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({ url: ["https://maroowell.com/home", "https://maroowell.com/home*"] })
      .then(tabs => Promise.all(tabs.filter(tab => tab.id != null).map(tab => chrome.tabs.reload(tab.id).catch(() => {}))))
      .catch(() => {});
  });
} catch (_) {}
