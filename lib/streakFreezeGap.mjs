// Quand proposer un joker (Phase 5A3) — pur, testé à part.
//
// Le « trou » se lit dans le MOTEUR CANONIQUE (lib/studyDayStates.mjs, mêmes
// règles que public.study_day_states) sur les jours que l'app connaît :
// session_days + sessions pas encore en base. En remontant depuis hier :
//   · 'missed'  → jour à protéger ;
//   · 'neutral' → joker déjà posé ou hors blocus : ne casse rien, on continue ;
//   · 'studied' → la série à sauver commence là : on s'arrête.
// Aucun jour étudié avant le trou = aucune série à sauver = pas de proposition.
//
// Et on ne propose PAS tant qu'un jour du trou peut encore devenir étudié tout
// seul : chrono en cours qui déborde sur ce jour, ou session de ce jour en file
// d'attente. C'est le cas du 10 août (chrono de 12 h encore ouvert).
// Si ça arrive quand même (deuxième appareil…), le serveur rend le joker (v74).

import { STUDY_DAY_RULES, studyDayStates } from "./studyDayStates.mjs";
import { unsyncedSessionDays } from "./studyDays.mjs";

export const MAX_FREEZE_STOCK = 2;
export const FREEZE_WINDOW_DAYS = 31; // redeem_streak_freezes : 31 derniers jours

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Jours qu'un chrono non enregistré peut encore toucher. La session sera
 * écrite comme [arrêt − durée, arrêt] (pages/dashboard.js stopAndSave) : tant
 * qu'il tourne, son début virtuel `maintenant − elapsed` ne bouge pas ; en
 * pause, il avance. Ses jours sont donc ceux d'un arrêt MAINTENANT — le même
 * découpage que la base (computeSessionDayParts via unsyncedSessionDays).
 * Un chrono commencé aujourd'hui ne touche qu'aujourd'hui : il ne bloque pas
 * un joker pour hier.
 */
export function liveChronoDays({ elapsedSeconds, timezone, now = Date.now() }) {
  const secs = Math.floor(Number(elapsedSeconds) || 0);
  if (secs <= 0) return [];
  const end = new Date(now);
  const start = new Date(now - secs * 1000);
  return unsyncedSessionDays({
    id: "live-chrono",
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_seconds: secs,
    ...(timezone ? { timezone } : {}),
  }).map((row) => row.local_date);
}

/** Jours touchés par des sessions pas encore en base. */
export function pendingSessionDays(sessions = []) {
  const out = new Set();
  for (const s of sessions || []) for (const row of unsyncedSessionDays(s)) out.add(row.local_date);
  return [...out];
}

/**
 * @returns {{ days: string[], canRepair: boolean, blocked: boolean }}
 *   days      : jours manqués à protéger (du plus ancien au plus récent)
 *   blocked   : un de ces jours peut encore être rempli (chrono, file)
 *   canRepair : on peut proposer (trou complet couvert par le stock, rien de bloquant)
 */
export function freezeGap({
  rows = [], freezes = [], blocusRanges = [], today, rules = STUDY_DAY_RULES,
  stock = 0, blockedDays = [], maxDays = MAX_FREEZE_STOCK,
}) {
  const none = { days: [], canRepair: false, blocked: false };
  if (!today) return none;
  const yesterday = addDays(today, -1);
  const oldest = addDays(today, -FREEZE_WINDOW_DAYS);
  const states = studyDayStates({ rows, freezes, blocusRanges, from: oldest, to: yesterday, today, rules });
  const missed = [];
  let anchored = false;
  for (let i = states.length - 1; i >= 0; i--) {
    const day = states[i];
    if (day.state === "studied") { anchored = true; break; }
    if (day.state === "missed") {
      missed.push(day.local_date);
      if (missed.length > maxDays) return none; // trou trop long : série perdue
    }
  }
  if (!anchored || !missed.length) return none;
  missed.reverse();
  const blockedSet = new Set(blockedDays);
  const blocked = missed.some((d) => blockedSet.has(d));
  return { days: missed, blocked, canRepair: !blocked && missed.length <= stock };
}
