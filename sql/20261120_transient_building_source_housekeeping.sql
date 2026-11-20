-- Applied on 2026-11-20 to Maroowell Supabase.
-- Analysis results (polygon_building_stats, zipcode_terrain) and official
-- footprint source (mw_geo_buildings) are NOT part of this housekeeping.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.mw_purge_building_raw_cache(p_limit integer DEFAULT 10000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public AS $$
DECLARE
  v_limit integer := greatest(100,least(coalesce(p_limit,10000),20000));
  v_title integer := 0;
  v_detail integer := 0;
  v_source integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.building_analysis_jobs
    WHERE status NOT IN ('completed','error','cancelled','failed')
  ) THEN
    RETURN jsonb_build_object('skipped','active_analysis_job');
  END IF;
  IF NOT pg_try_advisory_xact_lock(726209920) THEN
    RETURN jsonb_build_object('skipped','purge_already_running');
  END IF;

  WITH old AS (
    SELECT ctid FROM public.building_v60_title_cache
    WHERE updated_at < now() - interval '15 minutes'
    ORDER BY updated_at LIMIT v_limit
  )
  DELETE FROM public.building_v60_title_cache t
  WHERE t.ctid IN (SELECT ctid FROM old);
  GET DIAGNOSTICS v_title=ROW_COUNT;

  WITH old AS (
    SELECT ctid FROM public.building_v60_detail_cache
    WHERE updated_at < now() - interval '15 minutes'
    ORDER BY updated_at LIMIT v_limit
  )
  DELETE FROM public.building_v60_detail_cache t
  WHERE t.ctid IN (SELECT ctid FROM old);
  GET DIAGNOSTICS v_detail=ROW_COUNT;

  WITH old AS (
    SELECT ctid FROM public.building_source_cache
    WHERE updated_at < now() - interval '15 minutes'
    ORDER BY updated_at LIMIT v_limit
  )
  DELETE FROM public.building_source_cache t
  WHERE t.ctid IN (SELECT ctid FROM old);
  GET DIAGNOSTICS v_source=ROW_COUNT;

  RETURN jsonb_build_object('title',v_title,'detail',v_detail,'source',v_source);
END;
$$;
REVOKE ALL ON FUNCTION public.mw_purge_building_raw_cache(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mw_purge_building_raw_cache(integer) TO postgres;

SELECT cron.schedule(
 'mw-purge-temporary-building-source-each-minute',
 '* * * * *',
 'SELECT public.mw_purge_building_raw_cache(10000);'
);

-- One-time production cleanup after verifying no active analysis jobs:
-- TRUNCATE TABLE public.building_v60_title_cache,
--                public.building_v60_detail_cache,
--                public.building_source_cache;
-- Do not include final analytic tables or mw_geo_buildings.
