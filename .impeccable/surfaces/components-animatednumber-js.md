# AnimatedNumber

Mode: Operate. Shared numeric text; preserve the existing visual animation.

## Contract — F01, 2026-10-14, LOCAL NOT DEPLOYED

- The generic outer span preserves its classes and inline style, without an ARIA name or widget role.
- Exactly one `sr-only` text child exposes the formatted final target, including prefix/suffix. It updates with the target or formatting props, independently of animation frames.
- The existing animated child stays `aria-hidden="true"`. No live region is added; an existing hidden ancestor still suppresses the entire value, and an existing status region gets stable final text.
- Preserve `value`, `duration`, `decimals`, `prefix`, `suffix`, `format`, `className`, `style`, normalization, rounding, easing, frame cancellation and reduced-motion behavior. Server markup is deterministic and exposes the final accessible text before hydration.
- Consumers: Dashboard/TodayProgressCard, Planning TodayCard, StatsHero, XP Progression, Badges counter, Profile referral sheet, Leaderboard ordinary rows and SessionCompleteCard. Adjacent goals, denominators and units remain outside the component where already authored.
- Validation: 17 component tests, 82 relevant tests total, lint/build; real Chrome accessibility tree and hydration in both languages/themes, mobile/desktop and both motion preferences. Six local application pages use entirely simulated data. VoiceOver/NVDA, Safari and physical devices are unverified; browser accessibility-tree checks do not claim audible screen-reader verification.
