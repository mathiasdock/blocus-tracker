# Supabase reference — blocus-tracker

This document is the **detailed reference** for the database. `CLAUDE.md` keeps only the headline rules; everything else lives here.

## Tables

| Table | Description |
|-------|-------------|
| `profiles` | id, pseudo (unique), first_name, last_name, university, study_field, study_year, bio, avatar_url, lang, planning_public, studying_since, is_admin, locked, **email** (v9+), created_at |
| `sessions` | study sessions (user_id, course_id, duration_seconds, started_at, ended_at) |
| `courses` | user's courses (id, user_id, name, color, exam_date) |
| `objectives` | planning objectives (user_id, title, target_minutes, scheduled_date, done) |
| `friendships` | requester, addressee, status ∈ {'pending','accepted'} |
| `posts` | feed posts (user_id, image_url, caption, visibility ∈ {'public','friends'}) |
| `likes` | emoji reactions on posts (post_id, user_id, emoji) |
| `comments` | comments on posts (post_id, user_id, content) |
| `community_messages` | university chat messages (community, user_id, content, attachment_url) |
| `private_messages` | DMs (sender_id, receiver_id, content, read) |
| `study_groups` | revision groups (name, description, created_by) |
| `group_members` | group memberships (group_id, user_id, role ∈ {'admin','member'}) |
| `group_messages` | group chat messages |
| `deleted_accounts` | audit log of self-deletes (admin-only read) |

## Row Level Security — rules

| Table | Read | Write |
|-------|------|-------|
| `profiles` | all authenticated users | self only, **trigger blocks `is_admin` and `locked` escalation** |
| `sessions` / `courses` / `objectives` | self + accepted friends + admins | self only |
| `friendships` | requester or addressee | INSERT forced to `'pending'`; only `addressee` can accept (v8); cannot self-friend |
| `posts` | all authenticated users (filtered client-side by visibility) | owner only |
| `likes` / `comments` | all authenticated | owner only |
| `community_messages` | all authenticated of that community | owner |
| `private_messages` | sender or receiver | INSERT only between accepted friends |
| `study_groups` / `group_members` / `group_messages` | members only | admin/owner roles |
| `deleted_accounts` | admins only | trigger on self-delete |

## Sensitive functions (SECURITY DEFINER)

| Function | Purpose |
|----------|---------|
| `prevent_profile_privilege_escalation()` | BEFORE UPDATE trigger — blocks user from setting `is_admin` or `locked` on themselves |
| `admin_delete_user(target uuid)` | Admin-only — fully removes a user (verified server-side) |
| `self_delete_user()` | User deletes their own account |
| `get_login_email(p_pseudo text)` | Resolves pseudo → email. **v12+: restricted to authenticated** (anti-enumeration). Called from `/api/login` only. |
| `get_my_email()` | Helper to fetch own email without scanning the table |
| `is_friend_or_self(target uuid)` | RLS helper |
| `is_group_member(gid uuid)` | RLS helper |
| `get_public_leaderboard(p_period text, p_university text)` | Top 50 by `total_seconds` for the period. v13+: also returns `alltime_seconds` for level computation. |
| `get_my_study_rank(p_period text)` | Returns user's percentile vs all active users |
| `get_user_profile_stats(p_user_id uuid)` | v12+: restricted to self/friend/admin |

## Storage buckets

| Bucket | Public read | Write |
|--------|-------------|-------|
| `avatars` | ✅ | owner only (path must start with `<user_id>/`) |
| `posts` | ✅ | owner only |
| `community` | ✅ | owner only |
| `dm` | ❌ (private since v8) | owner only |

**Important**: every upload path must be `<user_id>/...`. RLS uses the first folder as the owner check.

## Migrations

All in `supabase/`. **Run manually** in Supabase Dashboard → SQL Editor when needed. They are not automated.

| File | What it does |
|------|--------------|
| `schema.sql` | Initial schema (run on fresh DB) |
| `migration_v3_features.sql` | emoji reactions, planning_public, lang column |
| `migration_v4_locked.sql` | `locked` column |
| `migration_v5_presence.sql` | `studying_since` column |
| `migration_v6_security.sql` | `is_admin` column, admin/self delete RPCs |
| `migration_v7_profile_security.sql` | Anti-escalation trigger + UPDATE policies |
| `migration_v8_security.sql` | Full security pass (friendships, PM, sessions, groups, bucket dm privé) |
| `migration_v9_email.sql` | `email` column on profiles + `get_login_email()` |
| `migration_v11_leaderboard.sql` | `get_public_leaderboard(period)` + `get_my_study_rank(period)` |
| `migration_v12_security_hardening.sql` | **Critical** — fix force-add friend, email exposure, stats RPC restriction, rate limit |
| `migration_v12_uni_leaderboard.sql` | Add `p_university` param to leaderboard |
| `migration_v12_group_chrono.sql` | Group pomodoro feature |
| `migration_v13_leaderboard_levels.sql` | Add `alltime_seconds` to leaderboard so levels render correctly when period = "day" |

> ⚠️ The project has **three v12 files** — confusing but intentional (parallel features). When numbering a new one, jump to **v14** or higher. See `.claude/skills/new-migration.md`.

## Required env vars

In Vercel Dashboard:
```
NEXT_PUBLIC_SUPABASE_URL       = https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon public key>
NEXT_PUBLIC_SITE_URL           = https://blocus-tracker.com
SUPABASE_SERVICE_ROLE_KEY      = <service_role>     ← server-only, used by /api/login
```

## Supabase Dashboard configuration

- **Authentication → Providers → Email**: enabled. "Confirm email" optional.
- **Authentication → URL Configuration**:
  - Site URL: `https://blocus-tracker.com`
  - Redirect URLs: `https://blocus-tracker.com/*`
- **Authentication → SMTP**: Resend (`smtp.resend.com:587`, user `resend`, password = Resend API key).
- **Storage → Buckets**: avatars 2 MB max, posts/community/dm 5 MB max.

## Known issues / monitored

- **Legacy users (~60)** have fake emails `<pseudo>@blocus.local`. They cannot reset password by email until they add a real one in `/profile`.
- **Rate limit on `/api/login`** is in-memory — meaningless on Vercel's serverless (each invocation = new instance). Replace with Upstash Redis for production if needed. See `lib/rateLimit.js`.
- **Duplicate v12 migration numbers** — see note above.

## Anti-patterns

- ❌ Querying `profiles.email` for users other than self → potential leak
- ❌ Bypassing RLS with `service_role` from the client (use `/api/login` server-only pattern)
- ❌ `select("*")` on `profiles` — always list explicit columns
- ❌ Forgetting `SECURITY DEFINER` + `SET search_path = public` on cross-user aggregation functions
- ❌ Uploading to Storage without `<user_id>/` prefix
