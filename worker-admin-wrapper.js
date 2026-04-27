import appWorker from "./worker.js";

/**
 * Admin API wrapper for the existing MarooWell Cloudflare Worker.
 *
 * Existing public API traffic is passed through to worker.js unchanged.
 * Admin endpoints are handled here so worker.js does not need a large risky edit.
 *
 * ENV:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

const ADMIN_PREFIX = "/admin";
const USER_ACCESS_TABLE = "user_access";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith(ADMIN_PREFIX)) {
      if (request.method === "OPTIONS") {
        return adminCors(new Response("", { status: 204 }));
      }

      try {
        if (path === "/admin/me" && request.method === "GET") {
          return adminCors(await handleAdminMe(request, env));
        }

        if (path === "/admin/db-introspect" && request.method === "GET") {
          return adminCors(await handleAdminDbIntrospect(request, env));
        }

        return adminCors(adminJson({ ok: false, error: "Not Found" }, 404));
      } catch (e) {
        const status = Number(e?.status || e?.statusCode || 500);
        return adminCors(adminJson({
          ok: false,
          error: e?.message || String(e)
        }, Number.isFinite(status) ? status : 500));
      }
    }

    return appWorker.fetch(request, env, ctx);
  }
};

function adminCors(res) {
  const h = new Headers(res.headers || {});
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

function adminJson(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mustEnv(env, key) {
  const value = env[key];
  if (!value) throw httpError(500, `Missing ENV: ${key}`);
  return value;
}

function getBearerToken(request) {
  const raw = request.headers.get("Authorization") || "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function supabaseRequest(env, pathWithQuery, init = {}, authToken = "") {
  const base = mustEnv(env, "SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = mustEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers || {});

  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${authToken || serviceKey}`);

  if (!headers.has("Content-Type") && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${base}${pathWithQuery}`, {
    ...init,
    headers
  });

  const text = await res.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const msg = body?.message || body?.error || text || `Supabase HTTP ${res.status}`;
    throw httpError(res.status, msg);
  }

  return body;
}

async function getSupabaseUser(env, userToken) {
  if (!userToken) throw httpError(401, "로그인이 필요합니다.");

  const user = await supabaseRequest(env, "/auth/v1/user", {
    method: "GET"
  }, userToken);

  if (!user?.id) throw httpError(401, "유효하지 않은 로그인 세션입니다.");
  return user;
}

async function getUserAccess(env, userId) {
  const params = new URLSearchParams();
  params.set("select", "user_id,is_maroowell,is_admin");
  params.set("user_id", `eq.${userId}`);
  params.set("limit", "1");

  const rows = await supabaseRequest(
    env,
    `/rest/v1/${USER_ACCESS_TABLE}?${params.toString()}`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function requireAdmin(request, env) {
  const userToken = getBearerToken(request);
  const user = await getSupabaseUser(env, userToken);
  const access = await getUserAccess(env, user.id);

  const isMaroowell = access?.is_maroowell === true;
  const isAdmin = access?.is_admin === true;

  if (!isMaroowell || !isAdmin) {
    throw httpError(403, "최고관리자 권한이 필요합니다.");
  }

  return { userToken, user, access };
}

async function handleAdminMe(request, env) {
  const { user, access } = await requireAdmin(request, env);
  return adminJson({
    ok: true,
    user: {
      id: user.id,
      email: user.email || null
    },
    access: {
      user_id: access.user_id,
      is_maroowell: access.is_maroowell === true,
      is_admin: access.is_admin === true
    }
  });
}

async function handleAdminDbIntrospect(request, env) {
  const { userToken, user, access } = await requireAdmin(request, env);

  const schema = await supabaseRequest(env, "/rest/v1/rpc/mw_admin_dump_schema", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  }, userToken);

  return adminJson({
    ok: true,
    user: {
      id: user.id,
      email: user.email || null
    },
    access: {
      user_id: access.user_id,
      is_maroowell: access.is_maroowell === true,
      is_admin: access.is_admin === true
    },
    schema
  });
}
