import { useEffect, useState, useCallback, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, timeAgo } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import { notifyXPChanged } from "../lib/xpEvents";
import { optimizeFeedImage } from "../lib/imageCompression";
import LevelPill from "../components/LevelPill";

const DEFAULT_REACTION_EMOJI = "👍";
const LEGACY_FALLBACK_EMOJI = "♥";
const EMOJI_REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "👏", "😮", "😢", "🤯", "💪", "✅"];

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

export default function Feed() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const { markSeen } = useNotifications();
  const { t, lang } = useI18n();
  const [posts, setPosts]               = useState([]);
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
  const fileInputRef  = useRef(null);
  const pressTimerRef = useRef(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editCaption,   setEditCaption]   = useState("");
  const [reactorsPanel, setReactorsPanel] = useState(null);

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

    setPosts(visible);

    const ids = new Set();
    visible.forEach((post) => {
      ids.add(post.user_id);
      post.comments.forEach((c) => ids.add(c.user_id));
      post.likes.forEach((l) => ids.add(l.user_id));
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
  }, [user?.id]);

  useEffect(() => {
    load();
    markSeen("feed");
  }, [load, markSeen]);

  async function createPost(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    let uploadFile = file;
    let ext = file.name.split(".").pop() || "jpg";
    try {
      const optimized = await optimizeFeedImage(file);
      uploadFile = optimized.file || file;
      ext = optimized.extension || ext;
    } catch (err) {
      console.warn("Image compression failed, uploading original:", err);
    }
    const path = `${user.id}/${Date.now()}.${ext.toLowerCase()}`;
    const { error: upErr } = await supabase.storage
      .from("posts")
      .upload(path, uploadFile, { upsert: false, cacheControl: "31536000", contentType: uploadFile.type || file.type });
    if (upErr) { setBusy(false); alert("Échec de l'upload : " + upErr.message); return; }
    const { data: pub } = supabase.storage.from("posts").getPublicUrl(path);
    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      image_url: pub.publicUrl,
      caption: caption.trim() || null,
      visibility,
    });
    if (!error) notifyXPChanged();
    setCaption("");
    setFile(null);
    setVisibility("public");
    setBusy(false);
    setFormOpen(false);
    load();
  }

  async function react(post, emoji) {
    const normalizedEmoji = normalizeEmojiReaction(emoji);
    const mine = post.likes.find((l) => l.user_id === user.id);

    if (!normalizedEmoji) {
      if (mine && mine.emoji === emoji) {
        const { error } = await supabase.from("likes").delete().eq("id", mine.id);
        if (error) console.error("Failed to remove legacy reaction:", error);
        load();
        return;
      }
      setReactionError((errors) => ({ ...errors, [post.id]: t("feed.emojiOnly") }));
      return;
    }

    setReactionError((errors) => ({ ...errors, [post.id]: "" }));
    if (mine && mine.emoji === normalizedEmoji) {
      const { error } = await supabase.from("likes").delete().eq("id", mine.id);
      if (error) console.error("Failed to remove reaction:", error);
    } else if (mine) {
      const { error } = await supabase.from("likes").update({ emoji: normalizedEmoji }).eq("id", mine.id);
      if (error) console.error("Failed to update reaction:", error);
    } else {
      const { error } = await supabase.from("likes").insert({ post_id: post.id, user_id: user.id, emoji: normalizedEmoji });
      if (error) console.error("Failed to add reaction:", error);
      else notifyXPChanged();
    }
    setEmojiInputOpen(s => ({ ...s, [post.id]: false }));
    load();
  }

  async function addComment(post) {
    const text = (commentDraft[post.id] || "").trim();
    if (!text) return;
    const { error } = await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, content: text });
    if (!error) notifyXPChanged();
    setCommentDraft((d) => ({ ...d, [post.id]: "" }));
    load();
  }

  async function deletePost(id) {
    await supabase.from("posts").delete().eq("id", id);
    load();
  }

  async function deleteComment(commentId) {
    await supabase.from("comments").delete().eq("id", commentId);
    load();
  }

  async function updatePost(postId, newCaption) {
    await supabase.from("posts").update({ caption: newCaption.trim() || null }).eq("id", postId);
    setEditingPostId(null);
    setEditCaption("");
    load();
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

  const who = (id) => profiles[id] || { pseudo: "?", avatar_url: null };

  return (
    <Layout>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("feed.title")}</h1>
        <p className="text-sm mb-6" style={{ color: "var(--bt-text-2)" }}>{t("feed.subtitle")}</p>

        {/* Post creation — collapsed prompt or expanded form */}
        {!formOpen ? (
          <div className="card p-4 mb-6 flex items-center gap-3 cursor-pointer transition-colors"
            onClick={() => setFormOpen(true)}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-surface)"}>
            <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={36} />
            <span className="flex-1 text-sm rounded-full px-4 py-2 select-none"
              style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
              {t("feed.postPrompt")}
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--bt-text-3)", flexShrink: 0 }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        ) : (
          <form onSubmit={createPost} className="card p-5 mb-6 space-y-3">
            {/* Header with cancel */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("feed.title")}</p>
              <button type="button"
                onClick={() => { setFormOpen(false); setFile(null); setCaption(""); setVisibility("public"); }}
                className="text-xs transition-colors"
                style={{ color: "var(--bt-text-3)" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-1)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
                {t("feed.collapseForm")}
              </button>
            </div>

            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="block w-full rounded-2xl text-sm font-medium text-center py-3 transition-colors"
              style={{ border: "2px dashed #E8E2DC", color: "var(--bt-text-2)", backgroundColor: file ? "var(--bt-accent-bg)" : "var(--bt-subtle)" }}>
              {file ? `📎 ${file.name}` : t("feed.choosePhoto")}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <input className="input" placeholder={t("feed.caption")}
              value={caption} onChange={(e) => setCaption(e.target.value)} />

            {/* Visibility toggle */}
            <div className="flex gap-2">
              {[
                { val: "public",  label: t("feed.everyone"), icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                )},
                { val: "friends", label: t("feed.myFriends"), icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                )},
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setVisibility(opt.val)}
                  className="flex-1 text-xs py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5"
                  style={visibility === opt.val
                    ? { backgroundColor: "#EAFBF4", color: "#0E8F68", border: "1px solid #C6EED9" }
                    : { backgroundColor: "#F7F3EF", color: "var(--bt-text-2)", border: "1px solid #E8E2DC" }}>
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>

            <button className="btn-primary w-full" disabled={busy || !file}>
              {busy ? t("feed.publishing") : t("feed.publish")}
            </button>
            <p className="text-center text-xs" style={{ color: "var(--bt-text-3)" }}>
              {t("feed.storyHint")}
            </p>
          </form>
        )}

        <div className="space-y-5">
          {posts.length === 0 && (
            <div className="card p-10 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>
              {t("feed.emptyRecent")}
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
            return (
              <article key={post.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => openProfile(post.user_id)}
                    className="flex items-center gap-3 flex-1 text-left">
                    <Avatar url={author.avatar_url} pseudo={displayName(author)} size={38} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold inline-flex items-center gap-1.5 flex-wrap" style={{ color: "var(--bt-text-1)" }}>
                          <span>{displayName(author)}</span>
                          {authorLevels[post.user_id] && (
                            <LevelPill level={authorLevels[post.user_id]} />
                          )}
                          <span className="font-normal" style={{ color: "var(--bt-text-3)" }}>@{author.pseudo}</span>
                        </p>
                        {post.visibility === "friends" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
                            style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            {t("feed.friendsBadge")}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
                            style={{ backgroundColor: "#EFF9FF", color: "#0369a1" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg>
                            {t("feed.publicBadge")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{timeAgo(post.created_at, lang)}</p>
                    </div>
                  </button>
                  {(post.user_id === user.id || isAdmin) && (
                    <div className="flex items-center gap-2.5">
                      {post.user_id === user.id && (
                        <button
                          onClick={() => { setEditingPostId(post.id); setEditCaption(post.caption || ""); }}
                          className="text-xs transition-colors"
                          style={{ color: "#D0C9C3" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#14B885"}
                          onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                          {t("feed.editPost")}
                        </button>
                      )}
                      <button onClick={() => deletePost(post.id)}
                        className="text-xs transition-colors"
                        style={{ color: "#D0C9C3" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                        {t("common.remove")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline caption editor (own posts only) */}
                {editingPostId === post.id && (
                  <div className="px-4 pb-3 space-y-2">
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
                      <button onClick={() => updatePost(post.id, editCaption)} className="btn-primary flex-1 text-sm py-2">
                        {t("feed.saveEdit")}
                      </button>
                      <button onClick={() => setEditingPostId(null)} className="btn-ghost text-sm py-2">
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Image — fixed 4:3 ratio for consistent display on iPhone and desktop */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div style={{ aspectRatio: "4/3", overflow: "hidden", backgroundColor: "#F7F3EF" }}>
                  <img src={post.image_url} alt="session" loading="lazy" className="w-full h-full object-cover" />
                </div>

                <div className="p-4 space-y-3">
                  {/* Reactions - long-press (600ms) opens the reactors panel */}
                  <div className="flex items-center gap-1.5 flex-wrap"
                    onPointerDown={() => handlePressStart(post.id)}
                    onPointerUp={handlePressEnd}
                    onPointerLeave={handlePressEnd}>
                    {(() => {
                      const n = counts[DEFAULT_REACTION_EMOJI] || 0;
                      const active = myReaction === DEFAULT_REACTION_EMOJI;
                      return (
                        <button
                          type="button"
                          onClick={() => react(post, DEFAULT_REACTION_EMOJI)}
                          className="text-sm flex items-center gap-1 rounded-full px-2.5 py-1 transition-all"
                          style={active
                            ? { backgroundColor: "#EAFBF4", border: "1px solid #C6EED9", color: "#0E8F68" }
                            : { border: "1px solid #E8E2DC", color: "var(--bt-text-2)", backgroundColor: "transparent" }}
                          title={t("feed.likeReaction")}
                          aria-label={t("feed.likeReaction")}>
                          <span>{DEFAULT_REACTION_EMOJI}</span>
                          {n > 0 && <span className="text-xs tabular-nums font-medium">{n}</span>}
                        </button>
                      );
                    })()}

                    {otherEmojis.map((emoji) => {
                      const n = counts[emoji] || 0;
                      const active = myReaction === emoji;
                      const isHeart = emoji === LEGACY_FALLBACK_EMOJI;
                      return (
                        <button key={emoji} type="button" onClick={() => react(post, emoji)}
                          className="text-sm flex items-center gap-1 rounded-full px-2.5 py-1 transition-all"
                          style={active
                            ? { backgroundColor: "#EAFBF4", border: "1px solid #C6EED9", color: "#0E8F68" }
                            : { border: "1px solid #E8E2DC", color: "var(--bt-text-2)", backgroundColor: "transparent" }}>
                          <span style={{ color: isHeart ? "#ef4444" : undefined }}>{emoji}</span>
                          {n > 0 && <span className="text-xs tabular-nums font-medium">{n}</span>}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setEmojiInputOpen(s => ({ ...s, [post.id]: !s[post.id] }));
                        setReactionError(errors => ({ ...errors, [post.id]: "" }));
                      }}
                      className="text-sm flex items-center justify-center rounded-full transition-all"
                      style={{ width: 32, height: 32, border: "1px dashed var(--bt-border)", color: "var(--bt-text-3)", backgroundColor: "transparent" }}
                      title={t("feed.addReaction")}
                      aria-label={t("feed.addReaction")}>
                      +
                    </button>

                    {emojiInputOpen[post.id] && (
                      <div className="flex items-center gap-1.5 flex-wrap rounded-2xl px-2 py-1"
                        style={{ border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                        {EMOJI_REACTION_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => react(post, emoji)}
                            className="flex items-center justify-center rounded-full transition-all"
                            style={{
                              width: 30,
                              height: 30,
                              backgroundColor: myReaction === emoji ? "#EAFBF4" : "transparent",
                              color: myReaction === emoji ? "#0E8F68" : "var(--bt-text-1)",
                              border: myReaction === emoji ? "1px solid #C6EED9" : "1px solid transparent",
                              fontSize: 17,
                            }}
                            aria-label={`${t("feed.addReaction")} ${emoji}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {reactionError[post.id] && (
                    <p className="text-xs -mt-1" style={{ color: "#ef4444" }}>
                      {reactionError[post.id]}
                    </p>
                  )}

                  {/* Likers — clickable */}
                  {post.likes.length > 0 && (() => {
                    const likers = post.likes.slice(0, 5).filter(l => profiles[l.user_id]);
                    return likers.length ? (
                      <div className="flex flex-wrap gap-x-1 items-center -mt-1">
                        {likers.map((l, i) => (
                          <span key={l.id} className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                            {i > 0 && " · "}
                            <button onClick={() => openProfile(l.user_id)}
                              className="hover:underline"
                              style={{ color: "var(--bt-text-3)" }}>
                              {l.emoji || LEGACY_FALLBACK_EMOJI} {displayName(profiles[l.user_id])}
                            </button>
                          </span>
                        ))}
                        {post.likes.length > 5 && (
                          <span className="text-xs" style={{ color: "var(--bt-text-3)" }}> +{post.likes.length - 5}</span>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* Caption */}
                  {post.caption && (
                    <p className="text-sm" style={{ color: "var(--bt-text-1)" }}>
                      <span className="font-semibold">{displayName(author)}</span>{" "}{post.caption}
                    </p>
                  )}

                  {/* Comments — with delete button for own comments */}
                  <ul className="space-y-1.5">
                    {post.comments
                      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                      .map((c) => (
                        <li key={c.id} className="text-sm flex items-start gap-1.5 group">
                          <div className="flex-1 min-w-0">
                            <button onClick={() => openProfile(c.user_id)}
                              className="font-semibold hover:underline"
                              style={{ color: "var(--bt-text-1)" }}>
                              {displayName(who(c.user_id))}
                            </button>{" "}
                            <span style={{ color: "var(--bt-text-2)" }}>{c.content}</span>
                          </div>
                          {(c.user_id === user.id || isAdmin) && (
                            <button
                              onClick={() => deleteComment(c.id)}
                              title={t("feed.deleteComment")}
                              className="shrink-0 self-center transition-colors opacity-0 group-hover:opacity-100"
                              style={{ color: "#D0C9C3" }}
                              onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                              onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          )}
                        </li>
                      ))}
                  </ul>

                  {/* Comment input */}
                  <div className="flex gap-2 pt-1">
                    <input className="input" placeholder={t("feed.comment")}
                      value={commentDraft[post.id] || ""}
                      onChange={(e) => setCommentDraft((d) => ({ ...d, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addComment(post)} />
                    <button onClick={() => addComment(post)} className="btn-ghost shrink-0">{t("common.send")}</button>
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
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => setReactorsPanel(null)}>
            <div
              className="w-full rounded-t-3xl p-5 overflow-y-auto"
              style={{ backgroundColor: "var(--bt-surface)", maxHeight: "70vh" }}
              onClick={e => e.stopPropagation()}>
              {/* Handle */}
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: "var(--bt-border)" }} />
              <p className="text-sm font-semibold mb-4" style={{ color: "var(--bt-text-1)" }}>
                {t("feed.reactions")}
              </p>
              {sortedGroups.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "var(--bt-text-3)" }}>—</p>
              ) : sortedGroups.map(([emoji, likers]) => (
                <div key={emoji} className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl" style={{ color: emoji === LEGACY_FALLBACK_EMOJI ? "#ef4444" : undefined }}>{emoji}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--bt-text-3)" }}>{likers.length}</span>
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
              <button onClick={() => setReactorsPanel(null)} className="btn-ghost w-full mt-2">
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
