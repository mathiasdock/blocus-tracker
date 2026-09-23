---
version: 1
slug: "pages-signup-js"
primary_target: "pages/signup.js"
related_targets: ["pages/login.js","pages/onboarding.js","pages/forgot-password.js","pages/reset-password.js","components/auth/AuthShell.js","components/auth/MascotGuide.js","components/auth/AuthBackdrop.js","components/auth/SpaceSheet.js","components/auth/CourseComposer.js","components/ui/GradientWave.js","lib/setupGuide.mjs","styles/auth.css"]
---

## Job and direction

One auth family: sign in, sign up, check email, forgot/reset password and onboarding share a single shell (`components/auth/AuthShell`) on one animated ground (`components/auth/AuthBackdrop`). Visible setup is three steps — Compte → Études → Cours — mapped onto Phase 1's server-derived steps (ACCOUNT/YOU → Compte, UNIVERSITY/STUDIES → Études, COURSES → Cours). Operate mode: the student completes a task; brand lives in precise details.

## Direction contract

THESIS: Setting up Blocus is filling in your own space with its guide. Every answer lands at once in a real object — name, crest, program disc, coloured courses — while the mascot says one useful line per step and reacts to real progress. Refuses the desk photo + white card, the marketing split screen and the heavy ink panel.
OWN-WORLD: a slow light mesh gradient in the app's cream and mint; Quicksand wordmark and titles; Nunito grouped-row forms; action green on the primary action and progress; one light translucent sheet as the student's space; the shiba guide with a single-silhouette bubble; course hues only on real courses.
STORY: see three named steps, hear the guide, type your name and see it become yours, add courses with Enter, arrive in the Chrono ready.
FIRST VIEWPORT: desktop — wordmark and steps across the top, task column (≤440px) left, the guide standing on the space sheet (≤440px) right; sign-in: form left with *Créer un compte* under *Se connecter*, the guide larger right. Mobile — compact top bar with steps (back chevron at their left), guide + one-line bubble, title, form.
FORM: grouped-row form + guided light sheet on an animated ground; chosen directly (user asked to implement without a proposal round), no seed.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## States and interactions

Guide lines come from `lib/setupGuide.mjs` (tested): login, account, named (after the first-name field is left), check email, repair, loading, error, university, field (university chosen), first course, ready (≥1 course; the first one celebrates), forgot, sent, reset, checking, invalid, done. A reaction key changes only on real events, so the mascot never moves per keystroke.
Courses: type → Enter → the course takes the next colour, lands in the list and in the sheet, focus stays in the entry. Pasting a multi-line list adds each line. Duplicates flash the existing row. Rename inline (Enter saves, Escape cancels), colour on the dot, remove on ×; Backspace on an empty entry arms the last course, a second Backspace removes it. Saves are sequential with stable client ids (Phase 1 idempotency); Finish waits for pending saves and still requires one course.
Loading, recoverable errors, check-email and resume all use the shell; forgot/reset are single-column with the guide above.

## Protected scope

Phase 1 owns server completion, cross-device resume, legacy/repair, legal/referral and email confirmation. No migration. No Study Blocks and no invented data in the sheet. The guide exists only on these pages.

## Verification (2026-09-23)

Offline build: full journey sign-up → Études → six courses → Chrono with the guide's line checked at each step, the ground kept across routes and removed in the app; duplicates, pasted list, rename/Escape, colour, both removals, back from Courses. Ground speed measured (two frames 10 s apart: PSNR 35.8 dB). 320/390/1280/1440, FR/EN, light/dark. Chrome accessibility tree: no unnamed control, one h1 per page, contrasts ≥ 4.5:1. Detector: advisories only. Finish review inline (no reviewer agent this session). Not verifiable offline: real email delivery, a real server error on load, physical phone keyboards, GPU cost on low-end phones.
