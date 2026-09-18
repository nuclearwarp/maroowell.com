-- Resignation issue category and scheduling fields for Home operations.
alter table public.home_issues
  add column if not exists resignation_notice_date date,
  add column if not exists resignation_last_work_date date;

insert into public.home_categories (id, code, name, sort_order, is_active, created_at, updated_at)
select gen_random_uuid(), 'resignation', '퇴사', 35, true, now(), now()
where not exists (select 1 from public.home_categories where code = 'resignation');

create schema if not exists private;

create or replace function private.mw_home_issue_resignation_dates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resignation_category_id uuid;
begin
  select id into resignation_category_id
  from public.home_categories
  where code = 'resignation'
  limit 1;

  if new.category_id = resignation_category_id then
    if new.resignation_notice_date is null and new.occurred_at is not null then
      new.resignation_notice_date := (new.occurred_at at time zone 'Asia/Seoul')::date;
    end if;

    if trim(coalesce(new.person_name_snapshot, '')) = '김용준'
       or trim(coalesce(new.title, '')) = '김용준 퇴사' then
      new.resignation_last_work_date := date '2026-09-25';
    elsif new.resignation_notice_date is not null then
      new.resignation_last_work_date := new.resignation_notice_date + 60;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_home_issue_resignation_dates on public.home_issues;
create trigger trg_home_issue_resignation_dates
before insert or update of category_id, title, person_name_snapshot, resignation_notice_date, occurred_at
on public.home_issues
for each row
execute function private.mw_home_issue_resignation_dates();

update public.home_issues
set category_id = (select id from public.home_categories where code='resignation' limit 1),
    updated_at = now()
where id in (
  'f3feab14-ed70-46d7-a4c5-ca31479952c0',
  '9c1f3561-4513-4c29-baea-e4090d789689'
);

update public.home_issues
set title = '김용준 퇴사',
    resignation_last_work_date = date '2026-09-25',
    updated_at = now()
where id = '9c1f3561-4513-4c29-baea-e4090d789689';
