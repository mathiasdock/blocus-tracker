# Step 3 visual review

Offline synthetic fixtures only. Captured 2026-10-02 on
`codex/university-calendar-foundation`, before the Step 3 commit.

| Scenario | Desktop | Mobile |
| --- | --- | --- |
| Month: exam + 3 deadlines | [Normal](month-normal-desktop.png) | [Normal](month-normal-mobile.png) |
| Month: 90 events, 10 today | [Dense](month-dense-desktop.png) | [Dense](month-dense-mobile.png) |
| Month: French / dark | [Dark](month-dense-dark-desktop.png) | [Dark](month-dense-dark-mobile.png) |
| Week | [Week](week-desktop.png) | [Week](week-mobile.png) |
| Day sheet: mapped + unmapped | [Day detail](day-detail-desktop.png) | [Day detail](day-detail-mobile.png) |
| Day view | [Day](day-view-desktop.png) | [Day](day-view-mobile.png) |
| Possible exam / unmapped | [Possible exam](possible-exam-desktop.png) | [Possible exam](possible-exam-unmapped-mobile.png) |
| Possible exam / French dark | — | [Possible exam](possible-exam-dark-mobile.png) |

Desktop 1440 px, mobile 390 px. Additional overflow verification at 320 px.
Small-screen Month abbreviates only the deadline label (`due` / `éch.`); each
cell's accessible label retains the full wording. Details show the full titles.
The fixed bottom navigation is the existing app navigation.

Behavior checked: explicit confirmation changes only the override; mapping uses
an existing course; Plan work starts with empty duration and writes only after
student submission; hiding normal items does not delete imported rows.

Full tests: 621 passed. Lint: clean. Production build: passed; existing 3 MB PWA
precache warning remains. No push, remote migration or deployment.
