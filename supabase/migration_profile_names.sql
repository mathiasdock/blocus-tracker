-- ============================================================
--  Migration : prénom + nom sur les profils
--  À exécuter dans le SQL Editor Supabase (une fois).
-- ============================================================

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;
