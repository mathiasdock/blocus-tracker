-- v80 — Expose isolé de la production Blocus. Rien n'est supprimé.
--
-- Expose (jeu de soirée, projet séparé ~/Documents/exposed, déployé sur Vercel)
-- partage ce projet Supabase : 7 tables exposed_*, 3 fonctions et le bucket
-- exposed-photos. Il n'est plus utilisé, mais son site est toujours en ligne et
-- son serveur détient la clé service de CE projet.
--
-- Pourquoi ~295 000 requêtes et ~150 000 messages temps réel pour une soirée
-- (5–11 septembre) : une boucle qui s'entretient toute seule.
--   1. Chaque téléphone lit l'état de la partie (/api/rooms/<code>/state)
--      toutes les 2 à 4 s, et cette lecture écrit sa présence
--      (exposed_players.last_seen_at) : 1 écriture + ~6 lectures.
--   2. Le déclencheur exposed_players_bump incrémente alors
--      exposed_rooms.state_version…
--   3. …et exposed_rooms est publiée en temps réel : chaque téléphone reçoit
--      l'UPDATE et relance aussitôt une lecture d'état, qui réécrit sa
--      présence, qui re-déclenche l'UPDATE, etc.
-- Les lectures s'enchaînent donc sans pause. Un écran resté allumé sur les
-- résultats a tourné ~23 h après la partie (dernière présence à 23:11 le 11/09).
--
-- Isolation (réversible) :
--   · aucun rôle d'API (anon, authenticated, service_role) ne peut plus lire,
--     écrire ni exécuter quoi que ce soit d'Expose. La clé service qu'Expose
--     détient ne lui donne plus accès à ses tables ; toute requête échoue
--     aussitôt (« permission denied »), sans lecture ni écriture ;
--   · exposed_rooms sort de la publication temps réel : plus aucun message
--     diffusé, même si un téléphone rouvre la page ;
--   · le bucket exposed-photos refuse tout nouvel envoi.
-- Les 7 tables (≈150 lignes) et les 48 photos (13 Mo) restent intactes.
--
-- Pour réactiver Expose : lui donner son propre projet Supabase (avec ses
-- propres clés) plutôt que de défaire ce fichier. Retour arrière exact en bas.

do $revoke$
declare
  t text;
begin
  foreach t in array array[
    'exposed_answers', 'exposed_drinking_events', 'exposed_photos', 'exposed_players',
    'exposed_rooms', 'exposed_rounds', 'exposed_votes'
  ] loop
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end
$revoke$;

revoke all on function public.exposed_bump_self() from public, anon, authenticated, service_role;
revoke all on function public.exposed_bump_state() from public, anon, authenticated, service_role;
revoke all on function public.exposed_cleanup() from public, anon, authenticated, service_role;

do $realtime$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exposed_rooms'
  ) then
    alter publication supabase_realtime drop table public.exposed_rooms;
  end if;
end
$realtime$;

-- Aucun fichier ne correspond à ce type : tout envoi est refusé par Storage,
-- quel que soit le rôle (la clé service contourne les règles d'accès, pas les
-- limites du bucket).
update storage.buckets
set allowed_mime_types = array['application/x-expose-disabled']
where id = 'exposed-photos';

-- ── ROLLBACK (à n'exécuter que sur décision) ────────────────────────────────
-- État d'avant (relevé le 2026-09-26) :
--   grant all on public.exposed_answers, public.exposed_drinking_events,
--     public.exposed_photos, public.exposed_players, public.exposed_rooms,
--     public.exposed_rounds, public.exposed_votes to anon, authenticated, service_role;
--   grant execute on function public.exposed_bump_self(), public.exposed_bump_state(),
--     public.exposed_cleanup() to public, anon, authenticated, service_role;
--   alter publication supabase_realtime add table public.exposed_rooms;
--   update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp']
--     where id = 'exposed-photos';
