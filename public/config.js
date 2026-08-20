// MarooWell Frontend Config
// ✅ 여기에 Supabase Project URL / Anon(public) Key만 넣으세요.
// ⚠️ service_role key(비공개/서버용)는 절대 넣으면 안 됩니다.

window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: ["sb_publishable_", "FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H"].join(""),
  ADMIN_API_BASE: "https://admin-access.maroowell.com",
  CLEANSING_HISTORY_API_BASE: "https://cleansinghistory.maroowell.com",

  PATHS: {
    // login.html을 index.html로 바꿨으므로 기본 로그인 진입점은 루트
    login: "/",

    // 기존 index.html 우편번호 검색기를 public/zipcode_search로 옮겼으므로
    index: "/zipcode_search",

    route: "/coupangRouteMap.html",
    dragon_car_index: "/dragon_car_index.html",
    maroowell_info: "/maroowell_info.html",
  }
};

// Android 앱의 날짜 상세에서 /maroowell_route_info?camp=...&route=... 로 들어오면
// 기존 카카오 라우트정보 화면의 검색칸을 채우고 초기화가 끝난 뒤 자동 조회합니다.
window.addEventListener("DOMContentLoaded", () => {
  const path = String(location.pathname || "").replace(/\.html$/i, "").replace(/\/$/, "");
  if (path !== "/maroowell_route_info") return;

  const params = new URLSearchParams(location.search);
  const camp = String(params.get("camp") || "").trim();
  const route = String(params.get("route") || "").trim();
  if (!camp) return;

  const campInput = document.getElementById("campInput");
  const routeInput = document.getElementById("routeSearchInput");
  const loadBtn = document.getElementById("loadBtn");
  if (!campInput || !routeInput || !loadBtn) return;

  campInput.value = camp;
  routeInput.value = route;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const status = document.getElementById("statusText")?.textContent || "";
    const ready = status.includes("Camp") && status.includes("Route") && status.includes("조회");
    if (ready) {
      clearInterval(timer);
      loadBtn.click();
      return;
    }
    if (attempts >= 50) clearInterval(timer);
  }, 200);
});

// deploy kick: freshbag restore
