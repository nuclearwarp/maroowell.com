(() => {
  if (!location.pathname.startsWith("/zipcode_search")) return;

  const STYLE_ID = "zipcode-search-elevator-runtime-style";

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

  function numericMetricValue(metric) {
    const strong = metric?.querySelector("strong");
    const digits = String(strong?.textContent || "").replace(/[^0-9.-]/g, "");
    const value = Number(digits);
    return Number.isFinite(value) ? value : null;
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

      // V36부터 추정값은 O 판정에 사용하지 않는다.
      // 과거 캐시나 전환 중 응답에서 0호 추정 카드가 남는 경우만 숨긴다.
      if (text === "엘베 추정" && numericMetricValue(metric) === 0) {
        metric.hidden = true;
      }
    });
  }

  function start() {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
