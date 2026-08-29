import json
import math
import os
import re
import secrets
import time
from email.parser import BytesParser
from email.policy import default

import requests

ACCOUNT_ID = "0f644373a9db40f2b36e4ffece348c46"
SCRIPT = "purple-resonance-61ea"
WORKERS_DEV = "https://purple-resonance-61ea.brain-0f6.workers.dev/terrain"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}"
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def live_worker():
    r = requests.get(API + "/content/v2", headers=HEADERS, timeout=30)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "")
    msg = BytesParser(policy=default).parsebytes(
        (f"Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n").encode() + r.content
    )
    for p in msg.iter_parts():
        if p.get_param("name", header="content-disposition") == "worker.js":
            return (p.get_payload(decode=True) or b"").decode("utf-8")
    raise RuntimeError("worker.js not found")


def metadata():
    r = requests.get(API + "/settings", headers=HEADERS, timeout=30)
    r.raise_for_status()
    s = r.json().get("result") or {}
    md = {"main_module": "worker.js"}
    bindings = []
    for b in s.get("bindings") or []:
        if isinstance(b, dict) and b.get("name"):
            bindings.append({"type": "inherit", "name": b["name"], "version_id": "latest"})
    if bindings:
        md["bindings"] = bindings
    for k in ("compatibility_date", "compatibility_flags", "placement"):
        if s.get(k) not in (None, [], {}):
            md[k] = s[k]
    return md


def deploy(source, md):
    files = {
        "metadata": (None, json.dumps(md, separators=(",", ":")), "application/json"),
        "worker.js": ("worker.js", source.encode(), "application/javascript+module"),
    }
    r = requests.put(API + "?bindings_inherit=strict", headers=HEADERS, files=files, timeout=90)
    if not r.ok:
        raise RuntimeError(f"deploy failed {r.status_code}: {r.text[:1200]}")
    return r.status_code


FALLBACK_JS = r'''
// Maroowell terrain emergency fallback: AWS Open Data / Mapzen Terrarium.
// Used only when CDSE Sentinel Hub authenticates but rejects Process API with 403.
async function requestAwsTerrariumTerrainStatistics(normalized) {
  const bbox = normalized?.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) throw httpError(502, "Terrain fallback received an invalid bbox");
  const minLon = Number(bbox[0]), minLat = Number(bbox[1]), maxLon = Number(bbox[2]), maxLat = Number(bbox[3]);
  if (![minLon,minLat,maxLon,maxLat].every(Number.isFinite) || minLon >= maxLon || minLat >= maxLat) {
    throw httpError(502, "Terrain fallback received an invalid bbox");
  }

  const zoom = 14;
  const cols = 11;
  const rows = 11;
  const n = 2 ** zoom;
  const clampLat = (lat) => Math.max(-85.05112878, Math.min(85.05112878, lat));
  const worldPixel = (lon, lat) => {
    const x = (lon + 180) / 360 * n * 256;
    const r = clampLat(lat) * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * 256;
    return [x, y];
  };

  const points = [];
  const tileKeys = new Set();
  for (let row = 0; row < rows; row++) {
    const lat = maxLat - (maxLat - minLat) * row / (rows - 1);
    for (let col = 0; col < cols; col++) {
      const lon = minLon + (maxLon - minLon) * col / (cols - 1);
      const [wx, wy] = worldPixel(lon, lat);
      let tx = Math.floor(wx / 256);
      let ty = Math.floor(wy / 256);
      tx = ((tx % n) + n) % n;
      ty = Math.max(0, Math.min(n - 1, ty));
      const px = Math.max(0, Math.min(255, Math.floor(wx - Math.floor(wx / 256) * 256)));
      const py = Math.max(0, Math.min(255, Math.floor(wy - Math.floor(wy / 256) * 256)));
      const key = `${tx}/${ty}`;
      tileKeys.add(key);
      points.push({ row, col, key, px, py });
    }
  }

  // Normal postcode/route polygons touch only a few z14 tiles. Guard pathological requests.
  if (tileKeys.size > 36) throw httpError(413, "Terrain area is too large for fallback sampling");

  const tileMap = new Map();
  await Promise.all([...tileKeys].map(async (key) => {
    const [x, y] = key.split("/");
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
    const res = await fetchWithTimeout(url, { cf: { cacheTtl: 86400, cacheEverything: true } }, 10000);
    if (!res.ok) throw httpError(502, `Terrain fallback tile failed: HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("image/png")) throw httpError(502, `Terrain fallback tile returned ${ct || "unknown content type"}`);
    const png = await decodeTerrainPng(await res.arrayBuffer());
    tileMap.set(key, png);
  }));

  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const p of points) {
    const png = tileMap.get(p.key);
    if (!png || p.px >= png.width || p.py >= png.height) continue;
    const i = (p.py * png.width + p.px) * 4;
    const r = png.rgba[i], g = png.rgba[i + 1], b = png.rgba[i + 2], a = png.rgba[i + 3];
    if (a === 0) continue;
    const h = r * 256 + g + b / 256 - 32768;
    if (!Number.isFinite(h) || h < -500 || h > 9000) continue;
    grid[p.row][p.col] = h;
  }

  const values = grid.flat().filter(Number.isFinite);
  if (values.length < Math.max(12, Math.floor(rows * cols * 0.35))) {
    throw httpError(502, "Terrain fallback did not return enough valid elevation samples");
  }
  const sorted = [...values].sort((a,b) => a-b);
  const percentile = (p) => {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    const f = pos - lo;
    return sorted[lo] * (1 - f) + sorted[hi] * f;
  };
  const mean = values.reduce((a,b) => a+b, 0) / values.length;
  const variance = values.reduce((s,v) => s + (v - mean) ** 2, 0) / values.length;
  const p10 = percentile(0.10), p90 = percentile(0.90);

  const midLat = (minLat + maxLat) / 2 * Math.PI / 180;
  const dx = Math.max(1, (maxLon - minLon) * 111320 * Math.cos(midLat) / (cols - 1));
  const dy = Math.max(1, (maxLat - minLat) * 111320 / (rows - 1));
  const slopes = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const left=grid[r][c-1], right=grid[r][c+1], up=grid[r-1][c], down=grid[r+1][c];
      if (![left,right,up,down].every(Number.isFinite)) continue;
      const dzdx = (right - left) / (2 * dx);
      const dzdy = (down - up) / (2 * dy);
      slopes.push(Math.atan(Math.sqrt(dzdx*dzdx + dzdy*dzdy)) * 180 / Math.PI);
    }
  }
  const slopeSorted = [...slopes].sort((a,b)=>a-b);
  const slopeP95 = slopeSorted.length ? slopeSorted[Math.min(slopeSorted.length - 1, Math.floor((slopeSorted.length - 1) * 0.95))] : 0;
  const slopeMean = slopes.length ? slopes.reduce((a,b)=>a+b,0)/slopes.length : 0;
  let flat=0, gentle=0, steep=0;
  for (const s of slopes) {
    if (s < 3) flat++;
    else if (s < 10) gentle++;
    else steep++;
  }
  const denom = slopes.length || 1;
  const minElevation = sorted[0], maxElevation = sorted[sorted.length-1];
  return {
    minElevation,
    maxElevation,
    meanElevation: mean,
    stdevElevation: Math.sqrt(variance),
    p10Elevation: p10,
    p90Elevation: p90,
    elevationRange: maxElevation - minElevation,
    effectiveRange: p90 - p10,
    sampleCount: values.length,
    noDataCount: rows * cols - values.length,
    resolutionMeters: Math.max(dx, dy),
    meanSlopeDegrees: slopeMean,
    maxSlopeDegrees: slopeP95,
    flatPercent: flat / denom * 100,
    gentlePercent: gentle / denom * 100,
    steepPercent: steep / denom * 100,
    slopeSampleCount: slopes.length,
    slopeMethod: TERRAIN_SLOPE_METHOD,
  };
}
'''


def make_final(source):
    if "requestAwsTerrariumTerrainStatistics" in source:
        return source
    source = FALLBACK_JS + "\n" + source
    needle = '''    if (res.status === 401 && attempt === 0) {
      copernicusTokenCache = { accessToken: "", expiresAt: 0 };
      continue;
    }

    if (!res.ok) {'''
    replacement = '''    if (res.status === 401 && attempt === 0) {
      copernicusTokenCache = { accessToken: "", expiresAt: 0 };
      continue;
    }

    if (res.status === 403) {
      // OAuth is valid but Sentinel Hub Process permission/quota is unavailable.
      // Keep postcode terrain working from the public AWS Terrarium dataset.
      return await requestAwsTerrariumTerrainStatistics(normalized);
    }

    if (!res.ok) {'''
    if needle not in source:
        raise RuntimeError("Copernicus response block not found")
    return source.replace(needle, replacement, 1)


def add_probe(final_source, nonce):
    pattern = r"async\s+function\s+handleTerrainRequest\s*\(\s*request\s*,\s*env\s*\)\s*\{"
    m = re.search(pattern, final_source)
    if not m:
        raise RuntimeError("handleTerrainRequest not found")
    injected = (
        "\n  if (request.headers.get(\"x-mw-terrain-fallback-probe\") === "
        + json.dumps(nonce)
        + ") {\n"
        + "    const stats = await requestAwsTerrariumTerrainStatistics({ bbox: [126.88, 37.42, 126.94, 37.47] });\n"
        + "    return new Response(JSON.stringify(stats), { headers: { \"content-type\": \"application/json\", \"cache-control\": \"no-store\" } });\n"
        + "  }"
    )
    return final_source[:m.end()] + injected + final_source[m.end():]


def validate_stats(text):
    data = json.loads(text)
    required = ["minElevation", "maxElevation", "meanElevation", "elevationRange", "sampleCount", "meanSlopeDegrees"]
    if not all(k in data for k in required):
        raise RuntimeError("fallback probe missing statistics: " + text[:1000])
    if not (0 < float(data["sampleCount"]) <= 121):
        raise RuntimeError("invalid sample count")
    if not (-500 < float(data["minElevation"]) < 2000 and -500 < float(data["maxElevation"]) < 3000):
        raise RuntimeError("implausible Korea elevation result")
    return data


def main():
    original = live_worker()
    md = metadata()
    final = make_final(original)
    nonce = secrets.token_urlsafe(24)
    temp = add_probe(final, nonce)
    temp_deployed = False
    try:
        print("temporary_deploy_http=", deploy(temp, md), flush=True)
        temp_deployed = True
        time.sleep(3)
        r = requests.post(WORKERS_DEV, headers={"x-mw-terrain-fallback-probe": nonce, "content-type": "application/json"}, data="{}", timeout=60)
        print("fallback_probe_http=", r.status_code, flush=True)
        print("fallback_probe_body=", r.text[:2000], flush=True)
        if not r.ok:
            raise RuntimeError(f"fallback probe HTTP {r.status_code}")
        stats = validate_stats(r.text)
        print("fallback_probe_ok=", json.dumps({k: stats[k] for k in ("minElevation","maxElevation","elevationRange","sampleCount","meanSlopeDegrees")}), flush=True)
        print("final_deploy_http=", deploy(final, md), flush=True)
        temp_deployed = False
    finally:
        if temp_deployed:
            print("restore_http=", deploy(original, md), flush=True)


if __name__ == "__main__":
    main()
