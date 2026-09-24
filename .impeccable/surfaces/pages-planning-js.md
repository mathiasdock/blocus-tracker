# Planning

Mode: Operate. Refinement of the established Blocus study desk, not a new identity.

## Reading path

Today answers what remains and when the next exam is. The month/week/day toolbar and compact natural-language entry precede the calendar. Revision by course supports that plan, beside it from xl and below it on mobile.

## Decisions

- Today contains at most two unfinished actions outside Day; Day provides the full executable agenda. No duplicated future-event chip list.
- Exams win the cell background: dedicated `--bt-exam-*` warm sand surface and straight-edged terracotta calendar stamp with explicit label or compact glyph/count. No vertical rail. `PlanningExamMark` is shared across Month, Week, Day, Today and day detail. Course identity stays secondary. Selection and Today remain independently green; no danger or pause tokens.
- Course days use one uniform representative tint (.28 light / .26 dark) with a stable ID tie-break. Other identities stay in the load bar and details. No past-date slash or multi-course diagonal. Empty days remain neutral. Phase 2 replaced the objective-count ordering with duration weighting; tint proportions still encode nothing.
- Objective chips use neutral readable text/surfaces with course markers, never white text on arbitrary course hues. No-course objectives have a neutral outlined square and explicit unassigned context in detail/Day.
- All Planning exam consumers use `normalizePlanningExams`: structured rows win exact course/date overlap; unmatched legacy course dates remain visible without invented event metadata. See `docs/planning-exams.md` for writes and limits.
- Workload means PLANNED MINUTES (`target_minutes`), never task count: one 4 h objective outweighs two 20 min ones. `dayLoad`/`loadSegments`/`loadRatio` in `lib/planningInsights.mjs` are the single source. A row without a usable duration still counts, at a documented 30 min (`FALLBACK_OBJECTIVE_MINUTES`), and is flagged `estimated`. Completed work stays in the plan; `doneMinutes` keeps the distinction available.
- `PlanningLoadBar` is the shared quantity mark for Month and Week, drawn as a bar resting on a full-width hairline axis — not a fill inside a track. A filled pill read as "X% complete"; a bar on its axis reads as a quantity against the 8 h capacity. Length is duration on one absolute scale (full = `LOAD_FULL_MINUTES`, 8 h; a documented `LOAD_MIN_RATIO` floor keeps a real but short day visible; longer days stay full and state the exact total in text or in the accessible label). Segments are course share, heaviest first, capped per surface with the remainder merged into one neutral segment that carries its own course count. Not a progress bar, not a Study Block: nothing is earned yet, and the subdivision is academic, not temporal.
- Week answers how the load spreads across the next days, not at what hour. Seven rows sharing one left edge: date, exams, load bar, exact total, count/overdue/other-course context, up to three objective chips and an explicit labelled link to the rest. Density follows information: a day with no work, no exam and no objective collapses to a single dated line — the seven days stay, the repeated "nothing planned" sentence does not (it remains for assistive tech). The header is one line, label plus the week total, since every row already writes its own exact duration. No `+N` without its noun. All seven days are readable at 320px with no horizontal scrolling. The hour grid survives as a secondary section, rendered only when the visible week holds an objective at a displayable hour; its all-day row keeps exams only, and its day headers no longer repeat counts the load rows already carry.
- Today keeps only its green date disc in Month; the selection outline is suppressed when the selected day is today, because it defaulted there and made the current day shout louder than a neighbouring exam. Required order: exam > today > course identity > workload. Selecting any other day still outlines it.
- Month tints the cell with the course owning the most minutes that day, and never tints when unassigned work leads — no borrowed identity. The load bar stays at the bottom of every cell that holds work, including exam days, but is 3px high in Month so planned titles and the exam stamp lead. No dots row and no `+N`.
- Today's two next actions only appear when the visible period does not already contain today; otherwise the calendar below shows the same work with its load, and the week's first day fell under the fold.
- Month omits wholly out-of-month weeks; Day preserves all management through the existing day detail modal.
- Revision progress means checklist completion only. Missing checklist data never produces an empty decorative bar. Upcoming exams sort first; overdue/pending objectives stay visible.
- The ink exam text uses a local warm light foreground on the dark brand surface. Existing compact calendar font sizes and inherited modal treatments remain bounded incumbent conventions, not a new site-wide type/color system.

## Verification

Browser exercised on offline data at 375, 812, 1024 and 1440 pixels. No page-level horizontal overflow; week deliberately scrolls internally. Checked day completion, quick add, empty Today, dark theme and reduced-motion. Pure tests cover saved workload/course ordering and mixed minute-duration/clock quick-add parsing.

Phase 1: offline fixtures in `/dev/planning-phase-one` (development + offline mode only); Month checked at 320/375/390/1280/1440 in light/dark, single/multiple exams, red/pink course, past/today/future and dense/no-course work. Unit tests cover normalization, duplicate handling and guarded legacy deletion. Timer remains out of scope.

Phase 2: the same fixture page gained a `dense` scenario rehearsing a real blocus period — an 8h50 day with eight objectives over four courses plus unassigned work, a 5h30 single-course day, three exams on one date, two more within a fortnight and overdue past days. Week and Month checked at 320/375/1280/1440 in light and dark, plus an empty week and the sparse demo seed. Unit tests cover duration weighting, completed work, the missing-duration fallback, unassigned work, deterministic ordering, segment grouping and the band scale. Study Blocks were deliberately not used: they oppose earned to planned time, which does not exist for a future day.

Phase 2 review pass: adaptive Week density (empty week 596 → 379 px, seven rows kept), one-line Week header, the band redrawn as a bar on an axis, and the doubled green Today signal reduced to its date disc. Re-checked at 320/375/390/1280/1440 in light and dark on sparse, dense and exam weeks.
