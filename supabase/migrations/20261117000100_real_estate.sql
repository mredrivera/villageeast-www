-- Real estate intelligence: recorded deed transfers and county assessments for each lot, from
-- Bedford County's public GIS records. Members only. Loaded by `npm run gis:sync` + `npm run seed`.
-- Seller and buyer names are intentionally not stored; only a coarse seller type is kept.

alter table public.lot_facts add column if not exists sales_history_from date;
comment on column public.lot_facts.sales_history_from is
  'The county keeps only the 3 most recent transfers. When all 3 are used, transfers before this date are unknown. Null = complete record.';

create table public.lot_sales (
  id           bigint generated always as identity primary key,
  lot_id       text not null references public.lots (id) on delete cascade,
  sale_date    date not null,
  price        integer check (price is null or price >= 0),
  -- market: priced arm's-length sale; nominal: gift, estate, trust or correction deed (under $1,000);
  -- historic: conversion record dated 1 January with no price (true date unknown)
  kind         text not null check (kind in ('market', 'nominal', 'historic')),
  seller_type  text not null default 'unknown'
                 check (seller_type in ('individual', 'company', 'lender', 'trust_or_estate', 'association', 'unknown')),
  deed_ref     text,
  deal_key     text not null,                       -- same deed conveying several lots shares a key
  bundle_size  integer not null default 1 check (bundle_size >= 1),
  unique (lot_id, sale_date, deal_key)
);
create index lot_sales_date_idx on public.lot_sales (sale_date desc);

create table public.lot_assessments (
  lot_id         text not null references public.lots (id) on delete cascade,
  assessed_on    date not null,
  label          text,
  effective_year integer not null,
  land_value     integer not null default 0,
  building_value integer not null default 0,
  total_value    integer not null default 0,
  primary key (lot_id, assessed_on)
);

alter table public.lot_sales       enable row level security;
alter table public.lot_assessments enable row level security;

create policy lot_sales_read        on public.lot_sales       for select to authenticated using (private.is_member());
create policy lot_sales_admin       on public.lot_sales       for all    to authenticated using (private.is_admin()) with check (private.is_admin());
create policy lot_assessments_read  on public.lot_assessments for select to authenticated using (private.is_member());
create policy lot_assessments_admin on public.lot_assessments for all    to authenticated using (private.is_admin()) with check (private.is_admin());

revoke all on public.lot_sales, public.lot_assessments from anon;
grant select, insert, update, delete on public.lot_sales, public.lot_assessments to authenticated;
grant all on public.lot_sales, public.lot_assessments to service_role;

-- Waterfront: the lot boundary reaches the lake shoreline (see markWaterfront in scripts/gis-sync.mjs).
-- Public, like the rest of the lots table: it is plain to see on any map.
alter table public.lots add column if not exists waterfront boolean not null default false;
