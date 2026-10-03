# Calendar UX review — local synthetic data only

2026-10-03. Captured at `/dev/university-calendar` → `/planning` with
`NEXT_PUBLIC_OFFLINE_DEV=true`. No production writes or private feed used.

- `day-six-desktop.png`: 1440 px, six academic events; five share one mapped course.
- `event-desktop.png`, `event-mobile.png`: expanded event, no select/Save forms.
- `overflow-mobile.png`: secondary actions only after opening the overflow.
- `manage-mobile.png`, `manage-desktop-dark.png`: controls inside Manage.
- `hidden-mobile.png`: hidden event after a manual fixture sync, before Restore.
- `possible-exam-mobile.png`, `possible-mobile-dark.png`, `possible-desktop-dark.png`:
  unconfirmed Test 1, neutral styling, Confirm exam / Keep as deadline.
- `day-dense-mobile-dark.png`: scroll position focused on academic events; mapped
  course identity appears once, all events remain individually expandable.
- `month-dense-mobile-dark.png`: compact semester counts, no Canvas title flood.

The browser verified hide → sync → restore, a visibility choice after reload,
explicit confirmation with zero local exams created, Add → Study objective and
Plan work with a blank duration. Desktop 1440, mobile 390, overflow check at 320.
