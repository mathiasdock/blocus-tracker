import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { playSensoryCue } from "../lib/sensoryFeedback";
import {
  destinationFor,
  emptyHidden,
  fetchInbox,
  fetchSummary,
  legacyDismissedKeys,
  mergeItems,
  nextCursor,
  rememberHidden,
  seenMaps,
  sendDismiss,
  sendDismissAll,
  sendMarkAllRead,
  sendMarkRead,
  withAllRead,
  withItemLeaving,
  withItemRead,
  withoutAll,
  withoutHidden,
  withoutItem,
} from "../lib/notificationCenter.mjs";

// Deux choses vivent ici :
//   • les compteurs de navigation (Fil, Messages, Espaces, groupes) — UNE
//     lecture (notification_summary, v64) au lieu des 7 à 13 requêtes que
//     l'app refaisait toutes les 2 minutes ;
//   • la cloche : sa liste, son lu / non lu et ce qui en a été effacé
//     appartiennent au COMPTE, en base. Lue ou effacée sur le téléphone =
//     lue ou effacée sur l'ordinateur.
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
  dismissNotification: () => {},
  clearAllNotifications: () => {},
  openNotification: () => null,
  msgToast: false,
  clearMsgToast: () => {},
  markSeen: () => {},
  markGroupSeen: () => {},
  refreshNotifications: () => {},
});

// Une seule stratégie : un compteur relu toutes les 2 min tant que l'app est
// affichée, rien du tout quand l'onglet est caché, et une relecture au retour
// si la dernière date de plus de 30 s. Avant : une boucle de 2 min + une de
// 5 min onglet caché, et des boucles « orphelines » qui s'empilaient à chaque
// renouvellement de connexion (audit du 2026-09-26 : 44 relectures/h la nuit).
const POLL_VISIBLE_MS = 120000; // 2 min — onglet visible
const POLL_WAKE_AFTER_MS = 30000;
const POLL_DEBOUNCE_MS = 1200;
// Le temps qu'une ligne effacée glisse hors de la liste (NotificationCenter.module.css).
const LEAVE_MS = 200;
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
  const lastPollAtRef = useRef(0);
  const pollTimeoutRef = useRef(null);
  const audibleBaselineRef = useRef(null);
  const inboxRef = useRef(inbox);
  // Ce que le membre a effacé pendant la session : une relecture partie avant
  // la confirmation de la base ne doit pas le faire réapparaître.
  const hiddenRef = useRef(emptyHidden());
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
  // Seulement tant que l'app est affichée : un onglet caché ferme son canal
  // (et, sans autre canal, sa connexion temps réel — la limite gratuite est de
  // 200 connexions simultanées). Au retour, la relecture du compteur rattrape
  // ce qui est arrivé entre-temps ; le push, lui, prévient hors de l'app.
  useEffect(() => {
    if (!user) return;
    let ch = null;
    const open = () => {
      if (ch || document.hidden) return;
      ch = supabase
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
    };
    const close = () => {
      if (!ch) return;
      supabase.removeChannel(ch);
      ch = null;
    };
    const onVisibility = () => (document.hidden ? close() : open());
    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [user]);

  const loadInbox = useCallback(async () => {
    if (!user) return;
    setInbox((state) => (state.items.length ? state : { ...state, status: "loading" }));
    try {
      const page = await fetchInbox(rpc);
      setInbox({
        ...EMPTY_INBOX, status: "ready", items: withoutHidden(page.items, hiddenRef.current), unread: page.unread, hasMore: page.hasMore,
      });
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
        items: mergeItems(state.items, withoutHidden(page.items, hiddenRef.current)),
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
    lastPollAtRef.current = Date.now();
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
          setInbox((state) => ({
            ...state, items: mergeItems(state.items, withoutHidden(page.items, hiddenRef.current)), unread: page.unread,
          }));
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
      // sur CET appareil sont effacées pour le compte.
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
    hiddenRef.current = emptyHidden();
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

  // Effacer une notification de la cloche (rien n'est supprimé à sa source).
  // La ligne glisse hors de la liste puis disparaît ; la pastille baisse tout
  // de suite. Un échec la fait revenir telle qu'elle était.
  const dismissNotification = useCallback((key) => {
    const item = inboxRef.current.items.find((entry) => entry.key === key);
    if (!item || item.leaving) return;
    rememberHidden(hiddenRef.current, item);
    setInbox((state) => withItemLeaving(state, key));
    if (!item.read) setBellUnread((count) => Math.max(0, count - 1));
    setTimeout(() => setInbox((state) => withoutItem(state, key)), LEAVE_MS);
    sendDismiss(rpc, key).catch((error) => {
      console.warn("Dismiss failed:", error?.message || error);
      if (hiddenRef.current.keys.get(key) === item.atMs) hiddenRef.current.keys.delete(key);
      loadInbox();
      schedulePoll(500);
    });
  }, [loadInbox, schedulePoll]);

  // « Tout effacer ». En attendant la date butoir de la base, tout ce qui
  // était affiché reste caché ; la butoir de la base la remplace ensuite.
  const clearAllNotifications = useCallback(async () => {
    const hidden = hiddenRef.current;
    const previous = hidden.clearedAtMs;
    const newest = inboxRef.current.items.reduce((max, item) => Math.max(max, item.atMs), -Infinity);
    if (Number.isFinite(newest)) hidden.clearedAtMs = Math.max(previous ?? -Infinity, newest);
    setInbox((state) => withoutAll(state));
    setBellUnread(0);
    try {
      const cutoff = await sendDismissAll(rpc);
      if (cutoff !== null) {
        hidden.clearedAtMs = Math.max(hidden.clearedAtMs ?? -Infinity, cutoff);
        setInbox((state) => ({ ...state, items: withoutHidden(state.items, hidden) }));
      }
    } catch (error) {
      console.warn("Clear all failed:", error?.message || error);
      hidden.clearedAtMs = previous;
      loadInbox();
      schedulePoll(500);
    }
  }, [loadInbox, schedulePoll]);

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
    let loopId = null;
    let stopped = false;

    function clearLoop() {
      if (loopId) clearTimeout(loopId);
      loopId = null;
    }

    // Une seule boucle à la fois, jamais onglet caché. `stopped` empêche une
    // relecture encore en cours au démontage de relancer une boucle orpheline.
    function scheduleLoop() {
      clearLoop();
      if (stopped || document.hidden) return;
      loopId = setTimeout(async () => {
        loopId = null;
        await poll();
        scheduleLoop();
      }, POLL_VISIBLE_MS);
    }

    function wake() {
      if (document.hidden) { clearLoop(); return; }
      if (Date.now() - lastPollAtRef.current >= POLL_WAKE_AFTER_MS) schedulePoll(100);
      scheduleLoop();
    }

    poll();
    scheduleLoop();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);

    return () => {
      stopped = true;
      clearLoop();
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
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
        dismissNotification,
        clearAllNotifications,
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
// (bt_dismissed_announcements_<id>). Elles sont effacées pour le compte (v85 ;
// avant, elles devenaient seulement lues et restaient dans la cloche), puis la
// clé locale disparaît — avec les deux repères que plus rien ne lit.
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
    for (const key of keys) await sendDismiss(rpc, key);
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export const useNotifications = () => useContext(NotificationContext);
