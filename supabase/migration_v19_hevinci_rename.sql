-- Migration v19 : renommage HEC Léonard de Vinci → HE Vinci
--
-- L'entrée HELDV dans university_communities a été insérée avec l'ancien nom.
-- Ce patch met à jour la table pour que can_access_community() continue à
-- fonctionner correctement avec les nouveaux profils (profiles.university
-- stocke désormais "HE Vinci — Haute École Léonard de Vinci").
--
-- ⚠️ Les utilisateurs existants dont profiles.university vaut encore
--    "HEC Léonard de Vinci" ne matcheront plus la policy RLS.
--    Pas d'impact en prod : l'école venait d'être ajoutée (migration v18).

UPDATE public.university_communities
SET full_name = 'HE Vinci — Haute École Léonard de Vinci'
WHERE id = 'HELDV';
