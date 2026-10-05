---
version: 1
slug: "components-layout-js"
primary_target: "components/Layout.js"
related_targets: ["components/ui/floating-nav.jsx", "components/ui/FloatingNav.module.css", "styles/globals.css"]
---

## Scope and visitor mode

The shared app navigation is an **Operate** surface. It takes the student straight to Chrono, Planning, Stats, Social or Profile on a phone; desktop keeps its fixed left sidebar and its separate Social destinations.

## Shipped navigation direction

Mobile follows the iOS 26 tab bar (Mathias's reference, 2026-10-01: screenshots of the Clock app, "exactly like this"). The five existing routes, badges, icons and safe-area-aware floating placement remain; the URL remains the source of truth for `aria-current`, and Activity, Friends and Communities all select Social.

- **The bar** is a transparent glass capsule (radius 999px, 16px side margins): `--bt-nav-material` at 50 % light / 55 % dark with a 12px blur, a light rim all around (`--bt-nav-hairline`), the content behind it visible. The scrim under it is lighter (30 % / 34 %, 8px blur).
- **The selected tab** sits on a neutral glass bubble (`--bt-nav-pill`: white 62 % in light, 13 % in dark — never green) with the same capsule shape; only its icon and name are green (`--bt-brand-text`), every other tab uses `--bt-text-1`, same weight. Over the dark Progress card the light bubble keeps the green readable.
- **The selection travels.** On a normal tap the bubble lifts into a clear glass lens — about 12 % wider and 30 % taller than its cell, so it rises over the bar's edges —, glides to the new tab on a damped spring (slight overshoot, settled in ≈ 0.4 s, 0.48 s in all), stretches a little while it moves fast, and settles back into the bubble. Through the lens the tabs appear magnified and green; its edge carries a light rim and faint iridescent reflections (dispersion), visible only while it moves.
- **What you see are copies.** The lens shows an `aria-hidden` copy of the tabs in green, clipped to the lens and counter-translated so it stays aligned; two `aria-hidden` "windows" on either side show the tabs in their normal colour, their inner edges following the lens's edges (all transforms, composited). Nothing under the lens can show twice. The real links stay in place with transparent content: they keep taps, keyboard focus (their capsule focus ring passes in front) and screen-reader names.
- **Continuity.** The Layout belongs to each page, so the bar is rebuilt on every route change: the trip lives in a module-level object in `floating-nav.jsx`, and the new page's bar resumes it at the exact same moment (Web Animations with `currentTime`); a second tap mid-trip keeps its momentum; another route change (a link, back) glides from the tab of the page just left; a refused navigation slides back.
- Web approximation, not real refraction (Safari cannot refract the backdrop). Reduced motion: the selection moves at once, no lens. Reduced transparency or more contrast: solid surfaces, no iridescence.

Desktop remains fixed at 232px. Its current composition is intentionally protected; active links now expose `aria-current` to assistive technology. Navigation chrome is neutral utility UI, not a place for Study Blocks, course hues or mascot decoration.

Motion pass (2026-10-05): desktop link hover/selection transitions only the colors they change, not every property. The mobile glass lens and its route-continuity motion were deliberately left untouched. Mobile notification sheets now use the shared short enter/exit vocabulary while retaining native dialog focus behavior.

## Verification

Check 320/390px and desktop, FR/EN, light/dark, keyboard focus, reduced motion, badge space and guest/authenticated states. The mobile nav must not cover the final actionable row; the existing app shell provides the content bottom spacing and safe-area placement.
