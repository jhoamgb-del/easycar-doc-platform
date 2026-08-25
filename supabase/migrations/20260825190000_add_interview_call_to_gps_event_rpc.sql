-- Extends doc_save_insurance_gps_event (unchanged otherwise) so it also
-- recognizes event_type = 'proxima_llamada_entrevista' and creates the
-- matching doc_activities row (activity_type: 'interview_call', module:
-- 'survey'), the same way it already does for 'proxima_revision_seguro'
-- and 'proxima_revision_gps'. Used by the client to auto-schedule the
-- day-after GPS review, insurance review, and interview call together
-- when a new BHPH/BANCO sale is first saved.
create or replace function public.doc_save_insurance_gps_event(
  target_sale_id uuid,
  sale_patch jsonb,
  operation_rows jsonb
)
returns uuid
language plpgsql
set search_path to ''
as $function$
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
    elsif operation_event_type = 'proxima_llamada_entrevista' then
      operation_title := 'Llamar para entrevista y confirmar referencias';
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
          when 'proxima_llamada_entrevista' then 'interview_call'
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
$function$;
