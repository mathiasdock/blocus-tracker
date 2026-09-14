import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "./Layout";
import Glyph from "./Glyph";
import InboxSheet from "./InboxSheet";
import UniPicker from "./UniPicker";
import UserProfileModal from "./UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { useNotifications } from "../contexts/NotificationContext";
import { supabase, isOfflineDev } from "../lib/supabaseClient";
import { displayName, timeAgo } from "../lib/format";
import { COMMUNITY_BY_ID } from "../lib/universities";
import { STUDY_FIELDS, CONTENT_TYPES, spaceLabel, ancestorSpaces, broaderSpaces, parseStudyPost } from "../lib/studySpaces.mjs";
import { fetchStudyDirectory, ensureStudySpace, joinStudySpace, requireData, POST_COLUMNS, SPACE_COLUMNS } from "../lib/studySpacesClient";
import { studySpacesCopy } from "../lib/studySpacesCopy";
import { validateUploadFile, safeStoragePath, attachmentKind, sanitizeFileName, uploadErrorMessage } from "../lib/security";
import { optimizeFeedImage } from "../lib/imageCompression";
import { notifyXPChanged } from "../lib/xpEvents";

// Operate: personal study spaces, one typed timeline, explicit routes toward
// broader cohorts. Preserve the warm surfaces and continuous mobile panels.
// Memberships and posts here are public to signed-in students; Friends stays private.
const PAGE_SIZE = 30;
const NEW_SPACE = { kind: "course", name: "", parent_id: "", field_id: "", exam_date: "" };
function Icon({ name, size = 20 }) {
  const paths = {
    university: <path d="m3 9 9-6 9 6M4 10h16M6 10v9m6-9v9m6-9v9M3 21h18" />,
    field: <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m7 9 4 6m6-6-4 6M9 6h6"/></>,
    program: <path d="m2 8 10-5 10 5-10 5-10-5Zm4 2v7c4 3 8 3 12 0v-7M22 8v8"/>,
    course: <path d="M4 4h6l2 2 2-2h6v16h-6l-2 1-2-1H4V4ZM12 6v15"/>,
    exam: <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5"/></>,
    hub: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></>,
    back: <path d="m14 5-7 7 7 7"/>, plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/></>, arrow: <path d="m9 5 7 7-7 7"/>,
    discussion: <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/>,
    question: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/></>,
    resource: <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6"/>,
  };
  return <Glyph size={size}>{paths[name] || paths.discussion}</Glyph>;
}
function SpaceMark({ space }) {
  const logo = COMMUNITY_BY_ID[space.id]?.logo;
  const [failed, setFailed] = useState(false);
  return <span className={`bt-space-mark ${space.kind === "course" ? "is-course" : ""}`}>
    {logo && !failed
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={logo} alt="" width="32" height="32" onError={() => setFailed(true)} />
      : <Icon name={space.kind} />}
  </span>;
}

export default function StudyCommunities() {
  const { user, profile } = useAuth();
  const { lang, t } = useI18n();
  const copy = studySpacesCopy[lang === "fr" ? "fr" : "en"];
  const { toast } = useToast();
  const { markSeen, communityCount } = useNotifications();
  const [directory, setDirectory] = useState({ spaces: [], memberships: [], results: [] });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [posts, setPosts] = useState([]);
  const [authors, setAuthors] = useState({});
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [thread, setThread] = useState(null);
  const [replies, setReplies] = useState([]);
  const [reply, setReply] = useState("");
  const [threadError, setThreadError] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyMore, setReplyMore] = useState(false);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState("");
  const [postType, setPostType] = useState("discussion");
  const [examDate, setExamDate] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSpace, setNewSpace] = useState(NEW_SPACE);
  const [formError, setFormError] = useState("");
  const [viewUserId, setViewUserId] = useState(null);
  const [addedExams, setAddedExams] = useState({});
  const [openingAttachment, setOpeningAttachment] = useState(null);
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const directoryRequest = useRef(0), postRequest = useRef(0), threadRequest = useRef(0);
  const scroller = useRef(null);
  const active = directory.spaces.find(space => space.id === activeId);
  const joined = directory.memberships.includes(activeId);
  const mySpaces = directory.spaces.filter(space => directory.memberships.includes(space.id));
  const wider = broaderSpaces(active, directory.spaces).slice(0, 2);
  const children = directory.spaces.filter(space => space.parent_id === activeId && space.kind !== "university");
  const BroaderPanel = Number(active?.recent_posts) >= 3 ? "details" : "aside";
  const BroaderHeading = Number(active?.recent_posts) >= 3 ? "summary" : "div";

  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const refreshDirectory = useCallback(async (sync = false) => {
    if (!user) return;
    const request = ++directoryRequest.current;
    setLoading(true); setError(false);
    try {
      if (sync) {
        const result = await supabase.rpc("sync_my_study_spaces");
        if (request === directoryRequest.current) setSyncError(!!result.error);
      }
      const result = await fetchStudyDirectory(user.id, search);
      if (request !== directoryRequest.current) return;
      setDirectory(previous => ({ ...result, spaces: [...new Map([...previous.spaces, ...result.spaces].map(space => [space.id, space])).values()] }));
      setActiveId(previous => previous || result.memberships[0] || "study-hub");
    } catch { if (request === directoryRequest.current) setError(true); }
    finally { if (request === directoryRequest.current) setLoading(false); }
  }, [user, search]);
  useEffect(() => { refreshDirectory(true); return () => { directoryRequest.current += 1; }; }, [refreshDirectory, profile?.university, profile?.study_field, profile?.broad_field]);
  useEffect(() => {
    document.documentElement.classList.toggle("bt-chat-fullscreen", mobileOpen);
    return () => document.documentElement.classList.remove("bt-chat-fullscreen");
  }, [mobileOpen]);
  useEffect(() => {
    if (!activeId || !user) return undefined;
    let cancelled = false;
    supabase.from("study_space_directory").select(SPACE_COLUMNS).eq("parent_id", activeId)
      .order("recent_posts", { ascending: false }).limit(40).then(result => {
        if (!cancelled && result.data) setDirectory(previous => ({ ...previous, spaces: [...new Map([...previous.spaces, ...result.data].map(space => [space.id, space])).values()] }));
      });
    return () => { cancelled = true; };
  }, [activeId, user]);

  const loadAuthors = useCallback(async rows => {
    const ids = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
    if (!ids.length) return;
    const result = await supabase.from("profiles").select("id,pseudo,first_name,last_name,avatar_url").in("id", ids);
    if (result.data) setAuthors(previous => ({ ...previous, ...Object.fromEntries(result.data.map(author => [author.id, author])) }));
  }, []);
  const loadPosts = useCallback(async (cursor = null, background = false) => {
    if (!activeId || !user) return;
    const request = ++postRequest.current;
    if (!background) setPostLoading(true);
    setPostError(false);
    try {
      let requestQuery = supabase.from("community_messages").select(POST_COLUMNS).eq("community", activeId).is("parent_id", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
      if (filter !== "all") requestQuery = requestQuery.eq("content_type", filter);
      if (cursor) requestQuery = requestQuery.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      const rows = requireData(await requestQuery) || [];
      if (request !== postRequest.current) return;
      setPosts(previous => cursor ? [...previous, ...rows.filter(row => !previous.some(item => item.id === row.id))] : rows);
      setHasMore(rows.length === PAGE_SIZE); loadAuthors(rows);
      if (window.matchMedia("(min-width: 1024px)").matches || document.documentElement.classList.contains("bt-chat-fullscreen")) markSeen(activeId);
    } catch { if (request === postRequest.current) setPostError(true); }
    finally { if (request === postRequest.current) setPostLoading(false); }
  }, [activeId, user, filter, loadAuthors, markSeen]);
  useEffect(() => {
    setPosts([]); setHasMore(false); loadPosts();
    if (scroller.current) scroller.current.scrollTop = 0;
    return () => { postRequest.current += 1; };
  }, [loadPosts]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && posts.length <= PAGE_SIZE && (scroller.current?.scrollTop || 0) < 80 && !compose && !thread) loadPosts(null, true);
    }, 30000);
    return () => clearInterval(timer);
  }, [loadPosts, posts.length, compose, thread]);
  function openSpace(space) {
    markSeen(space.id);
    setActiveId(space.id); setMobileOpen(true); setFilter("all"); setThread(null); setReply(""); setFormError("");
  }
  async function membership(spaceId, leave = false) {
    if (busy) return;
    setBusy(true);
    try {
      if (leave) requireData(await supabase.from("study_space_members").delete().eq("user_id", user.id).eq("space_id", spaceId));
      else await joinStudySpace(user.id, spaceId);
      await refreshDirectory();
    } catch { toast(copy.saveError, "error"); }
    finally { setBusy(false); }
  }
  function startCreate() {
    const parent = active && ["university", "field", "program", "course"].includes(active.kind) && (active.kind === "university" || active.university_id) ? active : mySpaces.find(space => space.kind === "university");
    setNewSpace({ ...NEW_SPACE, kind: parent?.kind === "course" ? "exam" : "course", parent_id: parent?.id || "" });
    setFormError(""); setCreating(true);
  }
  async function createSpace(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFormError("");
    try {
      const values = { ...newSpace };
      if (values.kind === "field") {
        const field = STUDY_FIELDS.find(item => item.id === values.field_id);
        if (!field) throw new Error(copy.fieldRequired);
        values.name = field.en;
      }
      if (values.kind !== "university" && !values.parent_id) throw new Error(copy.parentRequired);
      const id = await ensureStudySpace(values);
      await joinStudySpace(user.id, id); await refreshDirectory();
      setActiveId(id); setMobileOpen(true); setFilter("all"); setCreating(false);
    } catch (failure) { setFormError([copy.fieldRequired, copy.parentRequired].includes(failure.message) ? failure.message : copy.saveError); }
    finally { setBusy(false); }
  }
  async function post(event, parentId = null) {
    event.preventDefault();
    if (busy || !joined || !(parentId ? reply.trim() : draft.trim() || file)) return;
    setBusy(true); setFormError("");
    let uploadedPath = null, committed = false;
    try {
      const row = { community: activeId, user_id: user.id, content: (parentId ? reply : draft).trim() || null,
        content_type: parentId ? "discussion" : postType, parent_id: parentId,
        exam_date: !parentId && postType === "exam" ? examDate || null : null };
      if (file && !parentId) {
        const check = validateUploadFile(file, "chatAttachment");
        if (!check.ok) throw new Error(uploadErrorMessage(t, check));
        const optimized = await optimizeFeedImage(file).catch(() => null);
        const finalFile = optimized?.file || file;
        const info = safeStoragePath(user.id, finalFile, [activeId], "chatAttachment");
        if (!info.ok) throw new Error(uploadErrorMessage(t, info));
        requireData(await supabase.storage.from("community").upload(info.path, finalFile, { contentType: info.contentType, cacheControl: "31536000" }));
        uploadedPath = info.path;
        Object.assign(row, { attachment_url: `community:${info.path}`, attachment_type: attachmentKind(finalFile), attachment_name: sanitizeFileName(file.name) });
      }
      requireData(await supabase.from("community_messages").insert(row));
      committed = true; notifyXPChanged();
      if (parentId) { setReply(""); await loadReplies(thread); }
      else { setDraft(""); setFile(null); setExamDate(""); setCompose(false); setFilter("all"); await loadPosts(); }
      refreshDirectory();
    } catch {
      if (uploadedPath && !committed) await supabase.storage.from("community").remove([uploadedPath]);
      setFormError(copy.saveError);
    } finally { setBusy(false); }
  }
  async function loadReplies(root, more = false) {
    const request = ++threadRequest.current;
    setThreadLoading(true); setThreadError(false);
    try {
      let requestQuery = supabase.from("community_messages").select(POST_COLUMNS).eq("community", root.community).eq("parent_id", root.id)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
      const cursor = more ? replies[replies.length - 1] : null;
      if (cursor) requestQuery = requestQuery.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      const rows = requireData(await requestQuery) || [];
      if (request !== threadRequest.current) return;
      setReplies(previous => more ? [...previous, ...rows] : rows); setReplyMore(rows.length === PAGE_SIZE); loadAuthors(rows);
    } catch { if (request === threadRequest.current) setThreadError(true); }
    finally { if (request === threadRequest.current) setThreadLoading(false); }
  }
  function openThread(root) { setThread(root); setReplies([]); setReply(""); setFormError(""); loadReplies(root); }
  function closeThread() { if (!busy) { threadRequest.current += 1; setThread(null); } }
  async function removePost(row) {
    if (!window.confirm(copy.deleteConfirm)) return;
    try {
      requireData(await supabase.from("community_messages").delete().eq("id", row.id));
      if (row.parent_id) loadReplies(thread); else { setThread(null); loadPosts(); }
      refreshDirectory();
    } catch { toast(copy.saveError, "error"); }
  }
  async function addExam(row) {
    if (addedExams[row.id]) return;
    setAddedExams(previous => ({ ...previous, [row.id]: "saving" }));
    try {
      requireData(await supabase.from("exams").insert({ user_id: user.id, name: parseStudyPost(row).text, exam_date: row.exam_date, course_id: null }));
      setAddedExams(previous => ({ ...previous, [row.id]: "done" })); notifyXPChanged();
    } catch { setAddedExams(previous => ({ ...previous, [row.id]: null })); toast(copy.saveError, "error"); }
  }
  async function revealAttachment(row) {
    setOpeningAttachment(row.id);
    try {
      let url;
      if (isOfflineDev) url = row.attachment_url.startsWith("https:") ? row.attachment_url : "/offline-upload/community/preview";
      else {
        const session = requireData(await supabase.auth.getSession());
        const response = await fetch("/api/storage/sign", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token}` }, body: JSON.stringify({ bucket: "community", ref: row.attachment_url }) });
        if (!response.ok) throw new Error("attachment");
        url = (await response.json()).signedUrl;
      }
      if (!url) throw new Error("attachment");
      setAttachmentUrls(previous => ({ ...previous, [row.id]: url }));
    } catch { toast(copy.error, "error"); }
    finally { setOpeningAttachment(null); }
  }

  function renderSpace(space, compact = false) {
    const university = directory.spaces.find(item => item.id === space.university_id);
    return <button key={space.id} type="button" className={`bt-space-row ${activeId === space.id ? "is-selected" : ""} ${compact ? "is-compact" : ""}`} onClick={() => openSpace(space)} aria-current={activeId === space.id ? "true" : undefined}>
      <SpaceMark space={space}/><span className="min-w-0 flex-1"><strong>{spaceLabel(space, lang)}</strong><small>{copy[space.kind]}{university ? ` · ${COMMUNITY_BY_ID[university.id]?.name || university.name}` : space.kind === "field" ? ` · ${copy.hub}` : ""}</small>
        {!compact && <small>{Number(space.recent_posts) > 0 ? `${space.recent_posts} ${copy.recent}` : Number(space.member_count) > 0 ? `${space.member_count} ${Number(space.member_count) === 1 ? copy.member : copy.members}` : copy.fresh}</small>}</span>
      {communityCount[space.id] > 0 ? <span className="bt-space-unread">{communityCount[space.id]}</span> : <Icon name="arrow" size={16}/>}
    </button>;
  }
  function renderPost(row, inThread = false) {
    const author = authors[row.user_id] || { pseudo: "…" };
    const parsed = parseStudyPost(row);
    return <article key={row.id} className="bt-study-post">
      <header><button type="button" onClick={() => { closeThread(); setViewUserId(row.user_id); }} className="bt-study-author"><Avatar url={author.avatar_url} pseudo={displayName(author)} size={32}/><span><strong>{displayName(author)}</strong><small>{timeAgo(row.created_at, lang)}</small></span></button>{!row.parent_id && <span className="bt-study-type"><Icon name={parsed.type} size={14}/>{copy[parsed.type]}</span>}</header>
      {parsed.text && <p className="bt-study-post-text">{parsed.text}</p>}
      {row.exam_date && <div className="bt-study-exam"><Icon name="exam" size={18}/><time dateTime={row.exam_date}>{new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(`${row.exam_date}T12:00:00`))}</time><button type="button" disabled={!!addedExams[row.id]} onClick={() => addExam(row)}>{addedExams[row.id] === "done" ? copy.addedPlanning : copy.addPlanning}</button></div>}
      {row.attachment_url && <div className="bt-study-attachment">{attachmentUrls[row.id] ? <>
        {row.attachment_type === "image" &&
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachmentUrls[row.id]} alt={row.attachment_name || copy.untitled} loading="lazy"/>}
        <a href={attachmentUrls[row.id]} target="_blank" rel="noreferrer">{row.attachment_name || copy.openAttachment}</a>
      </> : <button type="button" onClick={() => revealAttachment(row)} disabled={openingAttachment === row.id}><Icon name="resource" size={18}/>{openingAttachment === row.id ? copy.loading : row.attachment_name || copy.openAttachment}</button>}</div>}
      <footer>{!inThread && <button type="button" onClick={() => openThread(row)}><Icon name="discussion" size={16}/>{copy.reply}</button>}{(row.user_id === user?.id || profile?.is_admin) && <details className="bt-study-post-actions"><summary aria-label={copy.postActions}><Glyph size={18}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></Glyph></summary><button type="button" onClick={event => { event.currentTarget.closest("details").open = false; removePost(row); }}>{copy.delete}</button></details>}</footer>
    </article>;
  }
  const compatibleParents = directory.spaces.filter(space => {
    if (newSpace.kind === "field") return space.kind === "university";
    if (newSpace.kind === "program") return space.kind === "university" || (space.kind === "field" && space.university_id);
    if (newSpace.kind === "exam") return space.kind === "course";
    return space.kind === "university" || (["field", "program"].includes(space.kind) && space.university_id);
  });
  const discoveries = directory.spaces.filter(space => directory.results.includes(space.id) && (search || !directory.memberships.includes(space.id)))
    .sort((a, b) => Number(b.field_id === profile?.broad_field && !!profile?.broad_field) - Number(a.field_id === profile?.broad_field && !!profile?.broad_field) || Number(b.recent_posts) - Number(a.recent_posts));

  return <div className={`bt-study-spaces bt-social-fill-grid ${mobileOpen ? "is-open" : ""}`}>
    <aside className="bt-study-directory card bt-social-panel">
      <header className="bt-study-directory-head"><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div><button className="bt-feed-icon-btn" type="button" onClick={startCreate} aria-label={copy.create}><Icon name="plus"/></button></header>
      <div className="bt-study-search"><Icon name="search" size={18}/><input className="input" aria-label={copy.search} placeholder={copy.search} value={query} onChange={event => setQuery(event.target.value)} maxLength={120}/></div>
      <div className="bt-study-directory-scroll">
        {error && <div className="bt-study-status" role="alert"><p>{copy.error}</p><button className="btn-ghost" onClick={() => refreshDirectory(true)}>{copy.retry}</button></div>}
        {syncError && <div className="bt-study-status" role="status"><p>{copy.syncError}</p><Link href="/profile">{copy.profile}</Link></div>}
        {loading && !directory.spaces.length && <p className="bt-study-status" role="status">{copy.loading}</p>}
        {!search && <section><h2 className="bt-study-section-title">{copy.yours}</h2>{mySpaces.map(space => renderSpace(space))}
          {!loading && !mySpaces.length && <div className="bt-study-status"><strong>{copy.noMembership}</strong><p>{copy.noMembershipBody}</p><Link href="/profile">{copy.profile}</Link></div>}
          {!!mySpaces.length && !profile?.broad_field && <Link href="/profile" className="bt-study-profile-hint"><Icon name="field" size={18}/><span>{copy.profileHint}</span><Icon name="arrow" size={16}/></Link>}
        </section>}
        <section><h2 className="bt-study-section-title">{search ? copy.search.replace("…", "") : copy.discover}</h2>{discoveries.map(space => renderSpace(space, !search))}
          {!loading && !discoveries.length && <div className="bt-study-status"><strong>{copy.noResults}</strong><p>{copy.noResultsBody}</p><button className="btn-ghost" onClick={startCreate}>{copy.create}</button></div>}
          {search && discoveries.length >= 40 && <p className="bt-study-status">{copy.moreSearch}</p>}
        </section>
      </div>
    </aside>
    <section className={`bt-study-timeline card bt-social-panel ${mobileOpen ? "bt-social-panel--chat" : ""}`} aria-label={active ? spaceLabel(active, lang) : copy.title}>
      {active ? <>
        <header className="bt-study-space-header"><button className="bt-feed-icon-btn lg:hidden" type="button" onClick={() => setMobileOpen(false)} aria-label={copy.back}><Icon name="back"/></button><SpaceMark space={active}/><div className="min-w-0 flex-1"><h2>{spaceLabel(active, lang)}</h2><p>{copy[active.kind]} · {active.member_count} {Number(active.member_count) === 1 ? copy.member : copy.members}</p></div><button type="button" className={joined ? "btn-ghost" : "btn-primary"} disabled={busy} onClick={() => membership(activeId, joined)}>{joined ? copy.leave : copy.join}</button></header>
        <nav className="bt-study-breadcrumbs" data-no-swipe aria-label={copy.parent}>{ancestorSpaces(active, directory.spaces).map(space => <button type="button" key={space.id} onClick={() => openSpace(space)}>{COMMUNITY_BY_ID[space.id]?.name || spaceLabel(space, lang)}<Icon name="arrow" size={12}/></button>)}<span>{spaceLabel(active, lang)}</span></nav>
        <div className="bt-study-filter-bar" data-no-swipe>{["all", ...CONTENT_TYPES].map(type => <button type="button" key={type} aria-pressed={filter === type} className={filter === type ? "is-active" : ""} onClick={() => setFilter(type)}>{copy[type]}</button>)}</div>
        <div className="bt-study-posts" ref={scroller}>
          {wider.length > 0 && <BroaderPanel key={active.id} className="bt-study-broader"><BroaderHeading><Icon name="field" size={18}/><strong>{Number(active.recent_posts) < 3 ? copy.wider : copy.activeWider}</strong>{Number(active.recent_posts) >= 3 && <Icon name="arrow" size={14}/>}</BroaderHeading>{Number(active.recent_posts) < 3 && <p>{copy.quiet}</p>}<div className="bt-study-broader-links">{wider.map(space => <button type="button" key={space.id} onClick={() => openSpace(space)}>{spaceLabel(space, lang)}{Number(space.recent_posts) > 0 && <small>{space.recent_posts} {copy.recent}</small>}<Icon name="arrow" size={14}/></button>)}</div></BroaderPanel>}
          {children.length > 0 && <details className="bt-study-children"><summary>{copy.children} · {children.length}</summary>{children.map(space => renderSpace(space, true))}</details>}
          <div className="bt-study-composer-prompt"><button type="button" disabled={!joined} onClick={() => { setFormError(""); setCompose(true); }}><Icon name="plus" size={18}/>{joined ? copy.compose : copy.readOnly}</button></div>
          {postError && <div className="bt-study-status" role="alert"><p>{copy.error}</p><button className="btn-ghost" onClick={() => loadPosts()}>{copy.retry}</button></div>}
          {postLoading && !posts.length ? <p className="bt-study-status" role="status">{copy.loading}</p> : !postError && !posts.length && <div className="bt-study-empty"><Icon name={filter === "all" ? "discussion" : filter} size={32}/><h3>{filter === "all" ? copy.noPosts : copy.noFilteredPosts.replace("{type}", copy[filter])}</h3><p>{filter === "all" ? copy.noPostsBody : copy.noFilteredPostsBody}</p>{filter !== "all" ? <button className="btn-primary" onClick={() => setFilter("all")}>{copy.showAll}</button> : joined && <button className="btn-primary" onClick={() => { setFormError(""); setCompose(true); }}>{copy.newPost}</button>}</div>}
          {posts.map(row => renderPost(row))}{hasMore && <button className="btn-ghost bt-study-load-more" disabled={postLoading} onClick={() => loadPosts(posts[posts.length - 1])}>{postLoading ? copy.loading : copy.loadMore}</button>}
        </div><footer className="bt-study-space-foot"><span>{isOfflineDev ? copy.demo : copy[active.kind]}</span><button type="button" onClick={startCreate}><Icon name="plus" size={16}/>{copy.create}</button></footer>
      </> : <div className="bt-study-empty"><Icon name="field" size={36}/><h2>{copy.title}</h2><p>{loading ? copy.loading : copy.noMembershipBody}</p></div>}
    </section>
    <InboxSheet open={creating} title={copy.create} closeLabel={copy.close} onClose={() => { if (!busy) setCreating(false); }}>
      <form onSubmit={createSpace} className="bt-study-form"><p>{copy.createHint}</p><label>{copy.create}<select className="input" value={newSpace.kind} onChange={event => setNewSpace(previous => ({ ...previous, kind: event.target.value, parent_id: "", name: "" }))}>{["university", "field", "program", "course", "exam"].map(kind => <option key={kind} value={kind}>{copy[kind]}</option>)}</select></label>
        {newSpace.kind === "university" ? <div><label className="label" htmlFor="space-university">{copy.university}</label><UniPicker id="space-university" value={newSpace.name} onChange={name => setNewSpace(previous => ({ ...previous, name }))}/><p>{copy.universityHint}</p></div> : <label>{copy.parent}<select className="input" required value={newSpace.parent_id} onChange={event => setNewSpace(previous => ({ ...previous, parent_id: event.target.value }))}><option value="">{copy.parent}</option>{compatibleParents.map(space => <option key={space.id} value={space.id}>{spaceLabel(space, lang)}{space.university_id ? ` · ${COMMUNITY_BY_ID[space.university_id]?.name || directory.spaces.find(item => item.id === space.university_id)?.name || ""}` : ""}</option>)}</select><small>{copy.parentHint}</small></label>}
        {newSpace.kind === "field" ? <label>{copy.field}<select className="input" required value={newSpace.field_id} onChange={event => setNewSpace(previous => ({ ...previous, field_id: event.target.value }))}><option value="">{copy.fieldRequired}</option>{STUDY_FIELDS.map(field => <option value={field.id} key={field.id}>{field[lang === "fr" ? "fr" : "en"]}</option>)}</select></label> : newSpace.kind !== "university" && <label>{copy.name}<input className="input" required minLength={2} maxLength={180} value={newSpace.name} onChange={event => setNewSpace(previous => ({ ...previous, name: event.target.value }))} placeholder={newSpace.kind === "exam" ? copy.examHint : newSpace.kind === "course" ? copy.courseHint : copy.program}/></label>}
        {newSpace.kind === "exam" && <label>{copy.date}<input type="date" className="input" value={newSpace.exam_date} onChange={event => setNewSpace(previous => ({ ...previous, exam_date: event.target.value }))}/></label>}<p className="bt-study-public-hint">{copy.publicHint}</p>{formError && <p role="alert" className="bt-form-error">{formError}</p>}<button className="btn-primary" disabled={busy}>{busy ? copy.loading : copy.create}</button>
      </form>
    </InboxSheet>
    <InboxSheet open={compose} title={copy.newPost} closeLabel={copy.close} onClose={() => { if (!busy) setCompose(false); }}>
      <form className="bt-study-form" onSubmit={event => post(event)}><p className="bt-study-destination">{active && spaceLabel(active, lang)}</p><div className="bt-study-filter-bar">{CONTENT_TYPES.map(type => <button type="button" key={type} aria-pressed={postType === type} className={postType === type ? "is-active" : ""} onClick={() => setPostType(type)}>{copy[type]}</button>)}</div>
        <label className="sr-only" htmlFor="study-post-text">{copy.compose}</label><textarea id="study-post-text" className="input" autoFocus rows={5} maxLength={1000} placeholder={copy.compose} value={draft} onChange={event => setDraft(event.target.value)}/>
        {postType === "exam" && <label>{copy.date}<input type="date" className="input" value={examDate} onChange={event => setExamDate(event.target.value)}/></label>}
        <label>{copy.attachment}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={event => { const selected = event.target.files?.[0]; if (!selected) return; const check = validateUploadFile(selected, "chatAttachment"); if (!check.ok) { setFormError(uploadErrorMessage(t, check)); event.target.value = ""; } else { setFile(selected); setFormError(""); } }}/></label>
        {file && <button className="btn-ghost" type="button" onClick={() => setFile(null)}>{file.name} · {copy.removeFile}</button>}<p className="bt-study-public-hint">{copy.publicHint}</p>{formError && <p role="alert" className="bt-form-error">{formError}</p>}<button className="btn-primary" disabled={busy || (!draft.trim() && !file)}>{busy ? copy.loading : copy.publish}</button>
      </form>
    </InboxSheet>
    <InboxSheet open={!!thread} title={copy.thread} closeLabel={copy.close} onClose={closeThread}>
      {thread && <div className="bt-study-thread">{renderPost(thread, true)}{threadError && <div role="alert" className="bt-study-status"><p>{copy.error}</p><button onClick={() => loadReplies(thread)} className="btn-ghost">{copy.retry}</button></div>}{replies.map(row => renderPost(row, true))}{threadLoading && <p role="status" className="bt-study-status">{copy.loading}</p>}{!threadLoading && !threadError && !replies.length && <p className="bt-study-status">{copy.noReplies}</p>}{replyMore && <button className="btn-ghost" disabled={threadLoading} onClick={() => loadReplies(thread, true)}>{copy.loadMore}</button>}
        {joined ? <form className="bt-study-form" onSubmit={event => post(event, thread.id)}><label htmlFor="study-reply">{copy.reply}</label><textarea id="study-reply" className="input" rows={3} maxLength={1000} value={reply} onChange={event => setReply(event.target.value)}/>{formError && <p role="alert" className="bt-form-error">{formError}</p>}<button className="btn-primary" disabled={busy || !reply.trim()}>{busy ? copy.loading : copy.send}</button></form> : <div className="bt-study-status"><p>{copy.readOnly}</p><button className="btn-primary" disabled={busy} onClick={() => membership(activeId)}>{copy.join}</button></div>}
      </div>}
    </InboxSheet>
    {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)}/>}
  </div>;
}
