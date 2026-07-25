create or replace function public.doc_save_insurance_gps_event(
  target_sale_id uuid,
  sale_patch jsonb,
  operation_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  operation jsonb;
  first_operation_id uuid;
  inserted_operation_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.doc_user_profiles profile
    where profile.id = caller_id
      and profile.active
  ) then
    raise exception 'Active DOC EASYCAR user required';
  end if;

  if not exists (
    select 1
    from public.doc_sales sale
    where sale.id = target_sale_id
      and (
        sale.created_by = caller_id
        or exists (
          select 1
          from public.doc_user_profiles profile
          where profile.id = caller_id
            and profile.active
            and profile.role in ('admin', 'manager')
        )
      )
  ) then
    raise exception 'Sale not found or access denied';
  end if;

  if jsonb_typeof(coalesce(operation_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(operation_rows, '[]'::jsonb)) = 0 then
    raise exception 'At least one audit operation is required';
  end if;

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

  for operation in
    select value from jsonb_array_elements(operation_rows)
  loop
    insert into public.doc_sale_operations (
      sale_id,
      module,
      event_type,
      status,
      follow_up_at,
      note,
      payload,
      created_by
    ) values (
      target_sale_id,
      coalesce(nullif(operation ->> 'module', ''), 'insurance_gps'),
      coalesce(nullif(operation ->> 'event_type', ''), 'revision_realizada'),
      nullif(operation ->> 'status', ''),
      nullif(operation ->> 'follow_up_at', '')::date,
      nullif(operation ->> 'note', ''),
      coalesce(operation -> 'payload', '{}'::jsonb),
      caller_id
    )
    returning id into inserted_operation_id;

    first_operation_id := coalesce(first_operation_id, inserted_operation_id);
  end loop;

  return first_operation_id;
end;
$$;

revoke all on function public.doc_save_insurance_gps_event(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.doc_save_insurance_gps_event(uuid, jsonb, jsonb) to authenticated;
