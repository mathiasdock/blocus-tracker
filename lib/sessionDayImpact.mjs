// Supprimer ou raccourcir une session peut faire repasser un jour sous son
// seuil (1 s avant le 2026-10-05, 5 min ensuite) : ce jour ne compte plus pour
// la série, et un joker qu'il avait rendu est repris (v75). Pur, testé à part.
//
// Même découpage que la base : les portions actuelles de la session viennent
// de session_days (`rows`), les nouvelles de computeSessionDayParts avec la
// règle de l'app (la fin reste, le début recule — pages/dashboard.js).

import { STUDY_DAY_RULES, studyDayMinSeconds } from "./studyDayStates.mjs";
import { syncedSessionDays } from "./studyDays.mjs";

/**
 * @param rows        lignes session_days connues (au moins les jours de la session)
 * @param session     la session telle qu'en base
 * @param newSeconds  nouvelle durée, ou null pour une suppression
 * @returns dates qui étaient validées et ne le seraient plus
 */
export function daysLostByChange({ rows = [], session, newSeconds = null, rules = STUDY_DAY_RULES }) {
  if (!session?.id) return [];
  const own = rows.filter((row) => row.session_id === session.id);
  const before = own.length ? own : syncedSessionDays(session);
  let after = [];
  if (newSeconds != null) {
    const end = new Date(session.ended_at || new Date(session.started_at).getTime() + Number(session.duration_seconds || 0) * 1000);
    after = syncedSessionDays({
      ...session,
      duration_seconds: newSeconds,
      started_at: new Date(end.getTime() - newSeconds * 1000).toISOString(),
      ended_at: end.toISOString(),
    });
  }
  const totals = new Map();
  for (const row of rows) totals.set(row.local_date, (totals.get(row.local_date) || 0) + (Number(row.seconds) || 0));
  if (!own.length) for (const row of before) totals.set(row.local_date, (totals.get(row.local_date) || 0) + (Number(row.seconds) || 0));
  const delta = new Map();
  for (const row of before) delta.set(row.local_date, (delta.get(row.local_date) || 0) - (Number(row.seconds) || 0));
  for (const row of after) delta.set(row.local_date, (delta.get(row.local_date) || 0) + (Number(row.seconds) || 0));
  const lost = [];
  for (const [date, change] of delta) {
    const min = studyDayMinSeconds(date, rules);
    const was = totals.get(date) || 0;
    if (was >= min && was + change < min) lost.push(date);
  }
  return lost.sort();
}
