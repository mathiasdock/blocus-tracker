// Gel de série (streak freeze), façon Duolingo — voir migration_v29.
//
// Mécanique : stock max 2 gels, rechargé à 2 au premier passage de chaque mois
// (recharge paresseuse, pas de cron). Quand l'utilisateur revient après avoir
// manqué N jour(s) depuis sa dernière activité et que N <= stock, les jours
// manqués sont gelés (une ligne par jour dans streak_freeze_days) et la série
// continue. Un jour gelé compte pour la CONTINUITÉ (computeStreak) mais pas
// comme jour actif (les stats de régularité ne bougent pas).
//
// Dégradation : tant que la migration v29 n'est pas exécutée, les requêtes
// échouent (colonne/table absentes) → { supported: false } et l'app garde
// exactement le comportement d'avant, sans erreur visible.

import { todayISO, localISO } from "./format";

const MAX_STOCK = 2;

// Date LOCALE (comme computeStreak) : la continuité de série se raisonne dans
// le fuseau de l'utilisateur, sinon le "hier" du gel et le "hier" de la série
// pourraient différer autour de minuit.
function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return localISO(d);
}

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
 * calcul du trou éventuel, mais AUCUN gel n'est consommé — c'est désormais
 * l'utilisateur qui décide (cf. `applyStreakFreezes`). Appeler la RPC avec un
 * tableau vide est sûr : elle recharge le stock du mois et n'insère rien.
 *
 * `sessions` = ses propres sessions (≥ 60 derniers jours suffisent).
 * → { supported, frozenDays, stock, pendingDays, canRepair }
 *   `pendingDays` : jours manqués qu'un gel POURRAIT encore réparer.
 *   `canRepair`   : le stock couvre entièrement ce trou.
 */
export function runStreakFreezeUpkeep(supabase, userId, sessions) {
  const key = `${userId}:${todayISO()}`;
  if (upkeepKey === key && upkeepPromise) return upkeepPromise;
  upkeepKey = key;
  upkeepPromise = doUpkeep(supabase, userId, sessions).catch(() => ({
    supported: false, frozenDays: [], stock: 0, pendingDays: [], canRepair: false,
  }));
  return upkeepPromise;
}

/**
 * Consomme réellement des gels — appelé UNIQUEMENT sur action explicite de
 * l'utilisateur. Invalide le mémo pour que les pages relisent l'état à jour.
 * → { ok, stock, usedNow }
 */
export async function applyStreakFreezes(supabase, days) {
  const list = [...new Set((days || []).filter(Boolean))];
  if (!list.length) return { ok: false, stock: 0, usedNow: 0 };
  const { data, error } = await supabase.rpc("redeem_streak_freezes", { p_days: list });
  upkeepKey = null; upkeepPromise = null; // force une relecture fraîche
  if (error) return { ok: false, stock: 0, usedNow: 0, error: error.message };
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

async function doUpkeep(supabase, userId, sessions) {
  const off = { supported: false, frozenDays: [], stock: 0, pendingDays: [], canRepair: false };
  if (!userId) return off;

  // 1) Jours déjà gelés.
  const frozen = await fetchFrozenDays(supabase, [userId]);
  if (!frozen.supported) return off;
  const frozenDays = frozen.byUser[userId] || [];

  // 2) Calcule le trou éventuel. On ne PROPOSE que si tout le trou est
  //    couvrable : geler à moitié brûlerait des gels pour une série perdue
  //    quand même. La consommation reste atomique côté RPC v33 (le navigateur
  //    ne peut pas fabriquer de gels), mais elle n'a plus lieu ici.
  const days = new Set((sessions || []).map((s) => localISO(s.started_at)));
  frozenDays.forEach((d) => days.add(d));
  let missed = [];
  // "Hier manqué" suffit : que l'utilisateur ait déjà étudié aujourd'hui ou
  // pas, le trou à ponter est le même (les jours entre hier et la dernière
  // activité). S'il a étudié hier, la série est vivante — rien à faire.
  if (days.size && !days.has(dayISO(1))) {
    // Derniere activite a i jours ? Au-dela du stock maximal, le trou ne peut
    // pas etre couvert et aucun gel n'est consomme.
    let lastActive = 0;
    for (let i = 2; i <= MAX_STOCK + 1; i++) {
      if (days.has(dayISO(i))) { lastActive = i; break; }
    }
    if (lastActive) {
      for (let i = 1; i < lastActive; i++) missed.push(dayISO(i));
    }
  }

  // 3) Tableau VIDE : la RPC se contente de recharger le stock du mois et de
  //    le renvoyer. Rien n'est inséré, donc rien n'est consommé sans accord.
  const { data, error } = await supabase.rpc("redeem_streak_freezes", { p_days: [] });
  if (error) return off;

  const result = Array.isArray(data) ? data[0] : data;
  const stock = Number(result?.remaining_stock) || 0;

  return {
    supported: true,
    frozenDays,
    stock,
    pendingDays: missed,
    canRepair: missed.length > 0 && stock >= missed.length,
  };
}
