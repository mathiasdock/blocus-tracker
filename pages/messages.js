import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { SkeletonList } from "../components/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useToast } from "../contexts/ToastContext";
import { useI18n } from "../contexts/I18nContext";
import { isOfflineDev, supabase } from "../lib/supabaseClient";
import { displayName, timeAgo, formatDuration } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";
import {
  TEXT_LIMITS,
  attachmentKind,
  clientRateLimit,
  safeStoragePath,
  sanitizeFileName,
  storagePathFromReference,
  trimmedText,
  uploadErrorMessage,
  validateUploadFile,
} from "../lib/security";

const CHAT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

function IconPaperclip({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.93a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
    </svg>
  );
}

function AttachmentImageGate({ src, alt, mine, loaded, onLoad, className = "mt-2 rounded-xl max-h-60 object-cover", t }) {
  if (loaded && src) {
    return (
      <>
        <p className="mt-2 text-[10px] font-semibold"
          style={{ color: mine ? "rgba(255,255,255,0.75)" : "var(--bt-text-3)" }}>
          {t("attachment.imageLoaded")}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt || "image"} loading="lazy" className={className} />
      </>
    );
  }

  return (
    <div className="mt-2 rounded-xl px-3 py-2 text-xs"
      style={{
        backgroundColor: mine ? "rgba(255,255,255,0.14)" : "var(--bt-surface)",
        border: mine ? "1px solid rgba(255,255,255,0.22)" : "1px solid var(--bt-border)",
        color: mine ? "rgba(255,255,255,0.86)" : "var(--bt-text-2)",
      }}>
      <p className="mb-2">{t("attachment.available")}</p>
      <button type="button" onClick={onLoad}
        className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{
          backgroundColor: mine ? "#fff" : "var(--bt-accent-bg)",
          border: mine ? "none" : "1px solid var(--bt-accent-border)",
          color: mine ? "#0E8F68" : "var(--bt-accent-dark)",
        }}>
        {t("attachment.viewImage")}
      </button>
    </div>
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
  const { toast } = useToast();
  const { t, lang }       = useI18n();
  const isAdmin = profile?.is_admin === true;

  // ── DM state ──────────────────────────────────────────────────
  const [friends, setFriends]       = useState([]);
  const [dmActiveId, setDmActiveId] = useState(null);
  const [messages, setMessages]     = useState([]);
  const [signedDmUrls, setSignedDmUrls] = useState({});
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
  const [socialMsg, setSocialMsg] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [requestsTab, setRequestsTab] = useState("received"); // "received" | "sent"

  // ── Recherche sociale unifiée (amis, groupes, nouvelles personnes) ──
  const [socialQuery, setSocialQuery] = useState("");
  const [socialResults, setSocialResults] = useState(null); // null = pas de recherche active
  const [searchingSocial, setSearchingSocial] = useState(false);
  const socialSearchTimer = useRef(null);
  const socialSearchRef = useRef(null);
  const socialSearchInputRef = useRef(null);

  // Ferme le menu déroulant de résultats au clic en dehors (même pattern
  // que UniPicker / la recherche globale de l'admin).
  useEffect(() => {
    function handler(e) {
      if (socialSearchRef.current && !socialSearchRef.current.contains(e.target)) setSocialResults(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Navigation ─────────────────────────────────────────────────
  const [conversationFilter, setConversationFilter] = useState("all"); // "all" | "dm" | "group"
  const [activeType, setActiveType] = useState(null); // null | "dm" | "group"
  const [mobileView, setMobileView] = useState("list");
  const [viewUserId, setViewUserId] = useState(null);
  const [revealedImages, setRevealedImages] = useState({});

  function openProfile(userId) {
    if (userId === user?.id) return;
    setViewUserId(userId);
  }

  function revealImage(key) {
    setRevealedImages((prev) => ({ ...prev, [key]: true }));
  }

  function pickFile(setter, input) {
    const f = input.files?.[0] || null;
    if (!f) { setter(null); return; }
    const check = validateUploadFile(f, "chatAttachment");
    if (!check.ok) {
      alert(uploadErrorMessage(t, check));
      input.value = "";
      setter(null);
      return;
    }
    setter(f);
  }

  function signedDmUrl(ref) {
    const path = storagePathFromReference(ref, "dm");
    if (!path) return ref;
    if (isOfflineDev) return `/offline-upload/dm/${path}`;
    return signedDmUrls[ref] || "";
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
      supabase.from("profiles").select("id,pseudo,first_name,last_name,avatar_url,studying_since").in("id", friendIds),
      supabase.from("private_messages").select("sender_id").eq("receiver_id", user.id).eq("read", false),
      supabase.from("private_messages").select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(100),
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

  // ── Score social partagé (suggestions + recherche) ──────────────
  // Un seul aller-retour Supabase (pas un par candidat) : on récupère les
  // amitiés acceptées impliquant les candidats + leurs sessions récentes
  // (7 derniers jours, table déjà existante — aucune migration requise).
  async function fetchSocialSignals(candidateIds) {
    if (!candidateIds.length) return { friendsOf: {}, activeSet: new Set() };
    const idList = candidateIds.join(",");
    const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ data: links }, { data: recentSessions }] = await Promise.all([
      supabase.from("friendships").select("requester, addressee")
        .or(`requester.in.(${idList}),addressee.in.(${idList})`)
        .eq("status", "accepted"),
      supabase.from("sessions").select("user_id")
        .in("user_id", candidateIds)
        .gte("started_at", since7),
    ]);
    const candidateSet = new Set(candidateIds);
    const friendsOf = {};
    (links || []).forEach((l) => {
      if (candidateSet.has(l.requester)) (friendsOf[l.requester] ||= new Set()).add(l.addressee);
      if (candidateSet.has(l.addressee)) (friendsOf[l.addressee] ||= new Set()).add(l.requester);
    });
    return { friendsOf, activeSet: new Set((recentSessions || []).map((s) => s.user_id)) };
  }

  // Poids du score : les amis en commun dominent largement (x15), le reste
  // ne sert qu'à départager. "Communauté" = université dans ce modèle de
  // données (aucune colonne community_id distincte sur profiles).
  function scoreCandidate(p, { friendsOf, activeSet, myFriendIds, myUni }) {
    const theirFriends = friendsOf[p.id] || new Set();
    let mutual = 0;
    theirFriends.forEach((id) => { if (myFriendIds.has(id)) mutual += 1; });
    const sameUni = !!(myUni && (p.university || "").trim().toLowerCase() === myUni);
    const activeRecently = activeSet.has(p.id) || !!p.studying_since;
    return { mutual, sameUni, activeRecently, score: mutual * 15 + (sameUni ? 8 : 0) + (activeRecently ? 5 : 0) };
  }

  function myFriendIdSet() {
    return new Set(
      friendLinks.filter((l) => l.status === "accepted")
        .map((l) => (l.requester === user.id ? l.addressee : l.requester))
    );
  }

  // Tri de recherche : 1) pseudo exact 2) pseudo prefix 3) nom/prénom 4) reste
  // (le score amis-communs/université/activité départage ensuite dans le tri final).
  function searchTier(p, needleLower) {
    const pseudo = (p.pseudo || "").toLowerCase();
    if (pseudo === needleLower) return 0;
    if (pseudo.startsWith(needleLower)) return 1;
    if (displayName(p).toLowerCase().includes(needleLower)) return 2;
    return 3;
  }

  // Recherche sociale unifiée — debounce 280ms, cherche des PERSONNES
  // (les conversations existantes sont filtrées côté client dans le rendu,
  // à partir de la liste déjà chargée : aucun aller-retour réseau requis).
  async function searchSocial(q) {
    setSocialQuery(q);
    setSocialMsg("");
    clearTimeout(socialSearchTimer.current);
    const needle = q.trim();
    if (!needle) { setSocialResults(null); setSearchingSocial(false); return; }
    socialSearchTimer.current = setTimeout(async () => {
      if (!user) return;
      setSearchingSocial(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, pseudo, first_name, last_name, avatar_url, university, studying_since")
        .or(`pseudo.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`)
        .neq("id", user.id)
        .limit(20);
      const people = data || [];
      const myFriendIds = myFriendIdSet();
      const myUni = (profile?.university || "").trim().toLowerCase();
      const { friendsOf, activeSet } = await fetchSocialSignals(people.map((p) => p.id));
      const needleLower = needle.toLowerCase();
      const ranked = people
        .map((p) => ({ ...p, ...scoreCandidate(p, { friendsOf, activeSet, myFriendIds, myUni }), tier: searchTier(p, needleLower) }))
        .sort((a, b) => a.tier - b.tier || b.score - a.score);
      setSearchingSocial(false);
      setSocialResults({ people: ranked, query: needle });
    }, 280);
  }

  async function addFriend(id) {
    if (!user) return;
    const action = clientRateLimit(`friends:add:${user.id}`, 12, 60_000);
    if (!action.ok) { setSocialMsg(t("security.rateLimited")); return; }
    const { error } = await supabase
      .from("friendships")
      .insert({ requester: user.id, addressee: id, status: "pending" });
    if (error) {
      setSocialMsg(t("friends.requestError"));
      toast(t("friends.requestError"), "error");
    } else {
      setSocialMsg(t("friends.requestSent"));
      toast(t("toast.friendRequestSent"));
      notifyXPChanged();
    }
    setSuggestions((prev) => prev.filter((p) => p.id !== id));
    await loadFriendLinks();
  }

  async function acceptFriend(linkId) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", linkId);
    if (!error) { notifyXPChanged(); toast(t("toast.friendAdded")); }
    await loadFriendLinks();
    await loadFriends();
  }

  async function removeFriendLink(linkId) {
    await supabase.from("friendships").delete().eq("id", linkId);
    await loadFriendLinks();
    await loadFriends();
  }

  // Suggestions — score réel (amis en commun ++, université, activité
  // récente) au lieu du tri "même université" binaire précédent.
  async function loadSuggestions() {
    if (!user) return;
    setShowSuggestions(true);
    setLoadingSuggestions(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url, university, studying_since")
      .neq("id", user.id)
      .limit(200);
    const connected = new Set();
    friendLinks.forEach((l) => { connected.add(l.requester); connected.add(l.addressee); });
    const pool = (data || []).filter((p) => !connected.has(p.id));
    const myFriendIds = myFriendIdSet();
    const myUni = (profile?.university || "").trim().toLowerCase();
    const { friendsOf, activeSet } = await fetchSocialSignals(pool.map((p) => p.id));
    const scored = pool
      .map((p) => ({ ...p, ...scoreCandidate(p, { friendsOf, activeSet, myFriendIds, myUni }) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
    setSuggestions(scored);
    setLoadingSuggestions(false);
  }

  const loadMessages = useCallback(async () => {
    if (!dmActiveId || !user) return;
    const { data } = await supabase.from("private_messages").select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${dmActiveId}),and(sender_id.eq.${dmActiveId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true }).limit(50);
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
    // Dernier message par groupe (même approche que loadFriends pour les DM,
    // indispensable pour trier privés + groupes ensemble dans UNE liste) +
    // nombre de membres (pour l'affichage "Groupe · N membres" de la liste).
    const [{ data: grps }, { data: lastMsgs }, { data: allMembers }] = await Promise.all([
      supabase.from("study_groups").select("*").in("id", ids).order("created_at", { ascending: false }),
      supabase.from("group_messages").select("group_id, content, attachment_type, created_at")
        .in("group_id", ids).order("created_at", { ascending: false }).limit(300),
      supabase.from("group_members").select("group_id").in("group_id", ids),
    ]);
    const roleMap = Object.fromEntries(myMem.map(m => [m.group_id, m.role]));
    const lastBy = {};
    (lastMsgs || []).forEach(m => { if (!lastBy[m.group_id]) lastBy[m.group_id] = m; });
    const memberCountBy = {};
    (allMembers || []).forEach(m => { memberCountBy[m.group_id] = (memberCountBy[m.group_id] || 0) + 1; });
    setGroups((grps || []).map(g => ({
      ...g,
      myRole: roleMap[g.id] || "member",
      lastMsg: lastBy[g.id] || null,
      memberCount: memberCountBy[g.id] || 1,
    })));
  }, [user]);

  const loadGroupMessages = useCallback(async () => {
    if (!grpActiveId) return;
    const { data } = await supabase.from("group_messages").select("*")
      .eq("group_id", grpActiveId).order("created_at", { ascending: true }).limit(100);
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
  useEffect(() => {
    let cancelled = false;
    const refs = [...new Set(
      messages
        .map((m) => m.attachment_url)
        .filter((ref) => ref && storagePathFromReference(ref, "dm") && !signedDmUrls[ref])
    )];
    if (isOfflineDev) return () => { cancelled = true; };
    if (!refs.length) return () => { cancelled = true; };

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const entries = await Promise.all(refs.map(async (ref) => {
        try {
          const res = await fetch("/api/storage/sign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ bucket: "dm", ref }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data?.signedUrl ? [ref, data.signedUrl] : null;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter(Boolean));
      if (Object.keys(next).length) setSignedDmUrls((prev) => ({ ...prev, ...next }));
    })();

    return () => { cancelled = true; };
  }, [messages, signedDmUrls]);
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

  // Repris par le lien historique /friends → /messages?tab=relations : dans
  // la nouvelle page Social, "Relations" n'est plus un panneau plein écran,
  // juste le tiroir compact "Demandes d'amis" qui s'ouvre dans la colonne
  // gauche (voir showRequests).
  function openRelations() {
    setShowRequests(true);
    markSeen("friends");
  }

  async function sendDM(e) {
    e.preventDefault();
    const cleanText = trimmedText(text, TEXT_LIMITS.directMessage);
    if (!cleanText && !file) return;
    const action = clientRateLimit(`dm:send:${user.id}`, 20, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return; }
    setSending(true);
    let attachment_url = null, attachment_type = null, attachment_name = null;
    if (file) {
      const pathInfo = safeStoragePath(user.id, file, [], "chatAttachment");
      if (!pathInfo.ok) { setSending(false); alert(uploadErrorMessage(t, pathInfo)); return; }
      const { error: upErr } = await supabase.storage.from("dm").upload(pathInfo.path, file, {
        cacheControl: "31536000",
        contentType: pathInfo.contentType,
      });
      if (upErr) { setSending(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      attachment_url = `dm:${pathInfo.path}`;
      attachment_type = attachmentKind(file);
      attachment_name = sanitizeFileName(file.name);
    }
    await supabase.from("private_messages").insert({
      sender_id: user.id, receiver_id: dmActiveId,
      content: cleanText || null,
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
    const cleanText = trimmedText(grpText, TEXT_LIMITS.groupMessage);
    if (!cleanText && !grpFile) return;
    const action = clientRateLimit(`group:send:${user.id}`, 20, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return; }
    setGrpSending(true);
    let attachment_url = null, attachment_type = null, attachment_name = null;
    if (grpFile) {
      const pathInfo = safeStoragePath(user.id, grpFile, [grpActiveId], "chatAttachment");
      if (!pathInfo.ok) { setGrpSending(false); alert(uploadErrorMessage(t, pathInfo)); return; }
      const { error: upErr } = await supabase.storage.from("community").upload(pathInfo.path, grpFile, {
        cacheControl: "31536000",
        contentType: pathInfo.contentType,
      });
      if (upErr) { setGrpSending(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("community").getPublicUrl(pathInfo.path);
      attachment_url = pub.publicUrl;
      attachment_type = attachmentKind(grpFile);
      attachment_name = sanitizeFileName(grpFile.name);
    }
    await supabase.from("group_messages").insert({
      group_id: grpActiveId, user_id: user.id,
      content: cleanText || null,
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
    const action = clientRateLimit(`group:invite:${user.id}`, 20, 60_000);
    if (!action.ok) return;
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
    const pathInfo = safeStoragePath(user.id, file, ["groups", grpActiveId], "groupPhoto");
    if (!pathInfo.ok) { alert(uploadErrorMessage(t, pathInfo)); return; }
    const { error: upErr } = await supabase.storage.from("community").upload(pathInfo.path, file, {
      upsert: true,
      cacheControl: "31536000",
      contentType: pathInfo.contentType,
    });
    if (upErr) { alert(upErr.message); return; }
    const { data: pub } = supabase.storage.from("community").getPublicUrl(pathInfo.path);
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

  // ── Liste unifiée de conversations (privées + groupes) ──────────
  // Un seul flux façon WhatsApp/Discord : non lus d'abord, puis plus récent.
  // Chaque item porte son type ("dm"/"group") pour l'affichage du badge et
  // le filtre Tout/Privés/Groupes.
  const conversations = [
    ...friends.map(({ profile: fp, unread, lastMsg }) => ({
      type: "dm",
      id: fp.id,
      key: `dm-${fp.id}`,
      name: displayName(fp),
      pseudo: fp.pseudo,
      avatarUrl: fp.avatar_url,
      subtitle: lastMsg?.content || (lastMsg ? t("msg.file") : t("msg.start")),
      unread,
      lastAt: lastMsg?.created_at || null,
      isActive: activeType === "dm" && dmActiveId === fp.id,
    })),
    ...groups.map((g) => ({
      type: "group",
      id: g.id,
      key: `group-${g.id}`,
      name: g.name,
      pseudo: null,
      avatarUrl: g.photo_url,
      subtitle: `${t("social.typeGroup")} · ${g.memberCount} ${g.memberCount > 1 ? t("msg.members") : t("msg.member")}`,
      unread: groupCount[g.id] || 0,
      lastAt: g.lastMsg?.created_at || g.created_at,
      isActive: activeType === "group" && grpActiveId === g.id,
    })),
  ].sort((a, b) => {
    const aUnread = a.unread > 0, bUnread = b.unread > 0;
    if (aUnread !== bUnread) return (bUnread ? 1 : 0) - (aUnread ? 1 : 0);
    return (b.lastAt || "").localeCompare(a.lastAt || "");
  });

  const filteredConversations = conversations.filter((c) =>
    conversationFilter === "all" ? true : c.type === conversationFilter
  );

  // Conversations existantes qui matchent la recherche en cours (section
  // "Conversations" du menu déroulant) — purement client, la liste est déjà
  // en mémoire, aucun aller-retour réseau nécessaire.
  const matchingConversations = socialResults
    ? conversations.filter((c) => {
        const q = socialResults.query.toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.pseudo || "").toLowerCase().includes(q);
      })
    : [];

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

  const panelStyle = { height: "min(820px, calc(100dvh - 220px))" };

  return (
    <Layout>
      <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("social.title")}</h1>
      <p className="text-sm mb-4" style={{ color: "var(--bt-text-2)" }}>{t("social.subtitle")}</p>

      <div className="grid gap-4 lg:grid-cols-3 bt-rise">

        {/* ── Sidebar — recherche + demandes + liste unifiée + suggestions ── */}
        <aside className={`${mobileView === "chat" ? "hidden lg:block" : ""} lg:col-span-1`}>
          <div className="card flex flex-col overflow-hidden" style={panelStyle}>

            {/* ── Recherche sociale — au centre de la colonne gauche ── */}
            <div className="p-3 shrink-0 relative" ref={socialSearchRef}
              style={{ borderBottom: "1px solid var(--bt-border)" }}>
              <div className="relative">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--bt-text-4)" }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input ref={socialSearchInputRef} className="input text-sm w-full" style={{ paddingLeft: "2.15rem" }}
                  placeholder={t("social.searchPlaceholder")}
                  value={socialQuery} onChange={e => searchSocial(e.target.value)} />
                {socialQuery && (
                  <button onClick={() => { setSocialQuery(""); setSocialResults(null); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full"
                    style={{ color: "var(--bt-text-3)" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>

              {/* Menu déroulant — conversations existantes + nouvelles personnes */}
              {socialResults && (
                <div className="absolute left-3 right-3 mt-1.5 rounded-2xl z-30 overflow-hidden max-h-[65vh] overflow-y-auto"
                  style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 12px 32px var(--bt-shadow)" }}>
                  {searchingSocial ? (
                    <div className="px-2 py-2"><SkeletonList rows={3} avatar={30} lines={2} /></div>
                  ) : matchingConversations.length === 0 && socialResults.people.length === 0 ? (
                    <p className="px-4 py-4 text-sm" style={{ color: "var(--bt-text-3)" }}>
                      {t("social.searchNoResults").replace("{q}", socialResults.query)}
                    </p>
                  ) : (
                    <>
                      {matchingConversations.length > 0 && (
                        <div>
                          <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>
                            {t("social.searchConversations")}
                          </p>
                          {matchingConversations.map(c => (
                            <button key={c.key}
                              onClick={() => { c.type === "dm" ? openDM(c.id) : openGroup(c.id); setSocialQuery(""); setSocialResults(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                              {c.type === "group"
                                ? <GroupAvatar group={{ photo_url: c.avatarUrl, name: c.name }} size={30} />
                                : <Avatar url={c.avatarUrl} pseudo={c.name} size={30} />}
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                                <span className="block text-[11px] truncate" style={{ color: "var(--bt-text-3)" }}>{c.subtitle}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {socialResults.people.length > 0 && (
                        <div>
                          <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>
                            {t("social.searchPeople")}
                          </p>
                          {socialResults.people.map(p => {
                            const rel = relationOf(p.id);
                            const reasons = [];
                            if (p.mutual > 0) reasons.push(p.mutual === 1 ? t("social.mutualOne") : t("social.mutualMany").replace("{n}", String(p.mutual)));
                            else if (p.sameUni) reasons.push(t("social.sameUniversity"));
                            return (
                              <div key={p.id} className="flex items-center gap-2.5 px-4 py-2">
                                <button onClick={() => openProfile(p.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                                  <Avatar url={p.avatar_url} pseudo={displayName(p)} size={30} />
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{displayName(p)}</span>
                                    <span className="block text-[11px] truncate" style={{ color: "var(--bt-text-3)" }}>
                                      {rel === "accepted" ? t("social.alreadyFriend") : reasons[0] ? reasons[0] : `@${p.pseudo}`}
                                    </span>
                                  </span>
                                </button>
                                {rel === "accepted" ? (
                                  <button onClick={() => { openDM(p.id); setSocialQuery(""); setSocialResults(null); }} className="btn-ghost text-xs px-2.5 py-1 shrink-0">
                                    {t("social.messageBtn")}
                                  </button>
                                ) : rel === "pending" ? (
                                  <span className="text-xs shrink-0" style={{ color: "var(--bt-text-3)" }}>{t("friends.pendingStatus")}</span>
                                ) : (
                                  <button onClick={() => addFriend(p.id)} className="btn-primary text-xs px-2.5 py-1 shrink-0">
                                    {t("friends.addBtn")}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {socialMsg && <p className="px-4 py-2 text-xs" style={{ color: "#0E8F68", borderTop: "1px solid var(--bt-border)" }}>{socialMsg}</p>}
                </div>
              )}
            </div>

            {/* ── Demandes d'amis — ligne compacte, jamais une grosse carte ── */}
            {(incoming.length + outgoing.length) > 0 && (
              <div className="shrink-0" style={{ borderBottom: "1px solid var(--bt-border)" }}>
                <button onClick={() => setShowRequests(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors"
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                  <span className="flex items-center gap-2 font-medium" style={{ color: "var(--bt-text-1)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--bt-accent-dark)" }}>
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6M19 8v6"/>
                    </svg>
                    {t("social.requestsCompact").replace("{n}", String(incoming.length + outgoing.length))}
                  </span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: "var(--bt-text-3)", transform: showRequests ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {showRequests && (
                  <div className="px-4 pb-3">
                    <div className="flex gap-1 mb-2.5 p-0.5 rounded-xl w-fit" style={{ backgroundColor: "var(--bt-subtle)" }}>
                      {[["received", `${t("social.requestsReceived")} (${incoming.length})`], ["sent", `${t("social.requestsSent")} (${outgoing.length})`]].map(([v, label]) => (
                        <button key={v} onClick={() => setRequestsTab(v)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                          style={requestsTab === v ? { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)", boxShadow: "0 1px 3px var(--bt-shadow)" } : { color: "var(--bt-text-3)" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {requestsTab === "received" ? (
                      incoming.length === 0 ? <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("social.requestsNoneReceived")}</p> : (
                        <ul className="space-y-2">
                          {incoming.map((l) => {
                            const p = peopleMap[l.requester];
                            return (
                              <li key={l.id} className="flex items-center gap-2 text-sm">
                                <button onClick={() => openProfile(l.requester)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                  <Avatar url={p?.avatar_url} pseudo={displayName(p)} size={28} />
                                  <span className="font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{displayName(p)}</span>
                                </button>
                                <button onClick={() => acceptFriend(l.id)} className="btn-primary text-xs px-2.5 py-1">{t("friends.accept")}</button>
                                <button onClick={() => removeFriendLink(l.id)} className="btn-ghost text-xs px-2.5 py-1">{t("friends.refuse")}</button>
                              </li>
                            );
                          })}
                        </ul>
                      )
                    ) : outgoing.length === 0 ? <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("social.requestsNoneSent")}</p> : (
                      <ul className="space-y-2">
                        {outgoing.map((l) => {
                          const p = peopleMap[l.addressee];
                          return (
                            <li key={l.id} className="flex items-center gap-2 text-sm">
                              <Avatar url={p?.avatar_url} pseudo={displayName(p)} size={26} />
                              <span className="flex-1 truncate" style={{ color: "var(--bt-text-2)" }}>{displayName(p)}</span>
                              <button onClick={() => removeFriendLink(l.id)} className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("friends.cancel")}</button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Filtres Tout / Privés / Groupes ── */}
            <div className="flex gap-1 p-2 shrink-0" style={{ borderBottom: "1px solid var(--bt-border)" }}>
              {[["all", t("social.filterAll")], ["dm", t("social.filterDm")], ["group", t("social.filterGroups")]].map(([v, label]) => (
                <button key={v} onClick={() => setConversationFilter(v)}
                  className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={conversationFilter === v
                    ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }
                    : { color: "var(--bt-text-3)" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Liste unifiée de conversations ── */}
            <div className="overflow-y-auto flex-1">
              {filteredConversations.length === 0 ? (
                <p className="text-sm p-4" style={{ color: "var(--bt-text-3)" }}>
                  {conversations.length === 0 ? t("social.noConversations") : t("social.noConversationsFiltered")}
                </p>
              ) : (
                <ul>
                  {filteredConversations.map((c) => (
                    <li key={c.key}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={c.isActive ? { backgroundColor: "var(--bt-accent-bg)" } : {}}
                      onClick={() => (c.type === "dm" ? openDM(c.id) : openGroup(c.id))}
                      onMouseEnter={e => { if (!c.isActive) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                      onMouseLeave={e => { if (!c.isActive) e.currentTarget.style.backgroundColor = ""; }}>
                      {c.type === "group"
                        ? <GroupAvatar group={{ photo_url: c.avatarUrl, name: c.name }} size={38} />
                        : (
                          <button onClick={ev => { ev.stopPropagation(); openProfile(c.id); }} className="shrink-0">
                            <Avatar url={c.avatarUrl} pseudo={c.name} size={38} />
                          </button>
                        )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</p>
                        <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                          {c.type === "dm" && <span className="font-semibold" style={{ color: "var(--bt-text-4)" }}>{t("social.typePrivate")} · </span>}
                          {c.subtitle}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {c.lastAt && <span className="text-[10px]" style={{ color: "var(--bt-text-4)" }}>{timeAgo(c.lastAt, lang)}</span>}
                        {c.unread > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1 leading-none">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Créer un groupe ── */}
            <div className="p-2.5 shrink-0" style={{ borderTop: "1px solid var(--bt-border)" }}>
              <button onClick={() => setShowCreate(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-colors"
                style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-border)" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {t("groups.create")}
              </button>
            </div>

            {/* ── Suggestions — discrètes, repliées par défaut ── */}
            <div className="shrink-0 px-3 py-2.5" style={{ borderTop: "1px solid var(--bt-border)" }}>
              {!showSuggestions ? (
                <button onClick={loadSuggestions} className="w-full text-xs font-medium py-1" style={{ color: "var(--bt-text-3)" }}>
                  {t("friends.seeSuggestions")}
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>{t("social.suggestionsTitle")}</span>
                    <button onClick={() => setShowSuggestions(false)} className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("common.close")}</button>
                  </div>
                  {loadingSuggestions ? (
                    <SkeletonList rows={3} avatar={28} lines={1} />
                  ) : suggestions.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("social.suggestionsEmpty")}</p>
                  ) : (
                    <ul className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                      {suggestions.slice(0, 8).map((s) => {
                        const reason = s.mutual > 0
                          ? (s.mutual === 1 ? t("social.mutualOne") : t("social.mutualMany").replace("{n}", String(s.mutual)))
                          : s.sameUni ? t("social.sameUniversity")
                          : s.activeRecently ? t("social.activeThisWeek")
                          : null;
                        return (
                          <li key={s.id} className="flex items-center gap-2 text-sm">
                            <button onClick={() => openProfile(s.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                              <Avatar url={s.avatar_url} pseudo={displayName(s)} size={28} />
                              <span className="flex-1 min-w-0">
                                <span className="block truncate text-sm" style={{ color: "var(--bt-text-1)" }}>{displayName(s)}</span>
                                {reason && <span className="block truncate text-[10px] font-semibold" style={{ color: "#14B885" }}>{reason}</span>}
                              </span>
                            </button>
                            <button onClick={() => addFriend(s.id)} className="btn-primary text-xs px-2.5 py-1 shrink-0">{t("friends.addBtn")}</button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Chat area ──────────────────────────────────────────── */}
        {activeType === null ? (
          <div className={`${chatVisible} lg:col-span-2 card flex-col items-center justify-center text-center p-8`} style={panelStyle}>
            <span className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
            <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--bt-text-1)" }}>{t("social.emptyTitle")}</h2>
            <p className="text-sm mb-5 max-w-xs" style={{ color: "var(--bt-text-3)" }}>{t("social.emptySubtitle")}</p>
            <div className="flex flex-wrap gap-2 justify-center mb-2">
              <button onClick={() => socialSearchInputRef.current?.focus()} className="btn-primary text-sm px-4 py-2">
                {t("social.emptyCtaSearch")}
              </button>
              <button onClick={() => setShowCreate(true)} className="btn-ghost text-sm px-4 py-2">
                {t("social.emptyCtaCreateGroup")}
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="w-full max-w-xs mt-5 pt-5" style={{ borderTop: "1px solid var(--bt-border)" }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--bt-text-4)" }}>
                  {t("social.suggestionsTitle")}
                </p>
                <div className="space-y-2">
                  {suggestions.slice(0, 3).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <Avatar url={s.avatar_url} pseudo={displayName(s)} size={28} />
                      <span className="flex-1 min-w-0 truncate text-left" style={{ color: "var(--bt-text-1)" }}>{displayName(s)}</span>
                      <button onClick={() => addFriend(s.id)} className="btn-primary text-xs px-2.5 py-1 shrink-0">{t("friends.addBtn")}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeType === "dm" ? (
            <section className={`${chatVisible} lg:col-span-2 card flex-col`} style={panelStyle}>
              <div className="flex items-center gap-3 px-4 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--bt-border)" }}>
                <button onClick={() => setMobileView("list")} className="lg:hidden btn-ghost px-2 py-1 text-sm">‹</button>
                {activeFriend && (
                  <>
                    <button onClick={() => openProfile(activeFriend.profile.id)} className="shrink-0 relative">
                      <Avatar url={activeFriend.profile.avatar_url} pseudo={displayName(activeFriend.profile)} size={36} />
                      {activeFriend.profile.studying_since && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: "#22c55e", border: "2px solid var(--bt-surface)" }} />
                      )}
                    </button>
                    <button onClick={() => openProfile(activeFriend.profile.id)} className="text-left flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: "var(--bt-text-1)" }}>{displayName(activeFriend.profile)}</p>
                      <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                        @{activeFriend.profile.pseudo}
                        {activeFriend.profile.studying_since && <span style={{ color: "#0E8F68" }}> · {t("social.onlineNow")}</span>}
                      </p>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => openProfile(activeFriend.profile.id)} className="btn-ghost text-xs px-2.5 py-1.5 hidden sm:inline-flex">
                        {t("social.viewProfileButton")}
                      </button>
                      <button onClick={() => router.push("/dashboard")} className="btn-ghost text-xs px-2.5 py-1.5">
                        {t("groups.startChrono")}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-sm mt-8" style={{ color: "var(--bt-text-3)" }}>{t("msg.noMsg")}</p>
                )}
                {messages.map(m => {
                  const mine = m.sender_id === user.id;
                  const attachmentUrl = m.attachment_url ? signedDmUrl(m.attachment_url) : "";
                  const imageKey = `dm:${m.id}:${m.attachment_url || ""}`;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[75%] px-3.5 py-2.5 text-sm"
                        style={mine
                          ? { backgroundColor: "#14B885", color: "#fff", borderRadius: "18px 18px 6px 18px" }
                          : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", borderRadius: "18px 18px 18px 6px" }}>
                        {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                        {m.attachment_url && m.attachment_type === "image" && attachmentUrl && (
                          <AttachmentImageGate
                            src={attachmentUrl}
                            alt={m.attachment_name || "image"}
                            mine={mine}
                            loaded={revealedImages[imageKey]}
                            onLoad={() => revealImage(imageKey)}
                            className="mt-2 rounded-lg max-h-64 object-cover"
                            t={t}
                          />
                        )}
                        {m.attachment_url && m.attachment_type === "file" && attachmentUrl && (
                          <a href={attachmentUrl} target="_blank" rel="noreferrer"
                            className={`mt-2 inline-flex items-center gap-2 underline ${mine ? "text-white" : "text-accent-dark"}`}>
                            <IconPaperclip size={13} /> {m.attachment_name || "Document"}
                          </a>
                        )}
                        {m.attachment_url && !attachmentUrl && (
                          <p className="mt-2 text-xs" style={{ color: mine ? "rgba(255,255,255,0.75)" : "var(--bt-text-3)" }}>
                            {t("security.signingAttachment")}
                          </p>
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
                    accept={CHAT_ACCEPT}
                    className="hidden" onChange={e => pickFile(setFile, e.currentTarget)} />
                </label>
                <input className="input flex-1"
                  placeholder={file ? `${t("msg.file")} : ${file.name}` : t("msg.placeholder")}
                  maxLength={TEXT_LIMITS.directMessage}
                  value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) sendDM(e); }} />
                <button className="btn-primary shrink-0" disabled={sending || (!text.trim() && !file)}>
                  {sending ? "…" : t("common.send")}
                </button>
              </form>
            </section>
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

                {/* Nom + avatar */}
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
                    <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                      {groupMembers.length} {groupMembers.length !== 1 ? t("msg.members") : t("msg.member")}
                      <span className="opacity-70"> · {t("social.groupHeaderType")}</span>
                    </p>
                  </div>
                </button>

                {/* Infos — explicite, distinct de l'action chrono */}
                <button onClick={() => { setShowGroupInfo(true); setInviteQuery(""); setInviteResults([]); }}
                  className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors hidden sm:inline-flex"
                  style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
                  {t("social.infoButton")}
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
                  const imageKey = `group:${m.id}:${m.attachment_url || ""}`;
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
                            <AttachmentImageGate
                              src={m.attachment_url}
                              alt={m.attachment_name || "image"}
                              mine={mine}
                              loaded={revealedImages[imageKey]}
                              onLoad={() => revealImage(imageKey)}
                              t={t}
                            />
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
                    accept={CHAT_ACCEPT}
                    className="hidden" onChange={e => pickFile(setGrpFile, e.currentTarget)} />
                </label>
                <input className="input flex-1"
                  placeholder={grpFile ? `${t("msg.file")} : ${grpFile.name}` : t("msg.msgPlaceholder")}
                  maxLength={TEXT_LIMITS.groupMessage}
                  value={grpText} onChange={e => setGrpText(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={grpSending || (!grpText.trim() && !grpFile)}>
                  {grpSending ? "…" : t("common.send")}
                </button>
              </form>
            </section>
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
            <input ref={grpPhotoRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
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
