-- The owner asked for two complementary safeguards on doc_sales edits:
-- prevention (once a sale is signed -- digital or physical -- it is a
-- legal document and nobody, including the owner, should be able to
-- rewrite it from the form; a correction is handled as an addendum
-- outside the system) and detection (while a sale is still a draft,
-- any edit an operator makes must leave a full field-level trace).

-- Prevention: narrow sales_update so a row can only be the target of an
-- UPDATE while it is NOT already signed. USING is evaluated against the
-- pre-update row, so the draft/sent -> signed_digital/signed_physical
-- transition itself is unaffected (the row isn't signed yet at that
-- point) -- both api/signature/webhook.js (adminClient, bypasses RLS
-- anyway) and markSignedPhysicalAndNotify() in src/cloud.js (regular
-- authenticated client) keep working. Any further UPDATE attempt once
-- the row is already signed is rejected.
drop policy if exists "sales_update" on public.doc_sales;
create policy "sales_update" on public.doc_sales for update to authenticated
using (
  public.doc_can_access_sale(id)
  and status not in ('signed_digital', 'signed_physical')
)
with check (created_by is not null and public.doc_can_access_sale(id));

-- Detection: append-only change log for whatever edits happen before a
-- sale is signed. Same read-access shape as doc_sale_operations
-- (operations_read); no insert/update/delete policy for authenticated
-- users -- only the security definer trigger function below writes to
-- it, mirroring doc_audit_activity_change()'s existing pattern for
-- doc_activity_events.
create table if not exists public.doc_sales_change_log (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.doc_sales(id) on delete cascade,
  changed_by uuid references public.doc_user_profiles(id),
  changed_at timestamptz not null default now(),
  changed_fields jsonb not null
);

create index if not exists idx_doc_sales_change_log_sale on public.doc_sales_change_log(sale_id, changed_at desc);

alter table public.doc_sales_change_log enable row level security;
grant select on public.doc_sales_change_log to authenticated;

drop policy if exists "sales_change_log_read" on public.doc_sales_change_log;
create policy "sales_change_log_read" on public.doc_sales_change_log for select to authenticated
using (public.doc_can_access_sale(sale_id));

create or replace function public.doc_audit_sale_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb := '{}'::jsonb;
  form_key text;
  old_val jsonb;
  new_val jsonb;
begin
  if old.customer_name is distinct from new.customer_name then
    diff := diff || jsonb_build_object('customer_name', jsonb_build_array(old.customer_name, new.customer_name));
  end if;
  if old.customer_email is distinct from new.customer_email then
    diff := diff || jsonb_build_object('customer_email', jsonb_build_array(old.customer_email, new.customer_email));
  end if;
  if old.customer_phone is distinct from new.customer_phone then
    diff := diff || jsonb_build_object('customer_phone', jsonb_build_array(old.customer_phone, new.customer_phone));
  end if;
  if old.vehicle_description is distinct from new.vehicle_description then
    diff := diff || jsonb_build_object('vehicle_description', jsonb_build_array(old.vehicle_description, new.vehicle_description));
  end if;
  if old.vin is distinct from new.vin then
    diff := diff || jsonb_build_object('vin', jsonb_build_array(old.vin, new.vin));
  end if;
  if old.stock_number is distinct from new.stock_number then
    diff := diff || jsonb_build_object('stock_number', jsonb_build_array(old.stock_number, new.stock_number));
  end if;
  if old.contract_number is distinct from new.contract_number then
    diff := diff || jsonb_build_object('contract_number', jsonb_build_array(old.contract_number, new.contract_number));
  end if;
  if old.transaction_date is distinct from new.transaction_date then
    diff := diff || jsonb_build_object('transaction_date', jsonb_build_array(old.transaction_date, new.transaction_date));
  end if;
  if old.status is distinct from new.status then
    diff := diff || jsonb_build_object('status', jsonb_build_array(old.status, new.status));
  end if;
  if old.signature_method is distinct from new.signature_method then
    diff := diff || jsonb_build_object('signature_method', jsonb_build_array(old.signature_method, new.signature_method));
  end if;

  for form_key in
    select k from (
      select jsonb_object_keys(coalesce(old.form_data, '{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(new.form_data, '{}'::jsonb)) as k
    ) keys
  loop
    old_val := old.form_data -> form_key;
    new_val := new.form_data -> form_key;
    if old_val is distinct from new_val then
      diff := diff || jsonb_build_object(form_key, jsonb_build_array(old_val, new_val));
    end if;
  end loop;

  if diff <> '{}'::jsonb then
    insert into public.doc_sales_change_log (sale_id, changed_by, changed_fields)
    values (new.id, auth.uid(), diff);
  end if;
  return new;
end;
$$;

revoke all on function public.doc_audit_sale_change() from public, anon, authenticated;

drop trigger if exists doc_sales_audit_change on public.doc_sales;
create trigger doc_sales_audit_change
after update on public.doc_sales
for each row execute function public.doc_audit_sale_change();
