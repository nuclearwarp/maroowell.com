import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const original=fs.readFileSync(process.env.BASE_WORKER,'utf8');
const fixed=fs.readFileSync(process.env.CANDIDATE_WORKER,'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const KEY='41465|10300|0|0899|0000',OTHER='11560|13300|0|1072|0039';
const ID='11111111-1111-4111-8111-111111111111';
const past='2000-01-01T00:00:00Z',future=()=>new Date(Date.now()+86400000).toISOString();
function reply(items,total,pageNo=1,numOfRows=100){return {response:{header:{resultCode:'00'},body:{items:{item:items},totalCount:total,pageNo,numOfRows}}};}
const records=n=>Array.from({length:n},(_,i)=>({rnum:i+1,mgmHoDetlPk:'u'+i,hoNm:String(i+1)}));
function ctx(opts={}){
 const db=opts.db||new Map(),jobs=opts.jobs||new Map(),calls=[],sent=[];
 const c=vm.createContext({console,Date,Map,Set,Promise,Array,JSON,Number,String,Math,URL,URLSearchParams,Request,Response,Headers,TextEncoder,TextDecoder,Uint8Array,DataView,ArrayBuffer,Blob,crypto:webcrypto,AbortController,ReadableStream,setTimeout,clearTimeout,atob,btoa,fetch:async()=>{throw new Error('UNMOCKED_NETWORK_DISABLED');}});
 vm.runInContext((opts.original?original:fixed).replace(/^export default \{/m,'globalThis.worker={'),c);
 vm.runInContext('globalThis.urls={expos:BUILDING_HUB_EXPOS_URL,floor:BUILDING_HUB_FLOOR_URL,area:BUILDING_HUB_EXPOS_AREA_URL};globalThis.version=BUILDING_STATS_SOURCE_VERSION',c);
 c.v60LoadRowsByKeys=async(_e,_t,_k,keys)=>keys.filter(k=>db.has(k)).map(k=>copy(db.get(k)));
 c.buildingJobGet=async(_e,id)=>jobs.has(id)?copy(jobs.get(id)):null;
 c.buildingJobRest=async(_e,p,o={})=>{
   const u=new URL('https://db/'+p),q=u.searchParams,detail=u.pathname.includes('detail_cache'),map=detail?db:jobs,field=detail?'parcel_key':'id',v=o.body?JSON.parse(o.body):{};
   if(o.method==='POST'){if(!map.has(v[field]))map.set(v[field],copy({floor_rows:[],fetched_at:new Date().toISOString(),fetch_token:null,fetch_lease_until:null,...v}));return [copy(map.get(v[field]))];}
   const key=q.get(field)?.slice(3),r=map.get(key);if(!r)return [];
   if(o.method!=='PATCH')return [copy(r)];
   if(q.has('status')&&!['queued','running'].includes(r.status))return [];
   const token=detail?'fetch_token':'lease_token',until=detail?'fetch_lease_until':'lease_until';
   if(q.has(token)&&r[token]!==q.get(token).slice(3))return [];
   if(q.has('or')&&Date.parse(r[until]||'')>Date.now())return [];
   const next={...r,...copy(v)};
   if(detail&&next.status==='ready')assert.ok(next.fetched_at&&next.expires_at,'ready row requires both timestamps');
   Object.assign(r,copy(v));return [copy(r)];
 };
 c.v60FetchBuildingHubJson=async(url,params)=>{
   const phase=Object.keys(c.urls).find(k=>c.urls[k]===url);const call={phase,...copy(params)};calls.push(call);
   if(opts.upstream)return opts.upstream(call,c,calls);
   const all=opts[phase]||[],size=Number(params.numOfRows),start=(params.pageNo-1)*size;
   return reply(all.slice(start,start+size),all.length,params.pageNo,size);
 };
 const env={BUILDING_ANALYSIS_QUEUE:{send:async(...a)=>{if(opts.send)await opts.send(...a);sent.push(copy(a));}}};
 return {c,db,jobs,calls,sent,env};
}
async function complete(h,key=KEY,max=200){for(let i=0;i<max;i++){const r=await h.c.v60EnsureDetailCaches(h.env,[key]);if(r.complete)return r;}throw new Error('no completion');}
function job(h){h.jobs.set(ID,{id:ID,status:'queued',payload:{},progress:{step:0},failure_count:0,attempt_count:0,lease_token:null,lease_until:null});}
function handler(h,fn){h.c.handleBuildingStatsRequest=async()=>new Response(JSON.stringify(await fn()));}
const query={sigunguCd:'41465',bjdongCd:'10300',platGbCd:'0',bun:'0899',ji:'0000',pageNo:1,numOfRows:100};
const xml='<response><header><resultCode>00</resultCode></header><body><items><item><hoNm>101</hoNm></item></items><totalCount>1</totalCount><pageNo>1</pageNo><numOfRows>100</numOfRows></body></response>';
function network(shared={},response){
 const h=ctx();shared.active??=0;shared.max??=0;shared.token??=null;shared.nextAt??=0;shared.calls??=[];shared.finishes??=[];shared.denied??=0;
 const rest=h.c.buildingJobRest;h.env.BUILDING_HUB_SERVICE_KEY='secret-test-key-never-log';
 h.c.buildingJobRest=async(e,p,o={})=>{
   if(p==='rpc/mw_building_provider_claim'){
     if(shared.offline)throw new Error('DB offline');
     if(shared.token||shared.nextAt>Date.now()){shared.denied++;return {granted:false,waitMs:1};}
     shared.token=JSON.parse(o.body).p_token;return {granted:true};
   }
   if(p==='rpc/mw_building_provider_finish'){
     const v=JSON.parse(o.body);shared.finishes.push(v);if(shared.finishOffline)throw new Error('DB offline');
     if(v.p_token!==shared.token)return {released:false};shared.token=null;shared.nextAt=Date.now()+2;return {released:true};
   }
   return rest(e,p,o);
 };
 h.c.v60FetchBuildingHubJson=(...a)=>h.c.v754ReadHubPage(...a);
 h.c.fetch=async(url)=>{const u=new URL(url);assert.equal(u.hostname,'apis.data.go.kr');const call={op:u.pathname.split('/').pop(),format:u.searchParams.get('_type'),page:Number(u.searchParams.get('pageNo'))};shared.calls.push(call);shared.active++;shared.max=Math.max(shared.max,shared.active);try{await new Promise(r=>setTimeout(r,3));return response?response(call):new Response(JSON.stringify(reply([{hoNm:'1'}],1,call.page)));}finally{shared.active--;}};
 return {...h,shared};
}
test('aggregate, classification, geometry, auth and algorithm version unchanged',()=>{
 const a=ctx({original:true}).c,b=ctx().c;for(const n of ['v60AggregateBuildingStats','v60DetermineDetailParcels','v60Classification','v65EnrichExposRowsWithFloorUse','normalizeVerifiedScopeParcels','verifySupabaseUserByJwt','requestAwsTerrariumTerrainStatistics'])assert.equal(a[n].toString(),b[n].toString(),n);assert.equal(a.version,b.version);
});
test('zero-row success reused through 160 later lookups',async()=>{const h=ctx();await complete(h);for(let i=0;i<160;i++)await complete(h);assert.equal(h.calls.length,3);assert.deepEqual(h.db.get(KEY).expos_rows,[]);assert.equal(h.db.get(KEY).source_complete,true);});
test('large source checkpoints and resumes across fresh Worker instances',async()=>{const h=ctx({area:records(12500)});await complete(h);assert.equal(h.db.get(KEY).area_rows.length,12500);assert.equal(h.db.get(KEY).source_meta.phases.area.pages,125);const n=ctx({db:h.db});await complete(n);assert.equal(n.calls.length,0);});
test('partial row accepts NULL fetched_at but completed row has both required dates',async()=>{const h=ctx({expos:records(501)});await h.c.v60EnsureDetailCaches(h.env,[KEY]);assert.equal(h.db.get(KEY).status,'partial');assert.equal(h.db.get(KEY).fetched_at,null);await complete(h);assert.ok(h.db.get(KEY).fetched_at&&h.db.get(KEY).expires_at);});
test('same missing page retries without redownloading accepted pages',async()=>{let fail=true;const all=records(350);const h=ctx({upstream:async p=>{if(p.phase==='expos'&&p.pageNo===3&&fail)throw new Error('timeout');const a=p.phase==='expos'?all:[];return reply(a.slice((p.pageNo-1)*100,p.pageNo*100),a.length,p.pageNo);}});await assert.rejects(h.c.v60EnsureDetailCaches(h.env,[KEY]));assert.equal(h.db.get(KEY).expos_rows.length,200);h.db.get(KEY).expires_at=past;fail=false;const n=h.calls.length;await complete(h);assert.equal(h.calls[n].pageNo,3);assert.equal(h.db.get(KEY).expos_rows.length,350);});
test('one failing parcel does not prevent a different parcel from completing',async()=>{const h=ctx({upstream:async p=>{if(p.sigunguCd==='41465')throw new Error('timeout');return reply([],0,p.pageNo);}});assert.equal((await h.c.v60EnsureDetailCaches(h.env,[KEY,OTHER])).complete,false);await assert.rejects(h.c.v60EnsureDetailCaches(h.env,[KEY,OTHER]));assert.equal(h.db.get(OTHER).status,'ready');assert.equal(h.db.get(KEY).status,'error');});
test('malformed page never becomes a completed empty result',async()=>{const h=ctx({upstream:async()=>({})});await assert.rejects(h.c.v60EnsureDetailCaches(h.env,[KEY]),/totalCount/);assert.equal(h.db.get(KEY).source_complete,false);});
test('duplicate page content fails closed',async()=>{const h=ctx({upstream:async p=>reply(records(100),200,p.pageNo)});await assert.rejects(h.c.v60EnsureDetailCaches(h.env,[KEY]),/repeated page/);assert.equal(h.db.get(KEY).source_complete,false);});
test('different camps and arbitrary legal dong codes use identical transport',async()=>{const h=network();for(const sigunguCd of ['27170','11560','41465','11110'])await h.c.v60FetchBuildingHubJson(h.c.urls.expos,{...query,sigunguCd},h.env,'source',1000);assert.equal(h.shared.calls.length,4);});
test('three independent Worker isolates never overlap source requests',async()=>{const shared={},hs=[network(shared),network(shared),network(shared)];await Promise.all(hs.map(async h=>{for(let p=1;p<=3;p++)await h.c.v60FetchBuildingHubJson(h.c.urls.expos,{...query,pageNo:p},h.env,'source',1000);}));assert.equal(shared.calls.length,9);assert.equal(shared.max,1);assert.ok(shared.denied>0);});
test('healthy page only requested once',async()=>{const h=network();await h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000);assert.equal(h.shared.calls.length,1);assert.equal(h.shared.finishes[0].p_outcome,'success');});
test('JSON-empty has one gated official XML fallback not three immediate JSON retries',async()=>{const h=network({},p=>new Response(p.format==='json'?'':xml));const d=await h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000);assert.equal(d.response.body.totalCount,'1');assert.deepEqual(h.shared.calls.map(p=>p.format),['json','xml']);});
test('both JSON and XML empty fail closed',async()=>{const h=network({},()=>new Response(''));await assert.rejects(h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000),e=>e.providerOutcome==='empty');assert.equal(h.shared.calls.length,2);assert.equal(h.shared.token,null);});
test('provider 05 records actual code and bytes without request amplification',async()=>{const h=network({},()=>new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>05</returnReasonCode><returnAuthMsg>SERVICETIMEOUT_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'));await assert.rejects(h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000),e=>e.providerOutcome==='upstream');assert.equal(h.shared.calls.length,1);assert.equal(h.shared.finishes[0].p_info.resultCode,'05');});
test('Retry-After honored without format retry on 429',async()=>{const h=network({},()=>new Response('rate limit',{status:429,headers:{'Retry-After':'120'}}));await assert.rejects(h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000),e=>e.providerOutcome==='throttle'&&e.retryAfterSeconds===120);assert.equal(h.shared.calls.length,1);assert.equal(h.shared.finishes[0].p_retry_ms,120000);});
test('HTTP200 data with missing totalCount fails validation',async()=>{const h=network({},()=>new Response('{}'));await assert.rejects(h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000),/totalCount/);assert.equal(h.shared.finishes[0].p_outcome,'invalid');});
test('legitimate verified zero is accepted',async()=>{const h=network({},()=>new Response(JSON.stringify(reply([],0))));await h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000);assert.equal(h.shared.finishes[0].p_info.acceptedRows,0);assert.equal(h.shared.finishes[0].p_outcome,'success');});
test('gate database failure sends no upstream request',async()=>{const h=network({offline:true});await assert.rejects(h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000),e=>e.code==='SOURCE_DB_TRANSPORT');assert.equal(h.shared.calls.length,0);});
test('lost gate finish acknowledgement cannot silently accept the response',async()=>{const h=network({finishOffline:true});await assert.rejects(h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000),e=>e.code==='SOURCE_DB_TRANSPORT');});
test('logs contain only metrics and never service keys or raw units',async()=>{const h=network();h.env.__mwHubTrace=[];await h.c.v60FetchBuildingHubJson(h.c.urls.expos,query,h.env,'source',1000);const s=JSON.stringify([h.shared.finishes,h.env.__mwHubTrace]);for(const k of ['serviceKey','hoNm',h.env.BUILDING_HUB_SERVICE_KEY])assert.ok(!s.includes(k));});
test('unapproved host is rejected before credentials can leave the Worker',async()=>{const h=network();await assert.rejects(h.c.v754HubRequest('https://evil.test',query,h.env,'source',1000),e=>e.code==='INVALID_SOURCE');assert.equal(h.shared.calls.length,0);});
test('legacy title and generic source entrypoints share the provider gate',async()=>{const h=network();await h.c.fetchBuildingHubTitlePage(h.env,'41465','10300',1);await h.c.fetchPublicDataJson(h.c.urls.expos,query,h.env,'source',1000,9);assert.equal(h.shared.calls.length,2);assert.equal(h.shared.finishes.length,2);});
test('backoff belongs to failed page and resets on progress',()=>{const h=ctx(),e=Object.assign(new Error('empty'),{providerOutcome:'empty'}),m={phase:'area',phases:{area:{nextPage:18}}},d=[];for(let i=0;i<5;i++){m.pageRecovery=h.c.v754PageRecovery(e,m);d.push(m.pageRecovery.delaySeconds);}assert.deepEqual(d,[15,45,120,300,600]);m.phases.area.nextPage=19;assert.equal(h.c.v754PageRecovery(e,m).failures,1);});
test('earliest available source sets retry time not latest blocked source',()=>{const h=ctx(),n=Date.now();const e=h.c.v751DetailUnavailable([{parcel_key:'a',last_error:'timeout',expires_at:new Date(n+15000).toISOString()},{parcel_key:'b',last_error:'timeout',expires_at:new Date(n+900000).toISOString()}]);assert.ok(e.retryAfterSeconds<=15);});
test('shared capacity wait is not failure and does not change source variant',async()=>{const h=ctx();job(h);h.c.v60FetchBuildingHubJson=async()=>{throw Object.assign(new Error('waiting'),{code:'SOURCE_PROVIDER_BUSY',retryAfterSeconds:8});};handler(h,()=>h.c.v60EnsureDetailCaches(h.env,[KEY]));assert.equal((await h.c.processBuildingAnalysisJob(ID,h.env)).status,'retry');assert.equal(h.jobs.get(ID).failure_count,0);assert.equal(h.db.get(KEY).status,'partial');assert.ok(!h.db.get(KEY).source_meta.phases.expos);});
test('success clears page recovery counter',async()=>{let fail=true;const h=ctx({upstream:async p=>{if(fail)throw new Error('timeout');return reply([],0,p.pageNo);}});await assert.rejects(h.c.v60EnsureDetailCaches(h.env,[KEY]));h.db.get(KEY).expires_at=past;fail=false;await complete(h);assert.equal(h.db.get(KEY).source_meta.pageRecovery,null);});
test('same failing page has finite five-attempt budget',async()=>{const h=ctx();job(h);handler(h,async()=>{throw Object.assign(new Error('unavailable'),{code:'BUILDING_DETAIL_SOURCE_UNAVAILABLE',sourceFailureCount:5,shortRecoveryEligible:true,retryAfterSeconds:15});});assert.equal((await h.c.processBuildingAnalysisJob(ID,h.env)).status,'error');});
test('queue sends delayed successor before ack',async()=>{const order=[],h=ctx({send:async()=>order.push('send')});h.c.processBuildingAnalysisJob=async()=>({status:'retry',delaySeconds:15});await h.c.handleBuildingQueue({messages:[{body:{jobId:ID},ack:()=>order.push('ack'),retry:()=>order.push('retry')}]},h.env);assert.deepEqual(order,['send','ack']);assert.deepEqual(h.sent[0],[{jobId:ID},{delaySeconds:15}]);});
test('queue failure retains original message for retry',async()=>{const order=[],h=ctx({send:async()=>{throw new Error('queue unavailable');}});h.c.processBuildingAnalysisJob=async()=>({status:'retry',delaySeconds:15});await h.c.handleBuildingQueue({messages:[{body:{jobId:ID},ack:()=>order.push('ack'),retry:()=>order.push('retry')}]},h.env);assert.deepEqual(order,['retry']);});
test('fresh owner cannot overwrite cancellation',async()=>{const h=ctx();job(h);handler(h,async()=>{h.jobs.get(ID).status='cancelled';return {ok:true,buildingStats:{deliveryUnitCount:42}};});await h.c.processBuildingAnalysisJob(ID,h.env);assert.equal(h.jobs.get(ID).status,'cancelled');});
