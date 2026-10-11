from pathlib import Path
import hashlib,re,sys
BASE_SHA='7596b279358eab77a2e40c86ecd94c495091fe1c467fe50b17056fd716083f01'

def patch(src):
 if hashlib.sha256(src.encode()).hexdigest()!=BASE_SHA:
  raise ValueError('Frontend changed since inspected snapshot; refusing to overwrite')
 def one(a,b):
  nonlocal src
  if src.count(a)!=1: raise ValueError('Anchor count: '+str(src.count(a))+' '+a[:90])
  src=src.replace(a,b,1)
 def block(name,next_name,new):
  nonlocal src
  pattern=r'  (?:async )?function '+re.escape(name)+r'\('
  m=re.search(pattern,src); n=re.search(r'\n  (?:async )?function '+re.escape(next_name)+r'\(',src[m.start():])
  if not m or not n: raise ValueError(name)
  end=m.start()+n.start();src=src[:m.start()]+new.strip('\n')+'\n'+src[end:]
 one('  <script src="/config.js"></script>', '  <script src="/config.js"></script>\n  <script src="/building-job-monitor.js?v=1"></script>')
 one('  const BUILDING_CALC_CONCURRENCY = 1; // Stop launching more routes after a source outage.', '  const BUILDING_CALC_CONCURRENCY = 3; // Independent jobs may wait without blocking other routes.')
 one('  const buildingResultByRouteKey = new Map();', '''  const buildingResultByRouteKey = new Map();
  const buildingTaskByRouteKey = new Map();
  const buildingJobIdByRouteKey = new Map();
  const buildingJobMonitor = window.MWBuildingJobMonitor.create({
    pollMs: BUILDING_JOB_POLL_MS,
    activeBudgetMs: BUILDING_JOB_CLIENT_WAIT_MS,
    fetchStatus: (jobId,signal) => buildingJobFetch("",`${BUILDING_JOB_ENDPOINT}/${encodeURIComponent(jobId)}`,{method:"GET",signal})
  });
  window.addEventListener("pagehide",()=>buildingJobMonitor.cancelAll());''')
 one('    let token=await getTerrainAccessToken(false).catch(()=>accessToken||"");\n    if(!token)throw new Error(', '    if(options.signal?.aborted)throw new DOMException("Cancelled","AbortError");\n    let token=await getTerrainAccessToken(false).catch(()=>accessToken||"");\n    if(options.signal?.aborted)throw new DOMException("Cancelled","AbortError");\n    if(!token)throw new Error(')
 block('pollBuildingJob','analysisScopePayload',r'''
  async function pollBuildingJob(accessToken,jobId,updateMessage){
    const outcome=await buildingJobMonitor.watch(jobId,state=>updateMessage?.(state.message,state));
    if(outcome.state==="completed")return outcome.result;
    if(outcome.state==="waiting")return {__mwJobPending:true,...outcome};
    if(outcome.clientOnly)throw new DOMException("Cancelled","AbortError");
    const error=new Error(String(outcome.error||outcome.message||"Building analysis failed"));
    error.jobId=jobId;
    throw error;
  }

  async function runBuildingJob(accessToken,payload,updateMessage,options={}){
    let jobId=String(options.jobId||"");
    if(!jobId){
      const created=await startBuildingJob(accessToken,payload);
      options.assertCurrent?.();
      jobId=String(created?.jobId||"");
      if(!jobId)throw new Error("Background analysis job ID missing");
      options.onCreated?.(jobId);
    }
    return await pollBuildingJob(accessToken,jobId,updateMessage);
  }

  function invalidateBuildingMonitors(clearIds=false){
    buildingRequestSeq++;
    buildingJobMonitor.cancelAll();
    buildingTaskByRouteKey.clear();
    if(clearIds)buildingJobIdByRouteKey.clear();
    return buildingRequestSeq;
  }

  function updateBuildingSummary(){
    const items=routePacksForTerrain().map((p,i)=>buildingResultByRouteKey.get(terrainPackRouteKey(p,i)));
    const count=status=>items.filter(x=>x?.status===status).length;
    const active=items.filter(x=>["checking","queued","loading"].includes(x?.status)).length;
    const done=count("ok"),waiting=count("waiting"),failed=count("error");
    const message=`${done}\uAC1C \uC644\uB8CC${active?` \u00b7 ${active}\uAC1C \uBD84\uC11D \uC911`:""}${waiting?` \u00b7 ${waiting}\uAC1C \uC7AC\uC2DC\uB3C4 \uB300\uAE30`:""}${failed?` \u00b7 ${failed}\uAC1C \uC624\uB958`:""}`;
    setBuildingStatus(message,active?"loading":waiting||failed?"warn":"idle");
  }

  function buildingPreviousResult(item){
    return item?.status==="ok"?item:(item?.previousResult||null);
  }

  function buildingWaitingMessage(state){
    const retry=Date.parse(state?.nextRetryAt||"");
    if(state.detached)return state.message||"\uC11C\uBC84 \uBD84\uC11D\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4. \uBC84\uD2BC\uC73C\uB85C \uC0C1\uD0DC\uB9CC \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694.";
    const time=Number.isFinite(retry)?new Date(retry).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"";
    return `\uC6D0\uCC9C \uC7AC\uC2DC\uB3C4 \uB300\uAE30${time?` \u00b7 ${time}\uC5D0 \uC790\uB3D9 \uC774\uC5B4\uBC1B\uAE30`:""}. \uB300\uAE30 \uC911\uC5D0\uB294 \uBC18\uBCF5 \uC870\uD68C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`;
  }
''')
 one('    buildingRequestSeq+=1;', '    invalidateBuildingMonitors(true);')
 block('fetchBuildingStatsForPack','loadBuildingForCurrentScope',r'''
  async function fetchBuildingStatsForPack(pack,accessToken,force=false,options={}){
    const routeKey=terrainPackRouteKey(pack);
    const task=buildingTaskByRouteKey.get(routeKey);
    if(task)return task;
    const promise=fetchBuildingStatsForPackInternal(pack,accessToken,force,options);
    buildingTaskByRouteKey.set(routeKey,promise);
    try{return await promise;}
    finally{if(buildingTaskByRouteKey.get(routeKey)===promise)buildingTaskByRouteKey.delete(routeKey);}
  }

  async function fetchBuildingStatsForPackInternal(pack,accessToken,force=false,options={}){
    const requestSeq=buildingRequestSeq;
    const assertCurrent=()=>{if(requestSeq!==buildingRequestSeq)throw new DOMException("Scope changed","AbortError");};
    if(!window.turf)throw new Error("Turf.js unavailable");
    const geometry=terrainGeometryFromPack(pack);
    if(!geometry)throw new Error("Analysis polygon missing");
    const target=await buildTerrainTarget(pack,geometry);assertCurrent();
    const routeKey=terrainPackRouteKey(pack);
    const memoryKey=`${target.scopeType}:${target.scopeKey}:${target.geometryHash}`;
    const scopePayload=analysisScopePayload(target,geometry);
    const previousResult=buildingPreviousResult(buildingResultByRouteKey.get(routeKey));
    const finalItem=data=>{
      if(!data?.buildingStats || !(Number(data.buildingStats.deliveryUnitCount||data.buildingStats.delivery_unit_count)>0))throw new Error("Completed building result has no verified delivery units");
      return {status:"ok",data,target,memoryKey};
    };
    const updateMessage=(message,state)=>{
      if(requestSeq!==buildingRequestSeq)return;
      const current=buildingResultByRouteKey.get(routeKey)||{};
      let item={...current,status:"loading",message,previousResult};
      if(state?.jobId)item.jobId=state.jobId;
      if(state?.state==="waiting")item={...item,status:"waiting",message:buildingWaitingMessage(state),nextRetryAt:state.nextRetryAt,detached:state.detached,progress:state.progress};
      if(state?.state==="completed"){
        buildingJobIdByRouteKey.delete(routeKey);
        try{item=finalItem(state.result);}catch(error){item={status:"error",error:error.message,previousResult};}
      }
      if(state?.state==="error"||state?.state==="cancelled"){
        buildingJobIdByRouteKey.delete(routeKey);
        item={status:"error",error:String(state.error||state.message||"Analysis failed"),previousResult};
      }
      buildingResultByRouteKey.set(routeKey,item);renderTerrainCards();updateBuildingSummary();
    };
    let payload=null;
    const existingJobId=buildingJobIdByRouteKey.get(routeKey);
    if(!existingJobId){
      if(!force&&options.skipCacheProbe!==true){
        const cached=await postBuildingStats(accessToken,{...scopePayload,forceRefresh:false,force_refresh:false,cacheOnly:true,cache_only:true},{timeoutMs:BUILDING_CACHE_PROBE_TIMEOUT_MS,retryCount:0});
        assertCurrent();
        if(cached?.cached===true&&cached?.buildingStats)return finalItem(cached);
      }
      if(!geocoder)throw new Error("Address service unavailable");
      const feature=buildingFeatureFromGeometry(geometry);
      const legalDongCodes=await resolveLegalDongCodesForFeature(feature);assertCurrent();
      if(!legalDongCodes.length)throw new Error("Verified legal-dong codes unavailable");
      updateMessage("\uD3F4\uB9AC\uACE4 \uB0B4\uBD80 \uD544\uC9C0\uB97C \uD655\uC778\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.");
      const discovery=await discoverScopeParcelsForRoute(memoryKey,feature,force===true);assertCurrent();
      if(!discovery.parcels.length)throw new Error("No verified parcels in analysis polygon");
      payload={...scopePayload,legalDongCodes,legalDongCodeCandidates:legalDongCodes,
        forceRefresh:force===true,force_refresh:force===true,walkupMinGroundFloors:3,minCoveragePercent:95,
        scopeMatchMode:"V32_PHASED_KAPT_DETAIL_BUDGET",scopeParcels:discovery.parcels,
        scopeParcelDiscovery:discovery.diagnostics,locationSource:"KAKAO_POLYGON_REVERSE_PARCEL"};
    }
    assertCurrent();
    const data=await runBuildingJob(accessToken,payload,updateMessage,{jobId:existingJobId,assertCurrent,
      onCreated:jobId=>buildingJobIdByRouteKey.set(routeKey,jobId)});
    assertCurrent();
    if(data?.__mwJobPending)return {status:"waiting",jobId:data.jobId,nextRetryAt:data.nextRetryAt,
      detached:data.detached,message:buildingWaitingMessage(data),progress:data.progress,previousResult,target,memoryKey};
    return finalItem(data);
  }
''')
 block('loadBuildingForCurrentScope','refreshTerrainForSingleRoute',r'''
  async function loadBuildingForCurrentScope(force=false){
    const packs=routePacksForTerrain();
    if(!packs.length){clearBuildingDisplay();return;}
    const requestSeq=invalidateBuildingMonitors(false);
    if(buildingRefreshBtn)buildingRefreshBtn.disabled=true;
    try{
      const token=await getTerrainAccessToken();
      if(requestSeq!==buildingRequestSeq)return;
      const jobs=packs.map((pack,index)=>({pack,index,routeKey:terrainPackRouteKey(pack,index)}));
      const calcJobs=[];
      for(const job of jobs){
        const prev=buildingResultByRouteKey.get(job.routeKey);
        if(!force&&prev?.status==="ok")continue;
        buildingResultByRouteKey.set(job.routeKey,{status:"checking",previousResult:buildingPreviousResult(prev)});
      }
      renderTerrainCards(packs);updateBuildingSummary();
      let cursor=0;
      async function cacheWorker(){
        while(requestSeq===buildingRequestSeq){
          const job=jobs[cursor++];if(!job)return;
          const item=buildingResultByRouteKey.get(job.routeKey);
          if(!force&&item?.status==="ok")continue;
          if(force||buildingJobIdByRouteKey.has(job.routeKey)){calcJobs.push(job);continue;}
          try{
            const probe=await probeBuildingCacheForPack(job.pack,token);
            if(requestSeq!==buildingRequestSeq)return;
            if(probe.hit)buildingResultByRouteKey.set(job.routeKey,probe.result);
            else calcJobs.push(job);
          }catch(error){
            if(requestSeq!==buildingRequestSeq)return;
            buildingResultByRouteKey.set(job.routeKey,{status:"error",error:String(error.message||error),previousResult:buildingPreviousResult(item)});
          }
          renderTerrainCards(packs);updateBuildingSummary();
        }
      }
      await Promise.all(Array.from({length:Math.min(BUILDING_CACHE_PROBE_CONCURRENCY,jobs.length)},cacheWorker));
      calcJobs.sort((a,b)=>a.index-b.index);
      if(requestSeq!==buildingRequestSeq)return;
      let next=0;
      async function calcWorker(){
        while(requestSeq===buildingRequestSeq){
          const job=calcJobs[next++];if(!job)return;
          const previousResult=buildingPreviousResult(buildingResultByRouteKey.get(job.routeKey));
          buildingResultByRouteKey.set(job.routeKey,{status:"loading",previousResult});
          renderTerrainCards(packs);updateBuildingSummary();
          try{
            const result=await fetchBuildingStatsForPack(job.pack,token,force,{skipCacheProbe:true});
            if(requestSeq!==buildingRequestSeq)return;
            buildingResultByRouteKey.set(job.routeKey,result);
          }catch(error){
            if(requestSeq!==buildingRequestSeq)return;
            buildingResultByRouteKey.set(job.routeKey,{status:"error",error:String(error.message||error),previousResult});
          }
          // A waiting job has its own timer; it releases this slot for the next route.
          renderTerrainCards(packs);updateBuildingSummary();
        }
      }
      await Promise.all(Array.from({length:Math.min(BUILDING_CALC_CONCURRENCY,calcJobs.length)},calcWorker));
      if(requestSeq===buildingRequestSeq)updateBuildingSummary();
    }finally{
      if(requestSeq===buildingRequestSeq&&buildingRefreshBtn)buildingRefreshBtn.disabled=false;
    }
  }
''')
 block('refreshBuildingForSingleRoute','buildingStatsHtml',r'''
  async function refreshBuildingForSingleRoute(routeId){
    const matchedId=Array.from(overlayById.keys()).find(id=>String(id)===String(routeId));
    const pack=matchedId!=null?overlayById.get(matchedId):null;
    if(!pack)return;
    const routeKey=terrainPackRouteKey(pack);
    const existing=buildingJobIdByRouteKey.get(routeKey);
    if(existing&&buildingJobMonitor.refresh(existing))return;
    if(buildingTaskByRouteKey.has(routeKey))return;
    const requestSeq=buildingRequestSeq;
    const previousResult=buildingPreviousResult(buildingResultByRouteKey.get(routeKey));
    buildingResultByRouteKey.set(routeKey,{status:"loading",previousResult});renderTerrainCards();
    try{
      const token=await getTerrainAccessToken();
      if(requestSeq!==buildingRequestSeq)return;
      const result=await fetchBuildingStatsForPack(pack,token,true);
      if(requestSeq!==buildingRequestSeq)return;
      buildingResultByRouteKey.set(routeKey,result);
    }catch(error){
      if(requestSeq!==buildingRequestSeq)return;
      buildingResultByRouteKey.set(routeKey,{status:"error",error:String(error.message||error),previousResult});
    }
    renderTerrainCards();updateBuildingSummary();
  }
''')
 one('  function buildingStatsHtml(item){',r'''  function buildingStatsHtml(item){
    if(item?.status!=="ok"&&item?.previousResult){
      const notice=String(item.message||item.error||"\uC0C8 \uBD84\uC11D \uC911\uC785\uB2C8\uB2E4. \uC9C1\uC804 \uACB0\uACFC\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4.");
      return `<div class="buildingStatsMessage">${escapeHtml(notice)}</div>`+buildingStatsHtml(item.previousResult);
    }
    if(item?.status==="waiting")return `<div class="buildingStatsMessage">${escapeHtml(item.message||"\uC7AC\uC2DC\uB3C4 \uB300\uAE30")}</div>`;''')
 one('    if (item.status === "checking"){',r'''    if (item.status === "waiting"){
      return {kind:"idle",label:"\uC7AC\uC2DC\uB3C4 \uB300\uAE30",disabled:!item.detached};
    }
    if (item.status === "checking"){''')
 # Preserve an already rendered result while explicitly refreshing it.
 one('  buildingRefreshBtn?.addEventListener("click", ()=>{\n    buildingResultByRouteKey.clear();','  buildingRefreshBtn?.addEventListener("click", ()=>{')
 # Polygon changes invalidate both a local monitor and its previous geometry identity.
 one('    terrainResultByRouteKey.clear();\n    buildingResultByRouteKey.clear();','    terrainResultByRouteKey.clear();\n    invalidateBuildingMonitors(true);\n    buildingResultByRouteKey.clear();')
 if 'sourceUnavailable' in src:raise ValueError('Previous global stop remains')
 return src

if __name__=='__main__':
 p=Path(sys.argv[1]);s=p.read_text(encoding='utf-8');new=patch(s)
 out=Path(sys.argv[2]) if len(sys.argv)>2 else p
 out.write_text(new,encoding='utf-8')
 print('Patched frontend SHA-256',hashlib.sha256(new.encode()).hexdigest())
