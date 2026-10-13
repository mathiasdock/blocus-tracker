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
- Copy loaded styles once (including self-hosted fonts); synchronize only the
  app root's dark class and language. Never copy `bt-focus-active` or run a shader.

## Visual scope

Neutral app surface in both themes, saved course marker/name, static tabular
digits, textual session state, one secondary return action. No badge, shader,
extra controls or animation in PiP. Long course names truncate visually while
retaining their full title. The ticking value is not a live announcement;
the state is. Keyboard focus uses the app's existing two-tone ring.

## Evidence

Twelve focused tests run the real component with a simulated native API:
opening/double click, unsupported/error/retry FR/EN, mobile media changes,
live time/course/paused/idle and Pomodoro display, close/return/reopen,
unmount and late opening, stylesheet/local fonts, theme/language sync, and
feedback Escape/outside-pointer/close dismissal with listener cleanup.
Existing real TimerProvider/useChrono behavioral tests cover Free/Pomodoro
transitions, unique session IDs, pause/resume, restored cycles and saved work.
Combined Mini-chrono/Chrono/Focus checks: 46 passing. Full suite: 957 tests
passing; lint and production build pass. Build retains
the pre-existing >3 MB HEIC precache warning. No backend migration or dependency.

Actual Chrome desktop checks used isolated local data: native opening by mouse
and Enter, live course/time, pause/resume, native close/reopen, return by mouse
and Tab/Enter, and native resizing. With the Focus tab hidden for more than five
minutes while another local tab and then Codex were foreground, the PiP time
advanced from 03:21 to 09:09; returning showed the same running chrono at 10:10.
FR/dark and EN/light captures covered desktop Focus at 1086 × 688. Actual Chrome
DevTools at 375 × 667 showed no mobile action. No console exceptions were
observed. Details are recorded in [AI_CHANGELOG](../AI_CHANGELOG.md).

Independent finish review: SHIP, based on screenshots and source; the reviewer
did not independently rerun browser checks or tests. Physical Edge, real Safari,
iPhone/PWA and OS sleep were not tested. Edge compatibility is feature/API-based.
This validation covers a local implementation; no push or deployment was made.

References: [Chrome Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture),
[Document PiP specification](https://wicg.github.io/document-picture-in-picture/).
