-- Migration v32 : le FEED respecte enfin la visibilite 'friends' cote BASE.
--
-- Bug de confidentialite. `posts.visibility` ('public' | 'friends') existe
-- (contrainte ajoutee en v24), mais la policy de lecture est restee celle du
-- schema initial : `posts_read ... USING (true)`. La visibilite 'friends'
-- n'apparait dans AUCUNE policy → un post "amis seulement" (photo + legende)
-- etait lisible par N'IMPORTE QUEL utilisateur connecte via une simple requete
-- directe (`supabase.from('posts').select('*')`). Le filtrage n'existait que
-- cote CLIENT (pages/feed.js) → contournable en une ligne de console.
--
-- Idem `likes_read` / `comments_read` (USING true) : les likes et surtout les
-- COMMENTAIRES (texte) d'un post prive fuitaient de la meme facon.
--
-- Correctif : la RLS applique la visibilite.
--   • posts : lisible si public (ou NULL = ancien post, traite comme public
--     pour ne pas faire disparaitre l'historique) OU si l'auteur est soi-meme
--     ou un ami (helper is_friend_or_self, deja utilise pour sessions/courses).
--   • likes/comments : lisibles seulement si le post parent l'est.
--   • policies _admin conservees (comme sessions_read_admin) — le panel admin
--     passe de toute facon par la service_role, ceci est une ceinture+bretelles.
--
-- Le filtre cote client reste en place (defense en profondeur). Aucun changement
-- applicatif : pour un usage normal, le feed affiche exactement la meme chose
-- (public + les siens + ceux des amis) ; seul le trou de requete directe se
-- ferme.
--
-- ⚠️ A executer manuellement dans le SQL Editor Supabase. Test conseille : avec
-- 2 comptes NON amis, publier un post 'friends' depuis l'un, verifier que
-- `select * from posts` depuis l'autre ne le renvoie pas (et le renvoie une fois
-- amis).

-- ── posts ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "posts_read"       ON public.posts;
DROP POLICY IF EXISTS "posts_read_admin" ON public.posts;

CREATE POLICY "posts_read" ON public.posts
  FOR SELECT TO authenticated
  USING (
    visibility IS DISTINCT FROM 'friends'   -- 'public' ou NULL (ancien) = public
    OR public.is_friend_or_self(user_id)    -- 'friends' : auteur = soi ou ami
  );

CREATE POLICY "posts_read_admin" ON public.posts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── comments : lisibles seulement si le post parent l'est ─────────────────
DROP POLICY IF EXISTS "comments_read"       ON public.comments;
DROP POLICY IF EXISTS "comments_read_admin" ON public.comments;

CREATE POLICY "comments_read" ON public.comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND (p.visibility IS DISTINCT FROM 'friends' OR public.is_friend_or_self(p.user_id))
    )
  );

CREATE POLICY "comments_read_admin" ON public.comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ── likes : lisibles seulement si le post parent l'est ────────────────────
DROP POLICY IF EXISTS "likes_read"       ON public.likes;
DROP POLICY IF EXISTS "likes_read_admin" ON public.likes;

CREATE POLICY "likes_read" ON public.likes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = likes.post_id
        AND (p.visibility IS DISTINCT FROM 'friends' OR public.is_friend_or_self(p.user_id))
    )
  );

CREATE POLICY "likes_read_admin" ON public.likes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
