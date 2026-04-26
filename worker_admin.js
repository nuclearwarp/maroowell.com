import routeWorker from "./worker.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return withCors(new Response("", { status: 204 }));

    const url = new URL(request.url);

    try {
      if (url.pathname === "/admin/me") {
        if (request.method !== "GET") return withCors(json({ ok: false, error: "Method Not Allowed" }, 405));
        return withCors(await handleAdminMe(request, env));
      }

      if (url.pathname === "/admin/db-introspect") {
        if (request.method !== "GET") return withCors(json({ ok: false, error: "Method Not Allowed" }, 405));
        return withCors(await handleDbIntrospect(request, env));
      }

      return routeWorker.fetch(request, env, ctx);
    } catch (e) {
      return withCors(json({ ok: false, error: e?.message || String(e) }, e?.status || 500));
    }
  },
};

function withCors(res) {
  const h = new Headers(res.headers || {});
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function needEnv(env, key) {
  const value = env[key];
  if (!value) throw new HttpError(500, `Missing ENV: ${key}`);
  return value;
}

function bearer(request) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) throw new HttpError(401, "로그인 토큰이 필요합니다.");
  return m[1].trim();
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function sbAsService(env, path, init = {}) {
  const base = needEnv(env, "SUPABASE_URL");
  const key = needEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (!headers.has("Content-Type") && init.method !== "GET" && init.method !== "HEAD") headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const data = await readJson(res);
  if (!res.ok) throw new HttpError(res.status, String(data?.message || data?.error || data || `HTTP ${res.status}`));
  return data;
}

async function sbAsUser(env, path, token, init = {}) {
  const base = needEnv(env, "SUPABASE_URL");
  const gatewayKey = env.SUPABASE_ANON_KEY || needEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", gatewayKey);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.method !== "GET" && init.method !== "HEAD") headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const data = await readJson(res);
  if (!res.ok) throw new HttpError(res.status, String(data?.message || data?.error || data || `HTTP ${res.status}`));
  return data;
}

async function requireAdmin(request, env) {
  const token = bearer(request);
  const user = await sbAsUser(env, "/auth/v1/user", token, { method: "GET" });
  if (!user?.id) throw new HttpError(401, "유효하지 않은 로그인 세션입니다.");

  const q = new URLSearchParams();
  q.set("select", "user_id,is_maroowell,is_admin");
  q.set("user_id", `eq.${user.id}`);
  q.set("limit", "1");
  const rows = await sbAsService(env, `/rest/v1/user_access?${q.toString()}`, { method: "GET" });
  const access = Array.isArray(rows) ? rows[0] : null;

  if (!access || access.is_maroowell !== true || access.is_admin !== true) {
    throw new HttpError(403, "최고관리자 권한이 필요합니다.");
  }

  return { token, user, access };
}

async function handleAdminMe(request, env) {
  const ctx = await requireAdmin(request, env);
  return json({ ok: true, user: { id: ctx.user.id, email: ctx.user.email || null }, access: ctx.access }, 200, { "Cache-Control": "no-store" });
}

async function handleDbIntrospect(request, env) {
  const ctx = await requireAdmin(request, env);
  const schema = await sbAsUser(env, "/rest/v1/rpc/mw_admin_dump_schema", ctx.token, { method: "POST", body: JSON.stringify({}) });
  return json({ ok: true, schema }, 200, { "Cache-Control": "no-store" });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
