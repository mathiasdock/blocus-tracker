import Link from "next/link";
import { timeAgo } from "../../lib/format";

// Left column: search, the spaces the student joined, then the spaces that
// exist for their own courses. Text first; the only color is the student's
// personal course marker. No kind icon, no tile, no directory.

// Replaces {placeholders} with nodes, so a translated sentence can carry the
// student's course names in bold without splitting the string in the code.
export function fillParts(template, values) {
  return String(template).split(/(\{\w+\})/g).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && key in values ? <span key={index}>{values[key]}</span> : part;
  });
}

export function CourseMarker({ course }) {
  return <span className={`bt-course-marker${course?.color ? "" : " is-empty"}`} aria-hidden="true"
    style={course?.color ? { "--course": course.color } : undefined} />;
}

function membersLabel(t, count) {
  return count ? t("courseSpaces.members").replace("{n}", count) : null;
}

function SpaceRow({ entry, t, lang, selected, unread, onOpen, pending, onJoin, joinable }) {
  const details = [
    entry.personalName && t("courseSpaces.yourCourse").replace("{name}", entry.personalName),
    membersLabel(t, entry.memberCount),
    // "Dernier message 15 sept.", never a bare date: on a surface that shares
    // exam dates, a lone date reads as the exam.
    entry.joined && (entry.lastMessageAt
      ? t("courseSpaces.lastMessage").replace("{when}", timeAgo(entry.lastMessageAt, lang)).replace(/ /g, "\u00a0")
      : t("courseSpaces.noMessagesYet")),
  ].filter(Boolean);
  return <li className={`bt-course-row${selected ? " is-selected" : ""}`}>
    <button type="button" className="bt-course-row-open" onClick={() => onOpen(entry)} aria-current={selected ? "true" : undefined}>
      <CourseMarker course={entry.course} />
      <span className="bt-course-row-text">
        <strong>{entry.title}</strong>
        {details.length > 0 && <small>{details.join(" · ")}</small>}
      </span>
      {unread > 0 && <span className="bt-course-unread">
        <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
        <span className="sr-only">{t("courseSpaces.unread").replace("{n}", unread)}</span>
      </span>}
    </button>
    {joinable && !entry.joined && <button type="button" className="bt-course-join" disabled={pending}
      aria-busy={pending || undefined} aria-label={t("courseSpaces.joinTitle").replace("{title}", entry.title)}
      onClick={() => onJoin(entry)}>{t("courseSpaces.join")}</button>}
    {joinable && entry.joined && <span className="bt-course-joined">{t("courseSpaces.joinedState")}</span>}
  </li>;
}

function Question({ question, t, pending, onAnswer }) {
  return <li className="bt-course-question">
    <p>
      <CourseMarker course={question.course} />
      <span>{fillParts(t("courseSpaces.question"), {
        course: <strong>{question.course.name}</strong>,
        offering: <strong>{question.offeringTitle}</strong>,
      })}</span>
    </p>
    <div className="bt-course-answers" role="group" aria-label={t("courseSpaces.questionLabel").replace("{course}", question.course.name)}>
      <button type="button" disabled={pending} onClick={() => onAnswer(question, true)}>{t("courseSpaces.yes")}</button>
      <button type="button" disabled={pending} onClick={() => onAnswer(question, false)}>{t("courseSpaces.no")}</button>
    </div>
  </li>;
}

export default function CourseSpaceList({
  t, lang, view, loadState, onRetry, coldStart,
  query, onQuery, search, searchEntries, hasInstitution,
  activeId, onOpen, onJoin, pending, onAnswer, unreadFor,
  blockedCount, onOpenBlocked, demo,
}) {
  const searching = query.trim().length > 0;
  const row = (entry, joinable) => <SpaceRow key={entry.offeringId} entry={entry} t={t} lang={lang}
    selected={activeId === entry.offeringId} unread={entry.joined ? unreadFor(entry.roomId) : 0}
    onOpen={onOpen} onJoin={onJoin} pending={!!pending[entry.offeringId]} joinable={joinable} />;

  return <aside className="bt-course-list card bt-social-panel">
    <header className="bt-course-list-head">
      <h1>{t("courseSpaces.title")}</h1>
      <label className="sr-only" htmlFor="course-space-search">{t("courseSpaces.searchLabel")}</label>
      <input id="course-space-search" className="input bt-course-search" type="search" enterKeyHint="search"
        autoComplete="off" maxLength={120} value={query} placeholder={t("courseSpaces.searchPlaceholder")}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); onQuery(""); } }} />
    </header>

    <div className="bt-course-list-scroll">
      {searching ? <section aria-labelledby="course-search-title" aria-busy={search.loading || undefined}>
        <h2 id="course-search-title" className="bt-course-section-title">{t("courseSpaces.searchResults")}</h2>
        {!hasInstitution ? <p className="bt-course-note">{t("courseSpaces.searchNoInstitution")}</p>
          : query.trim().length < 2 ? <p className="bt-course-note">{t("courseSpaces.searchShort")}</p>
          : search.error ? <p className="bt-course-note" role="alert">{t("courseSpaces.error.generic")}</p>
          : search.loading && !searchEntries.length ? <p className="bt-course-note" role="status">{t("common.loading")}</p>
          : !searchEntries.length ? <p className="bt-course-note">{t("courseSpaces.searchEmpty").replace("{query}", query.trim())}</p>
          : <ul className="bt-course-rows">{searchEntries.map((entry) => row(entry, true))}</ul>}
      </section> : <>
        {loadState === "error" && <div className="bt-course-note" role="alert">
          <p>{t("courseSpaces.loadError")}</p>
          <button type="button" className="bt-course-text-btn" onClick={onRetry}>{t("courseSpaces.retry")}</button>
        </div>}
        {loadState === "loading" && <p className="bt-course-note" role="status">{t("common.loading")}</p>}

        {loadState === "ready" && <>
          {view.joined.length > 0 && <section aria-labelledby="course-joined-title">
            <h2 id="course-joined-title" className="bt-course-section-title">{t("courseSpaces.joinedTitle")}</h2>
            <ul className="bt-course-rows">{view.joined.map((entry) => row(entry, false))}</ul>
          </section>}

          {(view.questions.length > 0 || view.suggestions.length > 0) && <section aria-labelledby="course-for-you-title">
            <h2 id="course-for-you-title" className="bt-course-section-title">{t("courseSpaces.forYourCourses")}</h2>
            {view.questions.length > 0 && <ul className="bt-course-questions">
              {view.questions.map((question) => <Question key={question.key} question={question} t={t}
                pending={!!pending[question.key]} onAnswer={onAnswer} />)}
            </ul>}
            {view.suggestions.length > 0 && <ul className="bt-course-rows">{view.suggestions.map((entry) => row(entry, true))}</ul>}
          </section>}

          {coldStart && <div className="bt-course-cold">
            <p>{t(`courseSpaces.empty.${coldStart}`)}</p>
            {coldStart === "noInstitution" && <Link href="/profile" className="bt-course-text-btn">{t("courseSpaces.empty.noInstitutionAction")}</Link>}
            {coldStart === "noCourses" && <Link href="/dashboard" className="bt-course-text-btn">{t("courseSpaces.empty.noCoursesAction")}</Link>}
            {coldStart === "noMatches" && <p>{t("courseSpaces.empty.searchInvite")}</p>}
          </div>}
        </>}
      </>}

      {(blockedCount > 0 || demo) && <footer className="bt-course-list-foot">
        {blockedCount > 0 && <button type="button" className="bt-course-text-btn is-quiet" onClick={onOpenBlocked}>
          {t("courseSpaces.blockedLink").replace("{n}", blockedCount)}
        </button>}
        {demo && <small>{t("courseSpaces.demo")}</small>}
      </footer>}
    </div>
  </aside>;
}
