# Academic spaces

Communities is a public-to-signed-in-students study network. Friends remains the private inbox; its private groups are not migrated into academic spaces.

## Model

`study_spaces` is an immutable registry with explicit kinds and parent relationships:

`All students → University → Field → Program → Course → Exam`

A program or course may sit directly under a university when more precise information is unavailable. Global field spaces connect students across universities. `broader_id` links a local branch to its global field; breadcrumbs retain every ancestor. Recommendations rank only ancestors and the matching global field using genuine recent activity and membership, never invented activity. Quiet spaces remain usable; they do not automatically redirect or blend unrelated posts.

`study_space_members` records multiple memberships. Signed-in students can read the registry, memberships and posts; only the member can join/leave. Publishing requires membership (the old own-university/admin exception is retained for installed clients). Registry inserts are validated server-side, attributed to the caller and rate limited. Invalid hierarchies and replies attached to another space are rejected.

`profiles.broad_field` uses 22 stable taxonomy IDs. Existing `study_field` remains the optional precise free-text program; `study_year` is retained. The profile and onboarding make the broad field primary, with an expandable optional specialization/degree input. Closing that input never clears its saved text. On opening Communities, `sync_my_study_spaces()` enrolls the user in their university, local/global field and a genuinely more specific program. Generic labels such as “Gestion d’entreprise” do not create another program under Business & Management. A profile signature prevents reopening/search from undoing a deliberate leave. Changing profile studies adds the new suggestions without deleting previous memberships.

The 2026-09-14 backfill maps reviewed exact normalized aliases in `lib/studyFieldAliases.mjs`. It fills only missing `broad_field` values, preserves every original `study_field` and all explicit choices, and joins migrated students to their global/local field spaces. A transaction-local snapshot asserts those invariants before commit. No substring or fuzzy matching is used: mixed subjects and unclear abbreviations remain unclassified. After migration, 202 profiles have a field and 13 nonempty legacy labels remain for user confirmation. `infer_legacy_study_field` performs classification; `study_program_is_generic` separately distinguishes redundant labels from precise degrees. These are authenticated, security-invoker functions. Existing spaces and their content are not deleted or merged.

## Identity and university discovery

`ensure_study_space` handles concurrent creation and reuses normalized names. Courses are deduplicated across programs within the same university, never across universities. Exam identity includes its course and optional date; users are prompted to include the term/session in its name.

The existing curated university names/IDs and message history are preserved. The shared university picker also searches the [Hipo university directory](https://github.com/Hipo/university-domains-list), an MIT-licensed dataset, through `/api/universities`. The full directory is cached server-side for 24 hours, not shipped in the browser bundle. Search terms are not forwarded to Hipo. Different-country institutions sharing the same name receive a country suffix. A custom entry is available if the directory is incomplete or unavailable; no manual database migration is required for a new institution.

This is normalized-name matching, not semantic matching: abbreviations, translated institution names, different spellings of a free-text program, and differently named versions of the same course can still create distinct spaces. Same-country institutions with identical names require a distinguishing campus/location in their entry. There is no automatic merging or unverified official-university claim. An alias/moderated merge facility is a future extension, not part of this release.

The main search finds registered universities, fields, programs, courses and exams. Worldwide unregistered institutions are searched in the university picker (create space, profile and onboarding). Search returns up to 40 registered results with a refinement hint; joined spaces are loaded separately (up to 200), and parents are resolved in bounded batches. Child-space previews are limited to 40. Broader discovery highlights active spaces and global fields rather than an exhaustive university directory.

## Unified timeline

Existing `community_messages` and attachment references remain authoritative. `content_type` distinguishes discussion/question/resource/exam, including old prefix-encoded posts. A compatibility trigger categorizes posts from older clients without changing their text. Filters are optional; the default feed includes all types.

Posts and replies use deterministic keyset pagination by `created_at,id`, 30 rows per page. Replies show latest first so a newly sent response remains visible even on a long thread. Refresh polling is 30 seconds only when the tab is visible, near the top of the first page, and not composing or reading replies. Unread counts follow joined academic spaces. Attachments continue through the private storage signing endpoint. Exam posts retain the add-to-planning action.

## Rollout and verification

Apply in order:

1. `20260913174717_study_spaces.sql`
2. `20260913180559_study_spaces_preferences.sql`
3. `20260914045839_classify_legacy_study_fields.sql`

The first two additive migrations were applied on 2026-09-13, and the classification migration on 2026-09-14. No legacy messages were deleted. No frontend deployment or Git push is implied by applying these migrations.

Automated domain tests: `node --test tests/study-spaces.test.mjs`. Existing auth, mascot and swipe suites also run with `node --test tests/*.test.mjs`.

Database checks were executed as an authenticated non-admin in rolled-back transactions: hierarchy creation, same-university course reuse, cross-university separation, join/leave publishing permissions, another user's membership insertion denial, cross-space reply denial, anonymous creation denial, and deliberate-leave persistence after profile sync. Test records were rolled back.

Local browser verification uses `NEXT_PUBLIC_OFFLINE_DEV=true` and the explicitly synthetic fixtures in `lib/offlineStudySpaces.js`; no sample content is inserted into Supabase. This covers mobile/desktop navigation, typed posting/filtering/replies, join/leave, creating an exam, and finding/creating Stanford through the worldwide directory. It does not replace a physical iPhone or authenticated production end-to-end check.

Final checks: 40 Node tests passed, ESLint passed, and `NEXT_PUBLIC_OFFLINE_DEV=false npm run build` succeeded. The independent visual review finished with `disposition: ship` after contextual deletion and filter-specific empty states were verified in desktop/mobile recaptures. Keyboard activation of the deletion overflow and restoring the complete timeline from an empty filter were also checked in the browser.
