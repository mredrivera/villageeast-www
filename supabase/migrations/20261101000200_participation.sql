-- Surveys, ballots (secret, one vote per lot) and online request forms.

-- ---------------------------------------------------------------------------------------------
-- Surveys
-- ---------------------------------------------------------------------------------------------
create table public.surveys (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title       text not null check (char_length(title) between 1 and 160),
  intro       text,
  fields      jsonb not null default '[]',
  anonymous   boolean not null default false,
  status      text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at   timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.survey_responses (
  id         uuid primary key default gen_random_uuid(),
  survey_id  uuid not null references public.surveys (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,  -- null when the survey is anonymous
  lot_id     text references public.lots (id) on delete set null,      -- null when the survey is anonymous
  answers    jsonb not null,
  created_at timestamptz not null default now()
);
create index survey_responses_survey_idx on public.survey_responses (survey_id);

-- Who has responded (kept apart from the answers so anonymous surveys stay anonymous).
create table public.survey_receipts (
  survey_id  uuid not null references public.surveys (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (survey_id, user_id)
);

create function public.submit_survey(p_survey uuid, p_answers jsonb) returns uuid
  language plpgsql security definer set search_path = '' as
$$
declare s public.surveys; uid uuid := (select auth.uid()); rid uuid;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  select * into s from public.surveys where id = p_survey;
  if not found or s.status <> 'open' or (s.closes_at is not null and s.closes_at < now()) then
    raise exception 'This survey is not open' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 65536 then
    raise exception 'Invalid answers' using errcode = 'P0001';
  end if;
  begin
    insert into public.survey_receipts (survey_id, user_id) values (p_survey, uid);
  exception when unique_violation then
    raise exception 'You have already responded to this survey' using errcode = 'P0002';
  end;
  insert into public.survey_responses (survey_id, user_id, lot_id, answers)
  values (p_survey, case when s.anonymous then null else uid end,
          case when s.anonymous then null else private.my_lot() end, p_answers)
  returning id into rid;
  return rid;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Ballots: one vote per lot; the receipt (who voted) and the votes (what was chosen) are stored in
-- separate tables with no link between them, so individual choices cannot be traced.
-- ---------------------------------------------------------------------------------------------
create table public.ballots (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  description text,
  opens_at    timestamptz not null default now(),
  closes_at   timestamptz not null,
  status      text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.ballot_questions (
  id          uuid primary key default gen_random_uuid(),
  ballot_id   uuid not null references public.ballots (id) on delete cascade,
  position    int not null default 0,
  prompt      text not null check (char_length(prompt) between 1 and 500),
  detail      text,
  max_choices int not null default 1 check (max_choices between 1 and 20),
  options     jsonb not null check (jsonb_typeof(options) = 'array')  -- [{ "id": "yes", "label": "Yes" }, ...]
);
create index ballot_questions_ballot_idx on public.ballot_questions (ballot_id, position);

create table public.ballot_receipts (
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  lot_id    text not null references public.lots (id) on delete cascade,
  voter_id  uuid references public.profiles (id) on delete set null,
  cast_at   timestamptz not null default now(),
  primary key (ballot_id, lot_id)
);

create table public.ballot_votes (
  id          bigint generated always as identity primary key,
  ballot_id   uuid not null references public.ballots (id) on delete cascade,
  question_id uuid not null references public.ballot_questions (id) on delete cascade,
  option_id   text not null
);
create index ballot_votes_idx on public.ballot_votes (ballot_id, question_id);

create function private.ballot_is_open(b public.ballots) returns boolean
  language sql stable set search_path = '' as
$$ select b.status = 'published' and now() >= b.opens_at and now() < b.closes_at $$;

create function public.cast_ballot(p_ballot uuid, p_choices jsonb) returns void
  language plpgsql security definer set search_path = '' as
$$
declare
  b public.ballots; q public.ballot_questions; v_lot text := private.my_lot();
  picked jsonb; opt text; n int;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if v_lot is null then
    raise exception 'Your account is not linked to a lot, so it cannot vote' using errcode = 'P0001';
  end if;
  select * into b from public.ballots where id = p_ballot;
  if not found or not private.ballot_is_open(b) then
    raise exception 'This ballot is not open for voting' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_choices) <> 'object' then raise exception 'Invalid ballot' using errcode = 'P0001'; end if;

  begin
    insert into public.ballot_receipts (ballot_id, lot_id, voter_id) values (p_ballot, v_lot, (select auth.uid()));
  exception when unique_violation then
    raise exception 'A vote has already been cast for your lot' using errcode = 'P0002';
  end;

  for q in select * from public.ballot_questions where ballot_id = p_ballot loop
    picked := coalesce(p_choices -> q.id::text, '[]'::jsonb);
    if jsonb_typeof(picked) <> 'array' then raise exception 'Invalid ballot' using errcode = 'P0001'; end if;
    n := jsonb_array_length(picked);
    if n > q.max_choices then
      raise exception 'Too many selections for "%"', q.prompt using errcode = 'P0001';
    end if;
    if (select count(distinct x) from jsonb_array_elements_text(picked) x) <> n then
      raise exception 'Duplicate selections' using errcode = 'P0001';
    end if;
    for opt in select jsonb_array_elements_text(picked) loop
      if not exists (select 1 from jsonb_array_elements(q.options) o where o ->> 'id' = opt) then
        raise exception 'Unknown option' using errcode = 'P0001';
      end if;
      insert into public.ballot_votes (ballot_id, question_id, option_id) values (p_ballot, q.id, opt);
    end loop;
  end loop;
end
$$;

-- Tallies: staff any time; members only once voting has closed.
create function public.ballot_results(p_ballot uuid)
  returns table (question_id uuid, option_id text, votes bigint)
  language plpgsql stable security definer set search_path = '' as
$$
declare b public.ballots;
begin
  select * into b from public.ballots where id = p_ballot;
  if not found then return; end if;
  if not (private.is_staff() or (private.is_member() and b.status = 'published' and now() >= b.closes_at)) then
    raise exception 'Results are available after voting closes' using errcode = '42501';
  end if;
  return query
    select v.question_id, v.option_id, count(*) from public.ballot_votes v
    where v.ballot_id = p_ballot group by v.question_id, v.option_id;
end
$$;

create function public.ballot_turnout(p_ballot uuid) returns table (votes_cast bigint, eligible_lots bigint)
  language sql stable security definer set search_path = '' as
$$
  select (select count(*) from public.ballot_receipts r where r.ballot_id = p_ballot),
         (select count(*) from public.lots l where l.kind = 'lot')
  where private.is_member()
$$;

-- ---------------------------------------------------------------------------------------------
-- Online request forms (architectural review, boat/trailer storage, ...)
-- ---------------------------------------------------------------------------------------------
create sequence public.submission_ref_seq;

create table public.form_submissions (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  form_type     text not null check (form_type ~ '^[a-z0-9_]{2,40}$'),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  lot_id        text references public.lots (id) on delete set null,
  summary       text not null default '',
  data          jsonb not null,
  status        text not null default 'submitted'
                  check (status in ('submitted', 'in_review', 'needs_info', 'approved', 'denied', 'withdrawn')),
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index form_submissions_user_idx on public.form_submissions (user_id, created_at desc);
create index form_submissions_status_idx on public.form_submissions (status, created_at desc);
create trigger form_submissions_touch before update on public.form_submissions
  for each row execute function private.touch_updated_at();

create table public.submission_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  created_at    timestamptz not null default now()
);

create table public.submission_events (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references public.form_submissions (id) on delete cascade,
  actor         uuid references public.profiles (id) on delete set null,
  kind          text not null check (kind in ('submitted', 'status', 'comment')),
  status        text,
  note          text check (note is null or char_length(note) <= 4000),
  created_at    timestamptz not null default now()
);
create index submission_events_idx on public.submission_events (submission_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.surveys           enable row level security;
alter table public.survey_responses  enable row level security;
alter table public.survey_receipts   enable row level security;
alter table public.ballots           enable row level security;
alter table public.ballot_questions  enable row level security;
alter table public.ballot_receipts   enable row level security;
alter table public.ballot_votes      enable row level security;
alter table public.form_submissions  enable row level security;
alter table public.submission_files  enable row level security;
alter table public.submission_events enable row level security;

create policy surveys_read on public.surveys for select to authenticated
  using ((private.is_member() and status <> 'draft') or private.is_staff());
create policy surveys_staff on public.surveys for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- Responses are inserted only through submit_survey(). Staff read them for tallies; a member can
-- read back their own (non-anonymous) response.
create policy survey_responses_read on public.survey_responses for select to authenticated
  using (private.is_staff() or user_id = (select auth.uid()));
create policy survey_responses_admin_delete on public.survey_responses for delete to authenticated using (private.is_admin());
create policy survey_receipts_read on public.survey_receipts for select to authenticated
  using (user_id = (select auth.uid()));

create policy ballots_read on public.ballots for select to authenticated
  using ((private.is_member() and status = 'published') or private.is_staff());
create policy ballots_staff on public.ballots for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy ballot_questions_read on public.ballot_questions for select to authenticated
  using (exists (select 1 from public.ballots b where b.id = ballot_id));  -- inherits ballots_read
-- Questions can only be changed while the ballot is still a draft.
create policy ballot_questions_staff on public.ballot_questions for all to authenticated
  using (private.is_staff() and exists (select 1 from public.ballots b where b.id = ballot_id and b.status = 'draft'))
  with check (private.is_staff() and exists (select 1 from public.ballots b where b.id = ballot_id and b.status = 'draft'));

-- A member can see whether their own lot has voted. Nobody can read individual votes: there are
-- deliberately no policies on ballot_votes, so only the SECURITY DEFINER tally functions touch it.
create policy ballot_receipts_read on public.ballot_receipts for select to authenticated
  using (lot_id = private.my_lot());

create policy submissions_read on public.form_submissions for select to authenticated
  using ((user_id = (select auth.uid()) and private.is_member()) or private.is_staff());
create policy submissions_insert on public.form_submissions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member() and status = 'submitted'
              and lot_id is not distinct from private.my_lot());
create policy submissions_staff_update on public.form_submissions for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy submission_files_read on public.submission_files for select to authenticated
  using (exists (select 1 from public.form_submissions s where s.id = submission_id));
create policy submission_files_insert on public.submission_files for insert to authenticated
  with check (exists (select 1 from public.form_submissions s where s.id = submission_id and s.user_id = (select auth.uid())));

create policy submission_events_read on public.submission_events for select to authenticated
  using (exists (select 1 from public.form_submissions s where s.id = submission_id));
create policy submission_events_insert on public.submission_events for insert to authenticated
  with check (actor = (select auth.uid())
              and exists (select 1 from public.form_submissions s where s.id = submission_id)
              and (private.is_staff() or kind in ('submitted', 'comment')));

-- Privileges
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated, service_role;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.survey_responses, public.survey_receipts, public.ballot_receipts from authenticated;
grant delete on public.survey_responses to authenticated;  -- admin-only via RLS
revoke all on public.ballot_votes from authenticated, anon;

revoke all on function public.submit_survey(uuid, jsonb), public.cast_ballot(uuid, jsonb),
  public.ballot_results(uuid), public.ballot_turnout(uuid) from public, anon;
grant execute on function public.submit_survey(uuid, jsonb), public.cast_ballot(uuid, jsonb),
  public.ballot_results(uuid), public.ballot_turnout(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: two private buckets. No storage policies are created, so the browser can never read or
-- write objects directly; the web server authorises each request and issues short-lived signed URLs.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800), ('submissions', 'submissions', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Reference numbers: the app supplies the form's prefix (e.g. "ARC"); the database turns it into
-- a unique, human-friendly reference such as ARC-2026-0007.
create function private.assign_submission_reference() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  if new.reference !~ '^[A-Z]{2,5}$' then raise exception 'Invalid reference prefix' using errcode = 'P0001'; end if;
  new.reference := new.reference || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.submission_ref_seq')::text, 4, '0');
  return new;
end
$$;
create trigger form_submissions_reference before insert on public.form_submissions
  for each row execute function private.assign_submission_reference();
