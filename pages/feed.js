import { useEffect, useState, useCallback, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { isOfflineDev, supabase } from "../lib/supabaseClient";
import { displayName, timeAgo } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import { notifyXPChanged } from "../lib/xpEvents";
import { optimizeFeedImage } from "../lib/imageCompression";
import {
  TEXT_LIMITS,
  clientRateLimit,
  safeStoragePath,
  trimmedText,
  uploadErrorMessage,
  validateFinalUploadFile,
  validateUploadFile,
  storagePathFromReference,
} from "../lib/security";
import LevelPill from "../components/LevelPill";
import EmptyState from "../components/EmptyState";
import FeedPhoto from "../components/FeedPhoto";
import { SkeletonRow, SkeletonBar } from "../components/Skeleton";
import { playSensoryCue } from "../lib/sensoryFeedback";

const DEFAULT_REACTION_EMOJI = "👍";
const LEGACY_FALLBACK_EMOJI = "♥";
const EMOJI_REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "👏", "😮", "😢", "🤯", "💪", "✅"];
const TEXT_ONLY_ACTIVITY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const AUTO_SHARE_STORAGE_KEY = "bt_social_auto_share_v1";
const DEFAULT_AUTO_SHARE = {
  session_completed: true,
  goal_completed: true,
  record: true,
  level_up: true,
  streak: true,
};

function isTextOnlyActivity(post) {
  return !post.image_url || post.image_url === TEXT_ONLY_ACTIVITY_IMAGE;
}

function splitGraphemes(value) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), s => s.segment);
  }
  return Array.from(value);
}

function normalizeEmojiReaction(value) {
  const trimmed = String(value || "").trim();
  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length !== 1) return "";
  const emoji = graphemes[0];
  if (!/\p{Extended_Pictographic}/u.test(emoji)) return "";
  if (/[A-Za-z0-9]/.test(emoji)) return "";
  return emoji;
}

// ── Icônes ───────────────────────────────────────────────────
// Même jeu que le reste de l'app : grille 24, tracé 1,9, 18 px par défaut.
// Elles étaient jusqu'ici écrites à la main dans le JSX, chacune avec sa
// taille et son épaisseur — trois épaisseurs différentes dans une seule carte.
function Glyph({ size = 18, style, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {children}
    </svg>
  );
}
const IconCamera = () => <Glyph><path d="M21.4 18.6a2.2 2.2 0 0 1-2.2 2.2H4.8a2.2 2.2 0 0 1-2.2-2.2V8.8a2.2 2.2 0 0 1 2.2-2.2h3l1.6-2.8h5.2l1.6 2.8h3a2.2 2.2 0 0 1 2.2 2.2Z"/><circle cx="12" cy="13.4" r="3.4"/></Glyph>;
const IconCheck = () => <Glyph><path d="m5 12.8 4.4 4.4L19 7.6"/></Glyph>;
const IconGlobe = () => <Glyph size={14}><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4a13.4 13.4 0 0 1 0 17.2 13.4 13.4 0 0 1 0-17.2Z"/></Glyph>;
const IconFriends = () => <Glyph size={14}><circle cx="9.4" cy="8.4" r="3.8"/><path d="M2.6 19.6a6.8 6.8 0 0 1 13.6 0"/><path d="M16.4 5.2a3.8 3.8 0 0 1 0 6.4M18 14a6.8 6.8 0 0 1 3.4 5.2"/></Glyph>;
const IconSliders = () => <Glyph size={16}><path d="M4.4 21v-6.2M4.4 10.6V3M12 21v-8.6M12 8.2V3M19.6 21v-4.6M19.6 12.2V3"/><path d="M2 14.8h4.8M9.6 12.4h4.8M17.2 16.4H22"/></Glyph>;
const IconChevronDown = ({ open }) => (
  <Glyph size={17} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s cubic-bezier(0.22,1,0.36,1)" }}>
    <path d="m6.6 9.4 5.4 5.2 5.4-5.2"/>
  </Glyph>
);
const IconPencil = () => <Glyph size={16}><path d="M16.6 3.4a2.7 2.7 0 0 1 3.8 3.8L7.6 20 2.8 21.2 4 16.4Z"/></Glyph>;
const IconTrash = () => <Glyph size={16}><path d="M3.8 6.2h16.4"/><path d="M18.4 6.2 17.3 20a1.6 1.6 0 0 1-1.6 1.4H8.3A1.6 1.6 0 0 1 6.7 20L5.6 6.2"/><path d="M10 10.6v6.2M14 10.6v6.2"/><path d="M9.2 6.2V4.4a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.8"/></Glyph>;
const IconClose = () => <Glyph size={14}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8"/></Glyph>;
// Ajouter une réaction : un visage souriant marqué d'un plus. Le rond en
// pointillé qui servait avant se lisait comme un emplacement vide, pas comme
// un bouton — et il en apparaissait un sur chaque post du fil.
const IconAddReaction = () => (
  <Glyph size={17}>
    <path d="M20.6 11.2a8.6 8.6 0 1 1-7.8-7.76"/>
    <path d="M8.6 14.2a4.6 4.6 0 0 0 6.8 0"/>
    <path d="M9 9.4h.01M15 9.4h.01"/>
    <path d="M18.4 2.6v4.8M21 5h-5.2"/>
  </Glyph>
);

export default function Feed() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const { markSeen } = useNotifications();
  const { t, lang } = useI18n();
  const [posts, setPosts]               = useState([]);
  // `posts` démarre vide : l'état « aucun post » s'affichait donc PENDANT le
  // chargement, on voyait « rien à voir » clignoter avant l'arrivée du feed.
  const [feedLoaded, setFeedLoaded]     = useState(false);
  const [profiles, setProfiles]         = useState({});
  const [authorLevels, setAuthorLevels] = useState({});
  const [caption, setCaption]           = useState("");
  const [file, setFile]                 = useState(null);
  const [visibility, setVisibility]     = useState("public");
  const [busy, setBusy]                 = useState(false);
  const [commentDraft, setCommentDraft] = useState({});
  const [emojiInputOpen, setEmojiInputOpen] = useState({});
  const [reactionError, setReactionError] = useState({});
  const [viewUserId, setViewUserId]     = useState(null);
  const [formOpen, setFormOpen]         = useState(false);
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  const [autoShare, setAutoShare] = useState(DEFAULT_AUTO_SHARE);
  const fileInputRef  = useRef(null);
  const pressTimerRef = useRef(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editCaption,   setEditCaption]   = useState("");
  const [reactorsPanel, setReactorsPanel] = useState(null);
  const [captionOpen, setCaptionOpen]   = useState({}); // légendes longues dépliées
  const [revealedPhotos, setRevealedPhotos] = useState({});
  const [signedPostUrls, setSignedPostUrls] = useState({});
  const [signingPhotos, setSigningPhotos] = useState({});

  function openProfile(userId) {
    if (userId === user.id) return;
    setViewUserId(userId);
  }

  const load = useCallback(async () => {
    if (!user) return;
    // Load my friend IDs to filter friends-only posts
    const { data: friendLinks } = await supabase
      .from("friendships")
      .select("requester, addressee")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
      .eq("status", "accepted");
    const myFriendIds = new Set(
      (friendLinks || []).map(l => l.requester === user.id ? l.addressee : l.requester)
    );

    // Filtre côté Supabase : seulement les posts des dernières 24h
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: p } = await supabase
      .from("posts")
      .select("*, likes(*), comments(*)")
      .gte("created_at", cutoff24h)
      .order("created_at", { ascending: false })
      .limit(20);

    // Filter: public posts + my own posts + friends-only from friends
    const visible = (p || []).filter(post =>
      post.visibility === "public" ||
      post.user_id === user.id ||
      (post.visibility === "friends" && myFriendIds.has(post.user_id))
    );

    // Filet : PostgREST renvoie toujours un tableau pour une relation imbriquee,
    // mais si `likes` ou `comments` manquait, `post.likes.find(...)` faisait
    // planter TOUTE la page en ecran blanc. Un post sans reaction vaut mieux
    // qu'un feed mort.
    setPosts(visible.map(post => ({
      ...post,
      likes: Array.isArray(post.likes) ? post.likes : [],
      comments: Array.isArray(post.comments) ? post.comments : [],
    })));

    const ids = new Set();
    visible.forEach((post) => {
      ids.add(post.user_id);
      (post.comments || []).forEach((c) => ids.add(c.user_id));
      (post.likes || []).forEach((l) => ids.add(l.user_id));
    });
    if (ids.size) {
      const idsArr = [...ids];
      const [{ data: profs }, levelMap] = await Promise.all([
        supabase.from("profiles")
          .select("id, pseudo, first_name, last_name, avatar_url")
          .in("id", idsArr),
        loadUserLevelMap(supabase, idsArr, { selfUserId: user.id }),
      ]);
      const map = {};
      (profs || []).forEach((pr) => (map[pr.id] = pr));
      setProfiles(map);
      const lvls = {};
      Object.entries(levelMap).forEach(([uid, info]) => {
        if (Number(info.totalXP) > 0) lvls[uid] = info.current.level;
      });
      setAuthorLevels(lvls);
    } else {
      setProfiles({});
      setAuthorLevels({});
    }
    setFeedLoaded(true);
  }, [user]);

  useEffect(() => {
    load();
    markSeen("feed");
  }, [load, markSeen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(AUTO_SHARE_STORAGE_KEY);
      if (saved) setAutoShare({ ...DEFAULT_AUTO_SHARE, ...JSON.parse(saved) });
    } catch {
      setAutoShare(DEFAULT_AUTO_SHARE);
    }
  }, []);

  function toggleAutoShare(key) {
    setAutoShare((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_SHARE_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  async function createPost(e) {
    e.preventDefault();
    if (!file && !caption.trim()) return;
    const action = clientRateLimit(`feed:create:${user.id}`, 4, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return; }
    setBusy(true);
    let imageUrl = TEXT_ONLY_ACTIVITY_IMAGE;
    const cleanCaption = trimmedText(caption, TEXT_LIMITS.postCaption);
    if (file) {
      const precheck = validateUploadFile(file, "postImage");
      if (!precheck.ok) { setBusy(false); alert(uploadErrorMessage(t, precheck)); return; }
      let uploadFile = file;
      try {
        const optimized = await optimizeFeedImage(file);
        uploadFile = optimized.file || file;
      } catch (err) {
        console.warn("Image compression failed, uploading original:", err);
      }
      const finalCheck = validateFinalUploadFile(uploadFile, "postImage");
      if (!finalCheck.ok) { setBusy(false); alert(uploadErrorMessage(t, finalCheck)); return; }
      const pathInfo = safeStoragePath(user.id, uploadFile, [], "postImage");
      if (!pathInfo.ok) { setBusy(false); alert(uploadErrorMessage(t, pathInfo)); return; }
      const { error: upErr } = await supabase.storage
        .from("posts")
        .upload(pathInfo.path, uploadFile, { upsert: false, cacheControl: "31536000", contentType: pathInfo.contentType });
      if (upErr) { setBusy(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      imageUrl = `posts:${pathInfo.path}`;
    }
    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      image_url: imageUrl,
      caption: cleanCaption || null,
      visibility,
    });
    if (!error) {
      playSensoryCue("share");
      notifyXPChanged();
    }
    setCaption("");
    setFile(null);
    setVisibility("public");
    setBusy(false);
    setFormOpen(false);
    load();
  }

  // Mise à jour OPTIMISTE (egress) : au lieu de recharger tout le feed après
  // chaque action, on patche l'état local ; en cas d'erreur, on retombe sur un
  // load() complet (rollback fiable).
  const patchPostLikes = (postId, fn) =>
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: fn(p.likes || []) } : p));

  async function react(post, emoji) {
    const action = clientRateLimit(`feed:react:${user.id}`, 40, 60_000);
    if (!action.ok) return;
    const normalizedEmoji = normalizeEmojiReaction(emoji);
    const mine = post.likes.find((l) => l.user_id === user.id);

    if (!normalizedEmoji) {
      if (mine && mine.emoji === emoji) {
        patchPostLikes(post.id, likes => likes.filter(l => l.id !== mine.id));
        const { error } = await supabase.from("likes").delete().eq("id", mine.id);
        if (error) { console.error("Failed to remove legacy reaction:", error); load(); }
        return;
      }
      setReactionError((errors) => ({ ...errors, [post.id]: t("feed.emojiOnly") }));
      return;
    }

    setReactionError((errors) => ({ ...errors, [post.id]: "" }));
    setEmojiInputOpen(s => ({ ...s, [post.id]: false }));
    if (mine && mine.emoji === normalizedEmoji) {
      patchPostLikes(post.id, likes => likes.filter(l => l.id !== mine.id));
      const { error } = await supabase.from("likes").delete().eq("id", mine.id);
      if (error) { console.error("Failed to remove reaction:", error); load(); }
    } else if (mine) {
      patchPostLikes(post.id, likes => likes.map(l => l.id === mine.id ? { ...l, emoji: normalizedEmoji } : l));
      const { error } = await supabase.from("likes").update({ emoji: normalizedEmoji }).eq("id", mine.id);
      if (error) { console.error("Failed to update reaction:", error); load(); }
    } else {
      const { data, error } = await supabase.from("likes")
        .insert({ post_id: post.id, user_id: user.id, emoji: normalizedEmoji }).select().single();
      if (error) { console.error("Failed to add reaction:", error); load(); return; }
      patchPostLikes(post.id, likes => [...likes.filter(l => l.user_id !== user.id), data]);
      notifyXPChanged();
    }
  }

  async function addComment(post) {
    const text = trimmedText(commentDraft[post.id], TEXT_LIMITS.comment);
    if (!text) return;
    const action = clientRateLimit(`feed:comment:${user.id}`, 12, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return; }
    const { data, error } = await supabase.from("comments")
      .insert({ post_id: post.id, user_id: user.id, content: text }).select().single();
    if (error) {
      // Échec : on GARDE le brouillon pour réessayer, au lieu de l'effacer.
      alert(t("toast.genericError"));
      return;
    }
    notifyXPChanged();
    setCommentDraft((d) => ({ ...d, [post.id]: "" }));
    if (data) setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comments: [...(p.comments || []), data] } : p));
  }

  async function deletePost(id) {
    const prev = posts;
    setPosts(p => p.filter(x => x.id !== id));
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) setPosts(prev); // rollback
  }

  async function deleteComment(commentId) {
    setPosts(prev => prev.map(p => ({ ...p, comments: (p.comments || []).filter(c => c.id !== commentId) })));
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) load();
  }

  async function updatePost(postId, newCaption) {
    const caption = newCaption.trim() || null;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, caption } : p));
    setEditingPostId(null);
    setEditCaption("");
    const { error } = await supabase.from("posts").update({ caption }).eq("id", postId);
    if (error) load();
  }

  function handlePressStart(postId) {
    pressTimerRef.current = setTimeout(() => setReactorsPanel(postId), 600);
  }

  function handlePressEnd() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  async function revealPostPhoto(post) {
    const path = storagePathFromReference(post.image_url, "posts");
    if (!path) {
      alert(t("toast.genericError"));
      return;
    }

    if (isOfflineDev) {
      setSignedPostUrls((current) => ({
        ...current,
        [post.id]: `/offline-upload/posts/${path}`,
      }));
      setRevealedPhotos((current) => ({ ...current, [post.id]: true }));
      return;
    }

    setSigningPhotos((current) => ({ ...current, [post.id]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Missing session");

      const response = await fetch("/api/storage/sign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bucket: "posts", ref: post.image_url }),
      });
      if (!response.ok) throw new Error("Could not sign post image");
      const body = await response.json();
      if (!body?.signedUrl) throw new Error("Missing signed URL");

      setSignedPostUrls((current) => ({ ...current, [post.id]: body.signedUrl }));
      setRevealedPhotos((current) => ({ ...current, [post.id]: true }));
    } catch {
      alert(t("toast.genericError"));
    } finally {
      setSigningPhotos((current) => ({ ...current, [post.id]: false }));
    }
  }

  // Repli sur son propre profil (useAuth) : un commentaire/réaction ajouté en
  // optimiste s'affiche avec son nom/avatar même si `profiles` ne l'a pas encore.
  const who = (id) => profiles[id] || (id === user?.id && profile ? profile : null) || { pseudo: "?", avatar_url: null };

  return (
    <Layout>
      <div className="bt-stagger" style={{ maxWidth: 680, margin: "0 auto" }}>
        <h1 className="bt-page-title">{t("feed.title")}</h1>
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--bt-text-2)" }}>{t("feed.subtitle")}</p>

        {/* ── Composer ─────────────────────────────────────────
            Replié, il ne demande qu'une chose : est-ce que j'ai envie de
            poster ? Tout le reste — photo, visibilité, aide — n'apparaît
            qu'une fois qu'on a répondu oui. */}
        {!formOpen ? (
          <button type="button" onClick={() => setFormOpen(true)}
            className="card mb-3 flex w-full items-center gap-3 p-3 text-left transition-colors"
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
            <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={38} />
            <span className="flex-1 select-none rounded-full px-4 py-2.5 text-sm"
              style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
              {t("feed.postPrompt")}
            </span>
            <span className="shrink-0 pr-1" style={{ color: "var(--bt-text-3)" }}>
              <IconCamera />
            </span>
          </button>
        ) : (
          <form onSubmit={createPost} className="card mb-3 space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="bt-section-title">{t("feed.title")}</p>
              <button type="button"
                onClick={() => { setFormOpen(false); setFile(null); setCaption(""); setVisibility("public"); }}
                className="text-xs transition-colors"
                style={{ color: "var(--bt-text-3)" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-1)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
                {t("feed.collapseForm")}
              </button>
            </div>

            {/* Le pointillé disait « zone de dépôt vide » alors que c'est un
                bouton : une surface en creux dit « appuie ici » sans crier. */}
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors"
              style={file
                ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", boxShadow: "inset 0 0 0 1px var(--bt-accent-border)" }
                : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", boxShadow: "inset 0 0 0 1px var(--bt-hairline)" }}>
              {file ? <IconCheck /> : <IconCamera />}
              <span className="truncate">{file ? file.name : t("feed.choosePhoto")}</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <input className="input" placeholder={t("feed.caption")}
              maxLength={TEXT_LIMITS.postCaption}
              value={caption} onChange={(e) => setCaption(e.target.value)} />

            <div className="flex gap-2">
              {[
                { val: "public", label: t("feed.everyone"), icon: <IconGlobe /> },
                { val: "friends", label: t("feed.myFriends"), icon: <IconFriends /> },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setVisibility(opt.val)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-all"
                  style={visibility === opt.val
                    ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", boxShadow: "inset 0 0 0 1px var(--bt-accent-border)" }
                    : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>

            <button className="btn-primary w-full" disabled={busy || (!file && !caption.trim())}>
              {busy ? t("feed.publishing") : t("feed.publish")}
            </button>
            <p className="text-center text-xs" style={{ color: "var(--bt-text-3)" }}>
              {t("feed.storyHint")}
            </p>
          </form>
        )}

        {/* ── Partage automatique ──────────────────────────────
            C'était une carte pleine largeur posée en permanence entre le
            composer et le premier post, pour un réglage qu'on ouvre au plus
            une fois. Réduit à une bande discrète : toujours accessible,
            jamais dans le passage. */}
        <div className="mb-6 overflow-hidden rounded-2xl" style={{ backgroundColor: "var(--bt-subtle)" }}>
          <button type="button" onClick={() => setShowAutoSettings(v => !v)}
            aria-expanded={showAutoSettings}
            className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <span className="shrink-0" style={{ color: "var(--bt-text-3)" }}><IconSliders /></span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--bt-text-2)" }}>
              {t("feed.autoShareTitle")}
            </span>
            <span className="shrink-0" style={{ color: "var(--bt-text-3)" }}>
              <IconChevronDown open={showAutoSettings} />
            </span>
          </button>
          {showAutoSettings && (
            <div className="px-4 pb-4">
              <p className="mb-3 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("feed.autoShareSubtitle")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["session_completed", t("feed.autoSession")],
                  ["goal_completed", t("feed.autoGoal")],
                  ["record", t("feed.autoRecord")],
                  ["level_up", t("feed.autoLevel")],
                  ["streak", t("feed.autoStreak")],
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => toggleAutoShare(key)}
                    role="switch" aria-checked={!!autoShare[key]}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm"
                    style={{ backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)" }}>
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors"
                      style={{ backgroundColor: autoShare[key] ? "var(--bt-accent)" : "var(--bt-border)" }}>
                      <span className="block h-4 w-4 rounded-full bg-white transition-transform"
                        style={{ transform: autoShare[key] ? "translateX(16px)" : "translateX(0)" }} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Pendant le chargement : des squelettes à la forme d'un post, pas
              l'état vide. L'état « rien à voir » ne s'affiche que lorsqu'on SAIT
              qu'il n'y a rien. */}
          {!feedLoaded && (
            <div aria-hidden="true" className="space-y-4">
              {[0, 1].map(i => (
                <div key={i} className="card p-4">
                  <SkeletonRow avatar={40} lines={2} />
                  <SkeletonBar height={180} className="mt-4 rounded-2xl" />
                  <div className="mt-3 flex gap-2">
                    <SkeletonBar width={72} height={30} />
                    <SkeletonBar width={72} height={30} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {feedLoaded && posts.length === 0 && (
            <div className="card">
              <EmptyState
                illustration="feed"
                title={t("feed.emptyTitle")}
                subtitle={t("feed.emptyRecent")}
                coachMessage={t("coach.empty.feed")}
                coachId="feed-empty"
              />
            </div>
          )}
          {posts.map((post) => {
            const author = who(post.user_id);
            const myReaction = post.likes.find((l) => l.user_id === user.id)?.emoji;
            const counts = post.likes.reduce((acc, l) => {
              const e = l.emoji || LEGACY_FALLBACK_EMOJI;
              acc[e] = (acc[e] || 0) + 1;
              return acc;
            }, {});
            const sortedEmojis = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([e]) => e);
            const otherEmojis = sortedEmojis.filter((emoji) => emoji !== DEFAULT_REACTION_EMOJI);
            const postImageUrl = signedPostUrls[post.id] || "";
            const mine = post.user_id === user.id;
            const hasPhoto = !isTextOnlyActivity(post);
            return (
              <article key={post.id} className="card overflow-hidden">
                {/* En-tête : une ligne pour la personne, une ligne pour le
                    contexte. L'ancienne version empilait nom, niveau, pseudo,
                    pastille de visibilité et heure — jusqu'à trois lignes de
                    métadonnées pour un seul auteur, avec l'avatar tout seul
                    dans le vide à gauche. */}
                <div className="flex items-start gap-3 px-4 pt-4">
                  <button onClick={() => openProfile(post.user_id)} className="shrink-0" aria-label={displayName(author)}>
                    <Avatar url={author.avatar_url} pseudo={displayName(author)} size={40} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => openProfile(post.user_id)}
                      className="flex min-w-0 max-w-full items-center gap-1.5 text-left">
                      <span className="truncate text-[15px] font-semibold" style={{ color: "var(--bt-text-1)" }}>
                        {displayName(author)}
                      </span>
                      {authorLevels[post.user_id] && <LevelPill level={authorLevels[post.user_id]} />}
                    </button>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs" style={{ color: "var(--bt-text-3)" }}>
                      <span className="truncate">@{author.pseudo}</span>
                      <span aria-hidden="true">·</span>
                      <span>{timeAgo(post.created_at, lang)}</span>
                      {/* Seul « amis uniquement » est signalé. « Public » est
                          l'état par défaut : l'annoncer sur chaque post ajoutait
                          une pastille colorée par carte pour zéro information. */}
                      {post.visibility === "friends" && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1" style={{ color: "var(--bt-accent-text)" }}>
                            <IconFriends />{t("feed.friendsBadge")}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {(mine || isAdmin) && (
                    <div className="flex shrink-0 items-center gap-1" aria-label={t("feed.postActions")}>
                      {mine && (
                        <button type="button" title={t("feed.editPost")} aria-label={t("feed.editPost")}
                          onClick={() => { setEditingPostId(post.id); setEditCaption(post.caption || ""); }}
                          className="bt-feed-icon-btn">
                          <IconPencil />
                        </button>
                      )}
                      <button type="button" title={t("common.remove")} aria-label={t("common.remove")}
                        onClick={() => deletePost(post.id)}
                        className="bt-feed-icon-btn bt-feed-icon-btn--danger">
                        <IconTrash />
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline caption editor (own posts only) */}
                {editingPostId === post.id && (
                  <div className="space-y-2 px-4 pt-3">
                    <input
                      className="input"
                      placeholder={t("feed.editCaption")}
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter")  updatePost(post.id, editCaption);
                        if (e.key === "Escape") setEditingPostId(null);
                      }}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => updatePost(post.id, editCaption)} className="btn-primary flex-1 py-2 text-sm">
                        {t("feed.saveEdit")}
                      </button>
                      <button onClick={() => setEditingPostId(null)} className="btn-ghost py-2 text-sm">
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {hasPhoto ? (
                  /* La photo se charge seule quand le post approche de l'ecran
                     (cf. components/FeedPhoto.js) : plus de bouton « voir la
                     photo », mais on ne paie toujours que ce qui est vu. */
                  <div className="mt-3">
                    <FeedPhoto
                      post={post}
                      url={postImageUrl}
                      signing={!!signingPhotos[post.id]}
                      onNeedsUrl={revealPostPhoto}
                      alt={post.caption || t("feed.photoAlt")}
                      /* Double-tap = reaction par defaut, le geste attendu sur un
                         feed. Ne fait rien si on a deja reagi : un double-tap ne
                         doit jamais RETIRER une reaction par accident. */
                      onDoubleTapLike={myReaction ? undefined : (pst) => react(pst, DEFAULT_REACTION_EMOJI)}
                    />
                  </div>
                ) : (
                  /* Un post sans photo est un post de TEXTE, pas une « activité »
                     générée par l'app : le bandeau menthe « ACTIVITÉ » étiquetait
                     ainsi les mots de l'utilisateur comme s'ils venaient du
                     système. Le texte devient le corps de la carte, en grand —
                     c'est ce qui donne sa présence à un post sans image. */
                  <p className="px-4 pt-3 text-[17px] leading-snug" style={{ color: "var(--bt-text-1)" }}>
                    {post.caption || t("feed.activityFallback")}
                  </p>
                )}

                <div className="space-y-3 p-4">
                  {/* Reactions - long-press (600ms) opens the reactors panel */}
                  <div className="flex flex-wrap items-center gap-1.5"
                    onPointerDown={() => handlePressStart(post.id)}
                    onPointerUp={handlePressEnd}
                    onPointerLeave={handlePressEnd}>
                    {[DEFAULT_REACTION_EMOJI, ...otherEmojis].map((emoji) => {
                      const n = counts[emoji] || 0;
                      const active = myReaction === emoji;
                      return (
                        <button key={emoji} type="button" onClick={() => react(post, emoji)}
                          className={`bt-feed-reaction${active ? " bt-feed-reaction--on" : ""}`}
                          title={emoji === DEFAULT_REACTION_EMOJI ? t("feed.likeReaction") : undefined}
                          aria-label={emoji === DEFAULT_REACTION_EMOJI ? t("feed.likeReaction") : `${t("feed.addReaction")} ${emoji}`}
                          aria-pressed={active}>
                          <span style={{ color: emoji === LEGACY_FALLBACK_EMOJI ? "var(--bt-danger-solid)" : undefined }}>{emoji}</span>
                          {n > 0 && <span className="font-num text-xs font-semibold tabular-nums">{n}</span>}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setEmojiInputOpen(s => ({ ...s, [post.id]: !s[post.id] }));
                        setReactionError(errors => ({ ...errors, [post.id]: "" }));
                      }}
                      className="bt-feed-reaction bt-feed-reaction--add"
                      title={t("feed.addReaction")}
                      aria-label={t("feed.addReaction")}
                      aria-expanded={!!emojiInputOpen[post.id]}>
                      <IconAddReaction />
                    </button>

                    {emojiInputOpen[post.id] && (
                      <div className="flex flex-wrap items-center gap-1 rounded-2xl px-2 py-1.5"
                        style={{ backgroundColor: "var(--bt-subtle)" }}>
                        {EMOJI_REACTION_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => react(post, emoji)}
                            className="flex items-center justify-center rounded-full transition-colors"
                            style={{
                              width: 32,
                              height: 32,
                              fontSize: 17,
                              backgroundColor: myReaction === emoji ? "var(--bt-accent-bg)" : "transparent",
                            }}
                            aria-label={`${t("feed.addReaction")} ${emoji}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {reactionError[post.id] && (
                    <p className="-mt-1 text-xs" style={{ color: "var(--bt-danger)" }}>
                      {reactionError[post.id]}
                    </p>
                  )}

                  {/* Qui a réagi. Sans les émojis : ils sont déjà comptés dans
                      les pastilles juste au-dessus, et les répéter ligne par
                      ligne donnait deux fois la même information dans deux
                      formats différents. Ici on ne garde que ce que les
                      pastilles ne disent pas — les noms. */}
                  {post.likes.length > 0 && (() => {
                    const named = post.likes.map(l => profiles[l.user_id]).filter(Boolean);
                    if (!named.length) return null;
                    const shown = named.slice(0, 3).map(p => displayName(p));
                    const extra = named.length - shown.length;
                    const names = extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
                    return (
                      <button type="button" onClick={() => setReactorsPanel(post.id)}
                        className="-mt-1 block max-w-full truncate text-left text-xs transition-colors"
                        style={{ color: "var(--bt-text-3)" }}>
                        {t("feed.reactedBy").replace("{names}", names)}
                      </button>
                    );
                  })()}

                  {/* Legende — repliee au-dela de 3 lignes, comme sur un vrai
                      feed : une longue legende ne doit pas pousser les reactions
                      et les commentaires hors de l'ecran. Purement local, aucun
                      appel reseau. */}
                  {post.caption && hasPhoto && (
                    <div>
                      <p className="text-sm" style={{ color: "var(--bt-text-1)" }}>
                        <span
                          style={captionOpen[post.id] ? undefined : {
                            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                          }}>
                          <span className="font-semibold">{displayName(author)}</span>{" "}{post.caption}
                        </span>
                      </p>
                      {post.caption.length > 120 && (
                        <button
                          type="button"
                          onClick={() => setCaptionOpen(c => ({ ...c, [post.id]: !c[post.id] }))}
                          className="mt-0.5 text-xs font-semibold"
                          style={{ color: "var(--bt-text-3)" }}>
                          {captionOpen[post.id] ? t("feed.captionLess") : t("feed.captionMore")}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Comments — with delete button for own comments */}
                  {post.comments.length > 0 && (
                    <ul className="space-y-1.5">
                      {post.comments
                        .slice()
                        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                        .map((c) => (
                          <li key={c.id} className="flex items-start gap-1.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <button onClick={() => openProfile(c.user_id)}
                                className="font-semibold hover:underline"
                                style={{ color: "var(--bt-text-1)" }}>
                                {displayName(who(c.user_id))}
                              </button>{" "}
                              <span style={{ color: "var(--bt-text-2)" }}>{c.content}</span>
                            </div>
                            {(c.user_id === user.id || isAdmin) && (
                              /* Le bouton n'apparaissait qu'au SURVOL : sur
                                 téléphone, où il n'y a pas de survol, on ne
                                 pouvait donc jamais supprimer son commentaire.
                                 Il est maintenant toujours là, en retrait. */
                              <button
                                onClick={() => deleteComment(c.id)}
                                title={t("feed.deleteComment")}
                                aria-label={t("feed.deleteComment")}
                                className="bt-feed-icon-btn bt-feed-icon-btn--danger shrink-0">
                                <IconClose />
                              </button>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}

                  {/* Comment input */}
                  <div className="flex items-center gap-2">
                    <input className="input" placeholder={t("feed.comment")}
                      maxLength={TEXT_LIMITS.comment}
                      value={commentDraft[post.id] || ""}
                      onChange={(e) => setCommentDraft((d) => ({ ...d, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addComment(post)} />
                    <button onClick={() => addComment(post)}
                      disabled={!(commentDraft[post.id] || "").trim()}
                      className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40"
                      style={{ color: "var(--bt-accent-dark)" }}>
                      {t("common.send")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* ── Reactors panel — long-press on reactions ────────────── */}
      {reactorsPanel && (() => {
        const rPost = posts.find(p => p.id === reactorsPanel);
        if (!rPost) return null;
        const groups = {};
        rPost.likes.forEach(l => {
          const e = l.emoji || LEGACY_FALLBACK_EMOJI;
          if (!groups[e]) groups[e] = [];
          groups[e].push(l);
        });
        const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
        return (
          <div
            className="fixed inset-0 z-50 flex items-end"
            style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }}
            onClick={() => setReactorsPanel(null)}>
            <div
              className="w-full overflow-y-auto rounded-t-[28px] p-5"
              style={{ backgroundColor: "var(--bt-surface)", maxHeight: "70vh", boxShadow: "var(--bt-elev-3)" }}
              onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-5 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
              <p className="bt-section-title mb-4">{t("feed.reactions")}</p>
              {sortedGroups.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>—</p>
              ) : sortedGroups.map(([emoji, likers]) => (
                <div key={emoji} className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xl" style={{ color: emoji === LEGACY_FALLBACK_EMOJI ? "var(--bt-danger-solid)" : undefined }}>{emoji}</span>
                    <span className="font-num text-xs font-semibold tabular-nums" style={{ color: "var(--bt-text-3)" }}>{likers.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {likers.map(l => {
                      const p = profiles[l.user_id];
                      if (!p) return null;
                      return (
                        <div key={l.id} className="flex items-center gap-3">
                          <Avatar url={p.avatar_url} pseudo={displayName(p)} size={32} />
                          <span className="text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
                            {displayName(p)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button onClick={() => setReactorsPanel(null)} className="btn-ghost mt-2 w-full">
                {t("common.close")}
              </button>
            </div>
          </div>
        );
      })()}

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
