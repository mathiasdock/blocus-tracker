# UI implementation map — Blocus Tracker

Read [DESIGN.md](../DESIGN.md) first. It is the source of truth for visual decisions:
**Blocus makes studying tangible.** This file locates existing code; it is not
a second design system or a claim that every component already follows v1.
See DESIGN.md's consolidation list before copying a legacy pattern.

## Source map

| Concern | Current implementation |
| --- | --- |
| Product constraints | `PRODUCT.md` |
| Colors, surfaces, controls, navigation tokens | `styles/globals.css` (`:root` / `.dark`) |
| Font families and responsive utilities | `tailwind.config.js`; self-hosted `public/fonts/` |
| Timer units / daily time | `pages/dashboard.js`, `components/TodayProgressCard.js` |
| Goal-linked mascot position | `components/stats/StatsHero.js` |
| Course palette | `lib/courseColors.js`; saved `course.color` is identity |
| Exam/calendar presentation | `pages/planning.js`, `styles/planning.css`, `lib/planningInsights.mjs` |
| Mascot poses / appearances | `components/Mascot.js`, `components/MascotMoment.js`, `lib/mascotMotion.mjs`, `lib/mascotMoments.js` |
| Reward data / artwork | `lib/badges.js`, `lib/badgeArt.js`, `components/BadgeIcon.jsx` |
| Structured activity bodies | `components/ActivityPostBody.jsx` |
| Course spaces (Communities) | `components/course-spaces/*`, `lib/courseSpaces.mjs`, `styles/course-spaces.css` — `docs/course-spaces.md` |
| Shared interface icons | `components/Glyph.js` |
| Representative controls / sheets | `components/SegmentedGlide.js`, `components/InboxSheet.js`, `components/DetailSheet.js` |
| Signed-out discovery previews and contextual gates | `components/guest/GuestDiscovery.js`, `components/guest/GuestDiscovery.module.css` |

## Implementation safeguards

- Use semantic CSS variables for UI color. Course data and bounded artwork/kind palettes follow DESIGN.md; do not replace them with brand green.
- Root CSS is the runtime token authority. Tailwind's older literal neutral colors differ; do not propagate them or change global CSS as a side effect.
- Existing `.card` uses the card-radius/elevation roles; `.card-plain` and `.card-inset` are available. None is obligatory for a new section.
- `.btn-primary` is solid Action Green; `.btn-ghost` uses a subtle surface. The Timer's brighter primary is an existing local exception.
- Keep Nunito Sans for operational text and tabular values; Quicksand is a limited accent. No runtime font CDN.
- Mobile-first: `sm` 640px, `lg` 1024px; `xs` 380px is available. Sidebar is 232px at desktop. Preserve floating mobile navigation, safe-area padding and access to the last row.
- Use at least 44px touch hit areas and 16px touch text inputs; do not infer that every current control meets this.
- Keep visible keyboard focus, associated labels, semantic state, modal focus containment/restoration and Escape dismissal. Existing sheet implementations differ.
- Prefer CSS states and transform/opacity feedback; honor reduced motion with truthful final values. Do not copy an animation merely because a nearby card uses it.
- Match surrounding Tailwind/layout conventions, but use tokens for theme-aware values. Never redefine utilities such as `.dark .bg-white`; deliberate artwork colors must survive.
- Keep FR/EN copy in the established translation system. Do not use emoji as interface artwork; user-authored reactions are content.
- No new token, global refactor or shared object implementation is implied by a documentation change.

For scope and recent shipped behavior, read `AI_CHANGELOG.md` and the matching
`.impeccable/surfaces/` brief. Historical visual choices there do not override
DESIGN.md v1; retain local functionality and explicit user composition constraints.
