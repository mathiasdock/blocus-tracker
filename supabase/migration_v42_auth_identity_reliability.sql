-- ================================================================
-- Blocus Tracker - v42 auth identity reliability
--
-- Manual migration: run once after v41.
-- Makes Supabase Auth the only source of truth for login/recovery email,
-- repairs stale profile copies in the safe Auth -> profile direction, and
-- adds a case-insensitive pseudo resolver used only by the server login API.
-- ================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS profiles_pseudo_login_normalized_idx
  ON public.profiles (lower(btrim(pseudo)));

-- The historical case-only duplicate prevents a normalized UNIQUE index.
-- Serialize new pseudo claims instead, preserving the two old exact spellings
-- while ensuring no future signup can create another ambiguous login.
CREATE OR REPLACE FUNCTION public.prevent_new_normalized_pseudo_collision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_normalized text := lower(btrim(NEW.pseudo));
BEGIN
  -- An UPDATE that does not actually change the spelling must remain valid for
  -- the two historical case-only duplicates which predate this guard.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pseudo IS NOT DISTINCT FROM OLD.pseudo THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_normalized IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_normalized, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(btrim(p.pseudo)) = v_normalized
      AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Pseudo already exists'
      USING ERRCODE = '23505',
            CONSTRAINT = 'profiles_pseudo_login_normalized';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_new_normalized_pseudo_collision()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_new_normalized_pseudo_collision()
  TO service_role;

DROP TRIGGER IF EXISTS prevent_new_normalized_pseudo_collision ON public.profiles;
CREATE TRIGGER prevent_new_normalized_pseudo_collision
BEFORE INSERT OR UPDATE OF pseudo ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_new_normalized_pseudo_collision();

CREATE OR REPLACE FUNCTION public.resolve_login_user_id(p_pseudo text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pseudo text := btrim(p_pseudo);
  v_exact_id uuid;
  v_match_id uuid;
  v_match_count integer;
BEGIN
  IF v_pseudo IS NULL OR char_length(v_pseudo) < 1 OR char_length(v_pseudo) > 60 THEN
    RETURN NULL;
  END IF;

  -- Preserve both existing accounts when a historical case-only duplicate
  -- exists: the exact spelling disambiguates it.
  SELECT p.id
  INTO v_exact_id
  FROM public.profiles p
  WHERE p.pseudo = v_pseudo
  LIMIT 1;

  IF v_exact_id IS NOT NULL THEN
    RETURN v_exact_id;
  END IF;

  SELECT count(*), min(p.id::text)::uuid
  INTO v_match_count, v_match_id
  FROM public.profiles p
  WHERE lower(btrim(p.pseudo)) = lower(v_pseudo);

  IF v_match_count = 1 THEN
    RETURN v_match_id;
  END IF;

  -- No match, or an ambiguous historical duplicate: never guess an account.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_user_id(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_user_id(text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_auth_email_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = CASE
      WHEN NEW.email IS NULL OR lower(NEW.email) LIKE '%@blocus.local' THEN NULL
      ELSE lower(NEW.email)
    END
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_email_to_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_auth_email_to_profile() TO service_role;

DROP TRIGGER IF EXISTS on_auth_email_update ON auth.users;
CREATE TRIGGER on_auth_email_update
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_auth_email_to_profile();

-- A rerun may already have the compatibility guard installed. Temporarily
-- remove it inside this transaction so the cleanup below can repair stale
-- rows; it is recreated after reconciliation.
DROP TRIGGER IF EXISTS enforce_profile_email_from_auth ON public.profiles;

-- Clear stale copies which currently point at another account's Auth email
-- before filling the canonical values, avoiding unique-index collisions.
UPDATE public.profiles p
SET email = NULL
WHERE p.email IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id <> p.id
      AND lower(u.email) = lower(p.email)
  );

UPDATE public.profiles p
SET email = CASE
  WHEN u.email IS NULL OR lower(u.email) LIKE '%@blocus.local' THEN NULL
  ELSE lower(u.email)
END
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS DISTINCT FROM CASE
    WHEN u.email IS NULL OR lower(u.email) LIKE '%@blocus.local' THEN NULL
    ELSE lower(u.email)
  END;

-- Keep the old deployed client compatible during rollout: it still attempts a
-- profile UPDATE before asking Auth to change the email. The write succeeds,
-- but this trigger replaces any submitted value with the canonical Auth value.
-- After confirmation, on_auth_email_update performs the real synchronization.
-- Install it after reconciliation so historical cross-account swaps cannot
-- collide with the unique profile-email index during the cleanup above.
CREATE OR REPLACE FUNCTION public.enforce_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_auth_email text;
BEGIN
  SELECT CASE
    WHEN u.email IS NULL OR lower(u.email) LIKE '%@blocus.local' THEN NULL
    ELSE lower(u.email)
  END
  INTO v_auth_email
  FROM auth.users u
  WHERE u.id = OLD.id;

  NEW.email := v_auth_email;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_email_from_auth()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_email_from_auth() TO service_role;

DROP TRIGGER IF EXISTS enforce_profile_email_from_auth ON public.profiles;
CREATE TRIGGER enforce_profile_email_from_auth
BEFORE UPDATE OF email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_email_from_auth();

GRANT UPDATE (email) ON public.profiles TO authenticated;

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.profiles p JOIN auth.users u ON u.id = p.id
--   WHERE p.email IS DISTINCT FROM CASE
--     WHEN u.email IS NULL OR lower(u.email) LIKE '%@blocus.local' THEN NULL
--     ELSE lower(u.email)
--   END;
-- Expected: 0
