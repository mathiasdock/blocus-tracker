import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, timeAgo } from "../lib/format";
import { COUNTRIES, COMMUNITY_BY_ID, communityIdForUniversity } from "../lib/universities";
import { notifyXPChanged } from "../lib/xpEvents";
import {
  TEXT_LIMITS,
  attachmentKind,
  clientRateLimit,
  safeStoragePath,
  sanitizeFileName,
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

function AttachmentImageGate({ src, alt, mine, loaded, onLoad, t }) {
  if (loaded && src) {
    return (
      <>
        <p className="mt-2 text-[10px] font-semibold"
          style={{ color: mine ? "rgba(255,255,255,0.75)" : "#A8A09A" }}>
          {t("attachment.imageLoaded")}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt || "image"} loading="lazy"
          className="mt-2 rounded-xl max-h-60 object-cover" />
      </>
    );
  }

  return (
    <div className="mt-2 rounded-xl px-3 py-2 text-xs"
      style={{
        backgroundColor: mine ? "rgba(255,255,255,0.14)" : "#FFFDFB",
        border: mine ? "1px solid rgba(255,255,255,0.22)" : "1px solid #E8E2DC",
        color: mine ? "rgba(255,255,255,0.86)" : "#5F5650",
      }}>
      <p className="mb-2">{t("attachment.available")}</p>
      <button type="button" onClick={onLoad}
        className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{
          backgroundColor: mine ? "#fff" : "#EAFBF4",
          border: mine ? "none" : "1px solid #CFF3E3",
          color: mine ? "#0E8F68" : "#0E8F68",
        }}>
        {t("attachment.viewImage")}
      </button>
    </div>
  );
}

const COMMUNITY_SPACES = [
  { id: "salon", labelKey: "comm.spaceSalon", prefix: "" },
  { id: "questions", labelKey: "comm.spaceQuestions", prefix: "[Question]" },
  { id: "resources", labelKey: "comm.spaceResources", prefix: "[Ressource]" },
  { id: "exams", labelKey: "comm.spaceExams", prefix: "[Examen]" },
];

function spaceForId(id) {
  return COMMUNITY_SPACES.find((space) => space.id === id) || COMMUNITY_SPACES[0];
}

function parseCommunityContent(content) {
  const raw = content || "";
  const tagged = COMMUNITY_SPACES.find((space) => space.prefix && raw.startsWith(`${space.prefix} `));
  if (!tagged) return { space: "salon", text: raw };
  return { space: tagged.id, text: raw.slice(tagged.prefix.length + 1) };
}

function isNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
}

function CommunityLogo({ university, size = 36, rounded = 12, className = "" }) {
  const [failed, setFailed] = useState(false);
  const initials = (university?.name || "?").slice(0, 2).toUpperCase();
  const style = {
    width: size,
    height: size,
    borderRadius: rounded,
    backgroundColor: "#F7F3EF",
    border: "1px solid #E8E2DC",
  };

  if (university?.logo && !failed) {
    return (
      <div className={`shrink-0 flex items-center justify-center overflow-hidden ${className}`} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={university.logo}
          alt=""
          className="object-contain"
          style={{ width: size - 4, height: size - 4 }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`shrink-0 flex items-center justify-center overflow-hidden ${className}`}
      style={{ ...style, backgroundColor: university?.color || "#14B885", border: "1px solid transparent" }}>
      <span className="font-bold text-white" style={{ fontSize: Math.max(8, size * 0.34) }}>
        {initials}
      </span>
    </div>
  );
}

export default function Communautes() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const { communityCount, markSeen } = useNotifications();
  const { t, lang } = useI18n();

  // The community the current user belongs to (resolved from profile.university).
  const myCommunityId = useMemo(
    () => communityIdForUniversity(profile?.university),
    [profile?.university]
  );

  // Normal users only see/access their own university; admins see them all.
  const visibleCountries = useMemo(() => {
    if (isAdmin) return COUNTRIES;
    if (!myCommunityId) return [];
    return COUNTRIES
      .map(c => ({ ...c, universities: c.universities.filter(u => u.id === myCommunityId) }))
      .filter(c => c.universities.length > 0);
  }, [isAdmin, myCommunityId]);

  const [active, setActive] = useState(null);
  // Track which country accordions are open
  const [openCountries, setOpenCountries] = useState({});

  // Pick the initial active community: first one for admins, own for users.
  useEffect(() => {
    if (active) return;
    if (isAdmin) {
      setActive(COUNTRIES[0].universities[0].id);
      setOpenCountries({ [COUNTRIES[0].code]: true });
    } else if (myCommunityId) {
      setActive(myCommunityId);
    }
  }, [active, isAdmin, myCommunityId]);

  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewUserId, setViewUserId] = useState(null);
  const [communitySpace, setCommunitySpace] = useState("salon");
  const [revealedImages, setRevealedImages] = useState({});
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const shouldScrollRef = useRef(false);

  const activeMeta = COMMUNITY_BY_ID[active];

  function pickFile(input) {
    const f = input.files?.[0] || null;
    if (!f) { setFile(null); return; }
    const check = validateUploadFile(f, "chatAttachment");
    if (!check.ok) {
      alert(uploadErrorMessage(t, check));
      input.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  }

  const load = useCallback(async ({ forceScroll = false } = {}) => {
    if (!active) return;
    const { data } = await supabase
      .from("community_messages")
      .select("*")
      .eq("community", active)
      .order("created_at", { ascending: true })
      .limit(100);
    const rows = data || [];
    const nextLastId = rows[rows.length - 1]?.id || null;
    const prevLastId = lastMessageIdRef.current;
    shouldScrollRef.current =
      forceScroll ||
      !prevLastId ||
      (nextLastId && nextLastId !== prevLastId && isNearBottom(scrollRef.current));
    lastMessageIdRef.current = nextLastId;

    setMessages(rows);
    const ids = [...new Set(rows.map((m) => m.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, pseudo, first_name, last_name, avatar_url")
        .in("id", ids);
      const map = {};
      (profs || []).forEach((p) => (map[p.id] = p));
      setProfiles(map);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    setMessages([]);
    lastMessageIdRef.current = null;
    shouldScrollRef.current = true;
    load({ forceScroll: true });
    markSeen(active);
  }, [load, active, markSeen]);

  useEffect(() => {
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function toggleCountry(code) {
    setOpenCountries(prev => ({ ...prev, [code]: !prev[code] }));
  }

  function selectCommunity(id, countryCode) {
    setActive(id);
    setOpenCountries(prev => ({ ...prev, [countryCode]: true }));
  }

  function revealImage(key) {
    setRevealedImages((prev) => ({ ...prev, [key]: true }));
  }

  async function send(e) {
    e.preventDefault();
    const cleanText = trimmedText(text, TEXT_LIMITS.communityMessage);
    if (!cleanText && !file) return;
    const action = clientRateLimit(`community:send:${user.id}`, 20, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return; }
    setSending(true);

    let attachment_url = null;
    let attachment_type = null;
    let attachment_name = null;

    if (file) {
      const pathInfo = safeStoragePath(user.id, file, [active], "chatAttachment");
      if (!pathInfo.ok) { setSending(false); alert(uploadErrorMessage(t, pathInfo)); return; }
      const { error: upErr } = await supabase.storage.from("community").upload(pathInfo.path, file, {
        cacheControl: "31536000",
        contentType: pathInfo.contentType,
      });
      if (upErr) { setSending(false); alert(t("common.uploadFailed") + " " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("community").getPublicUrl(pathInfo.path);
      attachment_url = pub.publicUrl;
      attachment_type = attachmentKind(file);
      attachment_name = sanitizeFileName(file.name);
    }

    const selectedSpace = spaceForId(communitySpace);
    const content = cleanText && selectedSpace.prefix ? `${selectedSpace.prefix} ${cleanText}` : cleanText || null;
    const { error } = await supabase.from("community_messages").insert({
      community: active, user_id: user.id,
      content,
      attachment_url, attachment_type, attachment_name,
    });
    if (!error) notifyXPChanged();

    setText("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(false);
    load({ forceScroll: true });
  }

  async function remove(id) {
    await supabase.from("community_messages").delete().eq("id", id);
    load();
  }

  const who = (id) => profiles[id] || { pseudo: t("common.unknownUser"), avatar_url: null };
  const visibleMessages = messages.filter((message) => {
    if (communitySpace === "salon") return true;
    return parseCommunityContent(message.content).space === communitySpace;
  });

  // Total badge across all communities
  const totalBadge = Object.values(communityCount).reduce((s, n) => s + n, 0);

  return (
    <Layout>
      <h1 className="text-2xl mb-0.5" style={{ color: "#1F1A17" }}>{t("comm.title")}</h1>
      <p className="text-sm mb-6" style={{ color: "#7C746E" }}>{t("comm.subtitle")}</p>

      <div className="grid gap-5 lg:grid-cols-4">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="lg:col-span-1 space-y-0.5">
          {visibleCountries.map(country => {
            const isOpen = !!openCountries[country.code];
            const countryBadge = country.universities.reduce((s, u) => s + (communityCount[u.id] || 0), 0);
            return (
              <div key={country.code}>
                <button onClick={() => toggleCountry(country.code)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-left"
                  style={{ color: "#7C746E" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F7F3EF"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wide">{country.name}</span>
                  {countryBadge > 0 && !isOpen && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none">
                      {countryBadge > 99 ? "99+" : countryBadge}
                    </span>
                  )}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: "#A8A09A" }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>

                {isOpen && (
                  <div className="pl-1.5 space-y-0.5 mb-1">
                    {country.universities.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).map(u => {
                      const isActive = active === u.id;
                      const badge = communityCount[u.id] || 0;
                      return (
                        <button key={u.id} onClick={() => selectCommunity(u.id, country.code)}
                          className="relative w-full text-left rounded-2xl px-3 py-2 transition-all flex items-center gap-2.5"
                          style={isActive
                            ? { backgroundColor: "#EAFBF4", color: "#0E8F68" }
                            : { color: "#7C746E" }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "#F7F3EF"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = ""; }}>
                          {isActive && (
                            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                              style={{ backgroundColor: "#14B885" }} />
                          )}
                          <CommunityLogo university={u} size={20} rounded={6} />
                          <span className={`flex-1 text-xs ${isActive ? "font-semibold" : "font-medium"}`}>
                            {u.name}
                          </span>
                          {badge > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none shrink-0">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* ── Chat ─────────────────────────────────────────────── */}
        {!isAdmin && !myCommunityId ? (
        <section className="lg:col-span-3 card flex items-center justify-center h-[72vh] text-center px-6">
          <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("comm.noUniversity")}</p>
        </section>
        ) : (
        <section className="lg:col-span-3 card flex flex-col h-[72vh]">
          {/* Header */}
          <div className="px-5 py-3.5 flex items-center gap-3 shrink-0"
            style={{ borderBottom: "1px solid #E8E2DC" }}>
            <CommunityLogo university={activeMeta} size={36} rounded={12} />
            <div>
              <h2 className="text-sm font-semibold leading-tight" style={{ color: "#1F1A17" }}>{activeMeta?.name}</h2>
              <p className="text-xs" style={{ color: "#A8A09A" }}>{activeMeta?.full}</p>
            </div>
          </div>

          <div className="px-5 py-2.5 flex gap-2 overflow-x-auto shrink-0"
            style={{ borderBottom: "1px solid #E8E2DC" }}>
            {COMMUNITY_SPACES.map((space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => setCommunitySpace(space.id)}
                className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
                style={communitySpace === space.id
                  ? { backgroundColor: "#EAFBF4", color: "#0E8F68", border: "1px solid #C6EED9" }
                  : { backgroundColor: "#F7F3EF", color: "#7C746E", border: "1px solid #E8E2DC" }}>
                {t(space.labelKey)}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
            {activeMeta?.logo && (
              <div className="sticky top-0 left-0 right-0 z-0 h-0 pointer-events-none" aria-hidden>
                <div className="absolute left-0 right-0 flex items-center justify-center" style={{ top: 0, height: "calc(72vh - 8rem)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeMeta.logo} alt=""
                    style={{ width: "26%", maxWidth: 190, opacity: 0.08, objectFit: "contain" }}
                    onError={e => { e.currentTarget.style.display = "none"; }} />
                </div>
              </div>
            )}
            <div className="relative z-10 px-5 py-4 space-y-3">
              {visibleMessages.length === 0 && (
                <p className="text-center text-sm mt-10" style={{ color: "#A8A09A" }}>
                  {t("comm.empty")}
                </p>
              )}
              {visibleMessages.map((m) => {
                const author = who(m.user_id);
                const mine = m.user_id === user.id;
                const parsed = parseCommunityContent(m.content);
                const space = spaceForId(parsed.space);
                const imageKey = `community:${m.id}:${m.attachment_url || ""}`;
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    <button onClick={() => setViewUserId(m.user_id)} className="shrink-0">
                      <Avatar url={author.avatar_url} pseudo={displayName(author)} size={30} />
                    </button>
                    <div className={`max-w-[72%] ${mine ? "items-end text-right" : "items-start"} flex flex-col`}>
                      <span className="text-[11px] mb-0.5" style={{ color: "#A8A09A" }}>
                        {displayName(author)} · {timeAgo(m.created_at, lang)}
                      </span>
                      <div className="rounded-2xl px-3.5 py-2.5 text-sm"
                        style={mine
                          ? { backgroundColor: "#14B885", color: "#fff", borderRadius: "18px 18px 6px 18px" }
                          : { backgroundColor: "#F7F3EF", color: "#1F1A17", borderRadius: "18px 18px 18px 6px" }}>
                        {space.id !== "salon" && (
                          <span className="inline-flex mb-1 text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={{ backgroundColor: mine ? "rgba(255,255,255,0.18)" : "#EAFBF4", color: mine ? "#fff" : "#0E8F68" }}>
                            {t(space.labelKey)}
                          </span>
                        )}
                        {parsed.text && <p className="whitespace-pre-wrap">{parsed.text}</p>}
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
                        <button onClick={() => remove(m.id)}
                          className="text-[10px] mt-0.5 transition-colors"
                          style={{ color: "#D0C9C3" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                          onMouseLeave={e => e.currentTarget.style.color = "#D0C9C3"}>
                          {t("common.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <form onSubmit={send} className="p-3 flex items-center gap-2 shrink-0"
            style={{ borderTop: "1px solid #E8E2DC" }}>
            <label className="btn-ghost cursor-pointer px-3 shrink-0" title={t("common.attach")}>
              <IconPaperclip />
              <input ref={fileInputRef} type="file"
                accept={CHAT_ACCEPT}
                className="hidden" onChange={(e) => pickFile(e.currentTarget)} />
            </label>
            <input className="input flex-1"
              placeholder={file ? `${t("msg.file")} : ${file.name}` : t(`comm.placeholder.${communitySpace}`)}
              maxLength={TEXT_LIMITS.communityMessage}
              value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={sending || (!text.trim() && !file)}>
              {sending ? "…" : t("common.send")}
            </button>
          </form>
        </section>
        )}
      </div>

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
