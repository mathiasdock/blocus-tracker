# Planning

Mode: Operate. Refinement of the established Blocus study desk, not a new identity.

## Reading path

Today answers what remains and when the next exam is. The month/week/day toolbar and compact natural-language entry precede the calendar. Revision by course supports that plan, beside it from xl and below it on mobile.

## Decisions

- Today contains at most two unfinished actions outside Day; Day provides the full executable agenda. No duplicated future-event chip list.
- The rare reminder for an exam within seven days without planned preparation is the mascot coach (DESIGN.md, event coach), anchored to Today's next exam as a dismissible overlay: « Examen demain. » the day before. It never becomes another sidebar row or changes the exam datum. Phones: the character sits on Today's bottom edge at the right, its bubble above it beside the exam's last lines, ending above « Ajouter un objectif ». Desktop: it peeks below the card's bottom-right corner with the bubble to its left. Both cover only the empty side of the exam button, never its text. When Today lists its next actions (calendar on another period), the phone coach stands above that list (`data-coach-floor`), never in front of its ▶ buttons.
- Exams win the cell background: dedicated `--bt-exam-*` warm sand surface and straight-edged terracotta calendar stamp with explicit label or compact glyph/count. No vertical rail. `PlanningExamMark` is shared across Month, Week, Day, Today and day detail. Course identity stays secondary. Selection and Today remain independently green; no danger or pause tokens.
- Course days use one uniform representative tint (.28 light / .26 dark) with a stable ID tie-break. Past days with all objectives complete keep their course hue at a quieter .21 / .19 tint. Other identities stay in day detail and Week's load band. No past-date slash or multi-course diagonal. Empty days remain neutral. Phase 2 replaced the objective-count ordering with duration weighting; tint proportions still encode nothing.
- Objective chips use neutral readable text/surfaces with course markers, never white text on arbitrary course hues. No-course objectives have a neutral outlined square and explicit unassigned context in detail/Day.
- All Planning exam consumers use `normalizePlanningExams`: structured rows win exact course/date overlap; unmatched legacy course dates remain visible without invented event metadata. See `docs/planning-exams.md` for writes and limits.
- Workload means PLANNED MINUTES (`target_minutes`), never task count: one 4 h objective outweighs two 20 min ones. `dayLoad`/`loadSegments`/`loadRatio` in `lib/planningInsights.mjs` are the single source. A row without a usable duration still counts, at a documented 30 min (`FALLBACK_OBJECTIVE_MINUTES`), and is flagged `estimated`. Completed work stays in the plan; `doneMinutes` keeps the distinction available.
- `PlanningLoadBar` is Week's quantity mark, drawn as a bar resting on a full-width hairline axis — not a fill inside a track. A filled pill read as "X% complete"; a bar on its axis reads as a quantity against the 8 h capacity. Length is duration on one absolute scale (full = `LOAD_FULL_MINUTES`, 8 h; a documented `LOAD_MIN_RATIO` floor keeps a real but short day visible; longer days stay full and state the exact total in text or in the accessible label). Segments are course share, heaviest first, with the remainder merged into one neutral segment that carries its own course count. Not a progress bar, not a Study Block: nothing is earned yet, and the subdivision is academic, not temporal.
- Week answers how the load spreads across the next days, not at what hour. Seven rows sharing one left edge: date, exams, load bar, exact total, count/overdue/other-course context, up to three objective chips and an explicit labelled link to the rest. Density follows information: a day with no work, no exam and no objective collapses to a single dated line — the seven days stay, the repeated "nothing planned" sentence does not (it remains for assistive tech). The header is one line, label plus the week total, since every row already writes its own exact duration. No `+N` without its noun. All seven days are readable at 320px with no horizontal scrolling. The hour grid survives as a secondary section, rendered only when the visible week holds an objective at a displayable hour; its all-day row keeps exams only, and its day headers no longer repeat counts the load rows already carry.
- Today keeps only its green date disc in Month; the selection outline is suppressed when the selected day is today, because it defaulted there and made the current day shout louder than a neighbouring exam. Required order: exam > today > course identity > workload. Selecting any other day still outlines it.
- Month tints the cell with the course owning the most minutes that day, and never tints when unassigned work leads — no borrowed identity. The 3px load bar was removed from Month because it duplicated the colored cell at this scale; exact planned time remains in the accessible day label and Week retains the shared-scale band. No dots row and no `+N`. Week exam rows stay neutral so the exam card alone carries the warm surface.
- Today's two next actions only appear when the visible period does not already contain today; otherwise the calendar below shows the same work with its load, and the week's first day fell under the fold.
- Month omits wholly out-of-month weeks; Day preserves all management through the existing day detail modal.
- Month day objectives wrap to multiple lines instead of being forced into one truncated line. Dates outside the displayed month use a quieter date numeral and neutral empty-cell surface; the first visible adjacent date names its month. Exam and course surfaces retain their semantic priority, even outside the month.
- Revision progress means checklist completion only. Missing checklist data never produces an empty decorative bar. Upcoming exams sort first; overdue/pending objectives stay visible.
- The ink exam text uses a local warm light foreground on the dark brand surface. Existing compact calendar font sizes and inherited modal treatments remain bounded incumbent conventions, not a new site-wide type/color system.

## Verification

Browser exercised on offline data at 375, 812, 1024 and 1440 pixels. No page-level horizontal overflow; week deliberately scrolls internally. Checked day completion, quick add, empty Today, dark theme and reduced-motion. Pure tests cover saved workload/course ordering and mixed minute-duration/clock quick-add parsing.

Phase 1: offline fixtures in `/dev/planning-phase-one` (development + offline mode only); Month checked at 320/375/390/1280/1440 in light/dark, single/multiple exams, red/pink course, past/today/future and dense/no-course work. Unit tests cover normalization, duplicate handling and guarded legacy deletion. Timer remains out of scope.

Phase 2: the same fixture page gained a `dense` scenario rehearsing a real blocus period — an 8h50 day with eight objectives over four courses plus unassigned work, a 5h30 single-course day, three exams on one date, two more within a fortnight and overdue past days. Week and Month checked at 320/375/1280/1440 in light and dark, plus an empty week and the sparse demo seed. Unit tests cover duration weighting, completed work, the missing-duration fallback, unassigned work, deterministic ordering, segment grouping and the band scale. Study Blocks were deliberately not used: they oppose earned to planned time, which does not exist for a future day.

Phase 2 review pass: adaptive Week density (empty week 596 → 379 px, seven rows kept), one-line Week header, the band redrawn as a bar on an axis, and the doubled green Today signal reduced to its date disc. Re-checked at 320/375/390/1280/1440 in light and dark on sparse, dense and exam weeks.


## University calendar — Step 3, local branch (2026-10-02)

Imported deadlines stay outside workload/objectives/exam storage. Month uses the
existing exam marker and a deadline count; days with imports replace study-title
previews with the study-time total. Compact `due` / `éch.` labels fit at 320 px,
with full accessible labels. Week summarizes academic context below study work;
day and the existing sheet list it in a secondary section. Mapped local identity
and colors win; unmapped identity is neutral. Possible exams require an explicit
override before showing an exam marker. No connection/sync setup in this step.
Visibility preferences are per user/device; normal events are grouped by default.

Normal/dense fixtures (90 events, ten on one day), EN/light and FR/dark checked at
320/390/1440 px. Screenshot evidence and behavior details are in
`docs/university-calendar-planning.md`. No new visual system or unrelated redesign.


## University calendar — Step 4, local branch (2026-10-02)

The existing disclosure now opens a DetailSheet for connect → course matching →
compact exam review, with manual sync and disconnect. Uses existing controls,
tokens and typography, mobile sheet / desktop dialog. Explicit exam conversion
uses the existing model and a persistent identity link; imported events stay
secondary and never become objectives automatically. EN/light and FR/dark checked
at 320/390/1440 px, full synthetic workflow including changed source and disconnect.
See `docs/university-calendar-connection.md`; real Canvas feed and approval pending.


## University calendar — focused simplification, local branch (2026-10-03)

Event titles lead day detail; mapped course names/colors group repeated rows.
Each event stays independently expandable. Plan work is primary, secondary
source/type/course/hide actions live in overflow, edit fields appear only on
request. Add is one disclosure. No default admin-like forms or repeated Deadline
labels. Date-only events say Due today / Due [date]. Unconfirmed exam candidates
remain neutral; only explicit overrides/local exams get full exam presentation.
Month aggregation and existing study workload/exam models are unchanged.

Visibility now belongs to the account; controls and Hidden items are inside
Manage behind the existing collapsed University calendar entry. Source/UID hide
decisions survive retention/sync without archiving event content. This requires
a new local migration before a future release; nothing applied remotely here.
See `docs/university-calendar-ux.md` and the synthetic screenshots in
`artifacts/university-calendar-ux/`. Verified EN/light, FR/dark, 320/390/1440 px.
