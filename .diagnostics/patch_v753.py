"""V75.3: generic page recovery. Does not change source selection or calculations."""
import hashlib
from pathlib import Path
import sys

BASE_SHA256 = '5f88a31e58d1651ae72e38d078c466a75ae16cbfeb6cea73b7ec6b3bb80d9d11'
MARKER = 'V75_3_PER_PAGE_RECOVERY'

HELPERS = r'''
// V75_3_PER_PAGE_RECOVERY. A transient failure must not impose a fixed 15-minute
// penalty on every new page or prevent other verified parcels from progressing.
function v753TransientSourceFailure(error) {
  const text = String(error?.message || error || '');
  // Never shorten an explicit provider throttle or an authorization failure.
  if (/\[(?:10|11|20|21|22|23|30|31|32|99)\]|\bHTTP\s+(?:401|403|429)\b|quota|rate.?limit/i.test(text)) return false;
  return error?.name === 'AbortError' ||
    ['BUILDING_HUB_EMPTY_HTTP_200'].includes(error?.code) ||
    (error?.code === 'BUILDING_HUB_XML_UNAVAILABLE' && /HTTP 200 empty body|HTTP 50[234]/i.test(text)) ||
    /\[(?:04|05)\]|timeout|timed out|network|fetch failed|failed to fetch/i.test(text);
}
function v753PageRecovery(error, meta) {
  const phase = String(meta?.phase || 'expos');
  const page = Number(meta?.phases?.[phase]?.nextPage || 1);
  const key = `${phase}:${page}`;
  const previous = meta?.pageRecovery;
  const failures = (previous?.key === key ? Number(previous.failures) || 0 : 0) + 1;
  const delays = [30, 120, 300, 900];
  const requested = Number(error?.retryAfterSeconds);
  const baseline = v753TransientSourceFailure(error)
    ? delays[Math.min(failures - 1, delays.length - 1)] : 900;
  const delaySeconds = Math.max(baseline, Number.isFinite(requested) && requested > 0 ? requested : 0);
  return { key, failures, delaySeconds, retryable: v753TransientSourceFailure(error), at: new Date().toISOString() };
}
function v753DetailProgress(row) {
  if (!row) return null;
  const meta = row.source_meta || {}, phases = meta.phases || {};
  return { parcelKey: row.parcel_key, phase: meta.phase,
    pages: Object.values(phases).reduce((n, x) => n + Number(x.pages || 0), 0),
    receivedRows: Object.values(phases).reduce((n, x) => n + Number(x.collected || 0), 0),
    nextPage: phases[meta.phase]?.nextPage || 1 };
}
'''

UNAVAILABLE = r'''function v751DetailUnavailable(rows) {
  const now = Date.now();
  const ordered = [...rows].sort((a,b) =>
    (Date.parse(a.expires_at) || now) - (Date.parse(b.expires_at) || now));
  const error = v751Error('BUILDING_DETAIL_SOURCE_UNAVAILABLE', ordered.slice(0, 3)
    .map(row => `${row.parcel_key}: ${v75SafeSourceError(row.last_error)}`).join(' | '));
  // Wake for the first eligible source, not the latest failure in the whole route.
  error.retryAfterSeconds = Math.max(10, Math.min(900,
    Math.ceil(((Date.parse(ordered[0]?.expires_at) || now) - now) / 1000)));
  error.sourceProgress = v753DetailProgress(ordered[0]);
  error.sourceFailureCount = Number(ordered[0]?.source_meta?.pageRecovery?.failures || 0);
  error.shortRecoveryEligible = ordered[0]?.source_meta?.pageRecovery?.retryable === true;
  return error;
}
'''

ENSURE = r'''async function v60EnsureDetailCaches(env, detailParcelKeys) {
  const keys = [...new Set(detailParcelKeys || [])];
  let raw = await v60LoadDetailCache(env, keys);
  const ready = row => v60Fresh(row) && v65DetailCacheIsCurrent(row);
  const cooling = row => row?.status === 'error' && v60Fresh(row);
  const leased = row => Date.parse(row?.fetch_lease_until || '') > Date.now();
  let missing = keys.filter(k => !ready(raw.get(k)));
  const candidate = missing.find(k => !cooling(raw.get(k)) && !leased(raw.get(k)));
  if (candidate) {
    const row = await v751DetailClaim(env, candidate);
    if (row) {
      try { await v751AdvanceDetail(env, row); }
      catch (error) {
        // AdvanceDetail has already checkpointed this failed page. Do not let it
        // starve another parcel; storage/ownership errors still propagate.
        if (error?.code !== 'BUILDING_DETAIL_SOURCE_UNAVAILABLE') throw error;
      }
    }
    raw = await v60LoadDetailCache(env, keys);
  }
  const cacheMap = new Map([...raw].filter(([, row]) => ready(row)));
  missing = keys.filter(k => !cacheMap.has(k));
  const runnable = missing.find(k => !cooling(raw.get(k)) && !leased(raw.get(k)));
  const errors = missing.map(k => raw.get(k)).filter(cooling);
  if (missing.length && !runnable) {
    const sourceWait = errors.length ? v751DetailUnavailable(errors) : null;
    const leaseEnds = missing.map(k => Date.parse(raw.get(k)?.fetch_lease_until || '')).filter(t => t > Date.now());
    const leaseDelay = leaseEnds.length ? Math.max(5, Math.ceil((Math.min(...leaseEnds) - Date.now()) / 1000)) : Infinity;
    if (sourceWait && sourceWait.retryAfterSeconds <= leaseDelay) throw sourceWait;
    if (Number.isFinite(leaseDelay)) {
      const error = v751Error('SOURCE_BUSY', 'Another source collector owns this parcel; resume after its checkpoint');
      error.retryAfterSeconds = Math.min(300, leaseDelay);
      throw error;
    }
    if (sourceWait) throw sourceWait;
  }
  const pending = raw.get(runnable || missing[0]);
  return { complete: missing.length === 0, sourceComplete: missing.length === 0,
    cacheMap, keys, missing, errorRows: [],
    sourceProgress: v753DetailProgress(pending),
    evidence: keys.filter(k => cacheMap.has(k)).map(parcelKey => ({ parcelKey, status: 'ready' })) };
}
'''

def replace_once(src, old, new):
    if src.count(old) != 1:
        raise ValueError('Expected exactly one anchor: ' + old[:110])
    return src.replace(old, new, 1)

def replace_function(src, start, next_start, replacement):
    if src.count(start) != 1 or src.count(next_start) != 1:
        raise ValueError('Ambiguous function anchor: '+start)
    a=src.index(start); b=src.index(next_start,a)
    return src[:a]+replacement+'\n'+src[b:]

def patch(src):
    if hashlib.sha256(src.encode()).hexdigest() != BASE_SHA256:
        raise ValueError('Live source changed; review required. No replacement was made.')
    out=replace_once(src, "function v751DetailUnavailable(rows) {", HELPERS+"\nfunction v751DetailUnavailable(rows) {")
    out=replace_function(out,'function v751DetailUnavailable(rows) {','function v751InitialDetail(row) {',UNAVAILABLE)
    out=replace_function(out,'async function v60EnsureDetailCaches(env, detailParcelKeys) {','// V75 queue ownership',ENSURE)
    out=replace_once(out, "      meta = { ...meta, phases: { ...meta.phases, [phase]: cursor } };\n      if (cursor.complete) {",
        "      meta = { ...meta, pageRecovery: null, phases: { ...meta.phases, [phase]: cursor } };\n      if (cursor.complete) {")
    out=replace_once(out,"    const saved = await v751DetailSave(env, row, {\n      status: 'error', cache_version: V751_SOURCE_VERSION, source_complete: false,",
        "    const recovery = v753PageRecovery(error, row.source_meta);\n    const saved = await v751DetailSave(env, row, {\n      status: 'error', cache_version: V751_SOURCE_VERSION, source_complete: false,")
    out=replace_once(out,"      source_meta: { ...row.source_meta, complete: false, lastErrorCode: error.code || 'SOURCE_UNAVAILABLE' },\n      last_error: v75SafeSourceError(error), expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }),",
        "      source_meta: { ...row.source_meta, complete: false, lastErrorCode: error.code || 'SOURCE_UNAVAILABLE', pageRecovery: recovery },\n      last_error: v75SafeSourceError(error), expires_at: new Date(Date.now() + recovery.delaySeconds * 1000).toISOString(),")
    out=replace_once(out, '    const failures = Number(job.failure_count || 0) + 1;',
        "    const failures = error?.code === 'BUILDING_DETAIL_SOURCE_UNAVAILABLE' && error.sourceFailureCount > 0\n      ? error.sourceFailureCount : Number(job.failure_count || 0) + 1;")
    out=replace_once(out,'''    const terminal = ["ANALYSIS_STALLED", "SCOPE_DISCOVERY_REQUIRED", "INVALID_CONTINUATION", "INCOMPLETE_FINAL_RESULT"].includes(error?.code) || failures >= 3;''',
        '''    // Only the persisted source-failure recovery uses the bounded five rounds.
    // Ordinary DB/transport failures keep their original three-attempt ceiling.
    const sourceFailure = error?.code === 'BUILDING_DETAIL_SOURCE_UNAVAILABLE' && error.shortRecoveryEligible === true;
    const terminal = ["ANALYSIS_STALLED", "SCOPE_DISCOVERY_REQUIRED", "INVALID_CONTINUATION", "INCOMPLETE_FINAL_RESULT"].includes(error?.code) || failures >= (sourceFailure ? 5 : 3);''')
    out=replace_once(out,'''        progress: { ...(job.progress || {}), engineVersion: "V75.1",
          message: terminal''', '''        progress: { ...(job.progress || {}), engineVersion: "V75.1",
          ...(error.sourceProgress ? { sourceProgress: error.sourceProgress } : {}),
          recoveryPolicy: 'V75.3',
          message: terminal''')
    out=replace_once(out,'''      if (outcome?.status === "busy" || outcome?.status === "retry") {
        message.retry({ delaySeconds: outcome.delaySeconds || 30 });
      } else message.ack();''', '''      if (outcome?.status === "retry") {
        // App checkpoints have a DB-enforced retry budget. Use a delayed successor
        // so Cloudflare's independent default delivery cap does not lose the job.
        await env.BUILDING_ANALYSIS_QUEUE.send({ jobId }, { delaySeconds: outcome.delaySeconds || 30 });
        message.ack();
      } else if (outcome?.status === "busy") {
        message.retry({ delaySeconds: outcome.delaySeconds || 30 });
      } else message.ack();''')
    out=replace_once(out,"          buildingHubFallbackMode: 'JSON_EMPTY_200_XML_ONCE_V75_2',", "          buildingHubFallbackMode: 'JSON_EMPTY_200_XML_ONCE_V75_2',\n          buildingRecoveryPolicy: 'PER_PAGE_BACKOFF_NONBLOCKING_V75_3',")
    return out

if __name__=='__main__':
    src=Path(sys.argv[1]).read_text(encoding='utf-8')
    dest=Path(sys.argv[2]);dest.write_text(patch(src),encoding='utf-8')
    print('Patched SHA-256',hashlib.sha256(dest.read_bytes()).hexdigest())
