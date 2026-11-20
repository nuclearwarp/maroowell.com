-- Applied to Maroowell Supabase (Seoul) 2026-11-20.
-- The UI uses /route/notes with admin-only authentication. Public /route excludes route_memo.
ALTER TABLE public.subsubroutes
  ADD COLUMN IF NOT EXISTS top_type text,
  ADD COLUMN IF NOT EXISTS route_memo text;

COMMENT ON COLUMN public.subsubroutes.top_type IS '노선 진입 가능 탑차 유형: 하이탑, 정탑, 로우탑';
COMMENT ON COLUMN public.subsubroutes.route_memo IS '노선별 특이사항; 공개 조회 응답에서 제거';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='subsubroutes_top_type_allowed'
      AND conrelid='public.subsubroutes'::regclass
  ) THEN
    ALTER TABLE public.subsubroutes ADD CONSTRAINT subsubroutes_top_type_allowed
      CHECK (top_type IS NULL OR top_type IN ('하이탑','정탑','로우탑'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='subsubroutes_route_memo_limit'
      AND conrelid='public.subsubroutes'::regclass
  ) THEN
    ALTER TABLE public.subsubroutes ADD CONSTRAINT subsubroutes_route_memo_limit
      CHECK (route_memo IS NULL OR char_length(route_memo) <= 3000);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
