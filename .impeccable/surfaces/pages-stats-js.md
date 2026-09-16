# Stats

Mode: Operate. Refinement of the existing Blocus statistics page, not a new identity.

## Reading path

The hero answers "where am I in today's study day" and carries the mascot walking the daily goal. Below it, one wide column holds what needs room (time chart, study by course, consistency + year heatmap) and a shorter rail holds personal context (one insight, leaderboard, percentile, comparison). Advanced analysis stays folded.

## Decisions

- The mascot on the goal runway is the page's signature and is protected: it is the documented "silent participant" mode, positioned by the same ratio the accessible progress value reports. It does not spread to other Stats sections.
- **Semantic states read exact values, never rounded ones.** 119 min 24 s is not a reached 2 h goal: `StatsHero` derives `reached` from seconds and `ariaPct` never reaches 100 before the target. Display may round; state may not. Over-target time stays visible in words while the track caps at 100 %.
- **Labels say what is measured.** A session stores a start time and a duration — not attention, not preference. Hence "jour le plus étudié" and "heure la plus étudiée", never "préféré" or "productif". No productivity scoring exists or should be invented.
- **Clock time is attributed to the hours it actually spans** (`spreadOverHours`): a 17 h → 20 h session is one afternoon hour and two evening hours. The `afterMidnight` / `earlyBird` badges deliberately stay keyed on the START hour so no badge is granted retroactively.
- **Average start time is circular** (`circularMeanMinutes`): 23 h and 1 h average to midnight, not noon. Starts too scattered for a habit return `null` and the row shows "—" rather than an invented hour.
- **Three bar geometries, three questions, and they must not be interchangeable.**
  - *Target progress* — filled track whose length is the target: the hero runway only.
  - *Share of a whole* — filled track (the whole) with the part drawn in it: study by course, time-of-day slots, active days in the window. Bar length and the percentage printed beside it share one denominator.
  - *Quantity on a shared scale* — no track at all, bars resting on a common left edge, scale stated in words: social comparison, archived courses.
  A filled track reads as "x % of something": use one only when that something exists.
- **No artificial minimum fill.** Zero draws nothing. A real but tiny value keeps a two-pixel floor, which is rendering, not rounding — the same compromise as `.bt-block-fill` in the Timer. Value labels live outside the bars so layout never needs length reserved for text.
- **Durations aggregate from seconds, then format.** `formatStudyTime` never prints "0 min" for a positive duration; the heatmap sums seconds per day before choosing a level, so twenty studied seconds are a filled cell and not an empty one.
- **A failed read is not an empty account.** `loadFailed` renders its own message and a retry; the new-user empty state and its Timer link are reserved for accounts that genuinely have no session. No fake zeros.
- **Cohorts are named for what the query returns.** The percentile counts students who studied *today*; the comparison averages students who studied at least once in the last 30 days — not everyone signed up. "Top X %" is rank / cohort, so first of eight is top 13 %, never top 1 %.
- **Exact values are never hover-only.** The year heatmap is one tab stop with arrow-key navigation (← → a week, ↑ ↓ a day, Home/End), per-cell accessible labels carrying the exact duration, and a detail line under the grid fed by tap, click, hover or focus. A 53 × 7 grid cannot give 44 px targets; precision comes from selection plus arrows instead, and a mis-tap is visible and correctable.
- Recharts produces neither text nor focusable targets, so each chart is `aria-hidden` beside an `sr-only` list of its exact bucket values. The expanded chart is a real dialog: focus enters it, Tab cycles inside, Escape closes, focus returns to its opener (`useDialogFocus`).
- Compact controls keep their compact look and gain a 44 px interaction area through `bt-tap-44`, never by growing.
- A filter group is capped at its card's width and wraps under the title when its chips do not fit (320 px, or 375–390 px with a long period such as "7 derniers jours"). Wrapped rows are spaced 12 px apart so their 44 px tap areas touch without overlapping. Truncating a chip is not an option: its label is the answer to "what am I looking at".
- `bt-stats-readable` lifts `--bt-text-3/4` to `--bt-text-2` for this page: period labels, shares and cohort captions are information, and those tokens hold 2.5:1 light / 2.9:1 dark. A filter's current value is the answer to "what am I looking at" and reads in primary ink.
- No Study Blocks and no `PlanningLoadBar` here. Historical statistics use the simplest truthful representation of the question asked; borrowing another surface's object for visual consistency would claim a meaning these numbers do not have.

## Verification

Phase 1: browser on strictly offline fixture data at 320 / 375 / 390 / 1280 / 1440, light and dark. Cases exercised: 0, 20 s, 119 min 24 s, exactly 120 min and 195 min against the 2 h goal; sessions at 23 h, 00 h and 01 h; one course and five plus unassigned time; a zero and a tiny comparison value; an archived course with no hours; a forced read failure and its retry; a genuinely empty account. Keyboard: heatmap arrows, dialog focus trap, Escape, focus restore. Measured contrast of every secondary string on the page in both themes. Unit tests cover the circular mean, hour spreading, slot attribution, badge keying, second-first averaging and the sub-minute format.

## Deferred

Leaderboard placement, section reordering, redesigning the social comparison area, removing the percentile, the donut, badge consolidation with Profile, Advanced, hero redesign, XP progression, exam readiness and objective analytics belong to later scoped work. Known and untouched: `RankBadge` medal numerals and `LevelPill` sit below 4.5:1. The comparison RPC buckets active days in UTC.
