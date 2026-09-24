# Architecture — blocus-tracker

## High-level

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / PWA                                                  │
│    ┌────────────┐   ┌─────────────┐   ┌──────────────────┐      │
│    │  pages/    │ ← │  contexts/  │ ← │  lib/            │      │
│    │  (routes)  │   │  (state)    │   │  (utilities)     │      │
│    └────────────┘   └─────────────┘   └──────────────────┘      │
│           │                │                   │                │
│           └────────────────┴───────────────────┘                │
│                            │                                    │
│                  ┌─────────▼─────────┐                          │
│                  │ lib/supabaseClient│  ── anon key             │
│                  └─────────┬─────────┘                          │
└────────────────────────────┼────────────────────────────────────┘
                             │
                ┌────────────▼────────────────────────────────────┐
                │  Supabase (PostgreSQL + Auth + Storage + RT)    │
                └─────────────────────────────────────────────────┘
                             ▲
                             │  service_role (server-only)
                             │
                ┌────────────┴───────────┐
                │  pages/api/*.js        │  ← login, signed storage, webhooks
                └────────────────────────┘
```

## Folder roles

| Folder | Purpose |
|--------|---------|
| `pages/` | One file = one route. Includes server routes under `pages/api/`. |
| `pages/api/` | Next.js server routes: login, private Storage signing, push (`/api/push/notify` friend-request webhook, `/api/push/daily` evening reminder), cron tasks and `/api/admin/*` (every admin route goes through `lib/server/adminAuth.js`; member actions live in `/api/admin/members/[id]` — delete, `/suspension`, `/moderation`, `/notifications`). Server-only routes may use `SUPABASE_SERVICE_ROLE_KEY`. |
| `components/` | Shared UI components (Layout, Avatar, BadgeIcon, LevelPill, modals, charts). |
| `contexts/` | React contexts: Auth, I18n, Notification, Timer. |
| `lib/` | Pure utilities: supabaseClient, i18n, format, badges, xp, rateLimit, universities. |
| `styles/` | Single `globals.css` with CSS variables and `@layer` Tailwind extensions. |
| `supabase/` | SQL files: `schema.sql` + 19 migrations. Never executed automatically — user runs them manually in Supabase SQL Editor. |
| `public/` | Static assets, PWA manifest, service worker (auto-generated). |
| `scripts/` | One-off scripts (e.g. `generate-icons.js`). |

## Routing (pages router)

| Route | File | Role |
|-------|------|------|
| `/` | `index.js` | Landing / redirect to /dashboard if logged in |
| `/login` | `login.js` | Pseudo + password sign-in |
| `/signup` | `signup.js` | Steps 1–2 of the canonical setup (account + identity) |
| `/forgot-password` | `forgot-password.js` | Send reset email |
| `/reset-password` | `reset-password.js` | Set new password from email link |
| `/onboarding` | `onboarding.js` | Steps 3–5 (university + studies + courses), resume and profile repair |
| `/dashboard` | `dashboard.js` | **Main page** — pomodoro timer |
| `/planning` | `planning.js` | Objectives, schedule |
| `/stats` | `stats.js` | Heatmap, charts, leaderboard, goals |
| `/historique` | `historique.js` | Past sessions list |
| `/friends` | `friends.js` | Friends list, requests, suggestions |
| `/messages` | `messages.js` | Private DMs + study group chats (incl. synchronized group chrono) |
| `/communautes` | `communautes.js` | Course spaces: the student's own courses matched to canonical courses of their institution, voluntary join, one member-only conversation per course (`docs/course-spaces.md`) |
| `/feed` | `feed.js` | Photo feed (sessions, reactions, comments) |
| `/profile` | `profile.js` | Profile, badges, XP, settings |
| `/admin` … `/admin/system` | `admin/*.js` | Admin tool, six pages (Today, Members, Activation, Inbox, Communications, System) in `components/admin/AdminShell.js`; data only from the `admin_*` read functions and `/api/admin/*` (gated by `profiles.is_admin` in the page, enforced by the database and the routes) |

## Auth flows

### Signup (new users)
1. `signup.js` presents one five-step journey: Account → You → University → Studies → Courses. The first two live on `/signup`; the last three live on `/onboarding`.
2. `AuthContext.signUp()` sends identity metadata plus `onboarding_version=1` to `supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL/onboarding } })`.
3. The v43 trigger creates the minimal profile in the same transaction. University, `broad_field`, year and courses are then saved by their real onboarding steps.
4. If Supabase returns a session, setup continues immediately. If `session` is null, `/signup` shows a dedicated email-confirmation state; the callback resumes `/onboarding`.
5. Referral and legal-version work is stored as pending Auth metadata until a usable session exists, then replayed idempotently.
6. `lib/onboarding.mjs` derives the first incomplete step from Auth metadata, canonical profile fields and at least one active course. `localStorage` is never completion authority.

> Existing accounts without `onboarding_version` are legacy and remain valid even when they predate `broad_field`. Only new versioned accounts and missing-profile repair accounts are guarded by the canonical requirements.

### Login (all users)
1. An email signs in directly with Supabase Auth. A pseudo POSTs to `/api/login` with `{ pseudo, password }`.
2. Server (`pages/api/login.js`) resolves the profile id case-insensitively, then reads that exact user's canonical email from Supabase Auth. `profiles.email` is never trusted for authentication.
3. Server calls `supabase.auth.signInWithPassword({ email, password })`, verifies the returned user id matches the profile id, then returns only the session tokens — no email exposed.
4. Client calls `supabase.auth.setSession(tokens)`.
5. Rate limit: 8 attempts/minute/IP (in-memory, `lib/rateLimit.js`).

> Why this dance? ~60 legacy users have fake emails `<pseudo>@blocus.local`. New users have real emails. The pseudo lookup hides this from the client.

### Reset password
1. `/forgot-password` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL/reset-password })`.
2. User clicks email link → lands on `/reset-password`.
3. The callback intent is captured before the Supabase client starts. `auth.initialize()` must validate it successfully, and the token subject must match the recovered session UUID.
4. The password mutation runs through an isolated, memory-only Auth client pinned to that exact recovery session, so another tab cannot switch the target account between checks.

> **Legacy users** with fake emails (`<pseudo>@blocus.local`) cannot reset by email. They must add a real email in `/profile` settings first.

### Incomplete legacy signup repair
1. `AuthContext` distinguishes a truly missing profile from a temporary profile-load error.
2. An authenticated account with no `profiles` row is sent to `/onboarding` (never auto-deleted or recreated).
3. The user confirms their name and pseudo. Onboarding inserts the missing profile with the existing Auth UUID and canonical Auth email, then marks that account for the canonical University → Studies → Courses journey.
4. Existing sessions, courses and other data remain attached to the same account; retries first look for the user's own repaired profile to avoid duplicate creation.

## Contexts

| Context | Purpose | Key exports |
|---------|---------|-------------|
| `AuthContext` | Auth state, profile | `user`, `profile`, `profileStatus`, `signIn`, `signUp`, `signOut`, `updateEmail`, `refreshProfile`, `completePendingSignup` |
| `I18nContext` | FR/EN i18n | `t`, `lang`, `setLang` |
| `NotificationContext` | In-app bell and unread badges (feed, friends, communities, messages, comments, announcements in FR/EN) — polled, not pushed | `feedCount`, `commentCount`, `friendCount`, `totalCommunity`, `messageCount`, `markSeen` |
| `TimerContext` | Global pomodoro timer state | `running`, `elapsed`, `start`, `pause`, `stop` |

## Notifications (v62, catalogue V1 in v63)

Two separate systems, on purpose:

- **In-app bell** (`contexts/NotificationContext.js`, `components/Layout.js`): computed in the browser from the source tables (friend requests, comments, reactions, messages, announcements); nothing is sent to a phone.
- **Push** (OneSignal), always through **one server path**, `lib/server/notify.mjs`:
  1. audience decided by the database (`notification_audience`): account exists, not suspended, overall switch, category (reminders / social / announcements), blocked sender;
  2. send-specific reasons: weekly nudge cap, quiet hours (22 h – 8 h in the member's time zone), automation switched off;
  3. registry row (`notification_sends`) and anti-duplicate reservation of each recipient (`notification_claim`);
  4. OneSignal, by external ids in batches of 2 000 — never a segment, so never a device without an account, signed out or deleted;
  5. result per recipient (`notification_mark`) and per send.

  Callers: `lib/server/dailyReminders.mjs` (evening reminder, Vercel Cron), `lib/server/socialPush.mjs` (database triggers → `/api/push/notify`), `/api/admin/push` (manual FR/EN send, self-test, pushed announcement, preview, cancel, delivery). OneSignal REST calls live in `lib/server/oneSignalRest.mjs`; pure rules (time zones, keys, bilingual text, social verdicts, validation) in `lib/notificationRules.mjs`, tested in `tests/notification-*.test.mjs`.
- **Catalogue V1** (`lib/pushAutomations.mjs`, texts editable in the admin):
  - *Evening* (`lib/eveningPlan.mjs`, pure): one notification per member per evening, the first that applies — exam tomorrow (fact), streak at risk (≥ 3 days counted like Stats, no session today), exam in 7 days (fact), first start 48–72 h after signing up (two variants: empty planning → Planning, already set up → Chrono; once), second start ~7 days (once, after the first), comeback after 7 days without a real session (≥ 10 min; once per absence, 30 days between cycles), comeback after 21 days (then nothing until they come back). Facts are never capped; nudges: 2 over 7 rolling days, never the same two evenings in a row, none on a day the member studied. Texts are personalised (exam name and time, streak length); the registry keeps the template only.
  - *Social* (at the event, not scheduled): friend request received, request accepted (once per friendship, only on a real pending → accepted change), private message (never its content; one notification per conversation every 10 minutes). Links open the right place: `/messages?tab=relations`, `/messages?profile=<id>`, `/messages?dm=<id>`.
  - *In-app only*: badges, XP, levels, missions, records, reactions, comments, leaderboard, communities, group messages.
- **Device lifecycle** (browser, `lib/onesignal.js` + `lib/pushOwner.mjs` + `lib/pushDevice.js`): the device remembers **which account** turned notifications on; only that account is re-linked at start-up. Sign-out detaches the device (OneSignal `logout`, device register `detached`); a detach that could not finish is completed at the next launch. Account deletion erases the OneSignal user and all its subscriptions (queue `push_identity_cleanup`, retried nightly by `/api/cron/purge-posts`).
- **Preferences** (`user_privacy_settings`): overall switch (off = no push at all) + reminders + social (requests received and accepted, private messages) + announcements, in the profile's Notifications card, applied server-side.
- **Admin > Communications**: send (FR required, EN optional with FR fallback, "who will receive it" from the server, self-test), history from the registry, automations (last / next run, cap, dry run), announcements (FR/EN, dates in Brussels time, school targeting, optional push); member detail shows the member's notification state and checks OneSignal live.

## Deployment

- **Vercel** auto-deploys on push to `main`.
- Required env vars (Vercel Dashboard → Settings → Environment Variables):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (used for email redirects + CORS)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only, for `/api/login`, `/api/storage/sign`, and trusted webhook helpers)
  - `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` (server-only) — push
  - `CRON_SECRET` (server-only) — evening reminder and nightly purge

- Migrations are **not** automated — user runs them manually in Supabase SQL Editor after pushing the code that depends on them. See `docs/SUPABASE.md`.
