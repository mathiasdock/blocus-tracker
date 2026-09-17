# Course spaces (`/communautes`)

Status: **shipped** (Communities phase 2, 2026-09-17). Replaces the academic-space network documented in `study-spaces.md`, whose interface is retired and whose data is kept private. The navigation label stays **Communautés / Communities**.

Journey: **my personal courses → matched canonical courses (`canonical-courses.md`) → relevant course spaces → voluntary join → one lightweight course conversation.** It is not a social network and does not replace WhatsApp or Discord: a student sees which of *their own* courses connect them to students of *their* institution, joins if they want, writes, shares an exam date, and goes back to studying.

Migrations: `supabase/migrations/20260917061842_course_spaces.sql`, then `20260917104500_default_academic_spaces.sql` (both applied 2026-09-17 via MCP).

## Two default spaces, then courses

Since 2026-09-17 (second migration below) every student also belongs to two spaces built from their profile, so the page is never empty before a course match exists:

| Space | Identity | Created |
|---|---|---|
| Institution | the university of the profile (`course_institution_of`, the same resolution as everywhere else) | at the first `ensure_my_default_rooms()` for that institution |
| Program **inside** that institution | the broad field's English name (`study_spaces` row `field-<id>`, 22 stable ids) or, without one, the free-text `study_field` | idem, per institution + normalized program key |

Rules that keep this simple:

- **Institution-scoped.** "Business & Management · ICHEC" and "Business & Management · Solvay" are two rooms; no cross-institution program space exists, and none can be created.
- **Automatic, not imposed.** `ensure_my_default_rooms()` runs when the page opens: it creates the rooms lazily, joins the student, and moves them when the profile changes (the membership of a space that no longer matches is dropped; messages stay). Leaving one is remembered in `course_room_optouts`, so the sync never puts it back; the space stays listed with a *Rejoindre* action, and `join_default_room(room)` — the caller's own spaces only — clears the memory.
- **No taxonomy comes back.** No global hub, no cross-university field, no exam space, no hierarchy, no browsing. "Other studies" creates no program space: it would gather unrelated students behind one meaningless name.
- **Same conversation, same privacy.** A default space is a `course_rooms` row like any other: members only, same posting rules, same moderation, same 3-member count threshold. The 40-space cap counts course spaces only.
- **Identity.** The institution shows its real logo when the project ships one (`lib/universities.js`), otherwise its initials in ink; a program shows no mark at all, with its institution as the secondary line. No icon tile, no invented pictogram.

The list therefore reads: **Tes espaces** (institution, program) → **Tes cours** (joined course spaces) → **Pour tes cours** (suggestions and match questions). On a wide screen the page opens on the first joined course space, or on the institution space when there is none.

## Model

Three objects stay distinct:

| Object | Table | Rule |
|---|---|---|
| Personal course | `courses` | Name and color belong to the student. Never shown to anyone else. |
| Canonical course | `course_offerings` | Shared title inside one institution (Phase 1). The room hangs off it — no second course identity is created. |
| Membership | `course_room_members` | Always a voluntary act. A course link (`course_links`) is **not** a membership and never creates one. |

New tables:

| Table | Columns | Notes |
|---|---|---|
| `course_rooms` | `id`, `kind` (`course` / `university` / `program`), `offering_id` (unique, FK `course_offerings`), `institution_id`, `program_key`, `title`, `created_at` | One room per canonical course, one per institution, one per program inside an institution (partial unique indexes + a shape check). No client grant at all: rooms are reached only through functions. |
| `course_room_optouts` | `user_id`, `room_id`, `created_at` | A default space left on purpose; the automatic sync skips it until the student joins again. Readable by its owner only, written by functions only. |
| `course_room_members` | `room_id`, `user_id`, `joined_at`; PK `(room_id, user_id)` | Clients read **their own rows only**; no client insert/update/delete. |
| `user_blocks` | `blocker_id`, `blocked_id`, `created_at`; PK pair; check not self | The blocker reads, inserts and deletes their own rows. The blocked student is never told. |
| `course_message_reports` | `message_id` (FK `community_messages` cascade), `reporter_id`, `reason` ∈ spam/abuse/other, `created_at`, `resolved_at`; PK pair | The reporter reads their own rows; writes only through `report_course_message`. |

Messages reuse `community_messages` with a new `room_id` column (and `hidden_at`). A check constraint makes a row belong to exactly one place: a legacy `community` **or** a `room_id`. Reusing the table keeps, unchanged: the server badge rule (`award_badges_for_user` counts `community_messages`), the personal data export, storage cleanup / egress guard scans of `attachment_url`, and attachment signing. Room messages are always `content_type = 'discussion'` and have no threads (`validate_study_reply` refuses a `parent_id`).

## Room lifecycle

- **Lazy creation.** A room is created by the first `join_course_room` for that canonical course (`insert … on conflict (offering_id) do nothing`). Canonical courses nobody joins have no room; there are no thousands of empty rooms. Concurrent first joins produce one room (unique constraint, tested).
- **Never auto-deleted.** A room stays when its last member leaves; it costs one row.
- **Membership is independent of the personal course.** Archiving or deleting a personal course does not remove the student from the room. What changes: the room no longer shows that course's color, "Ton cours : …" or *Étudier ce cours* (these need an active personal course linked `auto`/`confirmed`). Leaving is always explicit.
- **Institution change.** Rooms joined at the previous institution remain until the student leaves them; suggestions and search follow the current institution only.
- **Cap.** 40 memberships per student (`Too many course spaces`).

## What the student sees

Opening the page calls, in parallel: `courses` (own rows), `resolve_my_course_links()` (Phase 1 matching, ~0.3 s for the largest institution, 61 students, measured in a rolled-back transaction) and `ensure_my_default_rooms()`, then `course_space_summaries(offering ids of auto/confirmed links)`. Pure decisions live in `lib/courseSpaces.mjs` (tested); I/O in `lib/courseSpacesClient.js`.

**Left column** (`components/course-spaces/CourseSpaceList.js`)

1. *Chercher un cours* — optional; `search_course_spaces` over canonical titles of the caller's institution (min 2 characters, 20 results). A student may join any space of their institution found this way (decision of 2026-09-17).
2. **Tes espaces** — the institution and the program of the profile (`ensure_my_default_rooms`), then **Tes cours** — joined course rooms, most recent activity first; unread count from `NotificationContext` (`room_<id>` keys).
3. **Pour tes cours** — first at most two questions for uncertain matches, then one row per canonical course linked `auto` or `confirmed` to an **active** personal course and not joined. Nothing else can appear here: no popularity list, no other institution, no invented recommendation.
4. One truthful sentence when empty (`coldStartState`): no institution → profile link; no active course → Timer link; courses but no match yet → *« Tes cours apparaîtront ici quand Blocus trouvera des étudiants de ton établissement qui suivent le même cours. »*

Row: canonical title; *Ton cours : {name}* only when the words differ (`namesDiffer`); member count only from **3** (`visibleMemberCount`, enforced by the server too); last activity only for members. Identity is the student's personal course **color marker**, shown only through a real link — never a generic icon or tile.

**Uncertain match.** A course with no `auto`/`confirmed` link and a `suggested` candidate becomes one sentence, *« ADV Strat semble correspondre à Advertising Strategy. » [Oui] [Non]*, answered with `confirm_course_link` / `reject_course_link`. One candidate per course (higher confidence, then the shorter title), at most two questions at a time. A rejected pair is never returned by the server again; the next candidate for that course may be asked. There is no matching-management screen.

**Right column** (`components/course-spaces/CourseRoom.js`)

- Header: course marker + canonical title, *Ton cours : …* and member count when allowed, *Étudier ce cours* (only with a linked active personal course), overflow menu with *Quitter l'espace* for members.
- Not a member: one paragraph on what joining means, *Rejoindre*, and *« Seuls les membres voient les messages. »* No message is fetched (RLS would return none anyway).
- Member: one chronological stream, oldest at the top and newest against the composer; day markers; consecutive messages of one author grouped within five minutes; own messages on the right in the mint bubble, others on the left with avatar and name (the Friends chat grammar). Older pages by keyset (`created_at,id`, 40 rows). New messages by polling every 15 s while the tab is visible (the Realtime publication only carries `private_messages`), announced politely to screen readers.
- Composer: auto-growing field (Enter sends on desktop), attachment (existing safe upload rules, `<uid>/<room>/…` path in the private `community` bucket), and a discreet calendar button to share an exam date. The server accepts text and/or attachment and/or exam date.

**Study-native actions — the only Blocus-specific ones.**
- *Étudier ce cours* selects the student's own course in the Timer and opens it. A session already running or paused on another course is never re-attributed; the student gets a message instead.
- A shared exam date shows the Planning exam vocabulary (`PlanningExamMark`, warm exam tokens — `styles/planning.css` scopes them to `.bt-course-room` too). *Ajouter à mon planning* inserts into the reader's own `exams`, on their linked course when there is one (so Planning shows its color), named *Examen · {course}*. A date already planned (same day and course, or same name without a course) shows *Dans ton planning* on arrival (`isSharedExamPlanned`). No consensus, no "X students have this date".

Not built, on purpose: weekly presence, "X students studied", exam consensus, pinned resources, polls, reactions, group timers, public study status, social XP, push notifications for rooms (in-app unread only), categories or filters.

**Layout.** Desktop (≥1024 px) keeps the full-height social shell shared with Friends (`bt-social-fill-*` in `globals.css`): list a third wide, room on the right, one hairline between them. Below 1024 px the list fills the Social tab (Activité / Amis / Communautés stay above it); opening a space goes full screen (`bt-chat-fullscreen` on `<html>`), with its own back button. On phones the room height follows `visualViewport` so the composer stays above the keyboard. Message actions appear on hover/focus with a pointer and on tapping a bubble on touch screens.

## Privacy and RLS

- `community_messages` select (`community_messages_read`): the author; admins; otherwise only **members of that room**, and never a message hidden by moderation (`hidden_at`), one by a student the reader blocked, or one the reader reported. Legacy rows (`community` set, no room) are now readable by their author and admins only.
- No client can insert into `community_messages` any more (`cmsg_insert` dropped): posting goes through `post_course_room_message`. Authors and admins keep delete (`cmsg_delete` unchanged).
- Membership details are not globally readable: `course_room_members` returns the caller's own rows; counts come from functions and only from 3 members. Non-members get a minimal preview: canonical title, and a count ≥ 3.
- Personal course lists and other students' course names never leave the server; course links stay owner-only (Phase 1, unchanged).
- A student cannot join, leave or alter someone else's membership (no table writes; functions act on `auth.uid()`). Room creation is not a public insert: only `join_course_room` creates, for a canonical course **of the caller's institution**.
- Attachments: `/api/storage/sign` now checks community files **as the student** — it signs only when that student can read the referencing message under the RLS above. Before, any signed-in account could sign any community file referenced by a message.
- Functions (all `security definer`, `search_path = public`, revoked from `public`/`anon`, granted to `authenticated`): `course_space_summaries`, `search_course_spaces`, `join_course_room`, `leave_course_room`, `post_course_room_message`, `report_course_message`, `admin_course_reports`, `admin_resolve_course_report`, `ensure_my_default_rooms`, `join_default_room`. The program helper `course_program_of` stays internal (no client grant).
- A default space is never reachable from another institution: `join_default_room` checks the caller's own institution and, for a program, their own program key.

## Moderation

- **Report** (message menu → reason sheet: spam / propos blessants / autre): the message disappears for the reporter at once; after **3** open reports it is hidden for everyone (`hidden_at`). 20 reports per student per day. A student cannot report their own message or a message outside their rooms.
- **Block** (message menu): the blocked student's messages disappear for the blocker in every room; *Étudiants bloqués (n)* at the bottom of the list reopens them for unblocking.
- **Delete**: authors delete their own messages (and their own stored file); admins can delete any.
- **Spam limits in `post_course_room_message`**: 6 messages per 30 s and 200 per day per student across rooms, identical text in the same room within 2 minutes refused, 1,000 characters, exam date between yesterday and 730 days ahead, attachment path and type validated.
- **Admin path**: `/admin` → Membres → *Signalements · espaces de cours* (`components/course-spaces/CourseReportsAdmin.js`): open reports grouped by message (room title, author pseudo, content, reasons, count, hidden state) with *Garder le message* (resolves reports, unhides) or *Supprimer le message*. Reporter identities are not shown.

## Legacy data (academic spaces)

Nothing was deleted. As of 2026-09-17: **183** `study_spaces` (still readable by signed-in students, no longer used by any screen), **649** `study_space_members` rows (now readable by their owner only; `study_members_read` replaced), **9** legacy `community_messages` (now readable by their author and admins only; nobody can publish in the legacy system). The legacy functions (`sync_my_study_spaces`, `ensure_study_space`) and tables remain for a later clean-up decision. Between the migration and the deployment of this interface, the old screen could no longer show other students' posts or publish.

## Tests

- `supabase/tests/course_spaces_security.sql` — 46 checks with two throw-away institutions and seven throw-away students, always rolled back: lazy creation and idempotent join, one room per canonical course, cross-institution join/search/summary refused, search scope, posting rules (trim, duplicate, foreign attachment path, far exam date, length, threads, non-member, burst limit), member reads, own-membership-only reads, rooms unreadable, no client membership or message writes, other students' course links unreadable, non-member reads nothing, leave revokes read and post, counts hidden under 3, blocks (per blocker, cannot block for someone else, unblock restores), reports (own/non-member refused, hidden for the reporter, hidden for all at 3, author still sees), admin functions refused to students, admin dismiss and remove, legacy messages and memberships private, legacy insert refused, badge rule still counts room messages, `anon` denied. Expected: an error starting with `COURSE SPACES TESTS PASSED`.
- `supabase/tests/course_default_spaces_security.sql` — 26 checks on the default spaces, always rolled back: two spaces for a complete profile, idempotence (no duplicate room or membership), shared rooms for the same institution and program, the same program name at another institution as another room, free-text program, missing program (institution only), missing university (nothing), program change and institution change moving the memberships, a deliberate leave remembered and the space still offered, `join_default_room` restoring it, cross-institution and other-program joins refused, members reading and writing, non-members refused, opt-outs private, `anon` and the internal program helper denied. Expected: an error starting with `DEFAULT SPACES TESTS PASSED`.
- Phase 1 tests still apply: `course_matching_pure.sql`, `course_matching_security.sql`.
- `node --test tests/course-spaces.test.mjs` — suggestion/joined/question rules, archived courses, two personal courses on one canonical course, count threshold, name difference, cold-start sentences, grouping and day markers, poll merging (deletions, gaps), announcements, exam bounds, planned-exam detection, error mapping.

Local browser verification: `NEXT_PUBLIC_OFFLINE_DEV=true` build with the synthetic fixture `lib/offlineCourseSpaces.js` (labelled *Données de démonstration locales* on screen; nothing is written to Supabase). `?demo=empty` shows the cold start.

## Known limits

- Matching quality is Phase 1's: a course nobody else names the same way stays unmatched; search is the way in.
- Polling, not realtime: new messages can take up to 15 s to appear; unread badges follow the app-wide notification poll.
- Signed attachment links last 5 minutes.
- `resolve_my_course_links()` analyses the whole institution on each page open; materialise identities before institutions reach a few thousand courses (see `canonical-courses.md`).
- No push notification for rooms; no edit of a sent message (delete and resend).
