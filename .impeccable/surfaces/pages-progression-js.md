---
version: 1
slug: "pages-progression-js"
primary_target: "pages/progression.js"
related_targets: ["components/timer/ChronoFocus.js", "components/focus/FocusEnvironmentGallery.js", "components/focus/FocusEnvironmentControl.js", "components/focus/FocusEnvironmentRenderer.js", "components/focus/GradientWaveEnvironment.js", "components/focus/ZenithoEnvironment.js", "components/focus/ZenithoEnvironment.module.css", "components/focus/GlassFoldEnvironment.js", "components/focus/GlassFoldEnvironment.module.css", "components/focus/FocusEnvironments.module.css", "components/ui/GradientWave.js", "components/ui/GlassFold.js", "public/focus-environments/zenitho.jpg", "public/focus-environments/glass-fold.jpg", "hooks/useFocusEnvironment.js", "lib/focusEnvironments.mjs", "lib/focusPreferences.mjs"]
---

## Scope and visitor mode

`/progression` is an **Operate** surface. This brief covers only Focus
Environments V1, implemented in the branch on 2026-10-12, refined locally for
Zenitho on 2026-10-13, extended with the fourth/final Glass Fold environment,
and finalized for release. Glass Fold's independent finish review ended **SHIP** for
the supplied screenshots and source.
`DESIGN.md` remains the visual authority; this extension creates no global
theme or competing reward/XP system.

## Audience, job and task

The student sees which Focus atmosphere their earned level makes available
and explicitly equips one. The gallery follows the XP/source section and
precedes the existing missions and level list. The same choices are available
in Focus from the upper-right control opposite audio.

## Content and constraints

Forest is the unchanged default at level 1. Gradient Wave unlocks at level 5;
its exact six alternating source blue/white colors, 40% source speed, 30 fps
cap and half buffer belong to Focus only. Zenitho unlocks at level 12, with its
original UVCanvas 0.3.0 pink/blue/violet/amber palette and shader parameters on
the shared Gradient Wave engine, now opting into its source XZ plane, density
`[0.06, 0.16]`, camera Z `-0.0005` and antialiasing. Only Zenitho's denser mesh
is capped at 180 segments per axis (32,761 vertices); Auth/Wave retain their
historical XY defaults and Forest is unchanged. It runs at 55% actual elapsed shader speed,
independently of the 30 fps cap, and uses the same half buffer. No UVCanvas
package was installed. Glass Fold replaces the level-20 reservation: supplied
GradFlow GLSL, original `#1e3cc8` / `#06081e` / `#96d7ff` palette and source
defaults `speed=0.5`, `scale=1`, `noise=0.12`, with no added slowdown. Its
30 fps draw cap is independent of source speed; its CSS-resolution buffer never
uses retina DPR and is capped at 1,048,576 pixels and 2,048 px per axis. No new
dependency, TypeScript or shadcn was added. A server-observed canonical unlock
is permanent and
never auto-equips. Eligibility and equipped choice are server-owned; guests
and a missing migration use Forest. All four implemented choices appear in
both galleries. V86 includes Glass Fold's ID, level-20
constraint and RPC guard; upgrades from its two/three-choice versions preserve
equipped choices and XP. See
[the feature contract](../../docs/focus-environments.md) for persistence and
the production migration applied once as `20261013152908`.

## Chosen direction and interaction

Four static previews communicate atmosphere without running background
canvases. Forest/Wave retain their palette gradients; Zenitho uses a real shader
frame (`public/focus-environments/zenitho.jpg`, 27,654 bytes), and Glass Fold uses
its actual renderer capture (`public/focus-environments/glass-fold.jpg`,
640 × 400, 22,086 bytes), also its fallback. Each implemented
choice names its level and locked/available/equipped
state; `aria-pressed`, a state glyph and a selected outline supplement color.
Loading/saving disable selection; translated feedback and Retry explain a
failed synchronization. A save must succeed before the Focus gallery closes.
Escape closes it before Focus and restores the trigger. Timer behavior,
course identity, the red pause warning and opt-in audio remain intact.
Pause/Resume remain primary and Finish & save secondary. Zenitho's plum
controls are scoped to Focus. Its running shader has no broad dark central veil
or grain overlay. Dark stage ink has no contrasting digit stroke or text shadow;
small captions use plain dark ink on the waves, without white backing rectangles
or replacement halos. The red pause field/paused-only veil and light pause captions stay
intact. Zenitho's earned fill/glow is blue-purple (`#5144B7`, RGB `81, 68, 183`)
with the same fraction, capacity, goal ticks, active timing and red pause ring.
Stage/Pomodoro ink remains separate from block data; rest is a neutral continuous
track. These changes apply only to Zenitho.

Glass Fold's glass field keeps Focus-local light text, source cyan earned
fill/glow (`#96d7ff`, RGB `150, 215, 255`), primary cyan/dark-ink Pause/Resume
and secondary navy/light-text Finish & save. Small captions use a dark soft
backing confined to their text bounds (2/4 px inset, 1 px blur), with no digit
stroke or shadow. Running Focus has no broad dark veil or
global grain overlay; source noise stays at 0.12. The paused red field retains
its contrast veils, while earned cyan and the red paused ring keep their existing
meanings. Block props, fractions, capacity, ticks, active glow timing, timer,
Pomodoro and audio behavior are unchanged. Forest/Wave/Zenitho are preserved.
The registry lazy-loads exactly one selected renderer in Focus; galleries add
no canvas and Progression mounts zero. Glass Fold checks compile/link/allocation,
cleans partial failures, suspends on pause/hidden/reduced motion without hidden
time catch-up, observes container resize, recovers context at the same shader
time and releases its resources. Progression keeps its normal
application theme and the global forest identity is unchanged.

## Verification and unresolved decisions

Scoped audit fixes (2026-10-14, local): future level numerals and earned XP
thresholds use `--bt-text-3`, with no change to the ladder geometry, levels or
XP. All 30 numeral/threshold pairs were checked in FR/EN and both themes;
minimum ratios are 4.62 light / 5.36 dark. Shared daily mission labels wrap
below 640px (including long course names at 320px), keeping the XP column
fixed. Desktop truncation and Focus environments remain unchanged.

The seven feature suites pass 88 local tests, including actual migration execution
in PGlite, level-11/level-19 rejection and level-12/level-20 eligibility, permanent
unlocks, no auto-equip, upgrade of both earlier v86 constraint sets with choices
and XP preserved, reapplication, account-switch
rejection before an equip write, hook/account races, FR/EN gallery behavior and
WebGL lifecycle coverage. Recorded GPU uniforms verify Zenitho's actual 55%
shader speed at multiple frame cadences, actual XZ vertices/camera/antialiasing,
preserved XY defaults and bounded 4K indices. Zenitho contrast tests cover its
four source colors and local caption ground. Glass Fold adds byte hashes for its
supplied source GLSL, palette/uniforms, actual time, drawing/buffer bounds,
resize, fallback, resource cleanup and lifecycle coverage. The current complete
suite passes
929 tests after integration with main, lint is clean and the production build succeeds, with the existing
absent-Supabase-environment and HEIC precache warnings. Browser checks at
1440/1280/390/320 px cover FR/EN, light/dark themes, confirmed selection,
Escape, reload/level-drop persistence, no overflow, pause/resume/audio and
Pomodoro start/pause in the actual Progression and Focus galleries;
the 390 × 844 viewport mounts one 195 × 422 Wave or Zenitho buffer. Refinement
captures check three distinct shader frames, actual fill/glow, paused states and
the genuine gallery thumbnail; one half buffer is 160 × 370 at 320 × 740 and
720 × 450 at 1440 × 900. These are local
browser layouts, not physical iPhone or PWA-device performance tests.
The original Zenitho extension's finish review ended SHIP. The refinement review
requested ordinary small text and updated docs; the text now uses a local soft
backing. The final independent refinement review ended **SHIP**, confirming both
findings resolved and no visible regression.

Glass Fold browser evidence covers FR running Focus at 390/1280 px, its selector
at 320/1280 px, paused Focus at 390 px, EN Pomodoro start/pause and audio panel
controls at 1280 × 720 (audio not enabled), plus EN Progression light at
1280 × 720 and dark at 320 × 740. Level 12 is locked, level 20 becomes available
without auto-equip, and explicit selection survives reload and a current-level
drop to 1 after observing level 20. One Focus canvas, no gallery canvas and zero
Progression canvases; no overflow. Optional development-only real GPU queries
recorded 60 samples per case on the local Mac: 1280 × 800 median 1.536125 ms /
p95 2.068458 ms; 390 × 844 median 0.626291 ms / p95 1.984374 ms. This is draw
time on that Mac, not a physical iPhone/PWA, battery or end-to-end frame guarantee.
Glass Fold's final independent finish review ended **SHIP**, without a material
UI/renderer correction request; it reviewed the supplied screenshots and source
without independently rerunning browser checks/tests. The production migration
was applied once and its RLS, privileges and unchanged canonical XP function
verified. Live account persistence and deployment evidence belong to the release
report, separately from local fixtures. No physical iPhone/PWA was tested.
