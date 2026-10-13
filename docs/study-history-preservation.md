# Historical study preservation — 2026-10-13

Status: local fixes and tests only. No push, deployment, remote migration or
production data write. Branch starts at production/main `2df3ad2`; the pending
discovery Planning change and other worktrees are untouched.

## Already correct

- Chrono's ordinary course removal updates `courses.archived_at`, never
  sessions. Stats loads active AND archived course identities (name/color).
- The production foreign keys for sessions, objectives and exams are
  `ON DELETE SET NULL`. Permanent deletion loses course identity, not time,
  completed-objective rows or exam rows. Its separate confirmation explains
  the irreversible identity loss in FR/EN.
- `session_days` derives course identity from sessions, not active courses.
  Captured daily portions and legacy session rows survive archiving/deletion.
- Stats lifetime total, day/week/month records, charts and heatmap use these
  canonical daily rows. Their reader was already paginated.
- Official streaks, study XP, exam/objective XP and badge rules do not require
  active courses. Earned badges are insertion-only and never revoked.
- Restore updates the original course ID and invalidates the Dashboard cache;
  it does not copy the course or sessions.
- Active-course filters in timer selectors, social course lists and contextual
  missions deliberately hide past-semester courses. They are NOT filters on
  lifetime study totals. Study Period summaries use canonical date ranges,
  not the current course list.
- Permanent deletion also removes course-specific checklists, course links
  and external-calendar mappings (CASCADE), as distinct from archiving.
  Existing earned badges remain, but future course-specific criteria cannot
  reconstruct a permanently deleted identity. Archive is the reversible path.

## Confirmed issues fixed locally

1. Stats read sessions once: PostgREST's 1,000-row ceiling truncated session
   counts, longest-session record, average duration and habits. New
   `fetchStudySessions` pages in batches of 500 with total ordering
   `started_at, id`, selected columns only and user/date filters preserved.
   A failed page returns an error, not a successful partial history.
2. Profile's lifetime total used the same capped read. It now sums the already
   paginated canonical daily rows. Its session read, Timer/Planning's bounded
   recent reads and legacy XP fallback use complete pagination too. Canonical
   server XP remains the first choice; no formula changes.
3. Resumed onboarding still deleted courses when removing them. It now
   archives, including a potentially saved row after a lost response.
4. History pagination lacked an ID tie-breaker for identical start times.
   Added ID ordering; page size and editing behavior are unchanged.
5. Restore could announce success after a zero-row update. It now requires
   the returned course ID before changing client state.
6. Server `study_day_states` returned no rows for a range over 3,660 days,
   making long-lived accounts' streak/badge evidence disappear. Migration
   `20261013164455_preserve_lifetime_study_days.sql` replaces only that cutoff
   with finite-date guards. Rules, security-definer/search-path/ACLs, XP
   formulas and stored data are unchanged. Tested twice for idempotence.
   **Prepared locally, NOT applied in production.**

## Evidence and boundaries

Production access was catalog inspection only: actual foreign keys, trigger
definitions, session_days view, canonical XP/streak/badge function definitions
and private EXECUTE privileges. Security Advisor was read without changing
any findings; study_day_states is not exposed to anon/authenticated. Existing
unrelated notices are outside this audit, not claimed resolved.

`tests/study-history-preservation.test.mjs` uses a disposable in-memory
PostgreSQL (PGlite), shipped canonical SQL functions, fixture tables matching
the inspected historical foreign keys, and a PostgREST-like adapter enforcing
the 1,000-row ceiling. It is not a full Supabase/Auth/Storage replica or a
production browser E2E test.

- 1,206 sessions across semesters, timestamp ties, captured midnight split,
  and longest session beyond the first thousand; then one new-semester session.
- Compare complete session/daily rows, total seconds, longest session/day/week/
  month, habits, chart, heatmap, current/best streak, XP and earned badges before/
  after archive, new empty semester, repeated restore and permanent delete.
- Explicit reproduction of the former capped query; boundaries at 0/500/1,000/
  1,501, filters, multi-user fallback and second-page error.
- Separate 2010–2026 fixture reproduces the ten-year cutoff, then verifies the
  local migration, non-regression, repeat application and private privileges.
- No real account, course or study row was changed. Offset pagination has
  deterministic ties, but is not a transaction snapshot if sessions are
  concurrently inserted/deleted during a multi-page read.

Validation: 6 audit regressions, 46 targeted tests, full suite 935/935, lint
clean, production build successful. Build without local Supabase environment
warns about missing public configuration and the pre-existing HEIC chunk
over the PWA precache limit; neither is a new failure.
