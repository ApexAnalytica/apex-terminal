-- =============================================================
-- APEX Terminal — Feedback → Production Pipeline
-- Run this in the Supabase SQL Editor after supabase-setup.sql
-- =============================================================

-- 1. Extend feedback table with pipeline columns
alter table public.feedback
  add column if not exists status text not null default 'new'
    check (status in ('new', 'approved', 'in_progress', 'shipped', 'rejected')),
  add column if not exists admin_notes text,
  add column if not exists github_issue_url text,
  add column if not exists github_issue_number integer,
  add column if not exists pr_url text,
  add column if not exists shipped_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- 2. Auto-update updated_at on row changes
create or replace function public.touch_feedback_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists feedback_set_updated_at on public.feedback;
create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute procedure public.touch_feedback_updated_at();

-- 3. Index for admin list queries
create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

create index if not exists feedback_github_issue_number_idx
  on public.feedback (github_issue_number)
  where github_issue_number is not null;
