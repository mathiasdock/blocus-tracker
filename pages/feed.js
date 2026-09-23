import { useEffect, useState, useCallback, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import ActivityTimeline from "../components/ActivityTimeline";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { isOfflineDev, supabase } from "../lib/supabaseClient";
import { displayName } from "../lib/format";
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
import { SkeletonRow } from "../components/Skeleton";
import Glyph from "../components/Glyph";
import { playSensoryCue } from "../lib/sensoryFeedback";
import { buildActivityTimeline, emptyStateKind } from "../lib/activityFeed.mjs";
import {
  AUTO_SHARE_EVENTS,
  DEFAULT_AUTO_SHARE,
  TEXT_ONLY_POST_IMAGE,
  loadAutoShare,
  writeAutoShare,
} from "../lib/autoShare";

// Activity — "what meaningful study happened around me?".
//
// Not a social feed: a timeline. Ordinary study is one quiet row (person,
// course, duration, time); an accomplishment is the product's own object
// (BadgeIcon, StreakEmblem, LevelSeal) and may interrupt. The grammar lives in
// lib/activityFeed.mjs, the drawing in components/ActivityTimeline.jsx; this
// page does the I/O and nothing else.

const CHEER_EMOJI = "👍";
const TEXT_ONLY_ACTIVITY_IMAGE = TEXT_ONLY_POST_IMAGE;

const IconCamera = () => <Glyph><path d="M21.4 18.6a2.2 2.2 0 0 1-2.2 2.2H4.8a2.2 2.2 0 0 1-2.2-2.2V8.8a2.2 2.2 0 0 1 2.2-2.2h3l1.6-2.8h5.2l1.6 2.8h3a2.2 2.2 0 0 1 2.2 2.2Z" /><circle cx="12" cy="13.4" r="3.4" /></Glyph>;
const IconCheck = () => <Glyph><path d="m5 12.8 4.4 4.4L19 7.6" /></Glyph>;

// One label per event lib/autoShare can actually publish: built from that list
// so an event added there without a label here cannot go unnoticed.
const AUTO_SHARE_LABEL_KEYS = {
  session_completed: "feed.autoSession",
  goal_completed: "feed.autoGoal",
  level_up: "feed.autoLevel",
  streak: "feed.autoStreak",
  badge_unlocked: "feed.autoBadge",
};

function hasPhotoRef(post) {
  return !!post.image_url && post.image_url !== TEXT_ONLY_ACTIVITY_IMAGE;
}

// The sharing choices. Three states, in order of how much room they deserve:
// an invitation of two lines while nothing is shared, the choices themselves
// once the student asks for them, and one quiet line afterwards. A setting one
// opens once must not own the first screen forever — and the timeline below
// must stay reachable without scrolling past a form.
function ShareSettings({ t, prefs, busy, error, onChange, open, onOpen, sharesSomething }) {
  if (!open) {
    return (
      <div className="bt-activity-share">
        {sharesSomething ? (
          <button type="button" className="bt-activity-quiet-btn" onClick={() => onOpen(true)}>
            {t("feed.shareOpen").replace("{n}", AUTO_SHARE_EVENTS.filter((key) => prefs[key]).length)}
          </button>
        ) : (
          <>
            <div className="bt-activity-share-head"><h2>{t("feed.shareTitle")}</h2></div>
            <p>{t("feed.shareInvite")}</p>
            <div className="bt-activity-share-actions">
              <button type="button" className="btn-secondary" onClick={() => onOpen(true)}>{t("feed.shareChoose")}</button>
            </div>
          </>
        )}
      </div>
    );
  }
  return (
    <section className="bt-activity-share" aria-labelledby="activity-share-title">
      <div className="bt-activity-share-head">
        <h2 id="activity-share-title">{t("feed.shareTitle")}</h2>
        <button type="button" className="bt-activity-quiet-btn" onClick={() => onOpen(false)}>{t("common.close")}</button>
      </div>
      <p>{t("feed.shareText")}</p>
      {error && <p role="alert">{t("feed.autoSaveError")}</p>}
      <div className="bt-activity-share-toggles">
        {AUTO_SHARE_EVENTS.map((key) => (
          <button key={key} type="button" role="switch" aria-checked={!!prefs[key]} disabled={busy}
            className="bt-activity-switch" onClick={() => onChange({ [key]: !prefs[key] })}>
            <span>{t(AUTO_SHARE_LABEL_KEYS[key])}</span>
            <span className="bt-activity-switch-track" aria-hidden="true"><span className="bt-activity-switch-knob" /></span>
          </button>
        ))}
      </div>
      <div className="bt-activity-audience">
        <span>{t("feed.autoShareVisibility")}</span>
        {["friends", "public"].map((value) => (
          <button key={value} type="button" disabled={busy} aria-pressed={prefs.visibility === value}
            onClick={() => onChange({ visibility: value })}>
            {t(value === "friends" ? "feed.myFriends" : "feed.everyone")}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Feed() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const { markSeen } = useNotifications();
  const { t, lang } = useI18n();
  const [posts, setPosts] = useState([]);
  const [blockedIds, setBlockedIds] = useState([]);
  // Three states, never two: "nothing to show" and "we could not load" are
  // different sentences, and the second one used to be told as the first.
  const [loadState, setLoadState] = useState("loading");
  const [profiles, setProfiles] = useState({});
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState(null);
  const [visibility, setVisibility] = useState("public");
  const [busy, setBusy] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [pending, setPending] = useState({});
  const [viewUserId, setViewUserId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [autoShare, setAutoShare] = useState(DEFAULT_AUTO_SHARE);
  const [autoBusy, setAutoBusy] = useState(true);
  const [autoError, setAutoError] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editCaption, setEditCaption] = useState("");
  const [signedPostUrls, setSignedPostUrls] = useState({});
  const [signingPhotos, setSigningPhotos] = useState({});
  const fileInputRef = useRef(null);

  const sharesSomething = AUTO_SHARE_EVENTS.some((key) => autoShare[key]);

  function openProfile(userId) {
    if (userId === user.id) return;
    setViewUserId(userId);
  }

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // Blocking: the server hides both directions (migration
      // 20260918120000_activity_blocks). The client can only ever read its OWN
      // blocks — a student is never told that someone blocked them — so this
      // query is the belt to the server's braces, not the rule itself.
      const [friendsResult, postsResult, blocksResult] = await Promise.all([
        supabase.from("friendships").select("requester, addressee")
          .or(`requester.eq.${user.id},addressee.eq.${user.id}`).eq("status", "accepted"),
        supabase.from("posts").select("*, likes(*), comments(*)")
          .gte("created_at", cutoff24h).order("created_at", { ascending: false }).limit(60),
        supabase.from("user_blocks").select("blocker_id, blocked_id")
          .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
      ]);
      if (postsResult.error) throw postsResult.error;
      if (blocksResult.error) throw blocksResult.error;

      const myFriendIds = new Set((friendsResult.data || [])
        .map((link) => (link.requester === user.id ? link.addressee : link.requester)));
      const blocked = (blocksResult.data || [])
        .map((row) => (row.blocker_id === user.id ? row.blocked_id : row.blocker_id));
      setBlockedIds(blocked);

      const visible = (postsResult.data || []).filter((post) =>
        post.visibility === "public"
        || post.user_id === user.id
        || (post.visibility === "friends" && myFriendIds.has(post.user_id)));

      const rows = visible.map((post) => ({
        ...post,
        likes: Array.isArray(post.likes) ? post.likes : [],
        comments: Array.isArray(post.comments) ? post.comments : [],
        hasPhoto: hasPhotoRef(post),
      }));
      setPosts(rows);

      const ids = new Set();
      rows.forEach((post) => {
        ids.add(post.user_id);
        post.comments.forEach((comment) => ids.add(comment.user_id));
      });
      if (ids.size) {
        // Explicit columns, never `*`: an e-mail must not leave the server for
        // somebody else's row.
        const { data: people } = await supabase.from("profiles")
          .select("id, pseudo, first_name, last_name, avatar_url").in("id", [...ids]);
        const map = {};
        (people || []).forEach((person) => { map[person.id] = person; });
        setProfiles(map);
      } else {
        setProfiles({});
      }
      setLoadState("ready");
    } catch (error) {
      console.error("Activity load failed:", error);
      setLoadState("error");
    }
  }, [user]);

  useEffect(() => {
    load();
    markSeen("feed");
    window.addEventListener("bt:auto-post-published", load);
    return () => window.removeEventListener("bt:auto-post-published", load);
  }, [load, markSeen]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    setAutoBusy(true);
    loadAutoShare(supabase, user.id)
      .then((prefs) => {
        if (!alive) return;
        setAutoShare(prefs);
      })
      .catch(() => { if (alive) setAutoError(true); })
      .finally(() => { if (alive) setAutoBusy(false); });
    return () => { alive = false; };
  }, [user?.id]);

  async function setAutoSharePref(patch) {
    if (autoBusy || !user?.id) return;
    setAutoBusy(true);
    setAutoError(false);
    try { setAutoShare(await writeAutoShare(supabase, user.id, patch)); }
    catch { setAutoError(true); }
    finally { setAutoBusy(false); }
  }

  async function createPost(event) {
    event.preventDefault();
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
      } catch (error) {
        console.warn("Image compression failed, uploading original:", error);
      }
      const finalCheck = validateFinalUploadFile(uploadFile, "postImage");
      if (!finalCheck.ok) { setBusy(false); alert(uploadErrorMessage(t, finalCheck)); return; }
      const pathInfo = safeStoragePath(user.id, uploadFile, [], "postImage");
      if (!pathInfo.ok) { setBusy(false); alert(uploadErrorMessage(t, pathInfo)); return; }
      const { error: upErr } = await supabase.storage.from("posts")
        .upload(pathInfo.path, uploadFile, { upsert: false, cacheControl: "31536000", contentType: pathInfo.contentType });
      if (upErr) { setBusy(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      imageUrl = `posts:${pathInfo.path}`;
    }
    const { error } = await supabase.from("posts").insert({
      user_id: user.id, image_url: imageUrl, caption: cleanCaption || null, visibility,
    });
    if (!error) playSensoryCue("share");
    setCaption("");
    setFile(null);
    setVisibility("public");
    setBusy(false);
    setFormOpen(false);
    load();
  }

  const patchLikes = (postId, fn) =>
    setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, likes: fn(post.likes || []) } : post)));

  // One encouragement, toggled. No picker, no long press, no double tap.
  async function encourage(post) {
    const action = clientRateLimit(`feed:react:${user.id}`, 40, 60_000);
    if (!action.ok) return;
    const mine = (post.likes || []).find((like) => like.user_id === user.id);
    setPending((state) => ({ ...state, [post.id]: true }));
    try {
      if (mine) {
        patchLikes(post.id, (likes) => likes.filter((like) => like.id !== mine.id));
        const { error } = await supabase.from("likes").delete().eq("id", mine.id);
        if (error) { console.error("Failed to remove encouragement:", error); load(); }
        return;
      }
      const { data, error } = await supabase.from("likes")
        .insert({ post_id: post.id, user_id: user.id, emoji: CHEER_EMOJI }).select().single();
      if (error) { console.error("Failed to add encouragement:", error); load(); return; }
      patchLikes(post.id, (likes) => [...likes.filter((like) => like.user_id !== user.id), data]);
    } finally {
      setPending((state) => ({ ...state, [post.id]: false }));
    }
  }

  async function sendComment(post) {
    const text = trimmedText(commentDrafts[post.id], TEXT_LIMITS.comment);
    if (!text) return;
    const action = clientRateLimit(`feed:comment:${user.id}`, 12, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return; }
    const { data, error } = await supabase.from("comments")
      .insert({ post_id: post.id, user_id: user.id, content: text }).select().single();
    // A failed comment KEEPS its draft: retyping it is the worst possible
    // answer to a lost connection.
    if (error) { alert(t("toast.genericError")); return; }
    setCommentDrafts((drafts) => ({ ...drafts, [post.id]: "" }));
    if (data) setPosts((prev) => prev.map((row) => (row.id === post.id ? { ...row, comments: [...(row.comments || []), data] } : row)));
  }

  // Supprimer SA publication reste une suppression directe. Un admin qui
  // retire celle de quelqu'un d'autre passe par la fonction tracée dans le
  // journal d'audit (v59) : la base n'accepte plus l'autre chemin.
  async function deletePost(id) {
    const target = posts.find((row) => row.id === id);
    const moderating = Boolean(target && target.user_id !== user.id);
    if (moderating && (!isAdmin || !window.confirm(t("feed.adminRemovePostConfirm")))) return;
    const previous = posts;
    setPosts((rows) => rows.filter((row) => row.id !== id));
    const { error } = moderating
      ? await supabase.rpc("admin_remove_post", { p_post_id: id })
      : await supabase.from("posts").delete().eq("id", id);
    if (error) { setPosts(previous); alert(t("toast.genericError")); }
  }

  async function deleteComment(commentId) {
    const comment = posts.flatMap((post) => post.comments || []).find((c) => c.id === commentId);
    const moderating = Boolean(comment && comment.user_id !== user.id);
    if (moderating && (!isAdmin || !window.confirm(t("feed.adminRemoveCommentConfirm")))) return;
    setPosts((prev) => prev.map((post) => ({ ...post, comments: (post.comments || []).filter((c) => c.id !== commentId) })));
    const { error } = moderating
      ? await supabase.rpc("admin_remove_comment", { p_comment_id: commentId })
      : await supabase.from("comments").delete().eq("id", commentId);
    if (error) { load(); alert(t("toast.genericError")); }
  }

  async function updatePost(postId, newCaption) {
    const next = newCaption.trim() || null;
    setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, caption: next } : post)));
    setEditingPostId(null);
    setEditCaption("");
    const { error } = await supabase.from("posts").update({ caption: next }).eq("id", postId);
    if (error) load();
  }

  async function revealPostPhoto(post) {
    const path = storagePathFromReference(post.image_url, "posts");
    if (!path) { alert(t("toast.genericError")); return; }
    if (isOfflineDev) {
      setSignedPostUrls((current) => ({ ...current, [post.id]: `/offline-upload/posts/${path}` }));
      return;
    }
    setSigningPhotos((current) => ({ ...current, [post.id]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Missing session");
      const response = await fetch("/api/storage/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bucket: "posts", ref: post.image_url }),
      });
      if (!response.ok) throw new Error("Could not sign post image");
      const body = await response.json();
      if (!body?.signedUrl) throw new Error("Missing signed URL");
      setSignedPostUrls((current) => ({ ...current, [post.id]: body.signedUrl }));
    } catch {
      alert(t("toast.genericError"));
    } finally {
      setSigningPhotos((current) => ({ ...current, [post.id]: false }));
    }
  }

  const items = buildActivityTimeline({ posts, blockedIds });
  const empty = emptyStateKind({ loadState, itemCount: items.length, sharesSomething });

  return (
    <Layout>
      <div className="bt-stagger bt-activity-page" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 className="sr-only">{t("feed.title")}</h1>

        {!formOpen ? (
          <button type="button" className="bt-activity-composer" onClick={() => setFormOpen(true)}>
            <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={34} />
            <span className="bt-activity-composer-copy">{t("feed.postPrompt")}</span>
            <span className="bt-activity-composer-icon" aria-hidden="true"><IconCamera /></span>
          </button>
        ) : (
          <form onSubmit={createPost} className="card mb-3 space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="bt-section-title">{t("feed.title")}</p>
              <button type="button" className="text-xs" style={{ color: "var(--bt-text-3)" }}
                onClick={() => { setFormOpen(false); setFile(null); setCaption(""); setVisibility("public"); }}>
                {t("feed.collapseForm")}
              </button>
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
              style={file
                ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", boxShadow: "inset 0 0 0 1px var(--bt-accent-border)" }
                : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", boxShadow: "inset 0 0 0 1px var(--bt-hairline)" }}>
              {file ? <IconCheck /> : <IconCamera />}
              <span className="truncate">{file ? file.name : t("feed.choosePhoto")}</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <input className="input" placeholder={t("feed.caption")} maxLength={TEXT_LIMITS.postCaption}
              value={caption} onChange={(event) => setCaption(event.target.value)} />
            <div className="flex gap-2">
              {["public", "friends"].map((value) => (
                <button key={value} type="button" onClick={() => setVisibility(value)}
                  className="flex flex-1 items-center justify-center rounded-xl py-2.5 text-xs font-semibold"
                  style={visibility === value
                    ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", boxShadow: "inset 0 0 0 1px var(--bt-accent-border)" }
                    : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
                  {t(value === "public" ? "feed.everyone" : "feed.myFriends")}
                </button>
              ))}
            </div>
            <button className="btn-primary w-full" disabled={busy || (!file && !caption.trim())}>
              {busy ? t("feed.publishing") : t("feed.publish")}
            </button>
          </form>
        )}

        <ShareSettings t={t} prefs={autoShare} busy={autoBusy} error={autoError} open={shareOpen}
          onOpen={setShareOpen} onChange={setAutoSharePref} sharesSomething={sharesSomething} />

        {editingPostId && (
          <div className="card mb-3 space-y-2 p-4">
            <input className="input" placeholder={t("feed.editCaption")} value={editCaption}
              onChange={(event) => setEditCaption(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") updatePost(editingPostId, editCaption);
                if (event.key === "Escape") setEditingPostId(null);
              }} />
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1 py-2 text-sm" onClick={() => updatePost(editingPostId, editCaption)}>
                {t("feed.saveEdit")}
              </button>
              <button type="button" className="btn-ghost py-2 text-sm" onClick={() => setEditingPostId(null)}>{t("common.cancel")}</button>
            </div>
          </div>
        )}

        {loadState === "loading" && (
          <div aria-hidden="true" className="space-y-4 pt-4">
            {[0, 1, 2].map((index) => <SkeletonRow key={index} avatar={34} lines={2} />)}
          </div>
        )}

        {empty === "error" && (
          <div className="bt-activity-note" role="alert">
            <h2>{t("feed.loadErrorTitle")}</h2>
            <p>{t("feed.loadErrorText")}</p>
            <div className="bt-activity-note-actions">
              <button type="button" className="btn-secondary" onClick={() => { setLoadState("loading"); load(); }}>
                {t("feed.retry")}
              </button>
            </div>
          </div>
        )}

        {empty === "quiet" && (
          <div className="bt-activity-note">
            <h2>{t("feed.quietTitle")}</h2>
            <p>{t("feed.quietText")}</p>
          </div>
        )}

        {empty === "offer" && (
          <div className="bt-activity-note">
            <h2>{t("feed.offerTitle")}</h2>
            <p>{t("feed.offerText")}</p>
          </div>
        )}

        {loadState !== "loading" && items.length > 0 && (
          <ActivityTimeline
            items={items} t={t} lang={lang} user={user} isAdmin={isAdmin} profiles={profiles}
            photoUrls={signedPostUrls} signingPhotos={signingPhotos} pending={pending}
            onOpenProfile={openProfile} onEncourage={encourage} onRevealPhoto={revealPostPhoto}
            onDeletePost={deletePost} onEditPost={(post) => { setEditingPostId(post.id); setEditCaption(post.caption || ""); }}
            commentDrafts={commentDrafts}
            onCommentDraft={(postId, value) => setCommentDrafts((drafts) => ({ ...drafts, [postId]: value }))}
            onSendComment={sendComment} onDeleteComment={deleteComment}
          />
        )}
      </div>

      {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
    </Layout>
  );
}
