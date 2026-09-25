# AGENTS.md

## Cursor Cloud specific instructions

### Architecture Overview

Maroowell (마루웰) is a Cloudflare Workers-based logistics management platform for Coupang delivery operations. It uses a **zero-dependency static site + serverless** architecture — no `package.json`, no build step, no bundler.

| Component | File(s) | Wrangler Config | Local Port |
|-----------|---------|-----------------|------------|
| **Login / Frontend** | `login-worker.js` + `public/` | `login-wrangler.toml` | 8787 |
| **Route API** | `worker.js` | `wrangler.toml` | 8789 |
| **Zip API** | `index-worker.js` | `index-wrangler.toml` | 8788 |
| **Admin Access API** | `worker-admin-wrapper.js` | `admin-access-wrangler.toml` | 8790 |
| **Payout API** | `payout-worker.js` (missing) | `wrangler-payout.toml` | — |

**Database:** Supabase (PostgreSQL + Auth) at `rgqerimdxkthkcewqbbe.supabase.co`

### Running Workers Locally

All workers are run via `wrangler dev`. A `.dev.vars` file in the project root provides local environment variables.

```bash
# Login worker (serves frontend + config.js)
wrangler dev --config login-wrangler.toml --port 8787 --local

# Route API (needs SUPABASE_SERVICE_ROLE_KEY for DB operations; health endpoint works without it)
wrangler dev --config wrangler.toml --port 8789 --local

# Zip API (no secrets needed — proxies public Korean government API)
wrangler dev --config index-wrangler.toml --port 8788 --local
```

### Key Gotchas

- **No linter or test framework exists** in this codebase. There is no `package.json`, no ESLint config, no test runner. Validation is done by running the workers with `wrangler dev` and checking endpoints.
- **`admin-access-wrangler.toml` references `admin-access-worker.js`** which does not exist; the actual admin wrapper is `worker-admin-wrapper.js`. This config mismatch exists in the repo.
- **`payout-worker.js` is referenced by `wrangler-payout.toml`** but the file does not exist in the repo.
- **The login worker intercepts `/config.js`** requests and generates config dynamically from `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars. The static `public/config.js` is served as fallback when the worker doesn't intercept (e.g., direct file serving).
- **Frontend pages (except login and zipcode search) require Supabase authentication.** Without a test account, most pages redirect to the login page.
- **The route-api worker needs `SUPABASE_SERVICE_ROLE_KEY`** (a secret not committed to the repo) for database operations. The `/health` endpoint works without it.
- **External services** (Kakao Maps, juso.go.kr, Naver) are third-party and cannot be run locally.
