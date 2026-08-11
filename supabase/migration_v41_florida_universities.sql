-- ================================================================
-- migration_v41_florida_universities.sql
--
-- Premier État couvert aux États-Unis : les 12 membres du State University
-- System of Florida, ajoutés en parallèle du bloc "US" de lib/universities.js.
--
-- Pourquoi cette migration est nécessaire : la LECTURE des communautés est
-- ouverte à tous depuis la v25, mais l'ÉCRITURE passe par
-- can_access_community() (v18), qui s'appuie sur cette table de correspondance
-- id <-> nom complet. Sans ces lignes, un étudiant floridien verrait sa
-- communauté et ne pourrait pas y poster.
--
-- ⚠️ Doit rester synchronisée avec lib/universities.js : mêmes couples
--    id / full_name, au caractère près (la correspondance se fait sur le nom
--    complet exact stocké dans profiles.university).
--
-- À exécuter dans le SQL Editor Supabase. Idempotent.
-- ================================================================

INSERT INTO public.university_communities (id, full_name) VALUES
  ('UF',      'University of Florida'),
  ('FSU',     'Florida State University'),
  ('USF',     'University of South Florida'),
  ('UCF',     'University of Central Florida'),
  ('FIU',     'Florida International University'),
  ('FAU',     'Florida Atlantic University'),
  ('FAMU',    'Florida A&M University'),
  ('UNF',     'University of North Florida'),
  ('UWF',     'University of West Florida'),
  ('FGCU',    'Florida Gulf Coast University'),
  ('NEWCOLL', 'New College of Florida'),
  ('FLPOLY',  'Florida Polytechnic University')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
