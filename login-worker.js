export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // "/"는 login.html로 rewrite 서빙
      if (url.pathname === "/") url.pathname = "/login.html";

      // config.js 동적 생성 (어디서든 /.../config.js 대응)
      if (url.pathname === "/config.js" || url.pathname.endsWith("/config.js")) {
        if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
          return new Response("Missing SUPABASE_URL / SUPABASE_ANON_KEY", { status: 500 });
        }
        const body = `window.MARUWELL_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(env.SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(env.SUPABASE_ANON_KEY)},
  PATHS: { login:"/login.html", index:"/index.html", route:"/coupangRouteMap.html" }
};`;
        return new Response(body, {
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
        });
      }

      // ✅ 여기서 ASSETS 없으면 예외 대신 메시지로
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("ASSETS binding missing (deploy with Wrangler assets).", {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      return env.ASSETS.fetch(new Request(url.toString(), request));
    } catch (e) {
      console.error(e);
      return new Response("Worker exception", { status: 500 });
    }
  },
};
