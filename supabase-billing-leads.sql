-- =============================================================
-- APEX Terminal — Leads table (Phase 4)
-- Run in the Supabase SQL Editor. Idempotent.
--
-- The /request-access form is public (no auth) and posts here.
-- Anonymous INSERT is allowed; reads/updates require service-role,
-- which is what the admin console (/admin/leads) uses.
-- =============================================================

begin;

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  organization  text not null,
  use_case      text,
  source        text not null default 'request-access',
  status        text not null default 'new'
                  check (status in ('new','contacted','trial-issued','closed-won','closed-lost')),
  admin_notes   text,
  contacted_at  timestamptz,
  created_at    timestamptz default now()
);

create index if not exists leads_status_created_at_idx
  on public.leads (status, created_at desc);

alter table public.leads enable row level security;

-- Anonymous + authenticated callers can INSERT new leads (the public
-- /request-access form). They cannot SELECT or UPDATE — only the
-- service-role key (used by /admin/leads) can read or mutate.
do $$ begin
  create policy "anon and auth can insert leads"
    on public.leads for insert
    to anon, authenticated
    with check (true);
exception when duplicate_object then null; end $$;

commit;
