-- Annual dues tracking.
--   dues_periods: one row per dues year (due date, whether it holds demonstration data).
--   dues:         one row per lot per year (amount billed, and the payment once recorded).
-- Owners see only their own lot's rows. Board members and administrators see and record all of them.
-- No payment is taken online; this is a ledger of payments the treasurer has received.

create table public.dues_periods (
  year       int primary key check (year between 2000 and 2100),
  due_date   date not null,
  is_sample  boolean not null default false,
  note       text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.dues (
  id          uuid primary key default gen_random_uuid(),
  year        int not null references public.dues_periods (year) on delete cascade,
  lot_id      text not null references public.lots (id) on delete cascade,
  amount      numeric(8, 2) not null check (amount >= 0 and amount <= 100000),
  paid_on     date,
  method      text check (method in ('check', 'cash', 'bank', 'other')),
  reference   text check (reference is null or length(reference) <= 60),
  note        text check (note is null or length(note) <= 300),
  recorded_by uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (year, lot_id),
  -- Payment details only make sense on a paid row.
  check (paid_on is not null or (method is null and reference is null))
);
create index dues_lot_idx on public.dues (lot_id);

create trigger dues_touch before update on public.dues
  for each row execute function private.touch_updated_at();

alter table public.dues_periods enable row level security;
alter table public.dues         enable row level security;

create policy dues_periods_read   on public.dues_periods for select to authenticated using (private.is_member());
create policy dues_periods_insert on public.dues_periods for insert to authenticated with check (private.is_staff());
create policy dues_periods_update on public.dues_periods for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy dues_periods_delete on public.dues_periods for delete to authenticated using (private.is_admin());

create policy dues_read   on public.dues for select to authenticated
  using (private.is_staff() or lot_id = private.my_lot());
create policy dues_insert on public.dues for insert to authenticated with check (private.is_staff());
create policy dues_update on public.dues for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy dues_delete on public.dues for delete to authenticated using (private.is_admin());

revoke all on public.dues_periods, public.dues from anon;
grant select, insert, update, delete on public.dues_periods, public.dues to authenticated;
grant all on public.dues_periods, public.dues to service_role;
