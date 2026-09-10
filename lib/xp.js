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
// La source de vérité en production est Supabase (migration v49). Ce module
// est le REPLI : développement hors-ligne, et les quelques secondes entre le
// chargement de la page et la réponse du serveur.
//
// Il ne sait pas tout faire. Les défis qui demandent le nom d'un cours ou une
// date d'examen (c_exam_soon, c_neglected) ne sont pas reproduits ici : la
// page profil ne charge ni les cours ni les examens, et les charger pour un
// repli de trois secondes serait payer une requête permanente pour un cas
// transitoire. Le repli couvre ce qu'il peut lire dans les sessions déjà en
// mémoire, et le serveur corrige au premier aller-retour.
//
// ── Ce qu'une mission doit peser ────────────────────────────
// Une journée parfaite rapportait jusqu'à 390 XP de missions — 6 h 30 d'étude
// EN PLUS des heures réellement faites. Une mission payait mieux que le
// travail qu'elle récompensait. Trois missions (15 à 45) plus un défi (50)
// plafonnent maintenant à 175, soit un peu moins que les ~180 XP d'étude qu'il
// faut produire pour tout réussir.
//
// Baisser ces montants ne reprend rien : chaque mission validée est écrite
// dans xp_ledger avec le montant qui avait cours ce jour-là.
export const MISSION_POOL = [
  // Volume — recompte des minutes déjà créditées à 1 XP/min, donc payé au plus bas.
  { id: "m_25m", key: "xp.m_25m", xp: 15, family: "volume", check: d => d.todaySecs >= 1500 },
  { id: "m_1h",  key: "xp.m_1h",  xp: 25, family: "volume", check: d => d.todaySecs >= 3600 },
  { id: "m_2h",  key: "xp.m_2h",  xp: 35, family: "volume", check: d => d.todaySecs >= 7200 },
  { id: "m_3h",  key: "xp.m_3h",  xp: 45, family: "volume", check: d => d.todaySecs >= 10800 },
  // Forme du travail
  { id: "m_two_sessions", key: "xp.m_two_sessions", xp: 25, family: "focus", check: d => d.todaySessionCount >= 2 },
  { id: "m_s50", key: "xp.m_s50", xp: 30, family: "focus", check: d => d.todayMaxSessionSecs >= 3000 },
  { id: "m_two_focused", key: "xp.m_two_focused", xp: 35, family: "focus", check: d => d.todayFocusedCount >= 2 },
  { id: "m_s90", key: "xp.m_s90", xp: 40, family: "focus", check: d => d.todayMaxSessionSecs >= 5400 },
  // Cours et rythme. Le minimum PAR COURS est le point important : avant,
  // deux minutes sur un second cours validaient « étudie 2 cours différents »,
  // ce qui récompensait le fait de cliquer, pas d'étudier.
  { id: "m_2courses", key: "xp.m_2courses", xp: 30, family: "context", check: d => d.todayCoursesCount >= 2 },
  { id: "m_noon", key: "xp.m_noon", xp: 35, family: "context", check: d => d.studiedBeforeNoon },
  { id: "m_3courses", key: "xp.m_3courses", xp: 40, family: "context", check: d => d.todayCoursesCount >= 3 },
];

const MISSION_BY_ID = Object.fromEntries(MISSION_POOL.map(m => [m.id, m]));

// Les défis ne vivent pas dans MISSION_POOL : ils portent des paramètres gelés
// à l'attribution (la cible en minutes, le cours, le nombre de jours) et se
// vérifient contre ces paramètres, pas contre un seuil fixe.
export const CHALLENGE_XP = 50;

export const CHALLENGES = {
  c_exam_soon:      { axis: "context", check: (d, p) => (d.minutesOnCourse?.[p.course_id] || 0) >= p.target },
  c_neglected:      { axis: "context", check: (d, p) => (d.minutesOnCourse?.[p.course_id] || 0) >= p.target },
  c_protect_streak: { axis: "volume",  check: (d, p) => d.todaySecs / 60 >= p.target },
  c_beat_yesterday: { axis: "volume",  check: (d, p) => d.todaySecs / 60 >= p.target },
  c_beat_average:   { axis: "volume",  check: (d, p) => d.todaySecs / 60 >= p.target },
  c_comeback:       { axis: "volume",  check: (d, p) => d.todaySecs / 60 >= p.target },
  c_first_session:  { axis: "volume",  check: (d, p) => d.todaySecs / 60 >= p.target },
};

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

// Le parrainage N'EST PLUS une mission quotidienne. Assignée 133 fois, réussie
// 0 fois : parrainer n'est pas un geste qu'on répète tous les jours, et lui
// réserver un créneau sur quatre revenait à afficher une ligne morte en
// permanence. La récompense existe toujours, et reste la plus grosse de l'app
// (300 XP), mais elle est versée par apply_referral() au moment où quelqu'un
// entre un code — pas par une case à cocher.

// ── Repli : choisir un défi sans le serveur ──────────────────
// Même ordre de priorité que gamification_pick_challenge(), amputé des deux
// candidats qui demandent le nom d'un cours. Les garde-fous sont les mêmes et
// comptent autant que les scores : on ne propose pas de battre une journée de
// sept heures, ni une moyenne calculée sur deux jours actifs. Un défi
// impossible n'encourage personne — il apprend à ignorer la carte.
export function pickFallbackChallenge(ctx = {}) {
  const {
    streak = 0, yesterdayMin = 0, avgMin = 0, active7 = 0,
    daysSinceLast = null,
    // `null` et non `0` : un appelant qui ne charge pas l'historique (la carte
    // du tableau de bord ne lit que les sessions du jour) ne doit pas se voir
    // proposer « ton tout premier bloc » alors qu'il étudie depuis des mois.
    // Sans historique, pas de défi — le serveur répond une seconde plus tard.
    totalSessions = null,
  } = ctx;
  const out = (id, params) => ({ id, xp: CHALLENGE_XP, params });

  if (streak >= 2) return out("c_protect_streak", { streak, target: 20 });
  if ((totalSessions || 0) > 0 && (daysSinceLast || 0) >= 3) {
    return out("c_comeback", { days: daysSinceLast, target: 25 });
  }
  if (yesterdayMin >= 20 && yesterdayMin <= 240) {
    return out("c_beat_yesterday", { minutes: yesterdayMin, target: yesterdayMin + 1 });
  }
  if (active7 >= 3 && avgMin >= 20 && avgMin <= 240) {
    return out("c_beat_average", { minutes: avgMin, target: avgMin + 1 });
  }
  if (totalSessions === 0) return out("c_first_session", { target: 25 });
  return null;
}

/**
 * Trois missions du jour + le défi, en repli.
 *
 * Le défi est choisi EN PREMIER et réserve son axe : quand il porte sur le
 * volume, le créneau volume laisse sa place à une mission de contexte. Sans
 * cette règle on obtenait des journées où une seule session d'une heure
 * cochait les quatre lignes — quatre libellés pour une seule demande.
 */
export function getDailyMissionDefs(date, userId, ctx = {}) {
  const rng = seedRng(strToSeed((date || "") + (userId || "")));
  const pickFrom = (pool) => pool[Math.floor(rng() * pool.length)];
  const byFamily = (f) => MISSION_POOL.filter(m => m.family === f);

  const challenge = pickFallbackChallenge(ctx);
  const challengeAxis = challenge ? CHALLENGES[challenge.id]?.axis : null;

  const context = byFamily("context").filter(m =>
    m.id !== "m_3courses" || (ctx.courseCount || 0) >= 3);
  const picked = [];

  if (challengeAxis === "volume" && context.length >= 2) {
    const first = pickFrom(context);
    picked.push(first, pickFrom(byFamily("focus")),
      pickFrom(context.filter(m => m.id !== first.id)));
  } else {
    picked.push(pickFrom(byFamily("volume")), pickFrom(byFamily("focus")), pickFrom(context));
  }

  const defs = picked.map(m => ({ ...m, kind: "daily", params: {} }));
  if (challenge) {
    defs.push({
      id: challenge.id, key: `xp.${challenge.id}`, xp: challenge.xp,
      kind: "challenge", params: challenge.params,
      check: (d) => CHALLENGES[challenge.id].check(d, challenge.params),
    });
  }
  return defs;
}

/**
 * Évalue des définitions contre les données du jour.
 * @param {Array} defs — de getDailyMissionDefs()
 * @param {{ todaySecs, todayMaxSessionSecs, todaySessionCount, todayFocusedCount,
 *           todayCoursesCount, studiedBeforeNoon, minutesOnCourse }} data
 */
export function evaluateMissions(defs, data) {
  return defs.map(m => ({ ...m, done: Boolean(m.check(data)) }));
}

// ── Repli : missions hebdomadaires ───────────────────────────
// Même formule d'adaptation que le serveur : médiane des quatre semaines
// précédentes, majorée d'environ 15 %. La médiane plutôt que la moyenne —
// une semaine de blocus exceptionnelle ne doit pas fixer la barre des six
// suivantes.
export const WEEKLY_XP = { w_hours: 150, w_days: 120, w_courses: 90 };

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Lundi de la semaine d'une date locale (ISO yyyy-mm-dd). */
export function weekStartISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Missions de la semaine avec cible adaptée et progression.
 * @param {Array} sessions — { started_at, duration_seconds, course_id }
 * @param {number} courseCount — nombre de cours du compte
 */
export function fallbackWeeklyMissions(sessions = [], courseCount = 0) {
  const week = weekStartISO();
  const dayOf = (s) => String(s.started_at || "").slice(0, 10);
  const weekOf = (s) => weekStartISO(new Date(s.started_at));

  const past = {};
  const current = { mins: 0, days: new Set(), courses: {} };
  for (const s of sessions) {
    const secs = s.duration_seconds || 0;
    if (weekOf(s) === week) {
      current.mins += secs / 60;
      current.days.add(dayOf(s));
      if (s.course_id) current.courses[s.course_id] = (current.courses[s.course_id] || 0) + secs;
      continue;
    }
    const wk = weekOf(s);
    if (wk >= weekStartISO(new Date(Date.now() - 28 * 86400000)) && wk < week) {
      const bucket = past[wk] || (past[wk] = { mins: 0, days: new Set(), courses: new Set() });
      bucket.mins += secs / 60;
      bucket.days.add(dayOf(s));
      if (s.course_id) bucket.courses.add(s.course_id);
    }
  }

  const weeks = Object.values(past);
  const medMin = median(weeks.map(w => w.mins));
  const medDays = median(weeks.map(w => w.days.size));
  const medCourses = median(weeks.map(w => w.courses.size));

  // 2 h par semaine, c'est vingt minutes par jour ouvré : un seuil de présence,
  // pas un défi. Plancher à 4 h, et la semaine en cours compte — on n'attribue
  // pas forcément lundi matin.
  const targetMin = clamp(
    Math.max(
      Math.round((medMin ?? 209) * 1.15 / 30) * 30,
      Math.round((current.mins * 1.15) / 30) * 30,
    ),
    240, 1200,
  );
  const targetDays = clamp(Math.round(medDays ?? 2) + 1, 2, 6);
  const targetCourses = clamp(Math.round(medCourses ?? 1) + 1, 2, Math.min(4, courseCount));

  const doneCourses = Object.values(current.courses).filter(secs => secs >= 900).length;
  const rows = [
    { id: "w_hours", key: "xp.w_hours", xp: WEEKLY_XP.w_hours, target: targetMin, progress: Math.round(current.mins) },
    { id: "w_days", key: "xp.w_days", xp: WEEKLY_XP.w_days, target: targetDays, progress: current.days.size },
  ];
  // Sautée sous deux cours : une mission qu'on ne peut pas réussir vaut moins
  // que pas de mission du tout.
  if (courseCount >= 2) {
    rows.push({ id: "w_courses", key: "xp.w_courses", xp: WEEKLY_XP.w_courses, target: targetCourses, progress: doneCourses });
  }
  return rows.map(r => ({ ...r, done: r.progress >= r.target }));
}
