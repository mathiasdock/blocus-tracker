-- Canonical course matcher: pure rules (no table read or write).
-- Run in the Supabase SQL editor (or MCP execute_sql) after the migration
-- 20260917021405_canonical_course_matching.sql. Expected: failures = 0.
--
-- Every name pair is checked in both directions, and every MEDIUM/HIGH pair must pass
-- course_pair_prefilter (otherwise the resolver would never evaluate it).

with title_cases(a, b, expected, expected_rule) as (values
  -- Brief examples
  ('Advertising Strategy', 'Advertising Strategies', 'high', 'same_title'),
  ('ADV Strat', 'Advertising Strategy', 'medium', 'abbreviation'),
  ('Stat', 'Statistiques', 'medium', 'abbreviation'),
  ('optimisation', 'optimization', 'medium', 'generic_name'),
  ('stathistique', 'statistique', 'medium', 'typo'),
  ('Math', 'Math financière', 'low', 'extra_words'),
  ('Droit', 'Droit fiscal', 'low', 'extra_words'),
  ('Marketing', 'Marketing international', 'low', 'extra_words'),
  ('Compta', 'Compta 2', 'low', 'sequence_one_sided'),
  ('Math', 'Math Q2', 'low', 'sequence_one_sided'),
  -- Sequence markers
  ('Math Q1', 'Math Q2', 'low', 'sequence_conflict'),
  ('Compta II', 'Compta 2', 'medium', 'generic_name'),
  ('Analyse I', 'Analyse 1', 'medium', 'generic_name'),
  ('Partie 2 Droit civil', 'Droit civil II', 'high', 'same_title'),
  ('Math S1', 'Math semestre 1', 'medium', 'generic_name'),
  -- Accents, case, punctuation, filler words, plurals, spelling variants
  ('Supply chain optimisation', 'Supply chain optimization', 'high', 'same_title'),
  ('Droit du Travail', 'droit-du-travail', 'high', 'same_title'),
  ('Droit du travail', 'DROIT  DU  TRAVAIL.', 'high', 'same_title'),
  ('Droit du travail', 'Droit travail', 'high', 'same_title'),
  ('ÉCONOMIE POLITIQUE', 'economie politique', 'high', 'same_title'),
  ('Cours de droit civil', 'Droit civil', 'high', 'same_title'),
  ('Droit des obligations', 'Droit obligations', 'high', 'same_title'),
  ('Gestion des paiements internationaux', 'Gestion paiement international', 'high', 'same_title'),
  ('Advertising Stratégie', 'Advertising Strategy', 'high', 'same_title'),
  -- Course codes
  ('ADV3008 Advertising Strategy', 'ADV3008', 'high', 'code_match'),
  ('ADV3008 Advertising Strategy', 'Advertising Strategy', 'high', 'same_title'),
  ('ADV 3008', 'adv3008', 'high', 'code_match'),
  ('INFO-F101', 'info f101', 'high', 'code_match'),
  ('ADV3008', 'ADV3009', 'low', 'code_conflict'),
  ('ADV3008 Partie 1', 'ADV3008 Partie 2', 'medium', 'code_match_sequence_differs'),
  -- Generic names never reach HIGH on their own
  ('Droit 2025', 'Droit', 'medium', 'generic_name'),
  ('Anglais', 'Anglais', 'medium', 'generic_name'),
  ('Finance', 'Finances', 'medium', 'generic_name'),
  ('Mathématiques', 'Mathematics', 'medium', 'generic_name'),
  ('Introduction au droit', 'Introduction au droit', 'medium', 'generic_name'),
  ('Comptabilité générale', 'Comptabilite generale', 'medium', 'generic_name'),
  ('Anglais des affaires', 'Anglais des affaires', 'medium', 'generic_name'),
  -- Study level written in the name
  ('Statistiques B1', 'Statistiques', 'medium', 'level_one_sided'),
  ('BAC 3 Droit fiscal', 'Droit fiscal BA3', 'high', 'same_title'),
  ('Droit fiscal Master 1', 'Droit fiscal BAC 3', 'low', 'level_conflict'),
  ('Anglais B1', 'Anglais B2', 'low', 'level_conflict'),
  -- Plausible but uncertain
  ('SCM', 'Supply chain management', 'medium', 'acronym'),
  ('HDI', 'Histoire du droit et des institutions', 'medium', 'acronym'),
  ('Marketing international', 'International marketing', 'medium', 'word_order'),
  ('Introduction au droit', 'Intro droit', 'medium', 'abbreviation'),
  ('Macro', 'Macroéconomie', 'medium', 'abbreviation'),
  ('Progra', 'Programmation', 'medium', 'abbreviation'),
  ('Responsable management', 'Responsible management', 'medium', 'typo'),
  ('Supply chain managment', 'Supply chain management', 'medium', 'typo'),
  -- Different courses
  ('Supply chain', 'Supply chain management', 'low', 'extra_words'),
  ('Micro', 'Macro', 'low', 'different_words'),
  ('Microéconomie', 'Macroéconomie', 'low', 'different_words'),
  ('Absorption', 'Adsorption', 'low', 'different_words'),
  ('Chimie organique', 'Chimie inorganique', 'low', 'different_words'),
  ('Eco', 'Economie', 'low', 'different_words'),
  ('Economics', 'Économie', 'low', 'different_words'),
  ('Introduction to marketing', 'Marketing', 'low', 'different_words'),
  ('Chimie générale', 'Chimie', 'low', 'extra_words'),
  -- Not a course
  ('Test', 'Test', 'low', 'non_course_label'),
  ('Mémoire', 'Mémoire', 'low', 'non_course_label'),
  ('Psy perso', 'Psy perso', 'low', 'non_course_label'),
  ('Intro', 'Intro', 'low', 'non_course_label'),
  ('🎯', 'Stat', 'low', 'unmatchable')
),
link_cases(course, offering, years, longer, confirmers, rejecters, expected, expected_rule) as (values
  -- Same distinctive title
  ('Droit du travail', 'Droit du travail', 1, false, 0, 0, 'high', 'same_title'),
  ('Droit du travail', 'Droit du travail', 0, false, 0, 0, 'high', 'same_title'),
  -- Year is ambiguity evidence, never a boundary
  ('Droit du travail', 'Droit du travail', 2, false, 0, 0, 'medium', 'years_differ'),
  ('Anglais', 'Anglais', 1, false, 0, 0, 'medium', 'generic_name'),
  ('Anglais', 'Anglais', 2, false, 0, 0, 'low', 'generic_years_differ'),
  ('Macro', 'Macroéconomie', 2, false, 0, 0, 'low', 'generic_years_differ'),
  ('Supply chain', 'Supply chain', 1, true, 0, 0, 'medium', 'shorter_than_known_title'),
  -- Aliases: one confirmation is not enough, three independent ones are
  ('ADV Strat', 'Advertising Strategy', 1, false, 1, 0, 'medium', 'abbreviation'),
  ('ADV Strat', 'Advertising Strategy', 1, false, 2, 0, 'medium', 'abbreviation'),
  ('ADV Strat', 'Advertising Strategy', 1, false, 3, 0, 'high', 'trusted_alias'),
  ('ADV Strat', 'Advertising Strategy', 1, false, 3, 2, 'medium', 'abbreviation'),
  ('ADV Strat', 'Advertising Strategy', 2, false, 3, 0, 'medium', 'years_differ'),
  ('Stat', 'Statistiques', 1, false, 5, 0, 'medium', 'generic_name'),
  ('Math', 'Math financière', 1, false, 10, 0, 'low', 'extra_words'),
  -- Rejections by other students of the same institution
  ('ADV Strat', 'Advertising Strategy', 1, false, 0, 3, 'low', 'rejected_by_students'),
  ('Droit du travail', 'Droit du travail', 1, false, 0, 2, 'medium', 'contested'),
  ('Droit du travail', 'Droit du travail', 1, false, 1, 3, 'low', 'rejected_by_students'),
  -- A shared code decides on its own
  ('ADV3008', 'ADV3008 Advertising Strategy', 3, false, 0, 5, 'high', 'code_match')
),
results as (
  select 'title' as kind, c.a || ' | ' || c.b as label, c.expected, c.expected_rule, m.confidence, m.rule
  from title_cases c
  cross join lateral public.course_title_match(c.a, c.b) m
  union all
  select 'title reversed', c.b || ' | ' || c.a, c.expected, c.expected_rule, m.confidence, m.rule
  from title_cases c
  cross join lateral public.course_title_match(c.b, c.a) m
  union all
  select 'link',
    c.course || ' -> ' || c.offering
      || format(' (years=%s longer=%s confirmed=%s rejected=%s)', c.years, c.longer, c.confirmers, c.rejecters),
    c.expected, c.expected_rule, m.confidence, m.rule
  from link_cases c
  cross join lateral public.course_link_confidence(c.course, c.offering, c.years, c.longer, c.confirmers, c.rejecters) m
  union all
  select 'prefilter', c.a || ' | ' || c.b, 'true', 'true',
    public.course_pair_prefilter(x.content, x.code, y.content, y.code)::text,
    public.course_pair_prefilter(y.content, y.code, x.content, x.code)::text
  from title_cases c
  cross join lateral public.course_identity(c.a) x
  cross join lateral public.course_identity(c.b) y
  where c.expected in ('high', 'medium')
)
select
  count(*) as cases,
  count(*) filter (where confidence is distinct from expected or rule is distinct from expected_rule) as failures,
  coalesce(
    jsonb_agg(jsonb_build_object(
      'case', kind || ': ' || label,
      'expected', expected || ' / ' || expected_rule,
      'actual', confidence || ' / ' || rule
    )) filter (where confidence is distinct from expected or rule is distinct from expected_rule),
    '[]'::jsonb
  ) as failing
from results;
