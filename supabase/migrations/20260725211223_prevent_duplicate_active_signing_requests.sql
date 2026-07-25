create unique index if not exists uq_doc_signing_requests_active_sale
on public.doc_signing_requests (sale_id)
where status in ('created', 'sent', 'opened', 'completed');
