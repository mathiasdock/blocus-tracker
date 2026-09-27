# Forest color contract — 2026-09-27

Color migration only. No navigation, layout, data model or study semantics changed.
`DESIGN.md` remains the visual authority; this file records the technical contract and verification.

## Source of truth

`lib/colorTokens.cjs` → `scripts/generate-colors.cjs` → `styles/colors.css`.
CSS loads before `globals.css`. Tailwind maps to CSS variables, not a second palette.
Shaders, canvas/OG exports and identity generators import the same CommonJS module.
`npm run build` refuses stale generated CSS, manifest colors or SVG fills.

Official palette: `#D8F3DC #B7E4C7 #95D5B2 #74C69D #52B788 #40916C #2D6A4F #1B4332 #081C15`.
Warm surface neutrals are unchanged. Secondary neutral text is darker in light mode and lighter in dark mode to remain readable.

## Roles and compatibility

| Previous usage | Governed role now |
| --- | --- |
| `--bt-accent`, local teal CTA fills | `--bt-brand-primary`; explicit `.btn-hero` for Start/Resume, dark `--bt-on-brand` |
| `--bt-action` | Standard primary, deep #1B4332 / `--bt-on-action`; hover #2D6A4F, pressed #081C15 |
| `--bt-accent-dark`, `--bt-accent-text` | Compatibility aliases of `--bt-brand-text`; dark theme lifts to #95D5B2 |
| `--bt-accent-bg`, `--bt-mint-surface` | Compatibility aliases of `--bt-brand-surface` |
| `--bt-mint-strong` | `--bt-brand-surface-strong` |
| `--bt-accent-border` | `--bt-brand-border` |
| `--bt-on-accent` | `--bt-on-brand` (dark text, NOT white) |
| Selected nav/filter/card | `--bt-selected-bg/text/border` |
| Success/accepted/available | `--bt-success`, `--bt-success-bg/border` |
| Presence/status | `--bt-status-active/text` |
| XP/goal/session progress | `--bt-progress-fill/strong/light/text`, on-ink and gradient variants |
| Historical time chart / goal-met bar | `--bt-data-study`, `--bt-data-goal-met` |
| Data tooltip / quantity wash | `--bt-data-surface/text` |
| Heatmap | `--bt-heatmap-rgb` with the existing intensity thresholds |
| Own message | `--bt-message-own-bg/text/muted` |
| Compact level object | `--bt-level-bg/text` |
| Dark brand scene | `--bt-ink/ink-soft/ink-text/ink-muted`, `--bt-ink-gradient` |
| Focus indication | `--bt-focus-ring/gap`, `--bt-focus-on-ink` |

Semantic success/status/progress/data/heatmap/message/level values are independent literals in the canonical file, not references to brand-primary. Sharing a hue today does not couple future changes. Course color remains the stored course value; exams remain in `styles/planning.css`; danger, pause, university and badge/character artwork remain separate.

### Actions

- Hero: #52B788 + #081C15, hover #40916C. Governed by `.btn-hero`, never by a Dashboard ancestor.
- Standard primary: `.btn-primary` / Auth primary, deep background + white. Inset brand edge in dark mode.
- Secondary: brand surface + brand text + brand border. Focus/Add remain secondary.
- Tertiary: brand text without a substantial surface. Feed low-priority text actions remain lightweight.
- Destructive/pause: existing danger/attention red, not green. Neutral close/back/utility controls remain neutral.

### Dark mode and focus

Dark brand surfaces become #1B4332/#2D6A4F, interactive text #95D5B2, selected text #D8F3DC. Dark ink scenes keep their own light text in both themes. Never use theme-relative dark text inside a permanently dark scene.
Keyboard focus uses a 2px ring with a contrasting gap; light pages use #2D6A4F, dark/ink scenes #95D5B2. The gap protects visibility against similarly colored controls. Component outline suppression must not remove the global `:focus-visible` treatment.

## Measured contrast

Ratios use sRGB WCAG relative luminance (automated in `tests/color-contract.test.mjs`). Essential text pairs are tested at ≥4.5:1; focus/data marks at ≥3:1 on their named surfaces.

| Pair | Ratio, approximately |
| --- | ---: |
| #081C15 on #52B788 | 7.15 |
| #081C15 on #40916C (hero hover) | 4.62 |
| White on #1B4332 | 11.08 |
| #2D6A4F on warm white #FFFDFB | 6.30 |
| #2D6A4F on #D8F3DC | 5.41 |
| #95D5B2 on #1B4332 | 6.56 |
| #D8F3DC on #1B4332 | 9.38 |
| Light secondary #746C65 on #F4F1EA | 4.57 |
| Dark secondary #9E958D on #1F1B18 | 5.81 |

Focus's animated forest is darkened behind text; its secondary copy uses ink tokens. Timer seconds retain subordinate size but no longer rely on 45% opacity. These checks are not a claim that all historical artwork is WCAG-certified. Disabled text, decorative marks and stored arbitrary course colors are not ordinary body-text pairs.

## Retired-color whitelist

No retired brand HEX/RGB remains accidentally in live UI sources covered by the regression scan. At least **210** retired-brand HEX/RGB references were removed from **36 source files** using the scan's explicit former forest/mint/teal set; shader float arrays and raster pixels are additional, not included in that count.

Legitimate retained values:

- `components/Mascot.js`: #14B885 scarf/character accent and #0B2E23 drawing ink. Character artwork, not UI brand.
- `lib/badgeArt.js`: the mint achievement object's #14B885/#7BE9C4/#0A6B4E family. Collectible artwork.
- `lib/courseColors.js`: #10B981 and #14B8A6; `lib/offlineSupabaseClient.js`: seeded Methodologie course #14B8A6. Stored academic identity, not brand.
- `lib/universities.js`: including #065F46 (ECAM), #059669 and #0F766E. University identity; logos unchanged.
- `pages/index.js`: #34D399 for a decorative browser traffic light, part of the red/yellow/green window convention.
- `pages/planning.js`: #14B8A6 / RGB 20,184,166 in a course-color parsing example comment, not a UI fill.
- `supabase/schema.sql` and SQL tests: legacy course default/fixtures #10B981; no data migration.
- Historical `AI_CHANGELOG.md`, `.impeccable` briefs/audits and old documentation retain historical values. New DESIGN guidance supersedes those values.
- Original raster captures in `public/site-web/` and unused optimized `focus-mobile.webp`/`stats-mobile.webp` remain historical assets. The nine images actually referenced by the public homepage are refreshed. University logos and badge/mascot rasters are protected artwork.
- Color regression tests necessarily spell the retired values to prevent their return.

## Assets and regeneration

```sh
npm run colors:generate
node scripts/generate-icons.js
node scripts/generate-splash.mjs
node scripts/generate-og.js
node scripts/generate-marketing-shots.cjs /path/to/inspected-captures
```

Icon silhouette and beige hand are unchanged; only brand fills changed. Eight PNG identity outputs, 38 iOS splash outputs and the OG image were regenerated. Manifest/meta theme colors follow the contract (primary in light, deepest in dark/Focus). Favicon, install icons and splash URLs are versioned to refresh browser caches. OS-installed icons may still require the normal OS refresh/reinstallation lifecycle; the served assets are updated.

The nine marketing WebPs are real browser captures of this version using local demo fixtures, not AI illustrations or pixel recoloring. Their URL version is bumped; layout and image frames are unchanged. No production data was written. StudyRecap's canvas palette also imports the contract; actual badge and mascot artwork stays intact.

## Verification record

Browser QA used isolated `NEXT_PUBLIC_OFFLINE_DEV=true` on port 3012; app data was local, not production. Captures were inspected at mobile 320/359/390 and desktop 1280/1440, plus existing marketing image sizes. FR/EN and light/dark were exercised.

- Desktop: Dashboard top/bottom, running timer, Focus, Planning with exam, Stats data/heatmap, Profile, Activity, Friends/conversation, Communities, Admin, Login/Signup and public homepage.
- Mobile: Dashboard/navigation, Focus running/paused, session summary, Stats, Planning exam and keyboard focus, Activity/Friends, Login/Signup, public homepage.
- Interactions: start, pause/resume, finish/save success, goals/selected navigation, dark theme, language switch, local message send, Planning exam detail, chart range, input focus and validation error. Red pause/errors and course/exam colors retained.
- Focus and primary/secondary/own-message pairs have automated contrast coverage. Hover/pressed/disabled rules are checked in source; disabled and keyboard-focused controls are included in rendered inspection.
- Screenshots: local evidence directory `/tmp/blocus-forest-qa`; representative public captures are committed under `public/site-web/opt`.

Run `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`. No backend migration, package dependency addition or behavior redesign is part of this work.

Result: **404 tests passed**, lint clean, production and offline builds successful. The production build still warns that a ~3 MB chunk is not precached; this cache-size policy was not changed by a color task. The isolated worktree intentionally has no production Supabase credentials, so production-build configuration notices are expected; authenticated UI verification uses the existing offline fixtures, not a live backend/auth audit. Physical iOS installation/cache refresh is not simulated by desktop Chrome.

## Future maintenance

Do not hardcode a brand HEX/RGB in components. Choose a semantic role, update the canonical file only when needed, regenerate, and run the contract test. Do not use brand-primary as a blanket replacement for study data, success, course identity or exams. A new palette must not recolor stored user data or collectible artwork.
