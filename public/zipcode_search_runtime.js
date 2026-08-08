(() => {
  if (!location.pathname.startsWith("/zipcode_search")) return;

  const STYLE_ID = "zipcode-search-elevator-runtime-style";
  const BUILDING_LOG_PREFIX = /^\[BUILDING_/;

  function suppressBuildingConsoleNoise() {
    for (const method of ["info", "warn", "error"]) {
      const original = console?.[method];
      if (typeof original !== "function" || original.__mwBuildingFiltered) continue;

      const wrapped = function (...args) {
        const first = String(args?.[0] ?? "");
        if (BUILDING_LOG_PREFIX.test(first)) return;
        return original.apply(console, args);
      };
      wrapped.__mwBuildingFiltered = true;
      console[method] = wrapped;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .buildingStatsMetric.elevator-yes > span,
      .buildingStatsMetric.elevator-yes > strong {
        color: #2563eb !important;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeElevatorLabels(root = document) {
    ensureStyle();

    root.querySelectorAll?.(".buildingStatsMetric > span").forEach((label) => {
      const metric = label.closest(".buildingStatsMetric");
      if (!metric) return;

      const text = String(label.textContent || "").trim();

      if (text === "엘베 있음") {
        label.textContent = "엘베 O";
        metric.classList.add("elevator-yes");
        return;
      }

      if (text === "엘베 없음") {
        label.textContent = "엘베 X";
        metric.classList.add("elevator-no");
        return;
      }

      // V36부터 추정값은 실제 O 판정에 쓰지 않으므로 UI에서도 제거한다.
      if (text === "엘베 추정") {
        metric.hidden = true;
      }
    });
  }

  function start() {
    suppressBuildingConsoleNoise();
    normalizeElevatorLabels(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node?.nodeType === Node.ELEMENT_NODE) {
            normalizeElevatorLabels(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  suppressBuildingConsoleNoise();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
