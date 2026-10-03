import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatStream, { ChatComposer, chatStyles, useChatViewport } from "../ChatStream";
import FilterMenu from "../FilterMenu";
import Glyph from "../Glyph";
import InboxSheet from "../InboxSheet";
import PlanningExamMark from "../PlanningExamMark";
import UserProfileModal from "../UserProfileModal";
import { displayName } from "../../lib/format";
import { notifyXPChanged } from "../../lib/xpEvents";
import { uploadErrorMessage, validateUploadSource } from "../../lib/security";
import {
  MESSAGE_MAX_LENGTH, courseSpaceErrorKey, examDateBounds, isSharedExamPlanned,
  mergeLatestPage, mergeOlderPage, newMessagesFromOthers, sortMessages, splitFileName,
} from "../../lib/courseSpaces.mjs";
import {
  ROOM_PAGE_SIZE, addSharedExamToPlanning, deleteRoomMessage, fetchAuthors, fetchRoomMessages,
  fetchRoomMessagesAfter, findPlannedExams, postRoomMessage, reportRoomMessage, signRoomAttachment,
} from "../../lib/courseSpacesClient";
import { spaceIdentity, spaceMark } from "./CourseSpaceList";

// Right column: one course, one chronological conversation. Members read and
// write; anyone else sees what joining means and a way to join. Study actions
// are the only Blocus-specific ones: start the Timer on the student's own
// course, and put a shared exam date into their own Planning.
// Relecture d'un salon ouvert : seulement les nouveaux messages, toutes les
// 15 s après de l'activité, puis de plus en plus espacée quand rien ne bouge
// (30 s, 60 s). Rien quand l'onglet est caché ; relecture complète au retour
// (messages supprimés entre-temps). Avant : les 40 derniers messages
// retéléchargés toutes les 15 s, même sans aucun nouveau message.
const POLL_MS = 15000;
const POLL_MAX_MS = 60000;
const CHAT_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const REPORT_REASONS = ["spam", "abuse", "other"];
const SIGNED_URL_REUSE_MS = 4 * 60 * 1000;

const IconBack = () => <Glyph size={22}><path d="M15 5.5 8.5 12l6.5 6.5" /></Glyph>;
const IconMore = ({ size = 20 }) => <Glyph size={size}>
  <circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
  <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
  <circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
</Glyph>;
const IconCalendar = () => <Glyph size={20}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></Glyph>;
const IconClose = () => <Glyph size={16}><path d="m6 6 12 12M6 18 18 6" /></Glyph>;

// Auteur d'un message de salon ; stable, pour que le fil ne se recalcule pas.
const roomAuthorOf = (message) => message.user_id;

// displayName() falls back to a French word; an author still loading shows an
// ellipsis instead, and an unknown one the translated "User".
export function authorName(person, fallback) {
  return person && (person.first_name || person.last_name || person.pseudo) ? displayName(person) : fallback;
}

function examLabel(date, lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-BE", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
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
  const bounds = useMemo(() => examDateBounds(), []);
  const text = draft.trim();
  const dateReady = !examOpen || !examDate || (examDate >= bounds.min && examDate <= bounds.max);
  const canSend = !sending && dateReady && text.length <= MESSAGE_MAX_LENGTH && !!(text || file || (examOpen && examDate));
  const remaining = MESSAGE_MAX_LENGTH - draft.length;

  useEffect(() => { setDraft(""); setFile(null); setExamOpen(false); setExamDate(""); setError(""); }, [roomId]);

  function pick(input) {
    const selected = input.files?.[0];
    input.value = "";
    if (!selected) return;
    const check = validateUploadSource(selected, "chatAttachment");
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
    } catch (failure) {
      setError(failure?.refusalKey ? t(failure.refusalKey)
        : failure?.upload ? uploadErrorMessage(t, failure.upload)
          : t(courseSpaceErrorKey(failure)));
    } finally {
      setSending(false);
    }
  }

  // Le même champ que les messages privés, avec en plus la date d'examen à
  // partager (un outil de plus dans la capsule, sa date au-dessus).
  return <ChatComposer
    onSubmit={submit}
    value={draft}
    onChange={setDraft}
    placeholder={t("courseSpaces.composer.placeholder")}
    label={t("courseSpaces.composer.label").replace("{title}", title)}
    maxLength={MESSAGE_MAX_LENGTH + 200}
    sending={sending}
    canSend={canSend}
    file={file}
    onRemoveFile={() => setFile(null)}
    fileInputRef={fileRef}
    accept={CHAT_ACCEPT}
    onFile={pick}
    tools={[{
      key: "exam", label: t("courseSpaces.composer.exam"), icon: <IconCalendar />, pressed: examOpen,
      onClick: () => setExamOpen((open) => !open),
    }]}
    above={examOpen ? <div className={`${chatStyles.extra} bt-course-composer-extra`}>
      <label htmlFor={`course-exam-${roomId}`}>{t("courseSpaces.exam.label")}</label>
      <input id={`course-exam-${roomId}`} className="input" type="date" min={bounds.min} max={bounds.max}
        value={examDate} onChange={(event) => setExamDate(event.target.value)} />
      <button type="button" className={chatStyles.extraRemove} aria-label={t("courseSpaces.composer.removeExam")}
        onClick={() => { setExamOpen(false); setExamDate(""); }}><IconClose /></button>
    </div> : null}
    below={<>
      {remaining < 100 && <p className={`bt-course-composer-count${remaining < 0 ? " is-over" : ""}`} aria-live="polite">
        {remaining < 0 ? t("courseSpaces.error.tooLong") : t("courseSpaces.composer.remaining").replace("{n}", remaining)}
      </p>}
      {error && <p id={`course-composer-error-${roomId}`} className="bt-course-composer-error bt-form-error" role="alert">{error}</p>}
    </>}
    inputId={`course-message-${roomId}`}
    describedBy={error ? `course-composer-error-${roomId}` : undefined}
    t={t}
  />;
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
  const panelRef = useRef(null);
  const messagesRef = useRef([]);
  const loadRequest = useRef(0);
  const knownAuthors = useRef(new Set());
  const checkedExams = useRef(new Set());
  // The language can change while a room is open; that must not reload it.
  // Same for the list callback and the offering id read by a poll.
  const tRef = useRef(t);
  const activityRef = useRef(onActivity);
  const roomRef = useRef(roomId);
  useEffect(() => { tRef.current = t; activityRef.current = onActivity; roomRef.current = roomId; }, [t, onActivity, roomId]);

  useChatViewport(panelRef, fullscreen, roomId);

  const commit = useCallback((next) => { messagesRef.current = next; setMessages(next); }, []);

  const load = useCallback(async (background = false) => {
    if (!roomId) return;
    const request = ++loadRequest.current;
    if (!background) setStatus("loading");
    try {
      const page = await fetchRoomMessages(roomId);
      if (request !== loadRequest.current) return;
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
      if (newest) activityRef.current?.(roomRef.current, newest.created_at);
      setStatus("ready");
    } catch {
      if (request === loadRequest.current && !background) setStatus("error");
    }
  }, [roomId, user?.id, commit]);

  useEffect(() => {
    commit([]); setHasMore(false); setAttachments({}); setExams({}); setAnnouncement("");
    checkedExams.current = new Set();
    if (!roomId) { setStatus("idle"); return undefined; }
    load();
    return () => { loadRequest.current += 1; };
  }, [roomId, load, commit]);

  // Nouveaux messages seulement ; renvoie leur nombre.
  const pollNew = useCallback(async () => {
    const previous = messagesRef.current;
    const newest = previous[previous.length - 1];
    if (!roomId || !newest) { await load(true); return 0; }
    try {
      const rows = await fetchRoomMessagesAfter(roomId, newest);
      if (!rows.length) return 0;
      // Beaucoup d'un coup : la page complète reprend la main.
      if (rows.length >= ROOM_PAGE_SIZE) { await load(true); return rows.length; }
      const ids = new Set(rows.map((row) => row.id));
      const merged = sortMessages([...messagesRef.current.filter((message) => !ids.has(message.id)), ...rows]);
      const fresh = newMessagesFromOthers(previous, merged, user?.id);
      if (fresh) setAnnouncement(fresh === 1 ? tRef.current("courseSpaces.room.newMessage") : tRef.current("courseSpaces.room.newMessages").replace("{n}", fresh));
      commit(merged);
      activityRef.current?.(roomRef.current, merged[merged.length - 1].created_at);
      return rows.length;
    } catch {
      return 0;
    }
  }, [roomId, load, commit, user?.id]);

  const pollKickRef = useRef(null);
  useEffect(() => {
    if (!roomId) return undefined;
    let timer = null;
    let delay = POLL_MS;
    let stopped = false;
    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      timer = setTimeout(async () => {
        const fresh = await pollNew();
        delay = fresh > 0 ? POLL_MS : Math.min(delay * 2, POLL_MAX_MS);
        schedule();
      }, delay);
    };
    // Après un envoi, on revient au rythme rapide : une réponse arrive vite.
    pollKickRef.current = () => { delay = POLL_MS; schedule(); };
    const onVisibility = () => {
      if (document.hidden) { clearTimeout(timer); return; }
      delay = POLL_MS;
      load(true);
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      pollKickRef.current = null;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [roomId, load, pollNew]);

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
  const identity = entry ? spaceIdentity(entry, lang) : { title: "", context: null };
  const examName = entry ? t("courseSpaces.exam.name").replace("{course}", entry.course?.name || identity.title) : "";
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

  // Le fil (ChatStream) garde sa place quand les messages précédents
  // s'ajoutent au-dessus, et reste en bas quand on y est.
  async function loadOlder() {
    const first = messagesRef.current[0];
    if (!first || olderLoading) return;
    setOlderLoading(true);
    try {
      const page = await fetchRoomMessages(roomId, first);
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
    commit(sortMessages([...messagesRef.current.filter((message) => message.id !== row.id), row]));
    onActivity?.(roomId, row.created_at);
    pollKickRef.current?.();
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
  const visibleMessages = useMemo(() => messages.filter((message) => !blocked.has(message.user_id)), [messages, blocked]);
  const isAdmin = !!profile?.is_admin;

  // Nothing open. With nothing to open either, the list already says why in
  // one sentence; a second empty-state here would only repeat it.
  if (!entry) {
    return <section className="bt-course-room card bt-social-panel is-empty" aria-label={t("courseSpaces.title")}>
      {hasSpaces && <p className="bt-course-note">{t("courseSpaces.empty.room")}</p>}
    </section>;
  }

  const { title: roomTitle, context } = identity;
  const details = [
    context,
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

  // Un salon réunit des gens qui ne se connaissent pas forcément : leur nom
  // s'affiche au-dessus de leurs messages (le fil le fait avec `showNames`).
  const roomAuthorFor = (id) => ({ name: authorName(authors[id], "…"), avatarUrl: authors[id]?.avatar_url });

  function renderRoomMessage(message, mine) {
    return <>
      {message.content && <p className={chatStyles.text}>{message.content}</p>}
      {message.exam_date && <div className="bt-course-exam">
        <PlanningExamMark label={t("courseSpaces.exam.label")} />
        <time dateTime={message.exam_date}>{examLabel(message.exam_date, lang)}</time>
        <button type="button" className="bt-course-exam-add" disabled={!!exams[message.id]} onClick={() => addExam(message)}>
          {exams[message.id] === "done" ? t("courseSpaces.exam.added") : t("courseSpaces.exam.add")}
        </button>
      </div>}
      {message.attachment_url && <Attachment message={message} mine={mine} state={attachments[message.id]} onShowImage={showImage} onOpen={openAttachment} t={t} />}
    </>;
  }

  return <section ref={panelRef} className={`bt-course-room card bt-social-panel${fullscreen ? " bt-social-panel--chat" : ""}`}
    aria-labelledby="course-room-title">
    <header className="bt-course-room-head">
      <button type="button" className="bt-course-icon-btn bt-course-back" onClick={onBack} aria-label={t("common.back")}><IconBack /></button>
      <div className="bt-course-room-title">
        <h2 id="course-room-title">{spaceMark(entry, 34, lang)}<span>{roomTitle}</span></h2>
        {details.length > 0 && <p>{details.join(" · ")}</p>}
      </div>
      {entry.course && <button type="button" className="bt-course-study" onClick={() => onStudy(entry)}>{t("courseSpaces.study")}</button>}
      {actions.length > 0 && <FilterMenu className="bt-course-room-menu" menuClassName="bt-course-menu" ariaLabel={t("courseSpaces.roomActions")} triggerClassName="bt-course-icon-btn" trigger={<IconMore />} actions={actions} />}
    </header>

    {!entry.joined ? <div className="bt-course-preview">
      <p>{t(`courseSpaces.preview.${entry.kind === "course" ? "body" : entry.kind}`)}</p>
      <button type="button" className="btn-primary" disabled={joinPending} aria-busy={joinPending || undefined} onClick={() => onJoin(entry)}>
        {t("courseSpaces.join")}
      </button>
      <p className="bt-course-preview-note">{t("courseSpaces.preview.privacy")}</p>
    </div> : <>
      {/* Le même fil que les messages privés (components/ChatStream). Pas de
          « Vu » : un salon est ouvert à toute la promo. Pas de présentation au
          début : l'en-tête du salon dit déjà où l'on est. */}
      <ChatStream
        key={roomId}
        messages={visibleMessages}
        ready={status === "ready"}
        viewerId={user?.id}
        authorOf={roomAuthorOf}
        authorFor={roomAuthorFor}
        showNames
        onOpenProfile={setProfileId}
        renderContent={renderRoomMessage}
        actionsFor={messageActions}
        actionsMenuClassName="bt-course-menu"
        before={<>
          {hasMore && <button type="button" className="bt-course-older" disabled={olderLoading} onClick={loadOlder}>
            {olderLoading ? t("common.loading") : t("courseSpaces.room.older")}
          </button>}
          {status === "loading" && !messages.length && <p className="bt-course-note" role="status">{t("common.loading")}</p>}
          {status === "error" && <div className="bt-course-note" role="alert">
            <p>{t("courseSpaces.room.error")}</p>
            <button type="button" className="bt-course-text-btn" onClick={() => load()}>{t("courseSpaces.retry")}</button>
          </div>}
        </>}
        empty={<div className="bt-course-room-empty">
          <p><strong>{t("courseSpaces.room.empty")}</strong></p>
          <p>{t("courseSpaces.room.emptyHint")}</p>
        </div>}
        label={t("courseSpaces.room.label").replace("{title}", roomTitle)}
        t={t}
        lang={lang}
      />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <Composer t={t} title={roomTitle} roomId={roomId} onSend={send} />
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
