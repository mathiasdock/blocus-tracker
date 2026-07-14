// XP / Level system for blocus-tracker.

// 20 levels with non-decreasing gaps. Thresholds only moved down from the
// previous curve, so an existing user can level up but never level down.
export const LEVELS = [
  { level: 1,  titleKey: "xp.level1",  xp: 0      },
  { level: 2,  titleKey: "xp.level2",  xp: 400    },
  { level: 3,  titleKey: "xp.level3",  xp: 1000   },
  { level: 4,  titleKey: "xp.level4",  xp: 1800   },
  { level: 5,  titleKey: "xp.level5",  xp: 2800   },
  { level: 6,  titleKey: "xp.level6",  xp: 4000   },
  { level: 7,  titleKey: "xp.level7",  xp: 5600   },
  { level: 8,  titleKey: "xp.level8",  xp: 7600   },
  { level: 9,  titleKey: "xp.level9",  xp: 10000  },
  { level: 10, titleKey: "xp.level10", xp: 13000  },
  { level: 11, titleKey: "xp.level11", xp: 17000  },
  { level: 12, titleKey: "xp.level12", xp: 22000  },
  { level: 13, titleKey: "xp.level13", xp: 28000  },
  { level: 14, titleKey: "xp.level14", xp: 35000  },
  { level: 15, titleKey: "xp.level15", xp: 43000  },
  { level: 16, titleKey: "xp.level16", xp: 52000  },
  { level: 17, titleKey: "xp.level17", xp: 62000  },
  { level: 18, titleKey: "xp.level18", xp: 73000  },
  { level: 19, titleKey: "xp.level19", xp: 86000  },
  { level: 20, titleKey: "xp.level20", xp: 100000 },
];

/**
 * Compute total XP.
 * – 1 XP per minute studied (all-time)
 * – 20 XP per completed objective
 * – 10 XP per streak day (current streak)
 * – 15 XP per exam added
 * – 50 XP per badge earned
 */
export function computeTotalXP({ totalMinutes, completedObjectives, streak, examCount, badgeCount, bonusXP = 0 }) {
  return (
    Math.floor(totalMinutes)
    + completedObjectives * 20
    + streak * 10
    + examCount * 15
    + badgeCount * 50
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

// ── Daily missions pool ──────────────────────────────────────
// The production source of truth is Supabase. This local evaluator is kept
// for offline development and graceful fallback before a migration deploy.

export const MISSION_POOL = [
  { id: "m_25m",     key: "xp.m_25m",     xp: 20,  category: "duration",    check: d => d.todaySecs >= 1500   },
  { id: "m_1h",      key: "xp.m_1h",      xp: 40,  check: d => d.todaySecs >= 3600   },
  { id: "m_2h",      key: "xp.m_2h",      xp: 80,  check: d => d.todaySecs >= 7200   },
  { id: "m_3h",      key: "xp.m_3h",      xp: 130, check: d => d.todaySecs >= 10800  },
  { id: "m_s25",     key: "xp.m_s25",     xp: 30,  category: "focus",       check: d => d.todayMaxSessionSecs >= 1500 },
  { id: "m_s50",     key: "xp.m_s50",     xp: 55,  category: "focus",       check: d => d.todayMaxSessionSecs >= 3000 },
  { id: "m_s90",     key: "xp.m_s90",     xp: 100, category: "focus",       check: d => d.todayMaxSessionSecs >= 5400 },
  { id: "m_two_sessions", key: "xp.m_two_sessions", xp: 40, category: "focus", check: d => d.todaySessionCount >= 2 },
  { id: "m_2courses", key: "xp.m_2courses", xp: 40, category: "focus", check: d => d.todayCoursesCount >= 2 },
  { id: "m_obj1",    key: "xp.m_obj1",    xp: 50,  check: d => d.todayDoneObj >= 1   },
  { id: "m_obj2",    key: "xp.m_obj2",    xp: 100, check: d => d.todayDoneObj >= 2   },
  { id: "m_newobj",  key: "xp.m_newobj",  xp: 30,  check: d => d.tomorrowObjCount > 0},
  { id: "m_streak",  key: "xp.m_streak",  xp: 50,  check: d => d.todaySecs > 0 && d.streak >= 1 },
  { id: "m_noon",    key: "xp.m_noon",    xp: 60,  check: d => d.studiedBeforeNoon   },
  { id: "m_note",    key: "xp.m_note",    xp: 30,  check: d => d.hasStudyNote         },
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
// Le XP réel est attribué côté serveur dans apply_referral : 300 de base,
// 600 au total quand la mission du jour est active. La carte affiche 600.
export const REFERRAL_MISSION = { id: "m_referral", key: "xp.m_referral", xp: 600, check: d => Boolean(d.referredToday) };

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
