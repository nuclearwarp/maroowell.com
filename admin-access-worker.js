/**
 * Maroowell admin-access API
 *
 * ENV:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

const API_VERSION = "2026-10-07-admin-access-v2";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return cors(new Response("", { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/health") {
        return cors(json({ ok: true, service: "admin-access", version: API_VERSION }));
      }

      if (path === "/admin/me" && request.method === "GET") {
        return cors(await handleAdminMe(request, env));
      }

      if (path === "/admin/access/users" && request.method === "GET") {
        return cors(await handleAccessUsers(request, env));
      }

      if (path === "/admin/access/set" && request.method === "POST") {
        return cors(await handleAccessSet(request, env));
      }

      if (path === "/admin/db-introspect" && request.method === "GET") {
        return cors(await handleAdminDbIntrospect(request, env));
      }

      return cors(json({ ok: false, error: "Not Found" }, 404));
    } catch (error) {
      const status = normalizeStatus(error?.status || error?.statusCode || 500);
      return cors(json({
        ok: false,
        error: error?.message || String(error)
      }, status));
    }
  }
};

function normalizeStatus(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 400 && n <= 599 ? n : 500;
}

function cors(res) {
  const h = new Headers(res.headers || {});
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function mustEnv(env, key) {
  const value = env[key];
  if (!value) throw httpError(500, `Missing ENV: ${key}`);
  return String(value).replace(/\/$/, "");
}

function bearer(request) {
  const raw = request.headers.get("Authorization") || "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Invalid JSON body");
  }
}

async function supabase(env, path, init = {}, token = "") {
  const base = mustEnv(env, "SUPABASE_URL");
  const serviceKey = mustEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${token || serviceKey}`);
  if (!headers.has("Content-Type") && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(base + path, { ...init, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = text; }
  }

  if (!res.ok) {
    const msg = body?.message || body?.error || body?.hint || text || `Supabase HTTP ${res.status}`;
    throw httpError(res.status, msg);
  }
  return body;
}

async function requireUser(request, env) {
  const token = bearer(request);
  if (!token) throw httpError(401, "로그인이 필요합니다.");
  const user = await supabase(env, "/auth/v1/user", { method: "GET" }, token);
  if (!user?.id) throw httpError(401, "유효하지 않은 로그인 세션입니다.");
  return { token, user };
}

async function rpc(env, token, name, args = {}) {
  return await supabase(env, `/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args)
  }, token);
}

async function requireSuperAdmin(request, env) {
  const { token, user } = await requireUser(request, env);
  const result = await rpc(env, token, "mw_my_web_access", {});
  const row = Array.isArray(result) ? result[0] : result;
  const level = Number(row?.max_role_level || 0);
  const allowed = row?.is_maroowell === true &&
                  row?.is_admin === true &&
                  level >= 90 &&
                  row?.approval_status === "approved" &&
                  row?.app_only !== true;

  if (!allowed) throw httpError(403, "최고관리자 권한이 필요합니다.");
  return { token, user, access: row };
}

async function handleAdminMe(request, env) {
  const { user, access } = await requireSuperAdmin(request, env);
  return json({
    ok: true,
    version: API_VERSION,
    user: { id: user.id, email: user.email || null },
    access
  });
}

async function handleAccessUsers(request, env) {
  const { token } = await requireSuperAdmin(request, env);
  const rows = await rpc(env, token, "mw_admin_access_users_v2", {});
  return json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}

function normalizeRoleLevel(value) {
  const level = Number(value);
  if (![0, 30, 60, 90].includes(level)) {
    throw httpError(400, "role_level must be one of 0, 30, 60, 90");
  }
  return level;
}

async function handleAccessSet(request, env) {
  const { token } = await requireSuperAdmin(request, env);
  const body = await readJson(request);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) throw httpError(400, "email is required");

  const roleLevel = normalizeRoleLevel(body?.role_level);
  const dragon = Object.prototype.hasOwnProperty.call(body || {}, "is_dragon_car_admin")
    ? body.is_dragon_car_admin === true
    : null;
  const memo = body?.memo == null ? null : String(body.memo).trim();

  const rows = await rpc(env, token, "mw_admin_apply_access_v2", {
    p_email: email,
    p_role_level: roleLevel,
    p_is_dragon_car_admin: dragon,
    p_memo: memo || null
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return json({ ok: true, row });
}

async function handleAdminDbIntrospect(request, env) {
  const { token, user, access } = await requireSuperAdmin(request, env);
  const schema = await rpc(env, token, "mw_admin_dump_schema", {});
  return json({
    ok: true,
    user: { id: user.id, email: user.email || null },
    access,
    schema
  });
}
