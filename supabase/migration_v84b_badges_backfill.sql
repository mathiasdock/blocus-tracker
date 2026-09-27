-- v84b — Attribution rétroactive des badges v84 (à appliquer APRÈS la v84).
-- DÉJÀ APPLIQUÉE en production le 2026-09-27 à 21:10 UTC : 89 badges pour
-- 35 comptes, les 534 attributions existantes intactes (empreinte md5
-- identique), second passage 0.
--
-- Réévalue chaque compte avec award_badges_for_user : insertion seule, rien
-- n'est retiré ni modifié. Ne donne que ce que les données canoniques
-- prouvent (meilleure série officielle, jours étudiés, session_days…).
-- Idempotent : un second passage n'ajoute rien.
--
-- Dry-run en production le 2026-09-27 (transaction annulée) : 89 badges pour
-- 35 comptes, 0 retrait, 0 XP en baisse, second passage 0.
do $$
declare
  r record;
begin
  for r in select id from public.profiles order by id loop
    perform public.award_badges_for_user(r.id);
  end loop;
end;
$$;
