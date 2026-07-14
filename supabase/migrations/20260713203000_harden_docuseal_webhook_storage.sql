drop policy if exists "documents_insert" on public.doc_sale_documents;
create policy "documents_insert" on public.doc_sale_documents for insert to authenticated
with check (
  public.doc_can_access_sale(sale_id)
  and uploaded_by = auth.uid()
  and document_type <> 'signed_digital'
);

drop policy if exists "doc_sale_files_insert" on storage.objects;
create policy "doc_sale_files_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'easycar-documents'
  and public.doc_can_access_sale(((storage.foldername(name))[1])::uuid)
  and coalesce((storage.foldername(name))[2], '') <> 'digital'
);

drop policy if exists "doc_sale_files_update" on storage.objects;
