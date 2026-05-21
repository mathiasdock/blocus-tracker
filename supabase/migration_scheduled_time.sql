-- Add scheduled_time to objectives (format 'HH:MM')
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS scheduled_time text;
