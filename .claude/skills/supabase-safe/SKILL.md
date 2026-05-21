---
name: supabase-safe
description: Make Supabase query changes (select, insert, update, delete, RPC calls) safely without breaking RLS, leaking data, or causing N+1 queries. Use whenever a `supabase.from(...)` or `supabase.rpc(...)` call needs to be added or modified.
---

# supabase-safe — Don't break RLS, don't leak data

## Critical principles

### 1. Never expose other users' emails
`profiles.email` is a sensitive column. When querying profiles of **other users**, never include `email` in `.select(...)`. List columns explicitly:

```js
// ✅ Good — explicit, no email
supabase.from("profiles")
  .select("id, pseudo, first_name, last_name, avatar_url, university")
  .eq("id", otherUserId)
```

```js
// ❌ Bad — exposes all columns including email
supabase.from("profiles").select("*").eq("id", otherUserId)
```

### 2. Friend-restricted tables
`sessions`, `courses`, `objectives` are visible only to:
- Self
- Accepted friends
- Admins

If you query these for **multiple users** at once (e.g. for a leaderboard), RLS will silently filter out non-friends — but you still need to handle the empty case in UI.

### 3. RPCs over direct joins for cross-user aggregates
For public leaderboards or stats spanning many users, use `SECURITY DEFINER` RPCs already defined in `supabase/`:
- `get_public_leaderboard(p_period, p_university)` — top 50, returns `total_seconds` + `alltime_seconds`
- `get_user_profile_stats(p_user_id)` — only self/friend/admin allowed
- `get_my_study_rank(p_period)` — percentile vs all active users

**Don't try to replicate these with client-side queries** — RLS will block you.

### 4. Realtime subscriptions
- Filter on simple columns only (no joins): `filter: "receiver_id=eq.<uid>"`
- Always `removeChannel(ch)` in the cleanup function of `useEffect`
- See `contexts/NotificationContext.js` for the canonical pattern

### 5. Storage paths must be `<user_id>/...`
RLS on Storage buckets enforces the first folder = owner's UUID. Never upload to a flat path.

```js
// ✅ Good
const path = `${user.id}/${Date.now()}.${ext}`;
supabase.storage.from("posts").upload(path, file);
```

## Workflow

1. Read the file containing the existing query — match its patterns.
2. Before adding a query, **grep for similar queries** in the codebase to avoid duplicates:
   ```
   Grep pattern: from\\(\"profiles\"\\) -- find existing profile queries
   ```
3. If the query joins or aggregates across multiple users, check if an RPC exists in `supabase/migration_*.sql`.
4. If you need a new RPC, follow `new-migration` skill.
5. Always handle the empty result case (`data || []`).
6. Always handle the error case (`if (error) { ... }`).

## Anti-patterns

- ❌ `select("*")` on profiles → exposes email
- ❌ Modifying the schema directly via the client (use a migration)
- ❌ Calling Supabase from a render function (always inside `useEffect` or event handler)
- ❌ Using `service_role` key client-side (only `/api/login` uses it server-side)
- ❌ Forgetting `.eq("user_id", user.id)` on a self-only query (RLS will save you, but explicit is safer)

## Reference
- Client: `lib/supabaseClient.js`
- Server route: `pages/api/login.js`
- Schema + migrations: `supabase/`
- Full table/RLS doc: `docs/SUPABASE.md`
