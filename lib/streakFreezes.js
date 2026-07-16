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

import { todayISO } from "./format";

const MAX_STOCK = 2;

function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
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
 * Entretien du gel pour SOI : recharge mensuelle puis consommation si des
 * jours ont été manqués. `sessions` = ses propres sessions (≥ 60 derniers
 * jours suffisent). → { supported, frozenDays: [dates], stock, usedNow }
 */
export function runStreakFreezeUpkeep(supabase, userId, sessions) {
  const key = `${userId}:${todayISO()}`;
  if (upkeepKey === key && upkeepPromise) return upkeepPromise;
  upkeepKey = key;
  upkeepPromise = doUpkeep(supabase, userId, sessions).catch(() => ({
    supported: false, frozenDays: [], stock: 0, usedNow: 0,
  }));
  return upkeepPromise;
}

async function doUpkeep(supabase, userId, sessions) {
  const off = { supported: false, frozenDays: [], stock: 0, usedNow: 0 };
  if (!userId) return off;

  // 1) Stock — colonnes explicites : échoue proprement avant migration.
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("streak_freezes, streak_freeze_month")
    .eq("id", userId)
    .single();
  if (profErr || !prof) return off;

  // 2) Jours déjà gelés.
  const frozen = await fetchFrozenDays(supabase, [userId]);
  if (!frozen.supported) return off;
  const frozenDays = frozen.byUser[userId] || [];

  // 3) Recharge mensuelle (paresseuse) : à 2 au premier passage du mois.
  const month = todayISO().slice(0, 7);
  let stock = Number(prof.streak_freezes) || 0;
  if (prof.streak_freeze_month !== month) {
    stock = MAX_STOCK;
    await supabase
      .from("profiles")
      .update({ streak_freezes: MAX_STOCK, streak_freeze_month: month })
      .eq("id", userId);
  }

  // 4) Consommation : jours manqués entre la dernière activité et aujourd'hui.
  //    On ne gèle que si TOUT le trou est couvert (sinon la série est perdue,
  //    inutile de brûler des gels).
  const days = new Set((sessions || []).map((s) => s.started_at.slice(0, 10)));
  frozenDays.forEach((d) => days.add(d));
  let usedNow = 0;
  // "Hier manqué" suffit : que l'utilisateur ait déjà étudié aujourd'hui ou
  // pas, le trou à ponter est le même (les jours entre hier et la dernière
  // activité). S'il a étudié hier, la série est vivante — rien à faire.
  if (days.size && !days.has(dayISO(1)) && stock > 0) {
    // dernière activité à i jours ? (borne stock+1 : au-delà, trou > stock)
    let lastActive = 0;
    for (let i = 2; i <= stock + 1; i++) {
      if (days.has(dayISO(i))) { lastActive = i; break; }
    }
    if (lastActive) {
      const missed = [];
      for (let i = 1; i < lastActive; i++) missed.push(dayISO(i));
      const { error: insErr } = await supabase
        .from("streak_freeze_days")
        .insert(missed.map((used_on) => ({ user_id: userId, used_on })));
      if (!insErr) {
        usedNow = missed.length;
        stock -= usedNow;
        frozenDays.push(...missed);
        await supabase
          .from("profiles")
          .update({ streak_freezes: stock })
          .eq("id", userId);
      }
    }
  }

  return { supported: true, frozenDays, stock, usedNow };
}
