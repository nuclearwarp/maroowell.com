import json
import os
import re
import secrets
import sys
import time
from email.parser import BytesParser
from email.policy import default

import requests

ACCOUNT_ID = "0f644373a9db40f2b36e4ffece348c46"
SCRIPT = "purple-resonance-61ea"
PROBE_URL = "https://purple-resonance-61ea.brain-0f6.workers.dev/terrain"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT}"
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def get_live_worker():
    r = requests.get(API + "/content/v2", headers=HEADERS, timeout=30)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "")
    if not ctype:
        raise RuntimeError("worker content-type missing")
    msg = BytesParser(policy=default).parsebytes(
        (f"Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n").encode() + r.content
    )
    source = None
    for part in msg.iter_parts():
        if part.get_param("name", header="content-disposition") == "worker.js":
            source = (part.get_payload(decode=True) or b"").decode("utf-8")
            break
    if source is None:
        raise RuntimeError("worker.js part not found")
    return source


def get_metadata():
    r = requests.get(API + "/settings", headers=HEADERS, timeout=30)
    r.raise_for_status()
    settings = r.json().get("result") or {}
    md = {"main_module": "worker.js"}
    bindings = []
    for b in settings.get("bindings") or []:
        if isinstance(b, dict) and b.get("name"):
            bindings.append({"type": "inherit", "name": b["name"], "version_id": "latest"})
    if bindings:
        md["bindings"] = bindings
    for k in ("compatibility_date", "compatibility_flags", "placement"):
        value = settings.get(k)
        if value not in (None, [], {}):
            md[k] = value
    return md


def deploy(source, metadata):
    files = {
        "metadata": (None, json.dumps(metadata, separators=(",", ":")), "application/json"),
        "worker.js": ("worker.js", source.encode("utf-8"), "application/javascript+module"),
    }
    r = requests.put(API + "?bindings_inherit=strict", headers=HEADERS, files=files, timeout=60)
    if not r.ok:
        raise RuntimeError(f"deploy failed {r.status_code}: {r.text[:800]}")
    return r.status_code


PROBE_HELPER = r'''
async function __mwCopProbe(env) {
  const out = { token: {}, config: {}, process: {} };
  try {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", String(env.COPERNICUS_CLIENT_ID || ""));
    form.set("client_secret", String(env.COPERNICUS_CLIENT_SECRET || ""));
    const tr = await fetch("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: form.toString(),
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    const tt = await tr.text().catch(() => "");
    let td = null;
    try { td = tt ? JSON.parse(tt) : null; } catch {}
    out.token.status = tr.status;
    out.token.ok = tr.ok;
    if (!tr.ok || !td?.access_token) {
      out.token.error = String(td?.error_description || td?.error || tt || "token failed").slice(0, 500);
      return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    const token = String(td.access_token);
    try {
      const p = token.split(".")[1] || "";
      const s = p.replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(s + "=".repeat((4 - s.length % 4) % 4)));
      out.token.aud = claims.aud || null;
      out.token.azp = claims.azp || null;
      out.token.scope = claims.scope || null;
      out.token.roles = claims?.realm_access?.roles || null;
    } catch (e) {
      out.token.claimError = String(e?.message || e);
    }
    const cr = await fetch("https://sh.dataspace.copernicus.eu/configuration/v1/wms/instances", {
      headers: { Authorization: `Bearer ${token}` },
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    const cb = await cr.text().catch(() => "");
    out.config = { status: cr.status, ok: cr.ok, body: cr.ok ? "" : cb.slice(0, 500) };

    const payload = {
      input: {
        bounds: {
          bbox: [126.97, 37.55, 126.98, 37.56],
          properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" }
        },
        data: [{
          type: "dem",
          dataFilter: { demInstance: "COPERNICUS_30" },
          processing: { upsampling: "BILINEAR", downsampling: "BILINEAR" }
        }]
      },
      output: {
        width: 8,
        height: 8,
        responses: [{ identifier: "default", format: { type: "image/png" } }]
      },
      evalscript: "//VERSION=3\nfunction setup(){return {input:[\"DEM\"],output:{bands:1}}}\nfunction evaluatePixel(s){return [s.DEM/1000]}"
    };
    const pr = await fetch("https://sh.dataspace.copernicus.eu/process/v1", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    if (pr.ok) {
      const ab = await pr.arrayBuffer();
      out.process = { status: pr.status, ok: true, bytes: ab.byteLength, contentType: pr.headers.get("content-type") || "" };
    } else {
      const pb = await pr.text().catch(() => "");
      out.process = { status: pr.status, ok: false, body: pb.slice(0, 800), contentType: pr.headers.get("content-type") || "" };
    }
  } catch (e) {
    out.runtimeError = String(e?.stack || e?.message || e).slice(0, 1200);
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
'''


def build_probe(source, nonce):
    marker = "async function handleTerrainRequest(request, env) {\n  await verifySupabaseUserByJwt(request, env);"
    if marker not in source:
        raise RuntimeError("handleTerrainRequest marker not found")
    replacement = (
        "async function handleTerrainRequest(request, env) {\n"
        f"  if (request.headers.get(\"x-mw-cop-probe\") === {json.dumps(nonce)}) return await __mwCopProbe(env);\n"
        "  await verifySupabaseUserByJwt(request, env);"
    )
    return PROBE_HELPER + "\n" + source.replace(marker, replacement, 1)


def main():
    original = get_live_worker()
    metadata = get_metadata()
    nonce = secrets.token_urlsafe(28)
    result = None
    deployed = False
    try:
        probe_source = build_probe(original, nonce)
        print("probe_deploy_http=", deploy(probe_source, metadata), flush=True)
        deployed = True
        time.sleep(3)
        r = requests.post(
            PROBE_URL,
            headers={"x-mw-cop-probe": nonce, "content-type": "application/json"},
            data="{}",
            timeout=60,
        )
        print("probe_http=", r.status_code, flush=True)
        print("PROBE_RESULT=" + r.text[:5000], flush=True)
        result = r.text
    finally:
        if deployed:
            print("restore_http=", deploy(original, metadata), flush=True)
    if result is None:
        raise RuntimeError("probe produced no result")


if __name__ == "__main__":
    main()
