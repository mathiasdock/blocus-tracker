---
version: 1
slug: "pages-badges-js"
primary_target: "pages/badges.js"
related_targets: ["components/BadgeIcon.jsx", "components/BadgeSheet.js", "components/BadgeVisuals.module.css", "components/InboxSheet.js", "lib/badgeArt.js", "lib/badges.js", "lib/badgeGroups.js", "lib/badgeRules.mjs", "lib/badgeTruth.mjs"]
---

## Scope and visitor mode

The badge collection is an **Operate** surface: students recognize what they have earned and inspect what a remaining badge requires. The 2026-10-08 work extends the existing reward objects across their shared consumers. It keeps the warm neutral interface, forest identity, existing fonts, radii and illustration palette from `DESIGN.md`; it does not introduce a new visual world.

## Audience, job and task

The first viewport should show a collection of recognizable objects and their names. A student can scan a category, recognize its milestones and open one badge to read its state, effort tier, exact earning condition and XP reward. Rarity belongs to the collectible's structure, not to a colored tile or a text pill.

## Content and constraints

Keep all 30 canonical badge IDs and the declared category/item order in `lib/badgeGroups.js`: Study, Streak, Planning, Social, Community. Category counts and the collection total read the same canonical earned IDs as Profile. A failed refresh retains the previous result.

Ownership remains server truth through `fetchCanonicalBadges` in `lib/badgeTruth.mjs`; this task changes no award calculation, server rule, XP amount or stored data. Detail copy uses `badgeDescKey` and the actual `earnedAt` value so an earned pre-v84 badge still states its historical condition. An unknown date follows the existing current-condition fallback. The XP footer reads the canonical badge definition, not a visual estimate of rarity.

Use one shared `BadgeIcon` for collection, Profile, Stats summary, Activity, peer profile, public progress previews and the canonical unlock celebration. Historical artwork aliases remain available without creating a second badge catalogue.

## Chosen direction and memorable moment

Each canonical badge has a distinct motif, with related milestones growing within a family: four increasingly developed streak flames, a book/pair/stack/folio for study hours, distinct calendar forms for regularity and a paired-book object for Study Buddy. Satin shading and the existing illustration hues unite the objects while their silhouettes distinguish the accomplishment.

| Canonical tier | Shared finish |
| --- | --- |
| Discovery | Object alone |
| Common | Small incised base |
| Rare | Open metal cradle |
| Epic | Partial laurels around the cradle |
| Legendary | Extended laurels and a lower gem |

At 34px and above, the object includes its finish and an unearned object adds a small lock glyph. Below 34px, show the motif alone and expose state in surrounding text. Locked objects preserve their geometry in three opaque warm-neutral material tones; do not fade or grayscale the whole object. Earned objects have a short cast shadow and no permanent halo. The steel and gold finishes select existing material hues for contrast in each theme; the earned illustration colors remain intact.

The collection uses existing category cards in two columns from the desktop sidebar breakpoint (1024px), stacked below it. Keep three objects per row inside each card, a 72px object and a wrapping name underneath. The page retains its compact back/count header, accessible page title, progress track and 900px maximum content width.

`BadgeSheet` reuses the native `InboxSheet`: one close × at the top, a static 128px object, its name, one plain line for earned/locked state and tier, the exact condition and an XP footer. Its accessible dialog name remains present while duplicate utility-header text is visually hidden. No rarity chip or second close action.

## Responsive behavior, accessibility and motion

Names wrap in both French and English; three-column object rows must fit 320px without horizontal scrolling. Category controls retain at least 44px hit areas and a visible focus outline. Button accessible names include badge name, tier and earned/locked state; the SVG itself is decorative. State is conveyed by words and a lock/check as well as the material change.

Necessary mount boundaries and focus indicators must meet 3:1 contrast, and useful small text 4.5:1, against the actual surface in each theme. These pairs have regression checks; this is not a blanket certification of every interior artwork detail.

The shared native dialog makes the app background inert, handles Escape, restores focus and retains its existing short exit lifecycle. Reduced motion closes immediately. Inspecting an earned badge stays static; `animate` is enabled only by the existing canonical true-unlock celebration. Existing fine-pointer hover remains restrained to 1.04×, and touch/reduced-motion users receive no hover scale. Sound events and preferences are unchanged.

## Verification

Local implementation validation on 2026-10-08: 27 targeted tests and all 769 tests passed, lint was clean and the production build succeeded. Tests cover distinct canonical motifs, finish/lock size behavior, explicit animation, translated accessible names, exact XP/conditions and date-aware legacy descriptions. Mount, secondary-text and focus contrast are checked in both themes.

The real collection/detail components were inspected with explicit synthetic offline fixtures at 1440px desktop and 390px mobile in French/light, and 1440px desktop and 320px mobile in English/dark. Earned and locked objects across all five tiers, detail content, Escape and focus restoration were checked without horizontal overflow. Final visual review passed after the dark-theme mount/locked contrast correction. Native modal behavior prevented access to app content behind the sheet; no claim is made about a keyboard trap across all browser chrome or platforms.

The fixture at `/dev/badges` requires development mode plus `NEXT_PUBLIC_OFFLINE_DEV=true`, and performs no badge/database writes. This validation does not test production awards or a physical phone. The existing PWA 3 MB precache warning and absent Supabase environment in the isolated worktree remain known local build limitations; no secrets were copied.

## Unresolved decisions

None for this bounded extension. The approved implementation was prepared and validated on `codex/badge-visual-system` before publication. The known stale `.impeccable/design.json` is outside this task; no global documentation repair was performed.
