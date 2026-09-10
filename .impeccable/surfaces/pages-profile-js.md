---
version: 1
slug: "pages-profile-js"
primary_target: "pages/profile.js"
related_targets: ["components/ProfileAchievementCards.js", "components/ProfileAchievementCards.module.css", "components/Mascot.js", "components/BadgeIcon.jsx", "lib/badgeGroups.js"]
---

## Scope and visitor mode

The profile is an **Operate** surface. This extension covers the two side-by-side navigation cards beneath the identity section: progression opens `/progression`, and the badge collection opens `/badges`. Each entire card is a link. Existing profile settings and navigation retain their roles.

## Audience, job and task

Students should recognize their current level, remaining XP and earned collection at a glance, then open the relevant detail page. The pair stays compact enough to keep the profile's other actions accessible on a phone.

## Content and constraints

Use the profile's canonical level information, with its existing fallback, and actual earned badge IDs. Show the current level and translated title, XP toward the next level, or the maximum-level state. The collection count represents all recognized earned badges, even when only five objects are previewed.

Preview up to five actually earned badges, ranked by rarity. Select one from each available `BADGE_GROUPS` family first, then fill remaining places from the ranked collection. This is a representative collection, with no claim that these are the most recently earned badges. With zero unlocked badges, retain the zero count and show the recognizable, unearned first-session badge as a first-badge teaser.

## Chosen direction and memorable moment

The progression card uses Brand Ink, a large tabular level number and the current shared `Mascot` in its `proud` mood. The mascot is a permanent, silent part of this card's artwork. This user-directed surface exception to the global event-only mascot guidance does not change the event/message system or establish a rule for other pages. XP labels and the progress track anchor the bottom of the card.

The collection card uses the existing semantic surface and a loose, overlapping arrangement of shared `BadgeIcon` objects. The rarest selected object leads the composition; family diversity makes the smaller objects distinguishable. Existing artwork, fonts, semantic color tokens, corner and elevation tokens remain the visual authority. Design decisions were delegated by the user; implementation uses the existing assets directly, without raster compositions or a global redesign.

## Responsive behavior and accessibility

The level scene includes a small mint-tinted elliptical platform, a quiet dotted orbit and four static spark/dot accents around the existing shiba. These details stay decorative and introduce no animation timers. Three quarter marks on the XP track and a small flag beside the next level reinforce the progression motif. At the narrowest width, extra title spacing keeps the platform clear of the text.

Keep two equal columns at compact and desktop widths. Size artwork to each card's available width. When the card content narrows to 120px or less, place the mascot lower so it does not obscure a two-digit level number. Let long translated titles and XP labels wrap. Preserve the bottom XP and collection summaries.

Provide visible keyboard focus, semantic navigation links and an accessible progress value. Treat the mascot and visual badge arrangement as decorative; expose preview badge names as screen-reader text. Fine-pointer hover provides a small card lift and badge movement. Reduced motion removes these transitions and the pressed scale.

## Verification

Implementation verification for this task covered 390px mobile and 1440px desktop layouts, plus a 320px compact case with dark theme, maximum level, English copy and reduced motion. The compact check specifically covers separation of the level number and mascot. This brief records that task verification; it does not introduce a separate global verification requirement.

## Unresolved decisions

None for this bounded extension. `DESIGN.md` and the global design sidecar remain unchanged.
