// MarooWell Frontend Config
// ✅ 여기에 Supabase Project URL / Anon(public) Key만 넣으세요.
// ⚠️ service_role key(비공개/서버용)는 절대 넣으면 안 됩니다.

window.MARUWELL_CONFIG = {
  SUPABASE_URL: "https://rgqerimdxkthkcewqbbe.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_FUFuH5JVyM-JLWWVeasgOw_Sk_LtD9H",
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

// 우편번호 검색기 전용 상호작용/지형정보 UI 보강 스크립트를 본문보다 먼저 동기 로드한다.
if (/^\/zipcode_search(?:\.html)?\/?$/i.test(location.pathname || "")) {
  document.write('<script src="/zipcode-search-enhancements.js?v=20260720-1"><\/script>');
}

// deploy kick: freshbag restore