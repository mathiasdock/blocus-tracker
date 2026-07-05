import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, timeAgo, formatDuration } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";

function IconPaperclip({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.93a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
    </svg>
  );
}

// ── Calcule le temps écoulé d'un chrono de groupe ─────────────
function computeChronoElapsed(session) {
  if (!session?.started_at) return 0;
  if (session.status === "paused" && session.last_pause_at) {
    return Math.max(
      0,
      Math.floor(
        (new Date(session.last_pause_at).getTime() - new Date(session.started_at).getTime()) / 1000
      ) - session.total_paused_seconds
    );
  }
  if (session.status === "active") {
    return Math.max(
      0,
      Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000) -
        session.total_paused_seconds
    );
  }
  return 0;
}

export default function Messages() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { markSeen, groupCount, markGroupSeen } = useNotifications();
  const { t, lang }       = useI18n();
  const isAdmin = profile?.is_admin === true;

  // ── DM state ──────────────────────────────────────────────────
  const [friends, setFriends]       = useState([]);
  const [dmActiveId, setDmActiveId] = useState(null);
  const [messages, setMessages]     = useState([]);
  const [text, setText]             = useState("");
  const [file, setFile]             = useState(null);
  const [sending, setSending]       = useState(false);
  const dmFileRef   = useRef(null);
  const dmBottomRef = useRef(null);

  // ── Group chat state ───────────────────────────────────────────
  const [groups, setGroups]               = useState([]);
  const [grpActiveId, setGrpActiveId]     = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMembers, setGroupMembers]   = useState([]);
  const [msgProfiles, setMsgProfiles]     = useState({});
  const [grpText, setGrpText]             = useState("");
  const [grpFile, setGrpFile]             = useState(null);
  const [grpSending, setGrpSending]       = useState(false);
  const [showInvite, setShowInvite]       = useState(false);
  const [inviteQuery, setInviteQuery]     = useState("");
  const [inviteResults, setInviteResults] = useState([]);
  const [inviting, setInviting]           = useState(null);
  const grpFileRef   = useRef(null);
  const grpBottomRef = useRef(null);

  // ── Group info modal ───────────────────────────────────────────
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // ── Group photo ────────────────────────────────────────────────
  const grpPhotoRef = useRef(null);

  // ── Group chrono ───────────────────────────────────────────────
  const [groupChrono, setGroupChrono]               = useState(null);
  const [chronoParticipants, setChronoParticipants] = useState([]);
  const [myChronoStatus, setMyChronoStatus]         = useState(null);
  const [showChronoStart, setShowChronoStart]       = useState(false);
  const [chronoStartNote, setChronoStartNote]       = useState("");
  const [chronoLoading, setChronoLoading]           = useState(false);
  const [chronoElapsed, setChronoElapsed]           = useState(0);

  // ── Create group state ─────────────────────────────────────────
  const [showCreate, setShowCreate]               = useState(false);
  const [createForm, setCreateForm]               = useState({ name: "", description: "" });
  const [creating, setCreating]                   = useState(false);
  const [createStep, setCreateStep]               = useState(1);
  const [createdGroupId, setCreatedGroupId]       = useState(null);
  const [createInviteQuery, setCreateInviteQuery] = useState("");
  const [createInviteResults, setCreateInviteResults] = useState([]);

  // ── Relations / friends state ──────────────────────────────────
  const [friendLinks, setFriendLinks] = useState([]);
  const [peopleMap, setPeopleMap] = useState({});
  const [relationQuery, setRelationQuery] = useState("");
  const [relationResults, setRelationResults] = useState([]);
  const [relationMsg, setRelationMsg] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showOutgoing, setShowOutgoing] = useState(false);

  // ── Navigation ─────────────────────────────────────────────────
  const [activeType, setActiveType] = useState("dm");
  const [mobileView, setMobileView] = useState("list");
  const [viewUserId, setViewUserId] = useState(null);

  function openProfile(userId) {
    if (userId === user?.id) return;
    setViewUserId(userId);
  }

  // ── DM loading ─────────────────────────────────────────────────
  const loadFriends = useCallback(async () => {
    if (!user) return;
    const { data: links } = await supabase
      .from("friendships").select("*")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
      .eq("status", "accepted");
    if (!links?.length) { setFriends([]); return; }

    const friendIds = links.map(l => l.requester === user.id ? l.addressee : l.requester);
    const [{ data: profs }, { data: unreadRows }, { data: lastMsgs }] = await Promise.all([
      supabase.from("profiles").select("id,pseudo,first_name,last_name,avatar_url").in("id", friendIds),
      supabase.from("private_messages").select("sender_id").eq("receiver_id", user.id).eq("read", false),
      supabase.from("private_messages").select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(300),
    ]);

    const unreadBy = {};
    (unreadRows || []).forEach(m => { unreadBy[m.sender_id] = (unreadBy[m.sender_id] || 0) + 1; });
    const lastBy = {};
    (lastMsgs || []).forEach(m => {
      const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!lastBy[other]) lastBy[other] = m;
    });
    const profMap = {};
    (profs || []).forEach(p => { profMap[p.id] = p; });

    setFriends(
      friendIds.filter(id => profMap[id])
        .map(id => ({ profile: profMap[id], unread: unreadBy[id] || 0, lastMsg: lastBy[id] || null }))
        .sort((a, b) => {
          if (a.unread !== b.unread) return b.unread - a.unread;
          return (b.lastMsg?.created_at || "").localeCompare(a.lastMsg?.created_at || "");
        })
    );
  }, [user]);

  const loadFriendLinks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
    setFriendLinks(data || []);
  }, [user]);

  useEffect(() => {
    loadFriendLinks();
  }, [loadFriendLinks]);

  useEffect(() => {
    const ids = new Set();
    friendLinks.forEach((l) => { ids.add(l.requester); ids.add(l.addressee); });
    ids.delete(user?.id);
    if (ids.size === 0) {
      setPeopleMap({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, pseudo, first_name, last_name, avatar_url, university")
        .in("id", [...ids]);
      const map = {};
      (data || []).forEach((p) => { map[p.id] = p; });
      setPeopleMap(map);
    })();
  }, [friendLinks, user?.id]);

  function relationOf(id) {
    const link = friendLinks.find(
      (l) => (l.requester === id && l.addressee === user?.id) ||
             (l.addressee === id && l.requester === user?.id)
    );
    return link ? link.status : null;
  }

  async function searchRelations(e) {
    e.preventDefault();
    setRelationMsg("");
    const q = relationQuery.trim();
    if (!q || !user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url, university")
      .or(`pseudo.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .neq("id", user.id)
      .limit(10);
    setRelationResults(data || []);
  }

  async function addFriend(id) {
    if (!user) return;
    const { error } = await supabase
      .from("friendships")
      .insert({ requester: user.id, addressee: id, status: "pending" });
    if (error) {
      setRelationMsg(t("friends.requestError"));
    } else {
      setRelationMsg(t("friends.requestSent"));
      notifyXPChanged();
    }
    setSuggestions((prev) => prev.filter((p) => p.id !== id));
    await loadFriendLinks();
  }

  async function acceptFriend(linkId) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", linkId);
    if (!error) notifyXPChanged();
    await loadFriendLinks();
    await loadFriends();
  }

  async function removeFriendLink(linkId) {
    await supabase.from("friendships").delete().eq("id", linkId);
    await loadFriendLinks();
    await loadFriends();
  }

  async function loadSuggestions() {
    if (!user) return;
    setShowSuggestions(true);
    setLoadingSuggestions(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url, university")
      .neq("id", user.id)
      .limit(200);
    const connected = new Set();
    friendLinks.forEach((l) => { connected.add(l.requester); connected.add(l.addressee); });
    const myUni = (profile?.university || "").trim().toLowerCase();
    const list = (data || [])
      .filter((p) => !connected.has(p.id))
      .sort((a, b) => {
        const sameA = myUni && (a.university || "").trim().toLowerCase() === myUni ? 0 : 1;
        const sameB = myUni && (b.university || "").trim().toLowerCase() === myUni ? 0 : 1;
        return sameA - sameB;
      })
      .slice(0, 40);
    setSuggestions(list);
    setLoadingSuggestions(false);
  }

  const loadMessages = useCallback(async () => {
    if (!dmActiveId || !user) return;
    const { data } = await supabase.from("private_messages").select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${dmActiveId}),and(sender_id.eq.${dmActiveId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true }).limit(200);
    setMessages(data || []);
    await supabase.from("private_messages")
      .update({ read: true })
      .eq("sender_id", dmActiveId).eq("receiver_id", user.id).eq("read", false);
    markSeen("messages");
    loadFriends();
  }, [dmActiveId, user, markSeen, loadFriends]);

  // ── Group loading ──────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!user) return;
    const { data: myMem } = await supabase
      .from("group_members").select("group_id, role").eq("user_id", user.id);
    if (!myMem?.length) { setGroups([]); return; }
    const ids = myMem.map(m => m.group_id);
    const { data: grps } = await supabase
      .from("study_groups").select("*").in("id", ids).order("created_at", { ascending: false });
    const roleMap = Object.fromEntries(myMem.map(m => [m.group_id, m.role]));
    setGroups((grps || []).map(g => ({ ...g, myRole: roleMap[g.id] || "member" })));
  }, [user]);

  const loadGroupMessages = useCallback(async () => {
    if (!grpActiveId) return;
    const { data } = await supabase.from("group_messages").select("*")
      .eq("group_id", grpActiveId).order("created_at", { ascending: true }).limit(200);
    setGroupMessages(data || []);
    const ids = [...new Set((data || []).map(m => m.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles")
        .select("id, pseudo, first_name, last_name, avatar_url").in("id", ids);
      const map = {};
      (profs || []).forEach(p => (map[p.id] = p));
      setMsgProfiles(map);
    }
  }, [grpActiveId]);

  const loadGroupMembers = useCallback(async () => {
    if (!grpActiveId) return;
    const { data } = await supabase.from("group_members")
      .select("user_id, role, joined_at").eq("group_id", grpActiveId);
    const ids = (data || []).map(m => m.user_id);
    if (!ids.length) { setGroupMembers([]); return; }
    const { data: profs } = await supabase.from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url").in("id", ids);
    const profMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    setGroupMembers((data || []).map(m => ({ ...m, profile: profMap[m.user_id] })));
  }, [grpActiveId]);

  // ── Group chrono loading ───────────────────────────────────────
  const loadGroupChrono = useCallback(async () => {
    if (!grpActiveId || !user) return;
    const { data } = await supabase
      .from("group_chrono_sessions")
      .select("*")
      .eq("group_id", grpActiveId)
      .in("status", ["pending", "active", "paused"])
      .order("created_at", { ascending: false })
      .limit(1);

    const session = data?.[0] || null;
    setGroupChrono(session);

    if (session) {
      const { data: parts } = await supabase
        .from("group_chrono_members")
        .select("*")
        .eq("session_id", session.id);
      setChronoParticipants(parts || []);
      const my = (parts || []).find(p => p.user_id === user.id);
      setMyChronoStatus(my?.status || null);
    } else {
      setChronoParticipants([]);
      setMyChronoStatus(null);
    }
  }, [grpActiveId, user]);

  // ── Effects ────────────────────────────────────────────────────
  useEffect(() => { loadFriends(); markSeen("messages"); }, [loadFriends, markSeen]);
  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => {
    if (!grpActiveId) {
      setGroupMessages([]);
      setGroupChrono(null);
      setChronoParticipants([]);
      setMyChronoStatus(null);
      setShowChronoStart(false);
      setShowGroupInfo(false);
      setShowInvite(false);
      return;
    }
    loadGroupMessages();
    loadGroupMembers();
    loadGroupChrono();
  }, [grpActiveId]); // eslint-disable-line

  // Polling messages
  useEffect(() => {
    const id = setInterval(loadGroupMessages, 5000);
    return () => clearInterval(id);
  }, [loadGroupMessages]);

  // Polling chrono (toutes les 3s quand un chrono est actif)
  useEffect(() => {
    if (!grpActiveId) return;
    const id = setInterval(loadGroupChrono, 3000);
    return () => clearInterval(id);
  }, [loadGroupChrono, grpActiveId]);

  // Compteur live du chrono
  useEffect(() => {
    const base = computeChronoElapsed(groupChrono);
    setChronoElapsed(base);
    if (!groupChrono || groupChrono.status !== "active") return;
    const start = Date.now();
    const id = setInterval(() => {
      setChronoElapsed(base + Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [groupChrono]);

  useEffect(() => { dmBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { grpBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [groupMessages]);
  useEffect(() => {
    if (router.query.tab === "relations") openRelations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.tab]);

  // Realtime DMs
  const loadMessagesRef = useRef(loadMessages);
  const loadFriendsRef  = useRef(loadFriends);
  loadMessagesRef.current = loadMessages;
  loadFriendsRef.current  = loadFriends;
  useEffect(() => {
    if (!user) return;
    const refresh = () => { loadMessagesRef.current?.(); loadFriendsRef.current?.(); };
    const channel = supabase.channel(`dm-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "private_messages", filter: `receiver_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "private_messages", filter: `sender_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);
  useEffect(() => {
    if (!dmActiveId) return;
    const id = setInterval(loadMessages, 15000);
    return () => clearInterval(id);
  }, [loadMessages, dmActiveId]);

  // ── DM actions ─────────────────────────────────────────────────
  function openDM(friendId) {
    setDmActiveId(friendId);
    setActiveType("dm");
    setMobileView("chat");
  }

  function openRelations() {
    setActiveType("relations");
    setMobileView("chat");
    markSeen("friends");
  }

  async function sendDM(e) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setSending(true);
    let attachment_url = null, attachment_type = null, attachment_name = null;
    if (file) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("dm").upload(path, file, { cacheControl: "31536000" });
      if (upErr) { setSending(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("dm").getPublicUrl(path);
      attachment_url = pub.publicUrl;
      attachment_type = file.type.startsWith("image/") ? "image" : "file";
      attachment_name = file.name;
    }
    await supabase.from("private_messages").insert({
      sender_id: user.id, receiver_id: dmActiveId,
      content: text.trim() || null,
      attachment_url, attachment_type, attachment_name,
    });
    setText(""); setFile(null);
    if (dmFileRef.current) dmFileRef.current.value = "";
    setSending(false);
    loadMessages(); loadFriends();
  }

  // ── Group actions ──────────────────────────────────────────────
  function openGroup(groupId) {
    setGrpActiveId(groupId);
    setActiveType("group");
    setMobileView("chat");
    setShowInvite(false);
    setShowGroupInfo(false);
    setShowChronoStart(false);
    markGroupSeen(groupId);
  }

  async function sendGroup(e) {
    e.preventDefault();
    if (!grpText.trim() && !grpFile) return;
    setGrpSending(true);
    let attachment_url = null, attachment_type = null, attachment_name = null;
    if (grpFile) {
      const ext = grpFile.name.split(".").pop();
      const path = `${user.id}/${grpActiveId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("community").upload(path, grpFile, { cacheControl: "31536000" });
      if (upErr) { setGrpSending(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("community").getPublicUrl(path);
      attachment_url = pub.publicUrl;
      attachment_type = grpFile.type.startsWith("image/") ? "image" : "file";
      attachment_name = grpFile.name;
    }
    await supabase.from("group_messages").insert({
      group_id: grpActiveId, user_id: user.id,
      content: grpText.trim() || null,
      attachment_url, attachment_type, attachment_name,
    });
    setGrpText(""); setGrpFile(null);
    if (grpFileRef.current) grpFileRef.current.value = "";
    setGrpSending(false);
    loadGroupMessages();
  }

  async function leaveGroup() {
    if (!grpActiveId || !window.confirm(t("msg.confirmLeave"))) return;
    await supabase.from("group_members").delete().eq("group_id", grpActiveId).eq("user_id", user.id);
    setGrpActiveId(null); setActiveType("dm"); loadGroups();
  }

  async function deleteGroup() {
    if (!grpActiveId || !window.confirm(t("msg.confirmDelete"))) return;
    await supabase.from("study_groups").delete().eq("id", grpActiveId);
    setGrpActiveId(null); setActiveType("dm"); loadGroups();
  }

  async function removeGroupMessage(id) {
    await supabase.from("group_messages").delete().eq("id", id);
    loadGroupMessages();
  }

  async function searchInvite(q) {
    setInviteQuery(q);
    if (!q.trim()) { setInviteResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url")
      .ilike("pseudo", `%${q}%`).limit(8);
    const memberIds = new Set(groupMembers.map(m => m.user_id));
    setInviteResults((data || []).filter(p => !memberIds.has(p.id) && p.id !== user.id));
  }

  async function inviteUser(userId) {
    setInviting(userId);
    await supabase.from("group_members").insert({ group_id: grpActiveId, user_id: userId, role: "member" });
    setInviting(null);
    loadGroupMembers();
    setInviteResults(prev => prev.filter(p => p.id !== userId));
  }

  async function removeMember(userId) {
    await supabase.from("group_members").delete().eq("group_id", grpActiveId).eq("user_id", userId);
    loadGroupMembers();
  }

  // ── Group photo ────────────────────────────────────────────────
  async function uploadGroupPhoto(file) {
    if (!file || !grpActiveId) return;
    const ext = file.name.split(".").pop();
    // Chemin unique par upload → un cacheControl long est sûr (la nouvelle
    // photo a une nouvelle URL, donc pas de cache figé côté navigateur/CDN).
    const path = `groups/${grpActiveId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("community").upload(path, file, { upsert: true, cacheControl: "31536000" });
    if (upErr) { alert(upErr.message); return; }
    const { data: pub } = supabase.storage.from("community").getPublicUrl(path);
    const photoUrl = pub.publicUrl;
    await supabase.from("study_groups").update({ photo_url: photoUrl }).eq("id", grpActiveId);
    setGroups(prev => prev.map(g => g.id === grpActiveId ? { ...g, photo_url: photoUrl } : g));
  }

  // ── Group chrono actions ───────────────────────────────────────
  async function startGroupChrono() {
    if (!grpActiveId || chronoLoading) return;
    setChronoLoading(true);
    const { data: session, error } = await supabase
      .from("group_chrono_sessions")
      .insert({
        group_id: grpActiveId,
        started_by: user.id,
        note: chronoStartNote.trim() || null,
        status: "active",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !session) { setChronoLoading(false); return; }

    await supabase.from("group_chrono_members").insert({
      session_id: session.id, user_id: user.id,
      status: "accepted", joined_at: new Date().toISOString(),
    });
    const others = groupMembers.filter(m => m.user_id !== user.id);
    for (const m of others) {
      await supabase.from("group_chrono_members").insert({
        session_id: session.id, user_id: m.user_id, status: "invited",
      });
    }

    setShowChronoStart(false);
    setChronoStartNote("");
    setChronoLoading(false);
    await loadGroupChrono();
  }

  async function joinGroupChrono() {
    if (!groupChrono) return;
    const my = chronoParticipants.find(p => p.user_id === user.id);
    if (my) {
      await supabase.from("group_chrono_members")
        .update({ status: "accepted", joined_at: new Date().toISOString() })
        .eq("id", my.id);
    } else {
      await supabase.from("group_chrono_members").insert({
        session_id: groupChrono.id, user_id: user.id,
        status: "accepted", joined_at: new Date().toISOString(),
      });
    }
    await loadGroupChrono();
  }

  async function declineGroupChrono() {
    if (!groupChrono) return;
    const my = chronoParticipants.find(p => p.user_id === user.id);
    if (my) {
      await supabase.from("group_chrono_members").update({ status: "declined" }).eq("id", my.id);
    } else {
      await supabase.from("group_chrono_members").insert({
        session_id: groupChrono.id, user_id: user.id, status: "declined",
      });
    }
    await loadGroupChrono();
  }

  async function pauseGroupChrono() {
    if (!groupChrono) return;
    await supabase.from("group_chrono_sessions")
      .update({ status: "paused", last_pause_at: new Date().toISOString() })
      .eq("id", groupChrono.id);
    await loadGroupChrono();
  }

  async function resumeGroupChrono() {
    if (!groupChrono?.last_pause_at) return;
    const pausedSecs = Math.floor((Date.now() - new Date(groupChrono.last_pause_at).getTime()) / 1000);
    await supabase.from("group_chrono_sessions")
      .update({
        status: "active",
        last_pause_at: null,
        total_paused_seconds: groupChrono.total_paused_seconds + pausedSecs,
      })
      .eq("id", groupChrono.id);
    await loadGroupChrono();
  }

  async function finishGroupChrono() {
    if (!groupChrono) return;
    const { error } = await supabase.rpc("finish_group_chrono", {
      p_session_id: groupChrono.id,
    });
    if (!error) {
      setGroupChrono(null);
      setChronoParticipants([]);
      setMyChronoStatus(null);
    }
  }

  async function cancelGroupChrono() {
    if (!groupChrono) return;
    await supabase.from("group_chrono_sessions")
      .update({ status: "cancelled" })
      .eq("id", groupChrono.id);
    setGroupChrono(null);
    setChronoParticipants([]);
    setMyChronoStatus(null);
  }

  // ── Create group ───────────────────────────────────────────────
  async function createGroup(e) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    const { data: grp, error } = await supabase.from("study_groups")
      .insert({ name: createForm.name.trim(), description: createForm.description.trim() || null, created_by: user.id })
      .select().single();
    if (error || !grp) { setCreating(false); return; }
    await supabase.from("group_members").insert({ group_id: grp.id, user_id: user.id, role: "admin" });
    setCreatedGroupId(grp.id);
    setCreateStep(2);
    setCreating(false);
    setGrpActiveId(grp.id);
    setActiveType("group");
    setMobileView("chat");
    await loadGroups();
  }

  async function searchCreateInvite(q) {
    setCreateInviteQuery(q);
    if (!q.trim()) { setCreateInviteResults([]); return; }
    const { data } = await supabase.from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url")
      .ilike("pseudo", `%${q}%`).limit(8);
    setCreateInviteResults((data || []).filter(p => p.id !== user.id));
  }

  async function inviteToNewGroup(userId) {
    if (!createdGroupId) return;
    await supabase.from("group_members").insert({ group_id: createdGroupId, user_id: userId, role: "member" });
    setCreateInviteResults(prev => prev.filter(p => p.id !== userId));
    loadGroupMembers();
  }

  function closeCreateModal() {
    setShowCreate(false); setCreateStep(1);
    setCreateForm({ name: "", description: "" });
    setCreatedGroupId(null); setCreateInviteQuery(""); setCreateInviteResults([]);
  }

  // ── Derived ────────────────────────────────────────────────────
  const activeFriend  = friends.find(f => f.profile.id === dmActiveId);
  const activeGroup   = groups.find(g => g.id === grpActiveId);
  const amCreator     = activeGroup?.created_by === user?.id;
  const grpWho        = id => msgProfiles[id] || { pseudo: t("common.unknownUser"), avatar_url: null };
  const chatVisible   = mobileView === "list" ? "hidden lg:flex" : "flex";
  const incoming = friendLinks.filter((l) => l.status === "pending" && l.addressee === user?.id);
  const outgoing = friendLinks.filter((l) => l.status === "pending" && l.requester === user?.id);

  // Chip de statut du chrono
  function chronoStatusChip(status) {
    if (status === "accepted")
      return {
        bg: "#EAFBF4", color: "#0E8F68",
        icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
      };
    if (status === "declined")
      return {
        bg: "#FEF2F2", color: "#ef4444",
        icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
      };
    return {
      bg: "var(--bt-subtle)", color: "var(--bt-text-3)",
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>,
    };
  }

  // Avatar de groupe (photo ou initiale)
  function GroupAvatar({ group, size = 36 }) {
    if (group?.photo_url) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.photo_url} alt={group.name}
          style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover",
            border: "1.5px solid var(--bt-border)", flexShrink: 0 }} />
      );
    }
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.38, fontWeight: 700,
        backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)",
        border: "1.5px solid var(--bt-accent-border)",
      }}>
        {(group?.name || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }

  const panelStyle = { height: "min(820px, calc(100dvh - 148px))" };

  return (
    <Layout>
      <div className="grid gap-4 lg:grid-cols-3">

        {/* ── Sidebar ────────────────────────────────────────────── */}
        <aside className={`${mobileView === "chat" ? "hidden lg:block" : ""} lg:col-span-1`}>
          <div className="flex flex-col gap-3" style={panelStyle}>

            {/* ── Carte Amis ── */}
            <button
              type="button"
              onClick={openRelations}
              className="card px-4 py-3 shrink-0 text-left transition-colors"
              style={activeType === "relations"
                ? { backgroundColor: "var(--bt-surface)", borderColor: "var(--bt-accent-border)", boxShadow: "0 0 0 1px var(--bt-accent-border) inset" }
                : {}}
              onMouseEnter={e => { if (activeType !== "relations") e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
              onMouseLeave={e => { if (activeType !== "relations") e.currentTarget.style.backgroundColor = "var(--bt-surface)"; }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 11h-6M19 8v6"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
                    {t("msg.relations")}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                    {incoming.length > 0
                      ? `${incoming.length} ${t("msg.pendingRequests")}`
                      : t("msg.relationsHint")}
                  </p>
                </div>
                {incoming.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1 leading-none">
                    {incoming.length > 99 ? "99+" : incoming.length}
                  </span>
                )}
              </div>
            </button>

            {/* ── Carte Messages privés ── */}
            <div className="card overflow-hidden flex flex-col" style={{ flex: "1.15 1 0", minHeight: 0 }}>
              <div className="px-4 py-3 shrink-0 flex items-center gap-2"
                style={{ borderBottom: "1px solid var(--bt-border)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: "var(--bt-text-3)", flexShrink: 0 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <h2 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
                  {t("msg.directMessages")}
                </h2>
              </div>

              <div className="overflow-y-auto flex-1">
                {friends.length === 0 ? (
                  <p className="text-sm p-4" style={{ color: "var(--bt-text-3)" }}>{t("msg.addFriends")}</p>
                ) : (
                  <ul>
                    {friends.map(({ profile: fp, unread, lastMsg }) => (
                      <li key={fp.id}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                        style={dmActiveId === fp.id && activeType === "dm" ? { backgroundColor: "var(--bt-accent-bg)" } : {}}
                        onClick={() => openDM(fp.id)}
                        onMouseEnter={e => { if (!(dmActiveId === fp.id && activeType === "dm")) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                        onMouseLeave={e => { if (!(dmActiveId === fp.id && activeType === "dm")) e.currentTarget.style.backgroundColor = ""; }}>
                        <button onClick={ev => { ev.stopPropagation(); openProfile(fp.id); }} className="shrink-0">
                          <Avatar url={fp.avatar_url} pseudo={displayName(fp)} size={38} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{displayName(fp)}</p>
                          <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                            {lastMsg?.content || (lastMsg ? t("msg.file") : t("msg.start"))}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {lastMsg && <span className="text-[10px]" style={{ color: "var(--bt-text-4)" }}>{timeAgo(lastMsg.created_at, lang)}</span>}
                          {unread > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1 leading-none">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Carte Groupes ── */}
            <div className="card overflow-hidden flex flex-col"
              style={{
                flex: "0.9 1 0", minHeight: 0,
                border: "1px solid var(--bt-border)",
                backgroundColor: "var(--bt-surface)",
              }}>
              {/* Header groupes */}
              <div className="px-4 py-2.5 shrink-0 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--bt-border)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/>
                      <path d="M1 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>
                      <path d="M17 11a4 4 0 0 1 4 4v2"/>
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold" style={{ color: "var(--bt-accent-dark)" }}>
                    {t("msg.groups")}
                  </h2>
                  {groups.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                      {groups.length}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                  style={{ backgroundColor: "var(--bt-accent-dark)", color: "#fff" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {t("msg.createShort")}
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                {groups.length === 0 ? (
                  <p className="text-xs px-4 py-3" style={{ color: "var(--bt-text-3)" }}>
                    {t("msg.noGroups")}
                  </p>
                ) : (
                  <ul className="py-1">
                    {groups.map(g => {
                      const isAct = grpActiveId === g.id && activeType === "group";
                      return (
                        <li key={g.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                          style={isAct ? { backgroundColor: "var(--bt-accent-bg)" } : {}}
                          onClick={() => openGroup(g.id)}
                          onMouseEnter={e => { if (!isAct) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                          onMouseLeave={e => { if (!isAct) e.currentTarget.style.backgroundColor = ""; }}>
                          <GroupAvatar group={g} size={32} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--bt-text-1)" }}>
                              {g.name}
                            </p>
                            {g.description && (
                              <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                                {g.description}
                              </p>
                            )}
                          </div>
                          {isAct ? (
                            <span className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: "var(--bt-accent-dark)" }} />
                          ) : groupCount[g.id] > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1 leading-none shrink-0">
                              {groupCount[g.id] > 99 ? "99+" : groupCount[g.id]}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ── Chat area ──────────────────────────────────────────── */}
        {activeType === "relations" ? (
          <section className={`${chatVisible} lg:col-span-2 card flex-col overflow-hidden`} style={panelStyle}>
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--bt-border)" }}>
              <button onClick={() => setMobileView("list")} className="lg:hidden btn-ghost px-2 py-1 text-sm">‹</button>
              <div>
                <h1 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>
                  {t("msg.relations")}
                </h1>
                <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                  {t("msg.relationsSubtitle")}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <section className="rounded-2xl p-4"
                style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--bt-text-1)" }}>
                  {t("friends.add")}
                </h2>
                <form onSubmit={searchRelations} className="flex gap-2">
                  <input className="input" placeholder={t("friends.searchPlaceholder")}
                    value={relationQuery} onChange={(e) => setRelationQuery(e.target.value)} />
                  <button className="btn-primary shrink-0">OK</button>
                </form>
                {relationMsg && <p className="text-xs mt-2" style={{ color: "#0E8F68" }}>{relationMsg}</p>}
                {relationResults.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {relationResults.map((r) => {
                      const rel = relationOf(r.id);
                      return (
                        <li key={r.id} className="flex items-center gap-2 text-sm">
                          <button onClick={() => openProfile(r.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <Avatar url={r.avatar_url} pseudo={displayName(r)} size={30} />
                            <span className="flex-1 min-w-0" style={{ color: "var(--bt-text-1)" }}>
                              <span className="block truncate">{displayName(r)}</span>
                              <span className="block truncate text-xs" style={{ color: "var(--bt-text-3)" }}>@{r.pseudo}</span>
                            </span>
                          </button>
                          {rel === "accepted" ? (
                            <button onClick={() => openDM(r.id)} className="btn-ghost text-xs px-2.5 py-1">
                              {t("msg.openChat")}
                            </button>
                          ) : rel === "pending" ? (
                            <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("friends.pendingStatus")}</span>
                          ) : (
                            <button onClick={() => addFriend(r.id)} className="btn-primary text-xs px-2.5 py-1">
                              {t("friends.addBtn")}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {incoming.length > 0 && (
                <section className="rounded-2xl p-4"
                  style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--bt-text-1)" }}>
                    {t("friends.incoming")}
                  </h2>
                  <ul className="space-y-2">
                    {incoming.map((l) => {
                      const p = peopleMap[l.requester];
                      return (
                        <li key={l.id} className="flex items-center gap-2 text-sm">
                          <button onClick={() => openProfile(l.requester)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <Avatar url={p?.avatar_url} pseudo={displayName(p)} size={30} />
                            <span className="font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{displayName(p)}</span>
                          </button>
                          <button onClick={() => acceptFriend(l.id)} className="btn-primary text-xs px-2.5 py-1">{t("friends.accept")}</button>
                          <button onClick={() => removeFriendLink(l.id)} className="btn-ghost text-xs px-2.5 py-1">{t("friends.refuse")}</button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {outgoing.length > 0 && (
                <section className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                  <button
                    onClick={() => setShowOutgoing(v => !v)}
                    className="w-full flex items-center justify-between text-sm"
                    style={{ color: "var(--bt-text-2)" }}>
                    <span>{outgoing.length} {outgoing.length > 1 ? t("friends.outgoingPlural") : t("friends.outgoingSingular")}</span>
                    <span style={{ color: "var(--bt-text-3)" }}>{showOutgoing ? "−" : "+"}</span>
                  </button>
                  {showOutgoing && (
                    <ul className="mt-3 space-y-2">
                      {outgoing.map((l) => {
                        const p = peopleMap[l.addressee];
                        return (
                          <li key={l.id} className="flex items-center gap-2 text-sm">
                            <Avatar url={p?.avatar_url} pseudo={displayName(p)} size={26} />
                            <span className="flex-1 truncate" style={{ color: "var(--bt-text-2)" }}>{displayName(p)}</span>
                            <button onClick={() => removeFriendLink(l.id)} className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                              {t("friends.cancel")}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              <section className="rounded-2xl p-4"
                style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
                    {t("friends.suggestions")}
                  </h2>
                  {showSuggestions && (
                    <button onClick={() => setShowSuggestions(false)} className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                      {t("common.close")}
                    </button>
                  )}
                </div>
                {!showSuggestions ? (
                  <button onClick={loadSuggestions} className="btn-ghost w-full text-sm">
                    {t("friends.seeSuggestions")}
                  </button>
                ) : loadingSuggestions ? (
                  <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("common.loading")}</p>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("friends.noSuggestions")}</p>
                ) : (
                  <ul className="space-y-2">
                    {suggestions.map((s) => {
                      const sameUni = profile?.university &&
                        (s.university || "").trim().toLowerCase() === profile.university.trim().toLowerCase();
                      return (
                        <li key={s.id} className="flex items-center gap-2 text-sm">
                          <button onClick={() => openProfile(s.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <Avatar url={s.avatar_url} pseudo={displayName(s)} size={30} />
                            <span className="flex-1 min-w-0" style={{ color: "var(--bt-text-1)" }}>
                              <span className="block truncate">{displayName(s)}</span>
                              {sameUni && <span className="block text-[10px] font-semibold" style={{ color: "#14B885" }}>{t("friends.sameUni")}</span>}
                            </span>
                          </button>
                          <button onClick={() => addFriend(s.id)} className="btn-primary text-xs px-2.5 py-1">
                            {t("friends.addBtn")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
                    {t("msg.myFriends")}
                  </h2>
                </div>
                {friends.length === 0 ? (
                  <p className="p-4 text-sm" style={{ color: "var(--bt-text-3)" }}>{t("friends.none")}</p>
                ) : (
                  <ul>
                    {friends.map(({ profile: fp, unread, lastMsg }, idx) => (
                      <li key={fp.id} style={idx > 0 ? { borderTop: "1px solid var(--bt-border)" } : {}}>
                        <button onClick={() => openDM(fp.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                          <Avatar url={fp.avatar_url} pseudo={displayName(fp)} size={36} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{displayName(fp)}</span>
                            <span className="block text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                              {lastMsg?.content || t("msg.start")}
                            </span>
                          </span>
                          {unread > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1 leading-none">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>
        ) : activeType === "dm" ? (
          !dmActiveId ? (
            <div className="hidden lg:flex lg:col-span-2 card items-center justify-center"
              style={{ ...panelStyle, color: "var(--bt-text-3)", fontSize: 14 }}>
              {t("msg.pickConv")}
            </div>
          ) : (
            <section className={`${chatVisible} lg:col-span-2 card flex-col`} style={panelStyle}>
              <div className="flex items-center gap-3 px-4 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--bt-border)" }}>
                <button onClick={() => setMobileView("list")} className="lg:hidden btn-ghost px-2 py-1 text-sm">‹</button>
                {activeFriend && (
                  <>
                    <button onClick={() => openProfile(activeFriend.profile.id)} className="shrink-0">
                      <Avatar url={activeFriend.profile.avatar_url} pseudo={displayName(activeFriend.profile)} size={36} />
                    </button>
                    <button onClick={() => openProfile(activeFriend.profile.id)} className="text-left">
                      <p className="font-medium text-sm" style={{ color: "var(--bt-text-1)" }}>{displayName(activeFriend.profile)}</p>
                      <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>@{activeFriend.profile.pseudo}</p>
                    </button>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-sm mt-8" style={{ color: "var(--bt-text-3)" }}>{t("msg.noMsg")}</p>
                )}
                {messages.map(m => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[75%] px-3.5 py-2.5 text-sm"
                        style={mine
                          ? { backgroundColor: "#14B885", color: "#fff", borderRadius: "18px 18px 6px 18px" }
                          : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", borderRadius: "18px 18px 18px 6px" }}>
                        {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                        {m.attachment_url && m.attachment_type === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.attachment_url} alt={m.attachment_name || "image"} className="mt-2 rounded-lg max-h-64 object-cover" />
                        )}
                        {m.attachment_url && m.attachment_type === "file" && (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer"
                            className={`mt-2 inline-flex items-center gap-2 underline ${mine ? "text-white" : "text-accent-dark"}`}>
                            <IconPaperclip size={13} /> {m.attachment_name || "Document"}
                          </a>
                        )}
                        <p className="text-[10px] mt-0.5"
                          style={{ color: mine ? "rgba(255,255,255,0.65)" : "var(--bt-text-3)", textAlign: mine ? "right" : "left" }}>
                          {timeAgo(m.created_at, lang)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={dmBottomRef} />
              </div>

              <form onSubmit={sendDM} className="p-3 flex items-center gap-2 shrink-0"
                style={{ borderTop: "1px solid var(--bt-border)" }}>
                <label className="btn-ghost cursor-pointer px-3 shrink-0" title={t("common.attach")}>
                  <IconPaperclip />
                  <input ref={dmFileRef} type="file"
                    accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                    className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
                <input className="input flex-1"
                  placeholder={file ? `${t("msg.file")} : ${file.name}` : t("msg.placeholder")}
                  value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) sendDM(e); }} />
                <button className="btn-primary shrink-0" disabled={sending || (!text.trim() && !file)}>
                  {sending ? "…" : t("common.send")}
                </button>
              </form>
            </section>
          )
        ) : (
          !grpActiveId ? (
            <div className="hidden lg:flex lg:col-span-2 card items-center justify-center"
              style={{ ...panelStyle, color: "var(--bt-text-3)", fontSize: 14 }}>
              {t("groups.selectGroup")}
            </div>
          ) : (
            <section className={`${chatVisible} lg:col-span-2 card flex-col`} style={panelStyle}>

              {/* ── Group header — clean & compact ────────────────── */}
              <div className="px-3 py-2.5 flex items-center gap-3 shrink-0"
                style={{ borderBottom: "1px solid var(--bt-border)" }}>

                {/* Retour mobile */}
                <button onClick={() => setMobileView("list")}
                  className="lg:hidden shrink-0 w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
                  style={{ color: "var(--bt-text-2)", backgroundColor: "var(--bt-subtle)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>

                {/* Nom + avatar → ouvre les infos du groupe */}
                <button
                  onClick={() => {
                    setShowGroupInfo(true);
                    setInviteQuery(""); setInviteResults([]);
                  }}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                  <GroupAvatar group={activeGroup} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--bt-text-1)" }}>
                      {activeGroup?.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                      {groupMembers.length} {groupMembers.length !== 1 ? t("msg.members") : t("msg.member")}
                      <span className="ml-1 opacity-60">· {t("groups.groupInfo")}</span>
                    </p>
                  </div>
                </button>

                {/* Bouton chrono (action principale) */}
                {!groupChrono && (
                  <button
                    onClick={() => setShowChronoStart(v => !v)}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                    style={{
                      backgroundColor: showChronoStart ? "#EAFBF4" : "var(--bt-subtle)",
                      color: showChronoStart ? "#0E8F68" : "var(--bt-text-2)",
                      border: "1px solid var(--bt-border)",
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9.5 3h5M12 3v2"/>
                    </svg>
                    <span className="hidden sm:inline">{t("groups.startChrono")}</span>
                    <span className="sm:hidden">Chrono</span>
                  </button>
                )}
              </div>

              {/* ── Panneau démarrer chrono ───────────────────────── */}
              {showChronoStart && !groupChrono && (
                <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: "var(--bt-text-1)" }}>
                    {t("groups.newChrono")}
                  </p>
                  <input className="input text-sm mb-2"
                    placeholder={t("dash.notePlaceholder")}
                    value={chronoStartNote}
                    onChange={e => setChronoStartNote(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={startGroupChrono} disabled={chronoLoading}
                      className="btn-primary text-xs flex-1">
                      {chronoLoading ? "…" : t("groups.startChrono")}
                    </button>
                    <button onClick={() => setShowChronoStart(false)} className="btn-ghost text-xs flex-1">
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Bandeau Chrono de groupe ──────────────────────── */}
              {groupChrono && (
                <div className="px-4 py-3 shrink-0 transition-colors"
                  style={{
                    borderBottom: "1px solid var(--bt-border)",
                    backgroundColor: groupChrono.status === "paused"
                      ? "rgba(239,68,68,0.08)"
                      : "var(--bt-accent-bg)",
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
                        style={{ color: groupChrono.status === "paused" ? "#ef4444" : "var(--bt-accent-dark)" }}>
                        ⏱ {t("groups.chronoTitle")}
                        {groupChrono.note && <span className="font-normal ml-1 normal-case tracking-normal">— {groupChrono.note}</span>}
                      </p>
                      {groupChrono.status === "active" && (
                        <p className="font-mono font-bold text-lg leading-none"
                          style={{ color: "var(--bt-text-1)" }}>
                          {formatDuration(chronoElapsed)}
                        </p>
                      )}
                      {groupChrono.status === "paused" && (
                        <div className="flex items-center gap-2">
                          <p className="font-mono font-bold text-lg leading-none" style={{ color: "#ef4444" }}>
                            {formatDuration(chronoElapsed)}
                          </p>
                          <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                            {t("dash.pausedStatus")}
                          </span>
                        </div>
                      )}
                      {groupChrono.status === "pending" && (
                        <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>
                          {t("groups.chronoPending")}
                        </p>
                      )}
                    </div>

                    {/* Contrôles selon mon statut */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {myChronoStatus === "accepted" ? (
                        <>
                          {groupChrono.status === "active" && (
                            <button onClick={pauseGroupChrono}
                              className="btn-ghost text-xs px-2.5 py-1">
                              {t("dash.pause")}
                            </button>
                          )}
                          {groupChrono.status === "paused" && (
                            <button onClick={resumeGroupChrono}
                              className="btn-primary text-xs px-2.5 py-1">
                              {t("dash.resume")}
                            </button>
                          )}
                          <button onClick={finishGroupChrono}
                            className="text-xs px-2.5 py-1.5 rounded-xl font-semibold"
                            style={{ backgroundColor: "#14B885", color: "#fff" }}>
                            {t("groups.chronoFinish")}
                          </button>
                          {amCreator && (
                            <button onClick={cancelGroupChrono}
                              className="text-xs transition-colors"
                              style={{ color: "var(--bt-text-4)" }}
                              onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                              {t("groups.chronoCancel")}
                            </button>
                          )}
                        </>
                      ) : myChronoStatus === "invited" || myChronoStatus === null ? (
                        <>
                          <button onClick={joinGroupChrono}
                            className="btn-primary text-xs px-3 py-1.5">
                            {t("groups.chronoAccept")}
                          </button>
                          {myChronoStatus === "invited" && (
                            <button onClick={declineGroupChrono}
                              className="btn-ghost text-xs px-2.5 py-1.5">
                              {t("groups.chronoDecline")}
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Participants */}
                  {chronoParticipants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {chronoParticipants.map(p => {
                        const prof = msgProfiles[p.user_id] || groupMembers.find(m => m.user_id === p.user_id)?.profile;
                        const chip = chronoStatusChip(p.status);
                        return (
                          <span key={p.user_id}
                            className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium"
                            style={{ backgroundColor: chip.bg, color: chip.color }}>
                            <span>{displayName(prof || { pseudo: "…" })}</span>
                            <span className="shrink-0" aria-hidden="true">{chip.icon}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Messages du groupe ────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {groupMessages.length === 0 && (
                  <p className="text-center text-sm mt-10" style={{ color: "var(--bt-text-3)" }}>
                    {t("msg.noGroupMsg")}
                  </p>
                )}
                {groupMessages.map(m => {
                  const author = grpWho(m.user_id);
                  const mine = m.user_id === user.id;
                  return (
                    <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      <button onClick={() => openProfile(m.user_id)} className="shrink-0">
                        <Avatar url={author.avatar_url} pseudo={displayName(author)} size={30} />
                      </button>
                      <div className={`max-w-[72%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        <span className="text-[11px] mb-0.5" style={{ color: "var(--bt-text-3)" }}>
                          {displayName(author)} · {timeAgo(m.created_at, lang)}
                        </span>
                        <div className="rounded-2xl px-3.5 py-2.5 text-sm"
                          style={mine
                            ? { backgroundColor: "#14B885", color: "#fff", borderRadius: "18px 18px 6px 18px" }
                            : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", borderRadius: "18px 18px 18px 6px" }}>
                          {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                          {m.attachment_url && m.attachment_type === "image" && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.attachment_url} alt={m.attachment_name || "image"} className="mt-2 rounded-xl max-h-60 object-cover" />
                          )}
                          {m.attachment_url && m.attachment_type === "file" && (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-2 underline"
                              style={{ color: mine ? "#fff" : "#0E8F68" }}>
                              <IconPaperclip size={13} /> {m.attachment_name || "Document"}
                            </a>
                          )}
                        </div>
                        {(mine || isAdmin) && (
                          <button onClick={() => removeGroupMessage(m.id)}
                            className="text-[10px] mt-0.5 transition-colors"
                            style={{ color: "var(--bt-text-4)" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                            {t("common.remove")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={grpBottomRef} />
              </div>

              <form onSubmit={sendGroup} className="p-3 flex items-center gap-2 shrink-0"
                style={{ borderTop: "1px solid var(--bt-border)" }}>
                <label className="btn-ghost cursor-pointer px-3 shrink-0" title={t("common.attach")}>
                  <IconPaperclip />
                  <input ref={grpFileRef} type="file"
                    accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                    className="hidden" onChange={e => setGrpFile(e.target.files?.[0] || null)} />
                </label>
                <input className="input flex-1"
                  placeholder={grpFile ? `${t("msg.file")} : ${grpFile.name}` : t("msg.msgPlaceholder")}
                  value={grpText} onChange={e => setGrpText(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={grpSending || (!grpText.trim() && !grpFile)}>
                  {grpSending ? "…" : t("common.send")}
                </button>
              </form>
            </section>
          )
        )}
      </div>

      {/* ── Modal Infos du groupe ──────────────────────────────── */}
      {showGroupInfo && activeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowGroupInfo(false)}>
          <div className="card w-full max-w-sm flex flex-col"
            style={{ maxHeight: "88vh", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>

            {/* Input photo (caché) */}
            <input ref={grpPhotoRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { uploadGroupPhoto(f); } }} />

            {/* Header modal */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0"
              style={{ borderBottom: "1px solid var(--bt-border)" }}>
              <h2 className="text-base font-bold" style={{ color: "var(--bt-text-1)" }}>
                {t("groups.groupInfo")}
              </h2>
              <button
                onClick={() => setShowGroupInfo(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-border)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-5">
              {/* Photo + nom */}
              <div className="flex flex-col items-center py-5">
                {amCreator ? (
                  <button
                    onClick={() => grpPhotoRef.current?.click()}
                    className="relative group"
                    title={t("groups.uploadPhoto")}>
                    <GroupAvatar group={activeGroup} size={72} />
                    <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                  </button>
                ) : (
                  <GroupAvatar group={activeGroup} size={72} />
                )}
                {amCreator && (
                  <p className="text-xs mt-1.5" style={{ color: "var(--bt-text-3)" }}>
                    {t("groups.uploadPhoto")}
                  </p>
                )}
                <p className="font-bold text-base mt-3 text-center" style={{ color: "var(--bt-text-1)" }}>
                  {activeGroup.name}
                </p>
                {activeGroup.description && (
                  <p className="text-sm text-center mt-1 leading-snug" style={{ color: "var(--bt-text-3)" }}>
                    {activeGroup.description}
                  </p>
                )}
              </div>

              {/* Membres */}
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider mb-2.5"
                  style={{ color: "var(--bt-text-3)" }}>
                  {t("groups.membersTitle")} · {groupMembers.length}
                </p>
                <div className="space-y-1.5" style={{ maxHeight: "180px", overflowY: "auto" }}>
                  {groupMembers.map(m => (
                    <div key={m.user_id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-2xl"
                      style={{ backgroundColor: "var(--bt-subtle)" }}>
                      <button onClick={() => { openProfile(m.user_id); setShowGroupInfo(false); }} className="shrink-0">
                        <Avatar url={m.profile?.avatar_url} pseudo={displayName(m.profile)} size={28} />
                      </button>
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                        {displayName(m.profile)}
                      </span>
                      {m.role === "admin" && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                          admin
                        </span>
                      )}
                      {(isAdmin || (amCreator && m.user_id !== user.id)) && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          className="text-[10px] shrink-0 transition-colors hover:text-red-500"
                          style={{ color: "var(--bt-text-4)" }}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Inviter */}
              <div className="mb-2">
                <p className="text-xs font-bold uppercase tracking-wider mb-2.5"
                  style={{ color: "var(--bt-text-3)" }}>
                  {t("groups.invite")}
                </p>
                <input className="input text-sm mb-2"
                  placeholder={t("groups.searchUser")}
                  value={inviteQuery}
                  onChange={e => searchInvite(e.target.value)} />
                {inviteResults.length > 0 && (
                  <div className="space-y-1 mb-2" style={{ maxHeight: "140px", overflowY: "auto" }}>
                    {inviteResults.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                        style={{ backgroundColor: "var(--bt-subtle)" }}>
                        <Avatar url={p.avatar_url} pseudo={displayName(p)} size={26} />
                        <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                          {displayName(p)}{" "}
                          <span className="font-normal text-xs" style={{ color: "var(--bt-text-3)" }}>
                            @{p.pseudo}
                          </span>
                        </span>
                        <button onClick={() => inviteUser(p.id)} disabled={inviting === p.id}
                          className="text-xs font-semibold px-3 py-1 rounded-xl shrink-0"
                          style={{ backgroundColor: "#14B885", color: "#fff" }}>
                          {inviting === p.id ? "…" : t("groups.invite")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex gap-2 px-5 py-4 shrink-0"
              style={{ borderTop: "1px solid var(--bt-border)" }}>
              <button onClick={() => setShowGroupInfo(false)} className="btn-ghost flex-1 text-sm">
                {t("common.close")}
              </button>
              {amCreator ? (
                <button
                  onClick={() => { setShowGroupInfo(false); deleteGroup(); }}
                  className="flex-1 text-sm rounded-2xl font-semibold transition-colors"
                  style={{ backgroundColor: "#FEF2F2", color: "#ef4444", border: "1px solid #FECACA", padding: "8px 12px" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#FEE2E2"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "#FEF2F2"}>
                  {t("common.delete")}
                </button>
              ) : (
                <button
                  onClick={() => { setShowGroupInfo(false); leaveGroup(); }}
                  className="flex-1 text-sm rounded-2xl font-semibold transition-colors"
                  style={{ backgroundColor: "#FEF2F2", color: "#ef4444", border: "1px solid #FECACA", padding: "8px 12px" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#FEE2E2"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "#FEF2F2"}>
                  {t("groups.leave")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal créer un groupe ──────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(31,26,23,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) closeCreateModal(); }}>
          <div className="card p-6 w-full max-w-sm">
            {createStep === 1 ? (
              <form onSubmit={createGroup} className="space-y-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("groups.create")}</h2>
                <input className="input" required autoFocus
                  placeholder={t("groups.groupName")}
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
                <textarea className="input" rows={2}
                  placeholder={t("groups.description")}
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary flex-1">
                    {creating ? t("msg.creating") : t("msg.createShort")}
                  </button>
                  <button type="button" onClick={closeCreateModal} className="btn-ghost flex-1">{t("common.cancel")}</button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("msg.inviteFriends")}</h2>
                <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("msg.inviteHint")}</p>
                <input className="input text-sm" autoFocus
                  placeholder={t("groups.searchUser")}
                  value={createInviteQuery}
                  onChange={e => searchCreateInvite(e.target.value)} />
                {createInviteResults.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {createInviteResults.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
                        style={{ backgroundColor: "var(--bt-subtle)" }}>
                        <Avatar url={p.avatar_url} pseudo={displayName(p)} size={26} />
                        <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                          {displayName(p)} <span className="font-normal text-xs" style={{ color: "var(--bt-text-3)" }}>@{p.pseudo}</span>
                        </span>
                        <button onClick={() => inviteToNewGroup(p.id)}
                          className="text-xs font-semibold px-3 py-1 rounded-lg shrink-0"
                          style={{ backgroundColor: "#14B885", color: "#fff" }}>
                          {t("groups.invite")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={closeCreateModal} className="btn-primary w-full mt-1">{t("msg.done")}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
    </Layout>
  );
}
