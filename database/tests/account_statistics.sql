BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE
  v_user uuid;
  v_period record;
  v_result jsonb;
  v_mismatches integer;
  v_source_count bigint;
  v_blocked boolean := false;
BEGIN
  SELECT ua.user_id INTO STRICT v_user FROM public.user_access ua
  WHERE ua.is_maroowell AND EXISTS (
    SELECT 1 FROM public.vendor_members vm WHERE vm.user_id=ua.user_id
      AND vm.role_level=30 AND vm.is_active IS TRUE) LIMIT 1;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR v_period IN SELECT * FROM (VALUES (2026,3,5),(2026,8,8),(NULL,NULL,NULL),
    (2027,1,1),(2026,NULL,3),(2026,7,NULL)) p(year,start_month,end_month)
  LOOP
    v_result := public.mw_account_statistics(v_period.year,v_period.start_month,v_period.end_month);
    SELECT count(*) INTO v_source_count FROM public.maroowell_account a
     WHERE (v_period.year IS NULL OR a.date_year=v_period.year)
       AND (v_period.start_month IS NULL OR a.date_month>=v_period.start_month)
       AND (v_period.end_month IS NULL OR a.date_month<=v_period.end_month);
    IF (v_result->>'source_row_count')::bigint <> v_source_count THEN
      RAISE EXCEPTION 'period source count mismatch';
    END IF;
    WITH expected AS (
      SELECT a.classify,a.id,a.route,a.delivery_date,a.camp,a.wave,a.source_sheet,a.date_year,a.date_month,
        sum(coalesce(a.parcel,0)) parcel,sum(coalesce(a."return",0)) "return",count(*) row_count
      FROM public.maroowell_account a
      WHERE (v_period.year IS NULL OR a.date_year=v_period.year)
        AND (v_period.start_month IS NULL OR a.date_month>=v_period.start_month)
        AND (v_period.end_month IS NULL OR a.date_month<=v_period.end_month)
      GROUP BY a.classify,a.id,a.route,a.delivery_date,a.camp,a.wave,a.source_sheet,a.date_year,a.date_month
    ), actual AS (
      SELECT * FROM jsonb_to_recordset(v_result->'rows') AS g(
        classify text,id text,route text,delivery_date date,camp text,wave text,source_sheet text,
        date_year integer,date_month integer,parcel bigint,"return" bigint,row_count bigint)
    ), differences AS (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) SELECT count(*) INTO v_mismatches FROM differences;
    IF v_mismatches <> 0 THEN RAISE EXCEPTION 'statistics aggregation mismatch'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'rows') r
       WHERE r ?| ARRAY['total_price','price','tracking_number','product_name','driver_name','created_by']) THEN
      RAISE EXCEPTION 'non-statistical fields returned';
    END IF;
  END LOOP;
  BEGIN PERFORM public.mw_account_statistics(2026,5,3);
  EXCEPTION WHEN invalid_parameter_value THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'invalid period accepted'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT user_id INTO STRICT v_user FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.vendor_members vm WHERE vm.user_id=p.user_id) LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_blocked:=false;
  BEGIN PERFORM public.mw_account_statistics(2026,8,8);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'ordinary user allowed'; END IF;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  v_blocked:=false;
  BEGIN PERFORM public.mw_account_statistics(2026,8,8);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'anon allowed'; END IF;
END;
$$;
SELECT 'PASS: 6 periods, exact dimensional aggregates, field minimization, invalid input, ordinary/anon denial' AS result;
ROLLBACK;
