from pathlib import Path
import re

FRONTENDS = [Path('public/zipcode_search'), Path('public/coupangRouteMap.html')]

HELPER = '''{i}function buildingDenseSampleMinimum(areaM2) {{
{i}  const area = Math.max(0, Number(areaM2) || 0);
{i}  if (area < 50000) return 0;
{i}  return Math.min(500, Math.max(60, Math.ceil(area / 350)));
{i}}}

{i}function buildingHalton(index, base) {{
{i}  let n = Math.max(1, Math.trunc(Number(index) || 1));
{i}  let f = 1;
{i}  let result = 0;
{i}  while (n > 0) {{
{i}    f /= base;
{i}    result += f * (n % base);
{i}    n = Math.floor(n / base);
{i}  }}
{i}  return result;
{i}}}

{i}function buildingScopeSamplingParts(feature) {{
{i}  const turfApi = window.turf;
{i}  const geometry = feature?.geometry;
{i}  if (!turfApi || !geometry) return [];
{i}  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : (geometry.type === "MultiPolygon" ? geometry.coordinates : []);
{i}  const parts = [];
{i}  for (const coordinates of polygons || []) {{
{i}    try {{
{i}      const polygon = turfApi.polygon(coordinates);
{i}      const area = Math.max(0, Number(turfApi.area(polygon)) || 0);
{i}      const bbox = turfApi.bbox(polygon).map(Number);
{i}      if (!area || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) continue;
{i}      parts.push({{ area, bbox }});
{i}    }} catch {{}}
{i}  }}
{i}  return parts;
{i}}}
'''

BACKFILL = '''{i}const minimumDenseSamples = buildingDenseSampleMinimum(areaM2);
{i}if (minimumDenseSamples > 0 && points.length < minimumDenseSamples) {{
{i}  const samplingParts = buildingScopeSamplingParts(feature);
{i}  const totalSamplingArea = samplingParts.reduce((sum, part) => sum + part.area, 0);
{i}  const maxBackfillAttempts = Math.max(12000, minimumDenseSamples * 80);
{i}  for (let attempt = 1; points.length < minimumDenseSamples && attempt <= maxBackfillAttempts && totalSamplingArea > 0; attempt++) {{
{i}    let selector = buildingHalton(attempt, 5) * totalSamplingArea;
{i}    let part = samplingParts[samplingParts.length - 1];
{i}    for (const candidate of samplingParts) {{
{i}      selector -= candidate.area;
{i}      if (selector <= 0) {{ part = candidate; break; }}
{i}    }}
{i}    const [partMinLng, partMinLat, partMaxLng, partMaxLat] = part.bbox;
{i}    push(
{i}      partMinLng + (partMaxLng - partMinLng) * buildingHalton(attempt, 2),
{i}      partMinLat + (partMaxLat - partMinLat) * buildingHalton(attempt, 3)
{i}    );
{i}  }}
{i}}}

{i}return {{ points, spacingMeters, areaM2 }};'''


def require_replace(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: missing anchor: {old}')
    return text.replace(old, new, 1)


def patch_build_scope(text, label):
    if 'function buildingDenseSampleMinimum(areaM2)' not in text:
        m = re.search(r'^(?P<i>[ \t]*)function buildScopeDiscoveryPoints\(feature\)\s*\{', text, re.M)
        if not m:
            raise SystemExit(f'{label}: buildScopeDiscoveryPoints missing')
        helper = HELPER.format(i=m.group('i'))
        text = text[:m.start()] + helper + '\n' + text[m.start():]

    start = text.find('function buildScopeDiscoveryPoints(feature)')
    if start < 0:
        raise SystemExit(f'{label}: buildScopeDiscoveryPoints missing after helper')
    next_fn = text.find('\n  async function ', start)
    if next_fn < 0:
        next_fn = text.find('\n      async function ', start)
    if next_fn < 0:
        raise SystemExit(f'{label}: cannot bound buildScopeDiscoveryPoints')
    segment = text[start:next_fn]
    if 'const minimumDenseSamples = buildingDenseSampleMinimum(areaM2);' in segment:
        return text

    m = re.search(r'^(?P<i>[ \t]*)return \{ points, spacingMeters, areaM2 \};\s*$', segment, re.M)
    if not m:
        raise SystemExit(f'{label}: final scope discovery return missing')
    replacement = BACKFILL.format(i=m.group('i'))
    segment = segment[:m.start()] + replacement + segment[m.end():]
    return text[:start] + segment + text[next_fn:]


for path in FRONTENDS:
    text = path.read_text(encoding='utf-8')
    text = require_replace(text, 'const BUILDING_FRONT_DISCOVERY_VERSION = "V62_DENSE_PARCEL_900";', 'const BUILDING_FRONT_DISCOVERY_VERSION = "V63_DENSE_PARCEL_BACKFILL";', str(path))
    text = require_replace(text, 'const BUILDING_KAKAO_CALL_TIMEOUT_MS = 6000;', 'const BUILDING_KAKAO_CALL_TIMEOUT_MS = 8000;', str(path))
    text = require_replace(text, 'const BUILDING_REVERSE_RETRY_COUNT = 2;', 'const BUILDING_REVERSE_RETRY_COUNT = 3;', str(path))
    text = require_replace(text, 'const BUILDING_SCOPE_DISCOVERY_CONCURRENCY = 5;', 'const BUILDING_SCOPE_DISCOVERY_CONCURRENCY = 3;', str(path))
    text = require_replace(text, 'const BUILDING_SCOPE_DISCOVERY_DELAY_MS = 30;', 'const BUILDING_SCOPE_DISCOVERY_DELAY_MS = 80;', str(path))

    text = text.replace('if (attempt < BUILDING_REVERSE_RETRY_COUNT) return run();', 'if (attempt < BUILDING_REVERSE_RETRY_COUNT) return window.setTimeout(run, attempt === 1 ? 300 : 900);')
    text = text.replace('window.setTimeout(run, attempt === 1 ? 160 : 360);', 'window.setTimeout(run, attempt === 1 ? 300 : 900);')
    text = text.replace('if (attempt < BUILDING_REVERSE_RETRY_COUNT) return window.setTimeout(run, 160);', 'if (attempt < BUILDING_REVERSE_RETRY_COUNT) return window.setTimeout(run, attempt === 1 ? 300 : 900);')
    text = patch_build_scope(text, str(path))
    path.write_text(text, encoding='utf-8')

zip_path = Path('public/zipcode_search')
zip_text = zip_path.read_text(encoding='utf-8')
zip_text = require_replace(zip_text, 'const targets = [...state.selectedZips].filter(z => !state.geoByZip.has(z));', 'const targets = [...state.selectedZips].filter(z => !state.geoByZip.has(z)).sort();', str(zip_path))
zip_text = zip_text.replace('const ZIPCODE_AREA_UI_VERSION = "2026-08-14-building-v62-dense-parcel-900";', 'const ZIPCODE_AREA_UI_VERSION = "2026-08-15-building-v63-dense-backfill-order";', 1)
zip_path.write_text(zip_text, encoding='utf-8')

for path in FRONTENDS:
    final = path.read_text(encoding='utf-8')
    assert 'const BUILDING_FRONT_DISCOVERY_VERSION = "V63_DENSE_PARCEL_BACKFILL";' in final
    assert 'const BUILDING_KAKAO_CALL_TIMEOUT_MS = 8000;' in final
    assert 'const BUILDING_REVERSE_RETRY_COUNT = 3;' in final
    assert 'const BUILDING_SCOPE_DISCOVERY_CONCURRENCY = 3;' in final
    assert 'const BUILDING_SCOPE_DISCOVERY_DELAY_MS = 80;' in final
    assert final.count('function buildingDenseSampleMinimum(areaM2)') == 1
    assert final.count('const minimumDenseSamples = buildingDenseSampleMinimum(areaM2);') == 1

assert 'const targets = [...state.selectedZips].filter(z => !state.geoByZip.has(z)).sort();' in zip_path.read_text(encoding='utf-8')
