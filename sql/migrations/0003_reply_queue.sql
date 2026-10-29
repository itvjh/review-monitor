-- 0003_reply_queue: posting queue state for approved replies (one post at a time, spaced apart). Safe to re-run.
-- reply_queued_at: when the reply entered the queue (approval time); the queue is served oldest first.
-- reply_attempts / reply_last_attempt_at: how many times and when we last touched Google for it (the spacing rule uses the latest one).
-- reply_error: last failure shown to the moderator; cleared on success or retry.
alter table reviews add column if not exists reply_queued_at timestamptz;
alter table reviews add column if not exists reply_attempts integer not null default 0;
alter table reviews add column if not exists reply_last_attempt_at timestamptz;
alter table reviews add column if not exists reply_error text;

create index if not exists reviews_reply_queue on reviews (reply_queued_at) where reply_status = 'approved';

-- replies approved before this migration keep their approval time as their queue position
update reviews set reply_queued_at = reply_reviewed_at where reply_status = 'approved' and reply_queued_at is null;

insert into schema_migrations (version) values ('0003_reply_queue') on conflict do nothing;
