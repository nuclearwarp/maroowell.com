# Shared Building Geometry API (Maroowell / Chunwoo / Heroes)

Updated 2026-11-17. This API loads only source building geometry/address data. The applications own road-color classification, route rendering, elevator/household analysis and statistics.

## Data design

* \`public.mw_geo_buildings\`: one row per source \`objectid\`; \`geometry(Geometry,4326)\`, street, number, building name, postal code; GiST spatial index.
* \`public.mw_geo_cache_coverage\`: completed/partial/failed cache tile and zipcode collection; one lease per key, global maximum 4 concurrent source fetches. Source collection checkpoints every two 200-feature pages.
* \`public.mw_geo_scope_links\`: optional metadata link \`(scope_type,scope_pk) -> geometry_hash\`, not the primary source cache. The stable \`subsubroutes.id\` remains the scope PK even when a route number/name changes.
* PostGIS \`ST_Intersects\` filters actual building footprints for arbitrary polygons. Data is stored once by source ID; tiles and route IDs do not duplicate it.

Database migrations applied to Supabase in Seoul, \`ap-northeast-2\`. Tables are RLS enabled, and only the service role has privileges. Database is initially empty; cached coverage is populated on first authorized API calls. Cache expires for revalidation after 90 days.

## External APIs (requires \`X-API-Key\`)

Base: \`https://purple-river-0717.brain-0f6.workers.dev\`

### Postal code

\`GET /api/v1/buildings?zipcode=07420&offset=0&limit=200\`

### Arbitrary polygon

\`POST /api/v1/buildings/query\`, header \`Content-Type: application/json\`

\`\`\`json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [
      [[126.895,37.492],[126.904,37.492],[126.904,37.498],[126.895,37.492]]
    ]
  },
  "offset": 0,
  "limit": 200
}
\`\`\`

### Registered route

\`GET /api/v1/buildings/route?route_id=1057&offset=0&limit=200\`

Requires both \`buildings.read\` and \`subsubroutes.read\`; the backend looks up \`polygon_wgs84\` by stable \`subsubroutes.id\`. It never uses a route *code* as the cache key. Callers must be authorized to access the referenced route; do not grant this scope to arbitrary public apps.

### Async cache warming

* HTTP \`200\`: \`status:"ready"\`, \`type:"FeatureCollection"\`, \`features\`, \`total\`, \`hasMore\`. Continue with \`offset += features.length\` while \`hasMore\` is true.
* HTTP \`202\`: \`status:"warming"\`, \`pendingTiles\`, \`retryAfterSeconds\`. Retry **the same request** after indicated delay. Do not treat this as completed data.
* HTTP \`503\`: \`source_cooldown\` / \`source_error\`, with \`Retry-After\`. Avoid retry storms and display an appropriate delay.
* For direct route-map browser access, existing Supabase session JWT is used through \`POST /building-footprints/geometry\`; external API keys are not placed in frontend JavaScript.

Bbox is limited to 36 approx. 0.01-degree tiles per polygon query. Large areas must be broken into smaller polygon requests.

## Frontend visualizations

* \`public/mw-zip-road-overlay.js\`: road string canonicalization + stable deterministic color hash shared by both pages.
* \`public/mw-route-road-overlay.js\`: polygon-based route building visualizations. Uses authenticated common cache, not local unbounded ArcGIS requests.
* Both maps support temporary boundary/route-label hiding without altering underlying DB data. The buildings layer remains on screen.
* \`coupangRouteMap\` can use loaded route polygons; new ZIP/route codes with matching geometry reuse identical source building rows.
* Road colors distinguish names, but 12-color palette hashing can collide for *different* names. Same road always retains the same color.

## Operational and licensing notes

The source is \`MOIS_KR_Buildings_v2\` (ArcGIS FeatureServer). Verify current data terms for durable storage, commercial reuse and redistribution to third-party apps **before exposing this data outside the authorized Maroowell/Chunwoo environment**. Database region is Korea. Cache renewal is not guaranteed to reflect construction changes immediately. This API does not furnish road direction/one-way restrictions; the map basemap still shows those.

Do not put the \`X-API-Key\` into publicly downloadable web bundles. Use Chunwoo's own server as a proxy or a secure authenticated backend.
