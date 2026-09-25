import json, os, requests
from pathlib import Path
from email.parser import BytesParser
from email.policy import default
ACCOUNT_ID="0f644373a9db40f2b36e4ffece348c46"
SCRIPT="purple-resonance-61ea"
QUEUE_NAME="maroowell-building-analysis"
API=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}"
H={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"]}

def fetch_source():
    r=requests.get(API+"/content/v2",headers=H,timeout=30); r.raise_for_status()
    msg=BytesParser(policy=default).parsebytes((f'Content-Type: {r.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.content)
    for part in msg.iter_parts():
        if part.get_param("name",header="content-disposition")=="worker.js":
            return (part.get_payload(decode=True) or b"").decode()
    raise RuntimeError("worker.js missing")

def metadata():
    s=requests.get(API+"/settings",headers=H,timeout=30).json().get("result") or {}
    m={"main_module":"worker.js"}
    bs=[]
    for x in (s.get("bindings") or []):
        if isinstance(x,dict) and x.get("name") and x.get("name")!="BUILDING_ANALYSIS_QUEUE":
            bs.append({"type":"inherit","name":x["name"],"version_id":"latest"})
    bs.append({"type":"queue","name":"BUILDING_ANALYSIS_QUEUE","queue_name":QUEUE_NAME})
    m["bindings"]=bs
    for k in ("compatibility_date","compatibility_flags","placement"):
        if s.get(k) not in (None,[],{}): m[k]=s[k]
    return m

def deploy(src):
    files={"metadata":(None,json.dumps(metadata(),separators=(",",":")),"application/json"),"worker.js":("worker.js",src.encode(),"application/javascript+module")}
    r=requests.put(API+"?bindings_inherit=strict",headers=H,files=files,timeout=120)
    if not r.ok: raise RuntimeError(f"deploy {r.status_code}: {r.text[:1200]}")
    print("deploy",r.status_code)

Path('/tmp/live-worker.js').write_text(fetch_source(),encoding='utf-8')
p=Path('/tmp/live-worker.js')
s=p.read_text(encoding='utf-8')
old='async function handleBuildingStatsRequest(request, env) {\n  await verifySupabaseUserByJwt(request, env);'
new='async function handleBuildingStatsRequest(request, env, trustedInternal = false) {\n  if (!trustedInternal) await verifySupabaseUserByJwt(request, env);'
assert old in s
s=s.replace(old,new,1)
marker='\nexport default {\n  async fetch(request, env) {'
assert marker in s
helpers=r'''

const BUILDING_ANALYSIS_JOBS_TABLE = "building_analysis_jobs";
const BUILDING_ANALYSIS_JOB_MAX_STEPS = 160;

async function buildingJobRest(env, path, options = {}) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...terrainSupabaseHeaders(env, options.prefer || ""),
      ...(options.headers || {}),
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  }, BUILDING_STATS_SUPABASE_TIMEOUT_MS);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw httpError(502, `Building job DB request failed: ${snippet(text) || `HTTP ${res.status}`}`);
  return data;
}

async function buildingJobGet(env, jobId) {
  const rows = await buildingJobRest(env, `${BUILDING_ANALYSIS_JOBS_TABLE}?id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function buildingJobPatch(env, jobId, patch) {
  const rows = await buildingJobRest(env, `${BUILDING_ANALYSIS_JOBS_TABLE}?id=eq.${encodeURIComponent(jobId)}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function buildingJobFindActive(env, userId, scopeType, scopeKey, geometryHash) {
  const query = new URLSearchParams({
    created_by: `eq.${userId}`,
    scope_type: `eq.${scopeType}`,
    scope_key: `eq.${scopeKey}`,
    geometry_hash: `eq.${geometryHash}`,
    status: "in.(queued,running)",
    select: "*",
    order: "created_at.desc",
    limit: "1",
  });
  const rows = await buildingJobRest(env, `${BUILDING_ANALYSIS_JOBS_TABLE}?${query}`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

function buildingJobProgressFromResult(data, step) {
  const progress = data?.progress || data?.scopeTitleContinuation || data?.kaptInfoContinuation || data?.detailContinuation || {};
  return {
    step,
    message: cleanBuildingText(data?.message) || "건물 정보를 분석하고 있습니다.",
    requiresScopeTitleContinuation: data?.requiresScopeTitleContinuation === true,
    requiresKaptInfoContinuation: data?.requiresKaptInfoContinuation === true,
    requiresDetailContinuation: data?.requiresDetailContinuation === true,
    processedParcelCount: Number(progress?.processedParcelCount || progress?.processedComplexCount || 0),
    remainingParcelCount: Number(progress?.remainingParcelCount || progress?.remainingComplexCount || 0),
    totalParcelCount: Number(progress?.totalDirectParcelCount || progress?.totalDetailParcelCount || progress?.totalComplexCount || 0),
    updatedAt: new Date().toISOString(),
  };
}

async function processBuildingAnalysisJob(jobId, env) {
  let job = await buildingJobGet(env, jobId);
  if (!job) throw new Error(`Building analysis job not found: ${jobId}`);
  if (job.status === "completed" || job.status === "cancelled") return job;

  const now = new Date().toISOString();
  job = await buildingJobPatch(env, jobId, {
    status: "running",
    started_at: job.started_at || now,
    heartbeat_at: now,
    attempt_count: Number(job.attempt_count || 0) + 1,
    error: null,
  });

  const payload = { ...(job?.payload || {}) };
  for (let step = 1; step <= BUILDING_ANALYSIS_JOB_MAX_STEPS; step++) {
    const internalRequest = new Request("https://internal.maroowell/building/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const response = await handleBuildingStatsRequest(internalRequest, env, true);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok || data?.ok === false) {
      throw new Error(cleanBuildingText(data?.error || data?.message || text) || `Building analysis HTTP ${response.status}`);
    }

    if (data?.buildingStats) {
      return await buildingJobPatch(env, jobId, {
        status: "completed",
        heartbeat_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        progress: buildingJobProgressFromResult({ message: "배송호수·엘리베이터 분석 완료" }, step),
        result: data,
        error: null,
      });
    }

    if (data?.requiresScopeDiscovery === true) {
      throw new Error("백그라운드 분석에 필요한 필지 범위가 없습니다. 새로 조회해 주세요.");
    }

    if (Array.isArray(data?.scopeTitleContinuation?.evidence)) payload.scopeTitleEvidence = data.scopeTitleContinuation.evidence;
    if (Array.isArray(data?.kaptInfoContinuation?.evidence)) payload.kaptInfoEvidence = data.kaptInfoContinuation.evidence;
    if (Array.isArray(data?.detailContinuation?.evidence)) payload.detailEvidence = data.detailContinuation.evidence;
    payload.forceRefresh = false;
    payload.force_refresh = false;
    payload.allowPartial = true;
    payload.allow_partial = true;

    await buildingJobPatch(env, jobId, {
      status: "running",
      heartbeat_at: new Date().toISOString(),
      payload,
      progress: buildingJobProgressFromResult(data, step),
    });
  }
  throw new Error("백그라운드 분석 단계가 안전 한도를 초과했습니다.");
}

async function handleBuildingJobCreate(request, env) {
  const auth = await verifySupabaseUserByJwt(request, env);
  const body = await readJsonBody(request);
  const scope = normalizeBuildingStatsScope(body);
  const normalized = normalizeTerrainGeometry(body?.geometry || body?.polygon || body?.geojson);
  const geometryHash = await terrainGeometryHash(normalized);

  const existing = await buildingJobFindActive(env, auth.user.id, scope.scopeType, scope.scopeKey, geometryHash);
  if (existing) {
    return jsonResp({ ok: true, jobId: existing.id, status: existing.status, reused: true }, 202);
  }

  const rows = await buildingJobRest(env, `${BUILDING_ANALYSIS_JOBS_TABLE}?select=*`, {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      created_by: auth.user.id,
      scope_type: scope.scopeType,
      scope_key: scope.scopeKey,
      geometry_hash: geometryHash,
      status: "queued",
      payload: body,
      progress: { step: 0, message: "백그라운드 분석 대기 중", updatedAt: new Date().toISOString() },
    }),
  });
  const job = Array.isArray(rows) ? rows[0] : null;
  if (!job?.id) throw httpError(502, "백그라운드 분석 작업 생성에 실패했습니다.");
  if (!env?.BUILDING_ANALYSIS_QUEUE?.send) throw httpError(503, "백그라운드 분석 큐가 연결되지 않았습니다.");
  await env.BUILDING_ANALYSIS_QUEUE.send({ jobId: job.id });
  return jsonResp({ ok: true, jobId: job.id, status: "queued", reused: false }, 202);
}

async function handleBuildingJobStatus(request, env, jobId) {
  const auth = await verifySupabaseUserByJwt(request, env);
  const job = await buildingJobGet(env, jobId);
  if (!job || String(job.created_by) !== String(auth.user.id)) throw httpError(404, "분석 작업을 찾을 수 없습니다.");
  return jsonResp({
    ok: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress || null,
    result: job.status === "completed" ? (job.result || null) : null,
    error: job.error || null,
    queuedAt: job.queued_at || null,
    startedAt: job.started_at || null,
    heartbeatAt: job.heartbeat_at || null,
    completedAt: job.completed_at || null,
  });
}

async function handleBuildingQueue(batch, env) {
  for (const message of batch.messages || []) {
    const jobId = cleanBuildingText(message?.body?.jobId);
    if (!jobId) { message.ack(); continue; }
    try {
      await processBuildingAnalysisJob(jobId, env);
      message.ack();
    } catch (error) {
      const job = await buildingJobGet(env, jobId).catch(() => null);
      const attempts = Number(job?.attempt_count || 0);
      const err = String(error?.message || error || "Building analysis failed");
      if (attempts < 3) {
        await buildingJobPatch(env, jobId, {
          status: "queued",
          heartbeat_at: new Date().toISOString(),
          error: err,
          progress: { ...(job?.progress || {}), message: `일시 오류 · 재시도 대기 (${attempts}/3)`, updatedAt: new Date().toISOString() },
        }).catch(() => {});
        message.retry({ delaySeconds: Math.min(30, 5 * Math.max(1, attempts)) });
      } else {
        await buildingJobPatch(env, jobId, {
          status: "error",
          heartbeat_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          error: err,
        }).catch(() => {});
        message.ack();
      }
    }
  }
}
'''
s=s.replace(marker,helpers+marker,1)
oldroute='''      if (\n        request.method === "POST" &&\n        (\n          path === "/building/stats" ||\n          path === "/households" ||\n          path === "/zip/building-stats"\n        )\n      ) {\n        return await handleBuildingStatsRequest(request, env);\n      }'''
assert oldroute in s
newroute=oldroute+'''\n\n      if (request.method === "POST" && path === "/building/jobs") {\n        return await handleBuildingJobCreate(request, env);\n      }\n\n      const buildingJobMatch = path.match(/^\\/building\\/jobs\\/([0-9a-f-]{36})$/i);\n      if (request.method === "GET" && buildingJobMatch) {\n        return await handleBuildingJobStatus(request, env, buildingJobMatch[1]);\n      }'''
s=s.replace(oldroute,newroute,1)
oldend='''  },\n};\n'''
pos=s.rfind(oldend)
assert pos!=-1
newend='''  },\n  async queue(batch, env) {\n    await handleBuildingQueue(batch, env);\n  },\n};\n'''
s=s[:pos]+newend+s[pos+len(oldend):]
out=Path('/tmp/live-worker-patched.js')
out.write_text(s,encoding='utf-8')
print('patched',len(s))

patched=Path('/tmp/live-worker-patched.js').read_text(encoding='utf-8')
deploy(patched)
print('marker', 'BUILDING_ANALYSIS_JOBS_TABLE' in patched)
