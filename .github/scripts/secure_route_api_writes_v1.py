from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f"{label}: anchor not found")
    return text.replace(old, new, 1)


# Server: protect every mutation with authenticated Maroowell admin/role>=60.
p = Path("worker.js")
text = p.read_text(encoding="utf-8")

if "MW_ROUTE_WRITE_AUTH_V1" not in text:
    text = replace_once(text, '''      if (path === "/route") {
        if (request.method === "GET") return cors(await handleRouteGet(url, env));
        if (request.method === "POST") return cors(await handleRoutePost(request, env));
        if (request.method === "DELETE") return cors(await handleRouteDelete(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }
''', '''      if (path === "/route") {
        if (request.method === "GET") return cors(await handleRouteGet(url, env));
        if (request.method === "POST") {
          await requireRouteWriteAccess(request, env);
          return cors(await handleRoutePost(request, env));
        }
        if (request.method === "DELETE") {
          await requireRouteWriteAccess(request, env);
          return cors(await handleRouteDelete(request, env));
        }
        return cors(json({ error: "Method Not Allowed" }, 405));
      }
''', "route mutation guard")

    text = replace_once(text, '''      if (path === "/camps") {
        if (request.method === "GET") return cors(await handleCampsGet(url, env));
        if (request.method === "POST") return cors(await handleCampsPost(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }
''', '''      if (path === "/camps") {
        if (request.method === "GET") return cors(await handleCampsGet(url, env));
        if (request.method === "POST") {
          await requireRouteWriteAccess(request, env);
          return cors(await handleCampsPost(request, env));
        }
        return cors(json({ error: "Method Not Allowed" }, 405));
      }
''', "camp mutation guard")

    text = replace_once(text, '''      if (path === "/vendors") {
        if (request.method === "GET") return cors(await handleVendorsGet(url, env));
        if (request.method === "POST") return cors(await handleVendorCreate(request, env));
        return cors(json({ error: "Method Not Allowed" }, 405));
      }
''', '''      if (path === "/vendors") {
        if (request.method === "GET") return cors(await handleVendorsGet(url, env));
        if (request.method === "POST") {
          await requireRouteWriteAccess(request, env);
          return cors(await handleVendorCreate(request, env));
        }
        return cors(json({ error: "Method Not Allowed" }, 405));
      }
''', "vendor mutation guard")

    text = replace_once(text, '''    } catch (e) {
      return cors(json({ error: e?.message || String(e) }, 500));
    }
''', '''    } catch (e) {
      const rawStatus = Number(e?.status || e?.statusCode || 500);
      const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
      return cors(json({ error: e?.message || String(e) }, status));
    }
''', "http status propagation")

    helpers = r'''
// MW_ROUTE_WRITE_AUTH_V1
const ROUTE_WRITE_MIN_LEVEL = 60;
const MAROOWELL_VENDOR_CODE = "bn_2591501828";

function routeHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function routeBearerToken(request) {
  const raw = request.headers.get("Authorization") || "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function routeAuthUser(request, env) {
  const token = routeBearerToken(request);
  if (!token) throw routeHttpError(401, "로그인 세션이 필요합니다.");

  const base = mustEnv(env, "SUPABASE_URL").replace(/\/$/, "");
  const key = mustEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${base}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) throw routeHttpError(401, "유효하지 않거나 만료된 로그인 세션입니다.");
  const user = await res.json().catch(() => null);
  if (!user?.id) throw routeHttpError(401, "로그인 사용자를 확인할 수 없습니다.");
  return user;
}

async function routeFirstRow(env, table, params) {
  const query = new URLSearchParams(params || {});
  if (!query.has("limit")) query.set("limit", "1");
  const rows = await supabaseFetch(env, `/rest/v1/${table}?${query.toString()}`, { method: "GET" });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function routeMaroowellVendor(env) {
  let row = await routeFirstRow(env, VENDORS_TABLE, {
    select: "id,name,vendor_code",
    vendor_code: `eq.${MAROOWELL_VENDOR_CODE}`,
    limit: "1"
  });
  if (row) return row;
  return routeFirstRow(env, VENDORS_TABLE, {
    select: "id,name,vendor_code",
    name: "eq.마루웰",
    limit: "1"
  });
}

async function requireRouteWriteAccess(request, env) {
  const user = await routeAuthUser(request, env);
  const [access, profile, vendor] = await Promise.all([
    routeFirstRow(env, "user_access", {
      select: "user_id,is_maroowell,is_admin",
      user_id: `eq.${user.id}`,
      limit: "1"
    }),
    routeFirstRow(env, "profiles", {
      select: "user_id,approval_status,app_only",
      user_id: `eq.${user.id}`,
      limit: "1"
    }),
    routeMaroowellVendor(env)
  ]);

  if (!vendor?.id) throw routeHttpError(503, "마루웰 권한 기준 정보를 확인할 수 없습니다.");

  const member = await routeFirstRow(env, "vendor_members", {
    select: "user_id,vendor_id,role_level,is_active",
    user_id: `eq.${user.id}`,
    vendor_id: `eq.${vendor.id}`,
    is_active: "eq.true",
    order: "role_level.desc",
    limit: "1"
  });

  const roleLevel = Number(member?.role_level || 0);
  const approved = profile?.approval_status === "approved";
  const webEnabled = profile?.app_only !== true;
  const isMaroowell = access?.is_maroowell === true || roleLevel > 0;
  const isPrivileged = access?.is_admin === true || roleLevel >= ROUTE_WRITE_MIN_LEVEL;

  if (!approved || !webEnabled || !isMaroowell || !isPrivileged) {
    throw routeHttpError(403, "라우트 수정 권한이 없습니다.");
  }
  return { userId: user.id, roleLevel, isAdmin: access?.is_admin === true };
}

'''
    marker = "function safeTrim(v) {"
    if marker not in text:
        raise RuntimeError("worker auth helper insertion anchor missing")
    text = text.replace(marker, helpers + marker, 1)
    p.write_text(text, encoding="utf-8")

# Route editor callers.
route_old = '''  async function apiJson(method, url, body){
    const r = await fetch(url, {
      method,
      headers: {"Content-Type":"application/json"},
      body: body ? JSON.stringify(body) : undefined
    });
'''
route_new = '''  async function getRouteWriteAccessToken(){
    if (!mwSupabase?.auth) return "";
    const { data: { session } } = await mwSupabase.auth.getSession();
    return session?.access_token || "";
  }
  window.__MW_ROUTE_ACCESS_TOKEN = getRouteWriteAccessToken;

  async function apiJson(method, url, body){
    const headers = {"Content-Type":"application/json"};
    if (String(method || "GET").toUpperCase() !== "GET" && String(url || "").startsWith(API_BASE)) {
      const token = await getRouteWriteAccessToken();
      if (!token) throw new Error("로그인 세션이 필요합니다.");
      headers.Authorization = `Bearer ${token}`;
    }
    const r = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
'''
for name in ["coupangRouteMap.html", "public/coupangRouteMap.html"]:
    q = Path(name)
    s = q.read_text(encoding="utf-8")
    if "getRouteWriteAccessToken" not in s:
        s = replace_once(s, route_old, route_new, f"{name} route auth")
        q.write_text(s, encoding="utf-8")

# Popup module.
q = Path("public/mw_route_popups.js")
s = q.read_text(encoding="utf-8")
popup_old = '''  async function apiJson(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
'''
popup_new = '''  async function apiJson(method, url, body) {
    const headers = { "Content-Type": "application/json" };
    if (String(method || "GET").toUpperCase() !== "GET") {
      const token = await window.__MW_ROUTE_ACCESS_TOKEN?.();
      if (!token) throw new Error("로그인 세션이 필요합니다.");
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
'''
if "__MW_ROUTE_ACCESS_TOKEN" not in s:
    s = replace_once(s, popup_old, popup_new, "mw_route_popups auth")
    q.write_text(s, encoding="utf-8")

# Zipcode polygon save.
q = Path("public/zipcode_search")
s = q.read_text(encoding="utf-8")
zip_old = '''        const res = await fetch(ROUTE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
'''
zip_new = '''        const { data: { session: routeWriteSession } } = await supabase.auth.getSession();
        if (!routeWriteSession?.access_token) throw new Error("로그인 세션이 필요합니다.");
        const res = await fetch(ROUTE_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${routeWriteSession.access_token}`
          },
          body: JSON.stringify(payload)
        });
'''
if "session: routeWriteSession" not in s:
    s = replace_once(s, zip_old, zip_new, "zipcode route auth")
    q.write_text(s, encoding="utf-8")

# Dragon car vendor creation.
q = Path("public/dragon_car_index")
s = q.read_text(encoding="utf-8")
dragon_old = '''      async function routeApiJson(method, url, body) {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined
        });
'''
dragon_new = '''      async function routeApiJson(method, url, body) {
        const headers = { "Content-Type": "application/json" };
        if (String(method || "GET").toUpperCase() !== "GET") {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("로그인 세션이 필요합니다.");
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined
        });
'''
if "headers.Authorization = `Bearer ${session.access_token}`" not in s:
    s = replace_once(s, dragon_old, dragon_new, "dragon car route auth")
    q.write_text(s, encoding="utf-8")

# Cleansing history vendor registration.
q = Path("public/cleansing_history")
s = q.read_text(encoding="utf-8")
cl_old = '''      const res = await fetch(ROUTE_VENDOR_ENDPOINT, {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
'''
cl_new = '''      const { data: { session: routeVendorSession } } = await supabaseClient.auth.getSession();
      if (!routeVendorSession?.access_token) throw new Error("로그인 세션이 필요합니다.");
      const res = await fetch(ROUTE_VENDOR_ENDPOINT, {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${routeVendorSession.access_token}`
        },
        body:JSON.stringify({
'''
if "session: routeVendorSession" not in s:
    s = replace_once(s, cl_old, cl_new, "cleansing history vendor auth")
    q.write_text(s, encoding="utf-8")

# Preserve deployed route worker vars/secrets.
q = Path("wrangler.toml")
s = q.read_text(encoding="utf-8")
if "account_id = " not in s:
    s = s.replace('compatibility_date = "2024-01-01"\n', 'compatibility_date = "2024-01-01"\naccount_id = "0f644373a9db40f2b36e4ffece348c46"\n', 1)
if "keep_vars = true" not in s:
    anchor = 'account_id = "0f644373a9db40f2b36e4ffece348c46"\n'
    if anchor not in s:
        raise RuntimeError("wrangler keep_vars anchor missing")
    s = s.replace(anchor, anchor + "keep_vars = true\n", 1)
q.write_text(s, encoding="utf-8")

print("route security patch applied")
