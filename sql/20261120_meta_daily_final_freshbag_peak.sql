-- Applied to Maroowell Supabase in Seoul 2026-11-20.
-- Existing daily rows were backfilled using maximum observed history allocation.
-- Do not drop historical rows until missing final snapshots have been reconciled.
alter table public.meta_realtime_current
 add column if not exists freshbag_peak_total integer not null default 0,
 add column if not exists freshbag_peak_collection_rate numeric(6,2);
alter table public.meta_realtime_final
 add column if not exists freshbag_peak_total integer,
 add column if not exists freshbag_peak_collection_rate numeric(6,2);

create or replace function public.meta_final_copy_freshbag_peak()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_peak integer;
begin
 if new.freshbag_peak_total is null then
   select greatest(coalesce(c.freshbag_peak_total,0),coalesce(c.freshbag_total,0))
   into v_peak from public.meta_realtime_current c
   where c.batch_id=new.batch_id and c.meta_worker_key=new.meta_worker_key limit 1;
   if v_peak is not null then new.freshbag_peak_total:=v_peak; end if;
 end if;
 if new.freshbag_peak_total is not null then
   new.freshbag_peak_total:=greatest(new.freshbag_peak_total,coalesce(new.freshbag_collected,0));
   new.freshbag_peak_collection_rate:=case
     when new.freshbag_peak_total>0 then
       round(least(100.0,greatest(0.0,coalesce(new.freshbag_collected,0)::numeric *100 /new.freshbag_peak_total)),2)
     else null end;
 end if;
 return new;
end;
$$;
drop trigger if exists meta_final_copy_freshbag_peak_trg on public.meta_realtime_final;
create trigger meta_final_copy_freshbag_peak_trg
before insert or update on public.meta_realtime_final
for each row execute function public.meta_final_copy_freshbag_peak();
revoke all on function public.meta_final_copy_freshbag_peak() from public,anon,authenticated;
grant execute on function public.meta_final_copy_freshbag_peak() to service_role;
notify pgrst,'reload schema';

-- Backfill procedure already executed once in production on 2026-11-20.
-- Run this separately ONLY after confirming historic data is still available.
-- with history_peaks as (
--   select h.batch_id,h.meta_worker_key,max(greatest(coalesce(h.freshbag_total,0),coalesce(h.freshbag_collected,0))) max_allocated
--   from public.meta_realtime_history h
--   join public.meta_realtime_final f on f.batch_id=h.batch_id and f.meta_worker_key=h.meta_worker_key
--   group by h.batch_id,h.meta_worker_key
-- ), target as (
--   select f.id,greatest(coalesce(h.max_allocated,0),coalesce(f.freshbag_total,0),coalesce(f.freshbag_collected,0)) peak
--   from public.meta_realtime_final f left join history_peaks h on h.batch_id=f.batch_id and h.meta_worker_key=f.meta_worker_key
-- )
-- update public.meta_realtime_final f set freshbag_peak_total=t.peak
-- from target t where f.id=t.id;
