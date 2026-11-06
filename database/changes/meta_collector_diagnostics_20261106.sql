-- META collector diagnostic events; applied to production on 2026-11-06.
-- This idempotent file is retained for future environments.
create table if not exists public.meta_collector_diagnostics (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 event_type text not null,
 severity text not null default 'warning' check (severity in ('info','warning','error')),
 run_id uuid,batch_id uuid,schedule_date date,meta_work_date date,
 camp_name text,camp_code text,wave text,stage text,http_status integer,
 error_code text,session_generation bigint,driver_pk bigint,
 current_round smallint,expected_rounds smallint,
 details jsonb not null default '{}'::jsonb
   check (jsonb_typeof(details)='object' and length(details::text)<4000)
);
create index if not exists meta_collector_diagnostics_created_idx
  on public.meta_collector_diagnostics(created_at desc);
create index if not exists meta_collector_diagnostics_batch_idx
  on public.meta_collector_diagnostics(batch_id,created_at desc) where batch_id is not null;
create index if not exists meta_collector_diagnostics_night_idx
  on public.meta_collector_diagnostics(schedule_date,wave,created_at desc);
alter table public.meta_collector_diagnostics enable row level security;
revoke all on table public.meta_collector_diagnostics from public,anon,authenticated;
grant select,insert on table public.meta_collector_diagnostics to service_role;
