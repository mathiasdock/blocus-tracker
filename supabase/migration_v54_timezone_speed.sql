-- v54 — gamification_timezone : 60 ms → quasi rien par appel.
--
-- La fonction validait le fuseau en parcourant pg_timezone_names, qui relit la
-- base des fuseaux sur disque à CHAQUE appel (~60 ms). Elle est appelée par
-- utilisateur dans les séries, les niveaux (get_gamification_levels) et les
-- missions : pour les 5 personnes d'un classement, get_gamification_levels
-- prenait 11 s, dépassait le délai de 8 s, et l'app retombait sur un calcul de
-- secours qui donnait un niveau faux (13 au lieu de 15).
--
-- Même règle : fuseau du profil s'il est un nom de fuseau valide, sinon
-- Europe/Paris. La validité est testée en l'appliquant (erreur = invalide),
-- et limitée à la forme d'un nom IANA pour refuser les chaînes POSIX libres.
CREATE OR REPLACE FUNCTION public.gamification_timezone(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_tz text;
BEGIN
  SELECT COALESCE(p.timezone, 'Europe/Paris') INTO v_tz
  FROM public.profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_tz !~ '^[A-Za-z][A-Za-z0-9_+\-]*(/[A-Za-z0-9_+\-]+)*$' THEN
    RETURN 'Europe/Paris';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'Europe/Paris';
  END;
  RETURN v_tz;
END;
$function$;
