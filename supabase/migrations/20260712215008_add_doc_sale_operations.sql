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

create index if not exists idx_doc_sale_operations_sale_id on public.doc_sale_operations(sale_id);
create index if not exists idx_doc_sale_operations_module on public.doc_sale_operations(module);
create index if not exists idx_doc_sale_operations_created_at on public.doc_sale_operations(created_at desc);
create index if not exists idx_doc_sale_operations_follow_up_at on public.doc_sale_operations(follow_up_at);

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

alter table public.doc_sale_operations enable row level security;

drop policy if exists "profiles_read" on public.doc_user_profiles;
create policy "profiles_read" on public.doc_user_profiles for select to authenticated
using (id = auth.uid() or public.doc_can_admin_users());

drop policy if exists "operations_read" on public.doc_sale_operations;
create policy "operations_read" on public.doc_sale_operations for select to authenticated
using (public.doc_can_access_sale(sale_id));

drop policy if exists "operations_insert" on public.doc_sale_operations;
create policy "operations_insert" on public.doc_sale_operations for insert to authenticated
with check (public.doc_can_access_sale(sale_id) and created_by = auth.uid());
