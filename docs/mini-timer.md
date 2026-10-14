# Mini-chrono · V1

Local implementation, not deployed. A desktop-only action in `ChronoFocus`
opens a real Document Picture-in-Picture window. No popup imitation or video
canvas fallback. Unsupported desktop browsers explain Chrome/Edge availability
in FR/EN; blocked requests explain that the session continues and allow retry.

## One timer

`FocusMiniTimer` renders a React portal from the existing Focus tree. It reads
the same `chrono` props sourced from `TimerContext` / the existing `useChrono`:
elapsed time in Free mode, the existing target minus elapsed in Pomodoro.
It creates no interval, timer provider, storage key, request or save operation.
The only PiP action brings the opener to the foreground and closes the view.
Native closing, returning and Focus unmount never pause/reset/save a session.
No XP, statistics, session, Pomodoro or sound behavior is changed.

Keep the opener tab open. Native PiP cannot outlive it; OS sleep/browser
suspension still follows the app's existing timer behavior and twelve-hour cap.
Leaving Focus closes the mini view without stopping the timer. It is not a
second app that continues a Pomodoro controller after its owning page closes.

## Browser boundary

- Desktop affordance: at least 768 CSS pixels, hover-capable fine pointer;
  no browser name/User-Agent detection. Touch/mobile layouts show no action.
- Capability: `window.documentPictureInPicture.requestWindow` exists.
- Invoke `requestWindow({ width: 320, height: 240 })` directly from the click.
  Chromium controls positioning, minimum size and resizing.
- One pending request, one owned window. Reopening focuses the existing window.
- Availability/error feedback closes with Escape, an outside pointer or its
  close action. Escape is consumed before Focus can close; Escape/close return
  keyboard focus to the trigger. Dismissal/unmount removes its listeners.
- `pagehide` removes the portal and disconnects the observer/listener only.
  A request that resolves after unmount closes its window immediately.
- `window.focus()` on the PiP return click precedes closing; the native
  back-to-tab control also stays available. No redirects or route parameters.
- Copy loaded styles (including self-hosted fonts); synchronize the app root's
  dark class/language and lazy-loaded stylesheet changes without recreating PiP.
  Deduplicate linked and inline sheets; remove the observer/load listener on close.
  Never copy the opener's `bt-focus-active` class or mount a second app root.

## Visual scope

The current equipped Focus environment is passed from `ChronoFocus` to the
portal: Forest, Gradient Wave, Zenitho or Glass Fold. Both windows use the same
registry, lazy renderer and scoped palette. No new preference, unlock or setting.
Changing the equipped environment updates an already-open PiP window.

The landscape fills the window, without an opaque content card. Course marker
and name, plain tabular digits, explicit textual state and one secondary return
action stay above it. Long names truncate while retaining their full title.
At short heights the state and return action share a row; the decorative return
icon hides below 240px, never its label. Minimum return target stays 44px.
The ticking value is not a live announcement; the state is. Keyboard focus uses
the app's existing two-tone ring. FR/EN and light/dark remain synchronized.

Only compact PiP rendering opts into 24fps and a 1x DPR ceiling (Wave/Zenitho
retain their existing half-resolution buffers). Speeds and shader palettes
are unchanged. The main Focus landscape suspends while PiP is open and resumes
on close, leaving the timer, audio and Pomodoro running normally. All renderer
RAF, media, visibility and resize listeners follow the mounted element's owner
document/window, not the opener. Reduced motion, WebGL fallback and cleanup are
shared. Forest deletes its allocations without forcing native context loss on
its React-owned canvas, which must survive StrictMode effect replay.

Compact contrast stays environment-specific: a lighter Wave veil, subtle
Zenitho light top/bottom treatment and a restrained Glass Fold navy veil plus
its existing word-sized backing. No digit outline, glow or large opaque panel.
Free pause keeps the existing red palette and stops the Wave/Zenitho/Glass Fold
movement; Pomodoro preserves its existing running/break/paused semantics.

## Evidence

Seventeen focused tests run the real component with a simulated native API:
opening/double click, unsupported/error/retry FR/EN, mobile media changes,
live time/course/paused/idle and Pomodoro display, close/return/reopen,
unmount and late opening, stylesheet/local fonts, theme/language sync, and
feedback Escape/outside-pointer/close dismissal with listener cleanup,
all four equipped identities, live environment switching, lazy stylesheet
synchronization, open/close reporting and Free/Pomodoro pause palette boundaries.
Renderer tests cover owner-window scheduling with a hidden opener, compact
cadence versus actual shader time, resizing, reduced motion, fallback and
allocation/listener cleanup, including Forest's same-canvas StrictMode replay.
Existing real TimerProvider/useChrono behavioral tests cover Free/Pomodoro
transitions, unique session IDs, pause/resume, restored cycles and saved work.
The original neutral V1 passed 46 combined and 957 full-suite checks. The
environment follow-up passes 130 combined and 971 full-suite checks, lint and
production build. The existing >3 MB HEIC precache warning and missing local
Supabase configuration remain unrelated. No backend migration or dependency.

Actual Chrome desktop checks used isolated local data: native opening by mouse
and Enter, live course/time, pause/resume, native close/reopen, return by mouse
and Tab/Enter, and native resizing. With the Focus tab hidden for more than five
minutes while another local tab and then Codex were foreground, the PiP time
advanced from 03:21 to 09:09; returning showed the same running chrono at 10:10.
FR/dark and EN/light captures covered desktop Focus at 1086 × 688. Actual Chrome
DevTools at 375 × 667 showed no mobile action. No console exceptions were
observed. Details are recorded in [AI_CHANGELOG](../AI_CHANGELOG.md).

The environment follow-up was checked in a real Chrome desktop PiP at 320 × 240
and 240 × 118 content sizes, all four scenes, changing Zenitho → Glass Fold
without reopening, running time with another tab selected, native close/return,
Free pause/resume, EN/dark and FR/light. Shader motion was compared across
multiple frames; the main scene's StrictMode cleanup was corrected after a
console warning exposed native context loss. Physical Edge, real Safari,
iPhone/PWA and OS sleep were not tested. Edge compatibility is feature/API-based.
After correction, fresh Forest/mini mounts produced no browser warnings/errors.
The independent finish review's final disposition is SHIP; it reviewed supplied
screenshots/source/docs, not an independently rerun browser or test suite.
This validation covers a local implementation; no push or deployment was made.

References: [Chrome Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture),
[Document PiP specification](https://wicg.github.io/document-picture-in-picture/).
