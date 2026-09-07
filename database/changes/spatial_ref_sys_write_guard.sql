-- Applied through Supabase apply_migration: spatial_ref_sys_write_guard.
-- Supabase owns spatial_ref_sys. postgres has TRIGGER but cannot revoke the
-- grants issued by supabase_admin. Enforce read-only API roles without changing ownership.
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION private.mw_guard_spatial_ref_sys_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION '지도 좌표계 기준표는 읽기 전용입니다.' USING errcode = '42501';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.mw_guard_spatial_ref_sys_writes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mw_guard_spatial_ref_sys_writes
BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.spatial_ref_sys
FOR EACH STATEMENT EXECUTE FUNCTION private.mw_guard_spatial_ref_sys_writes();
