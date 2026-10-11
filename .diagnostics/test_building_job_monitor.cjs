const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {create}=require('../public/building-job-monitor.js');
const html=fs.readFileSync(path.join(__dirname,'../public/coupangRouteMap.html'),'utf8');
const flush=async()=>{for(let i=0;i<18;i++)await Promise.resolve();};
function clock(){
  let now=Date.parse('2026-10-11T15:00:00Z'),seq=0;const timers=new Map();
  return {now:()=>now,schedule:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:now+ms});return id;},unschedule:id=>timers.delete(id),pending:()=>timers.size,
    advance:async(ms)=>{const target=now+ms;let count=0;while(true){const next=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>1000)throw Error('timer loop');now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=target;await flush();}};
}
const waiting=retry=>({status:'queued',error:'temporary upstream failure',progress:{message:'waiting',nextRetryAt:new Date(retry).toISOString()}});
const complete=n=>({status:'completed',result:{buildingStats:{deliveryUnitCount:n}}});
function setup(fetcher,extra={}){
  const t=clock(),calls=[],states=[];
  const m=create({...t,...extra,fetchStatus:async(id,signal)=>{calls.push({id,at:t.now(),signal});return fetcher(id,calls.length,t);}});
  return {t,m,calls,states,watch:id=>m.watch(id,state=>states.push(state))};
}
function extract(name){const m=html.match(new RegExp('^  (?:async )?function '+name+'\\([^]*?^  }','m'));if(!m)throw Error(name);return m[0];}
test('cooldown is waiting, not a terminal error',async()=>{
  const h=setup((_id,_i,t)=>waiting(t.now()+900000));assert.equal((await h.watch('A')).state,'waiting');assert.equal(h.calls.length,1);assert.equal(h.t.pending(),1);
});
test('no GETs before nextRetryAt; same job completes after cooldown',async()=>{
  const h=setup((_id,i,t)=>i===1?waiting(t.now()+900000):complete(1529));await h.watch('A');await h.t.advance(899999);assert.equal(h.calls.length,1);await h.t.advance(2001);assert.equal(h.calls.length,2);assert.deepEqual(h.calls.map(x=>x.id),['A','A']);assert.equal(h.states.at(-1).state,'completed');assert.equal(h.states.at(-1).result.buildingStats.deliveryUnitCount,1529);assert.equal(h.t.pending(),0);
});
test('duplicate watch/click does not bypass cooldown',async()=>{
  const h=setup((_id,_i,t)=>waiting(t.now()+60000));const a=h.watch('A');await a;assert.equal(a,h.watch('A'));for(let i=0;i<20;i++)h.m.refresh('A');await flush();assert.equal(h.calls.length,1);assert.equal(h.t.pending(),1);
});
test('active job still polls and returns successful result',async()=>{
  const h=setup((_id,i)=>i===1?{status:'running'}:complete(12));const p=h.watch('A');await flush();await h.t.advance(1500);assert.equal((await p).state,'completed');assert.equal(h.calls.length,2);
});
test('waiting job does not block independent completion',async()=>{
  const h=setup((id,_i,t)=>id==='A'?waiting(t.now()+60000):complete(10));assert.equal((await h.watch('A')).state,'waiting');assert.equal((await h.watch('B')).state,'completed');
});
test('actual terminal errors are not repeatedly requested',async()=>{
  const h=setup(()=>({status:'error',error:'source exhausted'}));assert.equal((await h.watch('A')).state,'error');await h.t.advance(999999);assert.equal(h.calls.length,1);assert.equal(h.t.pending(),0);
});
test('missing final result cannot be reported as completed',async()=>{
  const h=setup(()=>({status:'completed',result:{}}));assert.equal((await h.watch('A')).state,'error');
});
test('scope change clears timers, without any server cancellation',async()=>{
  const h=setup((_id,_i,t)=>waiting(t.now()+60000));await h.watch('A');h.m.cancelAll();await h.t.advance(120000);assert.equal(h.calls.length,1);assert.equal(h.t.pending(),0);
});
test('late old-scope response does not update current screen',async()=>{
  let resolve;const h=setup(()=>new Promise(r=>resolve=r));const p=h.watch('A');await flush();h.m.cancelAll();resolve(complete(999));await flush();assert.equal((await p).clientOnly,true);assert.equal(h.states.length,0);
});
test('status transport errors detach after three backed-off attempts',async()=>{
  const h=setup(()=>{throw Error('offline');});await h.watch('A');await h.t.advance(70000);assert.equal(h.calls.length,3);assert.equal(h.states.at(-1).detached,true);assert.equal(h.t.pending(),0);
});
test('hung status requests have a bounded deadline',async()=>{
  const h=setup(()=>new Promise(()=>{}),{requestMs:1000});const p=h.watch('A');await flush();await h.t.advance(1000);assert.equal((await p).state,'waiting');assert.equal(h.calls[0].signal.aborted,true);
});
test('expired retry timestamp cannot create tight loop',async()=>{
  const h=setup((_id,i,t)=>i<3?waiting(t.now()-1000):complete(9));await h.watch('A');await h.t.advance(1499);assert.equal(h.calls.length,1);await h.t.advance(1501);assert.equal(h.calls.length,3);
});
test('real poll adapter returns pending without converting to error',async()=>{
  const h=setup((_id,_i,t)=>waiting(t.now()+60000));const c=vm.createContext({buildingJobMonitor:h.m,DOMException,Error,String});vm.runInContext(extract('pollBuildingJob'),c);const result=await c.pollBuildingJob('token','A',()=>{});assert.equal(result.__mwJobPending,true);assert.equal(result.jobId,'A');
});
test('real route pipeline continues past both waiting and failed jobs',async()=>{
  const values=new Map([['D',{status:'ok',data:{buildingStats:{deliveryUnitCount:50}}}]]),called=[],packs=['A','B','C','D','E'];
  const c=vm.createContext({Promise,Array,Map,String,buildingRequestSeq:0,buildingResultByRouteKey:values,buildingRefreshBtn:{disabled:false},routePacksForTerrain:()=>packs,terrainPackRouteKey:p=>p,getTerrainAccessToken:async()=> 't',buildingJobIdByRouteKey:new Map(),BUILDING_CACHE_PROBE_CONCURRENCY:4,BUILDING_CALC_CONCURRENCY:3,probeBuildingCacheForPack:async()=>({hit:false}),renderTerrainCards:()=>{},updateBuildingSummary:()=>{},clearBuildingDisplay:()=>{},fetchBuildingStatsForPack:async p=>{called.push(p);if(p==='A')return {status:'waiting',jobId:'job-A'};if(p==='B')throw Error('actual failure');return {status:'ok'};}});
  c.invalidateBuildingMonitors=()=>++c.buildingRequestSeq;vm.runInContext(extract('buildingPreviousResult')+'\n'+extract('loadBuildingForCurrentScope'),c);await c.loadBuildingForCurrentScope(false);assert.deepEqual(called.sort(),['A','B','C','E']);assert.equal(values.get('A').status,'waiting');assert.equal(values.get('D').data.buildingStats.deliveryUnitCount,50);assert.equal(values.get('E').status,'ok');assert.equal(c.buildingRefreshBtn.disabled,false);
});
test('known job reattaches without a second creation POST',async()=>{
  let posts=0,known;const c=vm.createContext({String,Error,startBuildingJob:async()=>{posts++;return {jobId:'new'};},pollBuildingJob:async(_t,id)=>{known=id;return {};}});vm.runInContext(extract('runBuildingJob'),c);await c.runBuildingJob('token',null,()=>{},{jobId:'saved-job'});assert.equal(posts,0);assert.equal(known,'saved-job');
});
test('duplicate per-route clicks share one start operation',async()=>{
  let resolve,starts=0;const c=vm.createContext({Map,terrainPackRouteKey:x=>x,buildingTaskByRouteKey:new Map(),fetchBuildingStatsForPackInternal:()=>{starts++;return new Promise(r=>resolve=r);}});vm.runInContext(extract('fetchBuildingStatsForPack'),c);const a=c.fetchBuildingStatsForPack('A'),b=c.fetchBuildingStatsForPack('A');assert.equal(starts,1);resolve({status:'waiting'});await Promise.all([a,b]);assert.equal(c.buildingTaskByRouteKey.size,0);
});
test('no global source outage stop; monitor is loaded before page script',()=>{
  assert.ok(!html.includes('sourceUnavailable'));assert.match(html,/const BUILDING_CALC_CONCURRENCY = 3;/);assert.match(html,/<script src="\/building-job-monitor.js\?v=1"><\/script>/);assert.ok(!html.includes('buildingRefreshBtn?.addEventListener("click", ()=>{\n    buildingResultByRouteKey.clear();'));
});
test('all inline frontend JavaScript still parses',()=>{
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){if(match[1].trim())new vm.Script(match[1]);}
});
