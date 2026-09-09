import { totalBadgeXP } from "./badges";

// XP / Level system for blocus-tracker.

// Courbe de niveaux. Les écarts ne décroissent jamais, et un seuil ne remonte
// JAMAIS : un compte peut monter de niveau, jamais en redescendre.
//
// Recalibré (v39) : l'ancienne courbe plafonnait à 100 000 XP, soit ~1 666 h
// d'étude. Personne n'avait dépassé le niveau 9 et onze paliers sur vingt
// n'avaient jamais été atteints. Le sommet est passé à 20 000 XP.
//
// Étendu à 30 niveaux (v48). Les vingt premiers seuils sont INCHANGÉS —
// personne ne bouge — et dix paliers s'ajoutent au-dessus. L'écart continue
// de grandir de 100 XP à chaque marche, comme depuis le début : une seule
// règle sur toute la courbe, pas deux régimes qui se rejoignent au milieu.
// Le niveau 30 est à 45 000 XP, soit plusieurs centaines d'heures — c'est
// voulu, un sommet atteint par tout le monde n'est plus un sommet.
// Doit rester synchronisé avec gamification_level_threshold().
export const LEVELS = [
  { level: 1,  titleKey: "xp.level1",  xp: 0     },
  { level: 2,  titleKey: "xp.level2",  xp: 200   },
  { level: 3,  titleKey: "xp.level3",  xp: 450   },
  { level: 4,  titleKey: "xp.level4",  xp: 800   },
  { level: 5,  titleKey: "xp.level5",  xp: 1250  },
  { level: 6,  titleKey: "xp.level6",  xp: 1800  },
  { level: 7,  titleKey: "xp.level7",  xp: 2450  },
  { level: 8,  titleKey: "xp.level8",  xp: 3200  },
  { level: 9,  titleKey: "xp.level9",  xp: 4050  },
  { level: 10, titleKey: "xp.level10", xp: 5000  },
  { level: 11, titleKey: "xp.level11", xp: 6050  },
  { level: 12, titleKey: "xp.level12", xp: 7200  },
  { level: 13, titleKey: "xp.level13", xp: 8450  },
  { level: 14, titleKey: "xp.level14", xp: 9800  },
  { level: 15, titleKey: "xp.level15", xp: 11250 },
  { level: 16, titleKey: "xp.level16", xp: 12800 },
  { level: 17, titleKey: "xp.level17", xp: 14450 },
  { level: 18, titleKey: "xp.level18", xp: 16200 },
  { level: 19, titleKey: "xp.level19", xp: 18050 },
  { level: 20, titleKey: "xp.level20", xp: 20000 },
  { level: 21, titleKey: "xp.level21", xp: 22050 },
  { level: 22, titleKey: "xp.level22", xp: 24200 },
  { level: 23, titleKey: "xp.level23", xp: 26450 },
  { level: 24, titleKey: "xp.level24", xp: 28800 },
  { level: 25, titleKey: "xp.level25", xp: 31250 },
  { level: 26, titleKey: "xp.level26", xp: 33800 },
  { level: 27, titleKey: "xp.level27", xp: 36450 },
  { level: 28, titleKey: "xp.level28", xp: 39200 },
  { level: 29, titleKey: "xp.level29", xp: 42050 },
  { level: 30, titleKey: "xp.level30", xp: 45000 },
];

/**
 * XP total d'un compte.
 * – 1 XP par minute étudiée (depuis toujours) — c'est L'ANCRE : tout le reste
 *   se lit en minutes de blocus, ce qui rend chaque récompense discutable
 *   (« ce badge vaut cinq heures de travail, est-ce que c'est juste ? »).
 * – 20 XP par objectif terminé
 * – 10 XP par jour de la MEILLEURE série jamais atteinte
 * – 15 XP par examen ajouté
 * – le montant propre à chaque badge (lib/badges.js), 50 à 1200 XP
 * – bonusXP : parrainages et missions quotidiennes, déjà crédités et figés
 *
 * ⚠️ `bestStreak`, jamais la série courante. Le total est recalculé depuis
 * l'état présent : indexer ce terme sur la série EN COURS faisait disparaître
 * 10 XP par jour au moment où elle cassait, et pouvait faire redescendre d'un
 * niveau. La meilleure série ne décroît pas, donc le XP non plus — on punissait
 * deux fois le même oubli, juste au moment où il fallait redonner envie.
 *
 * ⚠️ `badgeIds`, pas un compte. Tous les badges valaient 50 XP ; ils valent
 * maintenant selon leur palier, donc il faut savoir LESQUELS sont obtenus.
 */
export function computeTotalXP({ totalMinutes, completedObjectives, bestStreak, examCount, badgeIds, bonusXP = 0 }) {
  return (
    Math.floor(totalMinutes)
    + completedObjectives * 20
    + (bestStreak || 0) * 10
    + examCount * 15
    + totalBadgeXP(badgeIds)
    + bonusXP
  );
}

/** Returns level info for a given total XP value. */
export function getLevelInfo(totalXP) {
  let currentIdx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVELS[i].xp) { currentIdx = i; break; }
  }
  const current = LEVELS[currentIdx];
  const next = LEVELS[currentIdx + 1] || null;
  const progressXP = totalXP - current.xp;
  const rangeXP = next ? next.xp - current.xp : 1;
  const progressPct = next ? Math.min(100, Math.round((progressXP / rangeXP) * 100)) : 100;
  return { current, next, progressXP, rangeXP, progressPct, totalXP };
}

// ── Missions quotidiennes ────────────────────────────────────
// La source de vérité en production est Supabase (gamification_mission_xp).
// Cet évaluateur local sert au développement hors-ligne et de repli.
//
// ── Ce qu'une mission doit peser ────────────────────────────
// Une journée parfaite rapportait jusqu'à 390 XP de missions — soit 6 h 30
// d'étude, EN PLUS des heures réellement faites. Une mission payait donc
// mieux que le travail qu'elle récompensait. Pire, les missions de durée
// comptent une seconde fois des minutes déjà créditées : « 3 h aujourd'hui »
// ajoutait 130 XP par-dessus les 180 XP que ces 3 h avaient déjà rapportés.
//
// Deux règles maintenant : aucune mission ne dépasse 50 XP, et une journée
// parfaite plafonne à 160. Les missions de durée restent les moins payées,
// justement parce qu'elles recomptent. Une mission est un bonus, pas un
// second salaire.
//
// Baisser ces montants ne reprend rien à personne : chaque mission validée
// est écrite dans xp_ledger avec le montant qui avait cours ce jour-là.
export const MISSION_POOL = [
  { id: "m_25m",     key: "xp.m_25m",     xp: 15,  category: "duration",    check: d => d.todaySecs >= 1500   },
  { id: "m_1h",      key: "xp.m_1h",      xp: 25,  check: d => d.todaySecs >= 3600   },
  { id: "m_2h",      key: "xp.m_2h",      xp: 35,  check: d => d.todaySecs >= 7200   },
  { id: "m_3h",      key: "xp.m_3h",      xp: 45,  check: d => d.todaySecs >= 10800  },
  { id: "m_s25",     key: "xp.m_s25",     xp: 20,  category: "focus",       check: d => d.todayMaxSessionSecs >= 1500 },
  { id: "m_s50",     key: "xp.m_s50",     xp: 30,  category: "focus",       check: d => d.todayMaxSessionSecs >= 3000 },
  { id: "m_s90",     key: "xp.m_s90",     xp: 40,  category: "focus",       check: d => d.todayMaxSessionSecs >= 5400 },
  { id: "m_two_sessions", key: "xp.m_two_sessions", xp: 25, category: "focus", check: d => d.todaySessionCount >= 2 },
  { id: "m_2courses", key: "xp.m_2courses", xp: 25, category: "focus", check: d => d.todayCoursesCount >= 2 },
  { id: "m_obj1",    key: "xp.m_obj1",    xp: 30,  check: d => d.todayDoneObj >= 1   },
  { id: "m_obj2",    key: "xp.m_obj2",    xp: 40,  check: d => d.todayDoneObj >= 2   },
  { id: "m_newobj",  key: "xp.m_newobj",  xp: 25,  check: d => d.tomorrowObjCount > 0},
  { id: "m_streak",  key: "xp.m_streak",  xp: 30,  check: d => d.todaySecs > 0 && d.streak >= 1 },
  { id: "m_noon",    key: "xp.m_noon",    xp: 35,  check: d => d.studiedBeforeNoon   },
  { id: "m_note",    key: "xp.m_note",    xp: 25,  check: d => d.hasStudyNote         },
];

const MISSION_CATEGORIES = [
  MISSION_POOL.filter(m => ["m_25m", "m_1h", "m_2h", "m_3h"].includes(m.id)),
  MISSION_POOL.filter(m => ["m_s25", "m_s50", "m_s90", "m_two_sessions", "m_2courses"].includes(m.id)),
  MISSION_POOL.filter(m => ["m_obj1", "m_obj2", "m_newobj"].includes(m.id)),
  MISSION_POOL.filter(m => ["m_streak", "m_noon", "m_note"].includes(m.id)),
];

// Deterministic RNG seeded from date+userId string
function strToSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function seedRng(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

// "Parrainer un ami" — mission spéciale injectée ~3 jours / semaine.
// Hors MISSION_POOL pour contrôler sa fréquence indépendamment du tirage.
//
// 300 XP, quel que soit le jour. C'est de loin la plus grosse récompense de
// l'app — cinq heures de blocus — et c'est assumé : faire venir quelqu'un est
// ce qui compte le plus pour Blocus Tracker en ce moment.
//
// Le montant était de 300 les jours ordinaires et 600 les jours de mission,
// alors que la carte annonçait 600 dans les deux cas. Un seul montant, celui
// qui est affiché : une récompense qui varie selon un tirage invisible se lit
// comme une erreur, pas comme un bonus.
// Attribué côté serveur par apply_referral().
export const REFERRAL_MISSION = { id: "m_referral", key: "xp.m_referral", xp: 300, check: d => Boolean(d.referredToday) };

const REFERRAL_DAY_PROBABILITY = 3 / 7;

// Déterministe et stable par (jour, utilisateur). DOIT rester synchronisé avec
// la fonction SQL referral_mission_active() (même hash FNV-1a + xorshift32).
export function isReferralDay(date, userId) {
  const seed = strToSeed("ref:" + (date || "") + (userId || ""));
  const rng = seedRng(seed);
  return rng() < REFERRAL_DAY_PROBABILITY;
}

/** Returns one mission per category for offline/fallback mode. */
export function getDailyMissionDefs(date, userId) {
  const seed = strToSeed((date || "") + (userId || ""));
  const rng = seedRng(seed);
  const picked = MISSION_CATEGORIES.map(pool => pool[Math.floor(rng() * pool.length)]);
  // Les jours "parrainage", la mission remplace le dernier créneau tiré.
  if (isReferralDay(date, userId) && !picked.some(m => m.id === "m_referral")) {
    picked[picked.length - 1] = REFERRAL_MISSION;
  }
  return picked;
}

/**
 * Evaluates mission defs against current live data.
 * @param {Array} defs — from getDailyMissionDefs()
 * @param {{ todaySecs, todayMaxSessionSecs, todayDoneObj, streak, studiedBeforeNoon, studiedAfter20, postedToday, tomorrowObjCount, todayCoursesCount }} data
 */
export function evaluateMissions(defs, data) {
  return defs.map(m => ({ ...m, done: Boolean(m.check(data)) }));
}
