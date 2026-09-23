---
version: 1
slug: "pages-signup-js"
primary_target: "pages/signup.js"
related_targets: ["pages/login.js","pages/onboarding.js","pages/forgot-password.js","pages/reset-password.js","components/auth/AuthShell.js","components/auth/SpaceSheet.js","components/auth/CourseComposer.js","styles/auth.css"]
---

## Job and direction

One auth family: sign in, sign up, check email, forgot/reset password and onboarding share a single shell (`components/auth/AuthShell`). Visible setup is three steps — Compte → Études → Cours — mapped onto Phase 1's server-derived steps (ACCOUNT/YOU → Compte, UNIVERSITY/STUDIES → Études, COURSES → Cours). Operate mode: the student completes a task; brand lives in precise details.

## Direction contract

THESIS: Setting up Blocus is filling in your own space. Every answer lands at once in a real object — name, institution crest, program disc, coloured courses — so three short steps read as building, not form-filling. Refuses the desk photo + white card and the marketing split screen.
OWN-WORLD: warm canvas; Quicksand wordmark and titles; Nunito controls in grouped rows (label over value, inset hairlines, 16px radius); action green only on the primary action and progress; one brand-ink sheet as the student's space; course hues only on real courses.
STORY: see three named steps, type your name and watch it become yours, add courses with Enter, arrive in the Chrono ready.
FIRST VIEWPORT: desktop — wordmark and steps across the top, task column (≤440px) left, ink sheet (≤460px) right, primary action closing the task column. Mobile — compact top bar with steps, task directly below, no sheet.
FORM: grouped-row form + live ink sheet; chosen directly (user asked to implement without a proposal round), no seed.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## States and interactions

Courses: type → Enter → the course takes the next colour, lands in the list and in the sheet, focus stays in the entry. Pasting a multi-line list adds each line. Duplicates flash the existing row. Rename inline (Enter saves, Escape cancels), colour on the dot, remove on ×; Backspace on an empty entry arms the last course, a second Backspace removes it. Saves are sequential with stable client ids (Phase 1 idempotency); Finish waits for pending saves and still requires one course.
Loading, recoverable errors, check-email and resume all use the shell. The login aside is the same sheet, empty, inviting a new student; forgot/reset are single-column.

## Protected scope

Phase 1 owns server completion, cross-device resume, legacy/repair, legal/referral and email confirmation. No migration. No mascot, no study blocks, no invented data in the sheet.

## Verification (2026-09-22)

Offline build: full journey sign-up → Études → six courses → Chrono, duplicates, pasted list, rename/Escape, colour, both removals, back from Courses, legacy repair, finish with a typed course. 320/390/1280/1440, FR/EN, light/dark. Chrome accessibility tree: no unnamed control, one h1 per page. Detector: advisories only (small radii, the primary button's existing shadow). Finish review ran inline (no reviewer agent in this session): disposition fix → DESIGN.md section added, then ship. Not verifiable offline: real email delivery, a real server error on load, physical phone keyboards.
