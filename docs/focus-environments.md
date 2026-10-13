# Focus Environments V1

V1 catalogue finalized on 2026-10-13, including the Zenitho fidelity refinement
and Glass Fold as the fourth/final environment. Glass Fold's independent finish
review ended **SHIP** for the supplied screenshots and source. Final polish
removes contrasting digit outlines and sets Wave to 40% source speed.
`supabase/migration_v86_focus_environments.sql` was applied once to production
as `20261013152908_v86_focus_environments`. This is a cosmetic extension of the existing Focus
surface, not a new XP system or an application-wide theme.

## Catalogue and UI

| Environment | Eligibility | V1 behavior |
| --- | --- | --- |
| Forest (`forest`) | Level 1 | Default; the original `FocusShaderBackground` renderer is unchanged. |
| Gradient Wave (`gradient-wave`) | Level 5 | The existing Gradient Wave engine, with the exact six alternating `#38bdf8` / `#ffffff` source colors, 40% source speed (`0.000004`), a 30 fps cap and a half-resolution drawing buffer. |
| Zenitho (`zenitho`) | Level 12 | The original UVCanvas 0.3.0 Zenitho palette, shader parameters and XZ plane on the shared Gradient Wave engine, at 55% elapsed shader speed, with a 30 fps cap and a half-resolution drawing buffer. |
| Glass Fold (`glass-fold`) | Level 20 | The supplied GradFlow Glass Fold GLSL and original `#1e3cc8` / `#06081e` / `#96d7ff` palette, with source defaults `speed=0.5`, `scale=1`, `noise=0.12`; no additional slowdown. A 30 fps draw cap and bounded CSS-resolution buffer control rendering work independently of shader speed. |

The gallery opens from the upper-right control in Focus, opposite audio. Its
four environments use static previews: Forest and Wave retain their palette
gradients, while Zenitho and Glass Fold use genuine shader captures
(`public/focus-environments/zenitho.jpg`, 27,654 bytes;
`public/focus-environments/glass-fold.jpg`, 640 × 400, 22,086 bytes). Opening the gallery
does not mount preview canvases. The same gallery appears in `/progression`
immediately below the XP/source section, before missions and the level list.
Required level, locked/available/equipped state and the next available unlock
are explicit FR/EN text. Glass Fold replaces the former reserved level-20
slot in both galleries; the catalogue now contains four implemented choices.

Pause and Resume are primary actions in the selected environment's colors;
Finish & save remains secondary. Wave's paused primary uses a light blue
surface with navy text over the unchanged red pause field. Forest keeps its
green primary treatment. Zenitho uses a pale plum primary with dark plum text,
dark plum secondary controls. Its running waves have no broad dark veil or
grain overlay. Stage text uses dark ink (`#1C1027`); timer digits have no
contrasting stroke or text shadow. Small captions use the same dark ink directly
on the original waves, without white backing rectangles or replacement halos.
Zenitho's paused field and
paused-only red veil remain in place, with light pause captions.

Zenitho's earned Study Blocks use a dedicated blue-purple fill (`#5144B7`) and
matching glow RGB (`81, 68, 183`), separate from stage/Pomodoro accent ink. The
filled fraction, planned capacity, exact goal ticks, active glow timing and red
pause ring retain their existing meanings. A paused unit keeps its earned fill;
Pomodoro rest remains a continuous neutral track. These treatments are scoped
to Zenitho; Forest, Wave and timer action behavior are unchanged.

Glass Fold keeps its source glass field visible, with Focus-local light text
and source cyan (`#96d7ff`) earned fill/glow (RGB `150, 215, 255`). Pause/Resume
use cyan with dark ink (`#06081e`); Finish & save uses a navy surface with light
text as the secondary action. Only small captions receive a dark soft backing
confined to their text bounds (2px vertically, 4px horizontally, 70% opacity,
1px blur). Timer digits have no contrasting stroke or text shadow. Its running field has no broad dark veil or global grain overlay;
the original shader's `noise=0.12` remains intact. The paused red field retains
the existing contrast veils and peripheral warning. Earned cyan time keeps its
fill and the same red paused ring. Fractions, capacity, goal ticks, active glow
timing, Study Blocks props/semantics, timer handlers, Pomodoro and audio are
unchanged; Pomodoro rest retains its continuous track rather than earned blocks.
Forest, Wave and Zenitho retain their existing rendering and local treatments.

Selection changes only after a successful server response. Unlocking never
auto-equips. Existing timer, course marker, Study Blocks, Pomodoro work/rest,
pause warning, finish flow and audio behavior remain in place. Escape closes
the gallery and restores its trigger first; the next Escape exits Focus.
Space keeps its pause/resume role outside controls and the open gallery.

## Architecture and persistence

- `lib/focusEnvironments.mjs` owns cosmetic catalogue metadata and Focus-local
  themes. The registry in `components/focus/FocusEnvironmentRenderer.js` mounts
  exactly one selected renderer; Gradient Wave, Zenitho and Glass Fold are
  loaded dynamically. Galleries mount no renderer.
- `GradientWaveEnvironment` opts into all six source layers using
  `fullColorLayers`; Auth retains its historical shader gate and defaults.
  The wave freezes while free study is paused, stops scheduling when hidden or
  under reduced motion, and releases listeners, frames and WebGL allocations
  on disposal. Reduced motion draws a still frame. Missing WebGL, setup/draw
  failure or context loss leaves the CSS palette visible; restoration rebuilds
  one scene. Forest retains its existing lifecycle.
- `ZenithoEnvironment` uses `components/ui/GradientWave.js` with new opt-in
  geometry parameters. The shared port's historical XY plane doubled the
  vertical extent compared with UVCanvas's XZ plane. Zenitho now selects
  `planeOrientation="xz"`, source mesh density `[0.06, 0.16]`, orthographic
  camera Z `-0.0005` and source edge antialiasing. Only this denser opt-in mesh
  is capped at 180 segments per axis (32,761 vertices) to bound large-display
  work and keep indices within Uint16. Auth and Wave retain the historical XY
  default, density `[0.02, 0.05]`, camera Z `-0.001` and antialiasing off;
  Forest is unchanged.
- UVCanvas 0.3.0 Zenitho retains the same Stripe/MiniGL equations and
  uniforms. Its exact source colors are `#ef008f`, `#6ec3f4`, `#7038ff` and
  `#ffba27`; noise frequency is `[0.00014, 0.00029]`, shadow power is `5` and
  noise speed is `0.000005 * 0.55`. Seed `1253106 / 0.55` preserves the source
  shader's initial phase. The 55% setting scales actual elapsed shader time,
  independently of the 30 fps scheduling cap. Zenitho inherits the half buffer,
  paused/hidden/reduced-motion handling, static CSS fallback, context recovery
  and cleanup of the shared engine. The opt-in geometry changes do not change
  the original Forest renderer or Wave/Auth behavior.
- No `uvcanvas` dependency or package change was needed; its seven package
  dependencies are avoided. The earlier wrapper-size measurement in the
  2026-10-12 changelog predates this refinement and is not a current size claim.
- `GlassFoldEnvironment.js` and its CSS module wrap `components/ui/GlassFold.js`,
  a JavaScript port of the supplied GradFlow/21st.dev source. Vertex and fragment
  GLSL are preserved byte-for-byte; source defaults remain `speed=0.5`,
  `scale=1`, `noise=0.12`. No dependency, TypeScript or shadcn component was added.
  One buffer draws two full-screen triangles. Shader compile/link and allocation
  checks clean up partial failures; missing WebGL, failure and context loss
  reveal the same genuine Glass Fold image used by both galleries.
- Glass Fold's RAF loop caps draws at 30 fps without changing the source speed.
  It suspends animation while paused, hidden or under reduced motion, which keeps
  a still frame. Hidden/paused time is not accumulated. A ResizeObserver tracks
  the container; context restoration rebuilds at the same elapsed shader time.
  Disposal cancels frames, removes observers/listeners, deletes buffers, shaders
  and the program, and requests context release. Its buffer starts at one pixel
  per CSS pixel, never retina DPR, and scales down to at most 1,048,576 pixels
  and 2,048 pixels per axis. Optional GPU timer queries are development-only;
  production has no profiling logs.
- Environment text, controls, Study Blocks and contrast treatments are scoped to
  `.bt-focus-surface` and its `--bt-focus-env-*` variables. The temporary root
  `--bt-focus-canvas` covers the safe area while Focus is open and is restored
  on exit. Normal application themes and the red pause semantics stay intact.
- `public.focus_environment_preferences` stores `user_id`, `equipped_id` and
  `highest_level`. RLS permits only the owner's SELECT; client table writes
  are revoked. The row is deleted with its Auth account. Both authenticated
  RPCs derive the caller from `auth.uid()`, require an existing nonsuspended
  profile, and call the existing `get_gamification_levels(array[auth.uid()])`.
  They accept no caller-supplied XP, level or unlock claim. Equipping also
  verifies the initiating account ID against `auth.uid()` before writing, so
  switching accounts during a request cannot apply a stale selection.
- `get_my_focus_environment()` lazily creates the Forest default and records
  `greatest(saved_highest_level, current_canonical_level)`. Reading may advance
  unlock history but does not change the equipped choice.
  `equip_focus_environment(p_environment_id, p_expected_user_id)` accepts only
  `forest`, `gradient-wave`, `zenitho` and `glass-fold`, validates level-5,
  level-12 and level-20 eligibility, and returns the saved choice/history.
  Its conflict update preserves a higher level recorded concurrently. Unchanged
  reads/equips do not rewrite the row. Canonical XP functions are not replaced.
- Permanent eligibility means the highest canonical level **observed by these
  server RPCs**, including the existing level watcher's `syncFocusUnlock` call.
  A recorded unlock survives later XP/session reductions. The migration does
  not reconstruct a level reached and lost before it existed.
- `lib/focusPreferences.mjs` deduplicates server reads for 10 seconds in memory;
  `hooks/useFocusEnvironment.js` handles account changes, stale replies,
  serialized saves, retry and foreground/XP refresh. The saved server choice
  is shared across devices and revalidated on return; there is no realtime
  subscription or browser-storage eligibility authority. Guests use Forest
  without preference RPCs. Missing migration falls back to Forest with retry;
  other failures preserve the last confirmed choice.
- Preference normalization and the explicitly local/offline RPC fixture use
  the same four IDs and level thresholds. The fixture is development evidence;
  production eligibility still comes from the authenticated canonical-level RPC.

## Migration and release

1. Review `migration_v86_focus_environments.sql` against the intended database.
   Prerequisites are the existing `profiles.locked`, `block_suspended_actor()`
   and canonical `get_gamification_levels(uuid[])` functions. The additive SQL
   has its own transaction and is re-runnable without resetting saved choices.
   V86 includes the new ID, level-20
   constraint and RPC guard; no new migration architecture is introduced.
   Its constraint upgrade accepts the original two-environment and subsequent
   three-environment v86, preserving equipped choices and XP.
2. The exact migration was applied once on 2026-10-13 through Supabase's migration
   API. Live verification confirms owner-only read,
   no anonymous table/RPC access, no direct authenticated writes, fixed function
   search paths and no unbound legacy mutation overload. The canonical level
   function's hash is unchanged. Local PGlite checks cover
   revoked client writes, anonymous access and suspended RPC refusal, level-5 and
   level-12 eligibility (level 11 must reject Zenitho) and level-20 eligibility
   (level 19 must reject Glass Fold),
   permanent unlock, no auto-equip and cross-session selection. Local PGlite
   coverage is evidence for the SQL contract, not a live Supabase verification.
3. Deploy the application after the database contract is verified. Verify both
   gallery locations and a second session/device, including error/retry and
   Forest fallback. Production SHA, READY status and browser smoke evidence
   belong to the release report; do not infer them from local fixtures.

## Verification and limits

Production code was verified on 2026-10-13 at `f29d7cd`, Vercel
`dpl_HTsHjdpaqpfWU9k1LZSUivr418mh` READY on `www.blocus-tracker.com`.
On the real level-15 account, levels 1/5/12 are available and Glass Fold is
locked, including direct server refusal in a rolled-back test. Zenitho equip
survived reload and appeared in a second browser session; the original Forest
choice was restored and confirmed there too. FR desktop and EN Chrome at
390 × 844 cover Progression, Focus and its gallery with one active canvas and
no overflow. No fictitious study session, XP change or physical iPhone test
was performed. A later documentation-only closing commit may have a newer SHA.

The seven feature suites (`tests/focus-*.test.mjs`) pass 88 tests locally. They
execute the migration in PGlite with the shipped canonical level function and
cover RLS/privileges, suspension, persistence, reductions, idempotence and
account deletion, including an account switch before the RPC write; the
client/hook/UI cases cover synchronization, races, all four environment IDs,
fallback/retry, FR/EN states and preserved timer behavior. SQL coverage includes
level-11/level-19 refusal, level-12/level-20 eligibility, permanent unlocks,
no auto-equip, account isolation and reapplication/upgrading both earlier v86
constraint sets while preserving choices and XP. Recording WebGL tests
cover all six Wave layers, Zenitho's source palette/uniforms and actual 55%
shader speed at multiple frame cadences, the actual XZ vertices/camera/source
antialiasing, preserved XY defaults and bounded 4K mesh indices, the frame cap,
half buffer, hidden/reduced/paused states, context recovery and resource cleanup.
Zenitho contrast cases cover large digits on its four source colors and
controls/panels; they do not certify small captions on every moving pixel.
Glass Fold tests additionally check source GLSL byte hashes, palette/uniforms,
actual shader time, two-triangle drawing, buffer bounds, resize, visibility,
pause/reduced-motion handling, context recovery, partial failure cleanup and
fallback.

The integrated release suite passes 929 tests; `npm run lint` is clean and
`npm run build` succeeds. The build reports the absent local Supabase
environment and the pre-existing HEIC chunk above the 3 MB PWA precache limit.

Local browser checks cover 1440, 1280, 390 and 320 px widths, FR/EN and
light/dark themes: actual Progression and Focus galleries, Zenitho lock/equip
confirmation, Escape, saved choice after reload and a level drop, no horizontal
overflow, pause/resume/audio and actual Pomodoro start/pause controls. At a
390 × 844 viewport, Wave and Zenitho each mount one 195 × 422 drawing buffer
when selected; the gallery adds no canvases. Refinement checks additionally
inspect three distinct shader frames, actual blue-purple earned fill/glow and
paused states, the new gallery image, and one half-resolution canvas at
320 × 740 (160 × 370) and 1440 × 900 (720 × 450), without overflow.
Automated checks additionally preserve Pomodoro work/rest, skip-break and
audio behavior. These browser checks use the local/offline fixture and are
separate from the live migration verification above. No physical iPhone or
PWA device was tested.

Glass Fold browser checks cover FR running Focus at 390 and 1280 px, its selector
at 320 and 1280 px, paused Focus at 390 px, and EN Pomodoro start/pause plus audio
panel controls at 1280 × 720 (audio was not enabled). Progression was checked in
EN light at 1280 × 720 and dark at 320 × 740. A new level-12 account is locked;
level 20 becomes available without auto-equipping; explicit equip survives reload
and a current-level drop to 1 after the highest observed level reached 20. Focus
mounts one canvas, an open gallery adds none, and Progression mounts zero, with
no horizontal overflow. These persistence checks use the local/offline fixture.

Optional real GPU timer queries produced 60 samples per case on the local Mac:

| Browser viewport / drawing buffer | Median GPU draw | p95 GPU draw |
| --- | --- | --- |
| 1280 × 800 / 1280 × 800 | 1.536125 ms | 2.068458 ms |
| 390 × 844 / 390 × 844 | 0.626291 ms | 1.984374 ms |

These measure shader draw time on that Mac, not physical iPhone/PWA performance,
end-to-end frame time, battery use or a guarantee of 30 fps on other hardware.

`/dev/focus-environments` is a fixture route available only with development
mode **and** `NEXT_PUBLIC_OFFLINE_DEV=true`; it returns 404 otherwise. Its
`?shader=zenitho` and `?shader=glass-fold` variants capture the raw renderer without
Focus UI. Zenitho's static image is frame 2 of a local 1280 × 800 capture;
Glass Fold's genuine 640 × 400 thumbnail also serves its static fallback.
`?shader=glass-fold&profile=1` enables the optional local GPU measurement. Its
local levels and database simulate states and do not certify production
authorization. Browser viewport checks represent responsive browser layouts,
not physical iPhone/Safari performance. A 30 fps cap is a scheduling setting,
not a measured guarantee of frame rate or battery use on hardware. No physical
iPhone/PWA GPU profiling was performed; local Mac measurements are
recorded above.

The original V1 independent finish review ended **SHIP** after two scoped corrections:
paused Wave's Finish action now uses a dark red secondary surface with light
text, and the gallery Close control has a 44 × 44 px touch target. Both were
confirmed in usable desktop/320 px recaptures. Two other final gallery images
had capture scaling/clipping artifacts and were not used to certify layout.
The original Zenitho extension's finish review also ended **SHIP**. The
2026-10-13 refinement review initially requested changes to outlined small text
and stale documentation. That review verified the then-local caption backing;
Zenitho's white backing was subsequently removed on user request on 2026-10-13.
The final independent refinement review ended **SHIP**, confirming both
findings resolved and no visible regression. Those earlier reviews were local
and preceded the migration application and final release checks.
Glass Fold's final independent finish review ended **SHIP**, with no material
UI/renderer correction requested. The reviewer inspected the supplied screenshots
and source, without independently rerunning browser checks or tests. Remote
account persistence must additionally be checked against the live server;
local PGlite/offline evidence does not certify it. The migration is now applied
as documented above. Physical iPhone/PWA verification remains unperformed.
