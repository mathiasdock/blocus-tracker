---
version: 1
slug: "components-layout-js"
primary_target: "components/Layout.js"
related_targets: ["components/ui/floating-nav.jsx", "components/ui/FloatingNav.module.css", "styles/globals.css"]
---

## Scope and visitor mode

The shared app navigation is an **Operate** surface. It takes the student straight to Chrono, Planning, Stats, Social or Profile on a phone; desktop keeps its fixed left sidebar and its separate Social destinations.

## Shipped navigation direction

Mobile adapts the supplied floating-nav pattern to Blocus rather than copying its demo destinations, blue accent, hidden labels or large bottom offset. The five existing routes, badges, icons and safe-area-aware floating material remain. A single full-tab selected surface moves behind the icon and visible label; the URL remains the source of truth for `aria-current`. Activity, Friends and Communities all select Social. The transition begins on a normal tap and disappears under reduced motion. No additional icon or motion package is required.

Desktop remains fixed at 232px. Its current composition is intentionally protected; active links now expose `aria-current` to assistive technology. Navigation chrome is neutral utility UI, not a place for Study Blocks, course hues or mascot decoration.

## Verification

Check 320/390px and desktop, FR/EN, light/dark, keyboard focus, reduced motion, badge space and guest/authenticated states. The mobile nav must not cover the final actionable row; the existing app shell provides the content bottom spacing and safe-area placement.
