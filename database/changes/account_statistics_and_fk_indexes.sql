-- Applied through Supabase apply_migration: account_statistics_and_fk_indexes.
SET LOCAL lock_timeout = '5s';

CREATE INDEX app_user_camps_created_by_idx ON public.app_user_camps (created_by);
CREATE INDEX zipcode_terrain_subsubroute_id_idx ON public.zipcode_terrain (subsubroute_id);
CREATE INDEX zipcode_terrain_vendor_id_idx ON public.zipcode_terrain (vendor_id);

-- SECURITY INVOKER: the existing team-or-above RLS still filters every input row.
-- Keep every searchable/grouping dimension so client-side route and history filters stay exact.
CREATE FUNCTION public.mw_account_statistics(
  p_year integer DEFAULT NULL,
  p_start_month integer DEFAULT NULL,
  p_end_month integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION '로그인 세션이 필요합니다.' USING errcode = '28000';
  END IF;
  IF public.mw_is_team_or_above() IS NOT TRUE THEN
    RAISE EXCEPTION '통계 조회 권한이 필요합니다.' USING errcode = '42501';
  END IF;
  IF (p_year IS NOT NULL AND p_year NOT BETWEEN 2000 AND 9999)
    OR (p_start_month IS NOT NULL AND p_start_month NOT BETWEEN 1 AND 12)
    OR (p_end_month IS NOT NULL AND p_end_month NOT BETWEEN 1 AND 12)
    OR p_start_month > p_end_month THEN
    RAISE EXCEPTION '조회 연도와 월 범위를 확인하세요.' USING errcode = '22023';
  END IF;

  WITH selected AS MATERIALIZED (
    SELECT a.classify, a.id, a.route, a.delivery_date, a.camp, a.wave,
           a.parcel, a."return", a.source_sheet, a.date_year, a.date_month
      FROM public.maroowell_account a
     WHERE (p_year IS NULL OR a.date_year = p_year)
       AND (p_start_month IS NULL OR a.date_month >= p_start_month)
       AND (p_end_month IS NULL OR a.date_month <= p_end_month)
     LIMIT 50001
  ), grouped AS (
    SELECT classify, id, route, delivery_date, camp, wave, source_sheet, date_year, date_month,
           sum(coalesce(parcel, 0)) AS parcel, sum(coalesce("return", 0)) AS "return",
           count(*) AS row_count
      FROM selected
     GROUP BY classify, id, route, delivery_date, camp, wave, source_sheet, date_year, date_month
  )
  SELECT jsonb_build_object(
    'ok', true, 'mode', 'supabase-statistics-v1',
    'source_row_count', (SELECT count(*) FROM selected),
    'rows', coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.delivery_date, g.camp, g.route,
                      g.wave, g.classify, g.id, g.source_sheet, g.date_year, g.date_month), '[]'::jsonb)
  ) INTO v_result FROM grouped g;

  IF (v_result ->> 'source_row_count')::bigint > 50000 THEN
    RAISE EXCEPTION '조회 결과가 50,000행을 초과했습니다. 기간을 줄여 주세요.' USING errcode = '54000';
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.mw_account_statistics(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mw_account_statistics(integer, integer, integer) TO authenticated;
COMMENT ON FUNCTION public.mw_account_statistics(integer, integer, integer) IS
  '수량 통계 전용 조회. 기존 RLS 적용, 통계에 필요한 필드만 집계. 금액/계좌/상품/송장번호 제외.';
NOTIFY pgrst, 'reload schema';
