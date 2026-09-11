"use strict";

const META_ORIGIN = "https://fly.coupang.com";
const MIN_REQUEST_GAP_MS = 150;
let requestChain = Promise.resolve();
let lastRequestStartedAt = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findMetaTab() {
  const tabs = await chrome.tabs.query({ url: META_ORIGIN + "/*" });
  if (!tabs.length) return null;
  return tabs.sort((a, b) => {
    const ar = String(a.url || "").includes("/ui/dashboard/realtime") ? 1 : 0;
    const br = String(b.url || "").includes("/ui/dashboard/realtime") ? 1 : 0;
    if (ar !== br) return br - ar;
    if (!!a.active !== !!b.active) return b.active ? 1 : -1;
    return Number(b.id || 0) - Number(a.id || 0);
  })[0];
}

function enqueue(task) {
  const run = async () => {
    const waitMs = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestStartedAt);
    if (waitMs > 0) await sleep(waitMs);
    lastRequestStartedAt = Date.now();
    return task();
  };
  const next = requestChain.then(run, run);
  requestChain = next.catch(() => {});
  return next;
}

async function commandMetaDirect(action, payload) {
  const tab = await findMetaTab();
  if (!tab?.id) {
    if (action === "status") return { connected:false, hookReady:false, context:{vendorCodes:[], camps:[]} };
    throw new Error("META Chrome 세션을 찾지 못했습니다. META 로그인을 다시 진행해 주세요.");
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "META_BRIDGE_COMMAND",
      action,
      payload: payload || {}
    });
    if (!response?.ok) throw new Error(String(response?.error || "META 브리지 응답 오류"));
    if (action === "status") {
      const result = response.result || {};
      return {
        connected:true,
        hookReady:result.hookReady === true,
        pageUrl:String(result.pageUrl || tab.url || ""),
        context:result.context || {vendorCodes:[], camps:[]},
        transport:"local-chrome"
      };
    }
    return response.result || {};
  } catch (error) {
    if (action === "status") {
      return {
        connected:true,
        hookReady:false,
        context:{vendorCodes:[], camps:[]},
        error:String(error?.message || error),
        transport:"local-chrome"
      };
    }
    throw error;
  }
}

function commandMeta(action, payload) {
  if (action === "status") return commandMetaDirect(action, payload);
  return enqueue(() => commandMetaDirect(action, payload));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "META_HOME_COMMAND") return false;
  const senderUrl = String(sender?.url || sender?.tab?.url || "");
  if (!senderUrl.startsWith("https://maroowell.com/home")) {
    sendResponse({ok:false,error:"허용되지 않은 호출 페이지입니다."});
    return false;
  }
  const action = String(message.action || "");
  if (!["status","search"].includes(action)) {
    sendResponse({ok:false,error:"지원하지 않는 요청입니다."});
    return false;
  }
  commandMeta(action, message.payload || {})
    .then(result => sendResponse({ok:true,result}))
    .catch(error => sendResponse({ok:false,error:String(error?.message || error)}));
  return true;
});
