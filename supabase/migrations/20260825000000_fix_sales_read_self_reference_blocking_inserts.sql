-- The previous "sales_read" policy used doc_can_access_sale(id), which runs
-- its own "select ... from doc_sales where id = target_sale_id" lookup.
-- That self-reference to the same table breaks specifically for brand-new
-- rows: PostgREST wraps every insert().select() as
--   with pgrst_source as (insert into doc_sales ... returning *)
--   select ... from pgrst_source
-- and the outer select re-checks the SELECT policy on the just-inserted row
-- (required so RETURNING never exposes a row the caller isn't allowed to
-- read). Postgres does not reliably expose an uncommitted row inserted in
-- the same statement to a separate stable-function subquery against the
-- same table, so the check silently failed and Postgres reported it as
-- "new row violates row-level security policy for table doc_sales" --
-- blocking every new sale (and therefore every new customer) since the
-- policy was rewritten on 2026-08-12, while edits to existing sales kept
-- working because those rows were already committed in an earlier request.
--
-- The fix inlines the same authorization rule (own sales, or manager/admin)
-- directly against the row's own columns, with no self-join back into
-- doc_sales.
drop policy if exists "sales_read" on public.doc_sales;
create policy "sales_read" on public.doc_sales for select to authenticated
using (
  public.doc_is_active_user()
  and (created_by = (select auth.uid()) or public.doc_can_manage_all_sales())
);
