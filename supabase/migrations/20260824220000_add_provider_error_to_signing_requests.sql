alter table public.doc_signing_requests
  add column if not exists provider_error jsonb;

comment on column public.doc_signing_requests.provider_error is
  'Raw diagnostic detail (message, http status, response body) captured when a DocuSeal submission attempt fails or is not fully confirmed.';
