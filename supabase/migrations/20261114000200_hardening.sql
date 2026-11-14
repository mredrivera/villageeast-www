-- Hardening found in code review. Members hold their own access token, so they can call the data API
-- directly; these rules must hold without any help from the web server.

-- 1. Secret ballots: tallies are visible only after voting closes, for everyone. Previously board
--    members could read a live tally, and comparing successive tallies with the time each lot voted
--    (recorded in the audit log) would reveal how a lot voted.
create or replace function public.ballot_results(p_ballot uuid)
  returns table (question_id uuid, option_id text, votes bigint)
  language plpgsql stable security definer set search_path = '' as
$$
declare b public.ballots;
begin
  select * into b from public.ballots where id = p_ballot;
  if not found then return; end if;
  if not (private.is_member() and b.status = 'published' and now() >= b.closes_at) then
    raise exception 'Results are available after voting closes' using errcode = '42501';
  end if;
  return query
    select v.question_id, v.option_id, count(*) from public.ballot_votes v
    where v.ballot_id = p_ballot group by v.question_id, v.option_id;
end
$$;

-- 2. A ballot that has left draft can never return to it. Questions are only editable in draft, so
--    this guarantees the questions cannot change once members may have voted. A ballot with votes
--    also cannot be reopened after it has closed or have its opening moved.
create function private.protect_ballot() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'A published ballot cannot be returned to draft' using errcode = 'P0001';
  end if;
  if (new.closes_at is distinct from old.closes_at or new.opens_at is distinct from old.opens_at)
     and exists (select 1 from public.ballot_receipts r where r.ballot_id = old.id) then
    if old.closes_at <= now() then
      raise exception 'A closed ballot with votes cannot be reopened' using errcode = 'P0001';
    end if;
    if new.opens_at is distinct from old.opens_at then
      raise exception 'The opening time cannot change after voting has started' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;
create trigger protect_ballot before update on public.ballots
  for each row execute function private.protect_ballot();

-- 3. Attachments: a member may only register a file stored under their own request's folder, so a
--    row can never be pointed at some other object in the bucket.
drop policy submission_files_insert on public.submission_files;
create policy submission_files_insert on public.submission_files for insert to authenticated
  with check (
    exists (select 1 from public.form_submissions s where s.id = submission_id and s.user_id = (select auth.uid()))
    and storage_path like submission_id::text || '/%'
    and position('..' in storage_path) = 0
    and char_length(file_name) <= 200 and size_bytes between 1 and 10485760
  );

-- 4. Request timeline: members may add comments (and the initial "submitted" entry) only. They can
--    no longer attach a status to an entry.
drop policy submission_events_insert on public.submission_events;
create policy submission_events_insert on public.submission_events for insert to authenticated
  with check (
    actor = (select auth.uid())
    and exists (select 1 from public.form_submissions s where s.id = submission_id)
    and (
      private.is_staff()
      or (kind = 'comment' and status is null)
      or (kind = 'submitted' and status = 'submitted' and note is null)
    )
  );

-- 5. Bound the size of what a member can store in a request.
alter table public.form_submissions
  add constraint form_submissions_data_size check (pg_column_size(data) <= 131072),
  add constraint form_submissions_summary_len check (char_length(summary) <= 200),
  add constraint form_submissions_note_len check (decision_note is null or char_length(decision_note) <= 4000);
