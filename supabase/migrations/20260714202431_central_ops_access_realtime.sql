-- Shared operations account: can view the central archive without gaining user administration.
update public.doc_user_profiles profile
set role = 'manager', updated_at = now()
from auth.users account
where profile.id = account.id
  and lower(account.email) = 'sales@easycarus.com';

drop policy if exists "profiles_read" on public.doc_user_profiles;
create policy "profiles_read" on public.doc_user_profiles for select to authenticated
using (id = auth.uid() or public.doc_can_manage_all_sales());

drop policy if exists "operations_delete" on public.doc_sale_operations;
create policy "operations_delete" on public.doc_sale_operations for delete to authenticated
using (
  public.doc_can_access_sale(sale_id)
  and (created_by = auth.uid() or public.doc_can_manage_all_sales())
);

-- These tables drive the shared archive and operational dashboard without polling.
alter publication supabase_realtime add table public.doc_sales;
alter publication supabase_realtime add table public.doc_sale_operations;

-- Policy helpers are only called by authenticated application sessions.
revoke execute on function public.doc_can_access_sale(uuid) from public;
revoke execute on function public.doc_can_manage_all_sales() from public;
revoke execute on function public.doc_can_admin_users() from public;
grant execute on function public.doc_can_access_sale(uuid) to authenticated;
grant execute on function public.doc_can_manage_all_sales() to authenticated;
grant execute on function public.doc_can_admin_users() to authenticated;
