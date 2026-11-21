# AGENTS.md — Maroowell architecture guardrails

> This is the repository-level instruction for agents editing Maroowell. The living system map and source-linked evidence are in the private Eraser team file: https://app.eraser.io/workspace/P6RKdsa9bvXDSHWiPLj6 (Maroowell team). The diagram is a reviewed baseline, **not** a replacement for current source code and live deployment inspection.

## Before every change

1. Inspect the **latest default branch**, related Worker/frontend/native clients, SQL migrations/RLS, and relevant GitHub Actions. If architecture docs disagree with code or deployed state, stop and reconcile.
2. State which dependencies are affected: Web, Android, iOS, CPA, Cheonwoo, Tonest, Cloudflare Worker routes/service bindings, Supabase tables/RPC/RLS, Coupang META, building/road API, and CI/CD. Do **not** assume all clients use the same backend.
3. Identify the single authoritative source for the changed value (e.g., company identity, collector pause, route PK, polygon hash, API contract) and avoid conflicting hardcoded values.
4. Protect consumers: Maroowell Web `public/realtime`, Android `MetaRealtimeDbRepository.kt`, and iOS `MetaRealtimeView.swift` all read Supabase realtime tables; schedule clients call `schedule.maroowell.com`. A schema or API change requires a consumer impact review.
5. Preserve META session persistence, cookie generation, MFA-gated resume, and silent renewal unless explicitly authorized and regression tested. The paused/active server state is authoritative; opening a login popup is not authentication success.
6. Distinguish live mutable current records from daily final records. Validate day/night date boundaries, day two rounds/night three rounds, and maximum assigned freshbag collection-rate semantics when applicable.
7. Store canonical building footprint/road data once; separate temporary source API responses from final geometry and analysis caches. Never delete final data as part of raw-cache cleanup.
8. Cross-vendor boundaries are real: Cheonwoo's registration calls Maroowell `/vendors`; Tonest's collector calls Maroowell `/api/v1/camps`. Do not share credentials, user sessions, schedules, or private realtime records across vendors.
9. Check role/RLS and company code migrations carefully. For Maroowell corporate records the known current business number is `6128704101` and scheduling code `MARWL`; never silently switch access control back to the legacy sole proprietor.
10. Add/adjust regression tests for affected contracts, then verify corresponding GitHub Actions, deployed Worker endpoints, and user-facing behavior separately. A commit is not a deployment.
11. Document architecture changes in the Eraser system map **in the same change workflow**; note unverified infrastructure and runtime configuration as hypotheses.
12. No secrets, OTPs, cookies, private personnel records or service-role values in diagrams, tests, logs or docs. Request explicit approval for destructive production DB edits or restarting external polling.

## Confirmed source entry points

- Web API / route / geo: `worker.js`, `public/coupangRouteMap.html`, `public/zipcode_search`
- META collector: `workers/meta-collector/entry.js`, `workers/meta-collector/auth-v12-base.js`, `public/realtime`
- Schedule: `workers/schedule-api/worker.js`, `https://schedule.maroowell.com`
- Security: `workers/security/worker.js`, `public/config.js`
- Deployment: `.github/workflows/`, per-Worker `wrangler.toml`
- Native clients: `nuclearwarp/maroowell-android`, `nuclearwarp/maroowell-ios`
- Other-vendor consumers: `chunwoologis-admin/chunwoologis-web`, `tonest-admin/tonest-corp.com`
- Offline CPA Android: `nuclearwarp/CoupangPartnersAssociation`

The Eraser baseline was initially produced 2026-11-21 from GitHub tree and sampled code inspection; it is **not yet** a complete Supabase/Cloudflare runtime audit.
