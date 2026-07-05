# blocus-tracker — CLAUDE.md

Top-level reference for Claude Code sessions.
**Detailed docs** live in `docs/`. **Skills** live in `.claude/skills/`.

---

## What this app does

Web app for Belgian/French-speaking students. Features: study timer, planning, statistics, social feed, private messaging, study groups, university communities, badges & XP.
Created by **Mathias Dock**, MSc1 student at ICHEC Brussels Management School.

---

## Stack (one-liner)

Next.js 14 (pages router, JS) · Tailwind 3 · Supabase (DB + Auth + Storage + Realtime) · Resend SMTP · PWA (`@ducanh2912/next-pwa`) · Vercel auto-deploy on push to `main`.

---

## Golden rules — always follow

1. **i18n FR + EN, no exceptions.** Every visible string in `lib/i18n.js` in both blocks. Never hardcode French in JSX. → `docs/I18N.md` + `.claude/skills/add-i18n.md`
2. **Never expose other users' emails.** When querying `profiles` for non-self, list explicit columns and exclude `email`. → `docs/SUPABASE.md` + `.claude/skills/supabase-safe.md`
3. **Service role key is server-only.** Lives in env var `SUPABASE_SERVICE_ROLE_KEY`, used only by server routes/helpers such as `pages/api/login.js`, `pages/api/storage/sign.js`, and push webhook handling. Never reference it from browser code in `pages/`, `components/`, `contexts/`, or client utilities.
4. **CSS variables only for colors.** Use `var(--bt-*)` and the accent green `#14B885` family. No new colors. Dark mode works automatically. → `docs/UI.md`
5. **Don't run migrations.** SQL files in `supabase/` are written by Claude but **executed manually** by the user in Supabase SQL Editor. Never `psql` or `supabase db push`.
6. **Don't push if `npm run build` fails.** Vercel auto-deploys on push to `main`.

---

## Project tree (skim)

```
pages/         → routes + server APIs (login, private storage signing, push notify)
components/    → shared UI (Layout, Avatar, BadgeIcon, LevelPill, modals, charts)
contexts/      → React state (Auth, I18n, Notification, Timer)
lib/           → utilities (supabaseClient, i18n, format, badges, xp, rateLimit)
styles/        → globals.css (CSS variables + Tailwind layers)
supabase/      → schema.sql + 19 migrations (manual execution)
public/        → assets + PWA manifest + auto-generated service worker
scripts/       → one-off tools (generate-icons.js)
docs/          → detailed reference (ARCHITECTURE, UI, I18N, SUPABASE)
.claude/       → settings + skills for Claude Code
```

For per-page route table → `docs/ARCHITECTURE.md`.

---

## Skills (use them — they save tokens)

| Skill | When to invoke |
|-------|----------------|
| `ui-fix` | Small UI tweak: color, spacing, label, icon |
| `mobile-polish` | iPhone / safe-area / touch / aspect-ratio issues |
| `add-i18n` | Add or rename an i18n key without reading the whole file |
| `supabase-safe` | Add or modify a `supabase.from(...)` or `.rpc(...)` call |
| `new-migration` | Generate a new SQL migration file (does NOT execute) |
| `pre-deploy-check` | Last gate before `git push` (build, env leaks, untracked assets) |

---

## Documentation map

| Doc | Read when… |
|-----|------------|
| `docs/ARCHITECTURE.md` | You need the full folder/route tree or auth flows |
| `docs/UI.md` | You're touching styles, colors, layout, mobile |
| `docs/I18N.md` | You're adding or changing user-facing strings |
| `docs/SUPABASE.md` | You're touching tables, RLS, RPCs, migrations, Storage |

---

## Required env vars (Vercel + local `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
SUPABASE_SERVICE_ROLE_KEY      ← server-only
```

Full env reference → `docs/SUPABASE.md`.

---

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # production build (must pass before push)
npm run lint     # ESLint
```

No tests. No typecheck (JS project).

---

## Known open issues / monitored

- **Legacy users (~60)** have fake emails `<pseudo>@blocus.local` and can't reset password by email until they add a real one in `/profile`.
- **Resend SMTP** must be configured in Supabase Dashboard for confirmation + reset emails to work.
- **`NEXT_PUBLIC_SITE_URL`** must point to the production domain in Vercel env.
- **Rate limit on `/api/login`** is in-memory — irrelevant on Vercel serverless (replace with Upstash Redis if multi-instance needed).
- **3 migration files numbered v12** (`security_hardening`, `uni_leaderboard`, `group_chrono`) — confusing. New migrations should jump to **v14+**.

---

## Don't do this

- ❌ Don't migrate to App Router (huge effort, no gain).
- ❌ Don't refactor the giant pages (`planning.js` 1300L, `messages.js` 1297L, `dashboard.js` 1133L) in one shot — incremental only.
- ❌ Don't add TypeScript globally — too disruptive for a solo project.
- ❌ Don't run `vercel --prod` manually — git push triggers deploy.
- ❌ Don't commit `.env.local` (already in `.gitignore` — keep it that way).
- ❌ Don't push to `main` without a passing `npm run build`.
- ❌ Don't add tests right now — focus on shipping features.
