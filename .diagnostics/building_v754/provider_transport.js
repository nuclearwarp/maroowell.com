// V75.4_GLOBAL_SOURCE_CONTROL. Shared across all camps, requests and isolates.
// No camp name, route code, secret, raw unit or private address is stored here.
const V754_GATE_WAIT_MS = 35000;
function v754IsHub(url) {
  try {const u=new URL(url);return u.protocol==='https:'&&u.hostname==='apis.data.go.kr'&&u.pathname.startsWith('/1613000/BldRgstHubService/');}
  catch{return false;}
}
async function v754GateRpc(env,name,payload) {
  try {return await buildingJobRest(env,`rpc/${name}`,{method:'POST',body:JSON.stringify(payload)});}
  catch {throw Object.assign(v751Error('SOURCE_DB_TRANSPORT','Source scheduler storage unavailable; no unregulated request was sent'),{retryAfterSeconds:10});}
}
function v754RetryAfter(value,now=Date.now()) {
  if(!value)return 0;const n=Number(value),ms=Number.isFinite(n)?n*1000:Date.parse(value)-now;
  return Number.isFinite(ms)?Math.max(0,Math.min(86400000,Math.ceil(ms))):0;
}
function v754FailureKind(error,status,bytes,code) {
  if(status===429||['22','23'].includes(code))return 'throttle';
  if([401,403].includes(status)||['20','21','30','31','32','33'].includes(code))return 'auth';
  if(error?.name==='AbortError')return 'timeout';
  if(status===200&&bytes===0)return 'empty';
  if(['04','05'].includes(code)||status>=500)return 'upstream';
  if(!status)return 'network';return 'invalid';
}
async function v754HubRequest(url,params,env,label,timeoutMs,format='json') {
  if(!v754IsHub(url))throw v751Error('INVALID_SOURCE','Unapproved Building HUB origin',400);
  const token=crypto.randomUUID(),waitStarted=Date.now();
  for(;;){
    const grant=await v754GateRpc(env,'mw_building_provider_claim',{p_token:token});
    if(grant?.granted===true)break;
    const delay=Math.max(50,Math.ceil(Number(grant?.waitMs)||2000));
    if(Date.now()-waitStarted+delay>V754_GATE_WAIT_MS)throw Object.assign(v751Error('SOURCE_PROVIDER_BUSY','Waiting for shared source capacity'),{retryAfterSeconds:Math.max(2,Math.ceil(delay/1000))});
    await new Promise(r=>setTimeout(r,delay));
  }
  const u=new URL(url);u.searchParams.set('serviceKey',publicDataServiceKey(env));u.searchParams.set('_type',format);
  for(const [k,v]of Object.entries(params||{}))if(!['serviceKey','ServiceKey','_type'].includes(k)&&v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  const info={operation:u.pathname.split('/').pop(),format,page:Number(params?.pageNo)||1,requestedRows:Number(params?.numOfRows)||0,httpStatus:0,bodyBytes:0,elapsedMs:0,resultCode:null};
  let outcome='network',retryMs=0,error=null,data=null;const start=Date.now();
  try{
    const res=await v751FetchBuffered(u.toString(),{method:'GET',headers:{Accept:format==='xml'?'application/xml,text/xml':'application/json,application/xml'},cf:{cacheTtl:0,cacheEverything:false}},timeoutMs);
    info.httpStatus=res.status;retryMs=v754RetryAfter(res.headers.get('retry-after'));
    const text=await res.text();info.bodyBytes=new TextEncoder().encode(text).length;
    const gateway=publicDataGatewayErrorFromText(text);
    if(gateway){info.resultCode=String(gateway.code||'');throw publicDataGatewayHttpError(label,gateway);}
    if(!res.ok)throw v751Error('SOURCE_HTTP_ERROR',`${label}: upstream HTTP ${res.status}`);
    if(!text.trim())throw v751Error('BUILDING_HUB_EMPTY_HTTP_200',`${label}: upstream HTTP ${res.status} empty body`);
    data=parseBuildingPublicDataJson(text);
    const envelope=data?.response??data?.Response??data,header=envelope?.header??envelope?.Header??{};
    info.resultCode=String(publicDataField(header,'resultCode','result_code','code')??'').trim();
    const parts=publicDataResponseParts(data,label);
    const raw=publicDataField(parts.body,'totalCount','total_count');
    if(raw==null||String(raw).trim()===''||!Number.isSafeInteger(Number(raw))||Number(raw)<0)throw v751Error('SOURCE_MALFORMED',`${label}: missing or invalid totalCount`);
    if(!['0','00','000'].includes(info.resultCode))throw v751Error('SOURCE_MALFORMED',`${label}: unverified source result code`);
    if(parts.totalCount>0&&!parts.items.length)throw v751Error('SOURCE_INCOMPLETE',`${label}: source missing expected rows`);
    info.acceptedRows=parts.items.length;info.totalCount=Number(raw);outcome='success';
  }catch(e){
    error=e;outcome=v754FailureKind(e,info.httpStatus,info.bodyBytes,info.resultCode);
    if(e.code==='BUILDING_HUB_EMPTY_HTTP_200')outcome='empty';
    error.retryAfterSeconds=Math.max(Number(e.retryAfterSeconds)||0,Math.ceil(retryMs/1000));error.providerOutcome=outcome;
  }
  info.elapsedMs=Date.now()-start;info.outcome=outcome;
  try{
    const done=await v754GateRpc(env,'mw_building_provider_finish',{p_token:token,p_outcome:outcome,p_info:info,p_retry_ms:retryMs});
    if(done?.released!==true)throw Object.assign(v751Error('SOURCE_PROVIDER_BUSY','Provider lease changed before response acceptance'),{retryAfterSeconds:5});
  }catch(e){if(!error)error=e;}
  if(env.__mwHubTrace){env.__mwHubTrace.push(info);if(env.__mwHubTrace.length>20)env.__mwHubTrace.shift();}
  if(error){error.transport=info;throw error;}return data;
}
async function v754ReadHubPage(url,params,env,label,timeoutMs) {
  try{return await v754HubRequest(url,params,env,label,timeoutMs,'json');}
  catch(e){if(e.code!=='BUILDING_HUB_EMPTY_HTTP_200')throw e;return await v754HubRequest(url,params,env,label,timeoutMs,'xml');}
}
function v754PageRecovery(error,meta) {
  const phase=String(meta?.phase||'expos'),page=Number(meta?.phases?.[phase]?.nextPage||1),key=`${phase}:${page}`,old=meta?.pageRecovery;
  const failures=(old?.key===key?Number(old.failures)||0:0)+1;
  const retryable=['empty','timeout','upstream','network'].includes(error.providerOutcome)||error.name==='AbortError'||/\[(?:04|05)\]|HTTP 200 empty|timeout|network/i.test(String(error.message||''));
  const fatal=['auth','invalid'].includes(error.providerOutcome)||['SOURCE_MALFORMED','SOURCE_LIMIT_EXCEEDED','INVALID_PARCEL','SOURCE_REPEATED_PAGE','SOURCE_PAGE_MISMATCH','SOURCE_INCOMPLETE'].includes(error.code);
  const delaySeconds=Math.max(Number(error.retryAfterSeconds)||0,retryable?[15,45,120,300,600][Math.min(failures-1,4)]:900);
  return {key,failures,delaySeconds,retryable,fatal,at:new Date().toISOString()};
}
function v754DetailProgress(row){
  if(!row)return null;const meta=row.source_meta||{},phases=meta.phases||{};
  return {parcelKey:row.parcel_key,phase:meta.phase,pages:Object.values(phases).reduce((n,x)=>n+Number(x.pages||0),0),receivedRows:Object.values(phases).reduce((n,x)=>n+Number(x.collected||0),0),nextPage:phases[meta.phase]?.nextPage||1};
}
