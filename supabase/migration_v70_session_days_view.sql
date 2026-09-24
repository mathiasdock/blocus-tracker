-- ════════════════════════════════════════════════════════════════════════════
-- v70 — Vue canonique public.session_days (Phase 4A)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Une seule source pour « combien de temps étudié quel jour » :
--
--   provenance 'captured'  portions de session_day_parts, fuseau capturé à
--                          l'enregistrement (timezone_source 'device' ou 'profile') ;
--   provenance 'inferred'  portions de session_day_parts, fuseau historique
--                          reconstruit en Phase 3A (timezone_source 'inferred') ;
--   provenance 'legacy'    session historique sans fuseau (timezone nul) : UNE
--                          ligne, durée entière, jour de début selon la règle de
--                          compatibilité figée 'Europe/Brussels', sans découpage
--                          à minuit.
--
-- La règle 'Europe/Brussels' n'est PAS un fuseau inféré : c'est une règle de
-- compatibilité historique fixe, pour qu'une ancienne session ne change jamais
-- de jour quand le profil de son auteur change de fuseau. Elle vaut pour ces
-- sessions et pour elles seules ; aucune donnée n'est écrite.
--
-- Aucune colonne persistée n'est ajoutée : la provenance se déduit de
-- sessions.timezone / timezone_source. course_id vient de sessions (jointure
-- sur la clé primaire), pour les statistiques par cours sans dupliquer le cours
-- dans session_day_parts.
--
-- Droits : security_invoker, donc la RLS de sessions et de session_day_parts
-- s'applique à l'appelant (soi-même, amis, admin ; inconnu et anon refusés).
-- Lecture seule : UNION ALL n'est pas modifiable, et seuls les droits SELECT
-- d'authenticated sont accordés.
--
-- Invariant : une session a des portions si et seulement si timezone n'est pas
-- nul (a10, v65). Vérifié par supabase/tests/session_days.sql.
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.session_days
with (security_invoker = true)
as
select
  p.session_id,
  p.user_id,
  p.local_date,
  p.seconds,
  s.course_id,
  case s.timezone_source
    when 'device' then 'captured'
    when 'profile' then 'captured'
    when 'inferred' then 'inferred'
  end as provenance
from public.session_day_parts p
join public.sessions s on s.id = p.session_id
union all
select
  s.id as session_id,
  s.user_id,
  (s.started_at at time zone 'Europe/Brussels')::date as local_date,
  s.duration_seconds as seconds,
  s.course_id,
  'legacy' as provenance
from public.sessions s
where s.timezone is null;

comment on view public.session_days is
  'Temps étudié par jour, une ligne par (session, jour). provenance : captured | inferred | legacy (règle figée Europe/Brussels, sans découpage). v70.';

revoke all on public.session_days from public, anon, authenticated;
grant select on public.session_days to authenticated;
