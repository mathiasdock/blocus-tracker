import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { ALL_UNIVERSITIES } from "../lib/universities";
import { notifyXPChanged } from "../lib/xpEvents";
import { isSafeInternalHref } from "../lib/security";

const NotificationContext = createContext({
  feedCount: 0,
  commentCount: 0,
  reactionCount: 0,
  friendCount: 0,
  communityCount: {},
  totalCommunity: 0,
  messageCount: 0,
  groupCount: {},
  totalGroups: 0,
  notificationItems: [],
  notificationUnreadCount: 0,
  msgToast: false,
  clearMsgToast: () => {},
  markSeen: () => {},
  markGroupSeen: () => {},
  refreshNotifications: () => {},
  acceptFriendRequest: () => {},
  refuseFriendRequest: () => {},
  openFeedNotification: () => {},
  dismissAnnouncement: () => {},
});

const COMMUNITY_IDS = ALL_UNIVERSITIES.map(u => u.id);
const POLL_VISIBLE_MS = 120000; // 2 min (était 45s) — réduit l'egress API
const POLL_HIDDEN_MS = 300000;  // 5 min (était 2 min) — onglet en arrière-plan
const POLL_DEBOUNCE_MS = 1200;
const COMMUNITY_PAGE_SIZE = 1000;
const PRODUCT_ANNOUNCEMENTS = [
  {
    id: "referral-links-v1",
    titleKey: "notif.newFeature",
    bodyKey: "notif.productReferral",
    href: "/profile",
  },
];

function getLastSeen(key) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`bt_last_seen_${key}`) || null;
}

function setLastSeen(key) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`bt_last_seen_${key}`, new Date().toISOString());
}

function getDismissedAnnouncements(userId) {
  if (typeof window === "undefined" || !userId) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(`bt_dismissed_announcements_${userId}`) || "[]"));
  } catch {
    return new Set();
  }
}

function setDismissedAnnouncements(userId, ids) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(`bt_dismissed_announcements_${userId}`, JSON.stringify([...ids]));
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const [feedCount, setFeedCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [reactionCount, setReactionCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [communityCount, setCommunityCount] = useState({});
  const [messageCount, setMessageCount] = useState(0);
  const [groupCount, setGroupCount] = useState({});
  const [notificationItems, setNotificationItems] = useState([]);
  const [msgToast, setMsgToast] = useState(false);
  const pollingRef = useRef(false);
  const pollTimeoutRef = useRef(null);

  const clearMsgToast = useCallback(() => setMsgToast(false), []);

  const markSeen = useCallback((key) => {
    setLastSeen(key);
    if (key === "feed") {
      setFeedCount(0);
      setCommentCount(0);
      setReactionCount(0);
      setLastSeen("comments"); // reset comment timestamp too
      setLastSeen("feed_interactions");
      setNotificationItems((items) => items.filter((item) => item.type !== "comment" && item.type !== "reaction"));
    } else if (key === "friends") {
      setFriendCount(0);
    } else if (key === "messages") {
      setMessageCount(0); setMsgToast(false);
    } else {
      setCommunityCount((prev) => ({ ...prev, [key]: 0 }));
    }
  }, []);

  // Realtime: instant toast when a new private message arrives,
  // on any page (unless the user is already in the messages tab).
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
          if (router.pathname !== "/messages") setMsgToast(true);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, router.pathname]);

  const poll = useCallback(async () => {
    if (!user || pollingRef.current) return;
    pollingRef.current = true;

    try {
      // Feed
      const lastFeed = getLastSeen("feed");
      const feedPromise = lastFeed
        ? supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .gt("created_at", lastFeed)
          .neq("user_id", user.id)
        : Promise.resolve(null);
      if (!lastFeed) setLastSeen("feed");

      // Friend requests
      const friendPromise = supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee", user.id)
        .eq("status", "pending");

      // Communities: one grouped read instead of one count per community.
      const seenCommunities = [];
      for (const id of COMMUNITY_IDS) {
        const last = getLastSeen(id);
        if (last) seenCommunities.push([id, last]);
        else setLastSeen(id);
      }
      const communityPromise = (async () => {
        if (!seenCommunities.length) return { data: [] };
        const communityIds = seenCommunities.map(([id]) => id);
        const earliestLastSeen = seenCommunities.reduce(
          (min, [, last]) => last < min ? last : min,
          seenCommunities[0][1]
        );
        if (!earliestLastSeen) return { data: [] };

        const rows = [];
        for (let from = 0; ; from += COMMUNITY_PAGE_SIZE) {
          const { data, error } = await supabase
            .from("community_messages")
            .select("community, created_at")
            .in("community", communityIds)
            .gt("created_at", earliestLastSeen)
            .neq("user_id", user.id)
            .order("created_at", { ascending: false })
            .range(from, from + COMMUNITY_PAGE_SIZE - 1);
          if (error) return { data: rows, error };
          rows.push(...(data || []));
          if (!data || data.length < COMMUNITY_PAGE_SIZE) break;
        }
        return { data: rows };
      })();

      // Group messages: same grouped-read pattern as communities, but the
      // group list is per-user (not a static array) so it must be fetched
      // first. Last-seen keys are namespaced "group_<uuid>" — no collision
      // risk with community slugs (short strings from ALL_UNIVERSITIES).
      const groupPromise = (async () => {
        const { data: memberships } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", user.id);
        const groupIds = [...new Set((memberships || []).map(m => m.group_id))];
        if (!groupIds.length) return { data: [], groupIds };

        const seenGroups = [];
        for (const id of groupIds) {
          const last = getLastSeen(`group_${id}`);
          if (last) seenGroups.push([id, last]);
          else setLastSeen(`group_${id}`);
        }
        if (!seenGroups.length) return { data: [], groupIds };

        const seenGroupIds = seenGroups.map(([id]) => id);
        const earliestLastSeen = seenGroups.reduce(
          (min, [, last]) => last < min ? last : min,
          seenGroups[0][1]
        );

        const rows = [];
        for (let from = 0; ; from += COMMUNITY_PAGE_SIZE) {
          const { data, error } = await supabase
            .from("group_messages")
            .select("group_id, created_at")
            .in("group_id", seenGroupIds)
            .gt("created_at", earliestLastSeen)
            .neq("user_id", user.id)
            .order("created_at", { ascending: false })
            .range(from, from + COMMUNITY_PAGE_SIZE - 1);
          if (error) return { data: rows, groupIds, seenGroups };
          rows.push(...(data || []));
          if (!data || data.length < COMMUNITY_PAGE_SIZE) break;
        }
        return { data: rows, groupIds, seenGroups };
      })();

      // Unread private messages
      const messagePromise = supabase
        .from("private_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("read", false);

      const notificationPromise = (async () => {
        const [{ data: friendRows }, { data: myPosts }, { data: annRows }] = await Promise.all([
          supabase
            .from("friendships")
            .select("id, requester, created_at")
            .eq("addressee", user.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("posts")
            .select("id")
            .eq("user_id", user.id)
            .limit(100),
          // Admin announcements (active only). Safe before the migration runs:
          // a missing table returns { data: null } and is treated as "none".
          supabase
            .from("app_announcements")
            .select("id, title, message, type, href, created_at")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        let comments = [];
        let reactions = [];
        let commentsCount = 0;
        let reactionsCount = 0;
        const lastInteractions = getLastSeen("feed_interactions");
        if (!lastInteractions) {
          setLastSeen("feed_interactions");
          setLastSeen("comments");
        } else if (myPosts?.length) {
          const postIds = myPosts.map(p => p.id);
          const [commentsRes, reactionsRes] = await Promise.all([
            supabase
              .from("comments")
              .select("id, post_id, user_id, content, created_at", { count: "exact" })
              .in("post_id", postIds)
              .neq("user_id", user.id)
              .gt("created_at", lastInteractions)
              .order("created_at", { ascending: false })
              .limit(10),
            supabase
              .from("likes")
              .select("id, post_id, user_id, emoji, created_at", { count: "exact" })
              .in("post_id", postIds)
              .neq("user_id", user.id)
              .gt("created_at", lastInteractions)
              .order("created_at", { ascending: false })
              .limit(10),
          ]);
          comments = commentsRes.data || [];
          reactions = reactionsRes.data || [];
          commentsCount = commentsRes.count || 0;
          reactionsCount = reactionsRes.count || 0;
        }

        const actorIds = new Set();
        (friendRows || []).forEach((row) => actorIds.add(row.requester));
        comments.forEach((row) => actorIds.add(row.user_id));
        reactions.forEach((row) => actorIds.add(row.user_id));

        let profileMap = {};
        if (actorIds.size) {
          const { data: actors } = await supabase
            .from("profiles")
            .select("id, pseudo, first_name, last_name, avatar_url")
            .in("id", [...actorIds]);
          profileMap = Object.fromEntries((actors || []).map((p) => [p.id, p]));
        }

        const dismissed = getDismissedAnnouncements(user.id);
        // Hardcoded product announcements (i18n keys) + DB-backed admin
        // announcements (literal title/message). Both honour the same
        // per-user localStorage dismissal.
        const announcements = [
          ...PRODUCT_ANNOUNCEMENTS
            .filter((item) => !dismissed.has(item.id))
            .map((item) => ({ ...item, type: "announcement", key: `announcement:${item.id}`, annType: "new", created_at: null })),
          ...(annRows || [])
            .filter((row) => !dismissed.has(row.id))
            .map((row) => ({
              type: "announcement",
              key: `announcement:${row.id}`,
              id: row.id,
              title: row.title,
              body: row.message,
              annType: row.type || "info",
              href: row.href || null,
              created_at: row.created_at,
            })),
        ];

        const items = [
          ...announcements,
          ...(friendRows || []).map((row) => ({
            type: "friend_request",
            key: `friend_request:${row.id}`,
            id: row.id,
            actorId: row.requester,
            actor: profileMap[row.requester] || null,
            created_at: row.created_at,
          })),
          ...comments.map((row) => ({
            type: "comment",
            key: `comment:${row.id}`,
            id: row.id,
            postId: row.post_id,
            actorId: row.user_id,
            actor: profileMap[row.user_id] || null,
            content: row.content,
            created_at: row.created_at,
          })),
          ...reactions.map((row) => ({
            type: "reaction",
            key: `reaction:${row.id}`,
            id: row.id,
            postId: row.post_id,
            actorId: row.user_id,
            actor: profileMap[row.user_id] || null,
            emoji: row.emoji,
            created_at: row.created_at,
          })),
        ].sort((a, b) => {
          if (!a.created_at) return -1;
          if (!b.created_at) return 1;
          return new Date(b.created_at) - new Date(a.created_at);
        });

        return {
          items,
          commentsCount,
          reactionsCount,
          announcementCount: announcements.length,
        };
      })();

      const [feedRes, friendRes, communityRes, groupRes, messageRes, notificationRes] = await Promise.all([
        feedPromise,
        friendPromise,
        communityPromise,
        groupPromise,
        messagePromise,
        notificationPromise,
      ]);

      if (feedRes) setFeedCount(feedRes.count || 0);
      setFriendCount(friendRes.count || 0);

      const communityLastSeen = Object.fromEntries(seenCommunities);
      const nextCommunityCount = {};
      for (const id of COMMUNITY_IDS) nextCommunityCount[id] = 0;
      (communityRes.data || []).forEach((row) => {
        if (row.created_at > communityLastSeen[row.community]) {
          nextCommunityCount[row.community] = (nextCommunityCount[row.community] || 0) + 1;
        }
      });
      setCommunityCount(nextCommunityCount);

      const groupLastSeen = Object.fromEntries(groupRes.seenGroups || []);
      const nextGroupCount = {};
      for (const id of groupRes.groupIds || []) nextGroupCount[id] = 0;
      (groupRes.data || []).forEach((row) => {
        if (row.created_at > groupLastSeen[row.group_id]) {
          nextGroupCount[row.group_id] = (nextGroupCount[row.group_id] || 0) + 1;
        }
      });
      setGroupCount(nextGroupCount);

      setMessageCount(messageRes.count || 0);
      setCommentCount(notificationRes.commentsCount || 0);
      setReactionCount(notificationRes.reactionsCount || 0);
      setNotificationItems(notificationRes.items || []);
    } finally {
      pollingRef.current = false;
    }
  }, [user]);

  const schedulePoll = useCallback((delay = POLL_DEBOUNCE_MS) => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = setTimeout(() => {
      pollTimeoutRef.current = null;
      poll();
    }, delay);
  }, [poll]);

  const refreshNotifications = useCallback(() => {
    schedulePoll(100);
  }, [schedulePoll]);

  const acceptFriendRequest = useCallback(async (requestId) => {
    if (!requestId || !user) return;
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", requestId)
      .eq("addressee", user.id)
      .eq("status", "pending");
    if (error) throw error;
    notifyXPChanged();
    setFriendCount((count) => Math.max(0, count - 1));
    setNotificationItems((items) => items.filter((item) => item.key !== `friend_request:${requestId}`));
    schedulePoll(100);
  }, [schedulePoll, user]);

  const refuseFriendRequest = useCallback(async (requestId) => {
    if (!requestId || !user) return;
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId)
      .eq("addressee", user.id)
      .eq("status", "pending");
    if (error) throw error;
    setFriendCount((count) => Math.max(0, count - 1));
    setNotificationItems((items) => items.filter((item) => item.key !== `friend_request:${requestId}`));
    schedulePoll(100);
  }, [schedulePoll, user]);

  const markGroupSeen = useCallback((groupId) => {
    if (!groupId) return;
    setLastSeen(`group_${groupId}`);
    setGroupCount((prev) => ({ ...prev, [groupId]: 0 }));
  }, []);

  const openFeedNotification = useCallback(() => {
    setLastSeen("feed_interactions");
    setLastSeen("comments");
    setCommentCount(0);
    setReactionCount(0);
    setNotificationItems((items) => items.filter((item) => item.type !== "comment" && item.type !== "reaction"));
    router.push("/feed");
  }, [router]);

  const dismissAnnouncement = useCallback((announcementId, href) => {
    if (!user || !announcementId) return;
    const dismissed = getDismissedAnnouncements(user.id);
    dismissed.add(announcementId);
    setDismissedAnnouncements(user.id, dismissed);
    setNotificationItems((items) => items.filter((item) => item.key !== `announcement:${announcementId}`));
    if (href && isSafeInternalHref(href)) router.push(href);
  }, [router, user]);

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
  const announcementCount = notificationItems.filter((item) => item.type === "announcement").length;
  const notificationUnreadCount = friendCount + commentCount + reactionCount + announcementCount;

  return (
    <NotificationContext.Provider
      value={{
        feedCount,
        commentCount,
        reactionCount,
        friendCount,
        communityCount,
        totalCommunity,
        messageCount,
        groupCount,
        totalGroups,
        notificationItems,
        notificationUnreadCount,
        msgToast,
        clearMsgToast,
        markSeen,
        markGroupSeen,
        refreshNotifications,
        acceptFriendRequest,
        refuseFriendRequest,
        openFeedNotification,
        dismissAnnouncement,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
