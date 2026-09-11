// login-worker-v2.js
var login_worker_v2_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("ASSETS binding missing", { status: 500 });
      }

      const response = await env.ASSETS.fetch(new Request(url.toString(), request));
      const path = url.pathname.replace(/\/+$/, "") || "/";

      const withNoStore = async (res, type) => {
        const body = await res.text();
        const headers = new Headers(res.headers);
        if (type) headers.set("Content-Type", type);
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");
        headers.delete("Content-Length");
        return new Response(body, { status: res.status, headers });
      };

      if ((path === "/config.js" || path.endsWith("/config.js")) && response.ok) {
        let body = await response.text();
        body = body.replace('index: "/zipcode_search"', 'index: "/post_login"');
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "application/javascript; charset=utf-8");
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");
        headers.delete("Content-Length");
        return new Response(body, { status: response.status, headers });
      }

      if (path === "/" && response.ok) {
        let body = await response.text();
        body = body.replace(
          'const DEFAULT_NEXT = (PATHS?.index || "/zipcode_search");',
          'const DEFAULT_NEXT = "/post_login";'
        );
        body = body.replace(
          'const rawNext = params.get("next") || DEFAULT_NEXT;',
          'const requestedNext = params.get("next"); const rawNext = (!requestedNext || requestedNext === "/zipcode_search" || requestedNext === "/zipcode_search/") ? DEFAULT_NEXT : requestedNext;'
        );
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "text/html; charset=utf-8");
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");
        headers.delete("Content-Length");
        return new Response(body, { status: response.status, headers });
      }

      if (["/home", "/home.html", "/public/home", "/post_login"].includes(path) && response.ok) {
        return withNoStore(response, "text/html; charset=utf-8");
      }

      return response;
    } catch (error) {
      console.error(error);
      return new Response("Worker exception", { status: 500 });
    }
  }
};

export { login_worker_v2_default as default };
