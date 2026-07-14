-- Operator work history is append-only. Reviews, notes and scheduled follow-ups
-- must remain available to the owner after they are recorded.
drop policy if exists "operations_delete" on public.doc_sale_operations;
