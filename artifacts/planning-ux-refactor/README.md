# Planning UX refactor — review screens (2026-10-04)

Synthetic offline data only (fictional courses, objectives, exams and Canvas
events); no account, feed URL or real deadline. « Today » is pinned to Tuesday
6 October 2026. Desktop 1440×900 at 1×, phone 390×844 at 2×. `before-*` files
were taken from the code on `main` (ac9d2f0) with the same data, for comparison.

| File | What it shows |
| --- | --- |
| 01 / before-01 | Month: compact Today strip and quick-add bar, whole month in view; deadline counts at the foot of cells, no legend |
| 02 / before-02 | Week: seven one-line rows (load, objectives, exam, deadline count) — before: 2,400 px with « Academic deadlines » seven times |
| 03 / before-03 | Day: important deadlines → study plan with *Start* → other deadlines; one *+ Add* |
| 04 | Dense day as a sheet (six imported deadlines) |
| 05, 06 / before-05 | Imported deadline: popover with *Plan work* + « … » (source, type, course, hide) — before: an inline beige block |
| 07 | *By course* → course context in place (exam, before-the-exam facts, plan, deadlines) |
| 08 / before-08 | University calendar → Manage, from the « … » menu |
| 09 | First Canvas import: bulk exam confirmation (likely preselected, duplicate flagged, possible unticked) |
| 10 | Planning « … » menu (University calendar, Export, Share) |
| 11, 12 | Month and Week, dark, French |
| 13–22 / before-13 | Phone: Month, Week, Day, dense day sheet, deadline bottom sheet, Manage, course sheet, exam confirmation, dark French |
