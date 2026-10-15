---
version: 1
slug: "components-detailsheet-js"
primary_target: "components/DetailSheet.js"
related_targets: ["components/DetailSheet.module.css", "components/UniversityCalendar.js", "components/planning/PlanPopover.js", "components/planning/CourseOverview.js", "pages/profile.js"]
---

# DetailSheet — F03, local, not deployed

Mode: Operate. Keyboard/modal correction; preserve the incumbent visual design.

- A transparent native dialog owns modality only. Keep the existing mobile bottom panel / desktop centered panel, rounded corners, backdrop/flou, handle, sticky header, colors, shadow, internal scrolling and enter/exit classes.
- Show with `showModal()`, focus Close, keep Tab/Shift+Tab inside and delegate Escape through cancel/preventDefault. The native background remains inert throughout the existing exit presence. Repeated close requests during exit are ignored, but a busy consumer can still refuse a request.
- Retain the captured node through unmount cleanup. Close it and restore a connected opener when focus belonged to the sheet or has fallen to body after React DOM removal. Do not take focus from another dialog. A reopened sheet cancels the pending exit without re-opening/refocusing the native modal.
- The local CSS Module resets native dialog paint/geometry and locks html scrolling while that dialog is open. Do not overwrite body overflow: InboxSheet keeps its independent existing body lock.
- `onAfterClose` is optional and runs only after a normal completed close, never on unmount. Profile uses it for the existing handoff to ConsentSettingsPanel. No queued callback may open a panel after navigation/unmount.
- Six usages: Profile referral, preferences, account and privacy; UniversityCalendar; CourseOverview below its inline breakpoint. UniversityCalendar delegates its former local focus trap to DetailSheet. Planning popovers portal into their closest open native dialog, or keep body as before. Course actions close only the sheet before opening the existing day/form; inline desktop context and timer/data callbacks stay unchanged.
- Validation: 14 lifecycle/SSR tests, 65 relevant tests total, lint/build; real Chrome keyboard/AX/inert checks in FR/EN, both themes, 390/1440 and both motion modes. Four before/after pixel comparisons match exactly. Real local application flows cover 390/1200, all six usages, handoffs, route unmount and nested menus, plus a tactile long-content scroll and another native dialog remaining open. Safari, VoiceOver/NVDA and physical devices are unverified.
