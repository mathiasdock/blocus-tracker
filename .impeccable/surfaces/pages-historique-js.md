---
version: 1
slug: "pages-historique-js"
primary_target: "pages/historique.js"
related_targets: ["hooks/useSessionHistory.js", "components/TodaySessionsCard.js", "lib/i18n.js"]
---

## Scope and visitor mode

Operate. Session history reuses the existing daily session cards, their rows,
menus and edit/delete behavior. This brief records only the F16 read-error
correction, implemented locally on 2026-10-14; no redesign or deployment.

## Read contract

- A successful empty first page alone enables the existing empty state.
- A failed read shows an inline translated alert and the existing ghost
  Retry button, without an extra card. Initial/reset errors appear above the
  list; pagination errors follow it. The shared compact LoadingScreen remains.
- Known sessions, their shown totals and the last successful pagination state
  survive a failed read. If they belong to the previous course filter, a
  translated status says so; they are never appended to the new filter.
- Retry repeats a reset from offset 0, or an append from the current number
  of known sessions. Synchronous duplicate reads are ignored while pending.
- Request generations and account/filter identity reject late responses,
  including A → B → A, account changes and unmount. An account never sees
  the previous account's known sessions while its own read is pending.
- Preserve 25-row pages, `started_at DESC, id DESC`, all courses in the filter
  (archived included), and active courses only for the existing edit picker.
  No session write, statistical/XP/streak calculation or mutation handler is
  changed by this read contract.

## Local verification

17 new tests execute the real page and read hook with controlled responses;
53 targeted tests pass including historical preservation and session-day
contracts. Lint and production build pass. A local REST fixture exercises
the real Supabase client and built page in Chrome: 64 states across
1440/390px, FR/EN, light/dark, including initial loading/error/retry,
success, failed pagination/retry, a failed archived filter with retained
rows, a late old-filter response and a truly empty account. Retry has a 44px
target, keyboard focus, and remains reachable above the mobile bar at the
bottom of the page. No horizontal overflow or page exception observed.
No remote data, physical iPhone/Safari or screen reader was tested.
