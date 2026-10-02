# University calendar — Step 3 (local only)

Imported events are a secondary context layer in Planning, separate from objectives,
local exams, timers, workload totals, exports and mascot logic. No connection or sync
controls, new migration, dependency, background job or remote action are added.

## Presentation

- Month: a single combined local/imported exam indicator, mapped course mark, count
  of remaining deadlines and study-time total. Imported titles never populate day
  cells. On days with imports, the time total replaces study-title previews to keep
  density bounded. Small screens use `due` / `éch.`; accessible day labels keep the
  full localized deadline count. Ten events consume the same summary space as four.
- Week: existing study workload followed by an Academic deadlines subsection, one
  exam summary and a total linking to the day's details.
- Day and day sheet: Study plan precedes Academic deadlines. Exams use the existing
  exam stamp/sand surface. Major deadlines have a stronger title, other deadlines
  stay quiet. Course marks use saved local colors; unmapped entries stay neutral.
- Possible exams remain deadlines, not confirmed exam markers. Expanding one gives
  Confirm as exam, which writes only the existing `user_override` column. No local
  exam row is inserted. Change type also permits returning to automatic rules.
- Plan work opens the existing objective form with a mapped course/title, a date
  the student can change and an empty duration. Only explicit submission creates
  an objective. No duration or study effort is inferred from a deadline.
- Map course is a small explicit existing-course selector for that source/key;
  events without a reliable key explain why it is unavailable. No course creation,
  fuzzy matches or renaming. The first-import matching workflow remains Step 4.
- University calendar disclosure below Planning: exams/tests and major deadlines
  enabled; normal items enabled but aggregated in Month/Week. Owner-keyed local
  storage preferences apply on this device only, without changing imported rows.

## Data and safety

`useAcademicCalendar` reads owner-visible source IDs, up to the existing 300-event
per-user ceiling and the user's mappings. It selects no feed secret, excerpt or
provider payload. Source lookup is one small request for unconnected users; connected
users add two parallel reads. No sync/fetch request is triggered by Planning.
Initial loading joins the existing skeleton, and stale requests are ignored after
user changes/unmount. Missing Step 1 tables are tolerated before Step 4 rollout;
other failures expose a local data retry. Writes rely on existing RLS, ownership
foreign keys and the override-only column grant.

The pure read model preserves all-day/floating calendar dates, converts timed UTC
instants to the device date, resolves overrides independently of mapping and ignores
inactive rows. Source links allow only HTTP(S). Imported exam duplicates are suppressed
when a mapped local exam has the exact same course, day and normalized title (Canvas
course suffix removed). Different titles, possible exams and unmapped entries are
not guessed to be duplicates. A future conversion flow should persist an explicit
identity link for renamed local exams; this step creates no conversion flow.

## Verification

- Nine new pure tests: mapped/unmapped identities, override/possible-exam handling,
  dense summaries, visibility, exact local exam duplication, date/time semantics,
  source/recurrence identity, inactive rows and source URL safety.
- Full suite: 621 passed, including existing PostgreSQL RLS, secret isolation,
  idempotence and override-preserving sync tests.
- Offline browser fixtures: `/dev/university-calendar`, available only when both
  development mode and `NEXT_PUBLIC_OFFLINE_DEV=true` are set. Normal = one exam +
  three deadlines today; dense = 90 events, ten today. No production writes.
- Browser exercised at 1440, 390 and 320 px; EN/light and FR/dark. No page/cell
  horizontal overflow at 320 px after compact-label correction. No browser errors.
- Confirming Test 1 persisted `user_override=exam` with zero local exam rows;
  mapping changed its identity to International Marketing; Plan work started with
  blank duration and created only the student-submitted 35-minute objective.
  Hiding normal items changed nine deadlines to one without changing 90 stored rows.
- Lint clean; production build passed (existing 3 MB PWA precache warning).
- Screenshot evidence: `artifacts/university-calendar-step3/` (offline synthetic data).
