# University calendar: focused UX simplification

Local branch changes, 2026-10-03. No production migration, push or deployment.

## Presentation

- Day detail starts with the event title, then course/type/due metadata. Mapped
  courses with multiple events get one shared course heading and color marker;
  each event still expands independently. Unmapped events remain neutral.
- No repeated generic Deadline label. Date-only items say Due today on today's
  date, or Due [date] on another date. Explicit times remain visible.
- Expanded rows show the date/source, Plan work and an accessible overflow
  disclosure. Open source, change type, change course and hide live there.
  Select/Save editors mount only after choosing an edit action. Course changes
  still update the existing external-course mapping, not an event-specific copy.
- Possible exam keeps neutral deadline styling until `user_override = exam`.
  Automatic high confidence remains classifier data, not student confirmation.
  Confirm exam in day detail saves the existing override; it creates no local
  exam. Management's existing explicit exam-creation form is unchanged.
- Keep as deadline saves `other`. Existing local exams and linked-event
  deduplication remain unchanged. Month retains compact deadline aggregation.
- One Add disclosure opens Study objective / Exam. Plan work uses the existing
  objective form with no invented duration.
- The collapsed University calendar entry contains only its Manage action.
  Visibility controls, provider/status/last sync, course matches, sync,
  Hidden items and disconnect are inside Manage.

## Persistence and security

`20261003040143_calendar_display_preferences.sql` is additive and local only.
It does not replace any existing policies, grants, functions or event schema.

`external_calendar_preferences` stores three booleans per account. Existing
account settings win; an old user-scoped device preference is adopted only if
there is no account row, using conflict-do-nothing to protect another device's
choice. Subsequent reads/writes are account-level, not localStorage preferences.
A partial setting update preserves the other choices.

`external_calendar_hidden_items` stores only `(source_id, external_uid)`. No
feed URL, title, description, raw payload or date is copied. A hide covers all
recurrence instances of that UID. The existing event-row override cannot safely
store this decision: successful sync deletes disappeared/expired event rows.
The separate compact identity survives removal/reappearance without changing
that retention or sync behavior. Hidden decisions are paginated so the Data API
row limit cannot expose old hidden events again.

Restoring deletes only the hide decision. Normal visibility and ignored-course
rules still apply. If a feed row has expired/disappeared, Hidden items offers a
neutral unavailable-event entry that can still be restored; it does not retain
an archive of that event. Disconnect cascades hide decisions with the source;
student-created courses/objectives/exams remain untouched.

Both new tables have owner RLS and suspension triggers. Anonymous grants are
revoked. Hidden-item ownership derives from the existing source RLS, and the
source FK cascades on disconnect. Only primary-key indexes are added; the
hidden-item key also covers its source lookup/FK. PostgreSQL tests verify
ownership, grants, suspension, retention independence and cascades. No new RPC,
server fetch, cron, classifier rule, dependency or secret access is introduced.

## Verification

- Local PostgreSQL: repeat/changed/disappeared/reappearing sync, hide/restore,
  owner isolation, suspension, source cascade, account preference defaults and
  updates, existing calendar/security regressions.
- React: no default edit forms, explicit editors, Plan work, confirm/deadline,
  hide actions. Read-model tests: six items, mapped grouping, neutral unmapped
  items, hidden recurring UIDs, source isolation and explicit exam presentation.
- Browser: 1 item, 6 items, 12-item day, dense semester, mapped/unmapped,
  possible exam → deadline/confirmed, no automatic local exam, hide → sync →
  restore, account preference reload, Add, Plan work (blank duration).
  EN/light, FR/dark; 320/390/1440 px; no horizontal overflow or browser errors.
- Screenshot fixtures contain only synthetic data, never a private feed.
  See `artifacts/university-calendar-ux/README.md`.

Full suite: 660 tests passed. Lint clean. Production build successful (existing
3 MB PWA precache warning). No additional dependencies.

## Planning UX refactor (2026-10-04, branch `claude/planning-ux-refactor`)

No backend, migration, RPC or sync change. Presentation and one client flow.

- **Management** moved into the Planning « … » menu (« University calendar »,
  with its status as description). The permanent disclosure under the calendar
  is gone; a load failure shows as a notice with Retry above the calendar.
  Manage reads: source name, « Connected · Synced today at 08:12 », *Sync now*
  (outlined), then quiet rows — course matches, review imported events, hidden
  items — each with its count, then *Disconnect Canvas* in red behind a
  confirmation. Visibility uses the app's switches. When a source exists, adding
  one is a quiet « + Add another calendar » (limit 3), never a primary button.
- **Imported rows** are a title and « course · type · due » only. A click opens
  a popover (computer) or bottom sheet (phone) — nothing expands inline — with
  *Plan work* as the single primary action and « … » for *Open in Canvas*,
  *Change type*, *Change course* (both as option lists, saved on pick) and
  *Hide*. A possible exam asks « Is this an exam? » with *Mark as exam* and
  *Keep as deadline*. Since the final pass (2026-10-04) *Mark as exam* — and
  *Change type → Exam* — is the review's conversion, never a label: a
  confirmation view (event, course, date; « Add to my exams ») then the server
  `confirm_exam` action, which creates the exam with the mapped course and date
  or links the student's existing exam that day (« Link to this exam »). An
  event marked as exam before (label only, no exam) says « Marked as an exam,
  but not in your exams yet » and offers the same conversion.
- **Bulk exam confirmation** (first import and *Review imported events*):
  `examReviewGroups` (`lib/calendarReview.mjs`) lists *Likely exams*
  (effective exam/high, preselected), *Possible exams* (exam/medium: numbered
  tests, a bare « Final » — never preselected) and *Changed in Canvas*
  (converted exams whose source moved). Quizzes never reach the list (classifier
  veto). A candidate on the same day as one of the student's exams for the same
  course (or, unmatched, with the same name) is that exam: it is neither likely
  nor possible but sits in its own group, *Already in your exams* (« You
  already have … », checkbox unticked and disabled, « … » → *Link to this
  exam* / *Not an exam*). Planning (Month/Week/Day, By course) no longer shows
  it as a deadline. One primary button, « Add N selected exams » (disabled at
  0), adds the selection by calling the existing `confirm_exam` action once per
  event, in sequence, then reloading once. The
  server conversion stays the source of truth: serialized, idempotent per
  natural key, exact-match linking, existing links untouched. A failure stops
  the loop and says how many were not added; retrying is safe. Each row's « … »
  keeps *Edit before adding* (the existing form) and *Not an exam*.
- **Prefill**: when the course is matched, the exam name drops Canvas's
  « [ADV 3001] » suffix; unmatched, it is kept as the only course clue.
- **Overview**: imported events marked as exams count as exams in Today's next
  exam and in *By course*, as Month/Week/Day already drew them.

Verified offline: connect → match three courses → review (14 events: likely 3
of which 1 flagged duplicate, possible 2, quizzes absent) → « Add all 2 likely
exams » → 6 → 8 exams, 2 links, no duplicate; the list then holds only the
flagged one and the possible ones.

Final pass (2026-10-04), offline semester fixture: the reported case
(« International Marketing — final exam » + Canvas « Final Exam », same course
and day) no longer appears in Month/Day or as a likely exam; *Mark as exam* on
« Test 1 » → confirmation → 6 → 7 exams, 1 → 2 links, gone from the
deadlines; review « Add 1 / 0 (disabled) / 1 / 2 selected exams »; *Link to
this exam* on a duplicate → exams unchanged, links +1. *Needs review* (and the
« … » dot) counts likely + possible + changed, never the duplicates.
