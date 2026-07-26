create table if not exists public.doc_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.doc_user_profiles(id),
  source_file_name text not null,
  source_sha256 text not null,
  total_rows integer not null check (total_rows > 0 and total_rows <= 1000),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  status text not null default 'processing' check (status in ('processing', 'completed', 'rolled_back')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz,
  rolled_back_by uuid references public.doc_user_profiles(id)
);

create table if not exists public.doc_import_batch_sales (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.doc_import_batches(id) on delete cascade,
  sale_id uuid references public.doc_sales(id) on delete set null,
  source_row_number integer not null check (source_row_number >= 2),
  warnings jsonb not null default '[]'::jsonb,
  sale_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, source_row_number)
);

create table if not exists public.doc_data_correction_log (
  id uuid primary key default gen_random_uuid(),
  correction_type text not null,
  source_table text not null,
  source_id uuid,
  snapshot jsonb not null,
  reason text not null,
  corrected_by uuid references public.doc_user_profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_doc_import_batches_active_file
on public.doc_import_batches(created_by, source_sha256)
where status in ('processing', 'completed');

create index if not exists idx_doc_import_batches_created_at
on public.doc_import_batches(created_at desc);

create index if not exists idx_doc_import_batch_sales_batch
on public.doc_import_batch_sales(batch_id);

alter table public.doc_import_batches enable row level security;
alter table public.doc_import_batch_sales enable row level security;
alter table public.doc_data_correction_log enable row level security;

grant select, insert, update on public.doc_import_batches to authenticated;
grant select, insert on public.doc_import_batch_sales to authenticated;
grant select on public.doc_data_correction_log to authenticated;

create policy "import_batches_read"
on public.doc_import_batches for select to authenticated
using (created_by = auth.uid() or public.doc_can_manage_all_sales());

create policy "import_batches_insert"
on public.doc_import_batches for insert to authenticated
with check (created_by = auth.uid() and status = 'processing');

create policy "import_batches_update_own_processing"
on public.doc_import_batches for update to authenticated
using (created_by = auth.uid() and status = 'processing')
with check (created_by = auth.uid() and status in ('processing', 'completed'));

create policy "import_batch_sales_read"
on public.doc_import_batch_sales for select to authenticated
using (
  exists (
    select 1
    from public.doc_import_batches batch
    where batch.id = batch_id
      and (batch.created_by = auth.uid() or public.doc_can_manage_all_sales())
  )
);

create policy "import_batch_sales_insert"
on public.doc_import_batch_sales for insert to authenticated
with check (
  exists (
    select 1
    from public.doc_import_batches batch
    where batch.id = batch_id
      and batch.created_by = auth.uid()
      and batch.status = 'processing'
  )
);

create policy "correction_log_admin_read"
on public.doc_data_correction_log for select to authenticated
using (public.doc_can_admin_users());

create or replace function public.doc_import_sales_batch(
  source_file_name text,
  source_file_sha256 text,
  import_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  batch_id uuid;
  item jsonb;
  sale_record jsonb;
  sale_id uuid;
  row_number integer;
  imported_count integer := 0;
  warnings_count integer := 0;
begin
  if caller_id is null or not exists (
    select 1 from public.doc_user_profiles
    where id = caller_id and active
  ) then
    raise exception 'Active DOC EASYCAR user required';
  end if;

  if nullif(trim(source_file_name), '') is null
    or source_file_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Valid source file name and SHA-256 are required';
  end if;

  if jsonb_typeof(import_rows) <> 'array'
    or jsonb_array_length(import_rows) = 0
    or jsonb_array_length(import_rows) > 1000 then
    raise exception 'Import must contain between 1 and 1000 validated rows';
  end if;

  if exists (
    select 1
    from public.doc_import_batches batch
    where batch.created_by = caller_id
      and batch.source_sha256 = source_file_sha256
      and batch.status in ('processing', 'completed')
  ) then
    raise exception 'Este mismo archivo ya fue cargado anteriormente';
  end if;

  insert into public.doc_import_batches (
    created_by, source_file_name, source_sha256, total_rows
  ) values (
    caller_id, left(trim(source_file_name), 255), source_file_sha256, jsonb_array_length(import_rows)
  )
  returning id into batch_id;

  for item in select value from jsonb_array_elements(import_rows)
  loop
    sale_record := item -> 'record';
    row_number := nullif(item ->> 'source_row_number', '')::integer;
    if jsonb_typeof(sale_record) <> 'object' or row_number is null or row_number < 2 then
      raise exception 'Every import row requires a record and source row number';
    end if;

    insert into public.doc_sales (
      created_by,
      customer_name,
      customer_email,
      customer_phone,
      vehicle_description,
      vin,
      stock_number,
      contract_number,
      transaction_date,
      status,
      form_data
    ) values (
      caller_id,
      coalesce(sale_record ->> 'customer_name', ''),
      nullif(sale_record ->> 'customer_email', ''),
      nullif(sale_record ->> 'customer_phone', ''),
      nullif(sale_record ->> 'vehicle_description', ''),
      nullif(sale_record ->> 'vin', ''),
      nullif(sale_record ->> 'stock_number', ''),
      nullif(sale_record ->> 'contract_number', ''),
      nullif(sale_record ->> 'transaction_date', '')::date,
      'draft',
      coalesce(sale_record -> 'form_data', '{}'::jsonb)
    )
    returning id into sale_id;

    insert into public.doc_import_batch_sales (
      batch_id,
      sale_id,
      source_row_number,
      warnings,
      sale_snapshot
    ) values (
      batch_id,
      sale_id,
      row_number,
      coalesce(item -> 'warnings', '[]'::jsonb),
      to_jsonb((select sale from public.doc_sales sale where sale.id = sale_id))
    );

    imported_count := imported_count + 1;
    warnings_count := warnings_count
      + jsonb_array_length(coalesce(item -> 'warnings', '[]'::jsonb));
  end loop;

  update public.doc_import_batches
  set imported_rows = imported_count,
      warning_count = warnings_count,
      status = 'completed',
      completed_at = now()
  where id = batch_id;

  return jsonb_build_object(
    'batch_id', batch_id,
    'inserted', imported_count,
    'warnings', warnings_count
  );
end;
$$;

revoke all on function public.doc_import_sales_batch(text, text, jsonb) from public, anon;
grant execute on function public.doc_import_sales_batch(text, text, jsonb) to authenticated;

create or replace function public.doc_rollback_import_batch(target_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  blocked_count integer;
  deleted_count integer;
  imported_customer_ids uuid[];
begin
  if caller_id is null or not exists (
    select 1 from public.doc_user_profiles
    where id = caller_id and active and role = 'admin'
  ) then
    raise exception 'Only the DOC EASYCAR administrator can roll back an import';
  end if;

  if not exists (
    select 1 from public.doc_import_batches
    where id = target_batch_id and status = 'completed'
  ) then
    raise exception 'Completed import batch not found';
  end if;

  select count(*) into blocked_count
  from public.doc_import_batch_sales imported
  join public.doc_sales sale on sale.id = imported.sale_id
  where imported.batch_id = target_batch_id
    and (
      sale.status <> 'draft'
      or exists (select 1 from public.doc_sale_operations operation where operation.sale_id = sale.id)
      or exists (select 1 from public.doc_signing_requests request where request.sale_id = sale.id)
      or exists (select 1 from public.doc_sale_documents document where document.sale_id = sale.id)
    );

  if blocked_count > 0 then
    raise exception 'Rollback blocked: % imported records already contain operational or signing history', blocked_count;
  end if;

  select array_agg(distinct sale.customer_id)
  into imported_customer_ids
  from public.doc_import_batch_sales imported
  join public.doc_sales sale on sale.id = imported.sale_id
  where imported.batch_id = target_batch_id
    and sale.customer_id is not null;

  with removed as (
    delete from public.doc_sales sale
    using public.doc_import_batch_sales imported
    where imported.batch_id = target_batch_id
      and imported.sale_id = sale.id
    returning sale.id
  )
  select count(*) into deleted_count from removed;

  delete from public.doc_customers customer
  where customer.id = any(coalesce(imported_customer_ids, array[]::uuid[]))
    and not exists (
      select 1 from public.doc_sales sale where sale.customer_id = customer.id
    );

  update public.doc_import_batches
  set status = 'rolled_back',
      rolled_back_at = now(),
      rolled_back_by = caller_id
  where id = target_batch_id;

  return deleted_count;
end;
$$;

revoke all on function public.doc_rollback_import_batch(uuid) from public, anon;
grant execute on function public.doc_rollback_import_batch(uuid) to authenticated;
