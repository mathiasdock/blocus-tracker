---
version: 1
slug: "components-userprofilemodal-js"
primary_target: "components/UserProfileModal.js"
related_targets: ["components/UserProfileModal.module.css", "components/InboxSheet.js", "lib/socialProfile.mjs"]
---

## Scope and visitor mode

**Operate**: recognize another student and take the appropriate social action.
Preserve Blocus typography, forest tokens, course identity and badge objects.
This is a compact peer profile, not another Stats page or the owner's profile.

## Content and authority

- Public authenticated profile fields: avatar, name, username, university,
  studies and existing bio. Level/title, current streak and badge count come
  only from the existing `get_gamification_levels` aggregate. No private-data
  fallback to recompute XP/badges/streak.
- Existing RLS makes `get_user_profile_stats` and courses friends/self-only
  (admin privileges must not widen this social UI). Last-30-days study time
  uses that RPC's `seconds_30d`; the modal does not redefine the date window.
  Do not expose this metric or courses to non-friends without separate approval
  and an appropriate privacy model. Pending requests are not friendships.
- Courses: three chips plus `+N`, neutral readable labels and actual color dots.
  Shared courses first, marked in text. Matching requires a normalized name
  AND the same known academic affiliation; saved exchange institution wins
  over home university. No shared-course claim when context is ambiguous.
- Badge highlights: at most three unique recognized badge objects from
  explicitly visible, structured `badge_unlocked` Activity posts. Honor public
  vs friends visibility and post RLS. Label **Shared achievements**, not a
  complete/recent earned collection. `user_badges` remains private; no new
  permission, badge inference, earned-date query, or fake unlocked teaser.
- Missing/error data is unavailable, not zero. Real zero values remain visible.
- Never fetch/render sessions, timestamps, presence, objectives, exams,
  deadlines, calendar or last-active time on this surface.

## Actions and layout

Identity → academic context → primary social action → concise aggregates →
courses → shared achievements. No nested metric cards or large Close footer.
Non-friend: Add as friend. Incoming pending: Accept. Outgoing pending: disabled
request state, cancellation in options. Friend: Message using the existing
`/messages?dm=` route; removal in `…` with confirmation. Remove friends-only
content immediately after confirmed removal. Mutation lock prevents duplicates.

Reuse the native `InboxSheet` for focus containment, Escape, background inertness,
focus restoration and reduced-motion exit. Profile-specific mobile positioning
anchors to the bottom under 640px; safe-area padding and inner scrolling remain
shared. No extra mascot or repeated badge-unlock animation.

## Verification and exclusions

Offline-only `/dev/user-profile` supplies friend/stranger/incoming/outgoing,
empty and long-name cases; production responds 404. FR/EN, light/dark,
320/390/1280/1440, keyboard and existing Message integration are checked locally.
No schema/RLS change, production test accounts, deploy or broader profile redesign.
