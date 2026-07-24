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

// 마루웰 회수율 운영 캠프 변경: 용인3(602) → 용인1(312)
if (/^\/maroowell_freshbag_ratio(?:\.html)?\/?$/i.test(location.pathname || "")) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input || "");

    if (/\/ratio\/query(?:[/?#]|$)/i.test(url) && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);

        if (String(body.camp || "").trim() === "용인1") {
          body.wave = "W2";
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {}
    }

    return nativeFetch(input, init);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const campFilter = document.getElementById("campFilter");
    const waveFilter = document.getElementById("waveFilter");

    if (!campFilter) return;

    const yonginOption = Array.from(campFilter.options)
      .find(option => option.value === "용인3");

    if (yonginOption) {
      yonginOption.value = "용인1";
      yonginOption.textContent = "용인1 - 주간";
    }

    campFilter.addEventListener("change", () => {
      if (campFilter.value === "용인1" && waveFilter) {
        waveFilter.value = "W2";
      }
    });
  });
}

// deploy kick: freshbag restore
