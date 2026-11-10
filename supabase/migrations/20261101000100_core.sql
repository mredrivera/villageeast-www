-- Village East POA: core schema, roles and row-level security.
-- Principle: every table has RLS enabled; anonymous visitors can read only what is explicitly public,
-- approved members can read member content, and only staff/admin can manage it.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, anon, service_role;

create type public.member_role as enum ('resident', 'board', 'admin');
create type public.member_status as enum ('pending', 'approved', 'suspended');
create type public.visibility as enum ('public', 'members', 'staff');

-- ---------------------------------------------------------------------------------------------
-- Lots (public facts) and lot_facts (members-only county record details)
-- ---------------------------------------------------------------------------------------------
create table public.lots (
  id        text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  kind      text not null default 'lot' check (kind in ('lot', 'greenbelt', 'recreation', 'utility', 'common')),
  label     text not null,
  lot       text,
  section   text,
  address   text,
  acres     numeric(8, 2),
  improved  boolean not null default false
);

create table public.lot_facts (
  lot_id            text primary key references public.lots (id) on delete cascade,
  owner_names       text[] not null default '{}',
  legal_description text,
  year_built        int,
  finished_sqft     int,
  stories           text,
  bedrooms          int,
  full_baths        int,
  half_baths        int,
  building_style    text,
  exterior          text,
  owner_since_year  int,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Profiles: one row per auth user. Role/status can only be changed by an admin.
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                extensions.citext not null,
  full_name            text not null default '' check (char_length(full_name) <= 120),
  phone                text check (phone is null or char_length(phone) <= 40),
  lot_id               text references public.lots (id) on delete set null,
  role                 public.member_role not null default 'resident',
  status               public.member_status not null default 'pending',
  directory_opt_in     boolean not null default false,
  directory_show_email boolean not null default false,
  directory_show_phone boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index profiles_lot_idx on public.profiles (lot_id);

-- Pre-approved people. When an auth user with a matching email is created, their profile is
-- created already approved with this lot and role.
create table public.member_invites (
  email      extensions.citext primary key,
  full_name  text not null default '',
  lot_id     text references public.lots (id) on delete set null,
  role       public.member_role not null default 'resident',
  created_at timestamptz not null default now()
);

-- Helper predicates. SECURITY DEFINER so policies on other tables can consult profiles without
-- recursive RLS; kept in a non-exposed schema.
create function private.is_member() returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'approved') $$;

create function private.is_staff() returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'approved' and p.role in ('board', 'admin')) $$;

create function private.is_admin() returns boolean
  language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'approved' and p.role = 'admin') $$;

create function private.my_lot() returns text
  language sql stable security definer set search_path = '' as
$$ select p.lot_id from public.profiles p where p.id = (select auth.uid()) and p.status = 'approved' $$;

create function private.can_see(v public.visibility) returns boolean
  language sql stable set search_path = '' as
$$ select case v when 'public' then true when 'members' then private.is_member() else private.is_staff() end $$;

grant execute on all functions in schema private to anon, authenticated, service_role;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as
$$ begin new.updated_at := now(); return new; end $$;

-- New auth user -> profile (approved if invited, otherwise pending).
create function private.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as
$$
declare inv public.member_invites;
begin
  select * into inv from public.member_invites where email = new.email;
  if found then
    insert into public.profiles (id, email, full_name, lot_id, role, status)
    values (new.id, new.email, inv.full_name, inv.lot_id, inv.role, 'approved');
    delete from public.member_invites where email = new.email;
  else
    insert into public.profiles (id, email, full_name, status)
    values (new.id, new.email, coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''), 'pending');
  end if;
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Members may edit their own contact details but never their role, status, lot or email.
create function private.protect_profile() returns trigger
  language plpgsql security definer set search_path = '' as
$$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.lot_id is distinct from old.lot_id or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Only an administrator can change role, status, lot or email' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger protect_profile before update on public.profiles
  for each row execute function private.protect_profile();

-- ---------------------------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------------------------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  description  text,
  category     text not null check (category in
                 ('governing', 'rules', 'forms', 'financial', 'minutes', 'agenda', 'newsletter', 'board', 'realtor', 'ballot', 'notice')),
  visibility   public.visibility not null default 'members',
  doc_date     date,
  is_archived  boolean not null default false,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null default 0,
  legacy_url   text,
  created_at   timestamptz not null default now()
);
create index documents_cat_idx on public.documents (category, doc_date desc);

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  kind        text not null default 'social' check (kind in ('board_meeting', 'annual_meeting', 'social', 'cleanup', 'other')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  description text,
  visibility  public.visibility not null default 'public',
  created_at  timestamptz not null default now()
);
create index events_start_idx on public.events (starts_at);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 160),
  body         text not null check (char_length(body) <= 8000),
  visibility   public.visibility not null default 'public',
  pinned       boolean not null default false,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      extensions.citext not null check (char_length(email::text) <= 254),
  topic      text not null default 'general',
  message    text not null check (char_length(message) between 1 and 5000),
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(full_name) between 1 and 120),
  email       extensions.citext not null check (char_length(email::text) <= 254),
  lot_id      text references public.lots (id) on delete set null,
  relationship text not null default 'owner' check (relationship in ('owner', 'household', 'renter')),
  note        text check (note is null or char_length(note) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index access_requests_one_pending on public.access_requests (email) where status = 'pending';

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.lots             enable row level security;
alter table public.lot_facts        enable row level security;
alter table public.profiles         enable row level security;
alter table public.member_invites   enable row level security;
alter table public.documents        enable row level security;
alter table public.events           enable row level security;
alter table public.announcements    enable row level security;
alter table public.contact_messages enable row level security;
alter table public.access_requests  enable row level security;
alter table public.audit_log        enable row level security;

create policy lots_read on public.lots for select using (true);
create policy lots_admin on public.lots for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy lot_facts_read on public.lot_facts for select to authenticated using (private.is_member());
create policy lot_facts_admin on public.lot_facts for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Profiles: you can read your own; staff can read all. The member directory is exposed through a
-- function (below) that returns only what each member opted to share.
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin())
  with check (id = (select auth.uid()) or private.is_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated using (private.is_admin());

create policy invites_admin on public.member_invites for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy documents_read on public.documents for select using (private.can_see(visibility));
create policy documents_admin on public.documents for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy events_read on public.events for select using (private.can_see(visibility));
create policy events_staff on public.events for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy announcements_read on public.announcements for select
  using (private.can_see(visibility) and (published_at <= now() or private.is_staff()));
create policy announcements_staff on public.announcements for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- Contact + access requests are written by the server (service role) after Turnstile and rate checks;
-- nobody but staff can read them.
create policy contact_staff_read on public.contact_messages for select to authenticated using (private.is_staff());
create policy contact_staff_update on public.contact_messages for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy contact_admin_delete on public.contact_messages for delete to authenticated using (private.is_admin());

create policy access_admin on public.access_requests for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy audit_admin_read on public.audit_log for select to authenticated using (private.is_admin());

-- Opt-in member directory: only approved members may call it, and only shared fields come back.
create function public.member_directory()
  returns table (full_name text, address text, lot_label text, email text, phone text)
  language sql stable security definer set search_path = '' as
$$
  select p.full_name, l.address, l.label,
         case when p.directory_show_email then p.email::text end,
         case when p.directory_show_phone then p.phone end
  from public.profiles p
  left join public.lots l on l.id = p.lot_id
  where private.is_member() and p.status = 'approved' and p.directory_opt_in
  order by l.address nulls last, p.full_name
$$;
revoke all on function public.member_directory() from public, anon;
grant execute on function public.member_directory() to authenticated;

-- Table privileges (RLS still applies on top of these).
grant usage on schema public to anon, authenticated, service_role;
grant select on public.lots, public.documents, public.events, public.announcements to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke insert, update, delete on public.audit_log from authenticated;
