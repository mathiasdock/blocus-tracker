---
version: 1
slug: "components-filtermenu-js"
primary_target: "components/FilterMenu.js"
related_targets: ["tests/filter-menu.test.mjs"]
---

# FilterMenu — F05, local, not deployed

Mode: Operate. Utility UI; retain the shipped appearance and all caller contracts.

- Value selection uses `listbox`/`option` and controlled `aria-selected`; actions use `menu`/`menuitem`, including existing destructive actions. Focus and selection are distinct. Only native button activation calls the existing callback, never navigation or typeahead.
- Opening selects the current option for focus (first if absent), or first/last command with Down/Up. One roving tab stop; Up/Down, Home/End and label typeahead move focus and reveal the item by scrolling the menu only. Enter/Space retain native activation; repeat is suppressed. Escape restores the trigger. Tab/Shift+Tab rebase browser traversal on the trigger, close and leave naturally without a trap.
- External value changes reconcile focus/ARIA. Reordering retains the focused identity; removal or an empty/repopulated collection falls back safely. Do not keep an obsolete callback or change the controlled value while browsing.
- Ignore internal scroll and queued page scroll with no movement since opening. A real exterior scroll, resize, outside pointer or outside focus still closes. Outside interactions never steal focus. Keep the existing fixed placement, edge clamping, overflow escape, 44 px classes, colors, shadows, typography, icons and transitions. Only overscroll containment is added, without visual styling.
- Portal into the trigger's closest `dialog[open]`, otherwise body. This avoids an inert body portal in native DetailSheet/InboxSheet without changing those components. The portal is a sibling of the animated panel, not inside its transformed content.
- Thirteen call sites: ChronoCard (four), Leaderboard (three), StudyTimeChart/StudyByCourse (two), messages (two), ChatStream and CourseRoom (one each). No caller, timer, Focus, Pomodoro, translation, session, XP, badge or server changes.
- Validation: 17 new unit/SSR/lifecycle tests; 82 relevant tests total; lint/build. Real Chrome: eight viewport/language/theme configurations with both motion settings represented; both modes, long scrolling options, dynamic values, keyboard, pointer/touch, native sheets, boundaries, and four exact before/after pointer pixel comparisons. Additional tests cover resize, held activation, empty/repopulation and unmount. Actual local guest Dashboard/public Pomodoro flows cover 390/1440, FR/EN and both themes. Safari, spoken screen readers, physical devices and authenticated messaging flows remain unverified.
