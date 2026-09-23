-- =============================================================
-- APEX Terminal — Billing cron schedule (Phase 3)
-- =============================================================
-- Schedules the trial-expiry helper from supabase-billing-migration.sql
-- to run daily at 00:00 UTC. Idempotent: re-running unschedules the
-- existing job (if any) before re-creating it.
--
-- PREREQUISITES (run once via the Supabase dashboard if not already on):
--   1. Enable the pg_cron extension:
--      Database → Extensions → search "pg_cron" → Enable.
--   2. Re-run supabase-billing-migration.sql first so
--      public.expire_trial_users() exists.
--
-- Verify the job after applying:
--   select * from cron.job where jobname = 'expire-trial-users-daily';
--
-- See logs:
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job
--                    where jobname = 'expire-trial-users-daily')
--    order by start_time desc limit 20;
-- =============================================================

-- 1. Remove any prior scheduling under this name (no-op safe).
do $$ begin
  perform cron.unschedule('expire-trial-users-daily');
exception when others then null; end $$;

-- 2. Schedule daily expiry sweep at 00:00 UTC.
select cron.schedule(
  'expire-trial-users-daily',
  '0 0 * * *',
  $$select public.expire_trial_users()$$
);
