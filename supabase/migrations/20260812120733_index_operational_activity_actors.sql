create index if not exists idx_doc_activities_created_by
  on public.doc_activities(created_by);

create index if not exists idx_doc_activities_completed_by
  on public.doc_activities(completed_by)
  where completed_by is not null;

create index if not exists idx_doc_activity_events_actor
  on public.doc_activity_events(actor_id)
  where actor_id is not null;
