# Imported academic events — Step 2

Local only on `codex/university-calendar-foundation`; no push, remote migration
or deployment. The Step 1 migration is unchanged. Apply the additional
`20261001212530_classify_external_academic_events.sql` after Step 1 when deployment
is authorized. No Planning, objectives, local exams, course creation, mascots,
notifications or conversion workflow is added.

## Deterministic rules

`lib/academicEventRules.mjs` contains English and French phrase dictionaries.
`lib/academicEventClassification.mjs` is a pure engine: Unicode accent/case
normalization, whole-token/phrase matching and explicit precedence. It makes no
network/AI calls and adds no dependency. Dutch/Spanish can be added as dictionary
entries of the same shape, with tests, without new language branches in the engine.

The classifier uses the compact title, excluding a known trailing course label.
The quiz veto also checks the original title, so suffix removal cannot promote
a quiz-labelled title. Descriptions, course mappings, UID patterns and URLs cannot promote something
into an exam. This avoids interpreting incidental instructions or Canvas's
assignment URL as definitive event type. Missing/unknown evidence stays other/low.

Precedence:

1. Negation/cancellation wording yields other/low.
2. Quiz/QCM/interrogation terms veto automatic exam classification, even if the
   title also says exam. Practice Quiz remains quiz/high. Mixed quiz titles
   become quiz/low rather than exam.
3. Exam preparation/practice/review/results/registration/schedule wording yields
   other/low. “Examen blanc” and “Révision du partiel” are not high-confidence exams.
4. Conflicting types or alternatives yield other/low. Exact words match; e.g.
   “Example”, “Contest” and “Finalization” do not match exam/test/final.
5. Explicit exam/examen/partiel/midterm words are high confidence. Numbered test/
   contrôle and a standalone Final are exam/medium candidates. “Assessment 1”
   and “Évaluation 1” remain other/low.
6. Explicit assignment/essay/devoir/dissertation, project/projet/mémoire and
   presentation/présentation/exposé/soutenance words establish those types.
   Broader report/paper/rapport/compte-rendu words use medium confidence.

| Title | Automatic type | Confidence | Importance |
| --- | --- | --- | --- |
| Exam 1 / Final Exam / Midterm / Examen final / Partiel | exam | high | critical |
| Test 1 / Test 2 / Contrôle 1 / Final | exam | medium | normal |
| Quiz 1 / Practice Quiz / QCM 1 | quiz | high | normal |
| Final Exam Quiz | quiz | low | normal |
| Group Assignment / Devoir de groupe | assignment | high | major |
| Essay / Dissertation / Assignment 2 | assignment | high | normal |
| Research Paper / Final report | assignment | medium | major |
| Group Project / Projet de groupe | project | high | major |
| Presentation / Exposé oral | presentation | high | major |
| Assessment 1 / Évaluation 1 / Exam or Project | other | low | normal |
| Practice Exam / Examen blanc / Exam review | other | low | normal |

Importance is separate from type: high-confidence or student-confirmed exams
are critical; projects/presentations and explicitly substantial assignments
(group/team/final/research wording) are major; quizzes, ordinary assignments,
other events and unconfirmed exam candidates are normal. No duration, grade
weight or deadline urgency is invented.

These are conservative lexical rules, not semantic certainty. Unlisted languages,
truncated titles and unusual wording can be other/low or need correction. No
claim of universal recognition or real-feed precision is made.

## Stored automatic result and student authority

Seven small PostgreSQL enum columns, no extra index, table or raw metadata:

- `automatic_type`, `automatic_confidence`, `automatic_importance`: computed by
  the server during a successful full manual sync.
- `user_override`: nullable student-selected type; null clears the correction.
- `event_type`, `confidence`, `importance`: generated effective columns. They
  always reflect the override if set and cannot be independently overwritten.
  Explicit correction is student confirmation, so effective confidence is high;
  the original automatic confidence remains available separately.

`resolveAcademicEventClassification` gives the same effective result for an
in-memory object and derives `exam_proposal_eligible`. Database/pure-resolver
parity is tested across every automatic type/confidence/override combination.

Only an effective **exam/high** result is eligible for a later proposal.
Medium/low automatic candidates are not eligible; a student explicitly setting
an exam override confirms it. Eligibility is a boolean only: no proposal UI,
existing `exams` row, objective or automatic conversion is created here.

Authenticated clients have UPDATE permission on **only** `user_override`, with
owner-only RLS and the existing suspension trigger. They cannot edit imported
content, automatic classifications, source identity or generated effective fields.
A future correction UI can use the authenticated Supabase client:

```js
supabase.from('external_academic_events')
  .update({ user_override: 'quiz' }) // null clears it
  .eq('source_id', sourceId)
  .eq('external_uid', externalUid)
  .eq('recurrence_id', recurrenceId)
  .select('event_type,confidence,importance,user_override');
```

The final sync transaction never inserts or updates `user_override`, even if an
incoming service payload includes it. Thus ordinary re-sync, changed titles,
changed automatic types, no-op upserts and 304s preserve corrections. Generated
fields recompute immediately when automatic data or the override changes.
Correction timestamp uses the existing event `updated_at`; no history log is added.

Overrides belong to the retained event's full source/UID/recurrence identity.
Step 1's immediate deletion for cancellation/disappearance, retention pruning,
disconnect and account deletion remain intact: deletion removes the correction
with its event. A later reappearing event starts fresh. There are no override
tombstones or indefinite student-history storage.

Existing Step 1 rows default to other/low/normal until the next manual sync.
The new migration clears conditional validators so that the next manual request
fetches/classifies unchanged feeds too. It does not fetch or schedule anything.
Future rule changes should likewise invalidate validators when reclassification
is needed; same-day 304s retain the already-computed result.

## Step 1 protections retained

45 past / 365 future days, 300 retained events total per user, 1 MiB feed cap,
compact text limits, atomic upserts, no physical rewrite for unchanged content,
private server-only feed URL, SSRF defenses, course mapping and all original
security/retention tests remain. No local course or color is required or inferred.
Generated fields use fixed four-byte enums rather than strings or a JSON blob.

The Step 1 storage benchmark remains reproducible without flags. Run
`node scripts/measure-calendar-storage.mjs --classification` for the Step 2
schema and classifier. Neither command connects to a hosted database.
The [Step 2 measurements](measurements/university-calendar-classification-storage.json)
are 6.02 / 17.33 / 57.64 / 171.63 MB initially and 6.58 / 18.95 / 62.90 /
186.74 MB after edit cycles, for the same 100×100, 100×300, 1,000×100 and
1,000×300 cases. The high case adds ~8.5 MB after edits over Step 1; it remains
below ~217 MB when combined with the user's stated ~30 MB existing database.
These are local PostgreSQL/PGlite page measurements, not a hosted quota promise.

## Verification

`npm run test:calendars` includes table-driven EN/FR/ambiguous-title tests,
override precedence, proposal gating, real PostgreSQL generated columns and
permissions, owner isolation, suspension, malicious override fields in sync
payloads, 304/full/modified sync persistence, and all Step 1 regressions.
The original migration remains byte-for-byte unchanged. Full suite, lint and
production build are also required before committing.
Verified: 105 calendar/classification tests, 612 total tests passed; lint clean;
production build passed with the existing 3 MB PWA precache warning. No classifier
or automatic classification fields appeared in the generated browser bundles.
