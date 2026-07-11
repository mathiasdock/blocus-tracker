-- Migration v26 : 40 nouvelles ecoles (France, Pays-Bas, Espagne, Suisse)
--
-- Ajoute les nouvelles ecoles de lib/universities.js a la table de
-- correspondance id <-> nom complet. Necessaire pour que can_access_community()
-- (migration_v18) autorise l'ECRITURE (cmsg_insert) des etudiants de ces
-- ecoles dans leur propre communaute — la LECTURE, elle, est deja ouverte a
-- tous depuis la migration v25 et ne depend pas de cette table.
--
-- ⚠️ Cette table doit rester synchronisee avec lib/universities.js (memes
--    couples id / full_name). Voir le rappel dans migration_v18.
--
-- A executer dans le SQL Editor Supabase.

INSERT INTO public.university_communities (id, full_name) VALUES
  -- France
  ('SCIENCESPO', 'Sciences Po Paris'),
  ('DAUPHINE',   'Université Paris-Dauphine'),
  ('SORBONNE',   'Sorbonne Université'),
  ('SACLAY',     'Université Paris-Saclay'),
  ('INSEAD',     'INSEAD'),
  ('SKEMA',      'SKEMA Business School'),
  ('NEOMA',      'NEOMA Business School'),
  ('AUDENCIA',   'Audencia Business School'),
  ('TSE',        'Toulouse School of Economics'),
  ('GEM',        'Grenoble École de Management'),
  -- Pays-Bas
  ('TUDELFT',    'Delft University of Technology'),
  ('LEIDEN',     'Leiden University'),
  ('UTRECHT',    'Utrecht University'),
  ('GRONINGEN',  'University of Groningen'),
  ('VUA',        'Vrije Universiteit Amsterdam'),
  ('TILBURG',    'Tilburg University'),
  ('TUE',        'Eindhoven University of Technology'),
  ('WUR',        'Wageningen University & Research'),
  ('RADBOUD',    'Radboud University'),
  ('TWENTE',     'University of Twente'),
  -- Espagne
  ('UCM',  'Universidad Complutense de Madrid'),
  ('UAM',  'Universidad Autónoma de Madrid'),
  ('UB',   'Universitat de Barcelona'),
  ('UAB',  'Universitat Autònoma de Barcelona'),
  ('UC3M', 'Universidad Carlos III de Madrid'),
  ('UNAV', 'Universidad de Navarra'),
  ('UPF',  'Universitat Pompeu Fabra'),
  ('UPM',  'Universidad Politécnica de Madrid'),
  ('UPC',  'Universidad Politécnica de Cataluña'),
  ('EAE',  'EAE Business School'),
  -- Suisse
  ('ETHZ',      'ETH Zurich'),
  ('UZH',       'University of Zurich'),
  ('HSG',       'University of St. Gallen'),
  ('BASEL',     'University of Basel'),
  ('BERN',      'University of Bern'),
  ('FRIBOURG',  'University of Fribourg'),
  ('NEUCHATEL', 'University of Neuchâtel'),
  ('USI',       'Università della Svizzera italiana'),
  ('IMD',       'IMD Business School'),
  ('ZHAW',      'ZHAW Zurich University of Applied Sciences')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
