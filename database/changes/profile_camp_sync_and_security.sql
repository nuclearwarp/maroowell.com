-- Applied through Supabase apply_migration: profile_camp_sync_and_security.
-- The approved HR link remains the source of truth; signup metadata never grants a camp.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.profiles
  ADD COLUMN camp_code text,
  ADD COLUMN wave text;
COMMENT ON COLUMN public.profiles.camp_code IS 'maroowell_info.camp_code에서 자동 동기화되는 소속 캠프. 연결 없으면 NULL.';
COMMENT ON COLUMN public.profiles.wave IS 'maroowell_info.wave에서 자동 동기화되는 주/야간 구분. 연결 없으면 NULL.';

CREATE FUNCTION private.mw_sync_profile_camp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.camp_code := NULL;
  NEW.wave := NULL;
  IF NEW.maroowell_info_id IS NOT NULL THEN
    SELECT nullif(btrim(mi.camp_code), ''), nullif(btrim(mi.wave), '')
      INTO NEW.camp_code, NEW.wave
      FROM public.maroowell_info mi
      WHERE mi.pk_id = NEW.maroowell_info_id FOR SHARE;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.mw_sync_profile_camp() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_profiles_sync_camp
BEFORE INSERT OR UPDATE OF maroowell_info_id, camp_code, wave ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.mw_sync_profile_camp();

CREATE FUNCTION private.mw_sync_camp_from_info()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles p
     SET camp_code = nullif(btrim(NEW.camp_code), ''),
         wave = nullif(btrim(NEW.wave), ''), updated_at = now()
   WHERE p.maroowell_info_id = NEW.pk_id
     AND (p.camp_code IS DISTINCT FROM nullif(btrim(NEW.camp_code), '')
       OR p.wave IS DISTINCT FROM nullif(btrim(NEW.wave), ''));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.mw_sync_camp_from_info() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_maroowell_info_sync_profile_camp
AFTER UPDATE OF camp_code, wave ON public.maroowell_info
FOR EACH ROW
WHEN (OLD.camp_code IS DISTINCT FROM NEW.camp_code OR OLD.wave IS DISTINCT FROM NEW.wave)
EXECUTE FUNCTION private.mw_sync_camp_from_info();

UPDATE public.profiles p
   SET camp_code = nullif(btrim(mi.camp_code), ''), wave = nullif(btrim(mi.wave), '')
  FROM public.maroowell_info mi WHERE mi.pk_id = p.maroowell_info_id;

-- Existing manually assigned additional camps continue to work.
-- Only the profile's own vendor receives the linked HR camp fallback.
CREATE OR REPLACE FUNCTION private.app_can_manage_camp(
  p_user_id uuid, p_vendor_id uuid, p_camp text, p_min_level smallint DEFAULT 30::smallint
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.app_is_company_admin(p_user_id)
    OR private.app_role_level(p_user_id, p_vendor_id) >= 60::smallint
    OR (
      private.app_role_level(p_user_id, p_vendor_id) >= p_min_level
      AND (
        EXISTS (
          SELECT 1 FROM public.app_user_camps auc
          WHERE auc.user_id = p_user_id AND auc.vendor_id = p_vendor_id
            AND auc.camp = p_camp AND auc.is_active IS TRUE
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = p_user_id AND p.default_vendor_id = p_vendor_id
            AND p.approval_status = 'approved' AND p.maroowell_info_id IS NOT NULL
            AND p.camp_code = p_camp
        )
      )
    );
$$;

ALTER POLICY profiles_insert_own ON public.profiles TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND is_platform_admin IS FALSE AND is_platform_staff IS FALSE
  AND is_dragon_car_admin IS FALSE AND approval_status = 'pending'
  AND app_only IS FALSE AND approved_at IS NULL AND approved_by IS NULL
  AND default_vendor_id IS NULL AND maroowell_info_id IS NULL
  AND camp_code IS NULL AND wave IS NULL
);

ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- PostGIS owns this reference table; preserve reads and extension administration.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
