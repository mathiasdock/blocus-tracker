import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../Layout";
import FilterMenu from "../FilterMenu";
import Glyph from "../Glyph";
import InboxSheet from "../InboxSheet";
import PlanningExamMark from "../PlanningExamMark";
import UserProfileModal from "../UserProfileModal";
import { displayName } from "../../lib/format";
import { notifyXPChanged } from "../../lib/xpEvents";
import { uploadErrorMessage, validateUploadFile } from "../../lib/security";
import {
  MESSAGE_MAX_LENGTH, courseSpaceErrorKey, examDateBounds, groupRoomMessages, isSharedExamPlanned, localDayKey,
  mergeLatestPage, mergeOlderPage, newMessagesFromOthers, sortMessages, splitFileName,
} from "../../lib/courseSpaces.mjs";
import {
  ROOM_PAGE_SIZE, addSharedExamToPlanning, deleteRoomMessage, fetchAuthors, fetchRoomMessages,
  findPlannedExams, postRoomMessage, reportRoomMessage, signRoomAttachment,
} from "../../lib/courseSpacesClient";
import { CourseMarker } from "./CourseSpaceList";

// Right column: one course, one chronological conversation. Members read and
// write; anyone else sees what joining means and a way to join. Study actions
// are the only Blocus-specific ones: start the Timer on the student's own
// course, and put a shared exam date into their own Planning.
const POLL_MS = 15000;
const CHAT_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const REPORT_REASONS = ["spam", "abuse", "other"];
const SIGNED_URL_REUSE_MS = 4 * 60 * 1000;

const IconBack = () => <Glyph size={22}><path d="M15 5.5 8.5 12l6.5 6.5" /></Glyph>;
const IconMore = ({ size = 20 }) => <Glyph size={size}>
  <circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
  <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
  <circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
</Glyph>;
const IconPaperclip = () => <Glyph size={20}><path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.93a2 2 0 0 1-2.83-2.83l8.49-8.49" /></Glyph>;
const IconCalendar = () => <Glyph size={20}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></Glyph>;
const IconSend = () => <Glyph size={20}><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></Glyph>;
const IconClose = () => <Glyph size={16}><path d="m6 6 12 12M6 18 18 6" /></Glyph>;

// displayName() falls back to a French word; an author still loading shows an
// ellipsis instead, and an unknown one the translated "User".
export function authorName(person, fallback) {
  return person && (person.first_name || person.last_name || person.pseudo) ? displayName(person) : fallback;
}

function dayLabel(day, t, lang) {
  const today = localDayKey(new Date());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (day === today) return t("common.today");
  if (day === localDayKey(yesterday)) return t("courseSpaces.yesterday");
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-BE", {
    weekday: "long", day: "numeric", month: "long", ...(year !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(value);
}

function timeLabel(iso, lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function examLabel(date, lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-BE", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

// iOS keeps 100dvh when the keyboard opens: the room follows the visual
// viewport instead, so the field stays above the keyboard and the header in
// view. Only while the room is the full-screen phone surface.
function useVisualViewportHeight(ref, active) {
  useEffect(() => {
    const element = ref.current;
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !element || !viewport) return undefined;
    const narrow = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      if (!narrow.matches) { element.style.removeProperty("--bt-room-viewport"); return; }
      element.style.setProperty("--bt-room-viewport", `${Math.round(viewport.height)}px`);
      if (window.scrollY) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener("resize", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      element.style.removeProperty("--bt-room-viewport");
    };
  }, [ref, active]);
}

// A file opens in ONE tap. An image loads inline on request (no download
// until asked), then opens full size. Signed links last five minutes, so a
// link older than four is signed again rather than reused.
// The whole name shows whenever it fits. When it does not, only the middle
// gives way: the start and the end (number, extension) stay readable, so
// "Macro-chapitre-5-resume.pdf" and "…-6-resume.pdf" never look the same.
function FileLabel({ t, name }) {
  const { head, tail } = splitFileName(name);
  const [before, after = ""] = t("courseSpaces.attachment.open").split("{name}");
  return <span className="bt-course-file-label" aria-hidden="true">
    {before && <span className="bt-course-file-text">{before}</span>}
    <span className="bt-course-file-head">{head}</span>
    <span className="bt-course-file-tail">{tail}</span>
    {after && <span className="bt-course-file-text">{after}</span>}
  </span>;
}

function Attachment({ message, mine, state, onShowImage, onOpen, t }) {
  const name = message.attachment_name || t("courseSpaces.attachment.file");
  const loading = state?.status === "loading";
  if (message.attachment_type === "image" && state?.url) {
    return <button type="button" className="bt-course-attachment-image" onClick={() => onOpen(message)}
      aria-label={t("courseSpaces.attachment.open").replace("{name}", name)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.url} alt={name} loading="lazy" />
    </button>;
  }
  const isImage = message.attachment_type === "image";
  return <div className="bt-course-attachment">
    <button type="button" className={`bt-course-attachment-btn${mine ? " is-mine" : ""}`} disabled={loading} title={name}
      aria-label={isImage ? undefined : t("courseSpaces.attachment.open").replace("{name}", name)}
      onClick={() => (isImage ? onShowImage(message) : onOpen(message))}>
      {loading ? t("common.loading") : isImage ? t("attachment.viewImage") : <FileLabel t={t} name={name} />}
    </button>
    {state?.status === "error" && <p role="alert">{t("courseSpaces.attachment.error")}</p>}
  </div>;
}

function Composer({ t, title, roomId, onSend }) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState(null);
  const [examOpen, setExamOpen] = useState(false);
  const [examDate, setExamDate] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const bounds = useMemo(() => examDateBounds(), []);
  const text = draft.trim();
  const dateReady = !examOpen || !examDate || (examDate >= bounds.min && examDate <= bounds.max);
  const canSend = !sending && dateReady && text.length <= MESSAGE_MAX_LENGTH && !!(text || file || (examOpen && examDate));
  const remaining = MESSAGE_MAX_LENGTH - draft.length;

  useEffect(() => { setDraft(""); setFile(null); setExamOpen(false); setExamDate(""); setError(""); }, [roomId]);
  useLayoutEffect(() => {
    const field = textRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 132)}px`;
  }, [draft]);

  function pick(input) {
    const selected = input.files?.[0];
    input.value = "";
    if (!selected) return;
    const check = validateUploadFile(selected, "chatAttachment");
    if (!check.ok) { setError(uploadErrorMessage(t, check)); return; }
    setFile(selected); setError("");
  }

  async function submit(event) {
    event?.preventDefault();
    if (!canSend) return;
    setSending(true); setError("");
    try {
      await onSend({ content: text, file, examDate: examOpen && examDate ? examDate : null });
      setDraft(""); setFile(null); setExamOpen(false); setExamDate("");
      textRef.current?.focus();
    } catch (failure) {
      setError(failure?.upload ? uploadErrorMessage(t, failure.upload) : t(courseSpaceErrorKey(failure)));
    } finally {
      setSending(false);
    }
  }

  return <form className="bt-course-composer" onSubmit={submit}>
    {(file || examOpen) && <div className="bt-course-composer-extras">
      {examOpen && <div className="bt-course-composer-extra">
        <label htmlFor={`course-exam-${roomId}`}>{t("courseSpaces.exam.label")}</label>
        <input id={`course-exam-${roomId}`} className="input" type="date" min={bounds.min} max={bounds.max}
          value={examDate} onChange={(event) => setExamDate(event.target.value)} />
        <button type="button" className="bt-course-icon-btn" aria-label={t("courseSpaces.composer.removeExam")}
          onClick={() => { setExamOpen(false); setExamDate(""); }}><IconClose /></button>
      </div>}
      {file && <div className="bt-course-composer-extra">
        <span className="bt-course-composer-file">{file.name}</span>
        <button type="button" className="bt-course-icon-btn" aria-label={t("courseSpaces.composer.removeFile")}
          onClick={() => setFile(null)}><IconClose /></button>
      </div>}
    </div>}
    <div className="bt-course-composer-row">
      <button type="button" className="bt-course-icon-btn" aria-label={t("courseSpaces.composer.attach")} title={t("courseSpaces.composer.attach")}
        onClick={() => fileRef.current?.click()}><IconPaperclip /></button>
      <input ref={fileRef} type="file" accept={CHAT_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => pick(event.currentTarget)} />
      <button type="button" className={`bt-course-icon-btn${examOpen ? " is-on" : ""}`} aria-pressed={examOpen}
        aria-label={t("courseSpaces.composer.exam")} title={t("courseSpaces.composer.exam")}
        onClick={() => setExamOpen((open) => !open)}><IconCalendar /></button>
      <label className="sr-only" htmlFor={`course-message-${roomId}`}>{t("courseSpaces.composer.label").replace("{title}", title)}</label>
      <textarea ref={textRef} id={`course-message-${roomId}`} className="input bt-course-composer-field" rows={1}
        maxLength={MESSAGE_MAX_LENGTH + 200} value={draft} placeholder={t("courseSpaces.composer.placeholder")}
        aria-describedby={error ? `course-composer-error-${roomId}` : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
          event.preventDefault(); submit();
        }} />
      <button type="submit" className="bt-course-send" disabled={!canSend} aria-label={sending ? t("courseSpaces.composer.sending") : t("common.send")}>
        <IconSend /><span>{sending ? t("courseSpaces.composer.sending") : t("common.send")}</span>
      </button>
    </div>
    {remaining < 100 && <p className={`bt-course-composer-count${remaining < 0 ? " is-over" : ""}`} aria-live="polite">
      {remaining < 0 ? t("courseSpaces.error.tooLong") : t("courseSpaces.composer.remaining").replace("{n}", remaining)}
    </p>}
    {error && <p id={`course-composer-error-${roomId}`} className="bt-course-composer-error bt-form-error" role="alert">{error}</p>}
  </form>;
}

export default function CourseRoom({
  entry, hasSpaces, user, profile, t, lang, toast, visible, fullscreen,
  onBack, onJoin, joinPending, onLeave, onStudy, blockedIds, onBlock, markSeen, onActivity,
}) {
  const roomId = entry?.joined ? entry.roomId : null;
  const [messages, setMessages] = useState([]);
  const [authors, setAuthors] = useState({});
  const [status, setStatus] = useState("idle");
  const [hasMore, setHasMore] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [attachments, setAttachments] = useState({});
  const attachmentsRef = useRef({});
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  const [exams, setExams] = useState({});
  const [reportTarget, setReportTarget] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [profileId, setProfileId] = useState(null);
  // Touch has no hover: tapping a message reveals its actions.
  const [activeMessageId, setActiveMessageId] = useState(null);
  const panelRef = useRef(null);
  const streamRef = useRef(null);
  const messagesRef = useRef([]);
  const loadRequest = useRef(0);
  const stickToBottom = useRef(true);
  const restoreFromBottom = useRef(null);
  const knownAuthors = useRef(new Set());
  const checkedExams = useRef(new Set());
  // The language can change while a room is open; that must not reload it.
  // Same for the list callback and the offering id read by a poll.
  const tRef = useRef(t);
  const activityRef = useRef(onActivity);
  const offeringRef = useRef(entry?.offeringId);
  useEffect(() => { tRef.current = t; activityRef.current = onActivity; offeringRef.current = entry?.offeringId; }, [t, onActivity, entry?.offeringId]);

  useVisualViewportHeight(panelRef, fullscreen);

  const commit = useCallback((next) => { messagesRef.current = next; setMessages(next); }, []);

  const load = useCallback(async (background = false) => {
    if (!roomId) return;
    const request = ++loadRequest.current;
    if (!background) setStatus("loading");
    try {
      const page = await fetchRoomMessages(roomId);
      if (request !== loadRequest.current) return;
      const stream = streamRef.current;
      stickToBottom.current = !background || !stream || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 120;
      const previous = messagesRef.current;
      const merged = mergeLatestPage(previous, page, ROOM_PAGE_SIZE);
      if (background) {
        const fresh = newMessagesFromOthers(previous, merged.messages, user?.id);
        if (fresh) setAnnouncement(fresh === 1 ? tRef.current("courseSpaces.room.newMessage") : tRef.current("courseSpaces.room.newMessages").replace("{n}", fresh));
      }
      if (merged.complete) setHasMore(false);
      else if (merged.reset) setHasMore(true);
      commit(merged.messages);
      const newest = merged.messages[merged.messages.length - 1];
      if (newest) activityRef.current?.(offeringRef.current, newest.created_at);
      setStatus("ready");
    } catch {
      if (request === loadRequest.current && !background) setStatus("error");
    }
  }, [roomId, user?.id, commit]);

  useEffect(() => {
    commit([]); setHasMore(false); setAttachments({}); setExams({}); setAnnouncement(""); setActiveMessageId(null);
    checkedExams.current = new Set();
    stickToBottom.current = true;
    if (!roomId) { setStatus("idle"); return undefined; }
    load();
    return () => { loadRequest.current += 1; };
  }, [roomId, load, commit]);

  useEffect(() => {
    if (!roomId) return undefined;
    const poll = () => { if (!document.hidden) load(true); };
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [roomId, load]);

  useEffect(() => {
    if (roomId && visible && status === "ready") markSeen(`room_${roomId}`);
  }, [roomId, visible, status, messages, markSeen]);

  useEffect(() => {
    const missing = [...new Set(messages.map((message) => message.user_id))].filter((id) => id && !knownAuthors.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => knownAuthors.current.add(id));
    fetchAuthors(missing)
      .then((rows) => setAuthors((previous) => ({ ...previous, ...Object.fromEntries(rows.map((row) => [row.id, row])) })))
      .catch(() => missing.forEach((id) => knownAuthors.current.delete(id)));
  }, [messages]);

  // An exam date already in the student's planning says so on arrival, not
  // only after a click.
  const examName = entry ? t("courseSpaces.exam.name").replace("{course}", entry.course?.name || entry.title) : "";
  const examCourseId = entry?.course?.id || null;
  useEffect(() => {
    if (!user?.id) return;
    const unchecked = messages.filter((message) => message.exam_date && !checkedExams.current.has(message.id));
    if (!unchecked.length) return;
    unchecked.forEach((message) => checkedExams.current.add(message.id));
    findPlannedExams(user.id, [...new Set(unchecked.map((message) => message.exam_date))])
      .then((rows) => {
        const planned = unchecked.filter((message) => isSharedExamPlanned(rows, { examDate: message.exam_date, courseId: examCourseId, name: examName }));
        if (planned.length) setExams((previous) => ({ ...Object.fromEntries(planned.map((message) => [message.id, "done"])), ...previous }));
      })
      .catch(() => unchecked.forEach((message) => checkedExams.current.delete(message.id)));
  }, [messages, user?.id, examCourseId, examName]);

  useLayoutEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (restoreFromBottom.current != null) {
      stream.scrollTop = stream.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
    } else if (stickToBottom.current) {
      stream.scrollTop = stream.scrollHeight;
    }
  }, [messages, status]);

  async function loadOlder() {
    const first = messagesRef.current[0];
    if (!first || olderLoading) return;
    setOlderLoading(true);
    try {
      const page = await fetchRoomMessages(roomId, first);
      const stream = streamRef.current;
      restoreFromBottom.current = stream ? stream.scrollHeight - stream.scrollTop : null;
      stickToBottom.current = false;
      commit(mergeOlderPage(messagesRef.current, page));
      setHasMore(page.length === ROOM_PAGE_SIZE);
    } catch {
      toast(t("courseSpaces.error.generic"), "error");
    } finally {
      setOlderLoading(false);
    }
  }

  async function send(payload) {
    const row = await postRoomMessage({ userId: user.id, roomId, ...payload });
    stickToBottom.current = true;
    commit(sortMessages([...messagesRef.current.filter((message) => message.id !== row.id), row]));
    onActivity?.(entry.offeringId, row.created_at);
    notifyXPChanged();
  }

  async function remove(message) {
    if (!window.confirm(t("courseSpaces.message.deleteConfirm"))) return;
    try {
      await deleteRoomMessage(message, user.id);
      commit(messagesRef.current.filter((item) => item.id !== message.id));
      toast(t("courseSpaces.message.deleted"), "info");
    } catch {
      toast(t("courseSpaces.error.generic"), "error");
    }
  }

  async function report(reason) {
    if (!reportTarget || reporting) return;
    setReporting(true);
    try {
      await reportRoomMessage(reportTarget.id, reason);
      commit(messagesRef.current.filter((item) => item.id !== reportTarget.id));
      setReportTarget(null);
      toast(t("courseSpaces.message.reported"), "info");
    } catch (error) {
      toast(t(courseSpaceErrorKey(error, "report")), "error");
    } finally {
      setReporting(false);
    }
  }

  function block(authorId) {
    const name = authorName(authors[authorId], t("common.unknownUser"));
    if (!window.confirm(t("courseSpaces.message.blockConfirm").replace("{name}", name))) return;
    onBlock(authorId, name);
  }

  const setAttachment = (id, patch) => setAttachments((previous) => ({ ...previous, [id]: { ...(previous[id] || {}), ...patch } }));

  async function signedUrlFor(message) {
    const cached = attachmentsRef.current[message.id];
    if (cached?.url && Date.now() - cached.signedAt < SIGNED_URL_REUSE_MS) return cached.url;
    const url = await signRoomAttachment(message.attachment_url);
    setAttachment(message.id, { url, signedAt: Date.now() });
    return url;
  }

  async function showImage(message) {
    setAttachment(message.id, { status: "loading" });
    try {
      await signedUrlFor(message);
      setAttachment(message.id, { status: "ready" });
    } catch {
      setAttachment(message.id, { status: "error" });
    }
  }

  // The tab opens inside the tap itself, before the signing round trip, so no
  // pop-up blocker refuses it; it is pointed at the signed link once ready.
  async function openAttachment(message) {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setAttachment(message.id, { status: "loading" });
    try {
      const url = await signedUrlFor(message);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener");
      setAttachment(message.id, { status: "ready" });
    } catch {
      tab?.close();
      setAttachment(message.id, { status: "error" });
    }
  }

  async function addExam(message) {
    if (exams[message.id]) return;
    setExams((previous) => ({ ...previous, [message.id]: "saving" }));
    try {
      await addSharedExamToPlanning({ userId: user.id, courseId: examCourseId, name: examName, examDate: message.exam_date });
      setExams((previous) => ({ ...previous, [message.id]: "done" }));
      notifyXPChanged();
    } catch {
      setExams((previous) => ({ ...previous, [message.id]: null }));
      toast(t("courseSpaces.error.generic"), "error");
    }
  }

  const blocked = useMemo(() => new Set(blockedIds), [blockedIds]);
  const items = useMemo(() => groupRoomMessages(messages.filter((message) => !blocked.has(message.user_id)), user?.id), [messages, blocked, user?.id]);
  const isAdmin = !!profile?.is_admin;

  // Nothing open. With nothing to open either, the list already says why in
  // one sentence; a second empty-state here would only repeat it.
  if (!entry) {
    return <section className="bt-course-room card bt-social-panel is-empty" aria-label={t("courseSpaces.title")}>
      {hasSpaces && <p className="bt-course-note">{t("courseSpaces.empty.room")}</p>}
    </section>;
  }

  const details = [
    entry.personalName && t("courseSpaces.yourCourse").replace("{name}", entry.personalName),
    entry.memberCount && t("courseSpaces.members").replace("{n}", entry.memberCount),
  ].filter(Boolean);
  const actions = entry.joined ? [{ key: "leave", label: t("courseSpaces.leave"), onSelect: () => onLeave(entry), danger: true }] : [];

  function messageActions(message) {
    if (message.user_id === user?.id) return [{ key: "delete", label: t("courseSpaces.message.delete"), onSelect: () => remove(message), danger: true }];
    const list = [
      { key: "report", label: t("courseSpaces.message.report"), onSelect: () => setReportTarget(message) },
      { key: "block", label: t("courseSpaces.message.block").replace("{name}", authorName(authors[message.user_id], t("common.unknownUser"))), onSelect: () => block(message.user_id) },
    ];
    if (isAdmin) list.push({ key: "delete", label: t("courseSpaces.message.delete"), onSelect: () => remove(message), danger: true });
    return list;
  }

  return <section ref={panelRef} className={`bt-course-room card bt-social-panel${fullscreen ? " bt-social-panel--chat" : ""}`}
    aria-labelledby="course-room-title">
    <header className="bt-course-room-head">
      <button type="button" className="bt-course-icon-btn bt-course-back" onClick={onBack} aria-label={t("common.back")}><IconBack /></button>
      <div className="bt-course-room-title">
        <h2 id="course-room-title"><CourseMarker course={entry.course} /><span>{entry.title}</span></h2>
        {details.length > 0 && <p>{details.join(" · ")}</p>}
      </div>
      {entry.course && <button type="button" className="bt-course-study" onClick={() => onStudy(entry)}>{t("courseSpaces.study")}</button>}
      {actions.length > 0 && <FilterMenu className="bt-course-room-menu" menuClassName="bt-course-menu" ariaLabel={t("courseSpaces.roomActions")} triggerClassName="bt-course-icon-btn" trigger={<IconMore />} actions={actions} />}
    </header>

    {!entry.joined ? <div className="bt-course-preview">
      <p>{t("courseSpaces.preview.body")}</p>
      <button type="button" className="btn-primary" disabled={joinPending} aria-busy={joinPending || undefined} onClick={() => onJoin(entry)}>
        {t("courseSpaces.join")}
      </button>
      <p className="bt-course-preview-note">{t("courseSpaces.preview.privacy")}</p>
    </div> : <>
      <div ref={streamRef} className="bt-course-stream" role="log" aria-live="off"
        aria-label={t("courseSpaces.room.label").replace("{title}", entry.title)} aria-busy={status === "loading" || undefined}>
        {hasMore && <button type="button" className="bt-course-older" disabled={olderLoading} onClick={loadOlder}>
          {olderLoading ? t("common.loading") : t("courseSpaces.room.older")}
        </button>}
        {status === "loading" && !messages.length && <p className="bt-course-note" role="status">{t("common.loading")}</p>}
        {status === "error" && <div className="bt-course-note" role="alert">
          <p>{t("courseSpaces.room.error")}</p>
          <button type="button" className="bt-course-text-btn" onClick={() => load()}>{t("courseSpaces.retry")}</button>
        </div>}
        {status === "ready" && !items.length && <div className="bt-course-room-empty">
          <p><strong>{t("courseSpaces.room.empty")}</strong></p>
          <p>{t("courseSpaces.room.emptyHint")}</p>
        </div>}
        {items.map((item) => {
          if (item.type === "day") {
            return <p key={item.key} className="bt-course-day"><time dateTime={item.day}>{dayLabel(item.day, t, lang)}</time></p>;
          }
          const author = authors[item.userId] || {};
          const name = item.mine ? t("courseSpaces.message.you") : authorName(authors[item.userId], "…");
          return <div key={item.key} className={`bt-course-group${item.mine ? " is-mine" : ""}`}>
            {!item.mine && <button type="button" className="bt-course-avatar" onClick={() => setProfileId(item.userId)} aria-label={name}>
              <Avatar url={author.avatar_url} pseudo={name} size={32} />
            </button>}
            <div className="bt-course-group-body">
              <p className="bt-course-group-meta">
                {item.mine ? <span className="sr-only">{name}</span>
                  : <button type="button" className="bt-course-author bt-tap-44" onClick={() => setProfileId(item.userId)}>{name}</button>}
                <time dateTime={item.messages[0].created_at}>{timeLabel(item.messages[0].created_at, lang)}</time>
              </p>
              {item.messages.map((message) => <div key={message.id} className={`bt-course-message${activeMessageId === message.id ? " is-active" : ""}`}>
                <div className="bt-course-bubble" onClick={(event) => {
                  if (event.target.closest("a, button")) return;
                  setActiveMessageId((current) => current === message.id ? null : message.id);
                }}>
                  {message.content && <p className="bt-course-text">{message.content}</p>}
                  {message.exam_date && <div className="bt-course-exam">
                    <PlanningExamMark label={t("courseSpaces.exam.label")} />
                    <time dateTime={message.exam_date}>{examLabel(message.exam_date, lang)}</time>
                    <button type="button" className="bt-course-exam-add" disabled={!!exams[message.id]} onClick={() => addExam(message)}>
                      {exams[message.id] === "done" ? t("courseSpaces.exam.added") : t("courseSpaces.exam.add")}
                    </button>
                  </div>}
                  {message.attachment_url && <Attachment message={message} mine={item.mine} state={attachments[message.id]} onShowImage={showImage} onOpen={openAttachment} t={t} />}
                </div>
                <FilterMenu ariaLabel={t("courseSpaces.message.actions")} triggerClassName="bt-course-message-menu" menuClassName="bt-course-menu"
                  trigger={<IconMore size={18} />} actions={messageActions(message)} align={item.mine ? "right" : "left"} />
              </div>)}
            </div>
          </div>;
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <Composer t={t} title={entry.title} roomId={roomId} onSend={send} />
    </>}

    <InboxSheet open={!!reportTarget} title={t("courseSpaces.report.title")} closeLabel={t("common.close")} onClose={() => { if (!reporting) setReportTarget(null); }}>
      <div className="bt-course-report">
        <p>{t("courseSpaces.report.hint")}</p>
        <div className="bt-course-report-reasons">
          {REPORT_REASONS.map((reason) => <button key={reason} type="button" disabled={reporting} onClick={() => report(reason)}>
            {t(`courseSpaces.report.${reason}`)}
          </button>)}
        </div>
      </div>
    </InboxSheet>
    {profileId && <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
  </section>;
}
