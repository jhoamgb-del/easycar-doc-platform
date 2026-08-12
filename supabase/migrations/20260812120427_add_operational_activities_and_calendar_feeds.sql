create table if not exists public.doc_activities (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.doc_sales(id) on delete cascade,
  module text not null default 'insurance_gps' check (module in ('insurance_gps', 'bhph', 'bank', 'repo', 'voluntary', 'mechanical', 'survey')),
  activity_type text not null default 'follow_up',
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'critical')),
  due_at timestamptz not null,
  note text,
  source_operation_id uuid unique references public.doc_sale_operations(id) on delete set null,
  assigned_to uuid references public.doc_user_profiles(id),
  created_by uuid not null references public.doc_user_profiles(id),
  completed_by uuid references public.doc_user_profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doc_activity_events (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.doc_activities(id) on delete cascade,
  sale_id uuid not null references public.doc_sales(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'completed', 'reopened', 'rescheduled', 'cancelled', 'updated')),
  previous_status text,
  new_status text,
  previous_due_at timestamptz,
  new_due_at timestamptz,
  note text,
  actor_id uuid references public.doc_user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.doc_calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.doc_user_profiles(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_doc_activities_sale on public.doc_activities(sale_id);
create index if not exists idx_doc_activities_due_pending on public.doc_activities(due_at) where status = 'pending';
create index if not exists idx_doc_activities_assigned_pending on public.doc_activities(assigned_to, due_at) where status = 'pending';
create index if not exists idx_doc_activity_events_activity on public.doc_activity_events(activity_id, created_at desc);
create index if not exists idx_doc_activity_events_sale on public.doc_activity_events(sale_id, created_at desc);

alter table public.doc_activities enable row level security;
alter table public.doc_activity_events enable row level security;
alter table public.doc_calendar_feed_tokens enable row level security;

grant select, insert, update on public.doc_activities to authenticated;
grant select on public.doc_activity_events to authenticated;
revoke all on public.doc_calendar_feed_tokens from public, anon, authenticated;

drop policy if exists "activities_read" on public.doc_activities;
create policy "activities_read" on public.doc_activities for select to authenticated
using (public.doc_can_access_sale(sale_id));

drop policy if exists "activities_insert" on public.doc_activities;
create policy "activities_insert" on public.doc_activities for insert to authenticated
with check (
  public.doc_can_access_sale(sale_id)
  and created_by = (select auth.uid())
  and (assigned_to is null or assigned_to = (select auth.uid()) or public.doc_can_manage_all_sales())
);

drop policy if exists "activities_update" on public.doc_activities;
create policy "activities_update" on public.doc_activities for update to authenticated
using (public.doc_can_access_sale(sale_id))
with check (
  public.doc_can_access_sale(sale_id)
  and created_by is not null
  and (assigned_to is null or assigned_to = (select auth.uid()) or public.doc_can_manage_all_sales())
);

drop policy if exists "activity_events_read" on public.doc_activity_events;
create policy "activity_events_read" on public.doc_activity_events for select to authenticated
using (public.doc_can_access_sale(sale_id));

create or replace function public.doc_audit_activity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_type text;
begin
  if tg_op = 'INSERT' then
    change_type := 'created';
  elsif old.status <> new.status then
    change_type := case new.status
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'pending' then 'reopened'
      else 'updated'
    end;
  elsif old.due_at <> new.due_at then
    change_type := 'rescheduled';
  else
    change_type := 'updated';
  end if;

  insert into public.doc_activity_events (
    activity_id, sale_id, event_type, previous_status, new_status,
    previous_due_at, new_due_at, note, actor_id
  ) values (
    new.id, new.sale_id, change_type,
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    case when tg_op = 'UPDATE' then old.due_at end,
    new.due_at,
    new.note,
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.doc_audit_activity_change() from public, anon, authenticated;

create or replace function public.doc_protect_activity_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.sale_id := old.sale_id;
  new.module := old.module;
  new.activity_type := old.activity_type;
  new.source_operation_id := old.source_operation_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function public.doc_protect_activity_identity() from public, anon, authenticated;

drop trigger if exists doc_activities_set_updated_at on public.doc_activities;
create trigger doc_activities_set_updated_at before update on public.doc_activities
for each row execute function public.doc_set_updated_at();

drop trigger if exists doc_activities_protect_identity on public.doc_activities;
create trigger doc_activities_protect_identity before update on public.doc_activities
for each row execute function public.doc_protect_activity_identity();

drop trigger if exists doc_activities_audit_insert on public.doc_activities;
create trigger doc_activities_audit_insert after insert on public.doc_activities
for each row execute function public.doc_audit_activity_change();

drop trigger if exists doc_activities_audit_update on public.doc_activities;
create trigger doc_activities_audit_update after update on public.doc_activities
for each row when (
  old.status is distinct from new.status
  or old.due_at is distinct from new.due_at
  or old.title is distinct from new.title
  or old.note is distinct from new.note
  or old.assigned_to is distinct from new.assigned_to
  or old.priority is distinct from new.priority
)
execute function public.doc_audit_activity_change();

create or replace function public.doc_save_insurance_gps_event(
  target_sale_id uuid,
  sale_patch jsonb,
  operation_rows jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  operation jsonb;
  first_operation_id uuid;
  inserted_operation_id uuid;
  operation_event_type text;
  operation_follow_up date;
  operation_title text;
  operation_time time;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.doc_user_profiles profile
    where profile.id = caller_id and profile.active
  ) then raise exception 'Active DOC EASYCAR user required'; end if;
  if not exists (
    select 1 from public.doc_sales sale
    where sale.id = target_sale_id
      and (sale.created_by = caller_id or public.doc_can_manage_all_sales())
  ) then raise exception 'Sale not found or access denied'; end if;
  if jsonb_typeof(coalesce(operation_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(operation_rows, '[]'::jsonb)) = 0
  then raise exception 'At least one audit operation is required'; end if;

  update public.doc_sales
  set customer_name = coalesce(sale_patch ->> 'customer_name', ''),
      customer_email = nullif(sale_patch ->> 'customer_email', ''),
      customer_phone = nullif(sale_patch ->> 'customer_phone', ''),
      vehicle_description = nullif(sale_patch ->> 'vehicle_description', ''),
      vin = nullif(sale_patch ->> 'vin', ''),
      stock_number = nullif(sale_patch ->> 'stock_number', ''),
      contract_number = nullif(sale_patch ->> 'contract_number', ''),
      transaction_date = nullif(sale_patch ->> 'transaction_date', '')::date,
      form_data = coalesce(sale_patch -> 'form_data', '{}'::jsonb)
  where id = target_sale_id;

  for operation in select value from jsonb_array_elements(operation_rows)
  loop
    insert into public.doc_sale_operations (
      sale_id, module, event_type, status, follow_up_at, note, payload, created_by
    ) values (
      target_sale_id,
      coalesce(nullif(operation ->> 'module', ''), 'insurance_gps'),
      coalesce(nullif(operation ->> 'event_type', ''), 'revision_realizada'),
      coalesce(nullif(operation ->> 'status', ''), 'Registrado'),
      nullif(operation ->> 'follow_up_at', '')::date,
      nullif(operation ->> 'note', ''),
      coalesce(operation -> 'payload', '{}'::jsonb),
      caller_id
    ) returning id into inserted_operation_id;
    first_operation_id := coalesce(first_operation_id, inserted_operation_id);

    operation_event_type := coalesce(nullif(operation ->> 'event_type', ''), 'revision_realizada');
    operation_follow_up := nullif(operation ->> 'follow_up_at', '')::date;
    operation_title := nullif(operation -> 'payload' ->> 'ops_next_action', '');
    operation_time := coalesce(nullif(operation -> 'payload' ->> 'ops_next_action_time', '')::time, time '09:00');

    if operation_event_type = 'proxima_revision_seguro' then
      operation_title := 'Verificar poliza de seguro';
    elsif operation_event_type = 'proxima_revision_gps' then
      operation_title := 'Verificar GPS';
    end if;

    if operation_follow_up is not null
      and operation_title is not null
      and operation_event_type <> 'Identificacion / actualizacion GPS y seguro'
    then
      insert into public.doc_activities (
        sale_id, module, activity_type, title, status, priority, due_at,
        note, source_operation_id, assigned_to, created_by
      ) values (
        target_sale_id,
        coalesce(nullif(operation ->> 'module', ''), 'insurance_gps'),
        case operation_event_type
          when 'proxima_revision_seguro' then 'insurance_review'
          when 'proxima_revision_gps' then 'gps_review'
          else 'follow_up'
        end,
        operation_title,
        'pending',
        case when coalesce(operation ->> 'status', '') = 'Irregularidad' then 'high' else 'normal' end,
        (operation_follow_up + operation_time) at time zone 'America/New_York',
        nullif(operation ->> 'note', ''),
        inserted_operation_id,
        caller_id,
        caller_id
      ) on conflict (source_operation_id) do nothing;
    end if;
  end loop;
  return first_operation_id;
end;
$$;

revoke all on function public.doc_save_insurance_gps_event(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.doc_save_insurance_gps_event(uuid, jsonb, jsonb) to authenticated;

insert into public.doc_activities (
  sale_id, module, activity_type, title, status, priority, due_at, note, assigned_to, created_by
)
select
  sale.id,
  'insurance_gps',
  source.activity_type,
  source.title,
  'pending',
  case when source.due_date < current_date then 'high' else 'normal' end,
  (source.due_date + time '09:00') at time zone 'America/New_York',
  'Actividad inicial migrada desde la proxima fecha guardada en el expediente.',
  sale.created_by,
  sale.created_by
from public.doc_sales sale
cross join lateral (
  values
    ('insurance_review', 'Verificar poliza de seguro', nullif(sale.form_data ->> 'insurance_next_review_date', '')::date),
    ('gps_review', 'Verificar GPS', nullif(sale.form_data ->> 'gps_next_review_date', '')::date)
) as source(activity_type, title, due_date)
where source.due_date is not null
  and not exists (
    select 1 from public.doc_activities existing
    where existing.sale_id = sale.id
      and existing.activity_type = source.activity_type
      and existing.status = 'pending'
      and existing.due_at::date = source.due_date
  );

create or replace function public.doc_is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doc_user_profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.doc_can_access_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.doc_is_active_user() and exists (
    select 1 from public.doc_sales
    where id = target_sale_id
      and (created_by = auth.uid() or public.doc_can_manage_all_sales())
  );
$$;

revoke all on function public.doc_is_active_user() from public, anon;
grant execute on function public.doc_is_active_user() to authenticated;

drop policy if exists "sales_read" on public.doc_sales;
create policy "sales_read" on public.doc_sales for select to authenticated
using (public.doc_can_access_sale(id));

drop policy if exists "sales_insert" on public.doc_sales;
create policy "sales_insert" on public.doc_sales for insert to authenticated
with check (created_by = (select auth.uid()) and public.doc_is_active_user());

drop policy if exists "sales_update" on public.doc_sales;
create policy "sales_update" on public.doc_sales for update to authenticated
using (public.doc_can_access_sale(id))
with check (created_by is not null and public.doc_can_access_sale(id));

drop policy if exists "customers_read" on public.doc_customers;
create policy "customers_read" on public.doc_customers for select to authenticated
using (public.doc_is_active_user() and (created_by = (select auth.uid()) or public.doc_can_manage_all_sales()));

drop policy if exists "customers_insert" on public.doc_customers;
create policy "customers_insert" on public.doc_customers for insert to authenticated
with check (created_by = (select auth.uid()) and public.doc_is_active_user());

drop policy if exists "customers_update" on public.doc_customers;
create policy "customers_update" on public.doc_customers for update to authenticated
using (public.doc_is_active_user() and (created_by = (select auth.uid()) or public.doc_can_manage_all_sales()))
with check (created_by is not null and public.doc_is_active_user() and (created_by = (select auth.uid()) or public.doc_can_manage_all_sales()));
