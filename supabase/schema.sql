create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'seller' check (role in ('seller', 'manager', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
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

create table if not exists public.sale_documents (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  document_type text not null check (
    document_type in ('generated', 'signed_digital', 'signed_physical', 'audit_log', 'attachment')
  ),
  storage_path text not null,
  original_name text,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  sha256 text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.signing_requests (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  provider text not null default 'docuseal' check (provider = 'docuseal'),
  provider_submission_id text not null,
  provider_submitter_id text,
  signer_email text not null,
  signer_name text,
  signing_url text,
  status text not null default 'sent' check (
    status in ('created', 'sent', 'opened', 'completed', 'declined', 'expired', 'failed')
  ),
  sent_by uuid not null references public.profiles(id),
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_submission_id)
);

create table if not exists public.signing_events (
  id uuid primary key default gen_random_uuid(),
  signing_request_id uuid references public.signing_requests(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  provider text not null default 'docuseal',
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_sales_created_by on public.sales(created_by);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sales_vin on public.sales(vin);
create index if not exists idx_sale_documents_sale_id on public.sale_documents(sale_id);
create index if not exists idx_signing_requests_sale_id on public.signing_requests(sale_id);

create or replace function public.set_updated_at()
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

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists signing_requests_set_updated_at on public.signing_requests;
create trigger signing_requests_set_updated_at before update on public.signing_requests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.can_manage_all_sales()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('manager', 'admin')
  );
$$;

create or replace function public.can_access_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sales
    where id = target_sale_id
      and (created_by = auth.uid() or public.can_manage_all_sales())
  );
$$;

alter table public.profiles enable row level security;
alter table public.sales enable row level security;
alter table public.sale_documents enable row level security;
alter table public.signing_requests enable row level security;
alter table public.signing_events enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated
using (id = auth.uid() or public.can_manage_all_sales());

drop policy if exists "sales_read" on public.sales;
create policy "sales_read" on public.sales for select to authenticated
using (created_by = auth.uid() or public.can_manage_all_sales());

drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "sales_update" on public.sales;
create policy "sales_update" on public.sales for update to authenticated
using (created_by = auth.uid() or public.can_manage_all_sales())
with check (created_by = auth.uid() or public.can_manage_all_sales());

drop policy if exists "documents_read" on public.sale_documents;
create policy "documents_read" on public.sale_documents for select to authenticated
using (public.can_access_sale(sale_id));

drop policy if exists "documents_insert" on public.sale_documents;
create policy "documents_insert" on public.sale_documents for insert to authenticated
with check (public.can_access_sale(sale_id) and uploaded_by = auth.uid());

drop policy if exists "signing_requests_read" on public.signing_requests;
create policy "signing_requests_read" on public.signing_requests for select to authenticated
using (public.can_access_sale(sale_id));

drop policy if exists "signing_events_read" on public.signing_events;
create policy "signing_events_read" on public.signing_events for select to authenticated
using (public.can_access_sale(sale_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-documents', 'sale-documents', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sale_files_read" on storage.objects;
create policy "sale_files_read" on storage.objects for select to authenticated
using (
  bucket_id = 'sale-documents'
  and public.can_access_sale(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "sale_files_insert" on storage.objects;
create policy "sale_files_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'sale-documents'
  and public.can_access_sale(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "sale_files_update" on storage.objects;
create policy "sale_files_update" on storage.objects for update to authenticated
using (
  bucket_id = 'sale-documents'
  and public.can_access_sale(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'sale-documents'
  and public.can_access_sale(((storage.foldername(name))[1])::uuid)
);

-- After creating the first user in Supabase Auth, promote the owner manually:
-- update public.profiles set role = 'admin' where id = 'USER_UUID';
