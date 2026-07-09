import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useToast } from "../contexts/ToastContext";
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

function IconPlus({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconSearch({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconBack({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function AttachmentImageGate({ src, alt, mine, loaded, onLoad, t }) {
  if (loaded && src) {
    return (
      <>
        <p className="mt-2 text-[10px] font-semibold"
          style={{ color: mine ? "rgba(255,255,255,0.75)" : "var(--bt-text-3)" }}>
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
          color: "var(--bt-accent-dark)",
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

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

function ExamDateBadge({ days, t }) {
  if (days === null) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 whitespace-nowrap"
        style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
        {t("comm.examNoDate")}
      </span>
    );
  }
  const bg = days <= 0 ? "#FEF2F2" : days <= 7 ? "#FEF3C7" : "var(--bt-accent-bg)";
  const color = days <= 0 ? "#DC2626" : days <= 7 ? "#D97706" : "var(--bt-accent-dark)";
  const label = days === 0 ? t("exam.today") : days === 1 ? t("plan.tomorrow") : days > 1 ? `J-${days}` : t("exam.passed");
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

function CommunityLogo({ university, size = 36, rounded = 12, className = "" }) {
  const [failed, setFailed] = useState(false);
  const initials = (university?.name || "?").slice(0, 2).toUpperCase();
  const style = {
    width: size,
    height: size,
    borderRadius: rounded,
    backgroundColor: "var(--bt-subtle)",
    border: "1px solid var(--bt-border)",
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
      style={{ ...style, backgroundColor: university?.color || "var(--bt-accent)", border: "1px solid transparent" }}>
      <span className="font-bold text-white" style={{ fontSize: Math.max(8, size * 0.34) }}>
        {initials}
      </span>
    </div>
  );
}

function TabEmptyState({ title, subtitle, logo }) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center py-14 px-6 min-h-[220px]">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" aria-hidden="true"
          style={{ position: "absolute", width: 150, maxWidth: "40%", opacity: 0.07, objectFit: "contain", zIndex: 0, pointerEvents: "none" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      )}
      <div className="relative z-10">
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--bt-text-2)" }}>{title}</p>
        <p className="text-xs max-w-xs mx-auto" style={{ color: "var(--bt-text-3)" }}>{subtitle}</p>
      </div>
    </div>
  );
}

function UniversityButton({ u, badge, isActive, onClick, size = 20 }) {
  return (
    <button onClick={onClick}
      className="relative w-full text-left rounded-2xl px-3 py-2 transition-all flex items-center gap-2.5"
      style={isActive
        ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }
        : { color: "var(--bt-text-2)" }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = ""; }}>
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: "var(--bt-accent)" }} />
      )}
      <CommunityLogo university={u} size={size} rounded={6} />
      <span className="flex-1 min-w-0 text-xs font-medium truncate">{u.name}</span>
      {badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none shrink-0">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export default function Communautes() {
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const { communityCount, markSeen } = useNotifications();
  const { toast } = useToast();
  const { t, lang } = useI18n();

  // The community the current user belongs to (resolved from profile.university).
  const myCommunityId = useMemo(
    () => communityIdForUniversity(profile?.university),
    [profile?.university]
  );
  const myUni = COMMUNITY_BY_ID[myCommunityId] || null;
  const myCountryCode = useMemo(() => {
    for (const c of COUNTRIES) if (c.universities.some((u) => u.id === myCommunityId)) return c.code;
    return "BE";
  }, [myCommunityId]);

  const [active, setActive] = useState(null);
  const [openCountries, setOpenCountries] = useState({});
  const [mobileView, setMobileView] = useState("list"); // "list" | "chat"
  const [searchQuery, setSearchQuery] = useState("");

  // Communities are now open to everyone — no more filtering by own university.
  // Default open country: the user's own (or Belgium if unknown), once the
  // profile has actually finished loading (avoids the BE fallback winning
  // the race against a still-loading own-university).
  useEffect(() => {
    if (authLoading) return;
    setOpenCountries((prev) => (Object.keys(prev).length === 0 ? { [myCountryCode]: true } : prev));
  }, [myCountryCode, authLoading]);

  // Pick the initial active community: own school if known, else the first one.
  // Waits for the profile to finish loading so a slow-loading own-university
  // doesn't get pre-empted by the fallback (previously always won the race).
  useEffect(() => {
    if (active || authLoading) return;
    if (myCommunityId) { setActive(myCommunityId); return; }
    setActive(COUNTRIES[0].universities[0].id);
  }, [active, authLoading, myCommunityId]);

  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewUserId, setViewUserId] = useState(null);
  const [communitySpace, setCommunitySpace] = useState("salon");
  const [revealedImages, setRevealedImages] = useState({});
  const [communityStats, setCommunityStats] = useState({});
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionTitle, setQuestionTitle] = useState("");
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceDesc, setResourceDesc] = useState("");
  const [resourceFile, setResourceFile] = useState(null);
  const [showExamForm, setShowExamForm] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [sendingForm, setSendingForm] = useState(false);
  const [planningAdded, setPlanningAdded] = useState({});
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const resourceFileInputRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const shouldScrollRef = useRef(false);
  const statsCache = useRef({});

  const activeMeta = COMMUNITY_BY_ID[active];

  function pickFile(input, setter = setFile) {
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

  // Real, non-invented activity signals for the community header: a genuine
  // student count (profiles.university) and a genuine "active this week"
  // count (get_public_leaderboard, already used on the Stats page). Cached
  // per community so switching back and forth doesn't re-query.
  useEffect(() => {
    if (!active || !activeMeta) return;
    if (statsCache.current[active] !== undefined) {
      setCommunityStats((s) => ({ ...s, [active]: statsCache.current[active] }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [{ count }, { data: leaderRows }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("university", activeMeta.full),
          supabase.rpc("get_public_leaderboard", { p_period: "week", p_university: activeMeta.full }),
        ]);
        const result = { students: count ?? null, activeWeek: (leaderRows || []).length };
        statsCache.current[active] = result;
        if (!cancelled) setCommunityStats((s) => ({ ...s, [active]: result }));
      } catch {
        statsCache.current[active] = null;
        if (!cancelled) setCommunityStats((s) => ({ ...s, [active]: null }));
      }
    })();
    return () => { cancelled = true; };
  }, [active, activeMeta]);

  function toggleCountry(code) {
    setOpenCountries((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function selectCommunity(id, countryCode) {
    setActive(id);
    setOpenCountries((prev) => ({ ...prev, [countryCode]: true }));
    setMobileView("chat");
    setCommunitySpace("salon");
    setActiveThreadId(null);
    setShowQuestionForm(false);
    setShowResourceForm(false);
    setShowExamForm(false);
  }

  function revealImage(key) {
    setRevealedImages((prev) => ({ ...prev, [key]: true }));
  }

  // Shared insert path for every tab (Salon / Question / Reply / Resource /
  // Exam) — they all write to the same community_messages table, only the
  // tag prefix, parent_id (thread reply) and exam_date differ.
  async function postMessage({ rawText, uploadFile, prefix, parentId = null, examDateValue = null, setBusy }) {
    const cleanText = trimmedText(rawText, TEXT_LIMITS.communityMessage);
    if (!cleanText && !uploadFile) return false;
    const action = clientRateLimit(`community:send:${user.id}`, 20, 60_000);
    if (!action.ok) { alert(t("security.rateLimited")); return false; }
    setBusy(true);

    let attachment_url = null;
    let attachment_type = null;
    let attachment_name = null;

    if (uploadFile) {
      const pathInfo = safeStoragePath(user.id, uploadFile, [active], "chatAttachment");
      if (!pathInfo.ok) { setBusy(false); alert(uploadErrorMessage(t, pathInfo)); return false; }
      const { error: upErr } = await supabase.storage.from("community").upload(pathInfo.path, uploadFile, {
        cacheControl: "31536000",
        contentType: pathInfo.contentType,
      });
      if (upErr) { setBusy(false); alert(t("common.uploadFailed") + " " + upErr.message); return false; }
      const { data: pub } = supabase.storage.from("community").getPublicUrl(pathInfo.path);
      attachment_url = pub.publicUrl;
      attachment_type = attachmentKind(uploadFile);
      attachment_name = sanitizeFileName(uploadFile.name);
    }

    const content = cleanText && prefix ? `${prefix} ${cleanText}` : cleanText || null;
    const { error } = await supabase.from("community_messages").insert({
      community: active, user_id: user.id,
      content, parent_id: parentId, exam_date: examDateValue,
      attachment_url, attachment_type, attachment_name,
    });
    setBusy(false);
    if (error) { toast(t("comm.postFailed"), "error"); return false; }
    notifyXPChanged();
    load({ forceScroll: true });
    return true;
  }

  async function sendSalon(e) {
    e.preventDefault();
    const ok = await postMessage({ rawText: text, uploadFile: file, prefix: "", setBusy: setSending });
    if (ok) {
      setText(""); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submitQuestion(e) {
    e.preventDefault();
    const ok = await postMessage({ rawText: questionTitle, uploadFile: null, prefix: "[Question]", setBusy: setSendingForm });
    if (ok) { setQuestionTitle(""); setShowQuestionForm(false); toast(t("toast.questionPosted")); }
  }

  async function submitReply(e) {
    e.preventDefault();
    const ok = await postMessage({ rawText: replyText, uploadFile: null, prefix: "", parentId: activeThreadId, setBusy: setSendingForm });
    if (ok) setReplyText("");
  }

  async function submitResource(e) {
    e.preventDefault();
    const ok = await postMessage({ rawText: resourceDesc, uploadFile: resourceFile, prefix: "[Ressource]", setBusy: setSendingForm });
    if (ok) {
      setResourceDesc(""); setResourceFile(null); setShowResourceForm(false);
      if (resourceFileInputRef.current) resourceFileInputRef.current.value = "";
      toast(t("toast.resourceShared"));
    }
  }

  async function submitExam(e) {
    e.preventDefault();
    const ok = await postMessage({ rawText: examName, uploadFile: null, prefix: "[Examen]", examDateValue: examDate || null, setBusy: setSendingForm });
    if (ok) { setExamName(""); setExamDate(""); setShowExamForm(false); toast(t("toast.examAdded")); }
  }

  async function addExamToPlanning(m) {
    if (!m.exam_date || planningAdded[m.id]) return;
    const parsed = parseCommunityContent(m.content);
    const { error } = await supabase.from("exams").insert({
      user_id: user.id,
      name: parsed.text || activeMeta?.name || t("plan.examPrefix"),
      course_id: null,
      exam_date: m.exam_date,
      exam_time: null,
      location: null,
    });
    if (!error) {
      notifyXPChanged();
      setPlanningAdded((prev) => ({ ...prev, [m.id]: true }));
      toast(t("comm.addedToPlanning"));
    } else {
      toast(t("comm.postFailed"), "error");
    }
  }

  async function remove(id) {
    await supabase.from("community_messages").delete().eq("id", id);
    load();
  }

  const who = (id) => profiles[id] || { pseudo: t("common.unknownUser"), avatar_url: null };

  // Each tab is a client-side filter over the same message stream — replies
  // (parent_id set) never leak into a top-level list.
  const salonMessages = messages.filter((m) => !m.parent_id && parseCommunityContent(m.content).space === "salon");
  const questionMessages = messages.filter((m) => !m.parent_id && parseCommunityContent(m.content).space === "questions");
  const resourceMessages = messages.filter((m) => !m.parent_id && parseCommunityContent(m.content).space === "resources");
  const examMessages = messages.filter((m) => !m.parent_id && parseCommunityContent(m.content).space === "exams");
  const sortedExamMessages = [...examMessages].sort((a, b) => {
    if (a.exam_date && b.exam_date) return a.exam_date.localeCompare(b.exam_date);
    if (a.exam_date) return -1;
    if (b.exam_date) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const repliesFor = (questionId) => messages.filter((m) => m.parent_id === questionId);
  const activeThread = activeThreadId ? messages.find((m) => m.id === activeThreadId) : null;

  const tabCounts = {
    salon: salonMessages.length,
    questions: questionMessages.length,
    resources: resourceMessages.length,
    exams: examMessages.length,
  };

  // ── Sidebar search — filters the country/university directory ──
  const q = searchQuery.trim().toLowerCase();
  const isSearching = q.length > 0;
  function matchesQuery(u, countryName) {
    return u.name.toLowerCase().includes(q) || u.full.toLowerCase().includes(q) || countryName.toLowerCase().includes(q);
  }
  const filteredCountries = isSearching
    ? COUNTRIES.map((country) => ({ ...country, universities: country.universities.filter((u) => matchesQuery(u, country.name)) }))
        .filter((c) => c.universities.length > 0)
    : COUNTRIES;
  const myUniMatches = !isSearching || (myUni && matchesQuery(myUni, COUNTRIES.find((c) => c.universities.some((u) => u.id === myCommunityId))?.name || ""));
  const noResults = isSearching && filteredCountries.length === 0 && !myUniMatches;

  const chatVisible = mobileView === "list" ? "hidden lg:flex" : "flex";
  const listVisible = mobileView === "chat" ? "hidden lg:flex" : "flex";
  const panelStyle = { height: "min(820px, calc(100dvh - 220px))" };
  const stats = communityStats[active];
  // Read is open to every community now, but write (cmsg_insert RLS) still
  // requires membership — hide the compose affordances rather than let the
  // user hit a rejected-insert alert when just browsing another school.
  const canPost = isAdmin || active === myCommunityId;

  function renderBubble(m) {
    const author = who(m.user_id);
    const mine = m.user_id === user.id;
    const parsed = parseCommunityContent(m.content);
    const imageKey = `community:${m.id}:${m.attachment_url || ""}`;
    return (
      <div key={m.id} className={`flex gap-2 min-w-0 ${mine ? "flex-row-reverse" : ""}`}>
        <button onClick={() => setViewUserId(m.user_id)} className="shrink-0">
          <Avatar url={author.avatar_url} pseudo={displayName(author)} size={30} />
        </button>
        <div className={`max-w-[72%] min-w-0 ${mine ? "items-end text-right" : "items-start"} flex flex-col`}>
          <span className="text-[11px] mb-0.5" style={{ color: "var(--bt-text-3)" }}>
            {displayName(author)} · {timeAgo(m.created_at, lang)}
          </span>
          <div className="rounded-2xl px-3.5 py-2.5 text-sm min-w-0"
            style={mine
              ? { backgroundColor: "var(--bt-accent)", color: "#fff", borderRadius: "18px 18px 6px 18px" }
              : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", borderRadius: "18px 18px 18px 6px" }}>
            {parsed.text && <p className="whitespace-pre-wrap break-words">{parsed.text}</p>}
            {m.attachment_url && m.attachment_type === "image" && (
              <AttachmentImageGate src={m.attachment_url} alt={m.attachment_name || "image"} mine={mine}
                loaded={revealedImages[imageKey]} onLoad={() => revealImage(imageKey)} t={t} />
            )}
            {m.attachment_url && m.attachment_type === "file" && (
              <a href={m.attachment_url} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 underline break-all"
                style={{ color: mine ? "#fff" : "var(--bt-accent-dark)" }}>
                <IconPaperclip size={13} /> {m.attachment_name || t("msg.file")}
              </a>
            )}
          </div>
          {(mine || isAdmin) && (
            <button onClick={() => remove(m.id)} className="text-[10px] mt-0.5 transition-colors"
              style={{ color: "var(--bt-text-4)" }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--bt-text-4)"}>
              {t("common.remove")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("comm.title")}</h1>
      <p className="text-sm mb-4" style={{ color: "var(--bt-text-2)" }}>{t("comm.subtitle")}</p>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-4 bt-rise">
        {/* ── Sidebar — recherche + Ton école + annuaire par pays ── */}
        <aside className={`${listVisible} lg:col-span-1 card flex-col overflow-hidden`} style={panelStyle}>
          <div className="p-3 shrink-0 relative" style={{ borderBottom: "1px solid var(--bt-border)" }}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--bt-text-4)" }}>
                <IconSearch />
              </span>
              <input className="input text-sm w-full" style={{ paddingLeft: "2.15rem" }}
                placeholder={t("comm.searchPlaceholder")}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full"
                  style={{ color: "var(--bt-text-3)" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-2 py-2">
            {noResults ? (
              <p className="text-xs px-2 py-3" style={{ color: "var(--bt-text-3)" }}>
                {t("comm.noResults").replace("{q}", searchQuery)}
              </p>
            ) : (
              <>
                {myUni ? (
                  myUniMatches && (
                    <div className="mb-2">
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>
                        {t("comm.yourSchool")}
                      </p>
                      <UniversityButton u={myUni} badge={communityCount[myUni.id] || 0}
                        isActive={active === myUni.id} size={26}
                        onClick={() => selectCommunity(myUni.id, myCountryCode)} />
                    </div>
                  )
                ) : (
                  !isSearching && (
                    <p className="text-xs px-2 pb-2" style={{ color: "var(--bt-text-3)" }}>{t("comm.noUniversity")}</p>
                  )
                )}

                {(myUni ? myUniMatches : true) && filteredCountries.length > 0 && (
                  <p className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>
                    {t("comm.allCommunities")}
                  </p>
                )}

                {filteredCountries.map((country) => {
                  const isOpen = isSearching ? true : !!openCountries[country.code];
                  const countryBadge = country.universities.reduce((s, u) => s + (communityCount[u.id] || 0), 0);
                  return (
                    <div key={country.code}>
                      <button onClick={() => toggleCountry(country.code)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-xl transition-colors text-left"
                        style={{ color: "var(--bt-text-2)" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ""}>
                        <span className="flex-1 text-xs font-semibold uppercase tracking-wide">{country.name}</span>
                        {countryBadge > 0 && !isOpen && (
                          <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none">
                            {countryBadge > 99 ? "99+" : countryBadge}
                          </span>
                        )}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: "var(--bt-text-4)" }}>
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="pl-1.5 space-y-0.5 mb-1">
                          {country.universities.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).map((u) => (
                            <UniversityButton key={u.id} u={u} badge={communityCount[u.id] || 0}
                              isActive={active === u.id}
                              onClick={() => selectCommunity(u.id, country.code)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* ── Community panel ─────────────────────────────────────── */}
        <section className={`${chatVisible} lg:col-span-3 card flex-col overflow-hidden`} style={panelStyle}>
          {!activeMeta ? (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--bt-text-3)" }}>…</div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: "1px solid var(--bt-border)" }}>
                <button onClick={() => setMobileView("list")}
                  className="lg:hidden shrink-0 w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
                  style={{ color: "var(--bt-text-2)", backgroundColor: "var(--bt-subtle)" }}
                  aria-label={t("comm.back")}>
                  <IconBack />
                </button>
                <CommunityLogo university={activeMeta} size={36} rounded={12} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--bt-text-1)" }}>{activeMeta.name}</h2>
                  <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>{activeMeta.full}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                    {t("comm.studentSpace")}
                    {stats && typeof stats.students === "number" && stats.students > 0 && (
                      <> · {stats.students === 1 ? t("comm.studentsCountOne") : t("comm.studentsCount").replace("{n}", stats.students)}</>
                    )}
                    {stats && typeof stats.activeWeek === "number" && stats.activeWeek > 0 && (
                      <> · {stats.activeWeek >= 50 ? t("comm.activeThisWeekCap") : stats.activeWeek === 1 ? t("comm.activeThisWeekOne") : t("comm.activeThisWeek").replace("{n}", stats.activeWeek)}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-4 py-2.5 flex gap-2 overflow-x-auto shrink-0" style={{ borderBottom: "1px solid var(--bt-border)" }}>
                {COMMUNITY_SPACES.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => { setCommunitySpace(space.id); setActiveThreadId(null); }}
                    className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
                    style={communitySpace === space.id
                      ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }
                      : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
                    {t(space.labelKey)}{tabCounts[space.id] > 0 ? ` · ${tabCounts[space.id]}` : ""}
                  </button>
                ))}
              </div>

              {/* Body — differs per tab, this is where the real work happens.
                  Inner wrapper keyed on the tab so a soft fade plays on switch. */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto min-w-0">
                <div key={communitySpace} className="bt-tab-fade">
                {communitySpace === "salon" && (
                  salonMessages.length === 0 ? (
                    <TabEmptyState title={t("comm.emptySalonTitle")} subtitle={t("comm.emptySalonSubtitle")} logo={activeMeta.logo} />
                  ) : (
                    <div className="px-4 py-4 space-y-3">
                      {salonMessages.map((m) => renderBubble(m))}
                      <div ref={bottomRef} />
                    </div>
                  )
                )}

                {communitySpace === "questions" && (
                  activeThreadId && activeThread ? (
                    <div className="px-4 py-4 space-y-3">
                      <button onClick={() => setActiveThreadId(null)}
                        className="text-xs font-semibold flex items-center gap-1 mb-2" style={{ color: "var(--bt-accent-dark)" }}>
                        <IconBack size={11} /> {t("comm.spaceQuestions")}
                      </button>
                      <div className="rounded-2xl p-3.5" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                        <p className="text-sm font-semibold break-words" style={{ color: "var(--bt-text-1)" }}>
                          {parseCommunityContent(activeThread.content).text}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--bt-text-3)" }}>
                          {t("comm.by").replace("{name}", displayName(who(activeThread.user_id)))} · {timeAgo(activeThread.created_at, lang)}
                          {(activeThread.user_id === user.id || isAdmin) && (
                            <>
                              {" · "}
                              <button onClick={() => { remove(activeThread.id); setActiveThreadId(null); }}
                                className="transition-colors" style={{ color: "var(--bt-text-4)" }}
                                onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                                onMouseLeave={(e) => e.currentTarget.style.color = "var(--bt-text-4)"}>
                                {t("common.remove")}
                              </button>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="space-y-3 pt-1">
                        {repliesFor(activeThreadId).map((m) => renderBubble(m))}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-4">
                      {!canPost ? (
                        <p className="text-xs text-center mb-3" style={{ color: "var(--bt-text-3)" }}>{t("comm.readOnlyNotice")}</p>
                      ) : showQuestionForm ? (
                        <form onSubmit={submitQuestion} className="rounded-2xl p-3 mb-3" style={{ border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                          <textarea autoFocus rows={2} className="input w-full resize-none" placeholder={t("comm.questionTitlePlaceholder")}
                            maxLength={TEXT_LIMITS.communityMessage} value={questionTitle} onChange={(e) => setQuestionTitle(e.target.value)} />
                          <div className="flex justify-end gap-2 mt-2">
                            <button type="button" onClick={() => { setShowQuestionForm(false); setQuestionTitle(""); }} className="btn-ghost text-xs px-3 py-1.5">{t("common.cancel")}</button>
                            <button className="btn-primary text-xs px-3 py-1.5" disabled={sendingForm || !questionTitle.trim()}>{sendingForm ? "…" : t("comm.submitQuestion")}</button>
                          </div>
                        </form>
                      ) : (
                        <button onClick={() => setShowQuestionForm(true)}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl mb-3 transition-colors"
                          style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }}>
                          <IconPlus /> {t("comm.askQuestion")}
                        </button>
                      )}
                      {questionMessages.length === 0 ? (
                        <TabEmptyState title={t("comm.emptyQuestionsTitle")} subtitle={t("comm.emptyQuestionsSubtitle")} logo={activeMeta.logo} />
                      ) : (
                        <ul className="space-y-2">
                          {[...questionMessages].reverse().map((qm) => {
                            const author = who(qm.user_id);
                            const replyCount = repliesFor(qm.id).length;
                            return (
                              <li key={qm.id} className="relative rounded-2xl transition-colors"
                                style={{ border: "1px solid var(--bt-border)" }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ""}>
                                <button onClick={() => setActiveThreadId(qm.id)} className="w-full text-left p-3.5">
                                  <p className="text-sm font-semibold mb-1 break-words pr-14"
                                    style={{ color: "var(--bt-text-1)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                    {parseCommunityContent(qm.content).text}
                                  </p>
                                  <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                                    {t("comm.by").replace("{name}", displayName(author))} · {timeAgo(qm.created_at, lang)} · {
                                      replyCount === 0 ? t("comm.repliesCountZero")
                                        : replyCount === 1 ? t("comm.repliesCountOne")
                                        : t("comm.repliesCount").replace("{n}", replyCount)
                                    }
                                  </p>
                                </button>
                                {(qm.user_id === user.id || isAdmin) && (
                                  <button onClick={(e) => { e.stopPropagation(); remove(qm.id); }}
                                    className="absolute top-3 right-3 text-[10px] transition-colors"
                                    style={{ color: "var(--bt-text-4)" }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                                    onMouseLeave={(e) => e.currentTarget.style.color = "var(--bt-text-4)"}>
                                    {t("common.remove")}
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )
                )}

                {communitySpace === "resources" && (
                  <div className="px-4 py-4">
                    {!canPost ? (
                      <p className="text-xs text-center mb-3" style={{ color: "var(--bt-text-3)" }}>{t("comm.readOnlyNotice")}</p>
                    ) : showResourceForm ? (
                      <form onSubmit={submitResource} className="rounded-2xl p-3 mb-3" style={{ border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <label className="btn-ghost cursor-pointer px-3 py-1.5 text-xs shrink-0 flex items-center gap-1.5">
                            <IconPaperclip size={13} />
                            {t("common.attach")}
                            <input ref={resourceFileInputRef} type="file" accept={CHAT_ACCEPT} className="hidden" onChange={(e) => pickFile(e.currentTarget, setResourceFile)} />
                          </label>
                          {resourceFile && <span className="text-xs truncate flex-1" style={{ color: "var(--bt-text-2)" }}>{resourceFile.name}</span>}
                        </div>
                        <input className="input w-full" placeholder={t("comm.resourceDescPlaceholder")} maxLength={TEXT_LIMITS.communityMessage}
                          value={resourceDesc} onChange={(e) => setResourceDesc(e.target.value)} />
                        <div className="flex justify-end gap-2 mt-2">
                          <button type="button" onClick={() => {
                            setShowResourceForm(false); setResourceDesc(""); setResourceFile(null);
                            if (resourceFileInputRef.current) resourceFileInputRef.current.value = "";
                          }} className="btn-ghost text-xs px-3 py-1.5">{t("common.cancel")}</button>
                          <button className="btn-primary text-xs px-3 py-1.5" disabled={sendingForm || (!resourceDesc.trim() && !resourceFile)}>
                            {sendingForm ? "…" : t("comm.submitResource")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => setShowResourceForm(true)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl mb-3 transition-colors"
                        style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }}>
                        <IconPlus /> {t("comm.shareResource")}
                      </button>
                    )}
                    {resourceMessages.length === 0 ? (
                      <TabEmptyState title={t("comm.emptyResourcesTitle")} subtitle={t("comm.emptyResourcesSubtitle")} logo={activeMeta.logo} />
                    ) : (
                      <ul className="space-y-2">
                        {[...resourceMessages].reverse().map((rm) => {
                          const author = who(rm.user_id);
                          const parsed = parseCommunityContent(rm.content);
                          const imageKey = `community:${rm.id}:${rm.attachment_url || ""}`;
                          return (
                            <li key={rm.id} className="rounded-2xl p-3.5" style={{ border: "1px solid var(--bt-border)" }}>
                              <p className="text-xs mb-1.5" style={{ color: "var(--bt-text-3)" }}>
                                {t("comm.by").replace("{name}", displayName(author))} · {timeAgo(rm.created_at, lang)}
                              </p>
                              {parsed.text && <p className="text-sm break-words mb-2" style={{ color: "var(--bt-text-1)" }}>{parsed.text}</p>}
                              {rm.attachment_url && rm.attachment_type === "image" && (
                                <AttachmentImageGate src={rm.attachment_url} alt={rm.attachment_name || "image"} mine={rm.user_id === user.id}
                                  loaded={revealedImages[imageKey]} onLoad={() => revealImage(imageKey)} t={t} />
                              )}
                              {rm.attachment_url && rm.attachment_type === "file" && (
                                <a href={rm.attachment_url} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-2 underline break-all text-sm" style={{ color: "var(--bt-accent-dark)" }}>
                                  <IconPaperclip size={13} /> {rm.attachment_name || t("msg.file")}
                                </a>
                              )}
                              {(rm.user_id === user.id || isAdmin) && (
                                <button onClick={() => remove(rm.id)} className="block text-[10px] mt-2" style={{ color: "var(--bt-text-4)" }}>{t("common.remove")}</button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {communitySpace === "exams" && (
                  <div className="px-4 py-4">
                    {!canPost ? (
                      <p className="text-xs text-center mb-3" style={{ color: "var(--bt-text-3)" }}>{t("comm.readOnlyNotice")}</p>
                    ) : showExamForm ? (
                      <form onSubmit={submitExam} className="rounded-2xl p-3 mb-3" style={{ border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                        <input className="input w-full mb-2" placeholder={t("comm.examNamePlaceholder")} maxLength={TEXT_LIMITS.communityMessage}
                          value={examName} onChange={(e) => setExamName(e.target.value)} />
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold shrink-0" style={{ color: "var(--bt-text-2)" }}>{t("comm.examDateLabel")}</label>
                          <input type="date" className="input flex-1" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button type="button" onClick={() => { setShowExamForm(false); setExamName(""); setExamDate(""); }} className="btn-ghost text-xs px-3 py-1.5">{t("common.cancel")}</button>
                          <button className="btn-primary text-xs px-3 py-1.5" disabled={sendingForm || !examName.trim()}>{sendingForm ? "…" : t("comm.submitExam")}</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => setShowExamForm(true)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl mb-3 transition-colors"
                        style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }}>
                        <IconPlus /> {t("comm.addExam")}
                      </button>
                    )}
                    {sortedExamMessages.length === 0 ? (
                      <TabEmptyState title={t("comm.emptyExamsTitle")} subtitle={t("comm.emptyExamsSubtitle")} logo={activeMeta.logo} />
                    ) : (
                      <ul className="space-y-2">
                        {sortedExamMessages.map((em) => {
                          const author = who(em.user_id);
                          const parsed = parseCommunityContent(em.content);
                          const days = daysUntil(em.exam_date);
                          return (
                            <li key={em.id} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ border: "1px solid var(--bt-border)" }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold break-words" style={{ color: "var(--bt-text-1)" }}>{parsed.text}</p>
                                <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                                  {t("comm.by").replace("{name}", displayName(author))} · {timeAgo(em.created_at, lang)}
                                </p>
                                {em.exam_date && (
                                  <button onClick={() => addExamToPlanning(em)} disabled={planningAdded[em.id]}
                                    className="text-xs font-semibold mt-1.5" style={{ color: planningAdded[em.id] ? "var(--bt-text-3)" : "var(--bt-accent-dark)" }}>
                                    {planningAdded[em.id] ? t("comm.addedToPlanning") : t("comm.addToMyPlanning")}
                                  </button>
                                )}
                              </div>
                              <ExamDateBadge days={days} t={t} />
                              {(em.user_id === user.id || isAdmin) && (
                                <button onClick={() => remove(em.id)} className="text-[10px] shrink-0" style={{ color: "var(--bt-text-4)" }}>{t("common.remove")}</button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
                </div>
              </div>

              {/* Composer — Salon only; other tabs use their own inline forms.
                  Hidden (read-only notice instead) when just browsing another
                  school: RLS still allows read, but insert stays membership-only. */}
              {communitySpace === "salon" && !activeThreadId && (
                canPost ? (
                  <form onSubmit={sendSalon} className="p-3 flex items-center gap-2 shrink-0" style={{ borderTop: "1px solid var(--bt-border)" }}>
                    <label className="btn-ghost cursor-pointer px-3 shrink-0" title={t("common.attach")}>
                      <IconPaperclip />
                      <input ref={fileInputRef} type="file" accept={CHAT_ACCEPT} className="hidden" onChange={(e) => pickFile(e.currentTarget, setFile)} />
                    </label>
                    <input className="input flex-1"
                      placeholder={file ? `${t("msg.file")} : ${file.name}` : t("comm.placeholder.salon")}
                      maxLength={TEXT_LIMITS.communityMessage}
                      value={text} onChange={(e) => setText(e.target.value)} />
                    <button className="btn-primary shrink-0" disabled={sending || (!text.trim() && !file)}>
                      {sending ? "…" : t("common.send")}
                    </button>
                  </form>
                ) : (
                  <p className="p-3 text-xs text-center shrink-0" style={{ color: "var(--bt-text-3)", borderTop: "1px solid var(--bt-border)" }}>
                    {t("comm.readOnlyNotice")}
                  </p>
                )
              )}

              {communitySpace === "questions" && activeThreadId && (
                canPost ? (
                  <form onSubmit={submitReply} className="p-3 flex items-center gap-2 shrink-0" style={{ borderTop: "1px solid var(--bt-border)" }}>
                    <input className="input flex-1" placeholder={t("comm.replyPlaceholder")}
                      maxLength={TEXT_LIMITS.communityMessage}
                      value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                    <button className="btn-primary shrink-0" disabled={sendingForm || !replyText.trim()}>
                      {sendingForm ? "…" : t("common.send")}
                    </button>
                  </form>
                ) : (
                  <p className="p-3 text-xs text-center shrink-0" style={{ color: "var(--bt-text-3)", borderTop: "1px solid var(--bt-border)" }}>
                    {t("comm.readOnlyNotice")}
                  </p>
                )
              )}
            </>
          )}
        </section>
      </div>

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
