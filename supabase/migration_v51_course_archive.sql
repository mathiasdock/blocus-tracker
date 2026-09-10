-- ============================================================================
-- v51 — Archiver les cours au lieu de les détruire
-- ============================================================================
--
-- LE PROBLÈME
-- Chaque semestre, les cours changent : on supprime les anciens, on crée les
-- nouveaux. La contrainte sessions.course_id est ON DELETE SET NULL, donc les
-- sessions SURVIVENT — le total d'heures reste juste. Mais le nom et la
-- couleur du cours partent avec la ligne supprimée, et tout ce temps retombe
-- dans un seul tas anonyme « Sans cours ».
--
-- Mesuré en base avant d'écrire cette migration : 435 sessions orphelines chez
-- 16 comptes, soit 760 heures d'étude que « Temps par cours » ne sait plus
-- nommer. Chez certains c'est la quasi-totalité de leur historique (un compte
-- à 100 %, un autre à 91 % de 150 heures). Le travail est là, il est compté,
-- mais il n'a plus d'identité.
--
-- LE CHOIX
-- Un cours qui porte un historique n'est plus supprimé : il est ARCHIVÉ. Il
-- disparaît des sélecteurs (chrono, planning, missions) — c'est bien ce que
-- l'utilisateur demande en fin de semestre — mais il garde son nom et sa
-- couleur, donc chaque session passée reste identifiable.
--
-- Un cours SANS aucune session reste vraiment supprimable : là il n'y a pas
-- d'histoire à préserver, c'est une faute de frappe ou un doublon. La règle
-- est appliquée côté client, qui sait ce que le cours porte.
--
-- Rien n'est perdu ni réécrit ici : cette migration ajoute une colonne et
-- apprend aux missions à ignorer les cours archivés. Les 760 heures déjà
-- orphelines gardent leur temps mais pas leur nom — la ligne du cours n'existe
-- plus nulle part, aucune table ne l'a conservé. Ce qui est réparé, c'est que
-- le tas cesse de grossir.
-- ============================================================================

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.courses.archived_at IS
  'Non nul = cours d''un semestre terminé. Retiré des sélecteurs, mais son nom et sa couleur restent pour que les sessions passées gardent leur identité dans les statistiques.';

-- Les sélecteurs ne demandent que les cours actifs : index partiel plutôt que
-- sur toute la table, l'archive n'est lue que par les statistiques.
CREATE INDEX IF NOT EXISTS courses_user_active_idx
  ON public.courses (user_id) WHERE archived_at IS NULL;

-- ── Les missions ne doivent jamais viser un cours archivé ────────────────────
--
-- Sans ça : « étudie 3 cours différents » resterait proposé à quelqu'un qui
-- n'en a plus qu'un d'actif (impossible à finir), et le défi « tu n'as pas
-- ouvert X depuis 12 jours » pointerait un cours du semestre passé.
--
-- Les trois fonctions concernées font 5 800, 3 500 et 5 700 caractères. Les
-- retranscrire ici pour trois filtres, c'est prendre un risque de copie sans
-- contrepartie : on repart de la définition RÉELLE en base, on y insère les
-- filtres, et on échoue bruyamment si un motif attendu a disparu — c'est-à-dire
-- si quelqu'un a modifié ces fonctions entre-temps.
DO $patch$
DECLARE
  defs text[];
  src  text;
  patched text;
  done integer := 0;
BEGIN
  SELECT array_agg(pg_get_functiondef(p.oid) ORDER BY p.proname)
  INTO defs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN ('ensure_daily_missions_for_user',
                      'ensure_weekly_missions_for_user',
                      'gamification_pick_challenge');

  IF defs IS NULL OR array_length(defs, 1) <> 3 THEN
    RAISE EXCEPTION 'v51 : % fonctions de missions trouvées au lieu de 3',
      COALESCE(array_length(defs, 1), 0);
  END IF;

  FOREACH src IN ARRAY defs LOOP
    patched := src;
    -- Compte des cours disponibles (m_2courses / m_3courses, cible w_courses).
    patched := replace(patched,
      'FROM public.courses WHERE user_id = p_user_id;',
      'FROM public.courses WHERE user_id = p_user_id AND archived_at IS NULL;');
    -- Prochain examen : un examen sur un cours archivé n'est plus d'actualité.
    patched := replace(patched,
      'JOIN public.courses c ON c.id = e.course_id',
      'JOIN public.courses c ON c.id = e.course_id AND c.archived_at IS NULL');
    -- Cours délaissé / le moins travaillé : ne jamais renvoyer vers l'archive.
    patched := replace(patched,
      'JOIN public.courses c ON c.id = s.course_id',
      'JOIN public.courses c ON c.id = s.course_id AND c.archived_at IS NULL');

    IF patched = src THEN
      RAISE EXCEPTION 'v51 : aucun motif de cours trouvé dans une des fonctions de missions — elles ont changé depuis la v49, corriger cette migration avant de l''appliquer';
    END IF;

    EXECUTE patched;
    done := done + 1;
  END LOOP;

  IF done <> 3 THEN
    RAISE EXCEPTION 'v51 : % fonctions corrigées au lieu de 3', done;
  END IF;
END
$patch$;
