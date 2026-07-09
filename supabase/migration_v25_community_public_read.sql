-- Migration v25 : communautes ouvertes en lecture a tous + support Questions/Examens
--
-- Avant (v18) : un utilisateur normal ne pouvait LIRE que le chat de SA
--               propre universite (can_access_community(community)).
-- Apres        : n'importe quel utilisateur authentifie peut LIRE n'importe
--               quelle communaute (vraie fonction "annuaire d'ecoles" ouvert
--               a tous, cf. refonte page Communautes). L'ECRITURE reste
--               restreinte a sa propre communaute (ou admin) : on ne change
--               PAS cmsg_insert / cmsg_delete.
--
-- Ajoute aussi 2 colonnes nullables, purement additives (aucune ligne
-- existante n'est modifiee) :
--   - parent_id : permet un fil de reponses leger sous une "Question"
--                 (onglet Questions -> forum simple avec nombre de reponses).
--                 ON DELETE CASCADE (pas SET NULL) : si la question racine
--                 est supprimee (ou son auteur supprime son compte, ce qui
--                 cascade deja sur community_messages via user_id ON DELETE
--                 CASCADE), ses reponses disparaissent avec elle plutot que
--                 de se retrouver orphelines avec parent_id=NULL — sans ca,
--                 une reponse orpheline (taguee sans prefixe) reapparaitrait
--                 comme un message "Salon" ordinaire, hors contexte.
--   - exam_date : date structuree pour les messages tagues "[Examen]",
--                 necessaire pour un vrai badge J-5/J-12 fiable (pas invente)
--                 et pour le bouton "Ajouter a mon planning".

-- ============================================================
-- 1. Lecture publique des messages de communaute
-- ============================================================

DROP POLICY IF EXISTS "cmsg_read" ON public.community_messages;

CREATE POLICY "cmsg_read"
  ON public.community_messages FOR SELECT TO authenticated
  USING (true);

-- cmsg_insert et cmsg_delete restent inchangees (v18) : on peut ECRIRE
-- uniquement dans sa propre communaute (ou etre admin), meme si on peut
-- desormais LIRE toutes les communautes.

-- ============================================================
-- 2. Fil de reponses (Questions) + date structuree (Examens)
-- ============================================================

ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.community_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS exam_date date;

CREATE INDEX IF NOT EXISTS community_messages_parent_id_idx
  ON public.community_messages (parent_id);

CREATE INDEX IF NOT EXISTS community_messages_exam_date_idx
  ON public.community_messages (community, exam_date)
  WHERE exam_date IS NOT NULL;
