-- One 'recordatorio_revision_vencida' event per sale per UTC day, so the
-- daily overdue-review cron (api/reminders/overdue-review.js) can't ever
-- double-log or double-email the same case even if it runs twice the
-- same day. The cron itself also checks before inserting; this index is
-- the hard backstop at the database level.
create unique index if not exists idx_doc_sale_operations_overdue_reminder_daily
on public.doc_sale_operations (sale_id, ((created_at at time zone 'utc')::date))
where event_type = 'recordatorio_revision_vencida';
