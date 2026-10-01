# University calendars — foundation (Step 1)

Implemented on `codex/university-calendar-foundation`; not deployed. Apply
`supabase/migrations/20261001174207_external_academic_calendars.sql` before enabling
these endpoints in a deployment. No backfill or environment variable change is
needed: the API uses the existing Supabase URL, anon key and server service key.
No live database migration was applied during this implementation.
The migration depends on the existing v57 suspension helpers as well as the
existing user/course tables.

## Boundary with Planning

Planning continues reading `courses`, `objectives`, `exams` and its legacy
`courses.exam_date` fallback (`lib/planningExams.mjs`). Its existing hand-written
ICS exporter only writes a download; it provides no parsing capability. None of
these paths import the new modules. Imported events cannot create or change
objectives, exams, courses, notifications or mascots. There are no AI calls,
background jobs, cron entries, automatic syncs or new UI.

## Data model

- `external_calendar_sources`: one user's source, provider (`canvas`, `moodle`,
  `brightspace`, `ical`), display name, last successful/attempted sync, status,
  fixed error code and a short-lived sync lease. Maximum three sources per user.
- `external_calendar_secrets`: feed URL and conditional request validators.
  Separate table, with RLS enabled, no client grants and no client policies.
- `external_academic_events`: normalized text, dates and course evidence, scoped
  to user and source. Unique `(source_id, external_uid, recurrence_id)`; an empty
  recurrence ID denotes the master/ordinary event. Explicit recurring-event
  overrides have their own identity. Updates preserve row IDs. `last_seen_at`
  records observation, `provider_updated_at` records the provider's timestamp,
  and `updated_at` records the local write.
- `external_calendar_course_map`: an explicit, user-owned decision from
  `(source_id, external_course_key)` to an existing `courses.id`. Composite
  foreign keys enforce the same owner for the source, mapping and local course,
  including service-role writes. Deleting a local course removes its mappings.

Mapping `canvas:course:42` (label `ADV 3001`) to the user's course named
`Principles of Advertising` leaves the local course name/color untouched. Later
UI can join the mapping to that course's current identity. No fuzzy matching,
exact-match auto-save, automatic course creation, or connection to the separate
community `course_offerings`/`course_links` matching system is involved.

## Canvas evidence and parser decisions

The implementation was checked against [Canvas's actual ICS export code](https://github.com/instructure/canvas-lms/blob/master/app/models/calendar_event.rb),
`CalendarEvent::IcalEvent#to_ics`: it uses DTSTART/DTEND for assignments' due
instants, an event UID, a URL with `include_contexts=course_<id>`, and sometimes
an appended `[course_code]` in SUMMARY. The fixture reproduces those conventions
with invented data; it is not a student's private feed.

Only an unambiguous Canvas course URL on the subscription origin becomes an
external course key: a single `include_contexts=course_42` or `/courses/42/...`.
Conflicting/multiple contexts are left unmapped. The trailing bracket label is
only used once the URL establishes the course identity. This does not classify
an event as an assignment, quiz or exam. The original title, description,
location, external URL, categories, calendar name and selected explicit course
extension fields remain available for later provider adapters. Generic providers
currently parse ICS without inferring course keys.

`ical.js@2.2.1` is a mature, dependency-free parser, used for property parsing,
folding, escaped text, recurrence metadata and embedded VTIMEZONE definitions.
It avoids maintaining a custom ICS grammar. IANA TZIDs without VTIMEZONE use
Node's Intl timezone database. A DST overlap uses the first occurrence; an
unresolvable/nonexistent local datetime rejects the whole snapshot. Dates are
validated rather than silently rolled into another month.

All-day dates stay SQL `date` values, with the exclusive DTEND preserved. Floating
times remain in `metadata.dates` with no invented UTC instant. Explicit DUE
values are stored separately. DTSTART is not silently converted to a semantic
"deadline". RRULE/RDATE/EXDATE/DURATION and RECURRENCE-ID are retained, but there
is no occurrence expansion in this step. Attachments, attendees, arbitrary
extension blobs, HTML alternate descriptions and raw ICS files are not stored.
Descriptions are untrusted text, never pre-approved HTML.

A complete VCALENDAR v2 snapshot is required (METHOD absent or PUBLISH).
Invitation/cancellation delta messages and unsupported top-level components
such as VTODO fail safely; a cancellation within a snapshot uses
`STATUS:CANCELLED`. An empty valid snapshot marks previous events missing.
Missing means absent from the feed, not proven deleted: providers may have a
rolling export window. Missing rows are retained for 90 days and then removed
on a later successful manual sync. Returning events become active again.

## API for the later UI

All requests use `Authorization: Bearer <current Supabase access token>`.
Identity is verified with `auth.getUser(token)`; a body `user_id` is ignored.
Mutation bodies are JSON, limited to 8 KB. Responses use `Cache-Control: no-store`.

- `GET /api/calendars`: returns `{ sources: [...] }` using an explicit safe
  column list. No secrets, sync lease tokens or imported event bodies.
- `POST /api/calendars` with `{ action: "connect", provider, display_name,
  feed_url }`: stores the source and secret atomically; returns `{ id }`.
  Connection performs no fetch or sync. `webcal:` is normalized to HTTPS.
- `POST /api/calendars` with `{ action: "sync", source_id }`: manually fetches
  and imports; returns `{ event_count, not_modified }`.
- `DELETE /api/calendars` with `{ source_id }`: owner-only removal, cascading to
  the secret, imported events and mappings. Account deletion also cascades.
  Rotating the feed currently requires disconnect/reconnect.
- Future mapping UI may use the authenticated Supabase client to select/upsert/
  delete `external_calendar_course_map`, specifying the current `user_id`,
  `source_id`, `external_course_key`, optional label and `local_course_id`.
  Upsert conflict key: `source_id,external_course_key`. Imported events are
  readable only by their owner; only the server can write them.

## Sync and privacy controls

The API validates ownership before obtaining a service-only lease and secret.
The database's five-minute cooldown survives multi-instance Vercel execution
and includes failed attempts. A lease token prevents a late result overwriting
a newer sync. A crashed sync can be retried after five minutes. The source cap
uses a per-user transaction lock. Existing in-memory API rate limiting is an
additional guard, not the authoritative sync limit.
The existing suspended-account trigger covers all new tables. Server-only
connection and sync RPCs also check the verified user's suspension state,
because service-role requests do not carry that user's `auth.uid()`.

Fetches accept only HTTPS on port 443 without URL credentials. DNS resolves
once and the public address is pinned to the socket; private/reserved, loopback,
link-local and mapped-private addresses are blocked. `ipaddr.js@2.2.0` supplies
IPv4/IPv6 range classification, avoiding a partial home-grown address filter.
Redirects are refused so the subscription token is not forwarded. Set the final
feed URL when a university redirects. Maximum 12 seconds, 2 MiB response,
2,000 VEVENT components and 32 KiB normalized data per event. Exceeding a limit
fails the whole import, never silently removes omitted events. No attachment
or linked URL is fetched. Compression is not requested/accepted, avoiding
unbounded decompression. ETag/Last-Modified support reduces subsequent downloads.

After parsing every event successfully, one service-only SECURITY INVOKER RPC
transaction upserts the snapshot, marks missing rows and updates source status.
A 304 keeps the existing snapshot. Fetch/parse failures and transaction errors
leave the last successful events and timestamp intact. Disconnecting during a
fetch makes its lease invalid and prevents imports from being recreated.

Feed URLs and validators never appear on readable source rows. Secret-table
privileges and RPC EXECUTE privileges are revoked from PUBLIC, anon and
authenticated; RLS is enabled on all four tables. There are no SECURITY DEFINER
functions or public views. See [Supabase's API security guidance](https://supabase.com/docs/guides/api/securing-your-api).
The URL is stored as private server data, not application-encrypted: trusted DB
administrators/service-role holders and backups can access it, as with other
server secrets. Deletion removes the live row; existing backup retention is
unchanged. Raw exceptions, response bodies, request bodies and URLs are never
logged by this feature or returned as errors. Errors use fixed codes. A provider
reflecting the subscription URL/long token in selected event text is redacted.
A future connection UI must keep the entered URL out of analytics/client logs.

## Validation

`npm run test:calendars` executes parser, fetcher, API and sync tests and applies
the actual migration in PGlite (PostgreSQL) using anon/authenticated/service roles.
The development-only `@electric-sql/pglite` dependency enables repeatable tests
without a hosted database or Docker. Tests exercise actual RLS, grants, FKs,
RPC transactions, role restrictions, deletion and failure rollback. The minimal
fixture supplies the existing user/course/profile prerequisites and loads the
real v57 suspension helpers; it is not a
full Supabase/PostgREST deployment. No hosted advisors or live network sync
against a university account were run; local catalog checks cover this
migration's RLS, search paths, privileges and invoker functions.

Full verification: `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`.
Result on 2026-10-01: all 22 calendar tests / 529 total tests passed; lint passed;
production build passed with the existing 3 MB PWA precache warning. The new
server modules/dependencies are absent from the generated client JS bundles.

## Rough free-tier impact

Assume one source per user, 100–300 events, roughly 2–4 KB per normalized row
including table/index overhead, and 1–3 KB of ICS per event. Descriptions vary;
these are planning estimates, not a quota guarantee. Source/map rows are small.

| Users | Event rows | Approx. database size | Full feed transfer per sync round |
| --- | ---: | ---: | ---: |
| 100 | 10,000–30,000 | 20–120 MB | 10–90 MB |
| 1,000 | 100,000–300,000 | 200 MB–1.2 GB | 100–900 MB |

There is zero scheduled traffic. If every user manually syncs once a day for
30 days, uncompressed university-to-server transfer is roughly 0.3–2.7 GB for
100 users or 3–27 GB for 1,000 users. Successful 304s need only headers and skip
sending event JSON to the DB. A changed snapshot sends normalized JSON once
from Vercel to Supabase (ingress, roughly the same order of magnitude as the
feed). DB egress for the sync itself is tiny: source/lease metadata and a count,
not all events. Future calendar reads will add egress when that UI is built.

Re-syncs reuse rows rather than accumulating versions. Short-lived missing
rows, multiple sources and long descriptions add storage; physical DB/index
bloat also needs allowance. 1,000 users at the high end can exceed a small free
DB allowance, so this architecture keeps calls bounded but does not promise
that scale will fit a free plan. Measure representative feeds before selecting
automatic sync frequency in a later step.
