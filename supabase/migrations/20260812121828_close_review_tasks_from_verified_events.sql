create or replace function public.doc_close_review_tasks_from_verified_events()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  review_type text;
begin
  review_type := case
    when lower(new.event_type) = 'verificacion seguro' then 'insurance_review'
    when lower(new.event_type) in ('verificacion gps', 'revision gps') then 'gps_review'
    else null
  end;

  if review_type is null then return new; end if;

  update public.doc_activities
  set status = 'completed',
      completed_by = new.created_by,
      completed_at = new.created_at
  where sale_id = new.sale_id
    and activity_type = review_type
    and status = 'pending';

  return new;
end;
$$;

drop trigger if exists doc_sale_operations_close_review_tasks on public.doc_sale_operations;
create trigger doc_sale_operations_close_review_tasks
after insert on public.doc_sale_operations
for each row execute function public.doc_close_review_tasks_from_verified_events();
