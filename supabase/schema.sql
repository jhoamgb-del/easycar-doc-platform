create extension if not exists pgcrypto;

create table if not exists public.doc_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'seller' check (role in ('seller', 'manager', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doc_customers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.doc_user_profiles(id),
  full_name text not null default '',
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip_code text,
  driver_license text,
  latest_sale_id uuid,
  latest_vehicle text,
  latest_vin text,
  latest_contract_number text,
  last_transaction_date date,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doc_sales (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.doc_user_profiles(id),
  customer_id uuid references public.doc_customers(id),
  customer_name text not null default '',
  customer_email text,
  customer_phone text,
  vehicle_description text,
  vin text,
  stock_number text,
  contract_number text,
  transaction_date date,
  status text not null default 'draft' check (
    status in ('draft', 'ready', 'sent', 'viewed', 'signed_digital', 'signed_physical', 'declined', 'void')
  ),
  signature_method text check (signature_method in ('digital', 'physical')),
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doc_sales
add column if not exists customer_id uuid references public.doc_customers(id);

create table if not exists public.doc_sale_documents (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.doc_sales(id) on delete cascade,
  document_type text not null check (
    document_type in ('generated', 'signed_digital', 'signed_physical', 'audit_log', 'attachment')
  ),
  storage_path text not null,
  original_name text,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  sha256 text,
  uploaded_by uuid references public.doc_user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.doc_signing_requests (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.doc_sales(id) on delete cascade,
  provider text not null default 'docuseal' check (provider = 'docuseal'),
  provider_submission_id text not null,
  provider_submitter_id text,
  signer_email text not null,
  signer_name text,
  signing_url text,
  status text not null default 'sent' check (
    status in ('created', 'sent', 'opened', 'completed', 'declined', 'expired', 'failed')
  ),
  sent_by uuid not null references public.doc_user_profiles(id),
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_submission_id)
);

create table if not exists public.doc_signing_events (
  id uuid primary key default gen_random_uuid(),
  signing_request_id uuid references public.doc_signing_requests(id) on delete cascade,
  sale_id uuid references public.doc_sales(id) on delete cascade,
  provider text not null default 'docuseal',
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.doc_sale_operations (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.doc_sales(id) on delete cascade,
  module text not null check (
    module in ('insurance_gps', 'bhph', 'bank', 'repo', 'voluntary', 'mechanical', 'survey')
  ),
  event_type text not null default 'revision',
  status text not null default 'Registrado',
  follow_up_at date,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.doc_user_profiles(id),
  created_at timestamptz not null default now()
);

grant select, insert on public.doc_sale_operations to authenticated;

create index if not exists idx_doc_customers_created_by on public.doc_customers(created_by);
create index if not exists idx_doc_customers_updated_at on public.doc_customers(updated_at desc);
create index if not exists idx_doc_customers_email on public.doc_customers(lower(email));
create index if not exists idx_doc_customers_phone on public.doc_customers(phone);
create index if not exists idx_doc_sales_created_by on public.doc_sales(created_by);
create index if not exists idx_doc_sales_customer_id on public.doc_sales(customer_id);
create index if not exists idx_doc_sales_status on public.doc_sales(status);
create index if not exists idx_doc_sales_created_at on public.doc_sales(created_at desc);
create index if not exists idx_doc_sales_vin on public.doc_sales(vin);
create index if not exists idx_doc_sale_documents_sale_id on public.doc_sale_documents(sale_id);
create index if not exists idx_doc_signing_requests_sale_id on public.doc_signing_requests(sale_id);
create index if not exists idx_doc_sale_operations_sale_id on public.doc_sale_operations(sale_id);
create index if not exists idx_doc_sale_operations_module on public.doc_sale_operations(module);
create index if not exists idx_doc_sale_operations_created_at on public.doc_sale_operations(created_at desc);
create index if not exists idx_doc_sale_operations_follow_up_at on public.doc_sale_operations(follow_up_at);

create or replace function public.doc_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists doc_profiles_set_updated_at on public.doc_user_profiles;
create trigger doc_profiles_set_updated_at before update on public.doc_user_profiles
for each row execute function public.doc_set_updated_at();

drop trigger if exists doc_customers_set_updated_at on public.doc_customers;
create trigger doc_customers_set_updated_at before update on public.doc_customers
for each row execute function public.doc_set_updated_at();

drop trigger if exists doc_sales_set_updated_at on public.doc_sales;
create trigger doc_sales_set_updated_at before update on public.doc_sales
for each row execute function public.doc_set_updated_at();

drop trigger if exists doc_signing_requests_set_updated_at on public.doc_signing_requests;
create trigger doc_signing_requests_set_updated_at before update on public.doc_signing_requests
for each row execute function public.doc_set_updated_at();

create or replace function public.doc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.doc_user_profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_doc_profile on auth.users;
create trigger on_auth_user_created_doc_profile
after insert on auth.users
for each row execute function public.doc_handle_new_user();

insert into public.doc_user_profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', email, '')
from auth.users
on conflict (id) do nothing;

create or replace function public.doc_sync_customer_from_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source jsonb := coalesce(new.form_data, '{}'::jsonb);
  normalized_email text := nullif(lower(btrim(coalesce(new.customer_email, source ->> 'customer_email', ''))), '');
  normalized_phone text := nullif(regexp_replace(coalesce(new.customer_phone, source ->> 'phone', ''), '[^0-9]+', '', 'g'), '');
  customer_name text := nullif(btrim(coalesce(new.customer_name, '')), '');
  customer_address text := nullif(btrim(coalesce(source ->> 'address', '')), '');
  customer_city text := nullif(btrim(coalesce(source ->> 'city', '')), '');
  customer_state text := nullif(btrim(coalesce(source ->> 'state', '')), '');
  customer_zip text := nullif(btrim(coalesce(source ->> 'zip_code', '')), '');
  customer_license text := nullif(btrim(coalesce(source ->> 'driver_license', '')), '');
  target_customer_id uuid;
begin
  if new.created_by is null then
    return new;
  end if;

  if customer_name is null then
    customer_name := btrim(concat_ws(' ', source ->> 'first_name', source ->> 'middle_name', source ->> 'last_name', source ->> 'second_last_name'));
  end if;

  if normalized_email is not null then
    select id into target_customer_id
    from public.doc_customers
    where created_by = new.created_by
      and lower(email) = normalized_email
    order by updated_at desc
    limit 1;
  end if;

  if target_customer_id is null and normalized_phone is not null then
    select id into target_customer_id
    from public.doc_customers
    where created_by = new.created_by
      and regexp_replace(coalesce(phone, ''), '[^0-9]+', '', 'g') = normalized_phone
    order by updated_at desc
    limit 1;
  end if;

  if target_customer_id is null then
    insert into public.doc_customers (
      created_by, full_name, email, phone, address, city, state, zip_code,
      driver_license, latest_sale_id, latest_vehicle, latest_vin,
      latest_contract_number, last_transaction_date, form_data
    )
    values (
      new.created_by, coalesce(customer_name, ''), normalized_email, normalized_phone,
      customer_address, customer_city, customer_state, customer_zip,
      customer_license, new.id, new.vehicle_description, new.vin,
      new.contract_number, new.transaction_date, source
    )
    returning id into target_customer_id;
  else
    update public.doc_customers
    set
      full_name = coalesce(customer_name, full_name),
      email = coalesce(normalized_email, email),
      phone = coalesce(normalized_phone, phone),
      address = coalesce(customer_address, address),
      city = coalesce(customer_city, city),
      state = coalesce(customer_state, state),
      zip_code = coalesce(customer_zip, zip_code),
      driver_license = coalesce(customer_license, driver_license),
      latest_sale_id = new.id,
      latest_vehicle = coalesce(new.vehicle_description, latest_vehicle),
      latest_vin = coalesce(new.vin, latest_vin),
      latest_contract_number = coalesce(new.contract_number, latest_contract_number),
      last_transaction_date = coalesce(new.transaction_date, last_transaction_date),
      form_data = source
    where id = target_customer_id;
  end if;

  new.customer_id := target_customer_id;
  return new;
end;
$$;

drop trigger if exists doc_sales_sync_customer on public.doc_sales;
create trigger doc_sales_sync_customer before insert or update on public.doc_sales
for each row execute function public.doc_sync_customer_from_sale();

create or replace function public.doc_can_manage_all_sales()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doc_user_profiles
    where id = auth.uid() and active and role in ('manager', 'admin')
  );
$$;

create or replace function public.doc_can_admin_users()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doc_user_profiles
    where id = auth.uid() and active and role = 'admin'
  );
$$;

create or replace function public.doc_can_access_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doc_sales
    where id = target_sale_id
      and (created_by = auth.uid() or public.doc_can_manage_all_sales())
  );
$$;

alter table public.doc_user_profiles enable row level security;
alter table public.doc_customers enable row level security;
alter table public.doc_sales enable row level security;
alter table public.doc_sale_documents enable row level security;
alter table public.doc_signing_requests enable row level security;
alter table public.doc_signing_events enable row level security;
alter table public.doc_sale_operations enable row level security;

drop policy if exists "profiles_read" on public.doc_user_profiles;
create policy "profiles_read" on public.doc_user_profiles for select to authenticated
using (id = auth.uid() or public.doc_can_admin_users());

drop policy if exists "customers_read" on public.doc_customers;
create policy "customers_read" on public.doc_customers for select to authenticated
using (created_by = auth.uid() or public.doc_can_manage_all_sales());

drop policy if exists "customers_insert" on public.doc_customers;
create policy "customers_insert" on public.doc_customers for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "customers_update" on public.doc_customers;
create policy "customers_update" on public.doc_customers for update to authenticated
using (created_by = auth.uid() or public.doc_can_manage_all_sales())
with check (created_by = auth.uid() or public.doc_can_manage_all_sales());

drop policy if exists "sales_read" on public.doc_sales;
create policy "sales_read" on public.doc_sales for select to authenticated
using (created_by = auth.uid() or public.doc_can_manage_all_sales());

drop policy if exists "sales_insert" on public.doc_sales;
create policy "sales_insert" on public.doc_sales for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "sales_update" on public.doc_sales;
create policy "sales_update" on public.doc_sales for update to authenticated
using (created_by = auth.uid() or public.doc_can_manage_all_sales())
with check (created_by = auth.uid() or public.doc_can_manage_all_sales());

drop policy if exists "documents_read" on public.doc_sale_documents;
create policy "documents_read" on public.doc_sale_documents for select to authenticated
using (public.doc_can_access_sale(sale_id));

drop policy if exists "documents_insert" on public.doc_sale_documents;
create policy "documents_insert" on public.doc_sale_documents for insert to authenticated
with check (
  public.doc_can_access_sale(sale_id)
  and uploaded_by = auth.uid()
  and document_type <> 'signed_digital'
);

drop policy if exists "signing_requests_read" on public.doc_signing_requests;
create policy "signing_requests_read" on public.doc_signing_requests for select to authenticated
using (public.doc_can_access_sale(sale_id));

drop policy if exists "signing_events_read" on public.doc_signing_events;
create policy "signing_events_read" on public.doc_signing_events for select to authenticated
using (public.doc_can_access_sale(sale_id));

drop policy if exists "operations_read" on public.doc_sale_operations;
create policy "operations_read" on public.doc_sale_operations for select to authenticated
using (public.doc_can_access_sale(sale_id));

drop policy if exists "operations_insert" on public.doc_sale_operations;
create policy "operations_insert" on public.doc_sale_operations for insert to authenticated
with check (public.doc_can_access_sale(sale_id) and created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('easycar-documents', 'easycar-documents', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "doc_sale_files_read" on storage.objects;
create policy "doc_sale_files_read" on storage.objects for select to authenticated
using (
  bucket_id = 'easycar-documents'
  and public.doc_can_access_sale(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "doc_sale_files_insert" on storage.objects;
create policy "doc_sale_files_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'easycar-documents'
  and public.doc_can_access_sale(((storage.foldername(name))[1])::uuid)
  and coalesce((storage.foldername(name))[2], '') <> 'digital'
);

drop policy if exists "doc_sale_files_update" on storage.objects;

-- After creating the first user in Supabase Auth, promote the owner manually:
-- update public.doc_user_profiles set role = 'admin' where id = 'USER_UUID';
