---
version: 1
slug: "pages-signup-js"
primary_target: "pages/signup.js"
related_targets: ["pages/onboarding.js", "components/StudySetupShell.js", "components/SetupUsernameStatus.js", "components/SetupCourseColor.js", "styles/setup.css"]
---

## Job and direction

Study Space Setup: the student builds their actual academic space, not a dashboard preview. Account → You → University → Studies → Courses remains the canonical five-step model established in Phase 1. This surface changes presentation and course-entry interactions, not completion/auth semantics.

## Composition

Desktop (1024px+): actual answers accumulate on the left; the current question sits on the right, without a floating form card. Only supplied name, university, field, year, optional program and saved courses appear. Missing answers leave intentional space. Warm neutral foundation, current typography, restrained green progress/action, course colors only for actual courses. No photo, mascot, Study Blocks, fictional content or decorative illustration.

Mobile: one question column, compact wordmark, Back when available, localized x of 5 and a thin line. No miniature summary card. University can remain as quiet context in later steps. Safe-area padding, wrapping names, 44px controls and 48px inputs; the page scrolls naturally with keyboard/content height.

## Interactions and states

Username checking/availability is debounced, announced politely and never replaces authoritative submit validation. Optional surname is secondary. Broad field precedes year and optional specialization; preserve the existing university and program pickers.

Courses are a dense editable list. Enter adds using Phase 1 idempotency and duplicate rules, then restores entry focus. Colors are automatic; a course dot opens an optional palette. Name opens inline rename; Save/Cancel or Escape resolves it. Removal and mutations are serialized through disabled controls; Finish cannot discard an active rename. At least one course remains required.

Loading, recoverable errors and check-email use the same shell. Phase 1 owns server completion, cross-device resume, legacy/repair, legal/referral and email confirmation. Do not replace these with local completion flags. No migration.

## Accessibility and verification

Visible keyboard focus, labeled controls, status live regions, step-heading focus, readable secondary text and reduced-motion overrides. Local offline browser journey verified through six courses and app entry, including duplicate prevention, color/edit/remove, keyboard university selection and resume at incomplete academic steps. Layout sampled at 320/390/1280/1440, FR/EN, light/dark. Course screen axe scan: no violations. Real email delivery and physical mobile keyboard behavior remain external verification items; do not present offline fixtures as production evidence.

## Protected scope

This is the shared signup/onboarding shell only. Login, recovery and other product surfaces retain their existing implementations. Phase 1 logic is closed unless an evidenced regression requires a bounded correction.
