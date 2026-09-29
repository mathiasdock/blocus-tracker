---
version: 1
slug: "pages-index-js"
primary_target: "pages/index.js"
related_targets: ["components/landing/PublicHeader.js","components/landing/HeroDevice.js","components/landing/HeroProductDemo.js","components/landing/Landing.module.css","lib/landingContent.js"]
---

## Job and direction

Persuade mode. A QR visitor should see a free study product, understand the session-to-progress loop and reach signup quickly. The homepage stays short and preserves the actual Chrono captures, brand palette, mascot and existing scroll tilt.

## Direction contract

The desktop first viewport includes a useful portion of the Chrono below the headline and CTAs. Mobile keeps the signup CTA above a readable phone. The shared header has a compact, prominent signup link and a separate login link at 360 px. After the bento, one compact pair shows real Chrono screenshots on a laptop and phone with the bilingual heading “Sur téléphone et ordinateur” / “On phone and computer”.

The hero demo is a 10 s CSS opacity sequence: active session, Focus, finish, real reward, saved goal/week progression, soft crossfade back to active. Captures are from the local demo student, not a user account. The finished screenshot's stopped 00:00 is outside the visible crop. The day total in the current fixture does not change after saving; the completed goal and week total do. No business data is edited to imply a different outcome.

## Motion and accessibility

Device tilt and inner product frames use separate elements. Product frames pause when the device is offscreen or the tab is hidden. Reduced motion leaves the initial active Chrono static. CTA targets remain at least 44 px; the animation does not intercept touch or focus.

## Protected scope

No auth, persistence, tracking, notifications, admin, user data or dashboard logic changes. No new animation dependency or marketing video asset.
