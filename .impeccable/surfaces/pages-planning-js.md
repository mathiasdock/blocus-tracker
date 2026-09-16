# Planning

Mode: Operate. Refinement of the established Blocus study desk, not a new identity.

## Reading path

Today answers what remains and when the next exam is. The month/week/day toolbar and compact natural-language entry precede the calendar. Revision by course supports that plan, beside it from xl and below it on mobile.

## Decisions

- Today contains at most two unfinished actions outside Day; Day provides the full executable agenda. No duplicated future-event chip list.
- Exams win the cell background: dedicated `--bt-exam-*` warm surface, short deadline rail/calendar glyph and explicit label or compact glyph/count. `PlanningExamMark` is shared across Month, Week, Day, Today and day detail. Course identity stays secondary. Selection and Today remain independently green; no danger or pause tokens.
- Course days use one uniform representative tint (.14 light / .20 dark), retaining the existing objective-count ordering and stable ID tie-break. Other identities stay in markers/details. No past-date slash or multi-course diagonal. Empty days remain neutral. Workload weighting is deferred, not encoded by tint proportions.
- Objective chips use neutral readable text/surfaces with course markers, never white text on arbitrary course hues. No-course objectives have a neutral outlined square and explicit unassigned context in detail/Day.
- All Planning exam consumers use `normalizePlanningExams`: structured rows win exact course/date overlap; unmatched legacy course dates remain visible without invented event metadata. See `docs/planning-exams.md` for writes and limits.
- Month omits wholly out-of-month weeks; week preserves horizontal scrolling within its own grid on narrow screens and shows saved workload, not estimates. Day preserves all management through the existing day detail modal.
- Revision progress means checklist completion only. Missing checklist data never produces an empty decorative bar. Upcoming exams sort first; overdue/pending objectives stay visible.
- The ink exam text uses a local warm light foreground on the dark brand surface. Existing compact calendar font sizes and inherited modal treatments remain bounded incumbent conventions, not a new site-wide type/color system.

## Verification

Browser exercised on offline data at 375, 812, 1024 and 1440 pixels. No page-level horizontal overflow; week deliberately scrolls internally. Checked day completion, quick add, empty Today, dark theme and reduced-motion. Pure tests cover saved workload/course ordering and mixed minute-duration/clock quick-add parsing.

Phase 1: offline fixtures in `/dev/planning-phase-one` (development + offline mode only); Month checked at 320/375/390/1280/1440 in light/dark, single/multiple exams, red/pink course, past/today/future and dense/no-course work. Unit tests cover normalization, duplicate handling and guarded legacy deletion. Timer and Phase 2 remain closed/out of scope.
