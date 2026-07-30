(() => {
  "use strict";

  const currentPath = String(location.pathname || "").replace(/\/+$/, "");
  if (currentPath !== "/maroowell_freshbag_ratio" && currentPath !== "/maroowell_freshbag_ratio.html") return;
  if (window.__MW_RATIO_FULL_COPY_PATCH__) return;
  window.__MW_RATIO_FULL_COPY_PATCH__ = true;

  let busy = false;

  function setStatus(message, type = "") {
    const el = document.getElementById("statusText");
    if (!el) return;
    el.textContent = message;
    el.className = type ? `status ${type}` : "status";
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maroowell_freshbag_ratio_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function canvasToBlob(canvas) {
    return await new Promise(resolve => canvas.toBlob(resolve, "image/png", 1));
  }

  async function copyFullMonthlyTable(button) {
    if (busy) return;

    const source = document.getElementById("totalCaptureTarget");
    if (!source) {
      setStatus("이미지로 복사할 월 누적 표를 찾지 못했습니다.", "bad");
      return;
    }

    if (!window.html2canvas) {
      setStatus("이미지 복사 라이브러리를 불러오지 못했습니다.", "bad");
      return;
    }

    busy = true;
    button.disabled = true;
    setStatus("월 누적 회수율 전체 이미지 생성 중...", "warn");

    let tempWrap = null;

    try {
      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch {}
      }

      tempWrap = document.createElement("div");
      Object.assign(tempWrap.style, {
        position: "fixed",
        left: "-100000px",
        top: "0",
        zIndex: "-1",
        padding: "0",
        margin: "0",
        overflow: "visible",
        background: "#ffffff"
      });

      const clone = source.cloneNode(true);
      clone.removeAttribute("id");
      Object.assign(clone.style, {
        width: "max-content",
        minWidth: "0",
        height: "auto",
        maxHeight: "none",
        overflow: "visible",
        borderRadius: "16px",
        background: "#ffffff"
      });

      const table = clone.querySelector("table");
      if (table) {
        Object.assign(table.style, {
          width: "max-content",
          minWidth: "0"
        });
      }

      clone.querySelectorAll("th").forEach(th => {
        th.style.position = "static";
        th.style.top = "auto";
      });

      tempWrap.appendChild(clone);
      document.body.appendChild(tempWrap);

      const rect = clone.getBoundingClientRect();
      const width = Math.ceil(Math.max(clone.scrollWidth, rect.width));
      const height = Math.ceil(Math.max(clone.scrollHeight, rect.height));
      const scale = Math.max(2, Math.min(4, window.devicePixelRatio || 2));

      const canvas = await window.html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0
      });

      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("이미지 생성에 실패했습니다.");

      if (!isMobile() && navigator.clipboard?.write && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ]);
          setStatus("월 누적 회수율 전체 이미지 클립보드 복사 완료", "ok");
          return;
        } catch (error) {
          console.warn("monthly ratio clipboard copy failed", error);
        }
      }

      downloadBlob(blob);
      setStatus(
        isMobile()
          ? "월 누적 회수율 전체 이미지 원본 PNG 저장 완료"
          : "클립보드 복사가 제한되어 전체 이미지 PNG 저장 완료",
        "ok"
      );
    } catch (error) {
      console.error("monthly ratio full image copy failed", error);
      setStatus(error?.message || "월 누적 회수율 이미지 생성에 실패했습니다.", "bad");
    } finally {
      tempWrap?.remove();
      button.disabled = false;
      busy = false;
    }
  }

  document.addEventListener("click", event => {
    const target = event.target;
    const button = target instanceof Element ? target.closest("#copyTotalImageBtn") : null;
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    copyFullMonthlyTable(button);
  }, true);
})();
