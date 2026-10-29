-- 0002_reply_moderation: AI reply drafts + human moderation state, stored on the review row. Safe to re-run.
-- reply_status: null = no draft yet | pending = awaiting moderation | approved = ready to post | posted | rejected
alter table reviews add column if not exists reply_draft text;
alter table reviews add column if not exists reply_final text;
alter table reviews add column if not exists reply_status text check (reply_status in ('pending', 'approved', 'posted', 'rejected'));
alter table reviews add column if not exists reply_reviewed_at timestamptz;

create index if not exists reviews_reply_status on reviews (reply_status) where reply_status is not null;

insert into schema_migrations (version) values ('0002_reply_moderation') on conflict do nothing;
