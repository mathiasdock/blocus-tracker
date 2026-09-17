import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import InboxSheet from "../InboxSheet";
import { Avatar } from "../Layout";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { useTimer } from "../../contexts/TimerContext";
import { isOfflineDev } from "../../lib/supabaseClient";
import { buildCourseSpaceView, coldStartState, courseSpaceErrorKey, pickInitialSpace, toSpaceEntry } from "../../lib/courseSpaces.mjs";
import {
  answerCourseMatch, blockStudent, fetchAuthors, fetchBlockedIds, joinCourseSpace,
  joinDefaultSpace, leaveCourseSpace, loadCourseSpaceOverview, searchCourseSpaces, unblockStudent,
} from "../../lib/courseSpacesClient";
import CourseSpaceList from "./CourseSpaceList";
import CourseRoom, { authorName } from "./CourseRoom";

// /communautes — course spaces (docs/course-spaces.md).
//
// MY PERSONAL COURSES → MATCHED CANONICAL COURSES → RELEVANT SPACES →
// VOLUNTARY JOIN → ONE COURSE CONVERSATION. Not a directory, not a feed.
//
// LAYOUT. Desktop keeps the full-height social shell shared with Friends
// (styles/globals.css, "bt-social-fill"): list a third wide on the left, the
// open space on the right. Phone: the list alone, then the space full screen
// with its own back button.
export default function CourseSpaces() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { communityCount, markSeen } = useNotifications();
  const { courseId: timerCourseId, setCourseId, running, elapsed } = useTimer();
  const router = useRouter();
  const [overview, setOverview] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ query: "", rows: [], loading: false, error: false });
  const [activeId, setActiveId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [pending, setPending] = useState({});
  const [blockedIds, setBlockedIds] = useState([]);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState({});
  const overviewRequest = useRef(0);
  const searchRequest = useRef(0);
  const autoSelected = useRef(false);
  const university = String(profile?.university || "").trim();
  const hasInstitution = university.length >= 2;

  const view = useMemo(() => buildCourseSpaceView(overview || {}), [overview]);
  const searchEntries = useMemo(() => search.rows.map((row) => toSpaceEntry(row, view.linkedByOffering)), [search.rows, view.linkedByOffering]);
  // Joined rows win over suggestions and search rows for the same space.
  const entries = useMemo(() => new Map([...searchEntries, ...view.suggestions, ...view.joined, ...view.defaults].map((entry) => [entry.id, entry])), [searchEntries, view]);
  const activeEntry = activeId ? entries.get(activeId) || (snapshot?.id === activeId ? snapshot : null) : null;
  const coldStart = loadState === "ready" ? coldStartState({ hasInstitution, view }) : null;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    const request = ++overviewRequest.current;
    try {
      const next = await loadCourseSpaceOverview(user.id);
      if (request !== overviewRequest.current) return;
      setOverview(next);
      setLoadState("ready");
    } catch {
      if (request === overviewRequest.current) setLoadState((state) => state === "ready" ? state : "error");
    }
  }, [user]);

  // The institution is the matching boundary: a changed profile resolves again.
  useEffect(() => { setLoadState("loading"); refresh(); }, [refresh, university]);

  useEffect(() => {
    if (!user) return;
    fetchBlockedIds(user.id).then(setBlockedIds).catch(() => {});
  }, [user]);

  // Desktop opens the most useful space once: the first joined course space,
  // otherwise the institution space — so the right panel is never blank while
  // the student has no course match yet. The phone starts on the list.
  useEffect(() => {
    if (autoSelected.current || loadState !== "ready" || !desktop || activeId) return;
    autoSelected.current = true;
    const first = pickInitialSpace(view);
    if (first) { setActiveId(first.id); setSnapshot(first); }
  }, [loadState, desktop, activeId, view]);

  useEffect(() => {
    const trimmed = query.trim();
    const request = ++searchRequest.current;
    if (trimmed.length < 2 || !hasInstitution) {
      setSearch({ query: trimmed, rows: [], loading: false, error: false });
      return undefined;
    }
    setSearch((previous) => ({ ...previous, query: trimmed, loading: true, error: false }));
    const timer = setTimeout(async () => {
      try {
        const rows = await searchCourseSpaces(trimmed);
        if (request === searchRequest.current) setSearch({ query: trimmed, rows, loading: false, error: false });
      } catch {
        if (request === searchRequest.current) setSearch({ query: trimmed, rows: [], loading: false, error: true });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, hasInstitution]);

  useEffect(() => {
    document.documentElement.classList.toggle("bt-chat-fullscreen", mobileOpen && !desktop);
    return () => document.documentElement.classList.remove("bt-chat-fullscreen");
  }, [mobileOpen, desktop]);

  const busy = (key, value) => setPending((previous) => {
    const next = { ...previous };
    if (value) next[key] = true; else delete next[key];
    return next;
  });

  function open(entry) {
    setActiveId(entry.id);
    setSnapshot(entry);
    setMobileOpen(true);
  }

  // A course space is joined through its canonical course; an institution or
  // program space through its room, and only if it is the caller's own.
  async function join(entry) {
    if (pending[entry.id]) return;
    busy(entry.id, true);
    try {
      const roomId = entry.kind === "course" ? await joinCourseSpace(entry.offeringId) : await joinDefaultSpace(entry.roomId);
      setSnapshot({ ...entry, roomId, joined: true });
      setActiveId(entry.id);
      setMobileOpen(true);
      await refresh();
      if (search.query.length >= 2) setSearch((previous) => ({ ...previous, rows: previous.rows.map((row) => row.offering_id === entry.offeringId ? { ...row, room_id: roomId, joined: true } : row) }));
    } catch (error) {
      toast(t(courseSpaceErrorKey(error, "join")), "error");
    } finally {
      busy(entry.id, false);
    }
  }

  async function leave(entry) {
    if (!entry.roomId || pending[entry.id]) return;
    busy(entry.id, true);
    try {
      await leaveCourseSpace(entry.roomId);
      // The space stays open as a preview: joining again is one tap away.
      setSnapshot({ ...entry, joined: false, lastMessageAt: null });
      setSearch((previous) => ({ ...previous, rows: previous.rows.map((row) => row.offering_id === entry.offeringId ? { ...row, joined: false } : row) }));
      toast(t("courseSpaces.left").replace("{title}", entry.title), "info");
      await refresh();
    } catch (error) {
      toast(t(courseSpaceErrorKey(error)), "error");
    } finally {
      busy(entry.id, false);
    }
  }

  async function answer(question, accept) {
    if (pending[question.key]) return;
    busy(question.key, true);
    try {
      await answerCourseMatch(question.course.id, question.offeringId, accept);
      await refresh();
    } catch {
      toast(t("courseSpaces.error.generic"), "error");
    } finally {
      busy(question.key, false);
    }
  }

  // "Étudier ce cours": the Timer on the student's OWN course. A session
  // already under way on another course is never re-attributed silently.
  function study(entry) {
    if (!entry.course) return;
    if ((running || elapsed > 0) && timerCourseId && timerCourseId !== entry.course.id) {
      toast(t("courseSpaces.studyRunning"), "info");
    } else {
      setCourseId(entry.course.id);
    }
    router.push("/dashboard");
  }

  async function block(authorId, name) {
    try {
      await blockStudent(user.id, authorId);
      setBlockedIds((previous) => previous.includes(authorId) ? previous : [...previous, authorId]);
      toast(t("courseSpaces.message.blocked").replace("{name}", name), "info");
    } catch {
      toast(t("courseSpaces.error.generic"), "error");
    }
  }

  async function unblock(blockedId) {
    try {
      await unblockStudent(user.id, blockedId);
      setBlockedIds((previous) => previous.filter((id) => id !== blockedId));
    } catch {
      toast(t("courseSpaces.error.generic"), "error");
    }
  }

  useEffect(() => {
    if (!blockedOpen || !blockedIds.length) return;
    fetchAuthors(blockedIds)
      .then((rows) => setBlockedProfiles(Object.fromEntries(rows.map((row) => [row.id, row]))))
      .catch(() => {});
  }, [blockedOpen, blockedIds]);

  const unreadFor = useCallback((roomId) => (roomId ? communityCount[`room_${roomId}`] || 0 : 0), [communityCount]);

  // A message written or read in the open room moves its row's activity
  // without resolving every course link again.
  const noteActivity = useCallback((roomId, at) => {
    setOverview((previous) => {
      if (!previous) return previous;
      const fresher = (row) => row.room_id === roomId && row.joined
        && (!row.last_message_at || Date.parse(row.last_message_at) < Date.parse(at));
      if (!previous.summaries.some(fresher) && !(previous.defaults || []).some(fresher)) return previous;
      const stamp = (row) => fresher(row) ? { ...row, last_message_at: at } : row;
      return { ...previous, summaries: previous.summaries.map(stamp), defaults: (previous.defaults || []).map(stamp) };
    });
  }, []);

  return <div className={`bt-course-spaces bt-social-fill-grid${mobileOpen ? " is-open" : ""}`}>
    <CourseSpaceList
      t={t} lang={lang} view={view} loadState={loadState} onRetry={() => { setLoadState("loading"); refresh(); }}
      coldStart={coldStart} query={query} onQuery={setQuery} search={search} searchEntries={searchEntries}
      hasInstitution={hasInstitution} activeId={activeId} onOpen={open} onJoin={join} pending={pending}
      onAnswer={answer} unreadFor={unreadFor} blockedCount={blockedIds.length}
      onOpenBlocked={() => setBlockedOpen(true)} demo={isOfflineDev} />

    <CourseRoom
      entry={activeEntry} hasSpaces={entries.size > 0 || view.questions.length > 0} user={user} profile={profile} t={t} lang={lang} toast={toast}
      visible={desktop || mobileOpen} fullscreen={mobileOpen && !desktop}
      onBack={() => setMobileOpen(false)} onJoin={join} joinPending={!!(activeEntry && pending[activeEntry.offeringId])}
      onLeave={leave} onStudy={study} blockedIds={blockedIds} onBlock={block} markSeen={markSeen} onActivity={noteActivity} />

    <InboxSheet open={blockedOpen} title={t("courseSpaces.blockedTitle")} closeLabel={t("common.close")} onClose={() => setBlockedOpen(false)}>
      <div className="bt-course-blocked">
        <p>{t("courseSpaces.blockedHint")}</p>
        {!blockedIds.length ? <p>{t("courseSpaces.blockedNone")}</p> : <ul>
          {blockedIds.map((id) => {
            const person = blockedProfiles[id] || {};
            const name = authorName(blockedProfiles[id], t("common.unknownUser"));
            return <li key={id}>
              <Avatar url={person.avatar_url} pseudo={name} size={32} />
              <span>{name}</span>
              <button type="button" className="bt-course-text-btn" onClick={() => unblock(id)}>{t("courseSpaces.unblock")}</button>
            </li>;
          })}
        </ul>}
      </div>
    </InboxSheet>
  </div>;
}
