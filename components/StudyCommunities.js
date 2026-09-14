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
import { STUDY_FIELDS, CONTENT_TYPES, spaceLabel, ancestorSpaces, broaderSpaces, parseStudyPost, normalizeStudyName } from "../lib/studySpaces.mjs";
import { fetchStudyDirectory, ensureStudySpace, joinStudySpace, requireData, POST_COLUMNS, SPACE_COLUMNS } from "../lib/studySpacesClient";
import { studySpacesCopy } from "../lib/studySpacesCopy";
import { validateUploadFile, safeStoragePath, attachmentKind, sanitizeFileName, uploadErrorMessage } from "../lib/security";
import { optimizeFeedImage } from "../lib/imageCompression";
import { notifyXPChanged } from "../lib/xpEvents";

// Operate: personal study spaces, one typed timeline, explicit routes toward
// broader cohorts. Memberships and posts here are public to signed-in students;
// Friends stays private.
//
// LAYOUT. On desktop the list and the open space form ONE full-height surface
// shared with Friends (styles/globals.css, "bt-social-fill"): the space fills
// the height, its feed scrolls inside, and the action to take part sits at the
// bottom like a message field. Two cards stopping above a footer read as a page
// inside a page.
//
// TYPES. Each kind is recognised by its SHAPE first — a university's own logo
// or monogram, a compass for a field, a cap for a program, a book for a course,
// a date for an exam — and only then by a restrained hue (styles/study-spaces.css,
// documented in DESIGN.md). Green stays for selection, actions and unread
// counts; it no longer paints every icon, link and filter.
const PAGE_SIZE = 30;
const NEW_SPACE = { kind: "course", name: "", parent_id: "", field_id: "", exam_date: "" };
const KIND_ORDER = ["hub", "university", "field", "program", "course", "exam"];
const CREATE_KINDS = ["university", "field", "program", "course", "exam"];

function Icon({ name, size = 20 }) {
  const paths = {
    university: <path d="m3 9 9-6 9 6M4 10h16M6 10v9m6-9v9m6-9v9M3 21h18" />,
    field: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7 4.7-2.3Z" /></>,
    program: <path d="m2 8 10-5 10 5-10 5-10-5Zm4 2v7c4 3 8 3 12 0v-7M22 8v8" />,
    course: <path d="M4 4h6l2 2 2-2h6v16h-6l-2 1-2-1H4V4ZM12 6v15" />,
    exam: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5" /></>,
    hub: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>,
    back: <path d="m14 5-7 7 7 7" />, plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10" cy="10" r="7" /><path d="m16 16 5 5" /></>, arrow: <path d="m9 5 7 7-7 7" />,
    discussion: <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" />,
    question: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01" /></>,
    resource: <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6" />,
    check: <path d="m5 12 5 5 9-10" />, chevron: <path d="m6 9 6 6 6-6" />,
  };
  return <Glyph size={size}>{paths[name] || paths.discussion}</Glyph>;
}

function initials(label = "") {
  const words = label.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const strong = words.filter(word => word.length > 2 && !/^(of|de|du|des|la|le|the|and|et)$/i.test(word));
  return (strong.length >= 2 ? strong.slice(0, 2).map(word => word[0]).join("") : (words[0] || "?").slice(0, 2)).toUpperCase();
}

// The mark carries the kind. A university is its own crest; an exam with a date
// is that date; every other kind is a distinct glyph on its kind tint.
function SpaceMark({ space, size = 40, lang }) {
  const uni = space.kind === "university" ? COMMUNITY_BY_ID[space.id] : null;
  const [failed, setFailed] = useState(false);
  const style = { "--mark": `${size}px` };
  if (space.kind === "university" && !space.preview) {
    if (uni?.logo && !failed) {
      return <span className="bt-space-mark is-university is-logo" style={style} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={uni.logo} alt="" width={size} height={size} onError={() => setFailed(true)} />
      </span>;
    }
    return <span className="bt-space-mark is-university is-monogram" aria-hidden="true"
      style={{ ...style, ...(uni?.color ? { "--uni": uni.color } : {}) }}>{initials(uni?.name || space.name)}</span>;
  }
  if (space.kind === "exam" && space.exam_date) {
    const date = new Date(`${space.exam_date}T12:00:00`);
    const locale = lang === "fr" ? "fr-BE" : "en-GB";
    return <span className="bt-space-mark is-exam is-date" style={style} aria-hidden="true">
      <small>{new Intl.DateTimeFormat(locale, { month: "short" }).format(date).replace(".", "")}</small>
      <strong>{date.getDate()}</strong>
    </span>;
  }
  const glyph = Math.round(size * 0.5);
  return <span className={`bt-space-mark is-${space.kind}`} style={style} aria-hidden="true"><Icon name={space.kind} size={glyph} /></span>;
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
  // Names of the student's own courses: the only way "related to your courses"
  // can be a fact rather than a guess.
  const [courseNames, setCourseNames] = useState([]);
  const [similar, setSimilar] = useState([]);
  const directoryRequest = useRef(0), postRequest = useRef(0), threadRequest = useRef(0), similarRequest = useRef(0);
  const scroller = useRef(null);
  const active = directory.spaces.find(space => space.id === activeId);
  const joined = directory.memberships.includes(activeId);
  const byId = new Map(directory.spaces.map(space => [space.id, space]));
  const mySpaces = directory.spaces.filter(space => directory.memberships.includes(space.id))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || spaceLabel(a, lang).localeCompare(spaceLabel(b, lang)));
  // The nearest broader space that is genuinely alive beats "All students",
  // which is always a valid but least specific way out.
  const broader = broaderSpaces(active, directory.spaces);
  const wider = broader.find(space => space.kind !== "hub" && (Number(space.recent_posts) > 0 || Number(space.member_count) > 1)) || broader[0];
  const children = directory.spaces.filter(space => space.parent_id === activeId && space.kind !== "university")
    .sort((a, b) => Number(b.recent_posts || 0) - Number(a.recent_posts || 0));
  const quiet = Number(active?.recent_posts || 0) < 3;

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
    if (!user) return undefined;
    let cancelled = false;
    supabase.from("courses").select("name").eq("user_id", user.id).is("archived_at", null).then(result => {
      if (!cancelled && result.data) setCourseNames(result.data.map(row => normalizeStudyName(row.name)).filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [user]);
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

  function mergeSpaces(rows) {
    if (rows?.length) setDirectory(previous => ({ ...previous, spaces: [...new Map([...previous.spaces, ...rows].map(space => [space.id, space])).values()] }));
  }
  function openSpace(space) {
    mergeSpaces([space]);
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
    setSimilar([]); setFormError(""); setCreating(true);
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

  // ── Who / where ─────────────────────────────────────────────────────────
  const universityName = id => COMMUNITY_BY_ID[id]?.name || byId.get(id)?.name || "";
  const members = n => `${n} ${Number(n) === 1 ? copy.student : copy.students}`;
  function context(space) {
    if (space.kind === "hub") return copy.hubContext;
    if (space.kind === "university") return COMMUNITY_BY_ID[space.id]?.full && COMMUNITY_BY_ID[space.id].full !== space.name ? COMMUNITY_BY_ID[space.id].full : "";
    if (space.university_id) return universityName(space.university_id);
    return space.kind === "field" ? copy.global : "";
  }

  // ── Why a space is suggested ────────────────────────────────────────────
  // Only facts the data can back: a course name the student really has, the
  // field on their profile, their own university, a parent they joined, real
  // recent posts. A space with none of these gets no invented reason.
  const myUniversities = new Set(mySpaces.filter(space => space.kind === "university").map(space => space.id));
  function reasonFor(space) {
    if (space.kind === "course" && courseNames.includes(normalizeStudyName(space.name))) return { rank: 0, text: copy.reasonCourses };
    if (profile?.broad_field && space.field_id === profile.broad_field && ["field", "program"].includes(space.kind)) {
      return { rank: 1, text: space.university_id && !myUniversities.has(space.university_id)
        ? copy.reasonFieldElsewhere.replace("{uni}", universityName(space.university_id)) : copy.reasonField };
    }
    if (directory.memberships.includes(space.parent_id)) return { rank: 2, text: copy.reasonInside.replace("{parent}", spaceLabel(byId.get(space.parent_id), lang)) };
    if (space.university_id && myUniversities.has(space.university_id)) {
      return { rank: 3, text: (Number(space.recent_posts) > 0 ? copy.reasonPopularAt : copy.reasonAt).replace("{uni}", universityName(space.university_id)) };
    }
    if (Number(space.recent_posts) > 0) return { rank: 4, text: (Number(space.recent_posts) === 1 ? copy.reasonActiveOne : copy.reasonActive).replace("{n}", space.recent_posts) };
    if (space.kind === "field" && !space.university_id) return { rank: 5, text: copy.reasonGlobal };
    return { rank: 6, text: "" };
  }
  const discoveries = directory.spaces.filter(space => directory.results.includes(space.id) && (search || !directory.memberships.includes(space.id)))
    .map(space => ({ space, reason: search ? null : reasonFor(space) }))
    .sort((a, b) => (a.reason?.rank ?? 0) - (b.reason?.rank ?? 0) || Number(b.space.recent_posts || 0) - Number(a.space.recent_posts || 0));

  // ── Existing spaces while creating ──────────────────────────────────────
  // ensure_study_space already reuses an exact normalized name; the form says so
  // BEFORE submitting, and shows near-matches so a typo does not become a
  // second space for the same course.
  const newParent = byId.get(newSpace.parent_id);
  const newUniversity = newParent ? (newParent.kind === "university" ? newParent.id : newParent.university_id) : null;
  const newName = newSpace.kind === "field" ? (STUDY_FIELDS.find(item => item.id === newSpace.field_id)?.en || "") : newSpace.name.trim();
  useEffect(() => {
    if (!creating || !user) return undefined;
    const request = ++similarRequest.current;
    if (normalizeStudyName(newName).length < 2) { setSimilar([]); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const term = newName.replace(/[%_\\]/g, "\\$&").slice(0, 120);
        let requestQuery = supabase.from("study_space_directory").select(SPACE_COLUMNS).eq("kind", newSpace.kind).ilike("search_text", `%${term}%`);
        if (["course", "exam", "program", "field"].includes(newSpace.kind) && newUniversity) requestQuery = requestQuery.eq("university_id", newUniversity);
        const rows = requireData(await requestQuery.order("recent_posts", { ascending: false }).limit(6)) || [];
        if (request === similarRequest.current) { mergeSpaces(rows); setSimilar(rows); }
      } catch { if (request === similarRequest.current) setSimilar([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [creating, user, newSpace.kind, newName, newUniversity]);
  const sameIdentity = space => normalizeStudyName(spaceLabel(space, "en")) === normalizeStudyName(newName)
    && (newSpace.kind === "university"
      || (newSpace.kind === "course" ? space.university_id === newUniversity : space.parent_id === newSpace.parent_id))
    && (newSpace.kind !== "exam" || (space.exam_date || "") === (newSpace.exam_date || ""));
  const exactMatch = similar.find(sameIdentity);
  const nearMatches = similar.filter(space => space !== exactMatch).slice(0, 3);

  function renderSpace(space, reason) {
    const unread = communityCount[space.id] > 0;
    const meta = [context(space), Number(space.member_count) > 0 && members(space.member_count)].filter(Boolean).join(" · ");
    return <button key={space.id} type="button" className={`bt-space-row ${activeId === space.id ? "is-selected" : ""}`}
      onClick={() => openSpace(space)} aria-current={activeId === space.id ? "true" : undefined}>
      <SpaceMark space={space} lang={lang} />
      <span className="bt-space-row-text">
        <strong>{spaceLabel(space, lang)}</strong>
        <small><span className={`bt-kind-word is-${space.kind}`}>{copy[space.kind]}</span>{reason?.text ? <> · {reason.text}</> : meta ? <> · {meta}</> : null}</small>
      </span>
      {unread && <span className="bt-space-unread" aria-label={`${communityCount[space.id]}`}>{communityCount[space.id]}</span>}
    </button>;
  }
  function renderPost(row, inThread = false) {
    const author = authors[row.user_id] || { pseudo: "…" };
    const parsed = parseStudyPost(row);
    return <article key={row.id} className="bt-study-post">
      <Avatar url={author.avatar_url} pseudo={displayName(author)} size={36} />
      <div className="bt-study-post-body">
        <header>
          <button type="button" onClick={() => { closeThread(); setViewUserId(row.user_id); }} className="bt-study-author"><strong>{displayName(author)}</strong></button>
          <time dateTime={row.created_at}>{timeAgo(row.created_at, lang)}</time>
          {!row.parent_id && parsed.type !== "discussion" && <span className={`bt-study-type is-${parsed.type}`}><Icon name={parsed.type} size={13} />{copy[parsed.type]}</span>}
        </header>
        {parsed.text && <p className="bt-study-post-text">{parsed.text}</p>}
        {row.exam_date && <div className="bt-study-exam"><Icon name="exam" size={16} /><time dateTime={row.exam_date}>{new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(`${row.exam_date}T12:00:00`))}</time><button type="button" disabled={!!addedExams[row.id]} onClick={() => addExam(row)}>{addedExams[row.id] === "done" ? copy.addedPlanning : copy.addPlanning}</button></div>}
        {row.attachment_url && <div className="bt-study-attachment">{attachmentUrls[row.id] ? <>
          {row.attachment_type === "image" &&
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachmentUrls[row.id]} alt={row.attachment_name || copy.untitled} loading="lazy" />}
          <a href={attachmentUrls[row.id]} target="_blank" rel="noreferrer">{row.attachment_name || copy.openAttachment}</a>
        </> : <button type="button" onClick={() => revealAttachment(row)} disabled={openingAttachment === row.id}><Icon name="resource" size={18} />{openingAttachment === row.id ? copy.loading : row.attachment_name || copy.openAttachment}</button>}</div>}
        <footer>
          {!inThread && <button type="button" onClick={() => openThread(row)}><Icon name="discussion" size={16} />{copy.reply}</button>}
          {(row.user_id === user?.id || profile?.is_admin) && <details className="bt-study-post-actions"><summary aria-label={copy.postActions}><Glyph size={18}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Glyph></summary><button type="button" onClick={event => { event.currentTarget.closest("details").open = false; removePost(row); }}>{copy.delete}</button></details>}
        </footer>
      </div>
    </article>;
  }
  // One line, not a panel: the broader cohort is a way out of a quiet room, and
  // an active room only needs to know the conversation carries on elsewhere.
  function renderWiden(where) {
    if (!wider) return null;
    return <button type="button" className={`bt-study-widen is-${where}`} onClick={() => openSpace(wider)}>
      <SpaceMark space={wider} size={28} lang={lang} />
      <span className="bt-study-widen-text">{where === "end" ? copy.widenActive : copy.widenQuiet}{" "}<strong>{spaceLabel(wider, lang)}</strong>
        {Number(wider.member_count) > 0 && <small> · {members(wider.member_count)}</small>}</span>
      <Icon name="arrow" size={16} />
    </button>;
  }
  const compatibleParents = directory.spaces.filter(space => {
    if (newSpace.kind === "field") return space.kind === "university";
    if (newSpace.kind === "program") return space.kind === "university" || (space.kind === "field" && space.university_id);
    if (newSpace.kind === "exam") return space.kind === "course";
    return space.kind === "university" || (["field", "program"].includes(space.kind) && space.university_id);
  });
  const ancestors = active ? ancestorSpaces(active, directory.spaces).filter(space => space.kind !== "hub") : [];
  const feedEmpty = !postLoading && !postError && !posts.length;

  return <div className={`bt-study-spaces bt-social-fill-grid ${mobileOpen ? "is-open" : ""}`}>
    <aside className="bt-study-directory card bt-social-panel">
      <header className="bt-study-directory-head">
        <h1>{copy.title}</h1>
        <button className="bt-study-create" type="button" onClick={startCreate}><Icon name="plus" size={18} /><span>{copy.createShort}</span></button>
      </header>
      <div className="bt-study-search"><Icon name="search" size={18} /><input className="input" aria-label={copy.search} placeholder={copy.search} value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /></div>
      <div className="bt-study-directory-scroll">
        {error && <div className="bt-study-status" role="alert"><p>{copy.error}</p><button className="btn-ghost" onClick={() => refreshDirectory(true)}>{copy.retry}</button></div>}
        {syncError && <div className="bt-study-status" role="status"><p>{copy.syncError}</p><Link href="/profile">{copy.profile}</Link></div>}
        {loading && !directory.spaces.length && <p className="bt-study-status" role="status">{copy.loading}</p>}
        {!search && <section aria-labelledby="study-yours">
          <h2 id="study-yours" className="bt-study-section-title">{copy.yours}{mySpaces.length > 0 && <span>{mySpaces.length}</span>}</h2>
          {mySpaces.map(space => renderSpace(space))}
          {!loading && !mySpaces.length && <div className="bt-study-status"><strong>{copy.noMembership}</strong><p>{copy.noMembershipBody}</p><Link href="/profile">{copy.profile}</Link></div>}
          {!!mySpaces.length && !profile?.broad_field && <Link href="/profile" className="bt-study-profile-hint"><Icon name="field" size={18} /><span>{copy.profileHint}</span><Icon name="arrow" size={16} /></Link>}
        </section>}
        <section aria-labelledby="study-discover" className={search ? "" : "is-discover"}>
          <h2 id="study-discover" className="bt-study-section-title">{search ? copy.results : copy.discover}</h2>
          {discoveries.map(({ space, reason }) => renderSpace(space, reason))}
          {!loading && !discoveries.length && <div className="bt-study-status"><strong>{copy.noResults}</strong><p>{copy.noResultsBody}</p><button className="btn-ghost" onClick={startCreate}>{copy.create}</button></div>}
          {search && discoveries.length >= 40 && <p className="bt-study-status">{copy.moreSearch}</p>}
        </section>
      </div>
    </aside>

    <section className={`bt-study-timeline card bt-social-panel ${mobileOpen ? "bt-social-panel--chat" : ""}`} aria-label={active ? spaceLabel(active, lang) : copy.title}>
      {active ? <>
        <header className="bt-study-space-header">
          <div className="bt-study-space-title">
            <button className="bt-feed-icon-btn lg:hidden" type="button" onClick={() => setMobileOpen(false)} aria-label={copy.back}><Icon name="back" /></button>
            <SpaceMark space={active} size={44} lang={lang} />
            <div className="min-w-0 flex-1">
              <h2>{spaceLabel(active, lang)}</h2>
              <div className="bt-study-space-meta" data-no-swipe>
                <span className={`bt-kind-word is-${active.kind}`}>{copy[active.kind]}</span>
                {ancestors.length > 0 && <nav className="bt-study-breadcrumbs" data-no-swipe aria-label={copy.path}>
                  {ancestors.map(space => <button type="button" key={space.id} onClick={() => openSpace(space)}>{COMMUNITY_BY_ID[space.id]?.name || spaceLabel(space, lang)}</button>)}
                </nav>}
                {Number(active.member_count) > 0 && <span className="bt-study-count">{members(active.member_count)}</span>}
              </div>
            </div>
            {joined
              ? <details className="bt-study-membership">
                  <summary><Icon name="check" size={16} />{copy.joined}<Icon name="chevron" size={14} /></summary>
                  <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest("details").open = false; membership(activeId, true); }}>{copy.leaveSpace}</button>
                </details>
              : <button type="button" className="btn-primary bt-study-join" disabled={busy} onClick={() => membership(activeId)}>{copy.join}</button>}
          </div>
          <div className="bt-study-filter-bar" data-no-swipe role="group" aria-label={copy.filters}>
            {["all", ...CONTENT_TYPES].map(type => <button type="button" key={type} aria-pressed={filter === type} className={filter === type ? "is-active" : ""} onClick={() => setFilter(type)}>{copy[type]}</button>)}
          </div>
        </header>

        <div className="bt-study-posts" ref={scroller}>
          {children.length > 0 && <nav className="bt-study-children" data-no-swipe aria-label={copy.children}>
            <span>{copy.children}</span>
            {children.slice(0, 12).map(space => <button type="button" key={space.id} onClick={() => openSpace(space)}><SpaceMark space={space} size={22} lang={lang} />{spaceLabel(space, lang)}</button>)}
          </nav>}
          {quiet && posts.length > 0 && renderWiden("top")}
          {postError && <div className="bt-study-status" role="alert"><p>{copy.error}</p><button className="btn-ghost" onClick={() => loadPosts()}>{copy.retry}</button></div>}
          {postLoading && !posts.length && <p className="bt-study-status" role="status">{copy.loading}</p>}
          {feedEmpty && <div className="bt-study-empty">
            <SpaceMark space={active} size={56} lang={lang} />
            <h3>{filter === "all" ? copy.noPosts : copy.noFilteredPosts.replace("{type}", copy[filter])}</h3>
            <p>{filter === "all" ? copy.noPostsBody : copy.noFilteredPostsBody}</p>
            {filter !== "all" ? <button className="btn-ghost" onClick={() => setFilter("all")}>{copy.showAll}</button>
              : joined && <button className="btn-primary" onClick={() => { setFormError(""); setCompose(true); }}>{copy.newPost}</button>}
            {filter === "all" && renderWiden("empty")}
          </div>}
          {posts.map(row => renderPost(row))}
          {hasMore && <button className="btn-ghost bt-study-load-more" disabled={postLoading} onClick={() => loadPosts(posts[posts.length - 1])}>{postLoading ? copy.loading : copy.loadMore}</button>}
          {!quiet && !hasMore && posts.length > 0 && renderWiden("end")}
        </div>

        <footer className="bt-study-composer">
          {joined
            ? <button type="button" className="bt-study-composer-field" onClick={() => { setFormError(""); setCompose(true); }}>
                <Avatar url={profile?.avatar_url} pseudo={displayName(profile || {})} size={30} />
                <span>{copy.compose}</span>
                <Icon name="plus" size={18} />
              </button>
            : <div className="bt-study-composer-join"><span>{copy.readOnly}</span><button type="button" className="btn-primary" disabled={busy} onClick={() => membership(activeId)}>{copy.join}</button></div>}
          {isOfflineDev && <small className="bt-study-demo">{copy.demo}</small>}
        </footer>
      </> : <div className="bt-study-empty"><Icon name="hub" size={36} /><h2>{copy.title}</h2><p>{loading ? copy.loading : copy.noMembershipBody}</p></div>}
    </section>

    <InboxSheet open={creating} title={copy.create} closeLabel={copy.close} onClose={() => { if (!busy) setCreating(false); }}>
      <form onSubmit={createSpace} className="bt-study-form">
        <fieldset className="bt-study-kinds">
          <legend>{copy.createKind}</legend>
          {CREATE_KINDS.map(kind => <label key={kind} className={newSpace.kind === kind ? "is-active" : ""}>
            <input type="radio" name="space-kind" value={kind} checked={newSpace.kind === kind}
              onChange={() => setNewSpace(previous => ({ ...previous, kind, name: "", parent_id: kind === "university" ? "" : (compatibleParentFor(kind)?.id || "") }))} />
            <SpaceMark space={{ id: `preview-${kind}`, kind, name: copy[kind], preview: true }} size={32} lang={lang} />
            <span className="bt-study-kind-text"><strong>{copy[kind]}</strong><small>{copy[`${kind}Describe`]}</small></span>
          </label>)}
        </fieldset>

        {newSpace.kind === "university"
          ? <div><label className="label" htmlFor="space-university">{copy.university}</label><UniPicker id="space-university" value={newSpace.name} onChange={name => setNewSpace(previous => ({ ...previous, name }))} /><p>{copy.universityHint}</p></div>
          : <label>{copy.parent}
              <select className="input" required value={newSpace.parent_id} onChange={event => setNewSpace(previous => ({ ...previous, parent_id: event.target.value }))}>
                <option value="">{copy.parent}</option>
                {compatibleParents.map(space => <option key={space.id} value={space.id}>{copy[space.kind]} · {spaceLabel(space, lang)}{space.university_id ? ` · ${universityName(space.university_id)}` : ""}</option>)}
              </select>
              <small>{copy.parentHint}</small>
            </label>}

        {newSpace.kind === "field"
          ? <label>{copy.field}<select className="input" required value={newSpace.field_id} onChange={event => setNewSpace(previous => ({ ...previous, field_id: event.target.value }))}><option value="">{copy.fieldRequired}</option>{STUDY_FIELDS.map(field => <option value={field.id} key={field.id}>{field[lang === "fr" ? "fr" : "en"]}</option>)}</select></label>
          : newSpace.kind !== "university" && <label>{copy.name}<input className="input" required minLength={2} maxLength={180} value={newSpace.name} onChange={event => setNewSpace(previous => ({ ...previous, name: event.target.value }))} placeholder={newSpace.kind === "exam" ? copy.examHint : newSpace.kind === "course" ? copy.courseHint : copy.program} /></label>}
        {newSpace.kind === "exam" && <label>{copy.date}<input type="date" className="input" value={newSpace.exam_date} onChange={event => setNewSpace(previous => ({ ...previous, exam_date: event.target.value }))} /></label>}

        {exactMatch && <div className="bt-study-existing" role="status">
          <p>{copy.existsAlready}</p>
          <button type="button" onClick={() => { setCreating(false); openSpace(exactMatch); }}>
            <SpaceMark space={exactMatch} size={32} lang={lang} />
            <span className="bt-study-existing-text"><strong>{spaceLabel(exactMatch, lang)}</strong><small>{[copy[exactMatch.kind], context(exactMatch), Number(exactMatch.member_count) > 0 && members(exactMatch.member_count)].filter(Boolean).join(" · ")}</small></span>
            <Icon name="arrow" size={16} />
          </button>
        </div>}
        {!exactMatch && nearMatches.length > 0 && <div className="bt-study-existing is-near">
          <p>{copy.similarSpaces}</p>
          {nearMatches.map(space => <button type="button" key={space.id} onClick={() => { setCreating(false); openSpace(space); }}>
            <SpaceMark space={space} size={32} lang={lang} />
            <span className="bt-study-existing-text"><strong>{spaceLabel(space, lang)}</strong><small>{[copy[space.kind], context(space), Number(space.member_count) > 0 && members(space.member_count)].filter(Boolean).join(" · ")}</small></span>
            <Icon name="arrow" size={16} />
          </button>)}
        </div>}

        <p className="bt-study-public-hint">{copy.publicHint}</p>
        {formError && <p role="alert" className="bt-form-error">{formError}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? copy.loading : exactMatch ? copy.joinExisting : copy.create}</button>
      </form>
    </InboxSheet>
    <InboxSheet open={compose} title={copy.newPost} closeLabel={copy.close} onClose={() => { if (!busy) setCompose(false); }}>
      <form className="bt-study-form" onSubmit={event => post(event)}>
        {active && <p className="bt-study-destination"><SpaceMark space={active} size={24} lang={lang} />{spaceLabel(active, lang)}</p>}
        <div className="bt-study-filter-bar" role="group" aria-label={copy.postKind}>{CONTENT_TYPES.map(type => <button type="button" key={type} aria-pressed={postType === type} className={postType === type ? "is-active" : ""} onClick={() => setPostType(type)}><Icon name={type} size={14} />{copy[type]}</button>)}</div>
        <label className="sr-only" htmlFor="study-post-text">{copy.compose}</label><textarea id="study-post-text" className="input" autoFocus rows={5} maxLength={1000} placeholder={copy.compose} value={draft} onChange={event => setDraft(event.target.value)} />
        {postType === "exam" && <label>{copy.date}<input type="date" className="input" value={examDate} onChange={event => setExamDate(event.target.value)} /></label>}
        <label>{copy.attachment}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={event => { const selected = event.target.files?.[0]; if (!selected) return; const check = validateUploadFile(selected, "chatAttachment"); if (!check.ok) { setFormError(uploadErrorMessage(t, check)); event.target.value = ""; } else { setFile(selected); setFormError(""); } }} /></label>
        {file && <button className="btn-ghost" type="button" onClick={() => setFile(null)}>{file.name} · {copy.removeFile}</button>}<p className="bt-study-public-hint">{copy.publicHint}</p>{formError && <p role="alert" className="bt-form-error">{formError}</p>}<button className="btn-primary" disabled={busy || (!draft.trim() && !file)}>{busy ? copy.loading : copy.publish}</button>
      </form>
    </InboxSheet>
    <InboxSheet open={!!thread} title={copy.thread} closeLabel={copy.close} onClose={closeThread}>
      {thread && <div className="bt-study-thread">{renderPost(thread, true)}{threadError && <div role="alert" className="bt-study-status"><p>{copy.error}</p><button onClick={() => loadReplies(thread)} className="btn-ghost">{copy.retry}</button></div>}{replies.map(row => renderPost(row, true))}{threadLoading && <p role="status" className="bt-study-status">{copy.loading}</p>}{!threadLoading && !threadError && !replies.length && <p className="bt-study-status">{copy.noReplies}</p>}{replyMore && <button className="btn-ghost" disabled={threadLoading} onClick={() => loadReplies(thread, true)}>{copy.loadMore}</button>}
        {joined ? <form className="bt-study-form" onSubmit={event => post(event, thread.id)}><label htmlFor="study-reply">{copy.reply}</label><textarea id="study-reply" className="input" rows={3} maxLength={1000} value={reply} onChange={event => setReply(event.target.value)} />{formError && <p role="alert" className="bt-form-error">{formError}</p>}<button className="btn-primary" disabled={busy || !reply.trim()}>{busy ? copy.loading : copy.send}</button></form> : <div className="bt-study-status"><p>{copy.readOnly}</p><button className="btn-primary" disabled={busy} onClick={() => membership(activeId)}>{copy.join}</button></div>}
      </div>}
    </InboxSheet>
    {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
  </div>;

  function compatibleParentFor(kind) {
    const fits = space => kind === "field" ? space.kind === "university"
      : kind === "program" ? space.kind === "university" || (space.kind === "field" && space.university_id)
      : kind === "exam" ? space.kind === "course"
      : space.kind === "university" || (["field", "program"].includes(space.kind) && space.university_id);
    if (active && fits(active)) return active;
    return mySpaces.find(fits);
  }
}
