import { useAccountRead } from "./useAccountRead";
import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { BADGES } from "../lib/badges";
import { fetchCanonicalBadges } from "../lib/badgeTruth.mjs";
import { loadCanonicalUserLevelMap } from "../lib/userLevels";

const catalog = BADGES.map(badge => badge.id);
const readBadges = userId => fetchCanonicalBadges(supabase, userId, catalog);
const readLevel = async (userId, options) => {
  const levels = await loadCanonicalUserLevelMap(supabase, [userId], { ...options, selfUserId: userId });
  return levels[userId];
};

export const useBadgeRead = userId => useAccountRead(userId, readBadges);
export function useLevelRead(userId) {
  const state = useAccountRead(userId, readLevel);
  const { refresh } = state;
  // Only XP reads subscribe. Badge sync can award persisted badges and must
  // retain its explicit mount/account/retry triggers, not follow XP events.
  useEffect(() => {
    const changed = () => { void refresh({ supersede: true }); };
    window.addEventListener("bt-xp-changed", changed);
    return () => window.removeEventListener("bt-xp-changed", changed);
  }, [refresh]);
  return state;
}

export function useProfileAchievementReads(userId) {
  const badges = useBadgeRead(userId);
  // Profile historically read XP AFTER sync_my_badges. Entering the account
  // from null forces that first XP read, without flushing other users' caches.
  const level = useLevelRead(badges.data || badges.error ? userId : null);
  const levelData = useRef(null);
  levelData.current = level.data;
  const previous = useRef(null);
  useEffect(() => {
    if (!badges.data) return;
    const ids = JSON.stringify(badges.data.ids);
    const changed = previous.current?.ownerId !== userId || previous.current?.ids !== ids;
    previous.current = { ownerId: userId, ids };
    // A successful retry may sync a new badge after XP has already loaded.
    if (changed && levelData.current) void level.refresh({ force: true, supersede: true });
  }, [userId, badges.data, level.refresh]);
  return { badges, level };
}
