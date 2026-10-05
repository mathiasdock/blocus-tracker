---
name: Blocus Tracker
description: Blocus makes studying tangible.
colors:
  canvas: "#F4F1EA"
  surface: "#FFFDFB"
  surface-subtle: "#F6F3EC"
  border: "#E9E3DB"
  text-primary: "#1F1A17"
  text-secondary: "#746C65"
  study-green: "#40916C"
  brand-primary: "#52B788"
  action-green: "#1B4332"
  mint-surface: "#D8F3DC"
  brand-ink: "#081C15"
  ink-text: "#D8F3DC"
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

The signature is how the product represents effort, academic context and earned outcomes—not a green card template. Time becomes accumulated material; courses retain identity; exams interrupt ordinary planning; progress has a destination; rewards are objects; shared course spaces start from the student's own courses. Utility UI stays quiet.

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

### Forest identity — 2026-09-27

Official palette: **#D8F3DC · #B7E4C7 · #95D5B2 · #74C69D · #52B788 · #40916C · #2D6A4F · #1B4332 · #081C15**. Warm neutrals, courses, university logos, terracotta exams, red pause, danger and achievement artwork retain their own meanings.

**One source:** `lib/colorTokens.cjs` generates `styles/colors.css` (`npm run colors:generate`); Tailwind references those CSS variables. Shaders, canvas exports, SEO, icon/splash/OG generators import this same source. The build checks that generated color sources are current. Do not edit generated CSS or copy brand hex/RGB values into a component. Generated assets and this documentation are the only literal mirrors.

| Role | Token / treatment |
| --- | --- |
| Hero action (Start/Resume) | Explicit `.btn-hero`: `--bt-brand-primary` #52B788 + `--bt-on-brand` #081C15; hover #40916C. Never a Dashboard ancestor override. |
| Standard primary (Save/Create/Join/Confirm) | `.btn-primary`: `--bt-action` #1B4332 + `--bt-on-action` white; hover #2D6A4F, pressed #081C15. Dark theme adds an inset boundary. |
| Secondary (Focus/Add) | Brand surface + brand text + brand border; `.btn-secondary` supplies color without dictating geometry. |
| Tertiary | `--bt-brand-text`, no large surface. Neutral utility controls stay neutral. Destructive stays `--bt-danger*`. |
| Brand surfaces | `--bt-brand-surface` #D8F3DC, strong #B7E4C7, border #95D5B2; `--bt-brand-deep` #1B4332 and deepest #081C15. |
| Selection | `--bt-selected-bg/text/border`: independent semantic values; not a success state. |
| Success / presence | `--bt-success/bg/border`, `--bt-status-active/text`. Never borrow brand-primary for completion or online status. |
| Progress / level | `--bt-progress-*`, `--bt-level-bg/text`; ratios/XP, not chart series. Ink tracks use the explicit `--bt-progress-ink-gradient`. |
| Historical data / heatmap | `--bt-data-study`, `--bt-data-goal-met`, `--bt-heatmap-rgb`; independent of the brand even when a palette value is shared today. Course-series still use saved course colors. |
| Own messages | `--bt-message-own-bg/text/muted`: readable surface/text pair, never white on bright green. |
| Ink / Focus | `--bt-ink/ink-soft/ink-text/ink-muted`; Focus palette and overlay are centralized. A dark veil keeps text readable through the moving lights. Pause remains red. |

Dark theme: interactive text becomes #95D5B2; soft brand/selected surfaces become #1B4332 (strong #2D6A4F), border #40916C. Hero foreground stays dark; primary foreground stays white. Do not place a dark-mode light text token on a fixed white surface. Warm background/surface colors stay unchanged; small neutral metadata uses #746C65 in light / #9E958D in dark to remain readable. `--bt-text-4` stays decorative/disabled, never essential copy.

Keyboard focus is a **two-tone ring**: `--bt-focus-ring` #2D6A4F in light / #95D5B2 in dark, separated by `--bt-focus-gap`. Ink surfaces use `--bt-focus-on-ink` #95D5B2 with a darkest-green gap. Keep this visible through overflow and on modal surfaces; hover alone is not focus. Disabled opacity is separate from selected/success.

Legacy `--bt-accent*` and `--bt-mint*` are compatibility aliases, not another palette. New code must choose a semantic role. See [docs/color-system.md](docs/color-system.md) for mapping, contrast checks, exceptions and asset regeneration.

### Semantic roles

| Meaning | Existing source | Boundary |
| --- | --- | --- |
| Brand / action / selection | `--bt-brand-*`, `--bt-action*`, `--bt-selected-*` | Differentiate action, selection and information; success and data have independent tokens. Bright green is not a default text color. |
| Course identity | Saved `course.color`; palette in `lib/courseColors.js` | Follow the course, never task completion or urgency. |
| Exam priority | Planning `--bt-exam-*` in `styles/planning.css` | Warm sand surface and compact terracotta calendar stamp; independent of danger and pause tokens. |
| Error / destructive action | `--bt-danger*` | Error copy, warning/action semantics; no exam marker. |
| Paused Timer | `--bt-pause*` in `styles/globals.css` | Attention state, **not** an error. Timer surfaces only — card, digits, badge, in-progress unit ring, Focus field. Never borrow it for failures, and never borrow `--bt-danger*` for a pause. See § The Paused-Timer Exception. |
| Routine interface | Surface/text/border `--bt-*` roles | Search, settings, back, fields, ordinary messaging. |
| Achievement artwork | `lib/badgeArt.js` illustration palette | Inside objects only; no random colored UI panels. |
| Course spaces | Saved `course.color` marker + semantic roles in `styles/course-spaces.css` | The student's personal course marker is the only identity color, and only through a real course link. No kind palette (the `--bt-kind-*` tokens were retired with the academic-space directory on 2026-09-17). |
| University / mascot | Real logo / existing character artwork | Preserve asset colors; do not leak them into surrounding controls. |

**The Meaning Rule.** Every strong color must answer “what does this mean?” No answer means neutral UI. Planning's semantic exam tokens derive from its warm palette; reuse that vocabulary in future scoped exam work, not new per-page shades.

### Course Colors — academic identity

A saved course owns its hue across Timer, objectives, Planning, Stats and Activity. Two courses can share a hue; names still distinguish them. No course or an unavailable color means neutral, not an invented identity.

| Context | Rule |
| --- | --- |
| Light surface | Original hue in a marker or chart; light derived tint for a larger region, neutral readable text. |
| Dark surface | Preserve hue identity; adjust tint/marker luminance only as needed for contrast. Do not recolor the entire course green. |
| Selected | Preserve course hue; add a check, outline or selected control state independent of the course fill. |
| Calendar: one course | One uniform course tint across the cell. Current 28% light / 26% dark opacity gives upcoming study days a visible presence; past days with all objectives completed use a slightly quieter 21% / 19% tint. |
| Calendar: multiple courses | One representative tint, selected deterministically by planned minutes and stable ID tie-break. Other identities remain in day detail and the Week load band. No diagonal split or rainbow; the tint alone does not quantify time share. |
| Charts | Course hues identify series; labels/values and a shared scale carry quantity. Never change series colors with sort order. |
| Activity | **Surfaces (2026-09-23, user request):** each day is one surface card (day title opens it), composer and sharing settings sit on their own surfaces; an accomplishment gets an accent wash inside the day card. Two registers. **Ordinary study is one row** — person, course marker, duration, time — with no card, no shadow, no level pill, no icon tile. **An accomplishment is the product's own object** (BadgeIcon, StreakEmblem, LevelSeal) and may interrupt the timeline. Preserve an existing historical event snapshot if no reliable live course reference exists. |
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
- Fix contrast, role, wrapping and spacing before blaming the font. The forest migration strengthens secondary text; tiny labels and protected artwork still require context-specific checks.

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

Completed time is filled; a live measured fraction is partial; paused time stops accumulating and uses an explicit pause state (§ The Paused-Timer Exception), not an exam/error marker. A paused unit keeps its earned fill in the ordinary colour — the time was studied; what is wrong is that it stopped growing — and carries the warning on its ring. Planned time is an outline/unfilled allocation labeled “planned,” never shown as earned. Unknown duration stays unknown; completing a checklist does not prove time studied.

**Blocks are quantities; progress bars are ratios.** A labeled time-target view may show studied units against planned capacity because both are durations. Do not turn “3/5 objectives” or “40% setup” into study blocks. Do not duplicate the same duration as blocks, a bar and a percentage without a different question. No target means no invented empty capacity. Over-target time remains in the total even when a goal track stops at 100%.

### Exams — interrupt the ordinary system

**EXAM STATE > COURSE COLOR.** The shared marker is a compact **calendar stamp** with an explicit “Exam” label, followed by the date/event identity. Its straight-edged terracotta plate reads as a fixed academic milestone, without a vertical rail or an error-like pink wash. Use the warm sand Planning surface behind it; color reinforces the calendar glyph and label rather than carrying meaning alone.

- Month cell: exam header/marker and date remain visible; warm treatment owns the cell. Course identity is a small named/dotted secondary signal. No competing course-colored background.
- Mobile/narrow cells: preserve the calendar stamp, plus the count for multiple exams. The full Exam label stays accessible to assistive technology when visually omitted for lack of space; day detail exposes names/date/time without hover. Never truncate the exam identity into an ambiguous fragment.
- Day/Week/list/Activity/course space: reuse the same header vocabulary at the available size. A date-bearing mark can include the actual date; never fabricate a date. In a course space an exam date exists only as a message a student shared (`PlanningExamMark` + warm exam tokens, scoped to `.bt-course-room`); it enters Planning only on the reader's own course, by their action, and is never presented as a consensus.
- Today and selection remain independently visible, for example on the date indicator/outline; neither replaces the exam treatment.
- Multiple exams: one marker with count and accessible event names, not stacked stripes. Other objectives remain secondary and available.
- Error/delete UI uses its own icon, action and message; a warm exam is not an error.

`PlanningExamMark` carries this stamp across Planning and course rooms. Month relies on course tint, planned titles and a compact planned-time figure (computer only); the measured workload band belongs to Week, where days can be compared on a shared axis. In Week, the exam chip carries the warm surface rather than repeating it on the entire row.

### Planning — one system, three questions

Refactored 2026-10-04 (Mathias's brief): the Planning separates what the university **imposes** (exams, imported deadlines), what the student **chooses** (study objectives, with the bridge to the Timer) and the **overview** (Today strip, *By course*). They never share a visual form: an exam is a stamp on sand, an imported deadline is a quiet text row, an objective is a checkbox row with its course dot and a labelled *Start*.

- **Day = act.** One day plan, shown in place (Day view) or as a sheet (from Month/Week): important academic items first (exams, exam candidates, major work), then the study plan, then small deadlines. One *+ Add* (study objective / exam); each row's secondary actions in its « … », delete last and red.
- **Week = balance.** Seven one-line rows (two on a phone) on a shared left edge: load band + exact total, objective titles, exam chip, a deadline *count*. No repeated section headings. The hour grid stays folded behind « Scheduled times · N » until asked for, and then only spans the hours actually used.
- **Month = anticipate.** One cell anatomy: date (+ planned time on a computer), exam stamp, up to two objective titles, imported deadlines as a count at the foot. Never imported titles; no legend.
- **Calendar first.** The Today strip (ink, the brand moment) and the quick-add bar are compact so the calendar starts high; on phones the strip is about a quarter shorter (exam stamp beside its name), with the same facts: date, objectives, time left, next exam and its day/time. University calendar management, export, sharing and *Duplicate week* (Week only) live in the « … » menu. Its dot (`--bt-warning`) means only « your action is needed »: a course to match, imported exams to review, a feed whose sync fails. Never a passive state — shared, connected, a loading hiccup.
- **Actions.** One primary per surface (`.btn-primary`); secondary actions outlined or plain (`.bt-plan-action--outline/--quiet`), never another filled beige block; destructive actions red, separated, confirmed when irreversible. Floating actions use `components/planning/PlanPopover` + `PlanMenu`: an anchored popover on a computer, a bottom sheet on a phone, Escape for the top layer only, focus returned to the trigger.
- **By course** summarises each course in one line (next exam countdown + what is planned before it, or this week's deadlines) and opens the course's context — exams, objectives, work to reschedule, deadlines. Its primary action follows the course's state: objectives planned → *Start studying* (secondary *Plan revision*); nothing planned → *Plan revision* (secondary *Start studying*). It is not a third task list: study work is planned as objectives. The Timer's course card no longer creates revision-checklist items — it sends to Planning; an older checklist stays readable there, nothing is deleted.
- **One exam, never asked twice.** An imported event already linked to an exam, marked as an exam, or landing on the same day as one of the student's exams for that course is never a possible/likely exam or a deadline again. *Mark as exam* has one meaning everywhere: after a confirmation it creates the real exam (mapped course and date) or links the one that already exists — never a label alone.

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

Three permitted modes:

1. **Event:** reaction to a real achievement/context change, using existing event identity, deduplication and frequency rules. Short reaction, not explanatory paragraphs; ordinary session posts do not automatically earn a mascot.
2. **Persistent silent participant:** its position, state or relationship explains real personal progress. Stats' data-linked walker is the model. The user-approved Profile companion remains valid beside earned level/XP; do not copy its static stage to other pages as a default. A new persistent scene must explain what the character is doing with the data.
3. **Setup guide (sign-in, sign-up, onboarding only):** one short line per step, chosen by `lib/setupGuide.mjs`, spoken through `components/auth/MascotGuide`. It reacts — a gesture through `reactionKey` — only to something real: a new step, a name given (field left, never per keystroke), a university chosen, a course added; the first course is the celebrated moment. The line never carries something the form does not (an email address, an error). User-requested on 2026-09-23; it does not license a guide on other pages.

**Event coach (`presentation="anchored"`).** Mode 1 events that speak about one element (Study Blocks in the Timer and Focus, the next exam in Planning, weekly missions, other contextual moments of the same kind) use the coach — only when it adds context or motivation. No coach for a badge or a level: their own notification and animation already say it (Mathias, 2026-10-01). The coach: the character and a compact speech bubble read as one object — real tail aimed at the character, cream/surface bubble with forest text, radius 18px, drop-shadow silhouette like the setup guide, close button inside, two or three lines at most (≈ 252px wide on phones, 280px on desktop). The character is 84px on phones and 100px on desktop. It stands against the surface it talks about, in a placement predefined per surface and breakpoint in `lib/mascotPlacement.mjs` (on phones on or past the card's outer edge, on desktop preferably half outside it); collision handling stays simple: flip the bubble's side, keep a 12px margin, never leave the viewport, move the whole object above the tab bar. No search for free space on the page. It lives outside the layout (portal): nothing is reserved, nothing moves on close, it never covers digits, blocks, numbers, buttons or fields. On a saturated phone surface (Timer during a session, the Objectifs card) it may cover a secondary caption for its few seconds — agreed with Mathias on 2026-09-30; the covered caption fades out in place while the coach is shown (`data-coach-under`), so nothing half-peeks from under it. Motion: one entry (≈ 12px + fade), one short gesture played during it (≤ 380ms: hello, nod, chin-up, or the arms-up « cheer » pose for a success, with the 30-day flame when the streak earns it), the bubble just after; all done by ≈ 450ms, then stillness — no idle breathing, bounce or loop; reduced motion is a 140ms fade. One coach at a time; a Timer milestone goes first.

No mascot for filler, every empty state or repeated generic advice. Aim for one prominent character per visible composition; suppress/defer a competing event when a permanent companion already occupies it. Existing overlap is backlog, not permission to rewrite appearances now.

Keep meaningful text/values outside artwork. Hide duplicated decorative SVG from assistive technology. Respect reduced motion with the correct static value/state, suspend unnecessary offscreen/hidden work, and avoid continuous celebratory loops. Motion must never delay access to the result.

### Achievement Objects — rewards have an identity outside their container

Use an object independent of its host: compact metadata, profile collection, detail and Activity should refer to the same reward. Object artwork must survive on a neutral surface; a dark gradient card is not its identity.

| Object family | Contract |
| --- | --- |
| Badge truth | Which badges a student HAS comes from the server only: `lib/badgeTruth` (the `sync_my_badges` list ∪ `user_badges`, restricted to the catalogue). Profile, Badges and the level fallback read it; no screen may recompute an award in JavaScript and add it (Profile did until 2026-09-18 and announced 13/22 where the collection said 10/22). |
| Badge | Use the actual `BadgeIcon` by earned badge ID. Retain its recognizable locked silhouette; expose name and condition. Shared silhouettes need visible milestone/name distinctions, not halo strength alone. **One identity, one earning rule:** a badge is defined in `lib/badges.js`, awarded by the server (`sync_my_badges`) and stored in `user_badges`. A page may read, summarize and link to that collection; it must never compute its own conditions and draw them with `BadgeIcon` — Stats did exactly that until 2026-09-16 (nine local "badges", no XP, invisible on the profile). A local statistic that deserves recognition belongs in Records as a value, or becomes a canonical badge through its own server-side task. |
| Level | **Resolved 2026-09-18:** the Profile's Progression card is the reference — “Niv./Lv.” in small muted type above a large tabular numeral on the brand ink. `components/LevelSeal` draws exactly that (Progression header, Activity); the round medallion it briefly was is gone, because tapping the card with the big numeral led to a small circle. Level is the STATUS (numeral); XP is PROGRESS (`.bt-level-track`/`.bt-level-fill` in `styles/level.css`, one bar, no tick marks). `LevelPill` stays for inline metadata beside another person's name only. |
| Streak | One flame family derived from existing badge artwork, paired with a visible number + days. Ordinary count is compact; a milestone uses that same object, not an unrelated flame/card. |
| Study milestone / record | Only a real supported metric with value, unit and record/milestone label. Choose its object in a dedicated task; this document creates neither new records nor reward criteria. |
| Session / ordinary task | Compact duration/course or completion mark; not automatically a collectible reward. |

Rarity can have a restrained material treatment and a word, not a new UI palette. Preserve original artwork colors across themes. No generic gradient + uppercase eyebrow + huge number + confetti recipe. Celebrations are brief and exceptional. Activity reuses the shared objects through its structured renderer (done 2026-09-18, `components/ActivityTimeline`); preserve legacy text fallbacks and never infer achievements by parsing arbitrary captions.

### Course Spaces — your real courses first

`/communautes` answers one question: *which of my own courses connect me to students at my institution?* It is a list and a conversation, not a directory or a feed (`docs/course-spaces.md`, `.impeccable/surfaces/pages-communautes-js.md`).

- **Identity.** A course space carries the student's personal course marker (a 10–12px dot in the saved `course.color`), and only when an active personal course is linked to it; a space joined through search stays neutral. The two default spaces built from the profile carry a 40px mark whose SHAPE says what they are: a square plate for an institution — its real logo when the project ships one (`lib/universities.js`, on a paper plate so a drawn wordmark survives the dark theme), its initials otherwise — and an ink DISC carrying the initials of a program, because a program is a group of people and a round mark reads as people the way it does in every messaging app. A person's avatar stays the mint circle; the program disc is solid ink, so the two never blur. No generic course icon, no tinted tile, no invented pictogram, no kind glyph or kind color.
- **Text first.** Canonical title (or the institution's short name, or the program in the reader's language); *Ton cours : {personal name}* only when the words differ; member count only from 3 members; recency always labelled (*Dernier message 15 sept.*), never a bare date that could read as an exam date.
- **Green.** Actions (*Rejoindre*, send, *Ajouter à mon planning*), the selected row and unread counts — plus the mint own-message bubble, which follows the Friends chat grammar. Nothing decorative.
- **Uncertain match.** One sentence about the student's course with two answers of equal weight (*Oui* / *Non*); at most two at a time; a flat inset group, not a raised card.
- **Conversation.** The same thread and composer as Friends (§ Conversations, below): runs, the author's name above and avatar beside, one time label per exchange, own messages right in the mint bubble. A room adds only what is its own: the exam-date tool in the composer, *Charger les messages précédents* (the reader keeps their place), and report / block / delete in the message's « … ». No « Vu » (a room is open to a whole cohort) and no conversation intro (the room header already says where you are). Circles (marker, unread count, icon buttons) use a full radius; an institution's logo plate uses a radius of 0.26 x its size, the smallest shape that still reads as a crest; a program's disc is fully round. Destructive actions stay in menus.
- **Study actions are the only Blocus-specific actions.** *Étudier ce cours* is a neutral button that opens the Timer on the student's own course; a shared exam date reuses the Planning exam vocabulary. No presence, reactions, polls, consensus or social XP.
- **Empty and non-member states.** One truthful sentence, no illustration — and never a blank workspace: the institution space opens on a wide screen when no course space is joined yet. A non-member sees what joining means and one primary *Rejoindre*; messages stay members-only.
- **Layout.** Desktop keeps the full-height Social shell shared with Friends (list a third, room two thirds, one hairline). Phones: list inside the Social tab (the tab names the page, so the list title is for screen readers only), then the room full screen with its own back control and a composer that follows the keyboard.

### Conversations — like a messaging app

Every conversation reads like Instagram's direct messages (Mathias, 2026-10-02): private messages and study groups in `/messages`, course rooms in `/communautes`, and the signed-out preview of a room. One thread and one composer, `components/ChatStream` (+ `lib/chatThread.mjs`). Ordinary messaging UI: no study signature, no reward object, no course tint.

- **Thread.** Starts against the composer: a short conversation sits at the bottom, never at the top of an empty panel. It opens on its latest message, follows new ones while the reader is at the bottom, and never pulls a reader away from older messages; your own message always brings you back down; older messages loaded above keep the reader in place.
- **Time.** One centred time label opens each exchange (first message, 30 minutes of silence or a new day): `14:32` today, `Hier 14:32`, `Dim. 21:17` within the week, `27 mai, 14:03` earlier. No timestamp on every bubble; the full date shows on hover.
- **Runs.** A person's consecutive messages form one run with 2px between bubbles; the 18px corners where bubbles touch tighten to 6px on the speaker's side, a lone message stays fully round. The other person's 28px avatar sits beside the LAST bubble of their run (44px target, opens the profile); your own messages carry none. Groups and rooms add the author's name above the first bubble of a run.
- **Colour.** Own bubble keeps `--bt-message-own-*`; the other person's bubble is `--bt-message-other-bg`, a neutral that stays visible on the surface in both themes.
- **« Vu ».** Private messages only: a small `Vu` under your LAST message once the other person has opened it (`private_messages.read`, live through Realtime). Nothing while unread, nothing when the last message is theirs. Not in groups (who read what is only kept on each device) nor in rooms (open to a cohort).
- **Start of the conversation.** Private messages and groups only, when the whole history is loaded: 72px avatar, name, @username (or group, members) and one neutral action (*Voir profil* / *Infos*). A room's header already says where you are.
- **Composer.** One capsule, the same everywhere: attach (and a room's exam-date tool) on the left, *Envoyer* as brand text on the right, the app's focus ring around it. It grows to six lines; Enter sends with a physical keyboard and starts a new line on touch; sending keeps the focus in the field. A chosen file shows above the capsule with its name and a remove button (a room's exam date likewise).
- **Actions.** A message's actions (delete; in rooms report and block) live in a « … » beside the bubble — hover/focus with a pointer, tap on the bubble on touch — outside the bubble's width.
- **Height.** On desktop the panel never grows past the screen: the thread scrolls, the page does not. On phones the full-screen conversation follows the visible viewport, so the composer stays above the keyboard.

### Sign-in and setup — your space, filled in

Every page before the app — sign in, sign up, check email, forgot/reset password, onboarding with its loading, error and resume states — is one family (`components/auth/*`, `styles/auth.css`, `.impeccable/surfaces/pages-signup-js.md`; shipped 2026-09-22, reworked 2026-09-23). No photo and no white card around a form.

- **Ground.** One animated mesh gradient behind the whole family (`components/auth/AuthBackdrop` over `components/ui/GradientWave`, 21st.dev's Gradient Wave ported to JS), in the app's light colours only — `--bt-bg`, `--bt-surface` and the mint family — and the dark canvas with the ink greens in dark theme. Mounted once in `_app`, so sign-up → onboarding does not restart it. Very slow (about 1/14 of the component's default: barely drifts in ten seconds), half-resolution, 24 fps, stopped when hidden, a still frame under reduced motion, a still CSS gradient without WebGL. It is a ground, never an illustration: nothing sits on it except the frame.
- **Frame.** The app's own Quicksand wordmark top left, the other door top right on sign-up (*Déjà inscrit ? Se connecter*). Titles in Quicksand, controls in Nunito. Secondary text uses `#655E58` (light) so hints and labels keep 4.5:1 on the ground.
- **Sign in.** Title *Connexion*; a quiet Google OAuth action precedes the existing email/password form, without competing with its primary submit action. Directly under that submit action, a divider *Nouveau sur Blocus ?* and a full-width secondary *Créer un compte* remain visible on every width. Signup uses the same Google action and email divider. The provider redirects back to the existing setup journey, never around it.
- **Guide.** The mascot and its bubble (mascot rules, mode 3). The bubble is one silhouette — body and tail share drop-shadow filters, radius 18px like chat bubbles — and its line slides in when the step changes. Desktop: standing on the student's space (116px), or alone and larger beside the sign-in form (168px). Phones: 58px beside a one-line bubble above the title. Recovery pages keep it above a single centred column.
- **Three visible steps.** *Compte → Études → Cours*, named, as three short bars (in the top bar from 768px, under it on phones with the back chevron at their left). They map the server's five states (`setupStageFor` in `lib/onboarding.mjs`): an identity repair resumes on *Compte*, a university saved without its field on *Études*. Institution, field and year are one screen and one write; all three stay required.
- **Grouped rows.** A form is one surface of rows: the label above its value, inset hairlines, the control radius. The focused row takes the mint surface and its label the accent text; an error turns the row's label and message red inside the row. Two short answers can share a row (first and last name). Inside a row the row is the touch target, so the value line stays compact on phones.
- **The student's space (desktop only).** A light sheet on the ground — translucent surface, soft shadow, the ground faintly through it — drawn with the product's marks: avatar initial, name, @username, the institution's crest (`UniversityMark`), the program's disc, the course markers. It shows only what the student has answered, live as they type; what is still to come is a dashed outline of the same shape. Never study time, a Study Block or an example course — there is none yet.
- **Courses.** Type → Enter → the course lands in the list and in the sheet, the entry keeps the focus. A pasted list adds one course per line; a duplicate lights the course it repeats; Backspace on an empty entry selects the last course, a second one removes it. Rename in place (Enter saves, Escape cancels), colour on the dot, remove on ×, one edit at a time. Saves run one after another with a stable client id (Phase 1 idempotency); Finish waits for them and still needs one course. Automatic colours follow `COURSE_COLOR_SEQUENCE` (`lib/courseColors.js`) so the first courses get far-apart hues; the picker keeps the palette in hue order.
- **Green.** The primary action, the progress bars, the focused row, *Disponible*, the mint of the ground. Course hues only on real courses.

### Public site — the real product, told briefly

`/`, `/fonctionnalites`, `/guides`, `/faq` and the six guides share one header and footer (`components/landing/*`, `Landing.module.css`, copy in `lib/landingContent.js`; shipped 2026-09-27).

- **Real product only.** Screens are captures of a demo student (never an admin account), light theme, in the page's language (`lib/siteShots.cjs`, `scripts/capture-site-shots.mjs` → `scripts/generate-site-shots.cjs`). Progress objects are drawn by the app's own components. No user counts, testimonials or invented figures.
- **Short home.** Hero, one bento answering "why not just a timer", a compact phone/computer pair using real Chrono captures, rhythm, others, three questions, final call. Detail and long answers live on the indexable subpages, linked from the footer.
- **One raised button** (hero CTA). The final call uses the Hero face on ink; the header uses the standard primary.
- **Mascot, three times, each for a reason:** seated on the hero screen (reads, waves once when the screen has straightened, looks at the hovered CTA); the rhythm section, where its state follows the real `mascotState` thresholds (0 / 1 / 7 / 30 days); one celebration in the final call. No mascot elsewhere.
- **Motion** is transform/opacity only: the hero device straightens with scroll (native scroll timeline, flat without support), while its capture layers tell the session → Focus → reward → saved progression story in a 10 s CSS loop. The capture loop pauses outside the viewport or in a hidden tab. Reduced motion keeps one static active Chrono, a flat screen and filled underline blocks. The phone/computer pair is static.

### Admin — an internal tool, read fast

`/admin/*` (six pages: Today, Members, Activation, Inbox, Communications, System; shipped 2026-09-24, admin rebuild phase 3) is operate-only: it answers "what needs me now?" and "is this number true?". It is not a product surface and borrows none of the study grammar — no Study Blocks, mascot, course tints, reward objects or LIVE badges.

- **Source.** Every number comes from the `admin_*` read functions (v61 / v61_3); the page never counts or recomputes. When the base gives no rate (fewer than 5 people, window not over, unknown), the page writes the raw "n of m" or says why the cell is empty — it never invents a percentage.
- **Structure before containers.** Rows, tables and hairline separators. One surface per interactive group (a list, a table, a form), radius `--bt-r-inset`; never a card per number. Key figures sit in one strip divided by hairlines, not in tiles. `components/admin/admin.module.css` (CSS module: no global class).
- **Colour means state.** Neutral ink everywhere; red only for "to fix / destructive", green only for "done / active", the warning ink for "watch". A state is always a dot + a word. The only pill in the navigation is the Inbox count; filters are pills because they are filters.
- **Density.** 14px rows, 13px metadata in `--bt-text-2` (never the faint roles for essential text), tabular figures, 44px targets. Tables switch to two-line rows when their panel is narrower than 760px (container query), so the sidebar never forces a sideways scroll.
- **Irreversible actions** (suspend, delete, remove a reported message, send or cancel a notification, delete files or an announcement) always go through a confirmation that names the consequence; member actions keep the Phase 1 dialog with a mandatory reason.
- **Communications** (notification control centre, v62). Before any send, "who will receive it" comes from the server with the same rules as the send — targeted, each exclusion on its own line, eligible, known reachable devices — in the order the calculation applies them, so every subtraction adds up. Text is written in French with optional English (the French is the fallback) and previewed in both. Dates are typed and read in Brussels time. A number OneSignal does not reliably measure (clicks) reads "not available", never a zero.

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
| Canonical title with “Ton cours : ADV Strat” and the student's own course marker | Repeated course icons or kind-colored tiles with barely legible context |

### Gradual consolidation — not shipped by this document

| Priority | Existing mismatch / evidence | Acceptance in a future scoped task |
| --- | --- | --- |
| ✅ | ~~Timer capped `+N`; `TodayProgressCard` builds one cell per target quarter-hour~~ — shipped 2026-09-15 in `lib/studyBlocks.mjs` + `components/StudyBlocks.js` (Timer, Focus and Today share one scale; exact fractions; no `+N`; no invented capacity; Pomodoro rest has its own form) | Done. Remaining in this family: Stats' runway and the leaderboard still use their own encodings — Stats Phase 1 (2026-09-16) settled its bar semantics without touching either. |
| ✅ | Planning Phase 1: both diagonals removed; shared exam marker and semantic tokens; neutral objective chips | Shipped 2026-09-16. Exam read compatibility documented in `docs/planning-exams.md`. Month workload weighting and Week composition remain Phase 2. |
| ✅ | ~~Planning exam palette vs `--bt-kind-exam`~~ — resolved 2026-09-17 (Communities phase 2): the kind palette and undated exam spaces were retired; course rooms reuse Planning's exam tokens and `PlanningExamMark` | Done. Exam vocabulary now has one source (`styles/planning.css`), shared by Planning and course rooms. |
| ✅ / follow-up | Faint small metadata; bright-green/white selected text | Forest migration 2026-09-27 strengthens shared secondary text, supplies selected/message pairs and fixes `LevelPill`. Essential text pairs are regression-tested. Protected rank/badge artwork is not a blanket accessibility certification. |
| 2 | Level number / circular medallion / square celebration; multiple flames | Shared object family, compact variants, visible milestone identity |
| ✅ | ~~Stats hierarchy, local badges, podium medals~~ — shipped 2026-09-16 (Stats Phase 2). Personal analysis precedes social comparison at every width; the Stats-only badge universe is replaced by a read-only summary of the canonical collection; gold/silver/bronze no longer decorate study quantities (course breakdown, leaderboard). | `LevelPill` contrast fixed by forest migration; unused Stats badge entries in `lib/badgeArt.js` remain historical artwork. |
| ✅ | **Leaderboard podium, reversed on user request 2026-09-23.** The top three get a podium (2 · 1 · 3, first larger on an accent wash) with gold/silver/bronze on the RANK OBJECT only: a ring around the avatar, a numbered crown above it, and stepped podium blocks (gold tallest, centre) with an engraved numeral. Durations stay in text ink, never metal. Level is a small action-green bubble on the avatar's bottom-right, replacing `LevelPill` beside names in the leaderboard. Compare shows one big personal number per metric plus a single shared-scale strip (you = accent dot, uni/app = neutral ticks). | Keep metals off quantities; keep the strip starting at zero. |
| ✅ | ~~Stats ordinary bars~~ — shipped 2026-09-16 (Stats Phase 1). Three geometries now carry three questions and no longer look interchangeable: filled track with a destination = progress toward a target (the runway alone), filled track = share of a whole, bar with **no** track on a shared left edge = quantity compared on a stated scale. Study-by-course bar length and its printed percentage finally share one denominator; artificial 14 % / 3 % minimum fills are gone and zero draws nothing. Planning's `PlanningLoadBar` (2026-09-16) remains the week/month duration band this document allows, deliberately not a Study Block. | Remaining in this family: the leaderboard rows and XP ticks still use their own encodings, and the runway itself was deliberately left untouched. |
| 2 | Profile segmented controls vs `SegmentedGlide`; different sheet implementations | Consistent equivalent states; labels, focus trap/restore, Escape, targets and reduced motion |
| 2 | Profile permanent companion plus event mascot; decorative cover/stage details | Resolve competing characters and information-free emphasis only in an authorized profile task |
| ✅ | Tailwind color literals differed from CSS | Forest migration 2026-09-27: one color source, generated CSS, Tailwind aliases and shared raw exports. Historical changelog values are not runtime guidance. |
| 3 | Shared badge silhouettes; legacy Activity text; small academic context | Legible distinctions and graceful history; no fabricated structured data or proximity |

Documentation values for radii, dark surfaces and the old “card/border/gradient by default” guidance are reconciled here. The 2026-09-27 migration consolidates runtime **color** authority and semantic roles. It does not consolidate layouts, control geometry or artwork.

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
