import json, os, re, secrets, time
from email.parser import BytesParser
from email.policy import default
import requests

ACCOUNT_ID='0f644373a9db40f2b36e4ffece348c46'
SCRIPT='purple-resonance-61ea'
API=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}'
PROBE='https://purple-resonance-61ea.brain-0f6.workers.dev/terrain'
H={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']}

def source():
 r=requests.get(API+'/content/v2',headers=H,timeout=30); r.raise_for_status()
 msg=BytesParser(policy=default).parsebytes((f'Content-Type: {r.headers["content-type"]}\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.content)
 for p in msg.iter_parts():
  if p.get_param('name',header='content-disposition')=='worker.js': return (p.get_payload(decode=True) or b'').decode()
 raise RuntimeError('worker.js missing')

def metadata():
 s=requests.get(API+'/settings',headers=H,timeout=30).json().get('result') or {}; m={'main_module':'worker.js'}
 b=[{'type':'inherit','name':x['name'],'version_id':'latest'} for x in (s.get('bindings') or []) if isinstance(x,dict) and x.get('name')]
 if b:m['bindings']=b
 for k in ('compatibility_date','compatibility_flags','placement'):
  if s.get(k) not in (None,[],{}):m[k]=s[k]
 return m

def deploy(src,md):
 f={'metadata':(None,json.dumps(md,separators=(',',':')),'application/json'),'worker.js':('worker.js',src.encode(),'application/javascript+module')}
 r=requests.put(API+'?bindings_inherit=strict',headers=H,files=f,timeout=90)
 if not r.ok: raise RuntimeError(f'deploy {r.status_code}: {r.text[:1000]}')
 return r.status_code

JS=r'''
async function decodeTerrariumRgbPng(buffer) {
  const u=new Uint8Array(buffer), dv=new DataView(buffer);
  if(u.length<24 || u[0]!==137 || u[1]!==80 || u[2]!==78 || u[3]!==71) throw httpError(502,'Invalid Terrarium PNG');
  let pos=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0; const parts=[];
  while(pos+12<=u.length){
    const len=dv.getUint32(pos); pos+=4;
    const type=String.fromCharCode(u[pos],u[pos+1],u[pos+2],u[pos+3]); pos+=4;
    if(pos+len+4>u.length) throw httpError(502,'Corrupt Terrarium PNG');
    if(type==='IHDR'){width=dv.getUint32(pos);height=dv.getUint32(pos+4);bitDepth=u[pos+8];colorType=u[pos+9];interlace=u[pos+12];}
    else if(type==='IDAT') parts.push(u.slice(pos,pos+len));
    pos+=len+4; if(type==='IEND')break;
  }
  if(bitDepth!==8 || colorType!==2 || interlace!==0 || !width || !height) throw httpError(502,`Unsupported Terrarium PNG ${bitDepth}/${colorType}/${interlace}`);
  let total=0; for(const p of parts)total+=p.length; const z=new Uint8Array(total); let off=0; for(const p of parts){z.set(p,off);off+=p.length;}
  const ds=new DecompressionStream('deflate');
  const raw=new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(ds)).arrayBuffer());
  const bpp=3,stride=width*bpp, expected=height*(stride+1); if(raw.length<expected)throw httpError(502,'Short Terrarium PNG data');
  const rgb=new Uint8Array(width*height*3); let ip=0,op=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
  for(let y=0;y<height;y++){
    const filter=raw[ip++];
    for(let x=0;x<stride;x++){
      const v=raw[ip++], a=x>=bpp?rgb[op-bpp]:0, b=y?rgb[op-stride]:0, c=(y&&x>=bpp)?rgb[op-stride-bpp]:0;
      let q;
      if(filter===0)q=v; else if(filter===1)q=(v+a)&255; else if(filter===2)q=(v+b)&255; else if(filter===3)q=(v+Math.floor((a+b)/2))&255; else if(filter===4)q=(v+paeth(a,b,c))&255; else throw httpError(502,'Unsupported PNG filter '+filter);
      rgb[op++]=q;
    }
  }
  return {width,height,rgb};
}

async function legacyTerrain(normalized) {
 const bbox=normalized?.bbox; if(!Array.isArray(bbox)||bbox.length!==4)throw httpError(502,'Terrain fallback invalid bbox');
 const [minLon,minLat,maxLon,maxLat]=bbox.map(Number); if(![minLon,minLat,maxLon,maxLat].every(Number.isFinite)||minLon>=maxLon||minLat>=maxLat)throw httpError(502,'Terrain fallback invalid bbox');
 const zoom=14,cols=11,rows=11,n=2**zoom;
 const wp=(lon,lat)=>{lat=Math.max(-85.05112878,Math.min(85.05112878,lat));const r=lat*Math.PI/180;return[(lon+180)/360*n*256,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n*256]};
 const points=[],keys=new Set();
 for(let r=0;r<rows;r++){const lat=maxLat-(maxLat-minLat)*r/(rows-1);for(let c=0;c<cols;c++){const lon=minLon+(maxLon-minLon)*c/(cols-1),[wx,wy]=wp(lon,lat);let tx=Math.floor(wx/256),ty=Math.floor(wy/256);tx=((tx%n)+n)%n;ty=Math.max(0,Math.min(n-1,ty));const px=Math.max(0,Math.min(255,Math.floor(wx-Math.floor(wx/256)*256))),py=Math.max(0,Math.min(255,Math.floor(wy-Math.floor(wy/256)*256))),key=`${tx}/${ty}`;keys.add(key);points.push({r,c,key,px,py});}}
 if(keys.size>36)throw httpError(413,'Terrain area too large for fallback');
 const tiles=new Map();
 await Promise.all([...keys].map(async key=>{const [x,y]=key.split('/'),url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;const res=await fetchWithTimeout(url,{cf:{cacheTtl:86400,cacheEverything:true}},10000);if(!res.ok)throw httpError(502,`Terrain fallback tile HTTP ${res.status}`);tiles.set(key,await decodeTerrariumRgbPng(await res.arrayBuffer()));}));
 const grid=Array.from({length:rows},()=>Array(cols).fill(null));
 for(const p of points){const t=tiles.get(p.key);if(!t||p.px>=t.width||p.py>=t.height)continue;const i=(p.py*t.width+p.px)*3,h=t.rgb[i]*256+t.rgb[i+1]+t.rgb[i+2]/256-32768;if(Number.isFinite(h)&&h>-500&&h<9000)grid[p.r][p.c]=h;}
 const vals=grid.flat().filter(Number.isFinite);if(vals.length<40)throw httpError(502,'Terrain fallback insufficient samples');const s=[...vals].sort((a,b)=>a-b),pct=p=>{const x=(s.length-1)*p,l=Math.floor(x),h=Math.ceil(x),f=x-l;return s[l]*(1-f)+s[h]*f};const mean=vals.reduce((a,b)=>a+b,0)/vals.length,variance=vals.reduce((a,v)=>a+(v-mean)**2,0)/vals.length,p10=pct(.1),p90=pct(.9);
 const mid=(minLat+maxLat)/2*Math.PI/180,dx=Math.max(1,(maxLon-minLon)*111320*Math.cos(mid)/(cols-1)),dy=Math.max(1,(maxLat-minLat)*111320/(rows-1)),sl=[];
 for(let r=1;r<rows-1;r++)for(let c=1;c<cols-1;c++){const a=grid[r][c-1],b=grid[r][c+1],u=grid[r-1][c],d=grid[r+1][c];if([a,b,u,d].every(Number.isFinite)){const gx=(b-a)/(2*dx),gy=(d-u)/(2*dy);sl.push(Math.atan(Math.hypot(gx,gy))*180/Math.PI);}}
 const ss=[...sl].sort((a,b)=>a-b),p95=ss.length?ss[Math.floor((ss.length-1)*.95)]:0,sm=sl.length?sl.reduce((a,b)=>a+b,0)/sl.length:0;let flat=0,gentle=0,steep=0;for(const x of sl){if(x<3)flat++;else if(x<10)gentle++;else steep++;}const den=sl.length||1,min=s[0],max=s[s.length-1];
 return {minElevation:min,maxElevation:max,meanElevation:mean,stdevElevation:Math.sqrt(variance),p10Elevation:p10,p90Elevation:p90,elevationRange:max-min,effectiveRange:p90-p10,sampleCount:vals.length,noDataCount:rows*cols-vals.length,resolutionMeters:Math.max(dx,dy),meanSlopeDegrees:sm,maxSlopeDegrees:p95,flatPercent:flat/den*100,gentlePercent:gentle/den*100,steepPercent:steep/den*100,slopeSampleCount:sl.length,slopeMethod:TERRAIN_SLOPE_METHOD};
}

// Mapzen Terrarium fallback. This is a surface-elevation estimate, not a surveyed DTM.
// Keep the same 5/15 degree classes as the primary terrain calculation.
const MW_TERRARIUM_SOURCE = "MAPZEN_TERRARIUM_GROUND_V3_20260925";
const MW_TERRARIUM_METHOD = "masked_low_quantile_ground_7x7_gradient_v3";

function mwTerrainQuantile(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * percentile;
  const lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] * (hi - index || 1) + (hi === lo ? 0 : sorted[hi] * (index - lo));
}

function mwTerrainRingContains(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function mwTerrainContains(point, geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  if (!polygons.length) throw httpError(400, "吏??遺꾩꽍?먮뒗 ?ㅼ젣 ?대━怨?寃쎄퀎媛 ?꾩슂?⑸땲??");
  return polygons.some(rings => mwTerrainRingContains(point, rings[0]) &&
    !rings.slice(1).some(hole => mwTerrainRingContains(point, hole)));
}

function mwTerrainMaskedStatistics(grid, dx, dy) {
  const rows = grid.length, cols = grid[0]?.length || 0;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (Number.isFinite(grid[r][c])) cells.push([r, c]);
  }
  if (cells.length < 15) throw httpError(422, "?대━怨??덉쓽 ?좏슚 ?쒓퀬 ?쒕낯??遺議깊빀?덈떎.");
  const stride = Math.max(1, Math.ceil(cells.length / 384));
  const slopes = [], ground = [];
  let candidates = 0;
  const value = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols ? grid[r][c] : null;
  for (let i = 0; i < cells.length; i += stride) {
    candidates++;
    const [r, c] = cells[i], points = [], gx = [], gy = [];
    for (let a = -3; a <= 3; a++) {
      for (let b = -3; b <= 3; b++) {
        const h = value(r + a, c + b);
        if (Number.isFinite(h)) points.push([b * dx, a * dy, h]);
      }
      // One-sided pairs are also valid near a real polygon boundary. Requiring
      // symmetric neighbors wrongly discards narrow routes and small islands.
      for (let start = -3; start <= 1; start++) for (let end = start + 2; end <= 3; end++) {
        let validX = true, validY = true;
        for (let step = start; step <= end; step++) {
          validX &&= Number.isFinite(value(r + a, c + step));
          validY &&= Number.isFinite(value(r + step, c + a));
        }
        if (validX) gx.push((value(r + a, c + end) - value(r + a, c + start)) / ((end - start) * dx));
        if (validY) gy.push((value(r + end, c + a) - value(r + start, c + a)) / ((end - start) * dy));
      }
    }
    if (points.length < 15 || gx.length < 6 || gy.length < 6) continue;
    const gradientX = mwTerrainQuantile(gx, 0.5), gradientY = mwTerrainQuantile(gy, 0.5);
    slopes.push(Math.atan(Math.hypot(gradientX, gradientY)) * 180 / Math.PI);
    ground.push(mwTerrainQuantile(points.map(([x, y, h]) => h - gradientX * x - gradientY * y), 0.35));
  }
  if (slopes.length < 8 || slopes.length / candidates < 0.5) {
    throw httpError(422, "寃쎌궗?꾨? ?먯젙???쒕낯??遺議깊빀?덈떎. ???볦? 援ъ뿭?쇰줈 議고쉶??二쇱꽭??");
  }
  const min = Math.min(...ground), max = Math.max(...ground);
  const mean = ground.reduce((a, b) => a + b, 0) / ground.length;
  const p10 = mwTerrainQuantile(ground, 0.1), p90 = mwTerrainQuantile(ground, 0.9);
  const flat = slopes.filter(x => x < TERRAIN_SLOPE_FLAT_MAX_DEGREES).length;
  const gentle = slopes.filter(x => x >= TERRAIN_SLOPE_FLAT_MAX_DEGREES && x < TERRAIN_SLOPE_GENTLE_MAX_DEGREES).length;
  return {
    minElevation: min, maxElevation: max, meanElevation: mean,
    stdevElevation: Math.sqrt(ground.reduce((sum, h) => sum + (h - mean) ** 2, 0) / ground.length),
    p10Elevation: p10, p90Elevation: p90, elevationRange: max - min, effectiveRange: p90 - p10,
    sampleCount: cells.length, noDataCount: 0, resolutionMeters: Math.max(dx, dy),
    meanSlopeDegrees: slopes.reduce((a, b) => a + b, 0) / slopes.length,
    maxSlopeDegrees: mwTerrainQuantile(slopes, 0.95),
    flatPercent: flat / slopes.length * 100, gentlePercent: gentle / slopes.length * 100,
    steepPercent: (slopes.length - flat - gentle) / slopes.length * 100,
    slopeSampleCount: slopes.length, slopeMethod: MW_TERRARIUM_METHOD, source: MW_TERRARIUM_SOURCE,
    estimated: true, sampleCoverage: slopes.length / candidates,
  };
}

async function requestAwsTerrariumTerrainStatistics(normalized) {
  const bbox = normalized?.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) throw httpError(400, "Invalid terrain bbox");
  // The primary Process API payload already contains the normalized Polygon or
  // MultiPolygon, including holes. Never silently substitute its bounding box.
  const geometry = buildCopernicusProcessPayload(normalized)?.input?.bounds?.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw httpError(400, "吏??遺꾩꽍 ?대━怨?寃쎄퀎瑜??뺤씤?????놁뒿?덈떎.");
  }
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite) || minLon >= maxLon || minLat >= maxLat) {
    throw httpError(400, "Invalid terrain bbox");
  }
  const mid = (minLat + maxLat) / 2 * Math.PI / 180;
  const width = (maxLon - minLon) * 111320 * Math.cos(mid), height = (maxLat - minLat) * 111320;
  const cols = Math.max(1, Math.ceil(width / 30)), rows = Math.max(1, Math.ceil(height / 30));
  if (cols * rows > 200000) throw httpError(413, "吏??遺꾩꽍 援ъ뿭???덈Т ?쎈땲??");
  const dx = width / cols, dy = height / rows, zoom = 14, n = 2 ** zoom;
  const points = [], keys = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lon = minLon + (maxLon - minLon) * (c + 0.5) / cols;
    const lat = maxLat - (maxLat - minLat) * (r + 0.5) / rows;
    if (!mwTerrainContains([lon, lat], geometry)) continue;
    const rad = lat * Math.PI / 180;
    const wx = (lon + 180) / 360 * n * 256;
    const wy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * 256;
    const tx = Math.floor(wx / 256), ty = Math.floor(wy / 256), key = `${tx}/${ty}`;
    keys.add(key);
    points.push({ r, c, key, px: Math.floor(wx - tx * 256), py: Math.floor(wy - ty * 256) });
  }
  if (keys.size > 36) throw httpError(413, "吏??遺꾩꽍 援ъ뿭???덈Т ?쎈땲??");
  const tiles = new Map(), pending = [...keys];
  const consume = async () => {
    while (pending.length) {
      const key = pending.shift();
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${key}.png`;
      const response = await fetchWithTimeout(url, { cf: { cacheTtl: 86400, cacheEverything: true } }, 10000);
      if (!response.ok) throw httpError(502, `Terrain fallback tile HTTP ${response.status}`);
      tiles.set(key, await decodeTerrariumRgbPng(await response.arrayBuffer()));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, consume));
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  let noDataCount = 0;
  for (const point of points) {
    const tile = tiles.get(point.key);
    const i = (point.py * tile.width + point.px) * 3;
    const h = tile.rgb[i] * 256 + tile.rgb[i + 1] + tile.rgb[i + 2] / 256 - 32768;
    if (Number.isFinite(h) && h > -500 && h < 9000) grid[point.r][point.c] = h;
    else noDataCount++;
  }
  const smoothedGrid = grid.map(row => row.slice());
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < (grid[0]?.length || 0); c++) {
    if (!Number.isFinite(grid[r][c])) continue;
    const neighborhood = [];
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const h = grid[r + a]?.[c + b];
      if (Number.isFinite(h)) neighborhood.push(h);
    }
    if (neighborhood.length >= 8) smoothedGrid[r][c] = mwTerrainQuantile(neighborhood, 0.2);
  }
  return { ...mwTerrainMaskedStatistics(smoothedGrid, dx, dy), noDataCount };
}
'''

def _function_end(src, start):
 brace=src.find('{',start)
 if brace < 0: raise RuntimeError('function body missing')
 depth=0; quote=None; esc=False; i=brace
 while i < len(src):
  ch=src[i]
  if quote:
   if esc: esc=False
   elif ch=='\\': esc=True
   elif ch==quote: quote=None
  elif ch in ("'", '"', '`'): quote=ch
  elif ch=='{': depth+=1
  elif ch=='}':
   depth-=1
   if depth==0:return i+1
  i+=1
 raise RuntimeError('function end missing')

def patch(src):
 decoder=src.find('async function decodeTerrariumRgbPng')
 terrain=src.find('async function requestAwsTerrariumTerrainStatistics')
 if terrain >= 0:
  start=decoder if decoder >= 0 and decoder < terrain else terrain
  end=_function_end(src,terrain)
  src=src[:start]+JS+'\n'+src[end:]
 else:
  src=JS+'\n'+src
 # V3 is now the primary ground estimator, not only a Copernicus 403 fallback.
 src=src.replace(
  'const COPERNICUS_TERRAIN_SOURCE = "COPERNICUS_30_TERRAIN_V37_2026-08-09";',
  'const COPERNICUS_TERRAIN_SOURCE = "MAPZEN_TERRARIUM_GROUND_V3_20260925";'
 )
 src=src.replace(
  'const TERRAIN_SLOPE_METHOD = "robust_symmetric_gradient_7x7_cpu_v3";',
  'const TERRAIN_SLOPE_METHOD = "masked_low_quantile_ground_7x7_gradient_v3";'
 )
 cop=src.find('async function requestCopernicusTerrainStatistics')
 if cop < 0: raise RuntimeError('Copernicus terrain function missing')
 cop_end=_function_end(src,cop)
 wrapper='async function requestCopernicusTerrainStatistics(env, normalized) {\n  return await requestAwsTerrariumTerrainStatistics(normalized);\n}'
 src=src[:cop]+wrapper+src[cop_end:]
 return src

def probe_src(src,nonce):
 m=re.search(r'async\s+function\s+handleTerrainRequest\s*\(\s*request\s*,\s*env\s*\)\s*\{',src)
 if not m:raise RuntimeError('terrain handler missing')
 geom='{"type":"Polygon","coordinates":[[[126.88,37.42],[126.94,37.42],[126.94,37.47],[126.88,37.47],[126.88,37.42]]]}'
 x='\n  if(request.headers.get("x-mw-aws-terrain-probe")==='+json.dumps(nonce)+'){const s=await requestAwsTerrariumTerrainStatistics({bbox:[126.88,37.42,126.94,37.47],geometry:'+geom+'});return new Response(JSON.stringify(s),{headers:{"content-type":"application/json"}});}'
 return src[:m.end()]+x+src[m.end():]

def main():
 orig=source(); md=metadata(); final=patch(orig); nonce=secrets.token_urlsafe(24); temp=probe_src(final,nonce); active=False
 try:
  print('temp_deploy=',deploy(temp,md),flush=True);active=True;time.sleep(3)
  r=requests.post(PROBE,headers={'x-mw-aws-terrain-probe':nonce,'content-type':'application/json'},data='{}',timeout=60);print('probe_http=',r.status_code,flush=True);print('probe_body=',r.text[:1800],flush=True);r.raise_for_status();d=r.json()
  if d.get('sampleCount',0)<40 or not (-500<d.get('minElevation',-9999)<2000) or not (d.get('maxElevation',9999)<3000):raise RuntimeError('implausible fallback result')
  print('probe_ok=',json.dumps({k:d[k] for k in ['minElevation','maxElevation','elevationRange','sampleCount','meanSlopeDegrees']}),flush=True)
  print('final_deploy=',deploy(final,md),flush=True);active=False
 finally:
  if active:print('restore=',deploy(orig,md),flush=True)

if __name__=='__main__':main()
