---
version: 1
slug: "components-layout-js"
primary_target: "components/Layout.js"
related_targets: ["components/ui/floating-nav.jsx", "components/ui/FloatingNav.module.css", "styles/globals.css"]
---

## Scope and visitor mode

The shared app navigation is an **Operate** surface. It takes the student straight to Chrono, Planning, Stats, Social or Profile on a phone; desktop keeps its fixed left sidebar and its separate Social destinations.

## Shipped navigation direction

Mobile adapts the supplied floating-nav pattern to Blocus rather than copying its demo destinations, blue accent, hidden labels or large bottom offset. The five existing routes, badges, icons and safe-area-aware floating material remain. A single full-tab selected surface (the green pill) marks the active tab; the URL remains the source of truth for `aria-current`. Activity, Friends and Communities all select Social. No additional icon or motion package is required.

**The selection travels (2026-10-01, Mathias's reference: the iOS 26 Clock tab bar).** On a normal tap the pill lifts into a glass lens — about 12 % wider and 30 % taller than its cell, so it rises over the bar's edges —, glides to the new tab on a damped spring (slight overshoot, settled in ≈ 0.4 s, 0.48 s in all), stretches a little while it moves fast, and settles back into the green pill. Through the lens the tabs appear magnified and in the selected colour: a second, `aria-hidden` copy of the tabs, clipped to the lens and counter-translated so it stays aligned with the real ones. Web approximation, not real refraction (Safari cannot refract the backdrop): translucent bar material lightened from the top, a light rim, faint green edge glints, a soft drop shadow, and a 5 px backdrop blur where the browser allows it. Crossfades are staggered so the real tabs stay covered and never show doubled text. The Layout belongs to each page, so the bar is rebuilt on every route change: the trip lives in a module-level object in `floating-nav.jsx`, and the new page's bar resumes it at the exact same moment (Web Animations with `currentTime`); a second tap mid-trip keeps its momentum; another route change (a link, back) glides from the tab of the page just left; a refused navigation slides back. Reduced motion: the pill moves at once, no lens. Reduced transparency or more contrast: the lens becomes a solid surface.

Desktop remains fixed at 232px. Its current composition is intentionally protected; active links now expose `aria-current` to assistive technology. Navigation chrome is neutral utility UI, not a place for Study Blocks, course hues or mascot decoration.

## Verification

Check 320/390px and desktop, FR/EN, light/dark, keyboard focus, reduced motion, badge space and guest/authenticated states. The mobile nav must not cover the final actionable row; the existing app shell provides the content bottom spacing and safe-area placement.
