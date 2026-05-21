import { createContext, useContext, useEffect, useState, useCallback } from "react";
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
    if (!user) return;

    // Feed
    const lastFeed = getLastSeen("feed");
    if (lastFeed) {
      const { count } = await supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .gt("created_at", lastFeed)
        .neq("user_id", user.id);
      setFeedCount(count || 0);
    } else {
      setLastSeen("feed");
    }

    // Friend requests
    const { count: fc } = await supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("addressee", user.id)
      .eq("status", "pending");
    setFriendCount(fc || 0);

    // Communities
    const results = await Promise.all(
      COMMUNITY_IDS.map(async (id) => {
        const last = getLastSeen(id);
        if (!last) {
          setLastSeen(id);
          return [id, 0];
        }
        const { count } = await supabase
          .from("community_messages")
          .select("id", { count: "exact", head: true })
          .eq("community", id)
          .gt("created_at", last)
          .neq("user_id", user.id);
        return [id, count || 0];
      })
    );
    setCommunityCount(Object.fromEntries(results));

    // Unread private messages
    const { count: mc } = await supabase
      .from("private_messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("read", false);
    setMessageCount(mc || 0);

    // New comments on my posts (from others)
    const lastComments = getLastSeen("comments");
    if (lastComments) {
      const { data: myPosts } = await supabase
        .from("posts")
        .select("id")
        .eq("user_id", user.id)
        .limit(100);
      if (myPosts?.length) {
        const { count: cc } = await supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("post_id", myPosts.map(p => p.id))
          .neq("user_id", user.id)
          .gt("created_at", lastComments);
        setCommentCount(cc || 0);
      }
    } else {
      setLastSeen("comments");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [poll, user]);

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
