-- MarooWell admin DB/RLS introspection helper
-- Purpose: read-only schema/RLS/policy dump used by Cloudflare Worker admin page.
-- This does NOT grant or revoke any user permissions.
--
-- Install once in Supabase SQL Editor, then call through Cloudflare Worker:
--   GET /admin/db-introspect
--
-- Security model:
--   1. The caller must be authenticated.
--   2. public.user_access must contain the caller with is_maroowell = true and is_admin = true.
--   3. Function returns metadata only, not table row data.

create or replace function public.mw_admin_dump_schema()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, information_schema
as $$
declare
  caller_id uuid;
  allowed boolean;
  result jsonb;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select exists (
    select 1
      from public.user_access ua
     where ua.user_id = caller_id
       and ua.is_maroowell is true
       and ua.is_admin is true
  )
    into allowed;

  if allowed is not true then
    raise exception '최고관리자만 DB 구조/RLS 정보를 조회할 수 있습니다.';
  end if;

  with table_base as (
    select
      n.nspname as table_schema,
      c.relname as table_name,
      c.oid as table_oid,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      obj_description(c.oid, 'pg_class') as table_comment
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  ),
  table_payload as (
    select
      tb.table_schema,
      tb.table_name,
      jsonb_build_object(
        'schema', tb.table_schema,
        'table', tb.table_name,
        'rls_enabled', tb.rls_enabled,
        'rls_forced', tb.rls_forced,
        'comment', tb.table_comment,
        'columns', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'ordinal_position', col.ordinal_position,
              'column_name', col.column_name,
              'data_type', col.data_type,
              'udt_name', col.udt_name,
              'is_nullable', col.is_nullable,
              'column_default', col.column_default,
              'character_maximum_length', col.character_maximum_length,
              'numeric_precision', col.numeric_precision,
              'numeric_scale', col.numeric_scale
            ) order by col.ordinal_position
          )
          from information_schema.columns col
          where col.table_schema = tb.table_schema
            and col.table_name = tb.table_name
        ), '[]'::jsonb),
        'constraints', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'constraint_name', con.conname,
              'constraint_type', case con.contype
                when 'p' then 'PRIMARY KEY'
                when 'u' then 'UNIQUE'
                when 'f' then 'FOREIGN KEY'
                when 'c' then 'CHECK'
                when 'x' then 'EXCLUDE'
                else con.contype::text
              end,
              'definition', pg_get_constraintdef(con.oid, true)
            ) order by con.contype, con.conname
          )
          from pg_constraint con
          where con.conrelid = tb.table_oid
        ), '[]'::jsonb),
        'indexes', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'index_name', idx.indexname,
              'definition', idx.indexdef
            ) order by idx.indexname
          )
          from pg_indexes idx
          where idx.schemaname = tb.table_schema
            and idx.tablename = tb.table_name
        ), '[]'::jsonb),
        'policies', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'policy_name', p.policyname,
              'permissive', p.permissive,
              'roles', p.roles,
              'command', p.cmd,
              'using', p.qual,
              'with_check', p.with_check
            ) order by p.policyname
          )
          from pg_policies p
          where p.schemaname = tb.table_schema
            and p.tablename = tb.table_name
        ), '[]'::jsonb),
        'triggers', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'trigger_name', t.tgname,
              'enabled', t.tgenabled,
              'definition', pg_get_triggerdef(t.oid, true)
            ) order by t.tgname
          )
          from pg_trigger t
          where t.tgrelid = tb.table_oid
            and not t.tgisinternal
        ), '[]'::jsonb)
      ) as payload
    from table_base tb
  ),
  function_payload as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function_name', p.proname,
        'arguments', pg_get_function_arguments(p.oid),
        'result_type', pg_get_function_result(p.oid),
        'security_definer', p.prosecdef,
        'language', l.lanname
      ) order by p.proname, pg_get_function_arguments(p.oid)
    ), '[]'::jsonb) as payload
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'project_schema', 'public',
    'tables', coalesce((select jsonb_agg(payload order by table_name) from table_payload), '[]'::jsonb),
    'functions', (select payload from function_payload)
  )
  into result;

  return result;
end;
$$;

grant execute on function public.mw_admin_dump_schema() to authenticated;
