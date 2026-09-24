import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { playSensoryCue } from "../lib/sensoryFeedback";
import {
  destinationFor,
  fetchInbox,
  fetchSummary,
  legacyDismissedKeys,
  mergeItems,
  nextCursor,
  seenMaps,
  sendMarkAllRead,
  sendMarkRead,
  withAllRead,
  withItemRead,
} from "../lib/notificationCenter.mjs";

// Deux choses vivent ici :
//   • les compteurs de navigation (Fil, Messages, Espaces, groupes) — UNE
//     lecture (notification_summary, v64) au lieu des 7 à 13 requêtes que
//     l'app refaisait toutes les 2 minutes ;
//   • la cloche : sa liste et son lu / non lu appartiennent au COMPTE, en
//     base. Lue sur le téléphone = lue sur l'ordinateur.
// Les « vu pour la dernière fois » du Fil, des espaces et des groupes restent
// sur l'appareil, comme avant : seule la cloche change de modèle.

const EMPTY_INBOX = Object.freeze({
  status: "idle", // idle | loading | ready | error
  items: [],
  unread: 0,
  hasMore: false,
  loadingMore: false,
  moreError: false,
});

const NotificationContext = createContext({
  feedCount: 0,
  friendCount: 0,
  communityCount: {},
  totalCommunity: 0,
  messageCount: 0,
  groupCount: {},
  totalGroups: 0,
  notificationUnreadCount: 0,
  inbox: EMPTY_INBOX,
  loadInbox: () => {},
  loadMoreInbox: () => {},
  markNotificationRead: () => {},
  markAllNotificationsRead: () => {},
  openNotification: () => null,
  msgToast: false,
  clearMsgToast: () => {},
  markSeen: () => {},
  markGroupSeen: () => {},
  refreshNotifications: () => {},
});

const POLL_VISIBLE_MS = 120000; // 2 min — onglet visible
const POLL_HIDDEN_MS = 300000;  // 5 min — onglet en arrière-plan
const POLL_DEBOUNCE_MS = 1200;
const SEEN_PREFIX = "bt_last_seen_";

function getLastSeen(key) {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(`${SEEN_PREFIX}${key}`) || null; } catch { return null; }
}

function setLastSeen(key) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`${SEEN_PREFIX}${key}`, new Date().toISOString()); } catch {}
}

// Les « vu » des espaces et groupes, lus d'un coup pour la requête unique.
function seenEntries() {
  if (typeof window === "undefined") return [];
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i);
      if (name && name.startsWith(SEEN_PREFIX)) entries.push([name.slice(SEEN_PREFIX.length), localStorage.getItem(name)]);
    }
  } catch {}
  return entries;
}

const rpc = (name, params) => supabase.rpc(name, params);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const [feedCount, setFeedCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [communityCount, setCommunityCount] = useState({});
  const [messageCount, setMessageCount] = useState(0);
  const [groupCount, setGroupCount] = useState({});
  const [bellUnread, setBellUnread] = useState(0);
  const [inbox, setInbox] = useState(EMPTY_INBOX);
  const [msgToast, setMsgToast] = useState(false);
  const pollingRef = useRef(false);
  const pollTimeoutRef = useRef(null);
  const audibleBaselineRef = useRef(null);
  const inboxRef = useRef(inbox);
  const legacyImportRef = useRef(null);
  const schedulePollRef = useRef(null);
  // La page courante ne sert qu'à se taire dans Messages : elle passe par une
  // référence, pour que changer de page ne relance ni la lecture des
  // compteurs ni l'abonnement temps réel.
  const pathnameRef = useRef(router.pathname);
  inboxRef.current = inbox;
  pathnameRef.current = router.pathname;

  const clearMsgToast = useCallback(() => setMsgToast(false), []);

  const markSeen = useCallback((key) => {
    setLastSeen(key);
    if (key === "feed") {
      setFeedCount(0);
    } else if (key === "friends") {
      setFriendCount(0);
    } else if (key === "messages") {
      setMessageCount(0); setMsgToast(false);
    } else {
      setCommunityCount((prev) => ({ ...prev, [key]: 0 }));
    }
  }, []);

  // Realtime : toast immédiat quand un message privé arrive, sur n'importe
  // quelle page (sauf dans Messages). La cloche se met à jour au passage.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-dm-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          setMessageCount((c) => c + 1);
          if (audibleBaselineRef.current !== null) audibleBaselineRef.current += 1;
          if (pathnameRef.current !== "/messages") {
            setMsgToast(true);
            if (typeof document === "undefined" || !document.hidden) playSensoryCue("notification");
          }
          schedulePollRef.current?.(POLL_DEBOUNCE_MS);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const loadInbox = useCallback(async () => {
    if (!user) return;
    setInbox((state) => (state.items.length ? state : { ...state, status: "loading" }));
    try {
      const page = await fetchInbox(rpc);
      setInbox({ ...EMPTY_INBOX, status: "ready", items: page.items, unread: page.unread, hasMore: page.hasMore });
      setBellUnread(page.unread);
    } catch (error) {
      console.warn("Notifications unavailable:", error?.message || error);
      setInbox((state) => ({ ...state, status: state.items.length ? "ready" : "error" }));
    }
  }, [user]);

  const loadMoreInbox = useCallback(async () => {
    const current = inboxRef.current;
    if (!user || current.loadingMore || !current.hasMore) return;
    setInbox((state) => ({ ...state, loadingMore: true, moreError: false }));
    try {
      const page = await fetchInbox(rpc, nextCursor(current.items));
      setInbox((state) => ({
        ...state,
        items: mergeItems(state.items, page.items),
        unread: page.unread,
        hasMore: page.hasMore,
        loadingMore: false,
      }));
      setBellUnread(page.unread);
    } catch {
      setInbox((state) => ({ ...state, loadingMore: false, moreError: true }));
    }
  }, [user]);

  const poll = useCallback(async () => {
    if (!user || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const feedSince = getLastSeen("feed");
      if (!feedSince) setLastSeen("feed");
      const { rooms, groups } = seenMaps(seenEntries());
      const summary = await fetchSummary(rpc, { feedSince, rooms, groups });
      if (!summary) return;

      if (feedSince && summary.feed !== null) setFeedCount(summary.feed);
      setFriendCount(summary.friends);
      setMessageCount(summary.messages);
      const nextCommunity = {};
      for (const room of summary.rooms) {
        if (!room.seen) setLastSeen(`room_${room.id}`);
        nextCommunity[`room_${room.id}`] = room.unread;
      }
      setCommunityCount(nextCommunity);
      const nextGroups = {};
      for (const group of summary.groups) {
        if (!group.seen) setLastSeen(`group_${group.id}`);
        nextGroups[group.id] = group.unread;
      }
      setGroupCount(nextGroups);

      // La cloche a bougé pendant que sa liste est ouverte : on relit la
      // première page, sans perdre ce qui a déjà été chargé plus bas.
      const open = inboxRef.current;
      if (open.status === "ready" && summary.bell !== open.unread) {
        fetchInbox(rpc).then((page) => {
          setInbox((state) => ({ ...state, items: mergeItems(state.items, page.items), unread: page.unread }));
          setBellUnread(page.unread);
        }).catch(() => {});
      }
      setBellUnread(summary.bell);

      const audible = summary.bell + summary.messages;
      if (audibleBaselineRef.current !== null
          && audible > audibleBaselineRef.current
          && (typeof document === "undefined" || !document.hidden)
          && pathnameRef.current !== "/messages") {
        playSensoryCue("notification");
      }
      audibleBaselineRef.current = audible;

      // Une seule fois : les annonces que l'ancienne cloche avait masquées
      // sur CET appareil deviennent lues sur le compte.
      if (legacyImportRef.current !== user.id) {
        legacyImportRef.current = user.id;
        importLegacyDismissals(user.id).then((imported) => { if (imported) schedulePollRef.current?.(300); });
      }
    } catch (error) {
      console.warn("Notification counters unavailable:", error?.message || error);
    } finally {
      pollingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    audibleBaselineRef.current = null;
    setInbox(EMPTY_INBOX);
    setBellUnread(0);
  }, [user?.id]);

  const schedulePoll = useCallback((delay = POLL_DEBOUNCE_MS) => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = setTimeout(() => {
      pollTimeoutRef.current = null;
      poll();
    }, delay);
  }, [poll]);
  schedulePollRef.current = schedulePoll;

  const refreshNotifications = useCallback(() => {
    schedulePoll(100);
  }, [schedulePoll]);

  const markNotificationRead = useCallback((key) => {
    const item = inboxRef.current.items.find((entry) => entry.key === key);
    if (!item || item.read) return;
    setInbox((state) => withItemRead(state, key));
    setBellUnread((count) => Math.max(0, count - 1));
    sendMarkRead(rpc, key).catch((error) => {
      console.warn("Mark read failed:", error?.message || error);
      schedulePoll(500);
    });
  }, [schedulePoll]);

  const markAllNotificationsRead = useCallback(async () => {
    setInbox((state) => withAllRead(state));
    setBellUnread(0);
    try {
      await sendMarkAllRead(rpc);
    } catch (error) {
      console.warn("Mark all read failed:", error?.message || error);
      loadInbox();
    }
  }, [loadInbox]);

  // Ouvrir une notification : elle devient lue, puis on va à sa destination
  // (null quand il n'y en a pas de sûre — une annonce sans lien).
  const openNotification = useCallback((item) => {
    if (!item) return null;
    if (!item.read) markNotificationRead(item.key);
    const href = destinationFor(item);
    if (href) router.push(href);
    return href;
  }, [markNotificationRead, router]);

  const markGroupSeen = useCallback((groupId) => {
    if (!groupId) return;
    setLastSeen(`group_${groupId}`);
    setGroupCount((prev) => ({ ...prev, [groupId]: 0 }));
  }, []);

  useEffect(() => {
    if (!user) return;
    let loopId;

    function scheduleLoop() {
      const delay = typeof document !== "undefined" && document.hidden
        ? POLL_HIDDEN_MS
        : POLL_VISIBLE_MS;
      loopId = setTimeout(async () => {
        await poll();
        scheduleLoop();
      }, delay);
    }

    function onFocus() {
      schedulePoll(100);
    }

    function onVisibilityChange() {
      if (!document.hidden) schedulePoll(100);
    }

    poll();
    scheduleLoop();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(loopId);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [poll, schedulePoll, user]);

  const totalCommunity = Object.values(communityCount).reduce((a, b) => a + b, 0);
  const totalGroups = Object.values(groupCount).reduce((a, b) => a + b, 0);
  const notificationUnreadCount = user ? bellUnread : 0;

  // ── Badge sur l'icône de l'app installée (Badging API, PWA) ──────────────
  // Le chiffre de la cloche, qui compte désormais aussi les conversations non
  // lues. No-op silencieux si l'API n'existe pas ; effacé à zéro.
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.setAppBadge !== "function") return;
    try {
      if (notificationUnreadCount > 0) navigator.setAppBadge(notificationUnreadCount).catch(() => {});
      else navigator.clearAppBadge().catch(() => {});
    } catch {}
  }, [notificationUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        feedCount,
        friendCount,
        communityCount,
        totalCommunity,
        messageCount,
        groupCount,
        totalGroups,
        notificationUnreadCount,
        inbox,
        loadInbox,
        loadMoreInbox,
        markNotificationRead,
        markAllNotificationsRead,
        openNotification,
        msgToast,
        clearMsgToast,
        markSeen,
        markGroupSeen,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// L'ancienne cloche masquait les annonces sur l'appareil seulement
// (bt_dismissed_announcements_<id>). Elles deviennent des lectures du compte,
// puis la clé locale disparaît — avec les deux repères que plus rien ne lit.
async function importLegacyDismissals(userId) {
  if (typeof window === "undefined") return false;
  const storageKey = `bt_dismissed_announcements_${userId}`;
  let keys = [];
  try {
    keys = legacyDismissedKeys(localStorage.getItem(storageKey));
    localStorage.removeItem(`${SEEN_PREFIX}comments`);
    localStorage.removeItem(`${SEEN_PREFIX}feed_interactions`);
    if (!keys.length) {
      localStorage.removeItem(storageKey);
      return false;
    }
  } catch {
    return false;
  }
  try {
    for (const key of keys) await sendMarkRead(rpc, key);
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export const useNotifications = () => useContext(NotificationContext);
