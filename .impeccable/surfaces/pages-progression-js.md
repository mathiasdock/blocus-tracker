---
version: 1
slug: "pages-progression-js"
primary_target: "pages/progression.js"
related_targets: ["components/timer/ChronoFocus.js", "components/focus/FocusEnvironmentGallery.js", "components/focus/FocusEnvironmentControl.js", "components/focus/FocusEnvironmentRenderer.js", "components/focus/GradientWaveEnvironment.js", "components/focus/FocusEnvironments.module.css", "hooks/useFocusEnvironment.js", "lib/focusEnvironments.mjs", "lib/focusPreferences.mjs"]
---

## Scope and visitor mode

`/progression` is an **Operate** surface. This brief covers only Focus
Environments V1, implemented in the branch on 2026-10-12 and not deployed.
`DESIGN.md` remains the visual authority; this extension creates no global
theme or competing reward/XP system.

## Audience, job and task

The student sees which Focus atmosphere their earned level makes available
and explicitly equips one. The gallery follows the XP/source section and
precedes the existing missions and level list. The same choices are available
in Focus from the upper-right control opposite audio.

## Content and constraints

Forest is the unchanged default at level 1. Gradient Wave unlocks at level 5;
its exact six alternating source blue/white colors, 32% source speed, 30 fps
cap and half buffer belong to Focus only. A server-observed unlock is permanent
and never auto-equips. Eligibility and equipped choice are server-owned;
guests and a missing migration use Forest. Levels 12/20 are reserved “Coming
soon” rows with no preview, renderer or action. See
[the feature contract](../../docs/focus-environments.md) for persistence and
the pending migration.

## Chosen direction and interaction

Two static palette previews communicate atmosphere without running background
canvases. Each implemented choice names its level and locked/available/equipped
state; `aria-pressed`, a state glyph and a selected outline supplement color.
Loading/saving disable selection; translated feedback and Retry explain a
failed synchronization. A save must succeed before the Focus gallery closes.
Escape closes it before Focus and restores the trigger. Timer behavior,
course identity, the red pause warning and opt-in audio remain intact.

## Verification and unresolved decisions

The six feature suites pass 58 local tests, including actual migration execution
in PGlite, account-switch rejection before an equip write, hook/account races,
FR/EN gallery behavior and WebGL lifecycle ports. The complete suite passes
881 tests, lint is clean and the production build succeeds. Browser checks at
1440/1280/390/320 px cover FR/EN, light/dark themes, confirmed selection,
Escape, reload/level-drop persistence, no overflow and Pomodoro start/pause;
the 390 × 844 viewport mounts one 195 × 422 Wave buffer. These are local
browser layouts, not physical iPhone or PWA-device performance tests.
Remote migration, live persistence verification and deployment are pending;
the future environments have no implementation commitment beyond their slots.
