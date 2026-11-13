"""Patch the deployed Cloudflare Worker source without changing building-unit algorithms.

Usage:
  python .diagnostics/patch_building_queue_resume.py live-worker.js fixed-worker.js
Deploy the resulting worker with the existing Cloudflare account credentials and bindings.
This script intentionally does NOT alter Cloudflare settings, budgets or API keys.
"""
import pathlib
import re
import sys

def patch(source: str) -> str:
    if "BUILDING_ANALYSIS_JOBS_TABLE" not in source or "async function handleBuildingQueue(" not in source:
        raise ValueError("Expected building-analysis queue functions are missing")
    if "BUILDING_ANALYSIS_JOB_BATCH_STEPS" in source:
        raise ValueError("This resume patch is already present")
    original = 'const BUILDING_ANALYSIS_JOB_MAX_STEPS = 160;'
    if source.count(original) != 1:
        raise ValueError("Step constant must occur once")
    source = source.replace(original, '''// Bound each queue delivery, not the entire analysis; state is checkpointed in Postgres.
const BUILDING_ANALYSIS_JOB_BATCH_STEPS = 4;
const BUILDING_ANALYSIS_JOB_MAX_STALLED_STEPS = 32;''', 1)
    start = source.index("async function processBuildingAnalysisJob(jobId, env) {")
    end = source.index("\nasync function handleBuildingJobCreate(", start)
    part = source[start:end]
    part = part.replace('    attempt_count: Number(job.attempt_count || 0) + 1,\n', '', 1)
    part = part.replace(
        '  for (let step = 1; step <= BUILDING_ANALYSIS_JOB_MAX_STEPS; step++) {',
        '''  const startingStep = Number(job?.progress?.step || 0);
  let lastFingerprint = String(job?.progress?.fingerprint || "");
  let stalledSteps = Number(job?.progress?.stalledSteps || 0);
  for (let batchStep = 1; batchStep <= BUILDING_ANALYSIS_JOB_BATCH_STEPS; batchStep++) {
    const step = startingStep + batchStep;''',
        1)
    needle = '''    await buildingJobPatch(env, jobId, {
      status: "running",
      heartbeat_at: new Date().toISOString(),
      payload,
      progress: buildingJobProgressFromResult(data, step),
    });'''
    replacement = '''    const progress = buildingJobProgressFromResult(data, step);
    // Fingerprint includes evidence, so changing detail source data resets the stall counter.
    const fingerprint = JSON.stringify([
      progress.requiresScopeTitleContinuation,
      progress.requiresKaptInfoContinuation,
      progress.requiresDetailContinuation,
      progress.processedParcelCount,
      progress.remainingParcelCount,
      payload.scopeTitleEvidence || null,
      payload.kaptInfoEvidence || null,
      payload.detailEvidence || null,
    ]);
    stalledSteps = fingerprint === lastFingerprint ? stalledSteps + 1 : 0;
    lastFingerprint = fingerprint;
    progress.fingerprint = fingerprint;
    progress.stalledSteps = stalledSteps;
    await buildingJobPatch(env, jobId, {
      status: "running",
      heartbeat_at: new Date().toISOString(),
      payload,
      progress,
    });
    if (stalledSteps >= BUILDING_ANALYSIS_JOB_MAX_STALLED_STEPS) {
      throw new Error("건물 상세 원천이 32회 연속 갱신되지 않았습니다. 미완료 필지의 원천 API/캐시를 점검해야 합니다.");
    }'''
    if part.count(needle) != 1:
        raise ValueError("Checkpoint block changed")
    part = part.replace(needle, replacement, 1)
    endline = '  throw new Error("백그라운드 분석 단계가 안전 한도를 초과했습니다.");'
    if part.count(endline) != 1:
        raise ValueError("Original unsafe 160-step limit missing")
    part = part.replace(endline, '''  // Commit was completed above. Re-queue the checkpoint for the next short invocation.
  // Send MUST succeed before the current queue message is acknowledged.
  await env.BUILDING_ANALYSIS_QUEUE.send({ jobId });
  return { status: "continued", jobId };''', 1)
    source = source[:start] + part + source[end:]
    start = source.index("async function handleBuildingQueue(batch, env) {")
    end = source.index("\n}", start) + 2
    sub = source[start:end]
    needle = '''      const attempts = Number(job?.attempt_count || 0);'''
    if sub.count(needle) != 1:
        raise ValueError("Retry count block changed")
    sub = sub.replace(needle, '''      const attempts = Number(job?.attempt_count || 0) + 1;''', 1)
    sub = sub.replace('''          status: "queued",
          heartbeat_at: new Date().toISOString(),
          error: err,''', '''          status: "queued",
          attempt_count: attempts,
          heartbeat_at: new Date().toISOString(),
          error: err,''', 1)
    sub = sub.replace('''          status: "error",
          heartbeat_at: new Date().toISOString(),''', '''          status: "error",
          attempt_count: attempts,
          heartbeat_at: new Date().toISOString(),''', 1)
    source = source[:start] + sub + source[end:]
    return source

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: patch_building_queue_resume.py SOURCE.js OUTPUT.js")
    src = pathlib.Path(sys.argv[1])
    dest = pathlib.Path(sys.argv[2])
    if src.resolve() == dest.resolve():
        raise SystemExit("Source and destination must differ")
    patched = patch(src.read_text(encoding="utf-8"))
    dest.write_text(patched, encoding="utf-8")
    print("Patched:", dest, "bytes:", len(patched.encode("utf-8")))
