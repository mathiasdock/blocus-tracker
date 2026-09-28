# Admin — control center

Mode: Operate. Visual hierarchy and layout only; existing `admin_*` data, actions, permissions and metric definitions remain authoritative.

## Reading path

- **Today:** four existing seven-day answers first (active members, new accounts, activation, studied hours), each with its existing comparison or cohort context. Attention follows as a graded list; on narrow screens a compact jump exposes its count above the KPIs. This is a navigation cue, not a new metric.
- **Members:** search, sort and export form one control area; all segment filters remain available. Activation status is explicit in desktop table and mobile rows. The member drawer separates ordinary actions from suspension/deletion, then pairs Account/Activation and Study/Courses before Social, Notifications and recent history.
- **Activation:** the two existing publishable rates and account count are the opening summary; funnel, cohort table and feature usage retain their original sources, denominators and order. Campaign acquisition is a separate compact table after cohorts: visits and first-touch signups are directional, while activation/return reuse `admin_member_facts` and only show rates for mature groups of at least five.
- **Communications:** composer on the left; the right-hand validation panel groups actual audience, preview and primary Send action. Test remains secondary. No additional send path exists.
- **System:** jobs and notification health share the first row; slow-function states precede the more neutral anomaly inventory. Storage's meter uses the existing used/cap bytes only. Audit history remains last.
- **Inbox:** report rows carry restrained attention emphasis; empty/loading states and actions are unchanged.

## Visual rules

- Critical, warning and neutral states always have text, not color alone. Red is for failed/near-timeout/destructive; amber for attention; forest green for selected/healthy action. Neutral tables remain the densest layer.
- KPI cards are reserved for the few numbers that answer an immediate operational question. Comparisons stay physically attached to their values; unavailable rates remain `n of m`, never recomputed.
- No new palette or dashboard illustration. Use existing `--bt-*` tokens, visible keyboard focus, and the current typography. On small screens, reflow the same information rather than hiding it.
- This surface is more analytic than the student app, but still belongs to its warm-neutral/forest visual system.

## Verification

Reviewed the local offline Admin fixture in the browser: Today, Members and member drawer, Activation, Communications, System and Inbox on desktop; Today and Members at 320/390 px; System at tablet width; light/dark states. Checked real clickable navigation and drawer open/close paths without sending or deleting anything. Node tests, lint and production build are the release gates for this visual-only pass.
