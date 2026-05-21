// XP / Level system for blocus-tracker.

// 15 levels — significantly harder to progress than before
export const LEVELS = [
  { level: 1,  titleKey: "xp.level1",  xp: 0     },
  { level: 2,  titleKey: "xp.level2",  xp: 500   },
  { level: 3,  titleKey: "xp.level3",  xp: 1200  },
  { level: 4,  titleKey: "xp.level4",  xp: 2200  },
  { level: 5,  titleKey: "xp.level5",  xp: 3500  },
  { level: 6,  titleKey: "xp.level6",  xp: 5000  },
  { level: 7,  titleKey: "xp.level7",  xp: 7000  },
  { level: 8,  titleKey: "xp.level8",  xp: 9500  },
  { level: 9,  titleKey: "xp.level9",  xp: 12500 },
  { level: 10, titleKey: "xp.level10", xp: 16000 },
  { level: 11, titleKey: "xp.level11", xp: 20000 },
  { level: 12, titleKey: "xp.level12", xp: 25000 },
  { level: 13, titleKey: "xp.level13", xp: 31000 },
  { level: 14, titleKey: "xp.level14", xp: 38000 },
  { level: 15, titleKey: "xp.level15", xp: 46000 },
];

/**
 * Compute total XP.
 * – 1 XP per minute studied (all-time)
 * – 20 XP per completed objective
 * – 10 XP per streak day (current streak)
 * – 15 XP per exam added
 * – 50 XP per badge earned
 */
export function computeTotalXP({ totalMinutes, completedObjectives, streak, examCount, badgeCount }) {
  return (
    Math.floor(totalMinutes)
    + completedObjectives * 20
    + streak * 10
    + examCount * 15
    + badgeCount * 50
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
// 16 missions; 4 are picked each day via seeded RNG (stable per day+user)

export const MISSION_POOL = [
  { id: "m_1h",      key: "xp.m_1h",      xp: 40,  check: d => d.todaySecs >= 3600   },
  { id: "m_2h",      key: "xp.m_2h",      xp: 80,  check: d => d.todaySecs >= 7200   },
  { id: "m_3h",      key: "xp.m_3h",      xp: 130, check: d => d.todaySecs >= 10800  },
  { id: "m_4h",      key: "xp.m_4h",      xp: 180, check: d => d.todaySecs >= 14400  },
  { id: "m_6h",      key: "xp.m_6h",      xp: 280, check: d => d.todaySecs >= 21600  },
  { id: "m_s90",     key: "xp.m_s90",     xp: 100, check: d => d.todayMaxSessionSecs >= 5400 },
  { id: "m_obj1",    key: "xp.m_obj1",    xp: 50,  check: d => d.todayDoneObj >= 1   },
  { id: "m_obj2",    key: "xp.m_obj2",    xp: 100, check: d => d.todayDoneObj >= 2   },
  { id: "m_obj3",    key: "xp.m_obj3",    xp: 150, check: d => d.todayDoneObj >= 3   },
  { id: "m_streak",  key: "xp.m_streak",  xp: 50,  check: d => d.streak >= 1         },
  { id: "m_noon",    key: "xp.m_noon",    xp: 60,  check: d => d.studiedBeforeNoon   },
  { id: "m_after20", key: "xp.m_after20", xp: 60,  check: d => d.studiedAfter20      },
  { id: "m_photo",   key: "xp.m_photo",   xp: 150, check: d => d.postedToday         },
  { id: "m_newobj",  key: "xp.m_newobj",  xp: 30,  check: d => d.tomorrowObjCount > 0},
  { id: "m_2courses",      key: "xp.m_2courses",      xp: 40,  check: d => d.todayCoursesCount >= 2 },
  { id: "m_3courses",      key: "xp.m_3courses",      xp: 70,  check: d => d.todayCoursesCount >= 3 },
  { id: "m_friend_sent",   key: "xp.m_friend_sent",   xp: 30,  check: d => d.friendSentToday         },
  { id: "m_friend_accept", key: "xp.m_friend_accept",  xp: 40,  check: d => d.friendAcceptToday       },
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

/** Returns 4 mission definitions for the given date + userId. Stable per calendar day. */
export function getDailyMissionDefs(date, userId) {
  const seed = strToSeed((date || "") + (userId || ""));
  const rng = seedRng(seed);
  const pool = [...MISSION_POOL];
  const picked = [];
  while (picked.length < 4 && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
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
