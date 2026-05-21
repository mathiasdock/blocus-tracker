-- ============================================================
--  blocus-tracker — migration v5
--  Présence en direct : colonne studying_since sur profiles.
-- ============================================================

alter table public.profiles
  add column if not exists studying_since timestamptz default null;
