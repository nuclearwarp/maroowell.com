# MAROOWELL Security Gateway: Phase 1

This deploys a NEW, isolated Worker named `maroowell-security`. It does not route any production domain traffic through the new Worker.

## Endpoints
- `GET /health`: static readiness, no sensitive content.
- `GET /v1/auth/verify`: validates existing Supabase bearer access token with Auth and checks `mw_my_access` plus `mw_my_account_state` using the user's own RLS-limited token.
- All other paths 404. No generic database proxy or service_role secret.

## Security
- CORS allowlist for maroowell.com / www.maroowell.com only.
- No stored auth cookies or browser app changes yet. Supabase bearer remains client-side until phase 2.
- No request-body proxy, no privileged DB write, no API secret in Worker.
- Errors fail closed; responses cannot be cached.
- Current production login, Pages, META collector and Android/iOS apps untouched.

## Next phase
Implement HttpOnly Secure SameSite cookie sessions, explicit auth endpoints, CSRF protection, token lifecycle and logout revocation. Migrate web pages separately, then narrow public DB grants and RLS only after compatibility tests.
