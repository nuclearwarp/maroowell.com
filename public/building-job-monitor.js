/* MW_BUILDING_JOB_MONITOR_V1
 * UI-only status monitoring: never starts, cancels, or resubmits a server job.
 * A server retry-not-before timestamp suspends ALL GETs for that job.
 */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.MWBuildingJobMonitor=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
  'use strict';
  function create(options){
    if(typeof options?.fetchStatus!=='function') throw new TypeError('fetchStatus is required');
    const now=options.now||Date.now;
    const schedule=options.schedule||setTimeout;
    const unschedule=options.unschedule||clearTimeout;
    const pollMs=Math.max(250,Number(options.pollMs)||1500);
    const requestMs=Math.max(1000,Number(options.requestMs)||30000);
    const activeBudgetMs=Number(options.activeBudgetMs)||15*60*1000;
    const lifetimeMs=Number(options.lifetimeMs)||60*60*1000;
    const entries=new Map();
    function valid(e){return entries.get(e.id)===e && !e.stopped;}
    function clearTimer(e){if(e.timer!==null){unschedule(e.timer);e.timer=null;}}
    function emit(e,state,settle=false){
      if(!valid(e))return;
      e.last={jobId:e.id,...state};
      try{e.onState?.(e.last);}catch(err){console.warn('Building job display update failed',err);}
      if(settle && !e.settled){e.settled=true;e.resolve(e.last);}
    }
    function finish(e,state){
      emit(e,state,true);clearTimer(e);e.stopped=true;entries.delete(e.id);
    }
    function arm(e,at){
      clearTimer(e);e.notBefore=at;
      if(at>e.deadline){
        emit(e,{...e.last,state:'waiting',detached:true,nextRetryAt:new Date(at).toISOString()},true);
        return;
      }
      e.timer=schedule(()=>{e.timer=null;void tick(e);},Math.max(0,at-now()));
    }
    function describe(data){
      const p=data?.progress||{};
      const done=Number(p.processedParcelCount||0),total=Number(p.totalParcelCount||done+Number(p.remainingParcelCount||0));
      let message=String(p.message||'\uBC31\uADF8\uB77C\uC6B4\uB4DC\uC5D0\uC11C \uBD84\uC11D \uC911\uC785\uB2C8\uB2E4.');
      if(total>0)message+=` \u00b7 ${Math.min(done,total)}/${total}`;
      return message;
    }
    async function tick(e){
      if(!valid(e)||e.inflight)return;
      if(e.notBefore>now()){arm(e,e.notBefore);return;}
      if(now()>=e.deadline || now()-e.activeSince>=activeBudgetMs){
        clearTimer(e);
        emit(e,{state:'waiting',detached:true,message:'\uBC31\uADF8\uB77C\uC6B4\uB4DC \uBD84\uC11D\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4. \uBC84\uD2BC\uC73C\uB85C \uAC19\uC740 \uC791\uC5C5\uC758 \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'},true);
        return;
      }
      e.inflight=true;e.controller=new AbortController();
      let timeout;
      try{
        const deadline=new Promise((_,reject)=>{timeout=schedule(()=>{
          const err=Object.assign(new Error('Building status request timed out'),{name:'TimeoutError'});
          e.controller?.abort(err);reject(err);
        },requestMs);});
        const data=await Promise.race([options.fetchStatus(e.id,e.controller.signal),deadline]);
        if(!valid(e))return;
        e.networkFailures=0;
        const status=String(data?.status||'');
        const common={progress:data?.progress||{},message:describe(data),error:data?.error||null};
        if(status==='completed'){
          if(!data?.result?.buildingStats){finish(e,{state:'error',error:'Completed job has no result'});return;}
          finish(e,{...common,state:'completed',result:data.result});return;
        }
        if(status==='error'||status==='cancelled'){
          finish(e,{...common,state:status,error:data?.error||common.message});return;
        }
        if(!['queued','running'].includes(status)){
          finish(e,{state:'error',error:'Unexpected building job status'});return;
        }
        const retry=Date.parse(data?.progress?.nextRetryAt||'');
        if(status==='queued' && (Number.isFinite(retry) || data?.error)){
          // Do not convert a temporary server cooldown into a terminal failure.
          const at=Math.max(now()+pollMs,Number.isFinite(retry)?retry+2000:now()+15000);
          e.activeSince=at;
          emit(e,{...common,state:'waiting',nextRetryAt:new Date(at).toISOString(),detached:false},true);
          arm(e,at);return;
        }
        emit(e,{...common,state:'running',nextRetryAt:null,detached:false});
        arm(e,now()+pollMs);
      }catch(error){
        if(!valid(e))return;
        if([401,403].includes(Number(error?.httpStatus))){finish(e,{state:'error',error:String(error.message||error)});return;}
        e.networkFailures++;
        const detached=e.networkFailures>=3;
        const at=now()+Math.min(60000,10000*e.networkFailures);
        emit(e,{state:'waiting',detached,nextRetryAt:detached?null:new Date(at).toISOString(),
          message:'\uC0C1\uD0DC \uC5F0\uACB0\uC744 \uB2E4\uC2DC \uD655\uC778\uD569\uB2C8\uB2E4. \uC11C\uBC84 \uC791\uC5C5\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4.',
          error:String(error?.message||error)},true);
        if(!detached)arm(e,at);
      }finally{
        if(timeout!==undefined)unschedule(timeout);
        e.inflight=false;e.controller=null;
      }
    }
    function watch(jobId,onState){
      const id=String(jobId||'');if(!id)throw new TypeError('jobId is required');
      if(entries.has(id))return entries.get(id).first;
      let resolve;
      const first=new Promise(r=>{resolve=r;});
      const e={id,onState,first,resolve,settled:false,stopped:false,timer:null,controller:null,
        inflight:false,last:null,notBefore:0,networkFailures:0,activeSince:now(),deadline:now()+lifetimeMs};
      entries.set(id,e);void tick(e);return first;
    }
    function cancelAll(){
      for(const e of entries.values()){
        clearTimer(e);e.stopped=true;e.controller?.abort();
        if(!e.settled){e.settled=true;e.resolve({state:'cancelled',jobId:e.id,clientOnly:true});}
      }
      entries.clear();
    }
    function refresh(id){
      const e=entries.get(String(id));if(!e)return false;
      // Repeated clicks never bypass the server cooldown and never create POSTs.
      if(e.inflight||e.notBefore>now())return true;
      clearTimer(e);e.activeSince=now();e.deadline=now()+lifetimeMs;e.networkFailures=0;
      void tick(e);return true;
    }
    return {watch,cancelAll,refresh,has:id=>entries.has(String(id)),
      state:id=>entries.get(String(id))?.last||null};
  }
  return {create};
});
