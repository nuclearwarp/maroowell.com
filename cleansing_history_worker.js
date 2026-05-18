const API_PREFIX = "/api/cleansing-history";
const TABLE_HISTORY = "cleansing_history";
const TABLE_ACCESS = "cleansing_history_access";
const TABLE_USER_ACCESS = "user_access";
const TABLE_VENDOR_MEMBERS = "vendor_members";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    try {
      assertEnv(env);

      if ((url.pathname === "/" || url.pathname === "/health") && request.method === "GET") {
        return json({
          ok: true,
          service: "cleansing-history-api",
          time: new Date().toISOString()
        }, 200, cors);
      }

      if (!isApiPath(url.pathname)) {
        return json({
          ok: false,
          error: "not_found",
          path: url.pathname
        }, 404, cors);
      }

      const route = apiRoute(url.pathname);
      const auth = await requireUser(request, env);

      if (route === "/me" && request.method === "GET") {
        return json({
          ok: true,
          ...publicAuth(auth)
        }, 200, cors);
      }

      if (route === "/meta" && request.method === "GET") {
        requireSelect(auth);

        const latestWeek = await fetchLatestWeek(env, auth.token);

        return json({
          ok: true,
          latest_week: latestWeek
        }, 200, cors);
      }

      if (route === "" && request.method === "GET") {
        requireSelect(auth);

        const result = await fetchRows(url, env, auth.token);

        return json({
          ok: true,
          ...result
        }, 200, cors);
      }

      if (route === "" && request.method === "POST") {
        requireEdit(auth);

        const body = await readJson(request);
        const row = await createRow(body, env, auth.token);

        return json({
          ok: true,
          row
        }, 200, cors);
      }

      const id = route.match(/^\/([^/]+)$/)?.[1];

      if (id && request.method === "PATCH") {
        requireEdit(auth);

        const body = await readJson(request);
        const row = await updateRow(id, body, env, auth.token);

        return json({
          ok: true,
          row
        }, 200, cors);
      }

      return json({
        ok: false,
        error: "not_found",
        path: url.pathname
      }, 404, cors);
    } catch (err) {
      return json({
        ok: false,
        error: err?.message || String(err),
        detail: err?.detail || null
      }, err?.status || 500, cors);
    }
  }
};

function assertEnv(env) {
  const missing = [];

  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_ANON_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  }

  if (missing.length) {
    throw httpError(500, "missing_env: " + missing.join(", "));
  }
}

function isApiPath(pathname) {
  return pathname === API_PREFIX || pathname.startsWith(API_PREFIX + "/");
}

function apiRoute(pathname) {
  if (pathname === API_PREFIX) return "";
  return pathname.slice(API_PREFIX.length);
}

async function requireUser(request, env) {
  const token = bearerToken(request);

  if (!token) {
    throw httpError(401, "missing_bearer_token");
  }

  const userRes = await fetch(`${supabaseBase(env)}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: supabaseApiKey(env),
      Authorization: `Bearer ${token}`
    }
  });

  const userBodyText = await userRes.text();

  if (!userRes.ok) {
    throw httpError(401, "invalid_session", safeJson(userBodyText) || userBodyText);
  }

  const user = safeJson(userBodyText) || {};
  const userId = clean(user.id);
  const email = clean(user.email);

  if (!userId) {
    throw httpError(401, "invalid_user_payload");
  }

  const access = await fetchAccess(userId, email, token, env);

  return {
    token,
    user: {
      id: userId,
      email
    },
    access
  };
}

function bearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1]);
}

async function fetchAccess(userId, email, token, env) {
  const [userAccess, clhiAccess, roleLevel] = await Promise.all([
    fetchUserAccess(userId, email, token, env),
    fetchClhiAccess(userId, email, token, env),
    fetchVendorRoleLevel(userId, token, env)
  ]);

  const accessRoleLevel = Number(
    userAccess?.role_level ??
    userAccess?.max_role_level ??
    0
  );
  const maxRoleLevel = Math.max(accessRoleLevel, roleLevel);
  const isMaroowell = bool(userAccess?.is_maroowell);
  const isAdmin = bool(userAccess?.is_admin);
  const isSuperAdmin = bool(userAccess?.is_super_admin) || maxRoleLevel >= 90;
  const canSelect = isSuperAdmin || bool(clhiAccess?.can_select);

  return {
    raw: userAccess,
    clhi: clhiAccess,
    is_maroowell: isMaroowell,
    is_admin: isAdmin,
    is_super_admin: isSuperAdmin,
    is_dragon_car_admin: bool(userAccess?.is_dragon_car_admin),
    max_role_level: maxRoleLevel,
    can_select: canSelect
  };
}

async function fetchUserAccess(userId, email, token, env) {
  try {
    const rows = await supabaseGet(TABLE_USER_ACCESS, [
      "select=*",
      `user_id=eq.${postgrestValue(userId)}`,
      "limit=1"
    ], env, token);

    if (rows[0]) return rows[0];
  } catch {
    // Some installs also keep access rows keyed by email.
  }

  try {
    const rows = await supabaseGet(TABLE_USER_ACCESS, [
      "select=*",
      `email=eq.${postgrestValue(email)}`,
      "limit=1"
    ], env, token);

    return rows[0] || null;
  } catch {
    return null;
  }
}

async function fetchClhiAccess(userId, email, token, env) {
  try {
    const rows = await supabaseGet(TABLE_ACCESS, [
      "select=*",
      `user_id=eq.${postgrestValue(userId)}`,
      "can_select=eq.true",
      "limit=1"
    ], env, token);

    if (rows[0]) return rows[0];
  } catch {
    // Older access tables may not include all lookup columns.
  }

  try {
    const rows = await supabaseGet(TABLE_ACCESS, [
      "select=*",
      `email=eq.${postgrestValue(email)}`,
      "can_select=eq.true",
      "limit=1"
    ], env, token);

    return rows[0] || null;
  } catch {
    return null;
  }
}

async function fetchVendorRoleLevel(userId, token, env) {
  try {
    const rows = await supabaseGet(TABLE_VENDOR_MEMBERS, [
      "select=role_level",
      `user_id=eq.${postgrestValue(userId)}`,
      "is_active=eq.true",
      "order=role_level.desc",
      "limit=1"
    ], env, token);

    return Number(rows[0]?.role_level || 0);
  } catch {
    return 0;
  }
}

function publicAuth(auth) {
  const access = auth.access || {};

  return {
    user: auth.user,
    email: auth.user.email,
    is_maroowell: access.is_maroowell === true,
    is_admin: access.is_admin === true,
    is_super_admin: access.is_super_admin === true,
    is_dragon_car_admin: access.is_dragon_car_admin === true,
    max_role_level: Number(access.max_role_level || 0),
    can_select: access.can_select === true
  };
}

function requireSelect(auth) {
  if (auth?.access?.can_select === true) return;
  throw httpError(403, "cleansing_history_access_required");
}

function requireEdit(auth) {
  if (auth?.access?.is_super_admin === true) return;
  throw httpError(403, "super_admin_required");
}

function parseWeek(week) {
  const raw = clean(week).toUpperCase();
  const yearMatch = raw.match(/^\s*(20\d{2})/);
  const weekMatch = raw.match(/(\d{1,2})\s*W\b/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const weekNo = weekMatch ? Number(weekMatch[1]) : 0;

  return { year, weekNo };
}

function compareWeekDesc(a, b) {
  const aw = parseWeek(a?.week ?? a);
  const bw = parseWeek(b?.week ?? b);
  const diff = (bw.year - aw.year) || (bw.weekNo - aw.weekNo);

  if (diff) return diff;

  return clean(b?.week ?? b).localeCompare(clean(a?.week ?? a), "ko", {
    numeric: true,
    sensitivity: "base"
  });
}

function compareWeekAsc(a, b) {
  const aw = parseWeek(a?.week ?? a);
  const bw = parseWeek(b?.week ?? b);
  const diff = (aw.year - bw.year) || (aw.weekNo - bw.weekNo);

  if (diff) return diff;

  return clean(a?.week ?? a).localeCompare(clean(b?.week ?? b), "ko", {
    numeric: true,
    sensitivity: "base"
  });
}

function waveSortValue(wave) {
  const raw = clean(wave).toUpperCase();

  if (raw === "2W" || raw === "W2" || raw === "WAVE2" || raw === "주간") return 0;
  if (raw === "1W" || raw === "W1" || raw === "WAVE1" || raw === "야간") return 1;

  return 2;
}

function compareRows(a, b) {
  return compareWeekAsc(a, b) ||
    (waveSortValue(a.wave) - waveSortValue(b.wave)) ||
    clean(a.camp).localeCompare(clean(b.camp), "ko", { numeric: true, sensitivity: "base" }) ||
    clean(a.route).localeCompare(clean(b.route), "ko", { numeric: true, sensitivity: "base" });
}

function noSpace(v) {
  return String(v ?? "").replace(/\s+/g, "");
}

function weekKey(v) {
  const parts = parseWeek(v);
  return parts.year && parts.weekNo ? `${parts.year}-${parts.weekNo}W` : noSpace(v);
}

function previousWeekKey(year, weekNo, back) {
  if (!year || !weekNo) return "";

  if (weekNo > back) {
    return `${year}-${weekNo - back}W`;
  }

  return `${year - 1}-${52 - (back - weekNo)}W`;
}

function routeKey(value) {
  const raw = noSpace(value);

  if (!raw) return "";

  return Array.from(new Set(raw.split(",").map(v => v.trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" }))
    .join(",");
}

function statusKeys(row, weekOverride = "") {
  const week = weekOverride || weekKey(row.week);
  const camp = noSpace(row.camp);
  const wave = noSpace(row.wave);
  const route = routeKey(row.route);
  const reason = noSpace(row.reason);

  return {
    full: `${week}||${camp}||${wave}||${route}||${reason}`,
    route: `${week}||${camp}||${wave}||${route}`
  };
}

function buildStatusIndex(sourceRows) {
  const full = new Map();
  const route = new Map();

  for (const row of sourceRows || []) {
    const baseOk = weekKey(row.week) && noSpace(row.camp) && noSpace(row.wave) && routeKey(row.route);

    if (!baseOk) continue;

    const keys = statusKeys(row);

    if (noSpace(row.reason)) {
      full.set(keys.full, (full.get(keys.full) || 0) + 1);
    }

    route.set(keys.route, (route.get(keys.route) || 0) + 1);
  }

  return { full, route };
}

function cleansingStatus(row, index) {
  const parts = parseWeek(row.week);
  const prevOne = previousWeekKey(parts.year, parts.weekNo, 1);
  const prevTwo = previousWeekKey(parts.year, parts.weekNo, 2);

  if (!prevOne || !prevTwo) return "pass";

  const prevOneKeys = statusKeys(row, prevOne);
  const prevTwoKeys = statusKeys(row, prevTwo);
  const cleanCnt = index.full.get(prevTwoKeys.full) || 0;

  if (cleanCnt > 0) return "클렌징";

  const warnCnt =
    (index.full.get(prevOneKeys.full) || 0) +
    (index.full.get(prevTwoKeys.full) || 0) +
    (index.route.get(prevOneKeys.route) || 0) +
    (index.route.get(prevTwoKeys.route) || 0);

  return warnCnt > 0 ? "경고" : "pass";
}

function decorateRows(targetRows, sourceRows) {
  const index = buildStatusIndex(sourceRows);

  return (targetRows || []).map(row => ({
    ...row,
    cleansing_status: cleansingStatus(row, index)
  }));
}

async function fetchLatestWeek(env, token) {
  const rows = await supabaseGetAll(TABLE_HISTORY, [
    "select=week",
    "week=not.is.null",
    "order=id.asc"
  ], env, token);

  const latest = rows
    .filter(row => clean(row?.week))
    .sort(compareWeekDesc)[0];

  return clean(latest?.week);
}

async function fetchRows(url, env, token) {
  const limit = clampInt(url.searchParams.get("limit"), 300, 1, 1000);
  const q = clean(url.searchParams.get("q"));
  const parts = [
    "select=*",
    filterEq("week", url.searchParams.get("week")),
    filterEq("camp", url.searchParams.get("camp")),
    filterEq("wave", normalizeWave(url.searchParams.get("wave"))),
    filterIlike("route", url.searchParams.get("route")),
    filterIlike("vendor_name", url.searchParams.get("vendor")),
    filterIlike("business_number", url.searchParams.get("biz")),
    filterEq("reason", url.searchParams.get("reason")),
    q ? buildSearchFilter(q) : "",
    "order=id.asc"
  ];

  const { rows, count } = await supabaseGetAllWithCount(TABLE_HISTORY, parts, env, token);
  const contextRows = await supabaseGetAll(TABLE_HISTORY, [
    "select=week,camp,wave,route,reason",
    "order=id.asc"
  ], env, token);
  const sorted = decorateRows(rows.map(normalizeRow), contextRows).sort(compareRows);
  const out = sorted.slice(0, limit);

  return {
    rows: out,
    count,
    effective_week: clean(url.searchParams.get("week")) || clean(out[0]?.week)
  };
}

async function createRow(body, env, token) {
  const payload = normalizePayload(body, { partial: false });
  const rows = await supabaseInsert(TABLE_HISTORY, [payload], env, token);
  return normalizeRow(rows[0] || payload);
}

async function updateRow(id, body, env, token) {
  const payload = normalizePayload(body, { partial: true });

  if (!Object.keys(payload).length) {
    throw httpError(400, "empty_patch");
  }

  const rows = await supabasePatch(TABLE_HISTORY, id, payload, env, token);
  const row = rows[0] || null;

  if (!row) {
    throw httpError(404, "row_not_found");
  }

  return normalizeRow(row);
}

function normalizePayload(input, { partial }) {
  const body = input && typeof input === "object" ? input : {};
  const allowed = [
    "week",
    "camp",
    "wave",
    "route",
    "zip",
    "demand",
    "complete",
    "execution_rate",
    "execution_rate_grade",
    "reason",
    "price",
    "vendor_name",
    "business_number"
  ];
  const payload = {};

  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;

    payload[key] = normalizeField(key, body[key]);
  }

  if (!partial) {
    for (const key of ["week", "camp", "route"]) {
      if (!clean(payload[key])) {
        throw httpError(400, `${key}_required`);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "wave")) {
    payload.wave = normalizeWave(payload.wave) || null;
  }

  return payload;
}

function normalizeField(key, value) {
  if (["demand", "complete", "execution_rate", "price"].includes(key)) {
    return nullableNumber(value);
  }

  const text = clean(value);
  return text || null;
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;

  return {
    ...row,
    week: clean(row.week),
    camp: clean(row.camp),
    wave: clean(row.wave),
    route: clean(row.route),
    zip: clean(row.zip),
    vendor_name: clean(row.vendor_name),
    business_number: clean(row.business_number),
    reason: clean(row.reason)
  };
}

function normalizeWave(v) {
  const raw = compact(v).toUpperCase();

  if (!raw) return "";
  if (["1W", "W1", "WAVE1", "N", "NIGHT", "야간"].includes(raw)) return "1W";
  if (["2W", "W2", "WAVE2", "D", "DAY", "주간"].includes(raw)) return "2W";

  return clean(v);
}

function filterEq(field, value) {
  const v = clean(value);
  return v ? `${field}=eq.${postgrestValue(v)}` : "";
}

function filterIlike(field, value) {
  const v = clean(value);
  return v ? `${field}=ilike.${postgrestValue(`*${v}*`)}` : "";
}

function buildSearchFilter(value) {
  const pattern = `*${clean(value)}*`;
  const fields = [
    "week",
    "camp",
    "wave",
    "route",
    "zip",
    "execution_rate_grade",
    "reason",
    "vendor_name",
    "business_number"
  ];
  const body = fields
    .map(field => `${field}.ilike.${postgrestValue(pattern)}`)
    .join(",");

  return `or=(${body})`;
}

async function supabaseGet(table, queryParts, env, token = "") {
  const { rows } = await supabaseGetWithCount(table, queryParts, env, token);
  return rows;
}

async function supabaseGetAll(table, queryParts, env, token = "") {
  const { rows } = await supabaseGetAllWithCount(table, queryParts, env, token);
  return rows;
}

async function supabaseGetAllWithCount(table, queryParts, env, token = "") {
  const out = [];
  const pageSize = 1000;
  let count = null;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const pagedParts = [
      ...queryParts.filter(part => part && !String(part).startsWith("limit=") && !String(part).startsWith("offset=")),
      `limit=${pageSize}`,
      `offset=${offset}`
    ];
    const result = await supabaseGetWithCount(table, pagedParts, env, token);
    const pageRows = Array.isArray(result.rows) ? result.rows : [];

    if (offset === 0) {
      count = Number.isFinite(result.count) ? result.count : null;
    }

    out.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return {
    rows: out,
    count: count ?? out.length
  };
}

async function supabaseGetWithCount(table, queryParts, env, token = "") {
  const query = queryParts.filter(Boolean).join("&");
  const url = `${supabaseBase(env)}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...serviceHeaders(env, token),
      Prefer: "count=exact"
    }
  });
  const text = await res.text();

  if (!res.ok) {
    throw httpError(res.status, `supabase_get_failed:${table}`, safeJson(text) || text);
  }

  const rows = safeJson(text) || [];
  const count = parseContentRangeCount(res.headers.get("Content-Range")) ?? rows.length;

  return {
    rows: Array.isArray(rows) ? rows : [],
    count
  };
}

async function supabaseInsert(table, rows, env, token = "") {
  const url = `${supabaseBase(env)}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...serviceHeaders(env, token),
      Prefer: "return=representation"
    },
    body: JSON.stringify(rows)
  });
  const text = await res.text();

  if (!res.ok) {
    throw httpError(res.status, `supabase_insert_failed:${table}`, safeJson(text) || text);
  }

  return safeJson(text) || [];
}

async function supabasePatch(table, id, payload, env, token = "") {
  const url = `${supabaseBase(env)}/rest/v1/${table}?id=eq.${postgrestValue(id)}&select=*`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...serviceHeaders(env, token),
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();

  if (!res.ok) {
    throw httpError(res.status, `supabase_patch_failed:${table}`, safeJson(text) || text);
  }

  return safeJson(text) || [];
}

function postgrestValue(value) {
  return encodeURIComponent(clean(value));
}

function parseContentRangeCount(value) {
  const match = clean(value).match(/\/(\d+|\*)$/);

  if (!match || match[1] === "*") return null;

  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

function supabaseBase(env) {
  return String(env.SUPABASE_URL || "").replace(/\/+$/, "");
}

function supabaseApiKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
}

function supabaseAuthToken(env, token = "") {
  return env.SUPABASE_SERVICE_ROLE_KEY || token || env.SUPABASE_ANON_KEY;
}

function serviceHeaders(env, token = "") {
  return {
    apikey: supabaseApiKey(env),
    Authorization: `Bearer ${supabaseAuthToken(env, token)}`,
    "Content-Type": "application/json"
  };
}

async function readJson(request) {
  const text = await request.text();

  if (!text.trim()) {
    throw httpError(400, "empty_body");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "invalid_json");
  }
}

function clean(v) {
  return String(v ?? "").trim();
}

function compact(v) {
  return clean(v).replace(/\s+/g, "");
}

function bool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;

  const s = compact(v).toLowerCase();

  return ["true", "1", "y", "yes", "on", "관리자", "마루웰"].includes(s);
}

function nullableNumber(v) {
  if (v === null || v === undefined || clean(v) === "") return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(v, fallback, min, max) {
  const n = Number(v);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function httpError(status, message, detail = null) {
  const err = new Error(message);
  err.status = status;
  err.detail = detail;
  return err;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = clean(env.ALLOWED_ORIGIN);

  let allowOrigin = "*";

  if (allowed) {
    const allowedList = allowed.split(",").map(v => clean(v)).filter(Boolean);
    allowOrigin = allowedList.includes(origin) ? origin : allowedList[0];
  } else if (origin) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
