-- META realtime lifecycle normalization
-- Separates work completion, frontend visibility, metrics collection, and final archival.

create or replace function public.meta_realtime_visible_until(
  p_schedule_date date,
  p_wave text,
  p_work_completed_at timestamp without time zone
)
returns timestamp without time zone
language sql
immutable
strict
set search_path = public
as $$
  select case
    when upper(p_wave) = 'WAVE2' then
      least(
        (p_schedule_date + 1)::timestamp,
        greatest(
          p_schedule_date + time '21:00',
          p_work_completed_at + interval '1 hour'
        )
      )
    when upper(p_wave) = 'WAVE1' then
      least(
        (p_schedule_date + 1) + time '12:00',
        p_work_completed_at + interval '1 hour'
      )
    else p_work_completed_at + interval '1 hour'
  end
$$;

create or replace function public.meta_realtime_metrics_close_at(
  p_schedule_date date,
  p_wave text
)
returns timestamp without time zone
language sql
immutable
strict
set search_path = public
as $$
  select case
    when upper(p_wave) = 'WAVE2' then p_schedule_date + time '23:59'
    when upper(p_wave) = 'WAVE1' then (p_schedule_date + 1) + time '11:59'
    else p_schedule_date + time '23:59'
  end
$$;

revoke all on function public.meta_realtime_visible_until(date,text,timestamp without time zone) from public, anon, authenticated;
grant execute on function public.meta_realtime_visible_until(date,text,timestamp without time zone) to service_role;
revoke all on function public.meta_realtime_metrics_close_at(date,text) from public, anon, authenticated;
grant execute on function public.meta_realtime_metrics_close_at(date,text) to service_role;

alter table public.meta_realtime_current
  add column if not exists work_completed_at timestamp without time zone;

alter table public.meta_realtime_final
  add column if not exists work_completed_at timestamp without time zone;

alter table public.meta_realtime_batch
  add column if not exists work_completed_at timestamp without time zone,
  add column if not exists metrics_status text not null default 'collecting',
  add column if not exists metrics_closed_at timestamp without time zone;

alter table public.meta_realtime_batch
  drop constraint if exists meta_realtime_batch_metrics_status_check;

alter table public.meta_realtime_batch
  add constraint meta_realtime_batch_metrics_status_check
  check (metrics_status in ('collecting','closed'));

alter table public.meta_realtime_batch
  add column if not exists visible_until timestamp without time zone
    generated always as (
      public.meta_realtime_visible_until(schedule_date,wave,work_completed_at)
    ) stored;

alter table public.meta_realtime_batch
  add column if not exists metrics_close_at timestamp without time zone
    generated always as (
      public.meta_realtime_metrics_close_at(schedule_date,wave)
    ) stored;

create index if not exists idx_meta_realtime_batch_lifecycle
  on public.meta_realtime_batch(status, metrics_status, metrics_close_at);

create index if not exists idx_meta_realtime_batch_visible_until
  on public.meta_realtime_batch(visible_until)
  where work_completed_at is not null;

-- Backfill only logically valid legacy worker completions.
update public.meta_realtime_current
set work_completed_at = all_completed_at
where work_completed_at is null
  and all_completed_at is not null
  and delivery_started_at is not null
  and all_completed_at >= delivery_started_at;

update public.meta_realtime_final
set work_completed_at = all_completed_at
where work_completed_at is null
  and all_completed_at is not null;

update public.meta_realtime_batch
set metrics_status='closed',
    metrics_closed_at=coalesce(metrics_closed_at,finalized_at)
where status='finalized';

create or replace function public.meta_finalize_realtime_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_batch public.meta_realtime_batch%rowtype;
  v_current_count integer;
  v_final_count integer;
begin
  select * into v_batch
  from public.meta_realtime_batch
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'META batch not found: %', p_batch_id;
  end if;

  if v_batch.status = 'finalized' then
    select count(*) into v_final_count
    from public.meta_realtime_final
    where batch_id = p_batch_id;
    return jsonb_build_object('ok',true,'already_finalized',true,'final_rows',v_final_count);
  end if;

  if v_batch.work_completed_at is null then
    raise exception 'META batch work completion is not confirmed: %', p_batch_id;
  end if;

  select count(*) into v_current_count
  from public.meta_realtime_current
  where batch_id = p_batch_id;

  if v_current_count = 0 then
    raise exception 'META batch has no current rows: %', p_batch_id;
  end if;

  insert into public.meta_realtime_final (
    batch_id,schedule_date,meta_work_date,camp_code,camp_name,wave,meta_worker_key,source_camp_code,
    driver_pk,coupang_id,driver_name,driver_account_type,scheduled_routes,actual_routes,
    delivery_assigned,delivery_scanned,delivery_completed,delivery_impossible,delivery_pdd_miss,delivery_total,delivery_complete_rate,
    fresh_delivery_assigned,fresh_delivery_scanned,fresh_delivery_completed,fresh_delivery_impossible,fresh_delivery_pdd_miss,fresh_delivery_total,fresh_delivery_complete_rate,
    return_pending,return_collected,return_uncollected_raw,return_absent_raw,return_total,return_attempt_rate,return_collection_rate,
    freshbag_pending,freshbag_collected,freshbag_uncollected,freshbag_total,freshbag_attempt_rate,freshbag_collection_rate,
    scan_started_at,delivery_started_at,delivery_completed_at,all_completed_at,work_completed_at,first_seen_at,last_seen_at,
    delivery_done,return_done,freshbag_done,raw_payload,
    actual_rounds,expected_rounds,
    round1_scan_started_at,round1_delivery_started_at,round1_completed_at,round1_completion_detected_at,round1_completion_method,
    round2_scan_started_at,round2_delivery_started_at,round2_completed_at,round2_completion_detected_at,round2_completion_method,
    round3_scan_started_at,round3_delivery_started_at,round3_completed_at,round3_completion_detected_at,round3_completion_method,
    completion_method,completion_detected_at,
    finalized_at,created_at,updated_at
  )
  select
    batch_id,schedule_date,meta_work_date,camp_code,camp_name,wave,meta_worker_key,source_camp_code,
    driver_pk,coupang_id,driver_name,driver_account_type,scheduled_routes,actual_routes,
    delivery_assigned,delivery_scanned,delivery_completed,delivery_impossible,delivery_pdd_miss,delivery_total,delivery_complete_rate,
    fresh_delivery_assigned,fresh_delivery_scanned,fresh_delivery_completed,fresh_delivery_impossible,fresh_delivery_pdd_miss,fresh_delivery_total,fresh_delivery_complete_rate,
    return_pending,return_collected,return_uncollected_raw,return_absent_raw,return_total,return_attempt_rate,return_collection_rate,
    freshbag_pending,freshbag_collected,freshbag_uncollected,freshbag_total,freshbag_attempt_rate,freshbag_collection_rate,
    scan_started_at,delivery_started_at,delivery_completed_at,coalesce(work_completed_at,all_completed_at),work_completed_at,first_seen_at,last_seen_at,
    delivery_done,return_done,freshbag_done,raw_payload,
    current_round,expected_rounds,
    round1_scan_started_at,round1_delivery_started_at,round1_completed_at,round1_completion_detected_at,round1_completion_method,
    round2_scan_started_at,round2_delivery_started_at,round2_completed_at,round2_completion_detected_at,round2_completion_method,
    round3_scan_started_at,round3_delivery_started_at,round3_completed_at,round3_completion_detected_at,round3_completion_method,
    completion_method,completion_detected_at,
    (now() at time zone 'Asia/Seoul'),created_at,(now() at time zone 'Asia/Seoul')
  from public.meta_realtime_current
  where batch_id = p_batch_id
  on conflict (batch_id,meta_worker_key) do update set
    source_camp_code=excluded.source_camp_code,
    driver_pk=excluded.driver_pk,
    coupang_id=excluded.coupang_id,
    driver_name=excluded.driver_name,
    driver_account_type=excluded.driver_account_type,
    scheduled_routes=excluded.scheduled_routes,
    actual_routes=excluded.actual_routes,
    delivery_assigned=excluded.delivery_assigned,
    delivery_scanned=excluded.delivery_scanned,
    delivery_completed=excluded.delivery_completed,
    delivery_impossible=excluded.delivery_impossible,
    delivery_pdd_miss=excluded.delivery_pdd_miss,
    delivery_total=excluded.delivery_total,
    delivery_complete_rate=excluded.delivery_complete_rate,
    fresh_delivery_assigned=excluded.fresh_delivery_assigned,
    fresh_delivery_scanned=excluded.fresh_delivery_scanned,
    fresh_delivery_completed=excluded.fresh_delivery_completed,
    fresh_delivery_impossible=excluded.fresh_delivery_impossible,
    fresh_delivery_pdd_miss=excluded.fresh_delivery_pdd_miss,
    fresh_delivery_total=excluded.fresh_delivery_total,
    fresh_delivery_complete_rate=excluded.fresh_delivery_complete_rate,
    return_pending=excluded.return_pending,
    return_collected=excluded.return_collected,
    return_uncollected_raw=excluded.return_uncollected_raw,
    return_absent_raw=excluded.return_absent_raw,
    return_total=excluded.return_total,
    return_attempt_rate=excluded.return_attempt_rate,
    return_collection_rate=excluded.return_collection_rate,
    freshbag_pending=excluded.freshbag_pending,
    freshbag_collected=excluded.freshbag_collected,
    freshbag_uncollected=excluded.freshbag_uncollected,
    freshbag_total=excluded.freshbag_total,
    freshbag_attempt_rate=excluded.freshbag_attempt_rate,
    freshbag_collection_rate=excluded.freshbag_collection_rate,
    scan_started_at=excluded.scan_started_at,
    delivery_started_at=excluded.delivery_started_at,
    delivery_completed_at=excluded.delivery_completed_at,
    all_completed_at=excluded.all_completed_at,
    work_completed_at=excluded.work_completed_at,
    first_seen_at=excluded.first_seen_at,
    last_seen_at=excluded.last_seen_at,
    delivery_done=excluded.delivery_done,
    return_done=excluded.return_done,
    freshbag_done=excluded.freshbag_done,
    raw_payload=excluded.raw_payload,
    actual_rounds=excluded.actual_rounds,
    expected_rounds=excluded.expected_rounds,
    round1_scan_started_at=excluded.round1_scan_started_at,
    round1_delivery_started_at=excluded.round1_delivery_started_at,
    round1_completed_at=excluded.round1_completed_at,
    round1_completion_detected_at=excluded.round1_completion_detected_at,
    round1_completion_method=excluded.round1_completion_method,
    round2_scan_started_at=excluded.round2_scan_started_at,
    round2_delivery_started_at=excluded.round2_delivery_started_at,
    round2_completed_at=excluded.round2_completed_at,
    round2_completion_detected_at=excluded.round2_completion_detected_at,
    round2_completion_method=excluded.round2_completion_method,
    round3_scan_started_at=excluded.round3_scan_started_at,
    round3_delivery_started_at=excluded.round3_delivery_started_at,
    round3_completed_at=excluded.round3_completed_at,
    round3_completion_detected_at=excluded.round3_completion_detected_at,
    round3_completion_method=excluded.round3_completion_method,
    completion_method=excluded.completion_method,
    completion_detected_at=excluded.completion_detected_at,
    finalized_at=excluded.finalized_at,
    updated_at=(now() at time zone 'Asia/Seoul');

  delete from public.meta_realtime_current where batch_id = p_batch_id;

  update public.meta_realtime_batch
  set status='finalized',
      metrics_status='closed',
      metrics_closed_at=coalesce(metrics_closed_at,(now() at time zone 'Asia/Seoul')),
      finalized_at=coalesce(finalized_at,(now() at time zone 'Asia/Seoul')),
      completion_method=coalesce(completion_method,'work_completed'),
      completion_detected_at=coalesce(completion_detected_at,(now() at time zone 'Asia/Seoul')),
      last_polled_at=coalesce(last_polled_at,(now() at time zone 'Asia/Seoul')),
      poll_interval_seconds=300,
      next_poll_at=(now() at time zone 'Asia/Seoul')+interval '5 minutes',
      last_error=null,
      updated_at=(now() at time zone 'Asia/Seoul')
  where id=p_batch_id;

  select count(*) into v_final_count
  from public.meta_realtime_final
  where batch_id=p_batch_id;

  return jsonb_build_object('ok',true,'already_finalized',false,'final_rows',v_final_count);
end;
$function$;

revoke all on function public.meta_finalize_realtime_batch(uuid) from public, anon, authenticated;
grant execute on function public.meta_finalize_realtime_batch(uuid) to service_role;
