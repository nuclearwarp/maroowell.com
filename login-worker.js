// login-worker.js
var login_worker_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("ASSETS binding missing", { status: 500 });
      }

      const response = await env.ASSETS.fetch(new Request(url.toString(), request));
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if ((path === "/config.js" || path.endsWith("/config.js")) && response.ok) {
        let js = await response.text();
        js = js.replace('index: "/zipcode_search"', 'index: "/post_login"');
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "application/javascript; charset=utf-8");
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.delete("Content-Length");
        return new Response(js, { status: response.status, headers });
      }

      if (path === "/" && response.ok) {
        let html = await response.text();
        html = html.replace('const DEFAULT_NEXT = (PATHS?.index || "/zipcode_search");', 'const DEFAULT_NEXT = (PATHS?.index || "/post_login");');
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "text/html; charset=utf-8");
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");
        headers.delete("Content-Length");
        return new Response(html, { status: response.status, headers });
      }

      const isHome = path === "/home" || path === "/home.html" || path === "/public/home";
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
