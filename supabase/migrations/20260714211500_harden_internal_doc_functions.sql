-- These functions are invoked only by database triggers and must not be callable
-- through the public REST RPC surface.
revoke execute on function public.doc_handle_new_user() from public, anon, authenticated;
revoke execute on function public.doc_sync_customer_from_sale() from public, anon, authenticated;
