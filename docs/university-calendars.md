# University calendars — compact Step 1 foundation

Step 2 adds a separate deterministic classification layer, documented in
[academic-event-classification.md](academic-event-classification.md). The Step 1
migration and import/retention behavior described here remain unchanged. Its
storage measurements below are the Step 1 baseline; Step 2's report measures
the additional compact classification fields separately.

Local branch: `codex/university-calendar-foundation`. No remote migration, push
or deployment. The original **unapplied** migration is updated in place:
`supabase/migrations/20261001174207_external_academic_calendars.sql`. It depends
on existing users/courses/profiles and v57 suspension helpers. No environment
changes: the API uses the existing Supabase URL, anon key and server service key.

## Scope and architecture

Planning still reads courses, objectives and exams through its existing paths;
none of those paths import this feature. There are no new UI elements, course
creation/renaming, notifications, mascot changes, AI calls or
cron jobs. Course matching is an explicit private mapping, independent of the
community `course_offerings` / `course_links` system.

- `external_calendar_sources`: owner, provider, display name, successful/attempted
  sync timestamps, fixed status/error, sync lease. Up to three sources per user.
- `external_calendar_secrets`: server-only feed URL, ETag/Last-Modified and the
  UTC date of the last complete snapshot. No browser SELECT grant or policy.
- `external_academic_events`: current compact snapshot. Natural primary key
  `(source_id, external_uid, recurrence_id)`; no redundant UUID row ID or owner
  column. Ownership comes exclusively from the source through RLS. An empty
  recurrence ID denotes an ordinary/master event; overrides remain distinct.
- `external_calendar_course_map`: explicit `(source_id, external_course_key)` →
  existing local course. Composite FKs enforce the same user for the mapping,
  source and course, including privileged writes. Local course deletion removes
  mappings without deleting the imported events.

An external `canvas:course:42` / `ADV 3001` can map to `Principles of Advertising`
and later inherit that local course's color/identity without changing its name.
Nothing is silently matched or saved.

## Compact content and bounds

Full ICS files, attachments, HTML bodies and arbitrary provider metadata are
never stored. Compared with the first Step 1 commit, removed fields include
JSON metadata, full description/location/categories, duplicate date objects,
DTEND/end dates, provider timestamp/sequence, raw status, event creation/last-seen/
removed timestamps and redundant event UUID/owner columns.

Keep title, UTC start/due where available, all-day flag, one `event_date`, optional
floating timestamp, external course key/label, useful external URL, active
status and an `updated_at` timestamp that changes only with actual content.
`source.last_synced_at` records observation for the whole snapshot. Incoming
sequence/timestamp still resolve duplicate revisions during parsing, then are
discarded. No per-event last-seen update occurs on re-sync or 304.

Strict UTF-8 byte limits are enforced in both parser and SQL:

| Field | Maximum bytes | Oversize handling |
| --- | ---: | --- |
| UID | 255 | reject snapshot; never truncate identity |
| recurrence ID | 80 | reject snapshot |
| title | 160 | plain-text truncation |
| description excerpt | 120 | strip markup/control characters, collapse whitespace, truncate |
| external course key | 96 | reject snapshot |
| external course label | 80 | plain-text truncation |
| external URL | 384 | omit optional URL; never truncate into a different link |
| course evidence hint | 96 | plain-text truncation, only when no reliable course key |

Text sanitization only scans a bounded 2,048-character prefix. Text remains
untrusted plain text, not HTML to inject. Course hints selectively combine
explicit course extension fields, categories, location and calendar name;
there is no arbitrary JSON storage. Reliable Canvas identities omit this hint.
The `is_recurring` flag and explicit occurrence identity survive, but recurrence
rule bodies/RDATE/EXDATE are discarded and **no recurrence expansion** occurs.
An old recurring master outside the date window is not retained; future
recurrence support would require re-fetching/parsing the feed.

`ical.js` handles ICS folding/escaping and VTIMEZONE. Node Intl handles IANA
TZIDs when no embedded zone is supplied. Floating times never get an invented
UTC offset; all-day dates retain their calendar date. `event_date` is the due
or start date (UTC day for absolute instants, literal date for all-day/floating).
No meaning such as “exam” or “assignment” is inferred from these dates.

Canvas conventions were checked against [its actual export implementation](https://github.com/instructure/canvas-lms/blob/master/app/models/calendar_event.rb).
Only unambiguous same-origin event URLs with a single `include_contexts=course_N`
or `/courses/N/...` establish course identity. A trailing bracket course label
is used only with a reliable key. Other providers parse generic ICS and leave
course identity unknown. Tests use synthetic data, never a private student feed.

## Retention and sync limits

- Inclusive UTC window: **45 days past through 365 days future**, checked in
  parsing and SQL. Parse/validate the whole feed before filtering; no partial
  successful import on malformed data.
- **300 retained events per source and 300 total per user across all sources**.
  A transaction advisory lock serializes the aggregate budget. Overflow rejects
  the complete sync and keeps the previous snapshot, rather than silently
  choosing some deadlines.
- **1 MiB maximum feed response**, 2,000 raw VEVENT components scanned, 12-second
  fetch deadline. No attachments, redirects or compressed bodies downloaded.
- Missing and cancelled events are deleted immediately during successful sync.
  There are no tombstones. A returning event reuses the same natural identity.
- Every successful sync, including 304, prunes out-of-window rows across that
  user's sources. Inactive users' snapshots remain bounded but are only pruned
  when they next sync/disconnect; there is no background cleanup job.
- Conditional validators are reused only on the same UTC day. The first manual
  sync on a new day re-fetches the full feed, allowing previously too-distant
  events to enter the moving window even if the upstream ETag is unchanged.

Manual API ownership validation → service-only lease/secret → bounded fetch →
parse → one atomic SQL transaction. Upserts preserve natural identity; unchanged
content is not physically updated. A persistent five-minute cooldown includes
failures and works across Vercel instances. Lease tokens prevent stale results
or an in-flight sync resurrecting a disconnected source. Existing suspension
checks remain on new tables and server-backed RPC operations. Errors preserve
the previous successful snapshot/timestamp. Complete VCALENDAR v2 snapshots
(METHOD absent/PUBLISH) are required; invitation/delta messages fail safely.

## API and security

All `/api/calendars` requests require a Bearer access token verified with
`auth.getUser`. Request-body user IDs are ignored; JSON bodies are limited to
8 KB. Responses use `Cache-Control: no-store`.

- GET: safe source metadata only.
- POST `{ action: "connect", provider, display_name, feed_url }`: atomic source/
  secret creation, no automatic fetch. `webcal:` becomes HTTPS.
- POST `{ action: "sync", source_id }`: explicit manual import; count/304 result.
- DELETE `{ source_id }`: owner-only cascade to secret, imports and mappings.
- Future mapping UI can use authenticated Supabase select/upsert/delete on
  `external_calendar_course_map`, conflict key `source_id,external_course_key`.

The secret table and all sync RPCs remain inaccessible to PUBLIC/anon/
authenticated clients, including the source owner. RLS is enabled on all four
tables; all new functions use SECURITY INVOKER and a fixed search path. Events
inherit source ownership without a duplicative per-row user column. Source/map
composite FKs retain strict ownership enforcement. Account deletion cascades.
Raw URL/body/exception logging is absent; client errors are fixed codes. The
subscription URL/long token is redacted if reflected in retained event text.
Trusted DB/service-role administrators and existing backups can still access
server secrets; live disconnect does not change backup retention.

HTTPS only, port 443, no credentials, public DNS address checked with `ipaddr.js`
and pinned to the socket, private/reserved/mapped-private addresses rejected,
redirects refused. A future connection UI must keep entered URLs out of client
logs/analytics. Neither parser dependency enters the browser bundle.

## Index review

Events have exactly two indexes: the natural PK for source/UID upsert and source
lookup, and `(source_id,event_date)` for date-range queries and retention. Owner
queries first obtain the user's source IDs using the source owner index/RLS.
There is no event UUID PK, per-event owner index, JSON index or title index.
Small source/map indexes support owner lookups, source/course ownership FKs and
mapping identity. The extra `(courses.id,courses.user_id)` index enforces mapping
ownership and is included in the measurements below.

## Measured storage

Reproduce offline: `node scripts/measure-calendar-storage.mjs` (or `--quick`).
[Raw measured bytes](measurements/university-calendar-storage.json) are committed.
The script applies the actual migration to PGlite's PostgreSQL 17.5 and uses the
production parser on the Canvas fixture plus varied generated coursework:
100/300 retained rows per source, 10% all-day, 80% with a 120-byte excerpt,
realistic titles/course labels/event URLs, one source and five mappings per user.

Measurements use `pg_table_size`, `pg_indexes_size`, `pg_total_relation_size`
and `pg_column_size`: allocated table/TOAST/free-space-map/index pages, not JSON
length or a simple row-count multiplication. Ordinary VACUUM only; never VACUUM
FULL/repacking. The edit scenario changes 10% of events in each of three rounds,
with ordinary VACUUM between rounds. No-op sync tuple stability is also tested.

| Users × events/user | Initial calendar storage | After three 10% edit rounds |
| --- | ---: | ---: |
| 100 × 100 | 5.77 MB | 6.31 MB |
| 100 × 300 | 16.66 MB | 18.14 MB |
| 1,000 × 100 | 55.16 MB | 60.10 MB |
| 1,000 × 300 | 163.87 MB | 178.24 MB |

Decimal MB (1,000,000 bytes). Includes all four new relations and all their
indexes, plus the added course ownership index. Excludes existing app/auth/course
storage and WAL/backups. These Step 1 figures are actual **local** page measurements from the
32-bit PGlite build, used as estimates for hosted PostgreSQL: platform alignment,
real field distributions, autovacuum lag and edit patterns can differ.

With the user's current ~30 MB database, the high measured case is ~208 MB after
edits, leaving ~292 MB of the stated 500 MB allowance for application growth and
headroom. Budget ~200 MB for 1,000 users' calendars in this workload. The 300-event
**aggregate user cap**, field bounds, retention and no-op update avoidance are
what make this plausible; three feeds do not triple that budget. All fields at
maximum length or sustained mass rewriting cost more. If real usage exceeds
this budget, tighten to 200 retained events per user / 30 past days, rather than
expanding the caps. A free-tier fit is not a guarantee against other app growth.

## Verification

`npm run test:calendars` exercises the parser, bounded fetch, API, real SQL/RLS,
FK ownership, manual transactions and v57 suspension in the local PostgreSQL
harness. Includes retention boundaries, aggregate source budgets, UTF-8 lengths,
304 day rollover, immediate deletion, rollback and physical no-op tuple checks.
No hosted migration/advisors or real private Canvas feed were used.

Full checks: `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`.
Results: all 29 calendar tests / 536 total tests passed; lint clean; production
build passed with only the pre-existing 3 MB PWA precache warning.
