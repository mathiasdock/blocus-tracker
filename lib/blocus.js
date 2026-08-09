// Le blocus comme SAISON — voir migration_v40.
//
// Une période de blocus est une campagne bornée : début, fin (typiquement le
// dernier examen), objectif d'heures. Elle remplace la progression sans fin
// par quelque chose qui épouse le rythme réel des études : intense pendant le
// blocus, absent après — et c'est le comportement correct.
//
// Dégradation : tant que la migration v40 n'est pas exécutée, toutes les
// requêtes échouent proprement → { supported: false } et l'app se comporte
// exactement comme avant, sans erreur visible.

import { localISO, todayISO } from "./format";

export const MAX_GOAL_HOURS = 2000;

function dayDiff(fromISO, toISO) {
  return Math.round((new Date(`${toISO}T00:00:00`) - new Date(`${fromISO}T00:00:00`)) / 86400000);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

/** Le blocus le plus pertinent : celui en cours, sinon le prochain, sinon le dernier terminé non archivé. */
export function pickCurrent(periods) {
  const today = todayISO();
  const live = (periods || []).filter((p) => !p.archived_at);
  return (
    live.find((p) => p.start_date <= today && today <= p.end_date)
    || live.filter((p) => p.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    || live.filter((p) => p.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
    || null
  );
}

/** → { supported, periods, current } */
export async function fetchBlocus(supabase, userId) {
  if (!userId) return { supported: true, periods: [], current: null };
  const { data, error } = await supabase
    .from("blocus_periods")
    .select("id, start_date, end_date, goal_hours, archived_at")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (error) return { supported: false, periods: [], current: null };
  const periods = data || [];
  return { supported: true, periods, current: pickCurrent(periods) };
}

/**
 * Valeurs par défaut proposées à la création, déduites des examens déjà saisis.
 * On ne retient que les examens des 120 prochains jours : un partiel lointain
 * ne définit pas un blocus, et proposerait une campagne de six mois.
 */
export function suggestFromExams(exams) {
  const today = todayISO();
  const horizon = addDays(today, 120);
  const upcoming = (exams || [])
    .map((e) => String(e.exam_date).slice(0, 10))
    .filter((d) => d >= today && d <= horizon)
    .sort();

  const end = upcoming.length ? upcoming[upcoming.length - 1] : addDays(today, 21);
  const days = Math.max(1, dayDiff(today, end) + 1);
  // 4 h/jour : le rythme médian observé chez les comptes réellement en blocus.
  const goal = Math.max(10, Math.round((days * 4) / 5) * 5);
  return { start_date: today, end_date: end, goal_hours: goal, examCount: upcoming.length };
}

export async function createBlocus(supabase, userId, { start_date, end_date, goal_hours }) {
  if (!userId) return { ok: false, reason: "no-user" };
  if (!start_date || !end_date || end_date < start_date) return { ok: false, reason: "bad-range" };
  const goal = Number(goal_hours);
  const { data, error } = await supabase
    .from("blocus_periods")
    .insert({
      user_id: userId,
      start_date,
      end_date,
      goal_hours: Number.isFinite(goal) && goal > 0 ? Math.min(MAX_GOAL_HOURS, Math.round(goal)) : null,
    })
    .select("id, start_date, end_date, goal_hours, archived_at")
    .single();
  if (error) return { ok: false, reason: "error" };
  return { ok: true, period: data };
}

export async function archiveBlocus(supabase, userId, periodId) {
  if (!userId || !periodId) return { ok: false };
  const { error } = await supabase
    .from("blocus_periods")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", periodId)
    .eq("user_id", userId);
  return { ok: !error };
}

/**
 * Progression d'une campagne à partir des sessions déjà chargées.
 * `sessions` doit couvrir la période (le dashboard charge 90 jours).
 * → { phase, daysTotal, daysElapsed, daysLeft, hoursDone, goalHours, pct,
 *     activeDays, paceNeeded }
 *   phase : "upcoming" | "active" | "ended"
 */
export function computeProgress(period, sessions) {
  if (!period) return null;
  const today = todayISO();
  const { start_date: start, end_date: end } = period;
  const phase = today < start ? "upcoming" : today > end ? "ended" : "active";

  const inRange = (sessions || []).filter((s) => {
    const day = localISO(s.started_at);
    return day >= start && day <= end;
  });
  const hoursDone = inRange.reduce((a, s) => a + Number(s.duration_seconds || 0), 0) / 3600;
  const activeDays = new Set(inRange.map((s) => localISO(s.started_at))).size;

  const daysTotal = dayDiff(start, end) + 1;
  const daysElapsed = phase === "upcoming" ? 0 : Math.min(daysTotal, dayDiff(start, today) + 1);
  const daysLeft = phase === "ended" ? 0 : Math.max(0, dayDiff(today, end) + (phase === "upcoming" ? 1 : 0));

  const goalHours = period.goal_hours || 0;
  const pct = goalHours > 0 ? Math.min(100, Math.round((hoursDone / goalHours) * 100)) : null;
  // Rythme restant à tenir. Le jour en cours compte encore, d'où le +1.
  const remainingDays = phase === "active" ? Math.max(1, dayDiff(today, end) + 1) : daysTotal;
  const paceNeeded = goalHours > 0 && phase !== "ended"
    ? Math.max(0, (goalHours - hoursDone) / remainingDays)
    : 0;

  return { phase, daysTotal, daysElapsed, daysLeft, hoursDone, goalHours, pct, activeDays, paceNeeded };
}

/** Intervalles [start, end] utilisés par computeStreak pour neutraliser le hors-blocus. */
export function toRanges(periods) {
  return (periods || []).map((p) => [p.start_date, p.end_date]);
}
