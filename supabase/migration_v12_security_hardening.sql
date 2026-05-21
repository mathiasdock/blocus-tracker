-- ================================================================
--  blocus-tracker — migration v12 : security hardening (audit fixes)
--
--  Failles critiques corrigées :
--    1. friendships INSERT       → impossible d'insérer status='accepted'
--    2. get_login_email          → restreint aux utilisateurs authentifiés
--                                  (l'API serveur /api/login resolves via service_role)
--    3. get_user_profile_stats   → self / ami accepté / admin uniquement
--    4. get_my_email             → nouveau helper pour accès self à l'email
--    5. Optionnel : revoke SELECT (email) au niveau colonne
--
--  À exécuter UNE SEULE FOIS dans le SQL Editor Supabase.
-- ================================================================


-- ---------------------------------------------------------------
-- 1. FRIENDSHIPS — INSERT obligatoirement en 'pending'
--
--  Avant : auth.uid()=requester AND requester<>addressee
--          → un utilisateur pouvait s'auto-accepter en INSERT
--            directement avec status='accepted'.
--
--  Après : on impose status='pending' au niveau RLS + contrainte CHECK
--          au niveau table.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester
    AND requester <> addressee
    AND status = 'pending'   -- ← bloque le force-accept
  );

-- Contrainte DB : seules les transitions valides sont autorisées
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendship_status_valid;
ALTER TABLE public.friendships ADD CONSTRAINT friendship_status_valid
  CHECK (status IN ('pending', 'accepted'));


-- ---------------------------------------------------------------
-- 2. GET_LOGIN_EMAIL — restreint aux utilisateurs authentifiés
--
--  Avant : appelable par anon → permettait d'énumérer les emails
--          de tous les utilisateurs en testant des pseudos.
--
--  Après : refuse l'appel si auth.role() <> 'authenticated'.
--          Le login front-end utilise désormais l'API route
--          /api/login (service_role côté serveur) pour résoudre
--          l'email lors du login par pseudo.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_login_email(p_pseudo text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501', HINT = 'Use the server-side /api/login endpoint to login by pseudo';
  END IF;

  RETURN COALESCE(
    (SELECT email FROM public.profiles
     WHERE pseudo = p_pseudo AND email IS NOT NULL),
    p_pseudo || '@blocus.local'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_login_email(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_login_email(text) TO authenticated, service_role;


-- ---------------------------------------------------------------
-- 3. GET_USER_PROFILE_STATS — restreint à self / ami accepté / admin
--
--  Avant : la fonction renvoyait les stats de n'importe quel
--          utilisateur si on connaissait son uuid.
--
--  Après : RAISE EXCEPTION si l'appelant n'est pas autorisé.
--          Le front gère déjà gracieusement l'absence de stats.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_profile_stats(p_user_id uuid)
RETURNS TABLE (total_seconds bigint, seconds_30d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Seuls : soi-même, ami accepté, ou admin
  IF NOT (
    public.is_friend_or_self(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view profile stats'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(s.duration_seconds), 0)::bigint AS total_seconds,
    COALESCE(SUM(
      CASE WHEN s.started_at >= (CURRENT_DATE - INTERVAL '30 days')::timestamptz
           THEN s.duration_seconds ELSE 0 END
    ), 0)::bigint AS seconds_30d
  FROM public.sessions s
  WHERE s.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_profile_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile_stats(uuid) TO authenticated;


-- ---------------------------------------------------------------
-- 4. GET_MY_EMAIL — helper sûr pour accès self à l'email
--
--  Permet au front de récupérer l'email de l'utilisateur courant
--  sans avoir besoin de SELECT direct sur la colonne email
--  (utile si on active la révocation colonne plus bas).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_email() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;


-- ---------------------------------------------------------------
-- 5. (OPTIONNEL — défense en profondeur)
--
--  Une fois que TOUS les select("*") sur profiles côté front-end
--  ont été remplacés par des colonnes explicites (sans email),
--  on peut révoquer l'accès SELECT direct à la colonne email.
--
--  Le code front utilise alors public.get_my_email() pour récupérer
--  son propre email. La signature/inscription continue d'utiliser
--  INSERT/UPDATE (privilèges distincts de SELECT).
--
--  ATTENTION : à ne décommenter qu'après avoir vérifié toutes les
--  requêtes profiles. Sinon des pages crasheront silencieusement.
-- ---------------------------------------------------------------
-- REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;
-- GRANT  SELECT (email) ON public.profiles TO service_role;


-- ================================================================
--  Tests de vérification (à exécuter manuellement après migration)
-- ================================================================
--
--  ──  Test #1 : force-add friend  ──
--    Connecté en tant qu'utilisateur A, exécuter dans SQL Editor :
--      INSERT INTO public.friendships (requester, addressee, status)
--      VALUES (auth.uid(), '<uuid-B>', 'accepted');
--    Résultat attendu :
--      ERROR: new row violates row-level security policy ...
--
--  ──  Test #2 : get_login_email anonyme  ──
--    Dans SQL Editor en rôle 'anon' :
--      SELECT get_login_email('mathias.dock');
--    Résultat attendu :
--      ERROR: Authentication required
--
--  ──  Test #3 : stats d'un non-ami  ──
--    Connecté en utilisateur A (pas ami de B), exécuter :
--      SELECT * FROM get_user_profile_stats('<uuid-B-non-ami>');
--    Résultat attendu :
--      ERROR: Not authorized to view profile stats
--
--  ──  Test #4 : stats d'un ami / soi-même / admin  ──
--    Doit retourner une ligne avec total_seconds et seconds_30d.
--
--  ──  Test #5 : get_my_email  ──
--    Connecté en utilisateur A :
--      SELECT get_my_email();
--    Résultat attendu : son propre email (ou NULL).
--
--  ──  Test #6 : transitions friendship valides  ──
--    Demande d'ami normale (INSERT pending) → OK
--    Acceptation par l'addressee (UPDATE status='accepted') → OK
--    UPDATE par le requester → bloqué par friendships_update (v8)
-- ================================================================
