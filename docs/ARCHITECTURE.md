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
                │  pages/api/login.js    │  ← resolves pseudo → email
                └────────────────────────┘
```

## Folder roles

| Folder | Purpose |
|--------|---------|
| `pages/` | One file = one route. Includes `api/login.js` (server route). |
| `pages/api/` | Next.js server routes. Currently only `login.js` (uses `SUPABASE_SERVICE_ROLE_KEY`). |
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
| `/signup` | `signup.js` | Account creation (pseudo + email + university) |
| `/forgot-password` | `forgot-password.js` | Send reset email |
| `/reset-password` | `reset-password.js` | Set new password from email link |
| `/onboarding` | `onboarding.js` | Post-signup quick setup |
| `/dashboard` | `dashboard.js` | **Main page** — pomodoro timer |
| `/planning` | `planning.js` | Objectives, schedule |
| `/stats` | `stats.js` | Heatmap, charts, leaderboard, goals |
| `/historique` | `historique.js` | Past sessions list |
| `/friends` | `friends.js` | Friends list, requests, suggestions |
| `/messages` | `messages.js` | Private DMs between friends |
| `/groupes` | `groupes.js` | Study group chats |
| `/communautes` | `communautes.js` | University-wide chats |
| `/feed` | `feed.js` | Photo feed (sessions, reactions, comments) |
| `/profile` | `profile.js` | Profile, badges, XP, settings |
| `/admin` | `admin.js` | Admin dashboard (gated by `profiles.is_admin`) |

## Auth flows

### Signup (new users)
1. `signup.js` collects: first name, last name, pseudo, **email**, university, password.
2. `AuthContext.signUp()` calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL/dashboard } })`.
3. Profile row inserted in `public.profiles` with the real email column.
4. Resend SMTP sends confirmation email (if "Confirm email" is enabled in Supabase).

### Login (all users)
1. `AuthContext.signIn(pseudo, password)` POSTs to `/api/login` with `{ pseudo, password }`.
2. Server (`pages/api/login.js`) uses `SUPABASE_SERVICE_ROLE_KEY` to look up the real email via the `get_login_email(pseudo)` RPC.
3. Server calls `supabase.auth.signInWithPassword({ email, password })`, returns only the session tokens — no email exposed.
4. Client calls `supabase.auth.setSession(tokens)`.
5. Rate limit: 8 attempts/minute/IP (in-memory, `lib/rateLimit.js`).

> Why this dance? ~60 legacy users have fake emails `<pseudo>@blocus.local`. New users have real emails. The pseudo lookup hides this from the client.

### Reset password
1. `/forgot-password` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL/reset-password })`.
2. User clicks email link → lands on `/reset-password`.
3. `onAuthStateChange("PASSWORD_RECOVERY", ...)` fires → form is shown.
4. `supabase.auth.updateUser({ password })`.

> **Legacy users** with fake emails (`<pseudo>@blocus.local`) cannot reset by email. They must add a real email in `/profile` settings first.

## Contexts

| Context | Purpose | Key exports |
|---------|---------|-------------|
| `AuthContext` | Auth state, profile | `user`, `profile`, `signIn`, `signUp`, `signOut`, `updateEmail`, `refreshProfile` |
| `I18nContext` | FR/EN i18n | `t`, `lang`, `setLang` |
| `NotificationContext` | Unread badges (feed, friends, communities, messages, comments) | `feedCount`, `commentCount`, `friendCount`, `totalCommunity`, `messageCount`, `markSeen` |
| `TimerContext` | Global pomodoro timer state | `running`, `elapsed`, `start`, `pause`, `stop` |

## Deployment

- **Vercel** auto-deploys on push to `main`.
- Required env vars (Vercel Dashboard → Settings → Environment Variables):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (used for email redirects + CORS)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only, for `/api/login`)

- Migrations are **not** automated — user runs them manually in Supabase SQL Editor after pushing the code that depends on them. See `docs/SUPABASE.md`.
