import { computeStreak } from "./format";
import { computeEarnedBadgeIds } from "./badges";
import { computeTotalXP, getLevelInfo } from "./xp";

function rows(res, label) {
  if (res?.error) {
    console.warn(`Unable to load ${label} for level computation:`, res.error);
    return [];
  }
  return res?.data || [];
}

function addToList(map, id, value) {
  if (!id) return;
  if (!map[id]) map[id] = [];
  map[id].push(value);
}

function inc(map, id, amount = 1) {
  if (!id) return;
  map[id] = (map[id] || 0) + amount;
}

function normalizeIds(userIds) {
  return [...new Set((userIds || []).filter(Boolean))];
}

// ── Cache mémoire court (anti-egress) ────────────────────────────────────────
// Évite de relancer les ~13 requêtes de calcul de niveau pour les MÊMES userIds
// plusieurs fois en peu de temps (watcher, leaderboard, modales, navigation).
// Ne change RIEN au résultat : on mémorise simplement la sortie de la fonction.
const LEVEL_CACHE_TTL_MS = 3 * 60 * 1000; // 3 min
const levelCache = new Map();    // key -> { ts, data }
const inflight = new Map();      // key -> Promise (dédup des appels concurrents)

function cacheKey(ids, options = {}) {
  // La clé tient compte des userIds (triés) et des options qui influencent la
  // sortie (referral stats du self). fallbackTotalSecondsByUser n'est utilisé
  // qu'en repli quand un user n'a pas de sessions → inclus pour être sûr.
  return JSON.stringify({
    ids: [...ids].sort(),
    self: options.selfUserId || null,
    refSelf: !!options.includeSelfReferralStats,
    fb: options.fallbackTotalSecondsByUser || null,
  });
}

export async function loadUserLevelMap(supabase, userIds, options = {}) {
  const ids = normalizeIds(userIds);
  if (!ids.length) return {};

  const key = cacheKey(ids, options);

  // 1) Cache frais → renvoi immédiat, zéro requête.
  const cached = levelCache.get(key);
  if (cached && Date.now() - cached.ts < LEVEL_CACHE_TTL_MS) {
    return cached.data;
  }

  // 2) Requête identique déjà en vol → on réutilise la même promesse.
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const data = await computeUserLevelMap(supabase, ids, options);
    levelCache.set(key, { ts: Date.now(), data });
    return data;
  })();
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

// Permet de forcer un recalcul (ex. après un changement XP explicite).
export function clearUserLevelCache() {
  levelCache.clear();
  inflight.clear();
}

async function computeUserLevelMap(supabase, ids, options = {}) {
  const fallbackTotalSecondsByUser = options.fallbackTotalSecondsByUser || {};
  const [
    profileRes,
    sessionsRes,
    examsRes,
    objectivesRes,
    badgesRes,
    postsRes,
    likesRes,
    commentsRes,
    groupMembersRes,
    communityMessagesRes,
    friendshipsRequesterRes,
    friendshipsAddresseeRes,
    referralStatsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, bonus_xp").in("id", ids),
    supabase.from("sessions").select("user_id, started_at, duration_seconds").in("user_id", ids),
    supabase.from("exams").select("user_id").in("user_id", ids),
    supabase.from("objectives").select("user_id, done").in("user_id", ids),
    supabase.from("user_badges").select("user_id, badge_id").in("user_id", ids),
    supabase.from("posts").select("user_id").in("user_id", ids),
    supabase.from("likes").select("user_id").in("user_id", ids),
    supabase.from("comments").select("user_id").in("user_id", ids),
    supabase.from("group_members").select("user_id").in("user_id", ids),
    supabase.from("community_messages").select("user_id").in("user_id", ids),
    supabase.from("friendships").select("id, requester, addressee").in("requester", ids).eq("status", "accepted"),
    supabase.from("friendships").select("id, requester, addressee").in("addressee", ids).eq("status", "accepted"),
    options.includeSelfReferralStats && options.selfUserId && ids.includes(options.selfUserId)
      ? supabase.rpc("get_my_referral_stats")
      : Promise.resolve({ data: null, error: null }),
  ]);

  const profiles = {};
  rows(profileRes, "profiles").forEach((p) => {
    profiles[p.id] = p;
  });

  const sessionsByUser = {};
  rows(sessionsRes, "sessions").forEach((s) => addToList(sessionsByUser, s.user_id, s));

  const examCounts = {};
  rows(examsRes, "exams").forEach((row) => inc(examCounts, row.user_id));

  const objectiveCounts = {};
  const completedObjectiveCounts = {};
  rows(objectivesRes, "objectives").forEach((row) => {
    inc(objectiveCounts, row.user_id);
    if (row.done) inc(completedObjectiveCounts, row.user_id);
  });

  const badgesByUser = {};
  rows(badgesRes, "user_badges").forEach((row) => addToList(badgesByUser, row.user_id, row.badge_id));

  const postCounts = {};
  rows(postsRes, "posts").forEach((row) => inc(postCounts, row.user_id));

  const reactionCounts = {};
  rows(likesRes, "likes").forEach((row) => inc(reactionCounts, row.user_id));
  rows(commentsRes, "comments").forEach((row) => inc(reactionCounts, row.user_id));

  const groupMemberCounts = {};
  rows(groupMembersRes, "group_members").forEach((row) => inc(groupMemberCounts, row.user_id));

  const communityMessageCounts = {};
  rows(communityMessagesRes, "community_messages").forEach((row) => inc(communityMessageCounts, row.user_id));

  const friendIdsByUser = {};
  [...rows(friendshipsRequesterRes, "friendships"), ...rows(friendshipsAddresseeRes, "friendships")].forEach((row) => {
    addToList(friendIdsByUser, row.requester, row.id);
    addToList(friendIdsByUser, row.addressee, row.id);
  });

  const selfReferralCount =
    referralStatsRes.data?.ok && options.selfUserId
      ? referralStatsRes.data.count || 0
      : 0;

  const out = {};
  ids.forEach((id) => {
    const sessions = sessionsByUser[id] || [];
    const fallbackSeconds = Number(fallbackTotalSecondsByUser[id] || 0);
    const totalSeconds = sessions.length
      ? sessions.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0)
      : fallbackSeconds;
    const streak = sessions.length ? computeStreak(sessions) : 0;
    const dayTotals = {};
    sessions.forEach((s) => {
      const day = (s.started_at || "").slice(0, 10);
      if (day) dayTotals[day] = (dayTotals[day] || 0) + Number(s.duration_seconds || 0);
    });
    const earnedBadges = computeEarnedBadgeIds({
      streak,
      totalHours: totalSeconds / 3600,
      maxDailyHours: Object.values(dayTotals).length ? Math.max(...Object.values(dayTotals)) / 3600 : 0,
      sessionCount: sessions.length,
      examCount: examCounts[id] || 0,
      objectiveCount: objectiveCounts[id] || 0,
      completedObjCount: completedObjectiveCounts[id] || 0,
      friendCount: new Set(friendIdsByUser[id] || []).size,
      postCount: postCounts[id] || 0,
      reactionsCount: reactionCounts[id] || 0,
      groupMemberCount: groupMemberCounts[id] || 0,
      communityMsgCount: communityMessageCounts[id] || 0,
      referralCount: id === options.selfUserId ? selfReferralCount : 0,
    });
    const existingBadges = badgesByUser[id] || [];
    const totalXP = computeTotalXP({
      totalMinutes: totalSeconds / 60,
      completedObjectives: completedObjectiveCounts[id] || 0,
      streak,
      examCount: examCounts[id] || 0,
      badgeCount: new Set([...existingBadges, ...earnedBadges]).size,
      bonusXP: profiles[id]?.bonus_xp || 0,
    });
    out[id] = getLevelInfo(totalXP);
  });

  return out;
}
