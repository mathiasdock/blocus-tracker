-- Migration v23 : récurrence par jours de semaine + date de fin pour les objectifs
-- Manual execution only (Supabase SQL Editor). Do NOT run automatically.
--
-- `recurrence` (text 'daily'|'weekly', déjà en prod mais jamais capturé dans
-- une migration) reste lue pour compatibilité avec les anciennes lignes.
-- Les nouvelles lignes utilisent `recurrence_weekdays` comme source de vérité
-- (tableau de jours JS getDay() : 0=dimanche..6=samedi), ce qui permet des
-- motifs comme "tous les lundis et mercredis" en plus de daily/weekly.
-- `recurrence_until` est la date de fin optionnelle de la série.

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS recurrence_weekdays integer[],
  ADD COLUMN IF NOT EXISTS recurrence_until date;

-- Garde-fou : uniquement des valeurs 0-6 dans le tableau, si renseigné.
ALTER TABLE public.objectives
  DROP CONSTRAINT IF EXISTS objectives_recurrence_weekdays_valid;
ALTER TABLE public.objectives
  ADD CONSTRAINT objectives_recurrence_weekdays_valid
  CHECK (
    recurrence_weekdays IS NULL
    OR recurrence_weekdays <@ ARRAY[0,1,2,3,4,5,6]
  );
