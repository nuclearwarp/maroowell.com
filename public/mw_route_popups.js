// public/mw_route_popups.js
// 목적:
// 1) 벤더 검색/선택/저장(1W/2W) + 신규 등록(검색 결과 없음 → "없음 등록")
// 2) 입차지(camps) 검색/선택/저장 + 신규 등록("없음 등록")
// 3) 라우트 코어는 HTML 쪽(MW_ROUTE)에 남기고, 팝업/등록 플로우만 모듈화
//
// 왜 이게 문제를 해결하나?
// - ad6dcb6 류 리팩터링에서 HTML에서 이벤트 바인딩이 빠진 채 /mw_route_popups.js에 위임되는 구조가 되면,
//   이 파일이 누락되는 순간 벤더/입차지/없음등록이 전부 먹통이 됩니다.
// - 본 모듈은 HTML DOM ID에 직접 바인딩하여, '버튼이 눌려도 아무 반응 없는' 상태를 즉시 복구합니다.

export default function initMwRoutePopups(MW_ROUTE) {
  if (window.__mw_route_popups_init) return;
  window.__mw_route_popups_init = true;

  const $ = (id) => document.getElementById(id);
  const endpoints = MW_ROUTE?.endpoints || {};
  const ROUTE_ENDPOINT = endpoints.ROUTE_ENDPOINT;
  const VENDORS_ENDPOINT = endpoints.VENDORS_ENDPOINT;
  const CAMPS_ENDPOINT = endpoints.CAMPS_ENDPOINT;

  const log = (m) => MW_ROUTE?.log?.(m);
  const setStatus = (m, k) => MW_ROUTE?.setStatus?.(m, k);

  // ----- DOM: Vendor -----
  const vendorSearchInput = $("vendorSearchInput");
  const vendorSearchBtn = $("vendorSearchBtn");
  const vendorSaveBtn = $("vendorSaveBtn");
  const vendorClearBtn = $("vendorClearBtn");

  const vendorPickedWrap = $("vendorPickedWrap");
  const vendorPickedText = $("vendorPickedText");
  const vendorPickedClearBtn = $("vendorPickedClearBtn");

  const vendorModalEl = $("vendorModal");
  const vendorModalCloseBtn = $("vendorModalCloseBtn");
  const vendorMetaCountEl = $("vendorMetaCount");
  const vendorResultsEl = $("vendorResults");

  const waveModalEl = $("waveModal");
  const waveModalCloseBtn = $("waveModalCloseBtn");
  const waveModalTitleEl = $("waveModalTitle");
  const waveModalVendorPillEl = $("waveModalVendorPill");
  const wave1WBtn = $("wave1WBtn");
  const wave2WBtn = $("wave2WBtn");

  // ----- DOM: Delivery(Camps) -----
  const deliveryNameInput = $("deliveryNameInput");
  const deliveryAddrInput = $("deliveryAddrInput");
  const deliverySearchBtn = $("deliverySearchBtn");
  const deliverySaveBtn = $("deliverySaveBtn");
  const deliveryClearBtn = $("deliveryClearBtn");

  const deliveryCampModalEl = $("deliveryCampModal");
  const deliveryCampModalCloseBtn = $("deliveryCampModalCloseBtn");
  const deliveryCampMetaCountEl = $("deliveryCampMetaCount");
  const deliveryCampResultsEl = $("deliveryCampResults");

  // ----- 기본 가드 -----
  if (!ROUTE_ENDPOINT || !VENDORS_ENDPOINT || !CAMPS_ENDPOINT) {
    setStatus("mw_route_popups: endpoints 누락", "WARN");
    return;
  }

  // ===== 공통 API =====
  async function apiGet(url) {
    const res = await fetch(url);
    const text = await res.text();
    const json = (() => { try { return text ? JSON.parse(text) : null; } catch { return null; } })();
    if (!res.ok) throw new Error(json?.error || text || `HTTP ${res.status}`);
    return json;
  }
  async function apiJson(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = (() => { try { return text ? JSON.parse(text) : null; } catch { return null; } })();
    if (!res.ok) throw new Error(json?.error || text || `HTTP ${res.status}`);
    return json;
  }

  function openModal(el) {
    if (!el) return;
    el.style.display = "flex";
    el.setAttribute("aria-hidden", "false");
  }
  function closeModal(el) {
    if (!el) return;
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }

  // ===== 벤더 상태 =====
  let vendorCandidate = null; // { name, business_number }
  let waveAction = null; // "save" | "clear"

  function normalizeVendor(v) {
    if (!v || typeof v !== "object") return null;
    const name = (v.name ?? v.vendor_name ?? "").toString().trim();
    const business_number = (v.business_number ?? v.vendor_business_number ?? "").toString().trim();
    if (!name) return null;
    return { name, business_number };
  }

  function setVendorCandidate(v) {
    vendorCandidate = v || null;
    if (!vendorPickedWrap || !vendorPickedText) return;
    if (!vendorCandidate) {
      vendorPickedWrap.style.display = "none";
      vendorPickedText.textContent = "";
      return;
    }
    const bn = vendorCandidate.business_number ? ` (${vendorCandidate.business_number})` : "";
    vendorPickedText.textContent = `벤더 선택됨: ${vendorCandidate.name}${bn}`;
    vendorPickedWrap.style.display = "flex";
  }

  async function fetchVendors(q) {
    const url = new URL(VENDORS_ENDPOINT);
    url.searchParams.set("q", q);
    const data = await apiGet(url.toString());
    const rows = Array.isArray(data) ? data : (data?.rows || data?.vendors || []);
    return (rows || []).map(normalizeVendor).filter(Boolean);
  }

  async function createVendor(payload) {
    const data = await apiJson("POST", VENDORS_ENDPOINT, payload);
    const created = normalizeVendor(data?.row || data);
    if (!created?.business_number) throw new Error("벤더 생성 응답이 올바르지 않습니다.");
    return created;
  }

  function renderVendorModal(list, q) {
    vendorResultsEl.innerHTML = "";
    if (vendorMetaCountEl) vendorMetaCountEl.textContent = `${list.length}개`;

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:10px 6px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font-weight:900;font-size:13px;";
      empty.textContent = `검색 결과 없음 : "${q}"`;
      vendorResultsEl.appendChild(empty);
    } else {
      for (const v of list) {
        const card = document.createElement("div");
        card.className = "resultCard";
        const left = document.createElement("div");
        left.style.flex = "1";
        left.style.minWidth = "0";

        const title = document.createElement("div");
        title.className = "resultTitle";
        title.textContent = v.name;

        const sub = document.createElement("div");
        sub.className = "resultSub";
        sub.textContent = `사업자번호: ${v.business_number || "-"}`;

        left.appendChild(title);
        left.appendChild(sub);

        card.appendChild(left);
        card.onclick = () => {
          setVendorCandidate(v);
          closeModal(vendorModalEl);
          openWaveModal("save");
        };
        vendorResultsEl.appendChild(card);
      }
    }

    // --- "없음 등록" 섹션(항상 표시) ---
    const divider = document.createElement("div");
    divider.style.marginTop = "14px";
    divider.style.paddingTop = "12px";
    divider.style.borderTop = "1px solid rgba(255,255,255,.10)";
    vendorResultsEl.appendChild(divider);

    const box = document.createElement("div");
    box.style.cssText = "padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);";
    box.innerHTML = `
      <div style="font-weight:900;color:#fff;">신규 벤더 등록</div>
      <div style="margin-top:6px;color:rgba(230,238,252,.62);font-size:12px;line-height:1.4;">
        검색 결과가 없어도 여기서 바로 등록할 수 있어요. (name + business_number)
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:10px;">
        <div>
          <div style="font-size:12px;color:rgba(230,238,252,.70);font-weight:800;margin-bottom:6px;">벤더명</div>
          <input id="__mw_vendor_name" type="text" class="createInput" style="width:100%;height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none;" />
        </div>
        <div>
          <div style="font-size:12px;color:rgba(230,238,252,.70);font-weight:800;margin-bottom:6px;">사업자번호</div>
          <input id="__mw_vendor_bn" type="text" class="createInput" style="width:100%;height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none;" />
        </div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:10px;">
        <button id="__mw_vendor_create_btn" type="button" class="miniBtn">등록</button>
      </div>
    `;
    vendorResultsEl.appendChild(box);

    const nameEl = box.querySelector("#__mw_vendor_name");
    const bnEl = box.querySelector("#__mw_vendor_bn");
    const btnEl = box.querySelector("#__mw_vendor_create_btn");
    nameEl.value = (q || "").trim();

    btnEl.onclick = async () => {
      const name = nameEl.value.trim();
      const bn = bnEl.value.trim();
      if (!name) { setStatus("벤더명을 입력하세요.", "WARN"); nameEl.focus(); return; }
      if (!bn) { setStatus("사업자번호를 입력하세요.", "WARN"); bnEl.focus(); return; }
      btnEl.disabled = true;
      btnEl.textContent = "등록중...";
      try {
        const created = await createVendor({ name, business_number: bn });
        setVendorCandidate(created);
        closeModal(vendorModalEl);
        setStatus("벤더 등록 완료", "OK");
        openWaveModal("save");
      } catch (e) {
        setStatus(`벤더 등록 실패: ${e.message}`, "ERR");
      } finally {
        btnEl.disabled = false;
        btnEl.textContent = "등록";
      }
    };
  }

  async function runVendorSearch() {
    const q = (vendorSearchInput?.value || "").trim();
    if (!q) { setStatus("검색어를 입력하세요.", "WARN"); return; }
    setStatus(`벤더 검색중: "${q}"`, "OK");
    try {
      const list = await fetchVendors(q);
      openModal(vendorModalEl);
      renderVendorModal(list, q);
      setStatus(list.length ? `벤더 후보 ${list.length}개` : `검색 결과 없음: "${q}" (등록 가능)`, list.length ? "OK" : "WARN");
    } catch (e) {
      openModal(vendorModalEl);
      renderVendorModal([], q);
      setStatus(`벤더 검색 실패: ${e.message}`, "ERR");
    }
  }

  function openWaveModal(action) {
    waveAction = action;
    if (waveModalTitleEl) {
      waveModalTitleEl.textContent = (action === "clear") ? "어느 구분을 비울까요?" : "어느 구분으로 저장할까요?";
    }
    if (waveModalVendorPillEl) {
      if (action === "save" && vendorCandidate?.name) {
        waveModalVendorPillEl.style.display = "inline-block";
        waveModalVendorPillEl.textContent = `저장 대상: ${vendorCandidate.name}`;
      } else {
        waveModalVendorPillEl.style.display = "none";
        waveModalVendorPillEl.textContent = "";
      }
    }
    openModal(waveModalEl);
  }

  async function saveVendorWave(wave, clear) {
    // wave: "1W" | "2W"
    const ctx = MW_ROUTE.getRouteContext();
    if (!ctx.selectedRoute) { setStatus("선택된 라우트가 없습니다.", "WARN"); return; }

    if (!clear && !vendorCandidate?.business_number) {
      setStatus("저장할 벤더를 먼저 선택하세요.", "WARN");
      return;
    }

    const patch = {};
    if (wave === "1W") patch.vendor_business_number_1w = clear ? null : vendorCandidate.business_number;
    if (wave === "2W") patch.vendor_business_number_2w = clear ? null : vendorCandidate.business_number;

    try {
      setStatus(clear ? `벤더 비우기 저장(${wave})` : `벤더 저장(${wave})`, "OK");
      await MW_ROUTE.saveSelectedRoutePatch(patch);
      setStatus(clear ? `벤더 비우기 완료(${wave})` : `벤더 저장 완료(${wave})`, "OK");
    } catch (e) {
      setStatus(`벤더 저장 실패: ${e.message}`, "ERR");
    }
  }

  // ===== 입차지(camps) =====
  let deliveryCampCandidate = null; // { mb_camp, address, latitude, longitude, camp }

  function normalizeCamp(v) {
    if (!v || typeof v !== "object") return null;
    const camp = (v.camp ?? "").toString().trim();
    const mb_camp = (v.mb_camp ?? v.mp_camp ?? "").toString().trim();
    const address = (v.address ?? "").toString().trim();
    if (!mb_camp) return null;
    return {
      id: v.id ?? null,
      camp,
      mb_camp,
      address,
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
    };
  }

  function setDeliveryCampCandidate(v) {
    deliveryCampCandidate = v || null;
    if (!deliveryCampCandidate) {
      if (deliveryAddrInput) deliveryAddrInput.value = "";
      return;
    }
    if (deliveryNameInput) deliveryNameInput.value = deliveryCampCandidate.mb_camp;
    if (deliveryAddrInput) deliveryAddrInput.value = deliveryCampCandidate.address || "";
  }

  async function fetchCamps(q, campFilter) {
    const url = new URL(CAMPS_ENDPOINT);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "50");
    if (campFilter) url.searchParams.set("camp", campFilter);
    const data = await apiGet(url.toString());
    const rows = Array.isArray(data) ? data : (data?.rows || data?.camps || []);
    return (rows || []).map(normalizeCamp).filter(Boolean);
  }

  async function createCamp(payload) {
    const data = await apiJson("POST", CAMPS_ENDPOINT, payload);
    const created = normalizeCamp(data?.row || data);
    if (!created) throw new Error("입차지 등록 응답이 올바르지 않습니다.");
    return created;
  }

  function renderDeliveryCampModal(list, q, campPrefill) {
    deliveryCampResultsEl.innerHTML = "";
    if (deliveryCampMetaCountEl) deliveryCampMetaCountEl.textContent = `${list.length}개`;

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:10px 6px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font-weight:900;font-size:13px;";
      empty.textContent = `검색 결과 없음 : "${q}"`;
      deliveryCampResultsEl.appendChild(empty);
    } else {
      for (const c of list) {
        const card = document.createElement("div");
        card.className = "resultCard";
        const left = document.createElement("div");
        left.style.flex = "1";
        left.style.minWidth = "0";
        const title = document.createElement("div");
        title.className = "resultTitle";
        title.textContent = c.mb_camp;
        const sub = document.createElement("div");
        sub.className = "resultSub";
        sub.textContent = `캠프: ${c.camp || "-"}\n주소: ${c.address || "-"}`;
        left.appendChild(title); left.appendChild(sub);
        card.appendChild(left);
        card.onclick = () => {
          setDeliveryCampCandidate(c);
          closeModal(deliveryCampModalEl);
          setStatus(`입차지 선택: ${c.mb_camp}`, "OK");
        };
        deliveryCampResultsEl.appendChild(card);
      }
    }

    // --- "없음 등록" ---
    const divider = document.createElement("div");
    divider.style.marginTop = "14px";
    divider.style.paddingTop = "12px";
    divider.style.borderTop = "1px solid rgba(255,255,255,.10)";
    deliveryCampResultsEl.appendChild(divider);

    const box = document.createElement("div");
    box.style.cssText = "padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);";
    box.innerHTML = `
      <div style="font-weight:900;color:#fff;">신규 입차지 등록</div>
      <div style="margin-top:6px;color:rgba(230,238,252,.62);font-size:12px;line-height:1.4;">
        검색 결과가 없으면 camps 테이블에 바로 등록합니다. (camp + mb_camp + address)
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:10px;">
        <div>
          <div style="font-size:12px;color:rgba(230,238,252,.70);font-weight:800;margin-bottom:6px;">캠프</div>
          <input id="__mw_camp_name" type="text" style="width:100%;height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none;" />
        </div>
        <div>
          <div style="font-size:12px;color:rgba(230,238,252,.70);font-weight:800;margin-bottom:6px;">입차지명(mb_camp)</div>
          <input id="__mw_mb_camp" type="text" style="width:100%;height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none;" />
        </div>
        <div>
          <div style="font-size:12px;color:rgba(230,238,252,.70);font-weight:800;margin-bottom:6px;">주소</div>
          <input id="__mw_camp_addr" type="text" style="width:100%;height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none;" />
        </div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:10px;">
        <button id="__mw_camp_create_btn" type="button" class="miniBtn">등록</button>
      </div>
    `;
    deliveryCampResultsEl.appendChild(box);

    const campEl = box.querySelector("#__mw_camp_name");
    const mbEl = box.querySelector("#__mw_mb_camp");
    const addrEl = box.querySelector("#__mw_camp_addr");
    const btnEl = box.querySelector("#__mw_camp_create_btn");

    campEl.value = campPrefill || "";
    mbEl.value = (q || "").trim();

    btnEl.onclick = async () => {
      const camp = campEl.value.trim();
      const mb_camp = mbEl.value.trim();
      const address = addrEl.value.trim();
      if (!camp) { setStatus("캠프를 입력하세요.", "WARN"); campEl.focus(); return; }
      if (!mb_camp) { setStatus("입차지명을 입력하세요.", "WARN"); mbEl.focus(); return; }
      if (!address) { setStatus("주소를 입력하세요.", "WARN"); addrEl.focus(); return; }

      btnEl.disabled = true;
      btnEl.textContent = "등록중...";
      try {
        const created = await createCamp({ camp, mb_camp, address });
        setDeliveryCampCandidate(created);
        closeModal(deliveryCampModalEl);
        setStatus("입차지 등록 완료", "OK");
      } catch (e) {
        setStatus(`입차지 등록 실패: ${e.message}`, "ERR");
      } finally {
        btnEl.disabled = false;
        btnEl.textContent = "등록";
      }
    };
  }

  async function runDeliverySearch() {
    const q = (deliveryNameInput?.value || "").trim();
    if (!q) { setStatus("입차지 검색어를 입력하세요.", "WARN"); return; }

    const ctx = MW_ROUTE.getRouteContext();
    const campFilter = ctx.camp;

    setStatus(`입차지 검색중: "${q}"`, "OK");
    try {
      const list = await fetchCamps(q, campFilter);
      openModal(deliveryCampModalEl);
      renderDeliveryCampModal(list, q, campFilter);
      setStatus(list.length ? `입차지 후보 ${list.length}개` : `검색 결과 없음: "${q}" (등록 가능)`, list.length ? "OK" : "WARN");
    } catch (e) {
      openModal(deliveryCampModalEl);
      renderDeliveryCampModal([], q, campFilter);
      setStatus(`입차지 검색 실패: ${e.message}`, "ERR");
    }
  }

  async function saveDelivery(clear) {
    const ctx = MW_ROUTE.getRouteContext();
    if (!ctx.selectedRoute) { setStatus("선택된 라우트가 없습니다.", "WARN"); return; }
    if (!clear && !deliveryCampCandidate?.mb_camp) {
      setStatus("입차지를 먼저 검색/선택하세요.", "WARN");
      return;
    }
    const patch = {
      delivery_location_name: clear ? null : deliveryCampCandidate.mb_camp,
      delivery_location_lat: clear ? null : (deliveryCampCandidate.latitude ?? null),
      delivery_location_lng: clear ? null : (deliveryCampCandidate.longitude ?? null),
    };
    try {
      setStatus(clear ? "입차지 비우기 저장" : "입차지 저장", "OK");
      await MW_ROUTE.saveSelectedRoutePatch(patch);
      setStatus(clear ? "입차지 비우기 완료" : "입차지 저장 완료", "OK");
    } catch (e) {
      setStatus(`입차지 저장 실패: ${e.message}`, "ERR");
    }
  }

  // ===== 바인딩 =====
  vendorSearchInput?.addEventListener("keydown", (e)=> {
    if (e.isComposing) return;
    if (e.key === "Enter") { e.preventDefault(); runVendorSearch(); }
  });
  vendorSearchBtn?.addEventListener("click", (e)=> { e.preventDefault(); runVendorSearch(); });

  vendorPickedClearBtn?.addEventListener("click", ()=> setVendorCandidate(null));

  vendorModalCloseBtn?.addEventListener("click", ()=> closeModal(vendorModalEl));
  vendorModalEl?.addEventListener("click", (e)=> { if (e.target === vendorModalEl) closeModal(vendorModalEl); });

  waveModalCloseBtn?.addEventListener("click", ()=> closeModal(waveModalEl));
  waveModalEl?.addEventListener("click", (e)=> { if (e.target === waveModalEl) closeModal(waveModalEl); });

  vendorSaveBtn?.addEventListener("click", ()=>{
    if (!vendorCandidate?.business_number) { setStatus("벤더를 먼저 검색/선택하세요.", "WARN"); return; }
    openWaveModal("save");
  });
  vendorClearBtn?.addEventListener("click", ()=> openWaveModal("clear"));

  wave1WBtn?.addEventListener("click", async ()=>{
    closeModal(waveModalEl);
    await saveVendorWave("1W", waveAction === "clear");
  });
  wave2WBtn?.addEventListener("click", async ()=>{
    closeModal(waveModalEl);
    await saveVendorWave("2W", waveAction === "clear");
  });

  deliveryNameInput?.addEventListener("keydown", (e)=>{
    if (e.isComposing) return;
    if (e.key === "Enter") { e.preventDefault(); runDeliverySearch(); }
  });
  deliverySearchBtn?.addEventListener("click", (e)=> { e.preventDefault(); runDeliverySearch(); });

  deliveryCampModalCloseBtn?.addEventListener("click", ()=> closeModal(deliveryCampModalEl));
  deliveryCampModalEl?.addEventListener("click", (e)=> { if (e.target === deliveryCampModalEl) closeModal(deliveryCampModalEl); });

  deliverySaveBtn?.addEventListener("click", ()=> saveDelivery(false));
  deliveryClearBtn?.addEventListener("click", ()=> saveDelivery(true));

  // ESC로 모달 닫기
  window.addEventListener("keydown",(e)=>{
    if (e.key !== "Escape") return;
    if (vendorModalEl?.style.display === "flex") closeModal(vendorModalEl);
    if (deliveryCampModalEl?.style.display === "flex") closeModal(deliveryCampModalEl);
    if (waveModalEl?.style.display === "flex") closeModal(waveModalEl);
  });

  log?.("mw_route_popups 초기화 완료");
}
