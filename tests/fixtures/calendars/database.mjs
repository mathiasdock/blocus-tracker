import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Local PostgreSQL only. Reuse real migration and suspension helpers.
export async function createCalendarDatabase({ classification = true, userFlow = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, locked boolean not null default false);
    grant select on public.profiles to authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant select, update on auth.users to service_role;
    create table public.courses(id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, name text not null);
    alter table public.courses enable row level security;
    grant select on public.courses to authenticated;
    create policy course_owner on public.courses for select to authenticated using (user_id = auth.uid());
    -- Supabase defaults can grant broad rights: the migration must revoke them.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  const suspension = readFileSync(new URL('../../../supabase/migration_v57_real_suspension.sql', import.meta.url), 'utf8');
  await db.exec(suspension.slice(0, suspension.indexOf('-- Sur toutes les tables')));
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261001174207_external_academic_calendars.sql', import.meta.url), 'utf8'));
  if (classification) await db.exec(readFileSync(new URL('../../../supabase/migrations/20261001212530_classify_external_academic_events.sql', import.meta.url), 'utf8'));
  if (userFlow) {
    await db.exec(`grant select on public.courses to service_role;
      create table public.exams(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      name text not null, course_id uuid references public.courses(id) on delete set null, exam_date date not null, exam_time time,
      location text, notes text, created_at timestamptz not null default now());
      alter table public.exams enable row level security;
      create policy exam_owner on public.exams to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());`);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261002171210_university_calendar_user_flow.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261003040143_calendar_display_preferences.sql', import.meta.url), 'utf8'));
  }
  return db;
}
