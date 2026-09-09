---
name: Blocus Tracker
description: A calm study workspace that turns focused time into visible progress.
colors:
  canvas: "#F4F1EA"
  surface: "#FFFDFB"
  surface-subtle: "#F6F3EC"
  border: "#E9E3DB"
  hairline: "rgba(31,26,23,0.06)"
  text-primary: "#1F1A17"
  text-secondary: "#7C746E"
  text-tertiary: "#A8A09A"
  text-disabled: "#C4BCB6"
  study-green: "#14B885"
  study-green-deep: "#0E8F68"
  action-green: "#087454"
  action-green-deep: "#065F46"
  mint-surface: "#EAFBF4"
  mint-border: "#C6EED9"
  brand-ink: "#0B2E23"
  brand-ink-soft: "#114134"
  ink-text: "#F2FBF7"
  ink-muted: "#8FD4B8"
  danger: "#B83E3E"
  danger-solid: "#C43D3D"
  danger-surface: "#FFF1F0"
  danger-border: "#F2C9C6"
  warning: "#8A5A10"
  white: "#FFFFFF"
  dark-canvas: "#12100E"
  dark-surface: "#1A1715"
  dark-surface-subtle: "#222120"
  dark-border: "#2C2622"
  dark-text-primary: "#F0EDE8"
  dark-text-secondary: "#A8A09A"
typography:
  display:
    fontFamily: "Quicksand, Avenir Next, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Nunito Sans, Avenir Next, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Nunito Sans, Avenir Next, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Nunito Sans, Avenir Next, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.06em"
  numeric:
    fontFamily: "Nunito Sans, Avenir Next, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3.6rem, 11vw, 6rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
rounded:
  checkbox: "6px"
  subtle: "10px"
  control: "14px"
  card: "20px"
  sheet: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action-green}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 18px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: "20px"
  card-ink:
    backgroundColor: "{colors.brand-ink}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.card}"
    padding: "20px"
  chip-selected:
    backgroundColor: "{colors.action-green}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "44px"
---

# Design System: Blocus Tracker

## Overview

**Creative North Star: "The Focused Study Desk"**

Blocus Tracker feels like a prepared study desk: warm, calm, and ready for work. Paper-like off-white surfaces, quiet warm-gray borders, and direct green signals keep repeated daily use comfortable, while typography and spacing favor quick scanning over decorative display.

The system earns intensity instead of spreading it everywhere. Deep green ink surfaces and authored radial light mark high-value focus, progress, and completion moments; ordinary management stays on restrained cards. Motion is brief, tactile, and state-driven, and secondary correction or management actions appear through progressive disclosure so the main task remains obvious.

**Key Characteristics:**

- Warm, paper-like surfaces with quiet borders.
- Dark green ink surfaces reserved for high-value focus and achievement moments.
- Readable, mobile-first controls with at least 44px targets.
- Short, tactile transform/opacity motion with reduced-motion equivalents.
- Progressive disclosure keeps correction and management actions nearby but secondary.

## Colors

The palette combines warm editorial neutrals with an energetic study green and a deep green-black brand surface; dark mode remaps the same semantic roles rather than introducing a second visual identity.

### Primary

- **Study Green:** The bright progress signal for checks, fills, active markers, and rare celebratory details.
- **Action Green:** The darker, more readable action pair used for primary controls and selected states.
- **Mint Surface:** The quiet green tint used for active navigation, supportive notices, and progress context.

### Secondary

- **Brand Ink:** The deep green surface reserved for focus, progress summaries, and completion moments.
- **Ink Text:** The high-contrast foreground family used only on Brand Ink surfaces.

### Tertiary

- **Danger Red:** Destructive, error, and paused-state communication. Pair it with copy or an icon; never depend on color alone.
- **Warning Amber:** Time-sensitive or cautionary status that is distinct from both study progress and destructive actions.

### Neutral

- **Warm Canvas:** The app background; it should read as softer than pure white.
- **Warm Surface:** The default card, field, menu, and shell surface.
- **Quiet Surface:** A recessed layer for controls, rows, empty states, and grouped options.
- **Quiet Border:** The low-contrast structural line used to separate without hard framing.
- **Warm Text Scale:** Near-black primary text steps down through secondary, tertiary, and disabled roles. In dark mode the same roles invert to warm near-white and warm gray.

### Family Accents

A closed set of five hues — Study Green, Streak Amber, Plan Blue, Social Violet, Night Indigo — plus a neutral Utility Slate. They exist for exactly two jobs: telling badge families apart, and giving profile sections a recognizable marker. Each family carries a tinted surface, an ink for glyphs on that tint, a fixed mid tone for solid fills, a deep tone for the rare tier, a bright glow for glyphs on that deep tone, and a hairline ring.

This is a deliberate, bounded exception to the green-only rule. Green stays the product's color: it is the family of study time, so it still owns the center of the system. The others are wayfinding, never identity.

### Named Rules

**The Family Accent Rule.** A family hue may color a badge emblem or a section icon pill, and nothing else. Never a content surface, never body text, never a status — success, warning, and danger keep their own semantic tokens. If a hue would be the only thing carrying meaning, it is the wrong tool.

**The Two-Channel Reward Rule.** On a badge, hue says which family, finish says how rare: tinted surface, then solid fill, then deep surface with a luminous ring. One dimension carrying both readings collapses into a gradient where nothing stands out.

**The Green Signal Rule.** Use bright Study Green to communicate progress or a meaningful active state; use the darker Action Green pair for readable controls.

**The Ink Is Earned Rule.** Reserve Brand Ink for high-value focus, progress, and completion moments, never for routine content cards.

## Typography

**Display Font:** Quicksand (with Avenir Next and rounded system fallbacks)

**Body Font:** Nunito Sans (with Avenir Next, Segoe UI, and system sans fallbacks)

**Numeric Font:** Nunito Sans with tabular numerals

**Character:** Nunito Sans carries almost the entire interface with a friendly but operational voice. Quicksand is a rare identity accent for the wordmark and selected brand moments; numeric displays stay in Nunito Sans so time and progress remain stable and highly legible.

### Hierarchy

- **Display:** Bold Quicksand with tight tracking for the wordmark and rare brand-led statements.
- **Headline:** Bold Nunito Sans for card and section titles; keep the hierarchy compact and scannable.
- **Body:** Regular or semibold Nunito Sans for interface copy, rows, and explanatory text.
- **Label:** Small semibold Nunito Sans with uppercase and wider tracking for terse mode, field, and status labels.
- **Numeric:** Bold, tabular Nunito Sans with tight tracking for timers and large statistics; seconds or units may be smaller and visually quieter.

### Named Rules

**The One Interface Voice Rule.** Nunito Sans is the default; Quicksand appears only when the brand itself is speaking.

**The Stable Number Rule.** Time, XP, streaks, counts, dates, and percentages use tabular numerals so changing values do not shift their layout.

## Layout

The system is mobile-first. App content uses 20px horizontal gutters and 20px gaps at compact widths, then expands to 36px gutters inside a centered 1280px content limit. At the 1024px application breakpoint, the bottom navigation becomes a fixed 232px sidebar and content receives the matching left offset. The 640px breakpoint changes bottom sheets into centered dialogs; the 380px breakpoint is available only for controls that can safely move from a stacked to a horizontal arrangement.

Cards use 20px internal padding by default and 24px where the viewport allows. Dense internal controls step through 8px, 12px, and 16px spacing; major sibling surfaces use the 20px rhythm. Layout must tolerate French and English labels without fixed text widths, and mobile shells preserve safe-area insets at the top and bottom.

**The 44-Pixel Rule.** Every primary control, field, segmented option, and icon-only action reaches at least 44px on touch layouts.

## Elevation & Depth

Depth comes from **tonal separation plus a two-layer shadow**, not from outlining. The canvas is deliberately deeper than the surface so a card can read as raised with no border at all. Each elevation token carries a short contact shadow and a wide ambient one; a single-layer shadow reads as a flat halo, and a zero-offset glow is decoration, not depth.

In dark mode shadows are nearly invisible, so the same tokens shift strategy: elevation is carried by a lighter surface plus a faint hairline. The token names stay identical, so components never branch on theme.

### Elevation Ladder

| Token | Use |
| --- | --- |
| `--bt-elev-1` | Resting cards and panels. |
| `--bt-elev-2` | Interactive lift on fine-pointer hover; floating menus. |
| `--bt-elev-3` | Chrome that crosses layers: floating navigation, sheets, dialogs. |

### Named Rules

**The No-Frame Rule.** A card does not carry a border and a shadow at the same time. In light mode the shadow does the work and the border is removed; in dark mode a hairline replaces the shadow. Carrying both is the web-dashboard signature this system exists to remove.

**The Earned Container Rule.** A card is for meaningful grouping, never for holding content. When a section only needs separation, use `.card-plain` and let whitespace, type, and a heading do it. Nested cards are always wrong; use `.card-inset` for a recessed region inside a card.

**The Quiet Lift Rule.** Resting surfaces stay calm; elevation increases only for interaction or a true layer change.

**The Tonal Depth Rule.** Build atmosphere with authored gradients and radial light, never with generic grain overlays.

## Shapes

The form language is softly geometric, and the scale is named rather than improvised per component: `--bt-r-inset` 12px, `--bt-r-control` 14px, `--bt-r-card` 22px, `--bt-r-sheet` 28px, plus full pills for status chips. A segmented control matches the radius of the controls beside it rather than defaulting to a pill — a lone pill in a row of rounded rectangles reads as a stray element. Checkboxes remain compact rounded squares, while course identity and status markers are circular. Bottom sheets use 24px top corners on mobile and settle into rounded dialogs on wider screens.

Borders are thin and quiet. Dashed borders are reserved for an empty or add state; selected color swatches use a two-ring treatment so selection remains visible across light and dark swatches.

## Components

### Buttons

- **Shape:** Soft controls with 14px corners; timer and compact choice actions may use full pills.
- **Primary:** A dark green gradient, white text, semibold weight, and a restrained green shadow. It is the clearest action on a surface.
- **Hover / Focus:** Fine-pointer hover lifts by 1px with a broader shadow; press scales to 97%. Keyboard focus uses a 2px Study Green outline with 2px offset.
- **Secondary / Ghost:** Quiet Surface fill, primary text, and a Quiet Border. Neutral full-fill actions may use the primary text color against the surface color when they need equal weight without implying progress.
- **Disabled:** Preserve the component shape and reduce opacity; never remove the label or rely on color alone.

### Chips

- **Style:** Full pills with small semibold or bold labels. Selected choices use Action Green and white; unselected choices use Quiet Surface with a Quiet Border.
- **State:** Progress counts and status pills use tabular numerals. Course colors remain data-driven identifiers and do not replace semantic system colors.

### Cards / Containers

- **Corner Style:** Generous 20px corners, increasing to 22–24px for sheets and transient completion surfaces.
- **Background:** Warm Surface for routine work, Quiet Surface for inset groups, and Brand Ink for earned focus or progress moments.
- **Shadow Strategy:** Tonal separation first, Ambient Card shadow second; use stronger elevation only for interactive or floating layers.
- **Border:** One quiet 1px border at rest.
- **Internal Padding:** 20px compact and 24px when space permits.

### Inputs / Fields

- **Style:** Warm Surface, Quiet Border, 14px corners, and 10px by 14px padding.
- **Focus:** Study Green border plus a soft 4px green focus halo; the global keyboard outline remains visible.
- **Error / Disabled:** Errors shift to the Danger family with a matching halo. Disabled fields reduce opacity and move to Quiet Surface. Text inputs use at least 16px type on touch layouts to prevent iOS zoom.

### Navigation

Desktop navigation is a quiet vertical list on Warm Surface; the active item receives Mint Surface, dark green text, and a slim Study Green rail.

Mobile navigation is a **floating translucent bar** (`.bt-nav`), inset 12px from the edges and lifted above the home indicator, carrying `--bt-elev-3` and a bright top hairline that reads as light catching the material. Content scrolls underneath it rather than stopping at it. The active tab grows a Mint pill behind its icon from a 0.94 resting scale, so selection is felt without flashing. The bar becomes opaque under `prefers-reduced-transparency`, gains a solid contrasting border under `prefers-contrast: more`, and drops the scale transition under `prefers-reduced-motion`.

Inactive items use tertiary text, and notification badges add both count and contrast.

### Progress & Selection

Progress tracks use recessed neutral or translucent ink tracks, full-pill clipping, and a left-origin `scaleX` fill so updates remain composited and stable. Checkboxes keep a native or semantic checkbox behavior, add a rounded-square green fill and white check, and pair completion with a drawn strike-through where appropriate. Segmented controls keep one sliding or elevated selected surface inside a quiet pill-shaped track.

### Dialogs & Progressive Disclosure

Editing opens as a bottom sheet on compact screens and a centered dialog from 640px upward. Dialogs trap focus, close on Escape, restore the opener, and separate destructive confirmation inside a Danger-tinted inset panel. Row-level edit and delete actions stay behind an overflow menu or a contextual editor until requested.

**Grouped lists.** Settings that are opened a few times a year belong in a grouped list, not in an expanded card. A group is one surface holding rows of an icon pill, a label, the current state, and a chevron; the hairline starts after the pill so the eye follows the label column instead of being cut at every line. A folded row must still answer the question it was opened for — "Preferences · FR · Light" beats a bare "Preferences" — otherwise folding becomes hiding. What people check often, or urgently, stays unfolded: notification state is the standing example.

## Do's and Don'ts

### Do:

- **Do** use the warm semantic surface stack before adding elevation.
- **Do** ask whether a section needs a container at all before reaching for `.card`.
- **Do** keep primary actions in the dark Action Green pair and progress indicators in bright Study Green.
- **Do** reserve dark ink surfaces for focus, meaningful progress, and completion.
- **Do** use tabular numerals for any value that updates or aligns with another value.
- **Do** preserve keyboard focus, 44px touch targets, safe areas, dark mode, and reduced-motion behavior.
- **Do** reveal correction, deletion, and detailed management actions progressively.
- **Do** collapse rarely used settings into grouped list rows, and show their current state on the folded row.
- **Do** let a family hue mark a badge or a section icon, and let finish — not saturation — carry rarity.

### Don't:

- **Don't** put a border and a shadow on the same surface.
- **Don't** nest a card inside a card; use `.card-inset` or plain spacing.
- **Don't** spread Brand Ink across ordinary management cards or use it as a generic dark panel.
- **Don't** add generic grain, noise, or decorative texture; depth comes from tonal radial light and restrained shadow.
- **Don't** use Quicksand as the general interface font.
- **Don't** use bright green for dense text when the darker green role is available.
- **Don't** let course colors carry status meaning or replace labels, icons, and semantic feedback.
- **Don't** spend a family accent on a content surface, body text, or a status; they mark families, nothing else.
- **Don't** fold away what people open under pressure — notification state stays visible on the profile.
- **Don't** animate layout properties or leave motion running when reduced motion is requested.
