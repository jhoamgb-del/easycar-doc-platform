-- These helpers are used only by RLS policies. They must not be callable
-- through the anonymous PostgREST RPC surface.
revoke execute on function public.doc_can_access_sale(uuid) from public, anon;
revoke execute on function public.doc_can_manage_all_sales() from public, anon;
revoke execute on function public.doc_can_admin_users() from public, anon;

grant execute on function public.doc_can_access_sale(uuid) to authenticated;
grant execute on function public.doc_can_manage_all_sales() to authenticated;
grant execute on function public.doc_can_admin_users() to authenticated;
