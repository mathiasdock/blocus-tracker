// Gel de série (joker), façon Duolingo — voir migrations v29 et v74.
//
// Stock max 2, rechargé à 2 au premier passage de chaque mois (recharge
// paresseuse, pas de cron). L'étudiant DÉCIDE de poser un joker sur un jour
// manqué (StreakFreezeOffer) ; le serveur vérifie le jour avec le moteur
// canonique et refuse un jour étudié ou hors blocus (redeem_streak_freezes).
// Un joker préserve la série ; il n'est jamais un jour étudié, et à partir du
// 2026-10-05 il n'allonge plus la série (règles dans study_day_rules).
// Si une session arrivée plus tard rend le jour étudié, la base rend le joker
// d'elle-même (v74) ; il disparaît alors de streak_freeze_days.
//
// Le « trou » à proposer se calcule dans lib/streakFreezeGap.mjs.
//
// Dégradation : si la table est absente, { supported: false } et l'app garde
// le comportement sans joker, sans erreur visible.

import { todayISO } from "./format";
import { deviceToday } from "./studyDays.mjs";

/** Jours gelés d'un ou plusieurs utilisateurs. → { supported, byUser: {id: [dates]} } */
export async function fetchFrozenDays(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return { supported: true, byUser: {} };
  const { data, error } = await supabase
    .from("streak_freeze_days")
    .select("user_id, used_on")
    .in("user_id", ids);
  if (error) return { supported: false, byUser: {} };
  const byUser = {};
  (data || []).forEach((row) => {
    const day = String(row.used_on).slice(0, 10);
    (byUser[row.user_id] ||= []).push(day);
  });
  return { supported: true, byUser };
}

// Mémo par (user, jour) : dashboard/stats/profil/planning peuvent tous appeler
// l'upkeep sans refaire recharge + consommation plusieurs fois par jour.
let upkeepKey = null;
let upkeepPromise = null;

/**
 * Entretien du gel pour SOI. LECTURE SEULE : recharge mensuelle du stock et
 * jokers posés, mais AUCUN joker n'est consommé — c'est l'utilisateur qui
 * décide (cf. `applyStreakFreezes`). Appeler la RPC avec un tableau vide est
 * sûr : elle recharge le stock du mois et n'insère rien.
 * → { supported, frozenDays, stock }
 */
export function runStreakFreezeUpkeep(supabase, userId) {
  const key = `${userId}:${todayISO()}`;
  if (upkeepKey === key && upkeepPromise) return upkeepPromise;
  upkeepKey = key;
  upkeepPromise = doUpkeep(supabase, userId).catch(() => ({
    supported: false, frozenDays: [], stock: 0,
  }));
  return upkeepPromise;
}

/** Oublie le mémo : un joker a pu être posé ou rendu (session synchronisée). */
export function invalidateStreakFreezeUpkeep() {
  upkeepKey = null; upkeepPromise = null;
}

/**
 * Consomme réellement des gels — appelé UNIQUEMENT sur action explicite de
 * l'utilisateur. Invalide le mémo pour que les pages relisent l'état à jour.
 * → { ok, stock, usedNow }
 */
export async function applyStreakFreezes(supabase, days) {
  const list = [...new Set((days || []).filter(Boolean))];
  if (!list.length) return { ok: false, stock: 0, usedNow: 0 };
  // `p_today` : la date de l'appareil (bornée à ±1 jour par le serveur), pour
  // que « hier » soit le même des deux côtés en voyage ou autour de minuit.
  const { data, error } = await supabase.rpc("redeem_streak_freezes", { p_days: list, p_today: deviceToday() });
  invalidateStreakFreezeUpkeep(); // force une relecture fraîche
  if (error) return { ok: false, stock: 0, usedNow: 0, error: error.message, reason: error.hint || null };
  const result = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    stock: Number(result?.remaining_stock) || 0,
    usedNow: Number(result?.used_now) || 0,
  };
}

// Clé stable identifiant un trou donné : permet de mémoriser un refus sans
// reposer la question en boucle, tout en reproposant si un NOUVEAU trou apparaît.
export function gapKey(days) {
  return [...(days || [])].sort().join("|");
}

async function doUpkeep(supabase, userId) {
  const off = { supported: false, frozenDays: [], stock: 0 };
  if (!userId) return off;

  const frozen = await fetchFrozenDays(supabase, [userId]);
  if (!frozen.supported) return off;
  const frozenDays = frozen.byUser[userId] || [];

  // Tableau VIDE : la RPC se contente de recharger le stock du mois et de le
  // renvoyer. Rien n'est inséré, donc rien n'est consommé sans accord.
  const { data, error } = await supabase.rpc("redeem_streak_freezes", { p_days: [], p_today: deviceToday() });
  if (error) return off;

  const result = Array.isArray(data) ? data[0] : data;
  return { supported: true, frozenDays, stock: Number(result?.remaining_stock) || 0 };
}
