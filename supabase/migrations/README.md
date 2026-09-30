# Supabase migrations

The Supabase project is **production** and has no automated migration runner. Every schema change is applied by hand in the Supabase dashboard → SQL Editor. This folder is the record of those changes.

## Rules

1. **One file per change**, named `YYYYMMDDHHMM_short_name.sql` (e.g. `202610011200_add_vehicle_notes.sql`), so files sort chronologically.
2. **Idempotent** — `create table if not exists`, `alter table … add column if not exists`, `drop policy if exists` before `create policy`, `create or replace function`. Re-running a file must be harmless.
3. **Additive and backward-compatible** — the PWA is cached on phones, so old clients keep hitting the new schema. Add nullable columns / new tables; never rename or drop something the deployed client still reads.
4. **Apply before deploy** — run the migration in the SQL Editor *before* pushing code that depends on it to `main` (Netlify deploys on push).
5. **Mirror** the change in [../schema.sql](../schema.sql) and in the tables section of [AGENTS.md](../../AGENTS.md).
6. Enable RLS on new tables and add policies explicitly (current tables use public `using (true)` policies — see "Security model" in AGENTS.md).

## Known gap

`announcements`, `duty_messages`, `push_subscriptions`, `weather_cache` and `calendar_events` exist in production but their DDL was never committed. To close the gap, export their definitions (Dashboard → Table editor → table → "Copy as SQL", or `supabase db dump --schema public` with the Supabase CLI) into a `000000000000_baseline_missing_tables.sql` file here.
