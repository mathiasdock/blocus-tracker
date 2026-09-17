---
name: Blocus Tracker
description: Blocus makes studying tangible.
colors:
  canvas: "#F4F1EA"
  surface: "#FFFDFB"
  surface-subtle: "#F6F3EC"
  border: "#E9E3DB"
  text-primary: "#1F1A17"
  text-secondary: "#7C746E"
  study-green: "#14B885"
  action-green: "#087454"
  mint-surface: "#EAFBF4"
  brand-ink: "#0B2E23"
  ink-text: "#F2FBF7"
  danger: "#B83E3E"
  danger-solid: "#C43D3D"
  danger-surface: "#FFF1F0"
  danger-border: "#F2C9C6"
  dark-canvas: "#12100E"
  dark-surface: "#1F1B18"
  dark-surface-subtle: "#262220"
  dark-border: "#2C2622"
  dark-text-primary: "#F0EDE8"
  dark-text-secondary: "#A8A09A"
typography:
  display:
    fontFamily: "Quicksand, Avenir Next, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Nunito Sans, Avenir Next, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
  numeric:
    fontFamily: "Nunito Sans, Avenir Next, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  inset: "12px"
  control: "14px"
  card: "22px"
  sheet: "28px"
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
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
---

# Blocus visual language · v1

## Overview

**Creative North Star: "Blocus makes studying tangible."**

The signature is how the product represents effort, academic context and earned outcomes—not a green card template. Time becomes accumulated material; courses retain identity; exams interrupt ordinary planning; progress has a destination; rewards are objects; academic relationships explain relevance. Utility UI stays quiet.

**Status and authority — 2026-09-15.** This is the practical source of truth for future UI decisions. It supersedes conflicting visual guidance in older docs, source comments and surface briefs, but does not authorize a redesign. Existing behavior, data and user-directed compositions remain intact until their own scoped task. The frontmatter records a compact baseline from current CSS; use runtime `--bt-*` variables, not copied hex values. Components may not yet meet the rules below: the consolidation list explicitly records that gap.

Read [PRODUCT.md](PRODUCT.md) for product constraints and [docs/UI.md](docs/UI.md) for implementation entry points. Surface briefs retain local requirements, not competing global rules. The sidecar is a derived documentation preview, not another authority.

**Key Characteristics:**

- Measured time, not decorative blocks.
- Academic identity, not arbitrary color.
- Exam priority that survives a small screen and loss of color.
- Data-linked participation, not mascot placement.
- Shared reward objects, not independent celebration banners.
- Familiar, neutral controls around these six signatures.

## Colors

### Semantic roles

| Meaning | Existing source | Boundary |
| --- | --- | --- |
| Primary action / positive / active | `--bt-action`, `--bt-accent`, `--bt-accent-text`, `--bt-accent-bg` | Differentiate action, selection and information by structure too. Bright green is not a default text color. |
| Course identity | Saved `course.color`; palette in `lib/courseColors.js` | Follow the course, never task completion or urgency. |
| Exam priority | Planning `--bt-exam-*` in `styles/planning.css` | Warm academic surface, deadline rail and calendar glyph; independent of danger and pause tokens. |
| Error / destructive action | `--bt-danger*` | Error copy, warning/action semantics; no exam marker. |
| Paused Timer | `--bt-pause*` in `styles/globals.css` | Attention state, **not** an error. Timer surfaces only — card, digits, badge, in-progress unit ring, Focus field. Never borrow it for failures, and never borrow `--bt-danger*` for a pause. See § The Paused-Timer Exception. |
| Routine interface | Surface/text/border `--bt-*` roles | Search, settings, back, fields, ordinary messaging. |
| Achievement artwork | `lib/badgeArt.js` illustration palette | Inside objects only; no random colored UI panels. |
| Academic kind | `--bt-kind-*` in `styles/study-spaces.css` | Kind mark and kind word only; never a selected-row background. Exam kind must converge on the shared exam vocabulary. |
| University / mascot | Real logo / existing character artwork | Preserve asset colors; do not leak them into surrounding controls. |

**The Meaning Rule.** Every strong color must answer “what does this mean?” No answer means neutral UI. Planning's semantic exam tokens derive from its warm palette; reuse that vocabulary in future scoped exam work, not new per-page shades.

### Course Colors — academic identity

A saved course owns its hue across Timer, objectives, Planning, Stats and Activity. Two courses can share a hue; names still distinguish them. No course or an unavailable color means neutral, not an invented identity.

| Context | Rule |
| --- | --- |
| Light surface | Original hue in a marker or chart; light derived tint for a larger region, neutral readable text. |
| Dark surface | Preserve hue identity; adjust tint/marker luminance only as needed for contrast. Do not recolor the entire course green. |
| Selected | Preserve course hue; add a check, outline or selected control state independent of the course fill. |
| Calendar: one course | One uniform subtle tint across the cell. Current 14% light / 20% dark opacity is a starting point, not a contrast guarantee. |
| Calendar: multiple courses | One representative tint, selected deterministically using the existing objective-count ordering and stable ID tie-break. Show a few named/dotted identities plus a count/detail affordance. No diagonal split or rainbow. The representative tint is not a claim about time share. |
| Charts | Course hues identify series; labels/values and a shared scale carry quantity. Never change series colors with sort order. |
| Activity | Course marker and name support the event; ordinary sessions remain compact. Preserve an existing historical event snapshot if no reliable live course reference exists. |
| Text/icons | Use semantic neutral text unless the actual course-color/background pair passes contrast; retain identity in an adjacent marker. Never place white text on every course hue. |

Contrast acceptance for future work: ordinary text at least 4.5:1, large text 3:1, necessary graphical/control boundaries 3:1 against their surroundings. Check both themes and actual tints. Color is never the only identifier; use labels, state marks and accessible descriptions. Existing faint `--bt-text-3/4` roles are not approved for essential small text merely because they are tokens.

## Typography

**Decision: retain Nunito Sans + Quicksand. No font change.**

From scratch, Nunito Sans would still be a defensible choice: approachable without being a display novelty, useful weights, readable words and stable tabular numerals. It supports a student productivity product more naturally than a deliberately institutional or ornamental voice. Its softness is not unique; the study grammar must provide distinctiveness.

Quicksand remains defensible as a restrained accent: it relates to the friendly character and current wordmark. It is less suitable for dense calendars, metadata or long reading; using it everywhere would exaggerate softness and weaken hierarchy. This is a role problem, not an overwhelming technical reason to replace the family.

- Nunito Sans: body, controls, lists, labels, charts and all numeric data.
- Quicksand: wordmark, selected page titles and intentional brand moments—not every card heading. Existing `h1` and dashboard-title usage is a consolidation question, not an automatic removal.
- Use tabular numerals for time/XP/counts and aligned comparisons; distinguish minutes/seconds without making units unreadable.
- Default body/control copy stays around 14–16px. Aim for at least 12px for useful secondary text; do not solve density with 9–10px labels. Touch text inputs remain at least 16px.
- Prefer sentence-case labels. Uppercase is for short categories, not every field or reward.
- Verify long FR/EN names, multi-digit levels, 8h totals and narrow screens. Fonts are self-hosted; no new CDN requests.
- Fix contrast, role, wrapping and spacing before blaming the font. The current faint academic metadata and tiny labels are known debt.

## Layout

Operate-first: answer the current question before introducing brand expression. Complementary desktop columns are useful when they shorten understanding, not when they merely fill width. Mobile rearranges priorities rather than shrinking a dashboard.

Reuse the incumbent spacing rhythm, compact 20px gutters and wider desktop gutters, the 1024px sidebar transition, and safe areas. Preserve touch targets of at least 44px, keyboard navigation and visible focus. A visual marker can be small; its interactive hit area cannot. Long labels wrap or reveal complete details.

Do not give sparse content a fixed hero height just to feel premium. Day serves execution, Week serves workload, Month serves important dates; they need not share identical density. Calendar exam identity must remain visible without hover on mobile.

### Neutral UI principles

Back, search, forms, settings, delete confirmations and normal message controls may remain familiar. The paused Timer is the one documented place where the interface deliberately refuses to stay quiet (§ The Paused-Timer Exception); everything else on this page still applies. Do not add a block, mascot, special course tint or reward object unless there is a real study datum involved. Friends need not look eccentric. A persistent selected state, a passive count and a primary action must not look interchangeable.

## Elevation & Depth

**No card by default.** First ask whether the content needs independent containment: a movable object, interactive group, separate context or true layer can justify a surface. A heading alone cannot. Start with spacing, alignment or a separator; preserve existing cards until their scoped review.

Use current elevation tokens when a surface is justified: `--bt-elev-1` for a resting card, `--bt-elev-2` for a menu/appropriate hover, `--bt-elev-3` for overlays and floating chrome. Light cards generally use tonal separation plus shadow; dark surfaces may need a hairline. Borders that communicate a control, calendar grid or exam priority are valid. Do not mechanically ban every border/shadow combination or delete useful nested containment.

Prefer plain or inset groups inside cards; another elevated card requires a separate interaction/context reason. Soft material shading may explain an object or a real layer, not conceal an empty composition. Current ink surfaces remain available for important focus/progress moments, never as the automatic wrapper for a signature.

## Shapes

Soft geometry is supporting infrastructure, not the identity. Reuse the four radius roles in the frontmatter; do not normalize every object to a 22px card.

**No pill by default.** A pill must carry a filter, selection, state, tag, compact action or meaningful count. Information is non-interactive and quiet; selection has a persistent selected state; action has an explicit verb/icon and focus/press feedback. Do not wrap ordinary copy to fill space.

**The Diagonal Rule.** Planning uses no diagonal for past dates or multiple courses. Both conflicted and were removed in Phase 1. Calendar position/date and Today communicate time context; course markers communicate identity. Do not restore either slash or split, or substitute another decorative motif.

## Components

### Study Blocks — time becomes tangible

**Data unit ≠ visual unit.** Sessions currently store `duration_seconds`; retain that precision. Fifteen minutes (900 seconds) is the conceptual block, not a new storage/rounding rule. Planned time comes from explicit targets; task count, XP and elapsed wall-clock time are not study time.

| Scale | Default representation | Readability rule |
| --- | --- | --- |
| Zero / under 15 min | Zero: no earned block. Positive duration: one fractional quarter-hour block with exact duration label; compact records may be text-only. | 7 min is not one completed block; never inflate a fraction to imply more study. |
| 15–120 min session | Quarter-hour units, clustered every four into one hour. 15m = 1; 30m = 2; 1h = 4. | At most eight individual units by default. Partial last unit follows measured time. |
| Over 2h / long study day | Hour-sized clusters with optional four internal divisions only when legible. 6–8h means 6–8 primary units, not 24–32 independent tiles. | Prefer solid hour faces when subdivisions become tiny. Preserve a labeled remainder: 6h20 = six hours + one-third hour. |
| Very long totals / narrow summary | Labeled aggregate, or larger time units (e.g. 2h per segment). | At most 12 primary units; compress earlier if they need to shrink below a readable size. Never hide time behind an unlabeled “+N”. |
| Week / month / stats / leaderboard | Exact total plus optional compact rectangular duration bands or day/week bins. | State the unit/axis; a day-bin is not a 15-minute block. Use one shared scale across comparisons, or omit the graphic. |

Compression changes rendering, not stored data or reward eligibility. A caption such as “1 unit = 1h” is required when the unit would otherwise be ambiguous. Do not change scale independently for each leaderboard row. On live views, avoid rearranging all units every minute; change scale at stable boundaries. The current Timer's capped overflow and daily goal cells are evidence to evolve, not this full policy already implemented.

Completed time is filled; a live measured fraction is partial; paused time stops accumulating and uses an explicit pause state (§ The Paused-Timer Exception), not an exam/error rail. A paused unit keeps its earned fill in the ordinary colour — the time was studied; what is wrong is that it stopped growing — and carries the warning on its ring. Planned time is an outline/unfilled allocation labeled “planned,” never shown as earned. Unknown duration stays unknown; completing a checklist does not prove time studied.

**Blocks are quantities; progress bars are ratios.** A labeled time-target view may show studied units against planned capacity because both are durations. Do not turn “3/5 objectives” or “40% setup” into study blocks. Do not duplicate the same duration as blocks, a bar and a percentage without a different question. No target means no invented empty capacity. Over-target time remains in the total even when a goal track stops at 100%.

### Exams — interrupt the ordinary system

**EXAM STATE > COURSE COLOR.** Adopt one vocabulary: a **deadline marker** comprising a short solid leading rail aligned with the calendar glyph + explicit “Exam” label, followed by the date/event identity. The rail belongs to the exam header/event, not an arbitrary full-height colored card edge. Use the existing warm Planning family; color reinforces a recognizable structure.

- Month cell: exam header/marker and date remain visible; warm treatment owns the cell. Course identity is a small named/dotted secondary signal. No competing course-colored background.
- Mobile/narrow cells: preserve the rail and calendar glyph, plus the count for multiple exams. The full Exam label stays accessible to assistive technology when visually omitted for lack of space; day detail exposes names/date/time without hover. Never truncate the exam identity into an ambiguous fragment.
- Day/Week/list/Activity/academic space: reuse the same header vocabulary at the available size. A date-bearing mark can include the actual date; do not fabricate a date for an undated exam space.
- Today and selection remain independently visible, for example on the date indicator/outline; neither replaces the exam treatment.
- Multiple exams: one marker with count and accessible event names, not stacked stripes. Other objectives remain secondary and available.
- Error/delete UI uses its own icon, action and message; a warm exam is not an error.

This contract evolves Planning's existing calendar label and occasional leading stripe. The shared renderer/aliases and mobile treatment are **not implemented by this documentation task**.

### The Paused-Timer Exception — loud on purpose

**This overrides "no color without meaning", "neutral UI stays neutral" and any
recommendation to keep the paused Timer calm. It is a deliberate, bounded
exception with a behavioural reason, not a leftover.**

Blocus Tracker users pause a study session, get distracted, and forget to come
back. The Timer then sits there not recording, and real study time is lost from
their day. The strong pause treatment exists to solve exactly that: someone who
looks back at the screen after their attention wandered must register, without
reading anything, that **their session is not counting time right now**.

A quiet pause state was tried and is wrong for this product. Do not re-derive it
from first principles; the behaviour was observed in real use.

| Surface | Treatment |
| --- | --- |
| Timer card | `--bt-pause-bg` fill, `--bt-pause-border`, `--bt-pause-shadow`; the green working wash turns off. |
| Digits | `--bt-pause` — the largest element on screen, so the most recognisable from across a room. |
| Badge | White on `--bt-pause-strong`, with the elapsed pause duration, breathing via `.bt-pause-pulse`. The duration answers the returning user's actual question. |
| In-progress study unit | `.bt-block-paused` ring. The earned fill keeps its normal colour. |
| Focus mode | Red shader palette plus a peripheral breathing vignette (`.bt-pause-flash`); full screen has no card to carry the state. |

**Semantics stay separate.** This is an attention state, never destructive or
error semantics. It does not use `--bt-danger*`, it does not appear in error
copy, and no other screen may borrow `--bt-pause*`. Pausing is a normal, valid
thing to do — the interface is insistent about the *consequence*, not
disapproving of the *action*. Copy stays neutral and never scolds.

**Motion safety is not negotiable.** Insistent must not mean unsafe. The
historical implementation flashed the whole Focus field at 1 Hz from 0.14 to 1.0
opacity: under the WCAG three-per-second threshold, but a large-area,
high-amplitude, sharp-attack change. The current pulses are slow (2.4–2.6 s),
eased with no attack, lower amplitude, and the Focus vignette keeps its centre
transparent so the timer itself never flashes. Under
`prefers-reduced-motion: reduce` every pulse is replaced by its **persistent
full-strength** form — the warning is never simply removed, because the
behavioural problem does not go away for those users.

Keep the pause reachable and reversible: Resume stays a primary action with its
own invitation (`.bt-pause-cta`), and the state is announced once through
`role="status"` rather than re-read on every tick.

### Progress — distance to a real destination

Ordinary objectives, setup and percentages use an ordinary labeled progress bar. Important personal goals may use a spatial track with an origin, current position and known destination.

The mascot's position must derive from the same ratio as the accessible progress value; clamp position to the track but keep actual over-target totals visible. Unknown/zero target means no fabricated journey. XP distance is XP, not fifteen-minute blocks. Decorative tick marks must not imply time units.

### Mascot rules — participates, does not decorate

Reuse `Mascot`, its moods and `MascotMoment`; no parallel character system.

Two permitted modes:

1. **Event:** reaction to a real achievement/context change, using existing event identity, deduplication and frequency rules. Short reaction, not explanatory paragraphs; ordinary session posts do not automatically earn a mascot.
2. **Persistent silent participant:** its position, state or relationship explains real personal progress. Stats' data-linked walker is the model. The user-approved Profile companion remains valid beside earned level/XP; do not copy its static stage to other pages as a default. A new persistent scene must explain what the character is doing with the data.

No mascot for filler, every empty state or repeated generic advice. Aim for one prominent character per visible composition; suppress/defer a competing event when a permanent companion already occupies it. Existing overlap is backlog, not permission to rewrite appearances now.

Keep meaningful text/values outside artwork. Hide duplicated decorative SVG from assistive technology. Respect reduced motion with the correct static value/state, suspend unnecessary offscreen/hidden work, and avoid continuous celebratory loops. Motion must never delay access to the result.

### Achievement Objects — rewards have an identity outside their container

Use an object independent of its host: compact metadata, profile collection, detail and Activity should refer to the same reward. Object artwork must survive on a neutral surface; a dark gradient card is not its identity.

| Object family | Contract |
| --- | --- |
| Badge | Use the actual `BadgeIcon` by earned badge ID. Retain its recognizable locked silhouette; expose name and condition. Shared silhouettes need visible milestone/name distinctions, not halo strength alone. **One identity, one earning rule:** a badge is defined in `lib/badges.js`, awarded by the server (`sync_my_badges`) and stored in `user_badges`. A page may read, summarize and link to that collection; it must never compute its own conditions and draw them with `BadgeIcon` — Stats did exactly that until 2026-09-16 (nine local "badges", no XP, invisible on the profile). A local statistic that deserves recognition belongs in Records as a value, or becomes a canonical badge through its own server-side task. |
| Level | Converge on a **level seal**: the existing Activity circular medallion vocabulary, readable numeral + “Lv.” identity and consistent rim. Small metadata may stay `Lv. N`; do not force a tiny illustrated coin everywhere. Rim is not an XP meter or time ticks. Final shared artwork/component is a scoped follow-up. |
| Streak | One flame family derived from existing badge artwork, paired with a visible number + days. Ordinary count is compact; a milestone uses that same object, not an unrelated flame/card. |
| Study milestone / record | Only a real supported metric with value, unit and record/milestone label. Choose its object in a dedicated task; this document creates neither new records nor reward criteria. |
| Session / ordinary task | Compact duration/course or completion mark; not automatically a collectible reward. |

Rarity can have a restrained material treatment and a word, not a new UI palette. Preserve original artwork colors across themes. No generic gradient + uppercase eyebrow + huge number + confetti recipe. Celebrations are brief and exceptional. Activity should eventually reuse shared objects through its structured renderer; preserve legacy text fallbacks and never infer achievements by parsing arbitrary captions.

### Academic Structure — relationships explain relevance

The existing model is connected contexts, **not a mandatory seven-step funnel**. A university may contain a field/program/course/exam, while a cross-university field can be a broader relevant space. “All students” is a hub; skipped/unknown levels are valid.

Use real `parent_id` ancestry and field/course relationships, not names that merely resemble one another. Show current space + nearest useful parent, with remaining ancestry disclosed when needed. Use short factual relevance copy (“your field at UCF,” “inside Marketing”), not invented affinity percentages. Distinguish membership, relevance and activity.

Preserve logo/monogram, compass, cap, book and exam-date/marker distinctions; kind color reinforces shape. A university color or blue course-kind glyph is not the user's personal course color. Only show that course hue when an actual course mapping exists. Name/university context must remain readable when many results share the same title.

Offer one broader relevant route when an area is quiet, based on available activity/context data; member count alone does not prove activity. Keep familiar lists, filters and social controls. Do not render the whole hierarchy as a tree or change Friends to manufacture uniqueness.

## Do's and Don'ts

### Correct / incorrect usage

| Correct | Incorrect |
| --- | --- |
| “6h20 studied,” six hour units + fractional remainder | 26 tiny squares or rounding to 6h30 |
| “3/5 objectives,” labeled ratio | Three earned study blocks |
| Pink course marker with readable neutral text | Pink used as “overdue” |
| Exam structure survives a red-course cell and mobile width | Red text alone or hiding the exam icon on mobile |
| Date position and Today mark; uniform representative course tint | Diagonal for past dates, mixed courses or decoration |
| Mascot stands at the real goal position | Mascot fills spare space beside generic copy |
| Same level seal/object across detail and feed | A new trophy/card silhouette on every page |
| Plain search and settings rows | Course tints and mascot decoration in preferences |
| Named course/context under identical field names | Repeated colored icons with barely legible context |

### Gradual consolidation — not shipped by this document

| Priority | Existing mismatch / evidence | Acceptance in a future scoped task |
| --- | --- | --- |
| ✅ | ~~Timer capped `+N`; `TodayProgressCard` builds one cell per target quarter-hour~~ — shipped 2026-09-15 in `lib/studyBlocks.mjs` + `components/StudyBlocks.js` (Timer, Focus and Today share one scale; exact fractions; no `+N`; no invented capacity; Pomodoro rest has its own form) | Done. Remaining in this family: Stats' runway and the leaderboard still use their own encodings — Stats Phase 1 (2026-09-16) settled its bar semantics without touching either. |
| ✅ | Planning Phase 1: both diagonals removed; shared exam marker and semantic tokens; neutral objective chips | Shipped 2026-09-16. Exam read compatibility documented in `docs/planning-exams.md`. Month workload weighting and Week composition remain Phase 2. |
| 1 | Planning exam palette vs `--bt-kind-exam` | One shared semantic exam vocabulary; distinguish errors and undated exam spaces |
| 1 | Faint small metadata; bright-green/white selected text | Measured contrast in both themes; no essential text demoted to disabled-looking gray. Stats Phase 1 scoped this for `/stats` only (`bt-stats-readable` lifts `--bt-text-3/4`, measured 2.5:1 light / 2.9:1 dark before). `RankBadge` numerals and `LevelPill` remain below threshold everywhere. |
| 2 | Level number / circular medallion / square celebration; multiple flames | Shared object family, compact variants, visible milestone identity |
| ✅ | ~~Stats hierarchy, local badges, podium medals~~ — shipped 2026-09-16 (Stats Phase 2). Personal analysis precedes social comparison at every width; the Stats-only badge universe is replaced by a read-only summary of the canonical collection; gold/silver/bronze no longer decorate study quantities (course breakdown, leaderboard). | Remaining: `LevelPill` contrast (shared), unused Stats badge entries in `lib/badgeArt.js`. |
| ✅ | ~~Stats ordinary bars~~ — shipped 2026-09-16 (Stats Phase 1). Three geometries now carry three questions and no longer look interchangeable: filled track with a destination = progress toward a target (the runway alone), filled track = share of a whole, bar with **no** track on a shared left edge = quantity compared on a stated scale. Study-by-course bar length and its printed percentage finally share one denominator; artificial 14 % / 3 % minimum fills are gone and zero draws nothing. Planning's `PlanningLoadBar` (2026-09-16) remains the week/month duration band this document allows, deliberately not a Study Block. | Remaining in this family: the leaderboard rows and XP ticks still use their own encodings, and the runway itself was deliberately left untouched. |
| 2 | Profile segmented controls vs `SegmentedGlide`; different sheet implementations | Consistent equivalent states; labels, focus trap/restore, Escape, targets and reduced motion |
| 2 | Profile permanent companion plus event mascot; decorative cover/stage details | Resolve competing characters and information-free emphasis only in an authorized profile task |
| 3 | Tailwind color literals differ from CSS; historical surface docs/comments | Consolidate at source without repainting unrelated screens; record before/after |
| 3 | Shared badge silhouettes; legacy Activity text; small academic context | Legible distinctions and graceful history; no fabricated structured data or proximity |

Documentation values for radii, dark surfaces and the old “card/border/gradient by default” guidance are reconciled here. Runtime CSS, controls, artwork and layouts have **not** been consolidated.

### Rules for coding agents

1. Read this file, PRODUCT.md, the relevant surface brief and recent AI_CHANGELOG before UI work.
2. Inspect real data, current render and reusable components. State which signature answers which user question; “none, utility UI” is valid.
3. Preserve existing behavior and explicit composition constraints. This language is not authorization for a global redesign, migration or asset replacement.
4. Reuse tokens and objects; do not create another palette, level object, mascot system or competing design document.
5. Record units/scale, source of truth, priority conflicts and empty/unknown behavior before adding a visualization.
6. Explain the need for each new surface, pill and strong decoration. Use fewer encodings, not fewer facts.
7. Keep exam > course priority, honest time, no fake data and familiar utility UI.
8. During implementation, verify mobile/desktop, sparse/dense/long-name states, themes, keyboard and reduced motion in proportion to the change.
9. Update the scoped changelog and affected brief with what actually shipped. Mark remaining gaps; never imply that documentation changed the application.
10. Apply one bounded feature at a time. Do not “fix the backlog” as a side effect.
