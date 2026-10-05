# Planning final pass — local review, 2026-10-04

Synthetic offline data only, on `claude/planning-ux-refactor`. No private feed, production data or remote writes.

## Screenshots

- [Mobile Day](mobile-day.png) — English/light, 390 × 844, 10 objectives and 11 deadlines.
- [Mobile Week](mobile-week.png) — English/light; no stray zeros on empty days, scheduled grid folded.
- [Course with planned work](mobile-course-overview.png) — Start studying primary.
- [Course without planned work](mobile-course-empty.png) — Plan revision primary.
- [Exam review](mobile-exam-review.png) — likely/possible sections, selected-count CTA.
- [Desktop Month](desktop-month.png) — 1440 × 1000, dense imported semester.
- [Desktop Week](desktop-week.png) — 1440 × 1000, collapsed Scheduled times.
- [Mobile Month, French/dark](mobile-month-dark-fr.png).
- [Mobile Week, French/dark](mobile-week-dark-fr.png).
- [Long Day bottom, French/dark](mobile-day-bottom-safe-area.png) — 34 px bottom inset simulated.
- [Course sheet, French/dark](mobile-course-dark-fr-safe-area.png) — 34 px bottom inset simulated.

## Behavioral checks

- Bulk selection: Add 0 selected exams disabled; Add 1 selected exam enabled; four likely exams initially selected. Duplicate disabled. Unit test also confirms two same-course/date items in a single batch send identical exam fields to the existing idempotent conversion RPC.
- Existing duplicate linked through review: exams stayed at 1, source link points at existing-exam, duplicate disappeared from review.
- Unmapped Test 1 → Mark as exam → Add to my exams: exams became 2 and links became 2; possible candidate disappeared. No automatic conversion.
- Chrono course card retained Earlier revision notes and its legacy controls, with no new checklist creation. Plan revision opened the existing objective form at /planning with academic-course-0 selected and duration empty; legacy item count remained 1.
- Course sheet with upcoming objectives uses Start studying primary; empty Business Law uses Plan revision primary, in both languages.
- Week Scheduled times initially aria-expanded=false. Month stays aggregated.
- Safe-area simulation replaces env(safe-area-inset-bottom) with 34 px in browser-only CSS: nav bottom 34 px, Planning bottom padding 34 px, course sheet padding 42 px. At maximum Day scroll the last course row ends at 698 px, navigation begins at 748 px. No horizontal overflow at 390 px. This is a Chromium simulation, not a physical iPhone validation.
- No application browser errors during completed flows. A later QA cleanup expression attempted to remove an already removed temporary style; this was a test-script error, not an application error.

## Automated verification

674 full tests passed; focused calendar/review tests passed; lint clean; production build passed. Existing PWA precache-size warning remains. Mechanical design scan produced advisory findings for incumbent colors/radii, with no broad restyling. Impeccable sidecar is older than DESIGN.md; left unchanged to preserve scope.
