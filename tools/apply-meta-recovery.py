from pathlib import Path
import re
import sys
root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
def exact(s, a, b):
    if a not in s:
        raise RuntimeError('Missing patch anchor: ' + a[:100])
    return s.replace(a, b, 1)
p = root / 'workers/meta-collector/entry.js'
s = p.read_text()
if 'MW_META_RECOVERY_20261008' in s:
    print('Recovery patch already applied')
    raise SystemExit(0)
a = s.index('async function saveSession(')
b = s.index('async function loadCampCodes(', a)
s = s[:a] + '''// MW_META_RECOVERY_20261008: preserve newer login sessions and real failure state.
async function saveSession(env, cookies, status = "active", http = 200, error = null, expectedUpdatedAt = null) {
  const utcNow = new Date().toISOString();
  const patch = { status, last_http_status: http, last_error: error, updated_at: utcNow };
  if (status === "active" && !error) {
    patch.cookie_bundle = cookieHeader(cookies);
    patch.last_success_at = utcNow;
  }
  const version = expectedUpdatedAt ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : "";
  await sbPatch(env, `meta_backend_state?id=eq.1${version}`, patch);
}
function metaRequestError(result) {
  const authRequired = [401,403,302,303,307,308].includes(Number(result.status)) || /^\\s*</.test(String(result.text || ""));
  const error = new Error(authRequired
    ? `META_AUTH_REQUIRED (HTTP ${result.status}): Please sign in to META again.`
    : `META_REQUEST_FAILED (HTTP ${result.status})`);
  error.metaAuthRequired = authRequired;
  error.metaHttpStatus = Number(result.status) || 500;
  return error;
}
''' + s[b:]
s = exact(s, 'async function dueBatches(env) {', 'async function dueBatches(env, force = false) {')
s = exact(s, '&or=(next_poll_at.is.null,next_poll_at.lte.${now})&order=started_at.asc', '${force ? "" : `&or=(next_poll_at.is.null,next_poll_at.lte.${now})`}&order=started_at.asc')
s = exact(s, 'if (!main.success) throw new Error(`META ${main.status}: ${main.text.slice(0, 240)}`);', 'if (!main.success) throw metaRequestError(main);')
a = s.index('async function heartbeat(env, cookies) {')
b = s.index('\nexport default {', a)
s = s[:a] + '''async function heartbeat(env, cookies, expectedUpdatedAt = null) {
  const rows = await sbGet(env, "camps?select=code&code=not.is.null&limit=30");
  const codes = metaCampCandidates((rows || []).map(r => r.code));
  const kp = kstParts();
  const r = await metaPost(cookies, META_CAMP_URL, workerPayload(codes, "WAVE2", kp.date));
  const error = r.success ? null : metaRequestError(r);
  await saveSession(env, cookies, r.success ? "active" : error.metaAuthRequired ? "expired" : "error", r.status, error?.message || null, expectedUpdatedAt);
  return { ok: r.success, status: r.status };
}
async function runCollector(env, force = false) {
  const state = await sessionState(env);
  if (state?.collector_paused === true) return { ok: false, paused: true };
  if (!state?.cookie_bundle) return { ok: false, error: "META_SESSION_MISSING" };
  if (state.status === "expired" && !force) return { ok: false, error: "META_AUTH_REQUIRED", status: "expired" };
  const cookies = parseCookieBundle(state.cookie_bundle);
  await purgeStaleRealtimeRows(env);
  await ensureBatches(env);
  const due = await dueBatches(env, force), results = [];
  let successes = 0, failure = null;
  for (const batch of due) {
    const lockToken = crypto.randomUUID();
    let claimed = false;
    try {
      claimed = await sbPost(env, "rpc/meta_claim_realtime_batch", {
        p_batch_id: batch.id, p_token: lockToken, p_lease_seconds: 120
      });
      if (!claimed) {
        results.push({ camp: batch.camp_name, wave: batch.wave, skipped: "collector_locked" });
        continue;
      }
      results.push(await processBatch(env, cookies, batch));
      successes += 1;
    } catch (e) {
      const msg = String(e?.message || e);
      failure = e;
      results.push({ camp: batch.camp_name, wave: batch.wave, error: msg });
      if (claimed) {
        await sbPatch(env, `meta_realtime_batch?id=eq.${batch.id}`, {
          status: "error", last_error: msg.slice(0,500), next_poll_at: kstIsoAt(Date.now()+300000), updated_at: nowIso()
        });
      }
      if (e.metaAuthRequired || /META (401|403|302)/.test(msg)) break;
    } finally {
      if (claimed) {
        try { await sbPost(env, "rpc/meta_release_realtime_batch", { p_batch_id: batch.id, p_token: lockToken }); } catch {}
      }
    }
  }
  if (failure) {
    const expired = failure.metaAuthRequired || /META (401|403|302)/.test(String(failure.message));
    await saveSession(env, cookies, expired ? "expired" : "error", failure.metaHttpStatus || 500, String(failure.message).slice(0,250), state.updated_at);
  } else if (successes > 0) {
    await saveSession(env, cookies, "active", 200, null, state.updated_at);
  } else if (!due.length && (force || kstParts().minute % 5 === 0)) {
    const health = await heartbeat(env, cookies, state.updated_at);
    results.push({ heartbeat: health });
    if (!health.ok) return { ok:false, at:nowIso(), due:0, results };
  }
  return { ok: !failure, at: nowIso(), due: due.length, successful: successes, results };
}
''' + s[b:]
s = exact(s, '  async fetch(request, env) {', '  async fetch(request, env, ctx) {')
s = exact(s, '      if (path.startsWith("/login-") || path === "/test-db") return authWorker.fetch(request, env);', '''      if (path.startsWith("/login-") || path === "/test-db") {
        const response = await authWorker.fetch(request, env);
        if (path === "/login-submit-code" && request.method === "POST" && response.ok) {
          const resume = runCollector(env, true).catch(e => console.error("META resume failed:", e?.message));
          if (ctx?.waitUntil) ctx.waitUntil(resume); else await resume;
        }
        return response;
      }''')
s = exact(s, 'updated_at: nowIso() });\n      } catch {}\n    }));', 'updated_at: new Date().toISOString() });\n      } catch {}\n    }));')
changes = {p: s}
p = root / 'workers/meta-collector/auth-v12-base.js'
s = p.read_text()
s = exact(s, '<input name="code" inputmode="numeric"', '<input name="code" autocomplete="one-time-code" inputmode="numeric"')
s, n = re.subn(r'<p>[^\n]*</p>\n<p><a href="/test-db">[^\n]*</a></p>', '<p>Login verified. Realtime collection restart requested.</p>\n<p><a href="https://maroowell.com/realtime">Return to MAROOWELL realtime</a></p>', s)
assert n == 1, n
changes[p] = s
for name in ['home', 'realtime']:
    p = root / 'public' / name
    s = p.read_text()
    s = exact(s, '</body>', '<script src="/meta-connection.js?v=20261008-recovery1" defer></script>\n</body>')
    if name == 'realtime':
        s = exact(s, '}else if(S.collectorState?.status==="error"){', '}else if(["error","expired","missing"].includes(S.collectorState?.status)){')
        s = s.replace('${S.collectorPaused?"자동 수집 정지":"자동 수집 중"}', '${S.collectorPaused?"자동 수집 정지":S.collectorState?.status==="active"?"자동 수집 중":"META 연결 확인 필요"}')
    changes[p] = s
p = root / 'login-worker-v2.js'
s = p.read_text()
s = exact(s, '      if ((path === "/coupang_camp" || path === "/coupang_camp_map") && response.ok) {', '''      if (["/realtime", "/realtime.html", "/public/realtime"].includes(path) && response.ok) {
        return withNoStore(response, "text/html; charset=utf-8");
      }
      if (path === "/meta-connection.js" && response.ok) {
        return withNoStore(response, "application/javascript; charset=utf-8");
      }
      if ((path === "/coupang_camp" || path === "/coupang_camp_map") && response.ok) {''')
changes[p] = s
for path, content in changes.items():
    path.write_text(content)
    print('PATCHED', path)
