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
