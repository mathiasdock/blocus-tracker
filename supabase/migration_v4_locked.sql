-- ============================================================
--  blocus-tracker — migration v4
--  Verrouillage de profil par l'admin.
-- ============================================================

alter table public.profiles
  add column if not exists locked boolean not null default false;
