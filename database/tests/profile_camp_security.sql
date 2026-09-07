-- Run as the database administrator. Fixtures and changes are rolled back.
BEGIN;
SET LOCAL statement_timeout = '20s';
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_info bigint := -floor(random() * 1000000000000000 + 1)::bigint;
  v_vendor uuid;
  v_admin uuid;
  v_field text;
  v_blocked boolean;
  v_count integer;
BEGIN
  SELECT id INTO STRICT v_vendor FROM public.vendors WHERE vendor_code = 'bn_2591501828';
  SELECT ua.user_id INTO STRICT v_admin FROM public.user_access ua
   WHERE ua.is_maroowell AND ua.is_admin
     AND EXISTS (SELECT 1 FROM public.vendor_members vm WHERE vm.user_id=ua.user_id
       AND vm.role_level>=90 AND vm.is_active IS TRUE) LIMIT 1;

  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_user, v_user::text || '@example.invalid',
    '{"display_name":"__camp_sync_test__","is_platform_admin":true,"camp_code":"arbitrary"}');
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_user
    AND approval_status='pending' AND NOT is_platform_admin AND NOT is_platform_staff
    AND camp_code IS NULL AND wave IS NULL AND maroowell_info_id IS NULL) THEN
    RAISE EXCEPTION 'signup defaults or metadata isolation failed';
  END IF;

  DELETE FROM public.profiles WHERE user_id=v_user;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOREACH v_field IN ARRAY ARRAY[
    'is_platform_admin = true', 'is_platform_staff = true', 'is_dragon_car_admin = true',
    'approval_status = ''approved''', 'app_only = true', 'approved_at = now()',
    'approved_by = ''' || v_admin::text || '''::uuid',
    'default_vendor_id = ''' || v_vendor::text || '''::uuid'
  ] LOOP
    v_blocked := false;
    BEGIN
      EXECUTE format('INSERT INTO public.profiles(user_id,%s) VALUES ($1,%s)',
        split_part(v_field,' = ',1),split_part(v_field,' = ',2)) USING v_user;
    EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'profile insertion allowed: %',v_field; END IF;
  END LOOP;
  INSERT INTO public.profiles(user_id) VALUES(v_user);
  UPDATE public.profiles SET is_platform_admin=true WHERE user_id=v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'self elevation allowed'; END IF;
  EXECUTE 'RESET ROLE';

  INSERT INTO public.maroowell_info(pk_id,person_name,camp_code,wave)
    VALUES(v_info,'__camp_sync_test__','__camp_a__','주간');
  INSERT INTO public.vendor_members(user_id,vendor_id,role,role_level,is_active)
    VALUES(v_user,v_vendor,'editor',30,true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_admin,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mw_admin_set_account_state(v_user,'approved',false,v_info);
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_user
    AND camp_code='__camp_a__' AND wave='주간' AND default_vendor_id=v_vendor) THEN
    RAISE EXCEPTION 'admin approval did not synchronize affiliation';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT private.app_can_manage_camp(v_user,v_vendor,'__camp_a__',30::smallint)
    OR private.app_can_manage_camp(v_user,v_vendor,'__other__',30::smallint)
    OR private.app_can_manage_camp(v_user,gen_random_uuid(),'__camp_a__',30::smallint) THEN
    RAISE EXCEPTION 'camp or vendor scope failed';
  END IF;
  UPDATE public.profiles SET camp_code='__other__' WHERE user_id=v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'self camp change allowed'; END IF;
  EXECUTE 'RESET ROLE';

  UPDATE public.maroowell_info SET camp_code='__camp_b__',wave='야간' WHERE pk_id=v_info;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_user AND camp_code='__camp_b__' AND wave='야간')
    OR private.app_can_manage_camp(v_user,v_vendor,'__camp_a__',30::smallint)
    OR NOT private.app_can_manage_camp(v_user,v_vendor,'__camp_b__',30::smallint) THEN
    RAISE EXCEPTION 'HR transfer did not refresh campus scope';
  END IF;
  UPDATE public.profiles SET camp_code='forged' WHERE user_id=v_user;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_user AND camp_code='forged') THEN
    RAISE EXCEPTION 'derived camp can drift';
  END IF;
  UPDATE public.profiles SET maroowell_info_id=NULL WHERE user_id=v_user;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_user AND (camp_code IS NOT NULL OR wave IS NOT NULL)) THEN
    RAISE EXCEPTION 'unlink retained camp';
  END IF;
  UPDATE public.profiles SET maroowell_info_id=v_info WHERE user_id=v_user;
  DELETE FROM public.maroowell_info WHERE pk_id=v_info;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_user AND (camp_code IS NOT NULL OR wave IS NOT NULL)) THEN
    RAISE EXCEPTION 'deleted HR record retained camp';
  END IF;
END;
$$;
SELECT 'PASS: signup, 8 protected fields, self update, approval, camp scope, transfer, unlink, HR deletion' AS result;
ROLLBACK;
