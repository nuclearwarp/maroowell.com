(function () {
  "use strict";
  // Road-name coverage is a visual sample of Kakao reverse-geocoded points.
  // It is never an official road boundary or a complete address inventory.
  const COLORS = [
    { fill: "#8FCEDD", edge: "#39788B" },
    { fill: "#A8D5B6", edge: "#43775B" },
    { fill: "#D0BFE9", edge: "#8064A5" },
    { fill: "#EBC4A3", edge: "#9E7147" },
    { fill: "#B8CDEE", edge: "#587DAF" },
    { fill: "#E6D9A0", edge: "#938044" },
    { fill: "#E6BBD0", edge: "#A36581" },
    { fill: "#9CD5CF", edge: "#377E79" },
    { fill: "#C4D7AA", edge: "#6E874C" },
    { fill: "#D5C6BA", edge: "#877363" },
    { fill: "#B9D4DF", edge: "#517D91" },
    { fill: "#D9C7E7", edge: "#80669C" }
  ];
  const LIMIT_ZIPS = 4;
  const LIMIT_SAMPLES_PER_ZIP = 140;
  const WORKERS = 3;

  function extractRoadName(info) {
    const given = String(info?.roadName || "").trim();
    if (given && /(?:대로|로|길)$/.test(given)) return given;
    const roadAddress = String(info?.roadAddress || "").trim();
    if (!roadAddress) return "";
    // Kakao road-address format: municipality + road_name + building_number.
    const tokens = roadAddress.split(/\s+/);
    return tokens.find((token) => /(?:대로|로|길)$/.test(token) && token.length >= 2) || "";
  }

  function selectEvenly(points, limit) {
    if (!Array.isArray(points)) return [];
    const usable = points.filter((p) => Number.isFinite(Number(p.lng)) && Number.isFinite(Number(p.lat)));
    if (usable.length <= limit) return usable;
    const chosen = [];
    for (let i = 0; i < limit; i++) {
      chosen.push(usable[Math.floor(i * usable.length / limit)]);
    }
    return chosen;
  }

  function groupRoadSamples(rows) {
    const groups = new Map();
    for (const row of rows || []) {
      const name = extractRoadName(row);
      if (!name) continue;
      let g = groups.get(name);
      if (!g) {
        g = { name, samples: [], addresses: new Set(), color: null, drawings: [] };
        groups.set(name, g);
      }
      g.samples.push(row);
      if (row.roadAddress) g.addresses.add(row.roadAddress);
    }
    const ranked = [...groups.values()].sort((a, b) => b.samples.length - a.samples.length || a.name.localeCompare(b.name, "ko"));
    ranked.forEach((group, index) => { group.color = COLORS[index % COLORS.length]; });
    return ranked;
  }

  window.MW_ROAD_OVERLAY_TOOLS = Object.freeze({
    extractRoadName, selectEvenly, groupRoadSamples, colors: COLORS
  });

  window.MW_ROAD_OVERLAY_BOOT = function ({ map, getSelectedZips, getFeature, sampleFeature, reverseLookup, getZipPolygons }) {
    const turf = window.turf;
    const host = document.getElementById("terrainSection");
    if (!map || !turf || !host || !window.kakao?.maps) return null;

    const style = document.createElement("style");
    style.textContent = [
      "#mwRoadPanel{margin:11px 0 0;padding:12px;border:1px solid #cbd9e6;border-radius:13px;background:#f8fbff}",
      ".mwRoadHead{display:flex;justify-content:space-between;align-items:center;gap:9px}",
      ".mwRoadHead strong{font-size:12px;font-weight:900;color:#26374b}",
      ".mwRoadToggle{font-size:11px!important;border:1px solid #90b5cf;border-radius:8px;padding:7px 10px;background:#e9f3fa;color:#27516c;font-weight:800;white-space:nowrap}",
      ".mwRoadToggle[aria-pressed=true]{background:#d7e9df;color:#245e44;border-color:#87b69c}",
      ".mwRoadHint{font-size:10px;color:#697b8e;line-height:1.55;margin:7px 0 0}",
      ".mwRoadStatus{font-size:11px;color:#455c72;line-height:1.5;margin-top:8px}",
      ".mwRoadLegend[hidden]{display:none!important}",
      ".mwRoadLegend{max-height:255px;overflow-y:auto;margin-top:9px;display:flex;flex-direction:column;gap:5px}",
      ".mwRoadRow{display:flex;align-items:center;text-align:left;gap:8px;width:100%;padding:7px 8px;border:1px solid #dce5ed;background:#fff;border-radius:8px;cursor:pointer}",
      ".mwRoadRow[data-selected=true]{border-color:#3e6d88;box-shadow:0 0 0 1px #3e6d88}",
      ".mwRoadSwatch{flex:0 0 13px;width:13px;height:13px;border-radius:3px;border:1px solid}",
      ".mwRoadName{flex:1;min-width:0;color:#24394e;font-weight:800;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".mwRoadCount{color:#6a7a8b;font-size:10px;white-space:nowrap}",
      ".mwRoadDetails{font-size:10px;color:#526478;margin:2px 9px 5px;line-height:1.6;overflow-wrap:anywhere}",
      ".mwRoadLabel{pointer-events:none;white-space:nowrap;padding:3px 7px;border:1px solid #7895a8;background:rgba(255,255,255,.95);border-radius:6px;color:#22394b;font-size:10px;font-weight:850;box-shadow:0 1px 5px rgba(29,46,67,.16)}"
    ].join("");
    document.head.appendChild(style);

    const section = document.createElement("section");
    section.id = "mwRoadPanel";
    section.innerHTML = '<div class="mwRoadHead"><strong>도로명별 주소 분포</strong><button type="button" class="mwRoadToggle" aria-pressed="false">도로명 표시</button></div>' +
      '<div class="mwRoadHint">폴리곤 내부 위치 표본을 도로명주소로 묶은 참고 영역입니다. 정확한 도로 경계·전체 건물 목록이 아닙니다.</div>' +
      '<div class="mwRoadStatus" aria-live="polite">우편번호를 지도에 표시한 뒤 도로명 표시를 누르세요.</div>' +
      '<div class="mwRoadLegend" hidden></div>';
    host.parentNode.insertBefore(section, host);
    const toggle = section.querySelector(".mwRoadToggle");
    const status = section.querySelector(".mwRoadStatus");
    const legend = section.querySelector(".mwRoadLegend");
    const cache = new Map();
    let enabled = false, generation = 0, work = Promise.resolve();
    let selectedKey = "";
    let shapes = [];
    let textLabels = [];

    function message(txt) { status.textContent = txt; }
    function destroyShapes() {
      for (const poly of shapes) poly.setMap(null);
      for (const label of textLabels) label.setMap(null);
      shapes = [];
      textLabels = [];
    }
    function targetZips() {
      return (getSelectedZips() || []).filter((zip) => !!getFeature(zip)).slice(0, LIMIT_ZIPS);
    }

    async function readZip(zip, token) {
      const feature = getFeature(zip);
      const plan = sampleFeature(feature);
      const points = selectEvenly(plan?.points, LIMIT_SAMPLES_PER_ZIP);
      const found = [];
      let next = 0, mismatch = 0, missing = 0;
      await Promise.all(Array.from({ length: WORKERS }, async () => {
        while (next < points.length && enabled && generation === token) {
          const point = points[next++];
          let result = null;
          try { result = await reverseLookup(point.lng, point.lat); } catch {}
          if (!enabled || generation !== token) return;
          const roadName = extractRoadName(result);
          if (!roadName || !result?.roadAddress) { missing++; continue; }
          if (result.zonecode && String(result.zonecode) !== zip) { mismatch++; continue; }
          found.push({
            lng: Number(point.lng), lat: Number(point.lat),
            roadName, roadAddress: String(result.roadAddress).trim(),
            buildingName: String(result.buildingName || "").trim(),
            zonecode: result.zonecode || null
          });
        }
      }));
      if (!enabled || generation !== token) return null;
      const count = Math.max(1, points.length);
      const effectiveSpacing = Math.max(15, Math.min(180, Number(plan.spacingMeters || 35) * Math.sqrt((plan.points.length || count) / count)));
      return { zip, feature, samples: found, groups: groupRoadSamples(found), attempted: points.length, mismatch, missing, spacingMeters: effectiveSpacing };
    }

    function clipSquare(feature, sample, halfMeters) {
      const lat = sample.lat, lng = sample.lng;
      const dy = halfMeters / 110574;
      const dx = halfMeters / (111320 * Math.max(0.25, Math.cos(lat * Math.PI / 180)));
      const corners = [
        [lng - dx, lat - dy], [lng + dx, lat - dy],
        [lng + dx, lat + dy], [lng - dx, lat + dy],
        [lng - dx, lat - dy]
      ];
      try { return turf.intersect(turf.polygon([corners]), feature); }
      catch { return null; }
    }

    function drawClippedGeometry(geometry, color, groupKey, group) {
      const g = geometry?.geometry || geometry;
      if (!g || !["Polygon", "MultiPolygon"].includes(g.type)) return;
      const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const rings of parts) {
        const path = (rings || []).map((ring) => ring.slice(0, -1).map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))).filter((ring) => ring.length >= 3);
        if (!path.length) continue;
        const polygon = new kakao.maps.Polygon({
          map, path: path.length === 1 ? path[0] : path,
          fillColor: color.fill, fillOpacity: selectedKey && selectedKey !== groupKey ? 0.09 : 0.64,
          strokeColor: color.edge, strokeOpacity: selectedKey && selectedKey !== groupKey ? 0.1 : 0.72,
          strokeWeight: 1, zIndex: 6, clickable: false
        });
        shapes.push(polygon);
        group.drawings.push(polygon);
      }
    }

    function drawLabels(groups) {
      for (const label of textLabels) label.setMap(null);
      textLabels = [];
      const locations = [];
      const projection = map.getProjection?.();
      const level = Number(map.getLevel?.() || 6);
      if (level > 6) return;
      for (const entry of groups) {
        const g = entry.group;
        if (!g.samples.length) continue;
        const latAvg = g.samples.reduce((a, x) => a + x.lat, 0) / g.samples.length;
        const lngAvg = g.samples.reduce((a, x) => a + x.lng, 0) / g.samples.length;
        const sample = g.samples.slice().sort((a, b) =>
          Math.hypot(a.lat - latAvg, a.lng - lngAvg) - Math.hypot(b.lat - latAvg, b.lng - lngAvg))[0];
        const point = new kakao.maps.LatLng(sample.lat, sample.lng);
        if (projection?.containerPointFromCoords) {
          const pixel = projection.containerPointFromCoords(point);
          if (locations.some((loc) => Math.abs(loc.x - pixel.x) < 115 && Math.abs(loc.y - pixel.y) < 34)) continue;
          locations.push(pixel);
        }
        const label = document.createElement("div");
        label.className = "mwRoadLabel";
        label.textContent = g.name;
        label.style.borderColor = g.color.edge;
        const overlay = new kakao.maps.CustomOverlay({ position: point, content: label, yAnchor: 0.5, zIndex: 10, clickable: false });
        overlay.setMap(map);
        textLabels.push(overlay);
      }
    }

    function renderLegend(allGroups, totalSamples, totalAddresses, totalAttempted) {
      legend.replaceChildren();
      legend.hidden = !allGroups.length;
      if (!allGroups.length) {
        message("조회한 " + totalAttempted + "개 위치에서 도로명주소가 확인되지 않았습니다. 해당 구역은 색상 영역을 그리지 않습니다.");
        return;
      }
      message("도로명 " + allGroups.length + "개 · 확인 주소 " + totalAddresses + "개 · 유효 위치 " + totalSamples + "/" + totalAttempted + "개 (표본)");
      for (const entry of allGroups) {
        const g = entry.group;
        const key = entry.zip + "|" + g.name;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mwRoadRow";
        button.dataset.selected = String(selectedKey === key);
        const swatch = document.createElement("span");
        swatch.className = "mwRoadSwatch";
        swatch.style.background = g.color.fill;
        swatch.style.borderColor = g.color.edge;
        const road = document.createElement("span");
        road.className = "mwRoadName";
        road.textContent = (targetZips().length > 1 ? entry.zip + " · " : "") + g.name;
        const count = document.createElement("span");
        count.className = "mwRoadCount";
        count.textContent = g.addresses.size + "주소 / " + g.samples.length + "지점";
        button.append(swatch, road, count);
        const details = document.createElement("div");
        details.className = "mwRoadDetails";
        details.hidden = selectedKey !== key;
        details.textContent = [...g.addresses].slice(0, 7).join(" · ") +
          (g.addresses.size > 7 ? " 외 " + (g.addresses.size - 7) + "개" : "");
        button.addEventListener("click", () => {
          selectedKey = selectedKey === key ? "" : key;
          refreshCurrentView();
        });
        legend.append(button, details);
      }
    }

    function refreshCurrentView() {
      if (!enabled) return;
      const allGroups = [];
      let totalSamples = 0, totalAddresses = 0, totalAttempted = 0;
      destroyShapes();
      for (const zip of targetZips()) {
        const found = cache.get(zip);
        if (!found) continue;
        totalSamples += found.samples.length;
        totalAttempted += found.attempted;
        for (const g of found.groups) {
          g.drawings = [];
          totalAddresses += g.addresses.size;
          const key = zip + "|" + g.name;
          const halfMeters = Math.max(8, Math.min(38, found.spacingMeters * 0.18));
          for (const sample of g.samples) {
            const clipped = clipSquare(found.feature, sample, halfMeters);
            if (clipped) drawClippedGeometry(clipped, g.color, key, g);
          }
          allGroups.push({ zip, group: g });
        }
      }
      renderLegend(allGroups, totalSamples, totalAddresses, totalAttempted);
      drawLabels(allGroups);
    }

    async function perform(token) {
      if (!enabled || generation !== token) return;
      const zips = targetZips();
      if (!zips.length) {
        destroyShapes();
        legend.replaceChildren();
        legend.hidden = true;
        message("먼저 우편번호를 입력하고 '지도표시'로 폴리곤을 조회하세요.");
        return;
      }
      const requested = getSelectedZips()?.length || zips.length;
      if (requested > LIMIT_ZIPS) message("동시에 " + LIMIT_ZIPS + "개 우편번호까지만 분석합니다.");
      for (let i = 0; i < zips.length; i++) {
        if (!enabled || generation !== token) return;
        const zip = zips[i];
        if (cache.has(zip)) continue;
        message(zip + " 도로명주소 표본 조회 중… (" + (i + 1) + "/" + zips.length + ")");
        const data = await readZip(zip, token);
        if (!data || generation !== token) return;
        cache.set(zip, data);
        refreshCurrentView();
      }
      if (enabled && generation === token) refreshCurrentView();
    }

    function schedule() {
      const ticket = ++generation;
      work = work.catch(() => {}).then(() => perform(ticket)).catch((error) => {
        if (generation === ticket && enabled) message("도로명 분석 실패: " + String(error?.message || error));
      });
    }
    function switchOff() {
      enabled = false;
      generation++;
      selectedKey = "";
      toggle.setAttribute("aria-pressed", "false");
      toggle.textContent = "도로명 표시";
      destroyShapes();
      legend.hidden = true;
      message("도로명 레이어가 꺼져 있습니다.");
    }
    toggle.addEventListener("click", () => {
      if (enabled) { switchOff(); return; }
      enabled = true;
      toggle.setAttribute("aria-pressed", "true");
      toggle.textContent = "도로명 숨기기";
      schedule();
    });
    if (kakao.maps.event?.addListener) {
      kakao.maps.event.addListener(map, "idle", () => {
        if (!enabled) return;
        const allGroups = targetZips().flatMap((zip) => (cache.get(zip)?.groups || []).map((group) => ({ zip, group })));
        drawLabels(allGroups);
      });
    }

    return {
      onZipLoaded(zip) { if (enabled && !cache.has(zip)) schedule(); },
      onZipRemoved(zip) { cache.delete(zip); if (enabled) schedule(); },
      onSelectionChange() { if (enabled) schedule(); },
      reset() { switchOff(); cache.clear(); },
      isEnabled() { return enabled; }
    };
  };
})();