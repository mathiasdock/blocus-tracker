// Série officielle pour les écrans (Phase 5A2).
//
// En ligne, la valeur vient du SERVEUR (public.get_my_streak, moteur canonique
// v72/v73). Le calcul local (lib/studyDayStates.mjs, mêmes règles) ne sert
// qu'à trois choses :
//   · l'affichage immédiat pendant qu'un chrono tourne ;
//   · une session arrêtée que la base ne connaît pas encore (hors ligne, ou le
//     temps de l'aller-retour) ;
//   · le mode invité / démo, et le repli si le serveur ne répond pas.
// Dans les deux premiers cas on affiche le plus grand des deux : la série ne
// redescend jamais le temps d'une synchronisation, et une session n'est jamais
// comptée deux fois (les jours locaux sont dédupliqués par id de session en
// amont, lib/studyDays.mjs). Dès que la base a tout, le serveur fait foi.

import { useEffect, useMemo, useState } from "react";
import { STUDY_DAY_RULES, studyStreaks } from "./studyDayStates.mjs";
import { deviceToday } from "./studyDays.mjs";

const NONE = Object.freeze([]);

export function rulesFromServer(row) {
  if (!row) return STUDY_DAY_RULES;
  return {
    legacyMinSeconds: Number(row.legacy_min_seconds) || STUDY_DAY_RULES.legacyMinSeconds,
    minSeconds: Number(row.min_seconds) || STUDY_DAY_RULES.minSeconds,
    newRulesFrom: row.new_rules_from ? String(row.new_rules_from).slice(0, 10) : null,
  };
}

/**
 * Choix de la valeur affichée — pur, testé à part.
 * @param server  { current, best, key } | null — `key` = données sur lesquelles il a été calculé
 * @param local   { current, best }
 * @param pending vrai si des secondes ne sont pas encore en base (chrono, file hors ligne)
 * @param key     identité des données serveur actuelles
 */
export function pickStreak({ server, local, pending, key }) {
  if (!server) return { current: local.current, best: local.best, source: "local" };
  const fresh = server.key === key;
  if (fresh && !pending) return { current: server.current, best: server.best, source: "server" };
  return {
    current: Math.max(server.current, local.current),
    best: Math.max(server.best, local.best),
    source: "optimistic",
  };
}

/**
 * @param supabase
 * @param userId        null en mode invité
 * @param serverRows    lignes session_days telles que lues en base (leur identité
 *                      sert de clé : un nouveau tableau = relire la série)
 * @param rows          serverRows + jours des sessions pas encore en base
 * @param freezes       dates couvertes par un joker
 * @param blocusRanges  [[start, end]] si connues ([] sinon)
 * @param liveSeconds   secondes du chrono en cours, pas encore enregistrées
 */
export function useOfficialStreak({ supabase, userId, serverRows, rows, freezes = NONE, blocusRanges = NONE, liveSeconds = 0 }) {
  const today = deviceToday();
  const [server, setServer] = useState(null);

  useEffect(() => {
    if (!userId || !supabase) { setServer(null); return undefined; }
    let alive = true;
    supabase.rpc("get_my_streak", { p_today: today }).then(({ data, error }) => {
      if (!alive || error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      setServer({
        current: Number(row.current_streak) || 0,
        best: Number(row.best_streak) || 0,
        studiedDays: Number(row.studied_days) || 0,
        rules: rulesFromServer(row),
        key: serverRows,
      });
    }, () => {});
    return () => { alive = false; };
  }, [supabase, userId, serverRows, today]);

  const rules = server?.rules || STUDY_DAY_RULES;
  const live = Math.max(0, Math.floor(Number(liveSeconds) || 0));
  const local = useMemo(() => studyStreaks({
    rows: live > 0 ? [...(rows || NONE), { local_date: today, seconds: live }] : (rows || NONE),
    freezes, blocusRanges, today, rules,
  }), [rows, live, freezes, blocusRanges, today, rules]);

  const pending = live > 0 || (rows || NONE) !== (serverRows || NONE);
  return { ...pickStreak({ server, local, pending, key: serverRows }), rules, today };
}
