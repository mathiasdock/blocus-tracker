-- Migration v31 : succession d'admin de groupe — un groupe ne peut plus devenir
-- INGERABLE (sans admin) ni ORPHELIN (sans membre).
--
-- Contexte. study_groups.created_by = le "proprietaire" du groupe : cote client
-- c'est lui seul qui voit les controles (inviter / exclure / supprimer), via
-- `amCreator = created_by === user.id` ; cote RLS c'est lui seul qui peut
-- supprimer le groupe (policy sg_delete). Le role 'admin' de group_members
-- n'est JAMAIS promu (aucune feature, et aucune policy UPDATE sur la table).
--
-- Aujourd'hui l'UI empeche presque toujours le probleme : le proprietaire ne
-- voit que "Supprimer" (jamais "Quitter"), et le retrait d'un membre exclut sa
-- propre ligne. Le seul chemin residuel est un super-admin du SITE
-- (profiles.is_admin) qui se retire d'un groupe qu'il a cree. MAIS l'invariant
-- doit tenir quel que soit le chemin : une feature future ("promouvoir",
-- "quitter" pour le proprietaire), un acces API/SQL direct, une reparation de
-- donnees... Ce trigger le garantit cote BASE.
--
-- A CHAQUE depart d'un membre (DELETE sur group_members), si le groupe existe
-- encore :
--   • plus aucun membre        -> on supprime le groupe (messages + chrono
--     suivent, deja en ON DELETE CASCADE) ;
--   • plus aucun admin restant -> on promeut le membre le plus ancien : role
--     'admin' ET transfert de study_groups.created_by vers lui. Il recupere
--     ainsi TOUS les controles cote client (amCreator devient vrai) et le droit
--     de suppression (RLS) — zero changement d'UI necessaire.
--
-- Idempotent. Coexiste avec le trigger AFTER INSERT de la v28 (evenement
-- different). SECURITY DEFINER : contourne la RLS (sg_delete/created_by) pour
-- pouvoir reparer quel que soit l'utilisateur a l'origine du depart.
--
-- ⚠️ A executer manuellement dans le SQL Editor Supabase. Test conseille : creer
-- un groupe jetable a 2 comptes, retirer le proprietaire en SQL, verifier que
-- l'autre membre devient admin + created_by ; vider le groupe, verifier qu'il
-- disparait.

CREATE OR REPLACE FUNCTION public.group_members_succession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_remaining int;
  v_admins    int;
  v_heir      uuid;
BEGIN
  -- Depart du a la suppression du groupe lui-meme (cascade) : ne rien faire,
  -- et surtout ne pas boucler.
  IF NOT EXISTS (SELECT 1 FROM public.study_groups WHERE id = OLD.group_id) THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.group_members
  WHERE group_id = OLD.group_id;

  -- Dernier membre parti -> groupe orphelin : on le supprime (cascade).
  IF v_remaining = 0 THEN
    DELETE FROM public.study_groups WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_admins
  FROM public.group_members
  WHERE group_id = OLD.group_id AND role = 'admin';

  -- Il reste des membres mais plus d'admin -> succession : le membre le plus
  -- ancien devient admin ET nouveau proprietaire.
  IF v_admins = 0 THEN
    SELECT user_id INTO v_heir
    FROM public.group_members
    WHERE group_id = OLD.group_id
    ORDER BY joined_at ASC, id ASC
    LIMIT 1;

    UPDATE public.group_members
    SET role = 'admin'
    WHERE group_id = OLD.group_id AND user_id = v_heir;

    UPDATE public.study_groups
    SET created_by = v_heir
    WHERE id = OLD.group_id;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.group_members_succession() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS group_members_succession_trg ON public.group_members;
CREATE TRIGGER group_members_succession_trg
  AFTER DELETE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.group_members_succession();
