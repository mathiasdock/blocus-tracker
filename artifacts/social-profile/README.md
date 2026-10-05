# Social profile — local QA, 2026-10-05

Synthetic offline fixtures only. No production writes/accounts, permission
changes, deployment or migration. `pages/dev/user-profile.js` rehearses the
real modal/controller and existing friendship writes on local demo data;
its production URL was checked and returns **404**.

## Captures inspected

- `desktop-app-en.jpg`: accepted friend, actual Friends conversation consumer,
  1440×900, light, English. The Message button reached the existing `dm` route.
- `mobile-fr.jpg`: accepted friend, 390×844, light, French, bottom-anchored sheet.
- `mobile-stranger-en.jpg`: non-friend, 390×844, light, English. Only authorized
  public progression and explicitly public shared badge events appear.
- `mobile-long-dark-en.jpg`: 320×740, dark, English; long identity, institution,
  program and course names wrap without horizontal overflow. Inner scrolling
  retains access to the remaining content.

Also checked 1280×800, incoming/outgoing pending requests, request creation,
acceptance, confirmed removal (private content immediately discarded), true
zero metrics, Escape, focus containment/restoration and visible keyboard focus.
No messages were sent. The friendship operations used disposable local fixtures.

## Data/privacy boundary

Read-only inspection of existing production policies established that study
aggregate and courses are friends/self-only. The UI does not grant broader
access, including when the viewer happens to be an admin. Streak, level and badge
count reuse the existing public aggregate RPC. Highlight objects reuse only
already visible structured Activity posts, never the private earned collection.

## Verification

- 15 new focused helper/React tests; complete suite **692/692** passing.
- `npm run lint`: no warnings or errors.
- `npm run build`: passed; pre-existing PWA precache-size warning remains.
- Production-mode offline-preview route: HTTP 404.
- Rendered light contrast: secondary text 5.08:1; primary button 11.08:1.

Limits: visual and mutation walkthroughs are local fixtures, not a production
A/B account test or real-device Safari/PWA test. No deploy requested.
