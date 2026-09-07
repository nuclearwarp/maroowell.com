# Profile camps and statistics

The SQL in `changes/` records the three changes applied through Supabase migrations on 2026-09-07, in this order:

1. `profile_camp_sync_and_security`
2. `account_statistics_and_fk_indexes`
3. `spatial_ref_sys_write_guard`

`profiles.camp_code` and `profiles.wave` are derived from the existing administrator-approved `maroowell_info_id` link. Signup metadata never establishes an HR link or grants access. The approval UI remains responsible for verifying the suggested person. HR edits refresh the derived columns; unlinking or deleting the HR record clears them. Existing linked profiles are backfilled. Blank HR values stay null.

The linked camp is accepted by `private.app_can_manage_camp` for approved profiles belonging to the requested vendor. Existing explicit additional camp assignments and level 60/company administrator rules are preserved. Statistics retains its existing team-or-above read policy and supports comparisons with historical camps/routes; this release does not introduce a new restriction on those comparisons.

`mw_account_statistics` uses SECURITY INVOKER and existing RLS. It validates period parameters, retains the 50,000-source-row limit, and returns only searchable statistical dimensions, summed delivery/return quantities, and the original row count. The page sends `statisticsVersion: 1`; already-open older pages retain a lean raw-row compatibility path. Both paths preserve the lower and upper month bounds.

## Spatial reference table

The attempted REVOKE in the first change did not remove grants issued by `supabase_admin`, which owns `spatial_ref_sys`. The third change uses the already-granted TRIGGER privilege to reject INSERT, UPDATE, DELETE, and TRUNCATE by `anon` and `authenticated`, including zero-row statements. It leaves reads, coordinate transforms, service operations, and ownership intact. The guard is SECURITY INVOKER so it checks the actual database role.

The Supabase RLS/extension advisory remains because the system table's ACL and ownership remain unchanged. Removing those grants requires Supabase's owner-level action. Do not report the advisory as resolved or remove the guard without replacing its enforcement.

## Verification

- `node --test tests/account-statistics.test.cjs`: RPC routing, rolling compatibility, month bounds, denied access, and equivalence of four statistics tables across route/history/wave/search filters.
- `database/tests/profile_camp_security.sql`: transactional signup and approval fixtures, protected profile fields, same/cross-camp and vendor access, HR transfer, unlinking, and HR deletion; rolled back.
- `database/tests/account_statistics.sql`: six periods including all years and empty results, exact source-to-RPC comparisons, field minimization, invalid parameters, and ordinary/anonymous denial; read-only transaction rolled back.
- Direct role tests rejected all eight spatial write attempts (four operations for each API role); coordinate transform remained valid.
- All eight linked profiles matched HR data after backfill. The three missing FK indexes no longer appear in the performance advisor.
- For the same 2026-03 through 2026-05 data (5,166 source rows), serialized JSON decreased from 4,185,903 to 1,169,242 bytes. Sequential REST requests decreased from six to one RPC. These are measured payload sizes, not a claim about network latency.

The SQL scripts contain no credentials or live user identifiers. They document already-applied changes; do not reapply them blindly.
