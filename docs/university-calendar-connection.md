# University calendar — Step 4 (local implementation)

## Student flow

Planning's existing University calendar disclosure opens a small DetailSheet.
Canvas, Moodle, Brightspace and Other calendar use the same ICS backend; there is
no OAuth, provider API, attachment download, cron or LLM call. Canvas instructions
are Calendar → Calendar Feed → copy URL ([Canvas guide](https://community.instructure.com/en/kb/articles/662804-unknown)).

The URL input is masked, never placed in React state/storage, and cleared before
submission. The authenticated server validates the public HTTPS destination,
fetches with existing bounds and parses before a single transaction persists the
source, secret and first events. Invalid feeds leave no source or secret. Retrying
the same URL reuses the owner's existing source.

First import opens course matching. Each reliable external key can map to an
existing personal course, be ignored, or explicitly remain unmapped. Choices are
saved together; nothing creates or renames courses. Ignoring controls presentation,
not storage. Saving an unmapped decision avoids repeatedly requesting attention.
The compact review counts exams/tests, major deadlines, small work and other items;
only exam decisions and changed linked events appear individually.

Manual Sync now reports progress, a fixed safe error or success and last-sync time.
New course keys produce a matching count without interrupting saved matches. The
existing five-minute database cooldown, 304 handling, 300-event aggregate user cap,
45-day history / 365-day future window and 1 MiB download limit remain unchanged.
No automatic sync occurs when opening Planning. Visibility remains per user/device.

## Explicit exams and source changes

Confirm exam opens an editable form using the existing exams model: mapped course,
title, local date/time and optional location. Only Add to my exams creates or links
an exam. Medium-confidence Test/Contrôle requires the same explicit decision;
Keep as deadline overrides it to other. Step 3's inline Confirm as exam still only
confirms the imported classification; it never inserts a local exam itself.

`confirm_calendar_exam` serializes a user's conversions. A persistent natural-key
link (source + UID + recurrence) makes retries return the original local exam.
An exact existing owner/course/date/time/name exam can be linked instead of inserted.
The link survives temporary disappearance/retention of its imported event. Planning
suppresses that linked import even if the student renames or moves the local exam.
Deleting the local exam deletes its link, allowing a later explicit conversion.

A small snapshot stores only title/date/time/all-day at conversion (maximum 1,024
bytes, only for converted exams). Subsequent sync never writes to local exams.
Changed source fields appear in Review events as Source changed. Keep my exam
acknowledges the new snapshot; Review in Planning opens the existing day/editor.
The student edits the local exam through the normal flow; no source date silently
wins. Changing a course match similarly changes imported presentation, not an
already-created personal exam.

Disconnect removes the source, live secret, mappings, imports and links. Local
exams, courses and objectives remain. Existing backup retention is unchanged.

## Migration and security review

Apply the three calendar migrations in timestamp order only after approval:
`20261001174207`, `20261001212530`, `20261002171210`. None has been applied remotely.
The first two migrations are unchanged by Step 4. The new migration adds nullable /
ignored mapping decisions and explicit exam links; no extra event index or raw data.

- All calendar tables have RLS. Secret grants exclude PUBLIC/anon/authenticated,
  including the source owner; normal source SELECT cannot reveal the URL.
- API verifies the bearer identity with getUser; body-supplied owner IDs are ignored.
  Errors are fixed codes, responses no-store, body limit 8 KB; no request/URL logging.
- New RPCs are service-only SECURITY INVOKER with fixed empty search paths.
  Owner checks, existing suspension checks and composite source/exam/course owner
  foreign keys apply. Clients can read their links but cannot mutate them.
- Events retain their natural-key and source/date indexes. Links add only natural
  identity, owner lookup and local-exam FK indexes; exams gain the composite owner
  key required by that FK. No index on snapshot/type/title. Snapshot growth occurs
  only on explicit conversion, not on every imported event.
- PGlite executes all three migrations and tests real grants, RLS, transactions,
  ownership, rollback, deduplication and disconnect. The current production exams
  schema was inspected read-only and matches the conversion fields.
- Read-only hosted security advisors reported pre-existing findings: mutable search
  path on mission_late_completion_from, executable definer functions, server-only
  RLS tables without policies, and leaked-password protection disabled. These are
  not introduced by this branch; the new migration is not deployed, so hosted
  advisors cannot certify it. Local catalog tests cover its new objects.
  References: [function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  [password security](https://supabase.com/docs/guides/auth/password-security).

The Step 1 measured compact event budget remains the baseline (about 164 MB for
1,000 × 300 events, 178 MB after simulated edits, including indexes). Step 2 adds
small enums; Step 4 adds one tiny decision flag per mapping and links only for
explicitly converted exams. It does not restore discarded descriptions/raw ICS.
The earlier measurements are not claimed as new Step 4 measurements.

## Verification and release gate

636 full tests pass; ESLint clean; production build passes with the existing 3 MB
PWA precache warning. The calendar test script now includes all four steps. The
failure path also uses Supabase's thenable RPC contract, without assuming .catch.
Server fetch/parser/privileged RPC implementation is absent from browser chunks.

Synthetic browser flow: invalid URL, successful import (10 rows), mapped + unmapped
courses, explicit exam (one local row), remapping (two map rows, no duplicates),
first unchanged sync (10), new course (11), changed source date (local date intact),
acknowledgement, ignore, and disconnect. Final state: zero external rows/links,
one local exam, two courses and two objectives. No browser errors or horizontal
overflow at 320 px. EN/light and FR/dark at 320/390/1440 px; month stays compact,
day separates study plan from academic context. Step 3's dense 90-event, week,
objective planning, course-color and visibility coverage remains in place.

Screenshots: [gallery](../artifacts/university-calendar-step4/README.md).
Rehearsal uses `/dev/university-calendar` with Start disconnected, development and
NEXT_PUBLIC_OFFLINE_DEV=true. Only the synthetic example.edu URL is accepted;
no private URL is saved. Fixture syncs deliberately skip the production cooldown.
SQL/API tests run the real backend separately from this offline UI rehearsal.

**Real Canvas feed tested: YES (2026-10-02, local validation).** The bounded
server fetch/parser and local PostgreSQL migrations imported 103 of 103 events,
recognized six Canvas course identities, and retained exactly the same 103 natural
identities on a second real fetch/sync: zero duplicates and zero local exams.
Final classification: 6 exam/high, 2 exam/medium, 39 quizzes, 8 assignments,
4 projects, 1 presentation and 43 other. The previously ambiguous project/report/
presentation deliverable combinations now have narrow explicit rules; unrelated
mixed titles, alternative wording, exam conflicts and the absolute quiz veto remain
conservative. Eight regression cases cover those boundaries.

The real normalized semester data was also exercised in local offline Planning:
all six course keys appear in matching, two were explicitly associated to existing
demo courses, names/colors propagate, the densest day groups six events, Test 1
stays Possible exam, and no local exam is created. Desktop 1440 px, mobile 390 px,
and dark 320 px have no page overflow or browser errors. Real data/screenshots
were kept outside the repository; only generic regression titles are committed.
The secret was read locally without modification, never printed/copied into
source, fixtures, docs or browser data. Full suite: 644 passed; lint clean; build
passed with the existing 3 MB PWA precache warning.

No hosted end-to-end check is claimed: the real feed was fetched by the production
server modules, persistence tested in isolated local PostgreSQL and presentation
validated locally. Production migration, push, main integration and deployment
remain subject to Mathias's explicit approval; none was performed.
