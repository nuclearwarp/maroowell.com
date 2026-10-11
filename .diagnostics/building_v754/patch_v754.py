"""Repair source transport/scheduling globally. Never selects a particular camp."""
from pathlib import Path
import hashlib,re,sys
BASE='5f88a31e58d1651ae72e38d078c466a75ae16cbfeb6cea73b7ec6b3bb80d9d11'
HERE=Path(__file__).parent

def one(s,a,b):
    if s.count(a)!=1: raise ValueError('Expected unique anchor: '+a[:100])
    return s.replace(a,b,1)
def function(s,name,body):
    m=re.search(r'(?m)^(?:async )?function '+name+r'\(',s)
    if not m: raise ValueError('Missing '+name)
    nxt=re.search(r'(?m)^(?:async )?function \w+\(',s[m.end():])
    if not nxt: raise ValueError('No following function '+name)
    return s[:m.start()]+body+'\n\n'+s[m.end()+nxt.start():]
UNAVAILABLE=r'''function v751DetailUnavailable(rows) {
  const now=Date.now(),ordered=[...rows].sort((a,b)=>(Date.parse(a.expires_at)||now)-(Date.parse(b.expires_at)||now));
  const first=ordered.find(r=>r.source_meta?.pageRecovery?.fatal)||ordered[0];
  const e=v751Error('BUILDING_DETAIL_SOURCE_UNAVAILABLE',ordered.slice(0,3).map(r=>`${r.parcel_key}: ${v75SafeSourceError(r.last_error)}`).join(' | '));
  e.retryAfterSeconds=Math.max(5,Math.min(86400,Math.ceil(((Date.parse(first?.expires_at)||now)-now)/1000)));
  e.sourceProgress=v754DetailProgress(first);e.sourceFailureCount=Number(first?.source_meta?.pageRecovery?.failures||0);
  e.shortRecoveryEligible=first?.source_meta?.pageRecovery?.retryable===true;e.sourceFatal=first?.source_meta?.pageRecovery?.fatal===true;return e;
}'''
ENSURE=r'''async function v60EnsureDetailCaches(env, detailParcelKeys) {
  const keys=[...new Set(detailParcelKeys||[])];let raw=await v60LoadDetailCache(env,keys);
  const ready=r=>v60Fresh(r)&&v65DetailCacheIsCurrent(r),cooling=r=>r?.status==='error'&&v60Fresh(r),leased=r=>Date.parse(r?.fetch_lease_until||'')>Date.now();
  let missing=keys.filter(k=>!ready(raw.get(k)));
  const candidates=missing.filter(k=>!cooling(raw.get(k))&&!leased(raw.get(k)));
  candidates.sort((a,b)=>(Date.parse(raw.get(a)?.updated_at||'')||0)-(Date.parse(raw.get(b)?.updated_at||'')||0));
  if(candidates[0]){
    const row=await v751DetailClaim(env,candidates[0]);
    if(row){try{await v751AdvanceDetail(env,row);}catch(e){if(e.code!=='BUILDING_DETAIL_SOURCE_UNAVAILABLE')throw e;}}
    raw=await v60LoadDetailCache(env,keys);
  }
  const cacheMap=new Map([...raw].filter(([,r])=>ready(r)));missing=keys.filter(k=>!cacheMap.has(k));
  const runnable=missing.find(k=>!cooling(raw.get(k))&&!leased(raw.get(k))),errors=missing.map(k=>raw.get(k)).filter(cooling);
  if(missing.length&&!runnable){
    const sourceWait=errors.length?v751DetailUnavailable(errors):null,until=missing.map(k=>Date.parse(raw.get(k)?.fetch_lease_until||'')).filter(t=>t>Date.now());
    const leaseDelay=until.length?Math.max(5,Math.ceil((Math.min(...until)-Date.now())/1000)):Infinity;
    if(sourceWait&&(sourceWait.sourceFatal||sourceWait.retryAfterSeconds<=leaseDelay))throw sourceWait;
    if(Number.isFinite(leaseDelay))throw Object.assign(v751Error('SOURCE_BUSY','Another collector owns a source checkpoint'),{retryAfterSeconds:Math.min(300,leaseDelay)});
    if(sourceWait)throw sourceWait;
  }
  return {complete:missing.length===0,sourceComplete:missing.length===0,cacheMap,keys,missing,errorRows:[],sourceProgress:v754DetailProgress(raw.get(runnable||missing[0])),evidence:keys.filter(k=>cacheMap.has(k)).map(parcelKey=>({parcelKey,status:'ready'}))};
}'''
def patch(src):
    if hashlib.sha256(src.encode()).hexdigest()!=BASE: raise ValueError('Current source differs from audited Worker. Review required.')
    s=src
    s=one(s,"const V751_SOURCE_VERSION = 'V75_1_PAGED_VERIFIED_SOURCE';",(HERE/'provider_transport.js').read_text(encoding='utf-8')+"\nconst V751_SOURCE_VERSION = 'V75_1_PAGED_VERIFIED_SOURCE';")
    s=function(s,'v60FetchBuildingHubJson',"async function v60FetchBuildingHubJson(url,params,env,label,timeoutMs=V60_BUILDING_HUB_TIMEOUT_MS){return await v754ReadHubPage(url,params,env,label,timeoutMs);}")
    s=function(s,'v752FetchBuildingHubXml',"async function v752FetchBuildingHubXml(url,params,env,label,timeoutMs){return await v754HubRequest(url,params,env,label,timeoutMs,'xml');}")
    s=function(s,'fetchBuildingHubTitlePage',"async function fetchBuildingHubTitlePage(env,sigunguCd,bjdongCd,pageNo){return buildingHubResponseItems(await v754ReadHubPage(BUILDING_HUB_TITLE_URL,{sigunguCd,bjdongCd,numOfRows:BUILDING_HUB_PAGE_SIZE,pageNo},env,'Building HUB title',BUILDING_TITLE_PAGE_TIMEOUT_MS));}")
    s=one(s,"  maxAttempts = KAPT_MAX_ATTEMPTS\n) {\n  const query = new URLSearchParams();","  maxAttempts = KAPT_MAX_ATTEMPTS\n) {\n  if(v754IsHub(url))return await v754ReadHubPage(url,params,env,label,timeoutMs);\n  const query = new URLSearchParams();")
    s=function(s,'v751DetailUnavailable',UNAVAILABLE)
    a=s.index('async function v60EnsureDetailCaches(env, detailParcelKeys) {');b=s.index('// V75 queue ownership',a);s=s[:a]+ENSURE+'\n\n'+s[b:]
    s=one(s,'async function v751AdvanceDetail(env, input) {\n  let row = input;',"async function v751AdvanceDetail(env, input) {\n  env={...env,__mwHubTrace:[]};\n  let row = input;")
    s=one(s,'        if (cursor.pages === 0 && cursor.variantIndex + 1 < variants.length) {',"        if (['10','11'].includes(error.publicDataGateway?.code) && cursor.pages === 0 && cursor.variantIndex + 1 < variants.length) {")
    s=one(s,"      meta = { ...meta, phases: { ...meta.phases, [phase]: cursor } };\n      if (cursor.complete) {","      meta = { ...meta, pageRecovery: null, transport: env.__mwHubTrace.slice(-20), phases: { ...meta.phases, [phase]: cursor } };\n      if (cursor.complete) {")
    s=one(s,"    const saved = await v751DetailSave(env, row, {\n      status: 'error', cache_version: V751_SOURCE_VERSION, source_complete: false,",r'''    if(error.code==='SOURCE_PROVIDER_BUSY'){
      await v751DetailSave(env,row,{status:'partial',cache_version:V751_SOURCE_VERSION,source_complete:false,expos_rows:row.expos_rows,area_rows:row.area_rows,floor_rows:row.floor_rows,source_meta:{...row.source_meta,transport:env.__mwHubTrace.slice(-20)},last_error:null,expires_at:v60IsoAfter({days:2}),fetch_token:null,fetch_lease_until:null});
      throw error;
    }
    const recovery=v754PageRecovery(error,row.source_meta);
    const saved = await v751DetailSave(env, row, {
      status: 'error', cache_version: V751_SOURCE_VERSION, source_complete: false,''')
    s=one(s,"      source_meta: { ...row.source_meta, complete: false, lastErrorCode: error.code || 'SOURCE_UNAVAILABLE' },\n      last_error: v75SafeSourceError(error), expires_at: v60IsoAfter({ minutes: V60_ERROR_CACHE_MINUTES }),","      source_meta: { ...row.source_meta, complete: false, lastErrorCode: error.code || 'SOURCE_UNAVAILABLE', pageRecovery: recovery, transport: env.__mwHubTrace.slice(-20) },\n      last_error: v75SafeSourceError(error), expires_at: new Date(Date.now()+recovery.delaySeconds*1000).toISOString(),")
    s=one(s,"    if (error?.code === 'SOURCE_BUSY' || error?.code === 'SOURCE_LEASE_LOST') {","    if (['SOURCE_BUSY','SOURCE_LEASE_LOST','SOURCE_PROVIDER_BUSY'].includes(error?.code)) {")
    s=one(s,"        heartbeat_at: new Date().toISOString(),\n      });\n      return { status: 'retry', delaySeconds };","        heartbeat_at: new Date().toISOString(),\n        progress:{...(job.progress||{}),nextRetryAt:new Date(Date.now()+delaySeconds*1000).toISOString(),recoveryPolicy:'V75.4',message:'\\uC6D0\\uCC9C \\uC694\\uCCAD \\uC21C\\uC11C\\uB97C \\uC870\\uC815 \\uC911\\uC785\\uB2C8\\uB2E4. \\uC800\\uC7A5\\uB41C \\uC9C4\\uD589 \\uC0C1\\uD0DC\\uC5D0\\uC11C \\uC774\\uC5B4\\uAC11\\uB2C8\\uB2E4.'},\n      });\n      return { status: 'retry', delaySeconds };")
    s=one(s,'    const failures = Number(job.failure_count || 0) + 1;',"    const failures=error.code==='BUILDING_DETAIL_SOURCE_UNAVAILABLE'&&error.sourceFailureCount>0?error.sourceFailureCount:Number(job.failure_count||0)+1;")
    s=one(s,'    const terminal = ["ANALYSIS_STALLED", "SCOPE_DISCOVERY_REQUIRED", "INVALID_CONTINUATION", "INCOMPLETE_FINAL_RESULT"].includes(error?.code) || failures >= 3;',"    const sourceTransient=error.code==='BUILDING_DETAIL_SOURCE_UNAVAILABLE'&&error.shortRecoveryEligible===true;\n    const terminal=error.sourceFatal===true||[\"ANALYSIS_STALLED\",\"SCOPE_DISCOVERY_REQUIRED\",\"INVALID_CONTINUATION\",\"INCOMPLETE_FINAL_RESULT\"].includes(error.code)||failures >= (sourceTransient?5:3);")
    s=one(s,'    const delaySeconds = Math.max(10, Math.min(900, Number(error?.retryAfterSeconds) || (error?.status === 503 ? 900 : 30 * failures)));','    const delaySeconds=Math.max(5,Math.min(86400,Number(error.retryAfterSeconds)||(error.status===503?60:30*failures)));')
    s=one(s,'        progress: { ...(job.progress || {}), engineVersion: "V75.1",\n          message: terminal','        progress: { ...(job.progress || {}), engineVersion: "V75.1",\n          ...(error.sourceProgress?{sourceProgress:error.sourceProgress}:{}),recoveryPolicy:"V75.4",\n          message: terminal')
    s=one(s,'''      if (outcome?.status === "busy" || outcome?.status === "retry") {
        message.retry({ delaySeconds: outcome.delaySeconds || 30 });
      } else message.ack();''','''      if (outcome?.status === "busy" || outcome?.status === "retry") {
        // DB controls the finite source retry budget. Ack only after successor.
        await env.BUILDING_ANALYSIS_QUEUE.send({jobId},{delaySeconds:outcome.delaySeconds||30});
        message.ack();
      } else message.ack();''')
    s=one(s,"          buildingHubFallbackMode: 'JSON_EMPTY_200_XML_ONCE_V75_2',","          buildingHubFallbackMode: 'JSON_EMPTY_200_XML_ONCE_V75_2',\n          buildingTransportPolicy: 'SHARED_SERIAL_PACED_V75_4',\n          buildingRecoveryPolicy: 'PER_PAGE_NONBLOCKING_V75_4',")
    return s
if __name__=='__main__':
    p=Path(sys.argv[2]);p.write_text(patch(Path(sys.argv[1]).read_text(encoding='utf-8')),encoding='utf-8');print(hashlib.sha256(p.read_bytes()).hexdigest())
