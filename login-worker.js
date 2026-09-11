// login-worker.js
var login_worker_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/") url.pathname = "/";

      if (url.pathname === "/config.js" || url.pathname.endsWith("/config.js")) {
        if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
          return new Response("Missing SUPABASE_URL / SUPABASE_ANON_KEY", { status: 500 });
        }
        const body = `window.MARUWELL_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(env.SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(env.SUPABASE_ANON_KEY)},
  PATHS: { login:"/", index:"/index.html", route:"/coupangRouteMap.html" }
};`;
        return new Response(body, {
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" }
        });
      }

      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("ASSETS binding missing (deploy with Wrangler assets).", { status: 500 });
      }

      const response = await env.ASSETS.fetch(new Request(url.toString(), request));
      const p = url.pathname.replace(/\/+$/, "") || "/";
      const isHome = p === "/home" || p === "/home.html" || p === "/public/home";

      if (isHome && response.ok) {
        let html = await response.text();
        html = html
          .replaceAll("storage:localStorage", "storage:sessionStorage")
          .replaceAll("storage: localStorage", "storage: sessionStorage");
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "text/html; charset=utf-8");
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");
        headers.delete("Content-Length");
        return new Response(html, { status: response.status, headers });
      }

      return response;
    } catch (e) {
      console.error(e);
      return new Response("Worker exception", { status: 500 });
    }
  }
};
export { login_worker_default as default };
