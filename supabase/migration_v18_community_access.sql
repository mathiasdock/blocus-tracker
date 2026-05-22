-- Migration v18 : accès communautés restreint à sa propre université
--
-- Avant : tout utilisateur authentifié lisait toutes les communautés.
-- Après : un utilisateur normal n'accède qu'au chat de SON université
--         (profiles.university), un admin accède à tout.
--
-- Mécanisme : la table community_messages.community stocke un id ('ULB'…),
-- alors que profiles.university stocke le nom complet ('Université Libre…').
-- On introduit une table de correspondance university_communities(id, full)
-- + une fonction can_access_community() utilisée dans les policies RLS.
--
-- ⚠️ Cette table doit rester synchronisée avec lib/universities.js
--    (même couples id / full). Ajoute toute nouvelle école ici aussi.

-- ============================================================
-- 1. Table de correspondance id <-> nom complet
-- ============================================================

CREATE TABLE IF NOT EXISTS public.university_communities (
  id        text PRIMARY KEY,
  full_name text NOT NULL UNIQUE
);

INSERT INTO public.university_communities (id, full_name) VALUES
  ('ULB',    'Université Libre de Bruxelles'),
  ('UCL',    'Université catholique de Louvain'),
  ('USL',    'UCLouvain Saint-Louis — Bruxelles'),
  ('ICHEC',  'ICHEC Brussels Management School'),
  ('EPHEC',  'Haute École EPHEC'),
  ('IHECS',  'IHECS — communication & journalisme'),
  ('KUL',    'Katholieke Universiteit Leuven'),
  ('ULIEGE', 'Université de Liège'),
  ('UNAMUR', 'Université de Namur'),
  ('SOLVAY', 'Solvay Brussels School'),
  ('HECLG',  'HEC Liège — Management School'),
  ('ECAM',   'ECAM Brussels Engineering School'),
  ('VUB',    'Vrije Universiteit Brussel'),
  ('HELDV',  'HEC Léonard de Vinci'),
  ('HE2B',   'HE2B'),
  ('UMONS',  'UMONS'),
  ('HELHA',  'HELHa'),
  ('ISFSC',  'ISFSC'),
  ('HEFF',   'Haute École Francisco Ferrer'),
  ('GALILEE','Haute École Galilée'),
  ('CAMBRE', 'La Cambre'),
  ('CAD',    'CAD — College of Art and Design'),
  ('HEC',    'HEC Paris'),
  ('ESSEC',  'ESSEC Business School'),
  ('ESCP',   'ESCP Business School'),
  ('EDHEC',  'EDHEC Business School'),
  ('EMLYON', 'emlyon business school'),
  ('KEDGE',  'KEDGE Business School'),
  ('UVA',    'Universiteit van Amsterdam'),
  ('MAAS',   'Maastricht University'),
  ('EUR',    'Erasmus Universiteit Rotterdam'),
  ('IE',     'IE University — Madrid'),
  ('ESADE',  'ESADE Business & Law School'),
  ('IESE',   'IESE Business School'),
  ('UEUR',   'Universidad Europea'),
  ('EADA',   'EADA Business School'),
  ('UNIGE',  'Université de Genève'),
  ('HECL',   'HEC Lausanne — UNIL'),
  ('EPFL',   'École Polytechnique Fédérale de Lausanne'),
  ('EHL',    'EHL Hospitality Business School')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Lecture publique de la correspondance (non sensible).
ALTER TABLE public.university_communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uc_read" ON public.university_communities;
CREATE POLICY "uc_read" ON public.university_communities
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. Fonction : l'utilisateur courant peut-il accéder à `c` ?
--    Admin -> tout. Sinon -> uniquement sa propre communauté.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_community(c text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.university_communities uc ON uc.full_name = p.university
      WHERE p.id = auth.uid() AND uc.id = c
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_community(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.can_access_community(text) TO authenticated;

-- ============================================================
-- 3. Policies community_messages
-- ============================================================

DROP POLICY IF EXISTS "cmsg_read"   ON public.community_messages;
DROP POLICY IF EXISTS "cmsg_insert" ON public.community_messages;
DROP POLICY IF EXISTS "cmsg_delete" ON public.community_messages;

-- Lecture : uniquement la communauté de l'utilisateur (ou admin partout)
CREATE POLICY "cmsg_read"
  ON public.community_messages FOR SELECT TO authenticated
  USING ( public.can_access_community(community) );

-- Écriture : son propre message ET dans une communauté autorisée
CREATE POLICY "cmsg_insert"
  ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK ( auth.uid() = user_id AND public.can_access_community(community) );

-- Suppression : son propre message, ou admin
CREATE POLICY "cmsg_delete"
  ON public.community_messages FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
  );
