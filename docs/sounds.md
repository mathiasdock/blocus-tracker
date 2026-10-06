# App sound effects

Effects use the five existing local MP3s in `public/sounds/` through
`lib/sensoryFeedback.js`. Do not add automatic sound to success toasts.

## Audible events

- Timer start, pause, resume; significant session/daily targets; saved session.
- Pomodoro work end; break end reuses `bt-resume.mp3` at gain 0.14. The visible
  phase changes to Work, a translated ready-to-resume hint appears, and the
  phase is a live status. Work does not start automatically after the break.
- Real badge/level/streak unlocks from the canonical global watcher only.
  Inspecting Profile or an earned badge is silent.
- Incoming DM outside Messages, received friend request/acceptance, comment,
  or important announcement. Minor reactions and informational announcements
  are silent. Initial unread history never sounds.
- Enabling effects in Preferences plays the existing short preview.

Ordinary checkbox completion, success toasts, profile saves, exports, copies,
publications, sharing and push activation are silent. Existing haptics stay
independent. Group timer controls use the same timer cues.

## Overlap and notification deduplication

- One active playback per MP3, including pending Web Audio resume. Suppressed
  requests are dropped, not queued. Web Audio, HTML Audio and synthesized
  fallback all release the same file lock; stale pending alerts expire after
  two seconds. Muting while resume is pending prevents delayed playback.
- Incoming alerts have a five-second minimum gap. Identity deduplication is
  in memory, bounded to 300 entries, not persisted as tracking data. Realtime
  DM and inbox snapshots use sender + server timestamp, matching the existing
  one-inbox-entry-per-sender model.
- The existing notification poll reads one bounded inbox page to establish
  the silent baseline and when the bell count changes. It reuses that page
  when updating an open inbox; no new polling loop, channel or database API.
  Existing count-based detection is not an exhaustive event stream: a burst
  beyond the page size, or events whose aggregate count stays unchanged,
  need not produce individual alerts. The DM channel still provides immediate
  feedback. Quiet batching is intentional; business/read-state rules do not change.

## Settings and browser behavior

“App sound effects” / “Effets sonores” retains the `bt_sensory_v1` preference
and default. The Focus ambience engine, opt-in switch, volume and persistence
are completely separate and unchanged. Effects do not control OS push sounds.

Keep gesture-based unlocking, cached assets and offline synthesis. Sound is
supplementary: mobile suspension and browser autoplay policies can prevent it.
Do not promise a background alarm or remove visual/accessibility feedback.
