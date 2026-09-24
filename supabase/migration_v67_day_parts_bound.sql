-- ════════════════════════════════════════════════════════════════════════════
-- v67 — Borne d'une portion quotidienne : 12 h → 26 h
-- ════════════════════════════════════════════════════════════════════════════
--
-- v65 limitait une portion de session_day_parts à 12 h (seconds <= 43200).
-- Cette borne recopiait la limite des SESSIONS au lieu de décrire une portion.
--
-- Pourquoi elle ne tient pas :
--   • 17 sessions historiques dépassent 12 h (jusqu'à 86 351 s), enregistrées
--     avant la validation actuelle. Dry-run (2026-09-24) : 16 d'entre elles
--     auraient une portion > 12 h (max 59 903 s) ; le rattrapage ne pourrait
--     donc pas les représenter telles qu'elles existent.
--   • Pour les nouvelles sessions, elle est redondante : validate_new_study_session
--     plafonne déjà duration_seconds à 43 200 s, et une portion ne dépasse
--     jamais la durée de sa session (la dernière reçoit le reste, les autres
--     un arrondi inférieur).
--   • L'intégrité des portions tient à leur écrivain unique (déclencheur a10,
--     aucune écriture client) et à la règle testée : seconds > 0 et somme des
--     portions = duration_seconds.
--
-- Borne gardée : 26 h (93 600 s). Une portion est du temps situé dans UNE
-- journée locale. Une journée dure 24 h, 23 h ou 25 h aux changements d'heure,
-- et jusqu'à 26 h dans l'historique IANA (doubles heures d'été). Les sessions
-- ont interval = durée (tolérance ±5 min) ou durée < intervalle (chrono de
-- groupe) : une portion légitime reste sous la longueur d'une journée, à 5 min
-- près. Les sessions historiques ne dépassent pas 86 351 s. Au-delà de 26 h,
-- ce ne peut être qu'une erreur de calcul (millisecondes prises pour des
-- secondes, fuseau absurde) : la base la refuse au lieu de la stocker.
--
-- La limite de 12 h des SESSIONS (validate_new_study_session) est inchangée.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.session_day_parts
  drop constraint if exists session_day_parts_seconds_check,
  add constraint session_day_parts_seconds_check
    check (seconds > 0 and seconds <= 93600);
