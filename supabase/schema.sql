create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  second_last_name text,
  co_buyer_name text,
  address text,
  city text,
  state text,
  zip_code text,
  email text,
  phone text,
  driver_license text,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  vin text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  stock_number text,
  created_at timestamptz not null default now()
);

create table if not exists document_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  contract_number text,
  transaction_date text,
  sales_rep_name text,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_vehicles_vin on vehicles(vin);
create index if not exists idx_document_sessions_created_at on document_sessions(created_at desc);

alter table customers enable row level security;
alter table vehicles enable row level security;
alter table document_sessions enable row level security;

drop policy if exists "Allow public customer inserts" on customers;
drop policy if exists "Allow public vehicle inserts" on vehicles;
drop policy if exists "Allow public document session inserts" on document_sessions;

create policy "Allow public customer inserts"
on customers for insert
to anon, authenticated
with check (true);

create policy "Allow public vehicle inserts"
on vehicles for insert
to anon, authenticated
with check (true);

create policy "Allow public document session inserts"
on document_sessions for insert
to anon, authenticated
with check (true);
