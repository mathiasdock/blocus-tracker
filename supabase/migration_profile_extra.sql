-- ============================================================
--  Migration : université / études / année d'études
--  À exécuter dans le SQL Editor Supabase (une fois).
-- ============================================================

alter table public.profiles
  add column if not exists university  text,
  add column if not exists study_field text,
  add column if not exists study_year  text,
  add column if not exists bio         text;
