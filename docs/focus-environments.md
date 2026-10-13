# Focus Environments V1

Status (2026-10-12): implemented and tested in the branch; **not deployed**.
`supabase/migration_v86_focus_environments.sql` is pending and has not been
applied to production. This is a cosmetic extension of the existing Focus
surface, not a new XP system or an application-wide theme.

## Catalogue and UI

| Environment | Eligibility | V1 behavior |
| --- | --- | --- |
| Forest (`forest`) | Level 1 | Default; the original `FocusShaderBackground` renderer is unchanged. |
| Gradient Wave (`gradient-wave`) | Level 5 | The existing Gradient Wave engine, with the exact six alternating `#38bdf8` / `#ffffff` source colors, 32% source speed (`0.0000032`), a 30 fps cap and a half-resolution drawing buffer. |
| Environment 3 (`reserved-12`) | Reserved level 12 | “Coming soon” / “À venir”; no renderer, preview or equip action. |
| Environment 4 (`reserved-20`) | Reserved level 20 | “Coming soon” / “À venir”; no renderer, preview or equip action. |

The gallery opens from the upper-right control in Focus, opposite audio. Its
two implemented environments use static palette previews; opening the gallery
does not mount preview canvases. The same gallery appears in `/progression`
immediately below the XP/source section, before missions and the level list.
Required level, locked/available/equipped state and the next available unlock
are explicit FR/EN text. Future slots stay separate, noninteractive rows even
after their reserved level is reached.

Selection changes only after a successful server response. Unlocking never
auto-equips. Existing timer, course marker, Study Blocks, Pomodoro work/rest,
pause warning, finish flow and audio behavior remain in place. Escape closes
the gallery and restores its trigger first; the next Escape exits Focus.
Space keeps its pause/resume role outside controls and the open gallery.

## Architecture and persistence

- `lib/focusEnvironments.mjs` owns cosmetic catalogue metadata and Focus-local
  themes. `components/focus/FocusEnvironmentRenderer.js` mounts one renderer;
  Gradient Wave is loaded dynamically. No future renderer is bundled.
- `GradientWaveEnvironment` opts into all six source layers using
  `fullColorLayers`; Auth retains its historical shader gate and defaults.
  The wave freezes while free study is paused, stops scheduling when hidden or
  under reduced motion, and releases listeners, frames and WebGL allocations
  on disposal. Reduced motion draws a still frame. Missing WebGL, setup/draw
  failure or context loss leaves the CSS palette visible; restoration rebuilds
  one scene. Forest retains its existing lifecycle.
- Environment text, controls, Study Blocks and contrast veils are scoped to
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
  `equip_focus_environment(p_environment_id, p_expected_user_id)` accepts only `forest` and
  `gradient-wave`, validates eligibility and returns the saved choice/history.
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

## Pending migration and application

1. Review `migration_v86_focus_environments.sql` against the intended database.
   Prerequisites are the existing `profiles.locked`, `block_suspended_actor()`
   and canonical `get_gamification_levels(uuid[])` functions. The additive SQL
   has its own transaction and is re-runnable without resetting saved choices.
2. Once production application is authorized, apply that exact migration using
   the project's established migration workflow, then verify owner-only read,
   revoked client writes, anonymous access and suspended RPC refusal, level-5 eligibility,
   permanent unlock, no auto-equip and cross-session selection. Local PGlite
   coverage is evidence for the SQL contract, not a live Supabase verification.
3. Deploy the application after the database contract is verified. Verify both
   gallery locations and a second session/device, including error/retry and
   Forest fallback. Record migration/deployment identifiers and results in
   `AI_CHANGELOG.md`. No production application or deployment occurred here.

## Verification and limits

The six feature suites (`tests/focus-*.test.mjs`) pass 58 tests locally. They
execute the migration in PGlite with the shipped canonical level function and
cover RLS/privileges, suspension, persistence, reductions, idempotence and
account deletion, including an account switch before the RPC write; the
client/hook/UI cases cover synchronization, races,
fallback/retry, FR/EN states and preserved timer behavior. Recording WebGL
tests cover all six layers, the frame cap, half buffer, hidden/reduced/paused
states, context recovery and resource cleanup.

The complete suite passes 881 tests; `npm run lint` is clean and
`npm run build` succeeds. The build reports the absent local Supabase
environment and the pre-existing HEIC chunk above the 3 MB PWA precache limit.

Local browser checks cover 1440, 1280, 390 and 320 px widths, FR/EN and
light/dark themes: equip confirmation, Escape, saved choice after reload and
a level drop, no horizontal overflow, and actual Pomodoro start/pause controls.
At a 390 × 844 viewport, Gradient Wave mounts one 195 × 422 drawing buffer.
Automated checks additionally preserve Pomodoro work/rest, skip-break and
audio behavior. These are local/offline checks; no remote Supabase migration
was applied and no physical iPhone or PWA device was tested.

`/dev/focus-environments` is a fixture route available only with development
mode **and** `NEXT_PUBLIC_OFFLINE_DEV=true`; it returns 404 otherwise. Its
local levels and database simulate states and do not certify production
authorization. Browser viewport checks represent responsive browser layouts,
not physical iPhone/Safari performance. A 30 fps cap is a scheduling setting,
not a measured guarantee of frame rate or battery use on hardware.

The independent finish review ended **SHIP** after two scoped corrections:
paused Wave's Finish action now uses a dark red secondary surface with light
text, and the gallery Close control has a 44 × 44 px touch target. Both were
confirmed in usable desktop/320 px recaptures. Two other final gallery images
had capture scaling/clipping artifacts and were not used to certify layout.
