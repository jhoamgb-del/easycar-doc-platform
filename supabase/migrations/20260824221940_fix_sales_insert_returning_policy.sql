drop policy if exists "sales_read" on public.doc_sales;

create policy "sales_read"
on public.doc_sales
for select
to authenticated
using (
  public.doc_is_active_user()
  and (
    created_by = (select auth.uid())
    or public.doc_can_manage_all_sales()
  )
);

