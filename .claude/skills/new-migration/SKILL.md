---
name: new-migration
description: Create a new SQL migration file in supabase/ with the project's conventions (DROP IF EXISTS, CREATE, GRANT, SECURITY DEFINER for cross-user reads). Use when a schema change, new RPC, or RLS policy update is needed. Never executes the SQL — only creates the file.
disable-model-invocation: true
---

# new-migration — Template for safe SQL migrations

> **Manual-only skill.** Invoke explicitly with `/new-migration` — Claude will never trigger this automatically. Migrations have lasting consequences on the production database; you must decide when to write one.

## Project conventions

### Naming
- `supabase/migration_vXX_<short_topic>.sql`
- `XX` is the next free number. Current max: **v13** (`migration_v13_leaderboard_levels.sql`)
- ⚠️ **Avoid duplicate numbers**: the project already has 3 different `v12_*` files. New migrations should use v14+.

### Order of operations in a single file
1. Optional: `DROP FUNCTION IF EXISTS ...` if changing return type or signature
2. `CREATE [OR REPLACE]` the object
3. `REVOKE ALL ... FROM public` to lock down
4. `GRANT EXECUTE ... TO authenticated` (or `anon` only for login helpers)

### SECURITY DEFINER
Functions that bypass RLS to aggregate across users (leaderboards, stats) must be `SECURITY DEFINER` AND `SET search_path = public`. Otherwise a search_path injection attack is possible.

```sql
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
```

### Read vs write
- Read RPCs → `STABLE`
- Write RPCs (mutations) → `VOLATILE` (default)

## Template — read RPC across users

```sql
-- Migration vXX : <one-line purpose>
-- <Optional context — what bug / feature this fixes>

DROP FUNCTION IF EXISTS public.<fn_name>(<arg_types>);

CREATE OR REPLACE FUNCTION public.<fn_name>(
  p_arg1 text DEFAULT NULL
)
RETURNS TABLE(
  col1 uuid,
  col2 text,
  col3 bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ...
  FROM public.<table>
  WHERE ...
  ORDER BY ...
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.<fn_name>(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.<fn_name>(text) TO authenticated;
```

## Template — new column

```sql
-- Migration vXX : add <column> to <table>

ALTER TABLE public.<table>
  ADD COLUMN IF NOT EXISTS <column_name> <type>;

-- If column needs an index:
CREATE INDEX IF NOT EXISTS idx_<table>_<column>
  ON public.<table>(<column_name>);

-- If column needs RLS-aware default:
UPDATE public.<table> SET <column_name> = <default> WHERE <column_name> IS NULL;
```

## Template — new RLS policy

```sql
-- Migration vXX : tighten <table> RLS

ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "<policy_name>" ON public.<table>;
CREATE POLICY "<policy_name>" ON public.<table>
  FOR SELECT
  USING (<predicate>);
```

## Workflow

1. Check `supabase/` for the highest version number used.
2. Pick the next free `vXX` (avoid duplicates — currently used: v3–v13 plus several `vXX_*` variants).
3. Write the file with the template above.
4. **Stop there.** Don't run the SQL, don't open Supabase, don't push anything.
5. Tell the user: "Migration ready at `supabase/migration_vXX_*.sql`. Paste it in Supabase → SQL Editor and run."
6. If the file changes a function's return type → remind user the `DROP FUNCTION IF EXISTS` is mandatory.

## Anti-patterns

- ❌ Reusing a version number that already exists
- ❌ Forgetting `SET search_path = public` on SECURITY DEFINER functions
- ❌ Granting EXECUTE to `public` instead of `authenticated`
- ❌ Running the SQL via Bash (we don't have psql configured; user runs it manually)

## Reference
- Existing migrations: `supabase/migration_v*.sql`
- Full Supabase doc: `docs/SUPABASE.md`
