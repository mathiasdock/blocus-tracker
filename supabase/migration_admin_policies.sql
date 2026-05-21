-- Admin bypass policies for @mathias.dock
-- Run after migration_private_messages.sql

-- Allow admin to update any profile
DROP POLICY IF EXISTS "admin_update_profiles" ON public.profiles;
CREATE POLICY "admin_update_profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND pseudo = 'mathias.dock')
  )
  WITH CHECK (true);

-- Allow admin to delete any post
DROP POLICY IF EXISTS "admin_delete_posts" ON public.posts;
CREATE POLICY "admin_delete_posts" ON public.posts
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND pseudo = 'mathias.dock')
  );

-- Allow admin to delete any community message
DROP POLICY IF EXISTS "admin_delete_cmsg" ON public.community_messages;
CREATE POLICY "admin_delete_cmsg" ON public.community_messages
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND pseudo = 'mathias.dock')
  );
