alter table public.doc_sales
  drop constraint if exists doc_sales_status_check;

alter table public.doc_sales
  add constraint doc_sales_status_check
  check (status = any (array[
    'draft'::text,
    'ready'::text,
    'sent'::text,
    'viewed'::text,
    'signed_digital'::text,
    'signed_physical'::text,
    'declined'::text,
    'expired'::text,
    'void'::text
  ]));

update public.doc_signing_requests request
set status = 'expired'
where request.status in ('created', 'sent', 'opened')
  and exists (
    select 1
    from public.doc_signing_events event
    where event.signing_request_id = request.id
      and event.event_type = 'submission.expired'
  );

update public.doc_sales sale
set status = 'expired'
where sale.status in ('sent', 'viewed')
  and exists (
    select 1
    from public.doc_signing_requests request
    where request.sale_id = sale.id
      and request.status = 'expired'
  );
