// Shared GeoJSON building source cache API.
// Authorization is delegated to the existing API-key gate in worker.js.
const SOURCE_URL = "https://portal.esrikr.com/arcgis/rest/services/MOIS_KR_Buildings_v2/FeatureServer/0/query";
const SOURCE_PAGE_SIZE = 200;
const MAX_SOURCE_RECORDS = 6000;
const MAX_PAGES_PER_REQUEST = 2;
const TILE_DEGREES = 0.01;
const MAX_TILES = 36;
const DEFAULT_PAGE_SIZE = 200;

function invalid(message) { const e = new Error(message); e.status = 400; return e; }
function dependency(message) { const e = new Error(message); e.status = 503; return e; }
function safeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("JSON object required");
  return body;
}
function validPage(value, fallback, max) {
  const n = value == null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < (fallback === 0 ? 0 : 1) || n > max) throw invalid("Invalid pagination");
  return n;
}
function collectGeometry(data) {
  const geometry = data?.type === "Feature" ? data.geometry : data;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) throw invalid("Polygon or MultiPolygon required");
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 20) throw invalid("Invalid polygon parts");
  const all = [];
  let vertices = 0;
  for (const poly of polygons) {
    if (!Array.isArray(poly) || !poly.length || poly.length > 16) throw invalid("Invalid polygon rings");
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) throw invalid("Invalid polygon ring");
      const first = ring[0], last = ring[ring.length - 1];
      if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) throw invalid("Polygon rings must be closed");
      vertices += ring.length;
      if (vertices > 5000) throw invalid("Polygon is too detailed; simplify to 5,000 vertices");
      for (const xy of ring) {
        if (!Array.isArray(xy) || xy.length < 2 || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1]) ||
            xy[0] < 124 || xy[0] > 132 || xy[1] < 33 || xy[1] > 39.5) throw invalid("Polygon coordinates must be WGS84 lon/lat within South Korea");
        all.push(xy);
      }
    }
  }
  const lngs = all.map(x => x[0]), lats = all.map(x => x[1]);
  const bbox = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  if (bbox[0] === bbox[2] || bbox[1] === bbox[3]) throw invalid("Polygon has zero width or height");
  if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.0036) throw invalid("Polygon bbox is too large for one request");
  return { geometry, bbox };
}
function keysForBbox(bounds) {
  // Include both boundary tiles; source IDs are deduplicated in PostGIS.
  const [w,s,e,n] = bounds;
  const cells = [];
  for (let x=Math.floor(w*100); x<=Math.floor(e*100); x++) {
    for (let y=Math.floor(s*100); y<=Math.floor(n*100); y++) {
      const key = "tile:"+x+":"+y;
      cells.push({ key, bbox:[x/100,y/100,(x+1)/100,(y+1)/100] });
      if (cells.length > MAX_TILES) throw invalid("Polygon spans over 36 cache tiles; split larger routes into smaller polygons");
    }
  }
  return cells;
}
function responseJson(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json;charset=utf-8",...headers}});
}
async function rpc(database,env,func,body) {
  return database(env,"/rest/v1/rpc/"+func,{method:"POST",body:JSON.stringify(body)});
}
async function cacheStates(database,env,tiles) {
  const keyList = tiles.map(t=>'"'+t.key+'"').join(",");
  const q = new URLSearchParams({ select:"cache_key,state,expires_at,locked_until,retry_after,source_count,next_offset",cache_key:"in.("+keyList+")",limit:"100" });
  const rows = await database(env,"/rest/v1/mw_geo_cache_coverage?"+q.toString(),{method:"GET"});
  const indexed = new Map((Array.isArray(rows)?rows:[]).map(r=>[r.cache_key,r]));
  const now = Date.now();
  const ready = r=>r && r.state==="ready" && Number.isFinite(Date.parse(r.expires_at)) && Date.parse(r.expires_at)>now;
  return { rows:indexed, pending:tiles.filter(t=>!ready(indexed.get(t.key))) };
}
async function sourcePage(tile,offset) {
  const u = new URL(SOURCE_URL);
  const options = {
    f:"geojson",where:"1=1",outFields:"objectid,bul_man_no,building_id,building_name,buld_nm_dc,street_name,house_number,bsi_zon_no",
    outSR:"4326",orderByFields:"objectid ASC",resultOffset:String(offset),resultRecordCount:String(SOURCE_PAGE_SIZE)
  };
  if (tile.key.startsWith("zip:")) options.where="bsi_zon_no = '"+tile.key.slice(4)+"'";
  else {
    options.geometry=tile.bbox.join(",");
    options.geometryType="esriGeometryEnvelope";
    options.inSR="4326";
    options.spatialRel="esriSpatialRelIntersects";
  }
  for (const [k,v] of Object.entries(options))u.searchParams.set(k,v);
  const r = await fetch(u,{headers:{Accept:"application/geo+json,application/json"},signal:AbortSignal.timeout(25000)});
  if (!r.ok) throw dependency("Building source HTTP "+r.status);
  let data;
  try{data=await r.json();}catch{throw dependency("Building source returned invalid JSON");}
  if(data?.error || data?.type!=="FeatureCollection" || !Array.isArray(data.features))throw dependency("Building source returned an invalid feature page");
  if(data.features.length>SOURCE_PAGE_SIZE)throw dependency("Building source exceeded requested page size");
  return data;
}
async function fillTile(database,env,tile) {
  const claimed = await rpc(database,env,"mw_geo_claim",{p_key:tile.key,p_bounds:{bbox:tile.bbox||null}});
  if(claimed!==true)return {claimed:false};
  const q = new URLSearchParams({select:"next_offset,source_count",cache_key:"eq."+tile.key,limit:"1"});
  const rows=await database(env,"/rest/v1/mw_geo_cache_coverage?"+q.toString(),{method:"GET"});
  let offset=Math.max(0,Number(rows?.[0]?.next_offset || 0));
  let count=offset;
  try {
    for(let pages=0;pages<MAX_PAGES_PER_REQUEST;pages++){
      const page=await sourcePage(tile,offset);
      const countThis=page.features.length;
      if(countThis){
        await rpc(database,env,"mw_geo_upsert",{p_features:page.features});
        count+=countThis;
        offset+=countThis;
      }
      if(count>MAX_SOURCE_RECORDS) throw dependency("Building source count exceeds 6000 for one cache unit");
      if(!countThis || (countThis<SOURCE_PAGE_SIZE && !page.exceededTransferLimit)){
        const ok=await rpc(database,env,"mw_geo_finish",{p_key:tile.key,p_success:true,p_count:count,p_error:null});
        if(ok!==true)throw dependency("Cache lease expired while marking ready");
        return {claimed:true,count,complete:true};
      }
    }
    const saved=await rpc(database,env,"mw_geo_progress",{p_key:tile.key,p_next_offset:offset});
    if(saved!==true)throw dependency("Cache lease expired while saving source page checkpoint");
    return {claimed:true,count,complete:false};
  }catch(error){
    await rpc(database,env,"mw_geo_finish",{p_key:tile.key,p_success:false,p_count:count,p_error:String(error?.message||error)}).catch(()=>{});
    throw error;
  }
}
async function featureResult(database,env,polygon,zipcode,offset,limit) {
  return rpc(database,env,"mw_geo_query",{p_polygon:polygon||null,p_zipcode:zipcode||null,p_offset:offset,p_limit:limit});
}
export async function handleGeoBuildingsApi({request,url,env,database,key,audit}) {
  const path=url.pathname;
  const zipRequest=path==="/api/v1/buildings" && request.method==="GET";
  const polygonRequest=path==="/api/v1/buildings/query" && request.method==="POST";
  const routeRequest=path==="/api/v1/buildings/route" && request.method==="GET";
  if(!zipRequest&&!polygonRequest&&!routeRequest)return responseJson({error:"Method Not Allowed"},405);

  let zipcode=null,polygon=null,tiles,scopeType=null,scopePk=null,scopeGeometry=null;
  let offset,limit;
  if(zipRequest){
    zipcode=String(url.searchParams.get("zipcode")||"").trim();
    if(!/^\d{5}$/.test(zipcode))throw invalid("zipcode must be five digits");
    offset=validPage(url.searchParams.get("offset"),0,100000);
    limit=validPage(url.searchParams.get("limit"),DEFAULT_PAGE_SIZE,300);
    tiles=[{key:"zip:"+zipcode,bbox:null}];
    scopeType="zipcode";scopePk=zipcode;scopeGeometry=zipcode;
  }else if(routeRequest){
    const routeId=Number(url.searchParams.get("route_id") || "");
    if(!Number.isSafeInteger(routeId) || routeId<1) throw invalid("Positive integer route_id required");
    offset=validPage(url.searchParams.get("offset"),0,100000);
    limit=validPage(url.searchParams.get("limit"),DEFAULT_PAGE_SIZE,300);
    const rows=await database(env,"/rest/v1/subsubroutes?id=eq."+routeId+"&select=id,polygon_wgs84&limit=1",{method:"GET"});
    const raw=Array.isArray(rows)&&rows.length?rows[0]?.polygon_wgs84:null;
    if(!raw)throw invalid("Route polygon not found");
    const candidate=raw?.type?raw:{type:"Polygon",coordinates:raw};
    const info=collectGeometry(candidate);
    polygon=info.geometry;
    tiles=keysForBbox(info.bbox);
    scopeType="subsubroute";scopePk=String(routeId);scopeGeometry=polygon;
  }else{
    if(Number(request.headers.get("content-length")||0)>150000)throw invalid("Request body exceeds 150KB");
    const raw=await request.text();
    if(raw.length>150000)throw invalid("Request body exceeds 150KB");
    let body;
    try{body=safeBody(JSON.parse(raw));}catch(e){if(e?.status)throw e;throw invalid("Invalid JSON");}
    offset=validPage(body.offset,0,100000);
    limit=validPage(body.limit,DEFAULT_PAGE_SIZE,300);
    const info=collectGeometry(body.polygon);
    polygon=info.geometry;
    tiles=keysForBbox(info.bbox);
  }
  const status=await cacheStates(database,env,tiles);
  if(status.pending.length){
    const chosen=status.pending.find(t=>{
      const row=status.rows.get(t.key),now=Date.now();
      return !row ||
        (!(row.locked_until&&Date.parse(row.locked_until)>now) &&
         !(row.retry_after&&Date.parse(row.retry_after)>now));
    });
    if(chosen){
      try{await fillTile(database,env,chosen);}catch(e){
        const response=responseJson({ok:false,status:"source_error",error:"Building source temporarily unavailable",message:String(e?.message||e),retryAfterSeconds:120},503,{"Retry-After":"120","Cache-Control":"no-store"});
        audit?.(env,key,"buildings","cache_error",request,503,chosen.key).catch(()=>{});
        return response;
      }
    }
    const refreshed=await cacheStates(database,env,tiles);
    if(refreshed.pending.length){
      const retryTimes=refreshed.pending.map(t=>{
        const timestamp=Date.parse(refreshed.rows.get(t.key)?.retry_after || "");
        return Number.isFinite(timestamp) ? timestamp-Date.now() : 0;
      }).filter(ms=>ms>0);
      if(retryTimes.length===refreshed.pending.length){
        const wait=Math.max(2,Math.min(120,Math.ceil(Math.min(...retryTimes)/1000)));
        return responseJson({ok:false,status:"source_cooldown",retryAfterSeconds:wait,pendingTiles:refreshed.pending.length},503,{"Retry-After":String(wait),"Cache-Control":"no-store"});
      }
      const response=responseJson({
        ok:true,status:"warming",cache:"postgres_postgis",pendingTiles:refreshed.pending.length,
        readyTiles:tiles.length-refreshed.pending.length, totalTiles:tiles.length,
        retryAfterSeconds:3
      },202,{"Retry-After":"3","Cache-Control":"no-store"});
      audit?.(env,key,"buildings","warming",request,202,zipcode||"polygon").catch(()=>{});
      return response;
    }
  }
  const result=await featureResult(database,env,polygon,zipcode,offset,limit);
  // This identity map is metadata only. The actual persisted building geometry is
  // shared by source ID + geographic tile, independent of a mutable route number.
  if(scopeType && scopePk && globalThis.crypto?.subtle){
    const bytes=new TextEncoder().encode(typeof scopeGeometry==="string"?scopeGeometry:JSON.stringify(scopeGeometry));
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
    try {
      await rpc(database,env,"mw_geo_link_scope",{p_type:scopeType,p_pk:scopePk,p_hash:hex,p_count:result.total});
    } catch (error) {
      // Building results remain valid even if the optional PK-to-geometry metadata link fails.
      console.warn("mw_geo_link_scope failed", String(error?.message||error));
    }
  }
  if(!result||!Array.isArray(result.features))throw dependency("Building cache query failed");
  const response=responseJson({...result,ok:true,status:"ready",coverage:"complete",cachedAt:"postgres",tileCount:tiles.length},200,{"Cache-Control":"private, max-age=60"});
  audit?.(env,key,"buildings","read",request,200,zipcode||"polygon",{count:result.features.length,total:result.total}).catch(()=>{});
  return response;
}
export const geoBuildingInternals={collectGeometry,keysForBbox,sourcePage};
