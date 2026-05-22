import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { ALL_UNIVERSITIES } from "../lib/universities";

const NotificationContext = createContext({
  feedCount: 0,
  commentCount: 0,
  friendCount: 0,
  communityCount: {},
  totalCommunity: 0,
  messageCount: 0,
  msgToast: false,
  clearMsgToast: () => {},
  markSeen: () => {},
});

const COMMUNITY_IDS = ALL_UNIVERSITIES.map(u => u.id);
const POLL_VISIBLE_MS = 45000;
const POLL_HIDDEN_MS = 120000;
const POLL_DEBOUNCE_MS = 1200;
const COMMUNITY_PAGE_SIZE = 1000;

function getLastSeen(key) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`bt_last_seen_${key}`) || null;
}

function setLastSeen(key) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`bt_last_seen_${key}`, new Date().toISOString());
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const [feedCount, setFeedCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [communityCount, setCommunityCount] = useState({});
  const [messageCount, setMessageCount] = useState(0);
  const [msgToast, setMsgToast] = useState(false);
  const pollingRef = useRef(false);
  const pollTimeoutRef = useRef(null);

  const clearMsgToast = useCallback(() => setMsgToast(false), []);

  const markSeen = useCallback((key) => {
    setLastSeen(key);
    if (key === "feed") {
      setFeedCount(0);
      setCommentCount(0);
      setLastSeen("comments"); // reset comment timestamp too
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

      // Unread private messages
      const messagePromise = supabase
        .from("private_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("read", false);

      // New comments on my posts (from others)
      const lastComments = getLastSeen("comments");
      const commentsPromise = (async () => {
        if (!lastComments) {
          setLastSeen("comments");
          return 0;
        }
        const { data: myPosts } = await supabase
          .from("posts")
          .select("id")
          .eq("user_id", user.id)
          .limit(100);
        if (!myPosts?.length) return 0;
        const { count } = await supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("post_id", myPosts.map(p => p.id))
          .neq("user_id", user.id)
          .gt("created_at", lastComments);
        return count || 0;
      })();

      const [feedRes, friendRes, communityRes, messageRes, commentsCount] = await Promise.all([
        feedPromise,
        friendPromise,
        communityPromise,
        messagePromise,
        commentsPromise,
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

      setMessageCount(messageRes.count || 0);
      setCommentCount(commentsCount);
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

  return (
    <NotificationContext.Provider
      value={{ feedCount, commentCount, friendCount, communityCount, totalCommunity, messageCount, msgToast, clearMsgToast, markSeen }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
