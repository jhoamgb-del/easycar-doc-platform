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

  -- An autosave updates the same sale repeatedly while the operator is still
  -- entering identity fields. Keep its existing customer instead of creating
  -- a new customer each time email and phone are temporarily blank.
  if tg_op = 'UPDATE' and new.customer_id is not null then
    select id into target_customer_id
    from public.doc_customers
    where id = new.customer_id
      and created_by = new.created_by;
  end if;

  if target_customer_id is null then
    select id into target_customer_id
    from public.doc_customers
    where created_by = new.created_by
      and latest_sale_id = new.id
    order by updated_at desc
    limit 1;
  end if;

  if target_customer_id is null and normalized_email is not null then
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

revoke execute on function public.doc_sync_customer_from_sale() from public, anon, authenticated;
