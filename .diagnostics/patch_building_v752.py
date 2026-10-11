"""Patch only the verified V75.1 Building HUB empty-HTTP-200 handling."""
import hashlib
BASE_SHA256='56c77aaa4afe2b270f6ffbeb229b914905a0cacd44d0daf302360a36616f2a89'
PATCH_MARKER='V75.2_EMPTY_JSON_XML_FALLBACK'
XML_HELPER=r'''// V75.2: Building HUB officially supports XML and JSON. Only recover from an
// HTTP 200 response with literally empty body; never treat it as zero rows.
async function v752FetchBuildingHubXml(url, params, env, label, timeoutMs) {
  const xmlUrl = new URL(url);
  xmlUrl.searchParams.set('serviceKey', publicDataServiceKey(env));
  xmlUrl.searchParams.set('_type', 'xml');
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '' || key === 'serviceKey' || key === '_type') continue;
    xmlUrl.searchParams.set(key, String(value));
  }
  const res = await v751FetchBuffered(xmlUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'application/xml, text/xml, */*' },
    cf: { cacheTtl: 0, cacheEverything: false },
  }, timeoutMs);
  const xml = await res.text();
  if (!res.ok || !xml.trim()) {
    throw v751Error('BUILDING_HUB_XML_UNAVAILABLE',
      `${label}: upstream JSON HTTP 200 empty; XML HTTP ${res.status}${xml.trim() ? ' invalid response' : ' empty body'}`);
  }
  // Reject HTML gateway pages or unrelated XML without constructing fake rows.
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<(?:[A-Za-z_][\w.-]*:)?response(?:\s|>)/i.test(xml)) {
    throw v751Error('BUILDING_HUB_XML_INVALID', `${label}: XML fallback returned an unexpected document`);
  }
  const data = parseBuildingPublicDataJson(xml);
  const parts = publicDataResponseParts(data, label);
  const code = String(data?.response?.header?.resultCode ?? '').trim();
  const rawTotal = data?.response?.body?.totalCount;
  const total = Number(rawTotal);
  if (!['0', '00', '000'].includes(code) || rawTotal == null || String(rawTotal).trim() === '' ||
      !Number.isSafeInteger(total) || total < 0 || (total > 0 && !parts.items.length)) {
    throw v751Error('BUILDING_HUB_XML_INVALID', `${label}: XML fallback missing a complete successful page`);
  }
  return data;
}
'''

def patch(source: str) -> str:
    if PATCH_MARKER in source:
        raise ValueError('V75.2 already applied')
    if hashlib.sha256(source.encode('utf-8')).hexdigest()!=BASE_SHA256:
        raise ValueError('Refusing to deploy: live Worker differs from expected V75.1 SHA-256')
    if 'V75_1_PAGED_VERIFIED_SOURCE' not in source:
        raise ValueError('V75.1 source is not present')
    src=source
    start='async function v60FetchBuildingHubJson(\n'
    if src.count(start)!=1: raise ValueError('Building HUB reader anchor changed')
    src=src.replace(start,f'{XML_HELPER}\n// {PATCH_MARKER}\n{start}',1)
    old='''      if (attempt >= V60_BUILDING_HUB_MAX_ATTEMPTS || !v60RetryableBuildingHubError(error)) {
        throw error;
      }'''
    new='''      if (attempt >= V60_BUILDING_HUB_MAX_ATTEMPTS &&
          error?.code === 'BUILDING_HUB_EMPTY_HTTP_200') {
        // One official XML request after exhausted JSON retries, not per attempt.
        return await v752FetchBuildingHubXml(url, params, env, label, timeoutMs);
      }
      if (attempt >= V60_BUILDING_HUB_MAX_ATTEMPTS || !v60RetryableBuildingHubError(error)) {
        throw error;
      }'''
    if src.count(old)!=1: raise ValueError('Building HUB retry anchor changed')
    src=src.replace(old,new,1)
    old='''      lastError = error;

      if (
        attempt < maxAttempts &&
        publicDataRetryableStatus(res.status)
      ) {'''
    new='''      if (res.ok && !responseText.trim() && urlText.includes('/BldRgstHubService/')) {
        // Preserve the exact empty-body signal across nested retry layers.
        error.code = 'BUILDING_HUB_EMPTY_HTTP_200';
      }
      lastError = error;

      if (
        attempt < maxAttempts &&
        publicDataRetryableStatus(res.status)
      ) {'''
    if src.count(old)!=1: raise ValueError('Public data reader error anchor changed')
    src=src.replace(old,new,1)
    needle='          buildingHubTimeoutMs: BUILDING_HUB_TIMEOUT_MS,\n'
    if src.count(needle)!=1: raise ValueError('Health response anchor changed')
    src=src.replace(needle,needle+"          buildingHubFallbackMode: 'JSON_EMPTY_200_XML_ONCE_V75_2',\n",1)
    if src.count(PATCH_MARKER)!=1: raise ValueError('Patch marker count invalid')
    return src
