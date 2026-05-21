-- ================================================================
--  blocus-tracker — migration v8 : sécurisation complète
--
--  Corrections apportées :
--    1. friendships_update  → seul l'addressee peut accepter
--    2. friendships_insert  → interdire l'auto-amitié
--    3. pm_insert           → MP uniquement vers un ami accepté
--    4. dm bucket           → rendu privé, lecture restreinte
--    5. is_friend_or_self   → helper réutilisable
--    6. sessions / courses / objectives → lecture amis+soi seulement
--    7. Contraintes de longueur sur les contenus texte
--    8. comments / likes    → supprimer la policy FOR ALL
--                             (no UPDATE autorisé)
--    9. study_groups / group_members / group_messages
--                           → tables sans migration SQL existante
--                             (création + RLS complète)
--
--  À exécuter dans l'éditeur SQL Supabase (une seule fois).
-- ================================================================


-- ---------------------------------------------------------------
-- 1. FRIENDSHIPS — seul l'addressee peut accepter une demande
--
--  Avant : using (auth.uid() = requester OR auth.uid() = addressee)
--  Un expéditeur pouvait s'accepter lui-même en mettant status='accepted'.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
CREATE POLICY "friendships_update" ON public.friendships
  FOR UPDATE TO authenticated
  USING  (auth.uid() = addressee)
  WITH CHECK (
    auth.uid() = addressee
    AND status = 'accepted'   -- seule transition autorisée via RLS
  );


-- ---------------------------------------------------------------
-- 2. FRIENDSHIPS — interdire l'auto-amitié
--
--  Contrainte DB (inviolable) + policy INSERT durcie.
-- ---------------------------------------------------------------
ALTER TABLE public.friendships
  ADD CONSTRAINT no_self_friendship CHECK (requester <> addressee);

DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester
    AND requester <> addressee
  );


-- ---------------------------------------------------------------
-- 3. PRIVATE MESSAGES — uniquement vers un ami accepté
--
--  Avant : n'importe quel utilisateur pouvait écrire à n'importe qui.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "pm_insert" ON public.private_messages;
CREATE POLICY "pm_insert" ON public.private_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND (
          (requester = auth.uid() AND addressee = receiver_id)
          OR (addressee = auth.uid() AND requester = receiver_id)
        )
    )
  );


-- ---------------------------------------------------------------
-- 4. STORAGE — bucket dm rendu privé
--
--  Avant : public = true → n'importe qui (non connecté inclus)
--  pouvait accéder à une pièce jointe DM en connaissant l'URL.
-- ---------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'dm';

DROP POLICY IF EXISTS "dm_public_read" ON storage.objects;

CREATE POLICY "dm_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dm'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ---------------------------------------------------------------
-- 5. HELPER — is_friend_or_self(target_user)
--
--  Retourne true si target_user est l'utilisateur connecté
--  ou un ami avec statut 'accepted'.
--  Utilisé par les policies sessions / courses / objectives.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_friend_or_self(target_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_user = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND (
          (requester = auth.uid() AND addressee = target_user)
          OR (addressee = auth.uid() AND requester = target_user)
        )
    );
$$;


-- ---------------------------------------------------------------
-- 6. SESSIONS / COURSES / OBJECTIVES
--    Lecture restreinte à soi-même + ses amis acceptés.
--    Exception : les admins voient tout (pour les stats globales).
--
--  Avant : using (true) → tout utilisateur connecté pouvait lire
--  toutes les sessions, cours et objectifs de la base entière.
--
--  Deux policies par table (RLS les combine en OR) :
--    a) utilisateur normal → soi-même + amis
--    b) admin → tout
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "sessions_read"        ON public.sessions;
DROP POLICY IF EXISTS "sessions_read_admin"  ON public.sessions;
DROP POLICY IF EXISTS "courses_read"         ON public.courses;
DROP POLICY IF EXISTS "courses_read_admin"   ON public.courses;
DROP POLICY IF EXISTS "objectives_read"      ON public.objectives;
DROP POLICY IF EXISTS "objectives_read_admin" ON public.objectives;

-- Sessions
CREATE POLICY "sessions_read" ON public.sessions
  FOR SELECT TO authenticated
  USING (public.is_friend_or_self(user_id));

CREATE POLICY "sessions_read_admin" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Courses
CREATE POLICY "courses_read" ON public.courses
  FOR SELECT TO authenticated
  USING (public.is_friend_or_self(user_id));

CREATE POLICY "courses_read_admin" ON public.courses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Objectives
CREATE POLICY "objectives_read" ON public.objectives
  FOR SELECT TO authenticated
  USING (public.is_friend_or_self(user_id));

CREATE POLICY "objectives_read_admin" ON public.objectives
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );


-- ---------------------------------------------------------------
-- 7. CONTRAINTES DE LONGUEUR
--    Empêche les insertions de contenus massifs (attaque
--    par saturation du quota de stockage).
-- ---------------------------------------------------------------
ALTER TABLE public.community_messages
  ADD CONSTRAINT cmsg_content_len
    CHECK (content IS NULL OR char_length(content) <= 2000);

ALTER TABLE public.private_messages
  ADD CONSTRAINT pm_content_len
    CHECK (content IS NULL OR char_length(content) <= 2000);

ALTER TABLE public.comments
  ADD CONSTRAINT comment_content_len
    CHECK (char_length(content) <= 1000);

ALTER TABLE public.posts
  ADD CONSTRAINT post_caption_len
    CHECK (caption IS NULL OR char_length(caption) <= 500);

ALTER TABLE public.profiles
  ADD CONSTRAINT profile_bio_len
    CHECK (bio IS NULL OR char_length(bio) <= 300);

ALTER TABLE public.profiles
  ADD CONSTRAINT profile_pseudo_len
    CHECK (char_length(pseudo) BETWEEN 3 AND 30);


-- ---------------------------------------------------------------
-- 8. COMMENTS / LIKES — supprimer FOR ALL, pas d'UPDATE autorisé
--
--  Avant : "FOR ALL" couvrait aussi UPDATE → un utilisateur pouvait
--  modifier le post_id, user_id ou content d'un commentaire existant.
-- ---------------------------------------------------------------

-- COMMENTS
DROP POLICY IF EXISTS "comments_write" ON public.comments;

CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_delete" ON public.comments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- LIKES
DROP POLICY IF EXISTS "likes_write" ON public.likes;

CREATE POLICY "likes_insert" ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "likes_delete" ON public.likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ---------------------------------------------------------------
-- 9. STUDY GROUPS / GROUP MEMBERS / GROUP MESSAGES
--
--  Ces tables sont utilisées par les pages /messages et /groupes
--  mais n'avaient aucun fichier de migration SQL → probablement
--  sans RLS (toutes les données lisibles / modifiables par tous).
--
--  On crée les tables si elles n'existent pas encore, on active
--  RLS et on définit les policies.
-- ---------------------------------------------------------------

-- --- Création des tables ---

CREATE TABLE IF NOT EXISTS public.study_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  created_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid        NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid        NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         text,
  attachment_url  text,
  attachment_type text,
  attachment_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grp_msg_len CHECK (content IS NULL OR char_length(content) <= 2000)
);

CREATE INDEX IF NOT EXISTS group_messages_group_idx
  ON public.group_messages (group_id, created_at);

-- --- Activation RLS ---
ALTER TABLE public.study_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;


-- --- Helper : est-on membre du groupe ? ---
CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;


-- --- STUDY_GROUPS policies ---
DROP POLICY IF EXISTS "sg_select"            ON public.study_groups;
DROP POLICY IF EXISTS "sg_insert"            ON public.study_groups;
DROP POLICY IF EXISTS "sg_delete"            ON public.study_groups;
DROP POLICY IF EXISTS "creator_see_own_group" ON public.study_groups;

-- Lecture : membres du groupe OU créateur (avant l'ajout comme membre)
CREATE POLICY "sg_select" ON public.study_groups
  FOR SELECT TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_group_member(id)
  );

-- Création : n'importe quel utilisateur connecté peut créer un groupe
CREATE POLICY "sg_insert" ON public.study_groups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Suppression : uniquement le créateur
CREATE POLICY "sg_delete" ON public.study_groups
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);


-- --- GROUP_MEMBERS policies ---
DROP POLICY IF EXISTS "gm_select" ON public.group_members;
DROP POLICY IF EXISTS "gm_insert" ON public.group_members;
DROP POLICY IF EXISTS "gm_delete" ON public.group_members;

-- Lecture : les membres voient la liste des membres de leur groupe
CREATE POLICY "gm_select" ON public.group_members
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

-- Ajout d'un membre :
--   • Le créateur s'ajoute lui-même en tant qu'admin juste après création
--   • Un admin existant du groupe peut inviter quelqu'un
CREATE POLICY "gm_insert" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Créateur s'ajoute comme admin
    (
      auth.uid() = user_id
      AND role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.study_groups sg
        WHERE sg.id = group_id AND sg.created_by = auth.uid()
      )
    )
    -- Admin existant invite un nouveau membre
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  );

-- Suppression : soi-même (quitter) ou admin du groupe (exclure quelqu'un)
CREATE POLICY "gm_delete" ON public.group_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  );


-- --- GROUP_MESSAGES policies ---
DROP POLICY IF EXISTS "gmsg_select" ON public.group_messages;
DROP POLICY IF EXISTS "gmsg_insert" ON public.group_messages;
DROP POLICY IF EXISTS "gmsg_delete" ON public.group_messages;

-- Lecture : membres du groupe seulement
CREATE POLICY "gmsg_select" ON public.group_messages
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

-- Envoi : membres du groupe seulement
CREATE POLICY "gmsg_insert" ON public.group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_group_member(group_id)
  );

-- Suppression : auteur OU admin du groupe OU admin global
CREATE POLICY "gmsg_delete" ON public.group_messages
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );


-- ---------------------------------------------------------------
-- Résumé des protections ajoutées par cette migration :
--
--  #1  friendships_update   : seul l'addressee peut accepter
--  #2  friendships_insert   : contrainte no_self_friendship DB + policy
--  #3  pm_insert            : MP uniquement entre amis acceptés
--  #4  dm bucket            : privé — lecture restreinte au propriétaire
--  #5  is_friend_or_self()  : helper SQL pour les policies suivantes
--  #6  sessions/courses/obj : lecture restreinte amis+soi (plus using(true))
--  #7  contraintes longueur : content ≤ 2000 / caption ≤ 500 / bio ≤ 300
--  #8  comments/likes       : plus de UPDATE possible (INSERT+DELETE only)
--  #9  study_groups + group_members + group_messages : RLS complète
-- ---------------------------------------------------------------
