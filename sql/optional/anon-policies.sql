-- ONLY if you use the publishable (anon) key. That key is public by design: with these policies anyone who has it
-- can read and write these tables. Prefer a secret key (bypasses RLS, stays inside n8n) and skip this file.
drop policy if exists "anon read" on businesses;
create policy "anon read"   on businesses       for select to anon using (true);
drop policy if exists "anon write" on businesses;
create policy "anon write"  on businesses       for insert to anon with check (true);
drop policy if exists "anon update" on businesses;
create policy "anon update" on businesses       for update to anon using (true) with check (true);
drop policy if exists "anon read" on reviews;
create policy "anon read"   on reviews          for select to anon using (true);
drop policy if exists "anon write" on reviews;
create policy "anon write"  on reviews          for insert to anon with check (true);
drop policy if exists "anon read" on automation_runs;
create policy "anon read"   on automation_runs  for select to anon using (true);
drop policy if exists "anon write" on automation_runs;
create policy "anon write"  on automation_runs  for insert to anon with check (true);
