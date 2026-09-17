# Canonical courses and course links

Status: **in use** since Communities phase 2 (2026-09-17). This document describes the matching foundation (phase 1). Its only consumer is the course spaces page, documented in `course-spaces.md`: `/communautes` calls `resolve_my_course_links()` on opening, suggests spaces for `auto`/`confirmed` links and asks `suggested` pairs once. The former Communities taxonomy (`study_spaces`, see `study-spaces.md`) is retired from the interface; its data is kept, private.

Migrations: `supabase/migrations/20260917021405_canonical_course_matching.sql`, then `20260917055426_canonical_course_matching_fixes.sql` (both applied on 2026-09-17).

## Three objects, never merged

| Object | Table | Belongs to | Used by |
|---|---|---|---|
| Personal course | `courses` | the student | Timer, Planning, Stats — unchanged. The name stays personal: "ADV Strat" is never renamed. |
| Canonical course | `course_offerings` | nobody (derived) | matching. One real course inside **one** institution. No owner, no member list, no counts. |
| Course link | `course_links` | the student, private | matching. The decision "this personal course is that canonical course". |

**Social membership is a fourth, separate concept.** A link never makes anyone a member of a future course room; a student can be linked without ever joining it.

Decisions this model encodes:

- **Institution** = hard matching boundary. Two courses at different institutions never match, whatever their names.
- **Program** = optional evidence only. It is never a boundary and is currently not used at all (students of different programs share courses, and `study_field` is free text).
- **Year** = optional ambiguity evidence only. It never decides membership and never splits a course into year-specific canonical courses.
- **Course identity** = the primary matching problem.

## What "same institution" means

The institution of a student is the `study_spaces` row of kind `university` whose `study_name_key(name)` equals `study_name_key(profiles.university)` — exactly how `sync_my_study_spaces` / `ensure_study_space` already resolve it. Curated schools keep their ids (`ICHEC`, `ULB`, `UCL`…); custom entries have `space-…` ids. There is no second institution system. The lookup is read-only (`course_institution_of`): it never creates a space.

Consequences: a student without a resolvable university (4 profiles on 2026-09-17) is never matched; two spellings of the same school entered as custom text ("Univ. de Lille" / "Université de Lille") are two institutions and never match (safe side). Solvay and ULB are distinct institutions.

## Lifecycle of a canonical course

- **Emergence.** A canonical course exists once **2+ distinct students** of the institution share the same course identity or the same course code. One student alone never creates one. Creation happens lazily and institution-wide whenever a student of that institution calls `resolve_my_course_links()`. There was **no backfill**: on 2026-09-17 both tables are empty.
- **No spelling duplicates.** A shared title that is only an abbreviation, typo, word-order or acronym variant of an existing canonical course, or of a better-supported shared title, does not get its own canonical course; its students are asked about the variant instead ("Progra" → "Programmation"). Preference: the longer form for abbreviations/acronyms, the most used spelling for typos and word order, and an existing canonical course always wins (no later duplicate). Two students rejecting that variant for their name lift the restriction.
- **Title.** The most used spelling among the students (letters, digits and ordinary punctuation; emoji removed). On a tie: title words over a bare code, no course code inside a title identity, no bare number such as a year, filler words kept ("Droit des médias" rather than "Droit média"), accents kept, capitalised, then the shortest. The title is fixed at creation.
- **`generic`** records whether the title has at most one distinctive word or is a language course (see below). Phase 2 can use it to decide what to propose.
- Canonical courses are internal and are never deleted automatically. Some stay inert (29 on the production dry run: generic names used across years, where nobody is linked or asked).

## Matching pipeline

Everything is deterministic SQL: no LLM, no embeddings, no external service.

1. **Normalisation** reuses `study_name_key` (lower case, accents, punctuation).
2. **Identity** (`course_identity`) reads the tokens: course code (`ADV3008`, `LINFO1115`, `ADV 3008`, `INFO-F101`), study level written in the name (`BAC 1`, `BA1`, `B1`, `Bloc 1`, `MA1`, `Master 1`), sequence marker (`2`, `II`, `Partie 2`, `Q2`, `S1`, `Semestre 1`), academic years (`2025`, ignored) and filler words (FR/EN/NL: de, du, des, the, of, van, cours…). The remaining title words are folded: plurals (strategies, statistiques, internationaux, réseaux), feminine endings (générale, appliquée), systematic FR/EN or UK/US endings (optimisation/optimization, statistique/statistic, économie/economy, capitalisme/capitalism, probabilité/probability).
3. **Lexical comparison** (`course_title_match`) of two names, one rule per result.
4. **Evidence** at the institution (`course_candidates`): declared years of the students carrying the canonical course or using the same personal name, longer shared titles, other students' confirmations and rejections for that same personal name.
5. **Final confidence** (`course_link_confidence`).

A pre-filter (`course_pair_prefilter`) skips pairs that cannot reach MEDIUM; the pure test suite checks it never hides a MEDIUM/HIGH pair of the cases.

## HIGH / MEDIUM / LOW

HIGH is linked automatically, MEDIUM is asked once, LOW is never linked nor asked.

| Result | Rule | Example |
|---|---|---|
| HIGH | `code_match` — both names carry the same code (decides alone) | ADV3008 Brand Management ↔ ADV3008 |
| HIGH | `same_title` — identical folded words, same sequence and level, distinctive name | Advertising Strategy ↔ Advertising Strategies; Cours de droit civil ↔ Droit civil |
| HIGH | `trusted_alias` — a MEDIUM variant confirmed by 3+ other students, at least twice as many as rejected it | ADV Strat, after 3 confirmations |
| MEDIUM | `abbreviation` — each differing word is a prefix (3+ letters, 4+ for a one-word name) | ADV Strat ↔ Advertising Strategy; Stat ↔ Statistiques |
| MEDIUM | `typo` — one edit in a word of 7+ letters whose first three letters agree | stathistique ↔ statistique; Responsable ↔ Responsible management |
| MEDIUM | `word_order`, `acronym` | Marketing international ↔ International marketing; HDI ↔ Histoire du droit et des institutions |
| MEDIUM | `generic_name` — would be HIGH but the name is generic | Anglais ↔ Anglais; optimisation ↔ optimization |
| MEDIUM | `years_differ` — would be HIGH but declared years differ | Droit civil (BAC 1 and BAC 2) |
| MEDIUM | `shorter_than_known_title` — a longer title shared by 2+ students contains it | Supply chain (next to Supply chain management) |
| MEDIUM | `level_one_sided`, `contested` (2+ other students rejected it), `code_match_sequence_differs` | Statistiques B1 ↔ Statistiques |
| LOW | `extra_words` / `different_words` — a longer title is a more specific course | Math ↔ Math financière; Droit ↔ Droit fiscal; Microéconomie ↔ Macroéconomie |
| LOW | `sequence_one_sided` / `sequence_conflict` / `level_conflict` / `code_conflict` | Compta ↔ Compta 2; Math ↔ Math Q2; ADV3008 ↔ ADV3009 |
| LOW | `generic_years_differ` — generic canonical course already used across study years | Statistiques (BAC 1 and BAC 2) |
| LOW | `rejected_by_students` — 3+ other students rejected it, at least twice as many as confirmed | |
| LOW | `non_course_label`, `unmatchable` | Test, Mémoire, Stage, Projet, Intro alone; an emoji |

A course is auto-linked only when exactly one canonical course is HIGH for it.

## Generic names

A name is generic when it has at most one distinctive word — qualifiers such as introduction, intro, initiation, bases, générale, avancée, appliquée, théorie, pratique do not count — or when it is a language course (anglais, english, néerlandais, NDL…). "Introduction au droit", "Chimie générale", "Anglais des affaires" and "Macroéconomie" are generic; "Droit fiscal" and "Histoire du capitalisme" are not.

A generic name is **never** linked automatically, even through a trusted alias: the same generic name in the same year does not prove the same course. When students using that generic name (or the generic canonical course) declare two or more different study years, the canonical course is ambiguous and **nobody is linked or asked** (`generic_years_differ`): it stays unresolved. There is no rule that splits a generic name into year-specific courses.

## Sequence markers and levels

"Compta" and "Compta 2", "Math" and "Math Q2", "Math Q1" and "Math Q2" are LOW: a part or quadrimester marker on one side only, or two different markers, never silently merge. "Analyse I" = "Analyse 1" and "Math S1" = "Math semestre 1" are the same marker. Quadrimester (`Q2`) and part (`2`) are kept distinct. A level written in both names must agree (BA3 vs Master 1 is LOW); written on one side only, it caps the pair at MEDIUM.

## Aliases

An alias is institution-scoped evidence, never a global rename. It is the set of `course_links` rows with `status = 'confirmed'` for one canonical course and one personal-name identity (`course_key`). One confirmation changes nothing for anyone else. A MEDIUM variant becomes HIGH (`trusted_alias`) only with **3+ distinct confirming students and at least twice as many confirmations as rejections**, and never for a generic name, a LOW pair or a pair whose years differ. The same threshold in the other direction turns a pair LOW (`rejected_by_students`); two rejections already stop automatic links (`contested`).

## Rejections and decisions

- `reject_course_link` stores `status = 'rejected'` for that personal course and canonical course. The pair is never suggested or auto-linked again for this student, whatever happens later (renames included). Another canonical course can still be proposed for the same personal course.
- `confirm_course_link` stores `status = 'confirmed'`; it accepts only a current MEDIUM/HIGH candidate of the student's own active course at their own institution, replaces any other association of that course, and can overturn the student's own earlier rejection.
- No row = unresolved. Suggestions are computed, not stored.

## How automatic links behave over time

`resolve_my_course_links()` recomputes the student's automatic links on every call. An `auto` link survives only while it is still the single HIGH identity of the course: it is withdrawn when the course is renamed into something else, archived, becomes contested, when the student's institution changes or disappears, or when year evidence appears. A withdrawn link comes back immediately as a suggestion when it is still MEDIUM. `confirmed` links are the student's decision and are never removed by the resolver.

## Client API (signed-in students only)

| Function | Returns | Notes |
|---|---|---|
| `resolve_my_course_links()` | rows `(course_id, offering_id, offering_title, status, confidence, rule)`, status ∈ `auto`, `confirmed`, `suggested` | Refreshes and returns the caller's state. Courses absent from the result are unresolved; rejected pairs are never returned. ~0.1 s per call on production data (max 0.19 s at ICHEC, 284 courses). |
| `confirm_course_link(course_id, offering_id)` | the `course_links` row | Errors: `Authentication required`, `Course not found` (not yours), `Course identity not available` (not a candidate at your institution), `This course cannot be associated with this identity` (LOW). |
| `reject_course_link(course_id, offering_id)` | the `course_links` row | Works on a current candidate or any existing decision of your course. |

Owners can also `select` their own `course_links`, and the `course_offerings` they have a decision about.

## Privacy and security

- Other students' personal course names never leave the server. A student only receives canonical titles (spellings shared by 2+ students, emoji removed) and a rule name. The rule can reveal aggregate facts about the institution, for example that the students using a name are in different years (`years_differ`) or that other students rejected it (`contested`, from 2 rejections).
- `course_links`: RLS on, select own rows only, no insert/update/delete for clients. `course_offerings`: RLS on, select only the canonical courses the student has a decision about; no personal column (`id, institution_id, identity_key, code, title, generic, created_at`).
- Only the three client functions above are executable by `authenticated`; they are `security definer` with `search_path = public` and always act on `auth.uid()`. The twelve internal functions (`course_identity`, `course_population`, `course_candidates`, `course_emerge_offerings`…) are not executable by `anon` or `authenticated`. `anon` reaches nothing.
- Inference limit: emergence needs only one other student, so a student who creates a course can learn that at least one other student of their institution uses that name (never who). This matters most at institutions with very few Blocus users.

### Legacy Communities privacy — resolved in phase 2

Phase 1 left the legacy exposures untouched: `study_space_members` and `community_messages` were readable by every signed-in student. Phase 2 (`20260917061842_course_spaces.sql`) closed them: legacy memberships are readable by their owner only, legacy messages by their author and admins only, and nobody can publish in the legacy system. Room messages are readable by room members only. `study_spaces` (names of university/field/program/course/exam spaces, no personal data) stays readable by signed-in students. Details in `course-spaces.md`.

## Tests

- `supabase/tests/course_matching_pure.sql` — 184 checks: every name pair in both directions (brief examples, sequences, codes, accents/case/punctuation, generic names, levels, variants, different courses, non-courses), the evidence rules (years, longer titles, one confirmation vs trusted alias, rejections, contested, codes) and the pre-filter. Expected: `failures = 0`.
- `supabase/tests/course_matching_security.sql` — 38 checks with two throw-away institutions and nine throw-away students, always rolled back: emergence (no duplicates, no activity labels), automatic links, code matches, same name at another institution, same course across programs and years, generic names in the same and different years, sequence markers, spelling variants, remembered rejection, contested identity, single confirmation vs trusted alias, personal names untouched, LOW/foreign/cross-institution confirmations refused, RLS for `authenticated` (other students' links and rejections invisible, no writes, internal functions refused, resolver returns only the caller's courses), `anon` denied, renames, institution change. Expected: an error starting with `COURSE MATCHING TESTS PASSED`.

Run both in the Supabase SQL editor (or MCP `execute_sql`) after the migrations. They insert nothing permanently.

## Production calibration (2026-09-17, read-only)

The deployed functions were run for every student in one rolled-back transaction.

| | |
|---|---|
| Profiles / without resolvable institution | 250 / 4 |
| Active courses / at a resolvable institution | 1,006 / 961 (228 students) |
| Canonical courses | 120 at 10 institutions (85 generic, 0 from a code, 29 inert) |
| Automatic links (HIGH) | 74 links, 25 canonical courses, 49 students — all `same_title` |
| Courses that would be asked once (MEDIUM) | 233 (113 students); only 2 receive two questions. Rules: generic_name 151, years_differ 37, abbreviation 24, acronym 11, typo 5, shorter_than_known_title 4, word_order 3 |
| Unresolved | 654: no other student with that title 446 (261 generic, 185 distinctive), generic name used across years 154, variant withheld across years 27, activity/personal label 12, shorter than a canonical title 7, same words with another part or level 6, unmatchable 2 |

**The 25 automatic canonical courses** (all reviewed): EPHEC — Approche du consommateur (2), Data mining et Storytelling (2), Questions d'éthique économique (2); ICHEC — Droit du travail (4), International Financial Management (3), Strategic management in a complex environment (2), Supply Chain Management (11), Supply Chain Optimisation (10); IHECS — Droit des médias (4), Science politique (2); SOLVAY — Droit fiscal (2); ULB — Génie des procédés (2), Histoire de la Belgique (2), Histoire du capitalisme (2), Histoire du droit et des institutions (3), Méthodologie juridique (2), Politique mondiale (2); ULIEGE — Génie de l'environnement (2), Mathématiques discrètes (2), Organisation des ordinateurs (2); USL — Common Law (3), Droit constitutionnel (2), Droit des obligations (2), Droit public (2), Legal History (2). Each has a single declared year (plus unknown years for Droit du travail); Supply Chain Management and Supply Chain Optimisation span six program labels in Master 1.

**Precision of HIGH.** Method: census, not sample — every automatic canonical course and its 74 links were reviewed against the evidence available (institution, distinctive title, spellings, declared years and programs). There is no official catalogue and no student confirmation yet, so the labels are judgements, not ground truth. Result: 0 of 25 contradicted. That supports high precision but cannot certify ">95 %": with 25 independent clusters and no observed error, the conventional 95 % lower bound is about 88 % at the cluster level (rule of three). Links inside one cluster are not independent, so the 74 links do not tighten that bound. The clearest remaining risk is a distinctive name shared by two different courses inside one institution (Supply Chain Management across six program labels is the case to watch).

Removed from HIGH during calibration, on purpose: "Introduction au droit" (IHECS, ULB) and "Introduction à l'informatique" (ULiège) became generic; "Macro" is no longer asked about "Macroéconomie" at ICHEC because "macro" is used across years; "microéconomie" is no longer a typo of "macroéconomie".

**MEDIUM examples** (asked, never automatic): progra → Programmation (6), hdi → Histoire du droit et des institutions (8), philo → Philosophie (4), socio → Sociologie (4), ifm → International Financial Management, resp man → Responsible management, gestion des paiements internationaux → GPI, approche du consomateur → Approche du consommateur, supply chain managment → Supply Chain Management, responsible management → Responsible management (11, years differ), droit civil → Droit civil (ULB, 6, years differ), supply chain → Supply chain (next to Supply Chain Management). Weakest observed question: méthode → Methodo (ULB).

## Deliberately unresolved or out of scope

- Generic names used across years (154 courses) and generic names nobody else uses (261): Phase 2 could invite students to write the full course name or code; the course-creation UX was not changed here.
- Different words for the same course: FR/EN translations with another word order ("Économie politique" / "Political economy"), a shorter title next to its longer form ("Supply chain"), "Nederlands" and "Néerlandais" as separate generic canonical courses. They stay separate or MEDIUM.
- Course codes are supported (0 canonical course from a code today: 13 coded courses from 4 students, none shared yet). A code identity and a title identity for the same course can coexist and are not merged automatically.
- No browse/search association: only matcher candidates can be confirmed.
- A one-letter section after a name is read as the French filler "a" ("Bio A" = "Bio").

## Phase 2 consumption (2026-09-17)

What phase 2 did with the recommendations originally written here:

- `resolve_my_course_links()` runs once when `/communautes` opens (and again after an answer), not on every render. Measured ~0.3 s for the largest institution (61 students), rolled back.
- Canonical titles only; other students' personal course names are never fetched.
- Room membership has its own table (`course_room_members`); joining is always the student's act, never automatic. `suggested` rows become one question each (at most two at a time); `auto`/`confirmed` rows become suggestions to join.
- Not done: letting the student say "not my course" about an `auto` link directly from the page (the brief kept the matching UI minimal), and special handling of `generic` canonical courses (they are only ever asked, never automatic, as phase 1 already guarantees).
- Still open: materialise the identity per course before institutions reach a few thousand courses (the resolver analyses every active course of the institution on each call).
- The legacy privacy exposures are closed (above).
