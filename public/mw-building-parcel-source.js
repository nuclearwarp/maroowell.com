/* Shared public-building parcel discovery for route and ZIP household analytics.
   Source: authorized Maroowell PostGIS building-footprints endpoint (not Kakao).
   A building's 25-digit management number carries the exact 10-digit legal-dong
   code, mountain flag, and 4+4-digit parcel number. */
(function (root) {
  "use strict";
  const API = "https://purple-river-0717.brain-0f6.workers.dev/building-footprints/geometry";
  const PAGE_SIZE = 300;
  const MAX_PAGES = 120;
  const MAX_WARM_ATTEMPTS = 125;
  const memory = new Map();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function buildingParcelIdentity(id) {
    const raw = String(id || "").trim();
    if (!/^\d{25}$/.test(raw)) return null;
    const code = raw.slice(0, 10);
    const mountain = raw.slice(10, 11);
    const main = raw.slice(11, 15);
    const sub = raw.slice(15, 19);
    if (!/^[01]$/.test(mountain) || Number(main) < 1) return null;
    return {
      legalDongCode: code,
      platGbCd: mountain,
      parcelMainNo: String(Number(main)),
      parcelSubNo: String(Number(sub)),
      key: [code.slice(0, 5),code.slice(5),mountain,main,sub].join("|")
    };
  }
  function inside(turfApi, point, feature) {
    try { return !!turfApi.booleanPointInPolygon(turfApi.point(point), feature); }
    catch { return false; }
  }
  function pointInScope(turfApi, footprint, scope) {
    try {
      let p = turfApi.pointOnFeature(footprint).geometry.coordinates;
      if (inside(turfApi, p, scope)) return p;
      // For footprints intersecting a boundary, use the *overlap* rather than
      // assigning the building's point outside the requested parcel polygon.
      const clipped = turfApi.intersect(footprint,scope);
      if (!clipped) return null;
      p = turfApi.pointOnFeature(clipped).geometry.coordinates;
      return inside(turfApi, p, scope) ? p : null;
    } catch { return null; }
  }
  function buildParcels(features, geometry, turfApi, zipcode) {
    const scope = {type:"Feature",properties:{},geometry};
    const parcels = new Map();
    const legalCodes = new Set();
    const counters = {rawBuildingCount:0,validBuildingIdCount:0,insideBuildingCount:0};
    for (const feature of features) {
      counters.rawBuildingCount++;
      const props = feature?.properties || {};
      const id = buildingParcelIdentity(props.building_id || props.bul_man_no);
      if (!id || !["Polygon","MultiPolygon"].includes(feature?.geometry?.type)) continue;
      counters.validBuildingIdCount++;
      const point = pointInScope(turfApi,feature,scope);
      if (!point) continue;
      counters.insideBuildingCount++;
      legalCodes.add(id.legalDongCode);
      const zoneRaw = String(props.bsi_zon_no||"").replace(/\D/g,"");
      const zone = zoneRaw.length>=1 && zoneRaw.length<=5 ? zoneRaw.padStart(5,"0") : "";
      const road = [String(props.street_name||"").trim(),String(props.house_number||"").trim()].filter(Boolean).join(" ");
      const current=parcels.get(id.key);
      if (current) {
        current.hitCount += 1;
        continue;
      }
      parcels.set(id.key,{
        ...id,zonecode:zone.length===5?zone:null,
        zoneVerified:!!zipcode && zone===String(zipcode),
        interiorVerified:true,
        sourceType:"BUILDING_PARCEL",
        parcelAddress:null,
        roadAddress:road||null,
        buildingName:String(props.building_name||"").trim()||null,
        matchedAddress:road||null,
        lng:point[0],lat:point[1],
        boundaryDistanceMeters:2,
        hitCount:1
      });
    }
    return {
      parcels:[...parcels.values()],
      legalDongCodes:[...legalCodes].sort(),
      diagnostics:{
        source:"MOIS_BUILDING_GEOMETRY_DB",
        ...counters,parcelCount:parcels.size,
        // This is an exhaustive coverage-verified building geometry query,
        // NOT a point-sampling discovery. Legacy V62 backend interprets a
        // positive sampleCount as the number of sampled points and rejects
        // large polygons below a minimum of 408-500 points. Never label the
        // number of buildings as the number of samples: omit that field.
        discoveryMethod:"OFFICIAL_BUILDING_FOOTPRINT",
        sourceCoverage:"complete",
        detectedBuildingCount:counters.insideBuildingCount,
        areaM2:Math.round(Number(turfApi.area(scope)||0))
      }
    };
  }
  async function requestPage(geometry, token, offset, signal) {
    const response=await fetch(API,{
      method:"POST",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({polygon:geometry,offset,limit:PAGE_SIZE}),
      signal
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===202 || data.status==="warming") {
      return {warming:true,retryAfter:Number(data.retryAfterSeconds)||3};
    }
    if(!response.ok || data.status!=="ready" || data.coverage!=="complete" || !Array.isArray(data.features)) {
      const error=new Error(data.message||data.error||"공용 건물 외곽선 DB 조회 실패 ("+response.status+")");
      error.httpStatus=response.status;
      error.retryAfter=Number(data.retryAfterSeconds)||0;
      throw error;
    }
    return {data};
  }
  async function load(geometry,token,{turf:turfApi,zipcode="",onProgress=null}={}) {
    if(!geometry || !["Polygon","MultiPolygon"].includes(geometry.type) || !token || !turfApi) {
      throw new Error("공용 건물 분석에 폴리곤·인증 또는 지도 라이브러리가 없습니다.");
    }
    // Frontend memory cache does not duplicate the stored PostGIS raw source.
    const key=JSON.stringify(geometry);
    if(memory.has(key))return memory.get(key);
    const inFlight=(async()=>{
      const rows=new Map();
      let offset=0,warmups=0,finished=false;
      for(let page=0;page<MAX_PAGES;page++){
        let block;
        while(true){
          try{
            block=await requestPage(geometry,token,offset,AbortSignal.timeout(45000));
          }catch(error){
            // Cooldown is a source health signal, not permission to retry in a burst.
            if(error.httpStatus===503 && error.retryAfter>0 && warmups<MAX_WARM_ATTEMPTS) {
              warmups++;onProgress?.("공용 건물 데이터 대기 중");
              await pause(Math.min(10000,error.retryAfter*1000));
              continue;
            }
            throw error;
          }
          if(!block.warming)break;
          if(++warmups>MAX_WARM_ATTEMPTS)throw new Error("공용 건물 데이터 준비 시간이 초과되었습니다. 다시 조회해주세요.");
          onProgress?.("공용 건물 데이터 준비 중 · "+warmups+"회");
          await pause(Math.max(1500,Math.min(6000,block.retryAfter*1000)));
        }
        const data=block.data;
        for(const feature of data.features){
          const oid=String(feature?.properties?.objectid || feature?.id || "");
          if(oid)rows.set(oid,feature);
        }
        if(!data.hasMore){finished=true;break;}
        if(!data.features.length)throw new Error("공용 건물 데이터 페이지가 비어 있습니다.");
        offset+=data.features.length;
      }
      if(!finished)throw new Error("공용 건물 페이지 제한을 초과했습니다.");
      const parsed=buildParcels([...rows.values()],geometry,turfApi,zipcode);
      if(!parsed.parcels.length)throw new Error("공용 건물 데이터에 확인 가능한 필지가 없습니다. 기존 분석 결과를 유지합니다.");
      return parsed;
    })();
    memory.set(key,inFlight);
    try{return await inFlight;}
    catch(error){if(memory.get(key)===inFlight)memory.delete(key);throw error;}
  }
  root.MW_BUILDING_PARCEL_SOURCE={load,buildingParcelIdentity,buildParcels};
})(window);
