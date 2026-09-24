import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../contexts/I18nContext";
import { COURSE_COLOR_SEQUENCE } from "../../lib/courseColors";
import Glyph from "../Glyph";
import Mascot from "../Mascot";
import PlanningExamMark from "../PlanningExamMark";
import SegmentedGlide from "../SegmentedGlide";
import StudyByCourse from "../stats/StudyByCourse";
import { CourseMarker } from "../course-spaces/CourseSpaceList";
import useDialogFocus from "../useDialogFocus";
import styles from "./GuestDiscovery.module.css";

const ActivityTimeline = dynamic(() => import("../ActivityTimeline"), { ssr: false });
const StudyTimeChart = dynamic(() => import("../stats/StudyTimeChart"), { ssr: false });

const COURSE_COLORS = {
  physics: COURSE_COLOR_SEQUENCE[1],
  economics: COURSE_COLOR_SEQUENCE[8],
  law: COURSE_COLOR_SEQUENCE[3],
};

const WEEK_MINUTES = [45, 80, 60, 90, 55, 75, 90];
const DEMO_TOTAL_SECS = WEEK_MINUTES.reduce((total, minutes) => total + minutes * 60, 0);

function Icon({ children, size = 18, className = "" }) {
  return <Glyph size={size} className={className}>{children}</Glyph>;
}

function DemoAvatar({ name, color = "var(--bt-action)", size = 38 }) {
  return (
    <span className={styles.avatar} style={{ "--avatar": color, "--avatar-size": `${size}px` }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function DemoLabel({ className = "" }) {
  const { t } = useI18n();
  return <span className={`${styles.demoLabel} ${className}`}>{t("guest.demo.dataLabel")}</span>;
}

export function GuestGate({ gate, onClose }) {
  const { t } = useI18n();
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogFocus(Boolean(gate), close);
  if (!gate) return null;

  return (
    <div className={styles.gateLayer}>
      <button type="button" tabIndex={-1} className={styles.backdrop} onClick={onClose} aria-label={t("common.close")} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="guest-gate-title" tabIndex={-1} className={styles.gate}>
        <div className={styles.sheetHandle} aria-hidden="true" />
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t("common.close")}>
          <Icon size={17}><path d="m6.5 6.5 11 11m0-11-11 11" /></Icon>
        </button>
        <div className={styles.gateMascot}>
          <Mascot mood="focused" size={88} animated={false} ariaLabel={t("guest.gate.mascotLabel")} />
        </div>
        <div className={styles.gateCopy}>
          <h2 id="guest-gate-title">{t(`guest.gate.${gate}.title`)}</h2>
          <p>{t(`guest.gate.${gate}.text`)}</p>
        </div>
        <div className={styles.gateActions}>
          <Link href="/signup" className="btn-primary">{t("guest.createAccount")}</Link>
          <button type="button" className="btn-ghost" onClick={onClose}>{t("guest.continueExploring")}</button>
        </div>
      </section>
    </div>
  );
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(offset = 0) {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day + 1 + offset * 7);
  return date;
}

function formatWeekRange(days, lang) {
  const locale = lang === "en" ? "en-GB" : "fr-BE";
  const first = days[0];
  const last = days[6];
  const firstLabel = first.toLocaleDateString(locale, { day: "numeric", month: first.getMonth() === last.getMonth() ? undefined : "short" });
  const lastLabel = last.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  return `${firstLabel} – ${lastLabel}`;
}

function PlanningLoad({ minutes, segments, label }) {
  const ratio = Math.min(100, (minutes / 480) * 100);
  return (
    <span className="bt-plan-load" role="img" aria-label={label}>
      <span className="bt-plan-load-fill" style={{ inlineSize: `${Math.max(6, ratio)}%` }}>
        {segments.map((segment) => (
          <span key={segment.id} className="bt-plan-load-seg" style={{ flexGrow: segment.minutes, background: segment.color }} />
        ))}
      </span>
    </span>
  );
}

function PlanningWeek({ days }) {
  const { t, lang } = useI18n();
  const locale = lang === "en" ? "en-GB" : "fr-BE";
  const plans = {
    1: { minutes: 45, course: "physics", title: t("guest.demo.physicsRevision"), time: "09:00" },
    2: { minutes: 60, course: "economics", title: t("guest.demo.economicsExam"), time: "14:00", exam: true },
    3: { minutes: 60, course: "economics", title: t("guest.demo.chapter4"), time: "16:30" },
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 border-b px-4 py-2.5 sm:px-5" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>{t("plan.weekLoadTitle")}</h2>
        <p className="font-num shrink-0 text-sm font-bold tabular-nums">2 h 45</p>
      </div>
      <ol>
        {days.map((day, index) => {
          const plan = plans[index];
          const weekday = day.toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
          return (
            <li key={isoDay(day)} className="bt-plan-week-row" data-empty={plan ? undefined : "1"} data-exam={plan?.exam ? "1" : undefined}>
              <div className="bt-plan-week-date">
                <span className="bt-plan-week-weekday">{weekday}</span>
                <span className="bt-plan-week-daynum font-num tabular-nums">{day.getDate()}</span>
              </div>
              <div className="bt-plan-week-body">
                {plan?.exam ? (
                  <div className="bt-plan-week-exams">
                    <div className="bt-planning-week-exam">
                      <PlanningExamMark label={t("plan.examTag")} />
                      <strong className="mt-1 block truncate">{plan.title}</strong>
                      <span className="mt-1 flex items-center gap-1 text-xs">
                        <span className="font-num tabular-nums">{plan.time}</span>
                        <CourseMarker course={{ color: COURSE_COLORS[plan.course] }} />
                        {t("guest.demo.economics")}
                      </span>
                    </div>
                  </div>
                ) : null}
                {plan ? (
                  <>
                    <div className="bt-plan-week-meter">
                      <PlanningLoad minutes={plan.minutes} segments={[{ id: plan.course, minutes: plan.minutes, color: COURSE_COLORS[plan.course] }]} label={`${plan.minutes} min`} />
                      <span className="font-num bt-plan-week-total tabular-nums">{plan.minutes} min</span>
                    </div>
                    <div className="bt-plan-week-chips">
                      <div className="bt-plan-objective-chip">
                        <CourseMarker course={{ color: COURSE_COLORS[plan.course] }} />
                        <span className="min-w-0 truncate">{plan.exam ? t("guest.demo.physicsRevision") : plan.title}</span>
                        {!plan.exam && <span className="font-num shrink-0 tabular-nums" style={{ color: "var(--bt-text-3)" }}>{plan.time}</span>}
                      </div>
                    </div>
                  </>
                ) : <span className="sr-only">{t("plan.noPlan")}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlanningDay({ onGate }) {
  const { t } = useI18n();
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="text-base font-bold">{t("plan.yourDay")}</h2><p className="text-sm" style={{ color: "var(--bt-text-2)" }}>2 {t("plan.todayCardObjectives")} · 1 h 45</p></div>
        <button type="button" className="btn-ghost min-h-11 px-3 text-sm" onClick={() => onGate("planning")}>{t("guest.demo.add")}</button>
      </div>
      <div className="bt-planning-agenda-exam">
        <span className="min-w-0 flex-1">
          <PlanningExamMark label={t("plan.examTag")} />
          <strong className="mt-1 block">{t("guest.demo.economicsExam")}</strong>
          <span className="mt-1 flex items-center gap-2 text-sm"><CourseMarker course={{ color: COURSE_COLORS.economics }} />{t("guest.demo.economics")} · 14:00</span>
        </span>
      </div>
      <ul>
        {[["physics", t("guest.demo.physicsRevision"), "09:00", "45 min"], ["economics", t("guest.demo.chapter4"), "16:30", "1 h"]].map(([course, title, time, duration]) => (
          <li key={title} className="bt-planning-task">
            <label className="flex min-h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" className="bt-task-check h-4 w-4" checked={false} readOnly onClick={() => onGate("planning")} aria-label={title} /></label>
            <div className="min-w-0 flex-1 py-3 text-left">
              <span className="block max-w-full break-words text-sm font-semibold">{title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--bt-text-2)" }}><CourseMarker course={{ color: COURSE_COLORS[course] }} />{t(`guest.demo.${course}`)}<span>{time}</span><span>{duration}</span></span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanningDemo({ onGate }) {
  const { t, lang } = useI18n();
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState("week");
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setView("day");
  }, []);
  const days = useMemo(() => {
    const start = startOfWeek(weekOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [weekOffset]);

  return (
    <div className={`${styles.page} bt-planning flex flex-col gap-5`}>
      <section className="card-ink bt-planning-today p-5">
        <div className="relative z-10">
          <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-base font-bold" style={{ color: "var(--bt-ink-text)" }}>{t("plan.todayCardEyebrow")}</h2><DemoLabel className={styles.demoLabelInk} /></div>
          <div className="bt-planning-today-summary">
            <div className="min-w-0"><p className="text-xl font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>0/2 <span className="text-sm font-medium">{t("plan.todayCardObjectives")}</span></p><p className="mt-1 text-sm" style={{ color: "var(--bt-ink-muted)" }}>2 · 1 h 45</p></div>
            <div className="bt-planning-next-exam min-w-0 text-left">
              <PlanningExamMark label={t("plan.nextExam")} />
              <p className="mt-1 text-lg font-bold" style={{ color: "var(--bt-ink-text)" }}>{t("guest.demo.economicsExam")}</p>
              <p className="mt-1 flex items-center gap-2 text-sm" style={{ color: "var(--bt-ink-muted)" }}><CourseMarker course={{ color: COURSE_COLORS.economics }} />{t("guest.demo.economics")}</p>
              <p className="mt-2 text-sm font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>12 {lang === "en" ? "days" : "jours"}</p>
            </div>
          </div>
        </div>
      </section>

      <div>
        <div className="bt-plan-toolbar-head flex items-center gap-2">
          <h1 className="bt-page-title bt-plan-toolbar-title min-w-0 flex-1">{formatWeekRange(days, lang)}</h1>
          <div className="bt-plan-toolbar-actions flex shrink-0 items-center gap-1">
            <div className="mr-2 hidden lg:block"><SegmentedGlide className="inline-flex" buttonClassName="px-4 py-2 text-xs" options={[{ value: "day", label: t("plan.day") }, { value: "week", label: t("plan.week") }]} value={view} onChange={setView} /></div>
            <button type="button" className="bt-plan-nav-btn flex h-9 w-9 items-center justify-center rounded-xl" aria-label={t("guest.demo.previousWeek")} onClick={() => setWeekOffset((offset) => offset - 1)}><Icon><path d="m15 18-6-6 6-6" /></Icon></button>
            <button type="button" className="bt-plan-nav-btn flex h-9 w-9 items-center justify-center rounded-xl" aria-label={t("guest.demo.nextWeek")} onClick={() => setWeekOffset((offset) => offset + 1)}><Icon><path d="m9 18 6-6-6-6" /></Icon></button>
            <button type="button" className="bt-plan-nav-btn flex h-9 w-9 items-center justify-center rounded-xl" aria-label={t("guest.demo.add")} onClick={() => onGate("planning")}><Icon size={16}><path d="M12 5v14M5 12h14" /></Icon></button>
          </div>
        </div>
        <div className="mt-3 lg:hidden"><SegmentedGlide className="flex w-full" buttonClassName="flex-1 px-4 py-2 text-xs" options={[{ value: "day", label: t("plan.day") }, { value: "week", label: t("plan.week") }]} value={view} onChange={setView} /></div>
      </div>
      {view === "day" ? <PlanningDay onGate={onGate} /> : <PlanningWeek days={days} />}
    </div>
  );
}

function demoSeries(lang) {
  const start = startOfWeek(0);
  return WEEK_MINUTES.map((minutes, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const label = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-BE", { weekday: "narrow" }).format(day).toUpperCase();
    return { iso: isoDay(day), label, secs: minutes * 60, count: 1, gran: "day", days: 1, fullDays: 1, partial: false, current: false };
  });
}

function StatsDemo() {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState("7");
  const periodOptions = [{ value: "7", label: t("stats.periodLast7") }];
  const rows = [
    { id: "physics", name: t("guest.demo.physics"), color: COURSE_COLORS.physics, secs: 12480, pct: 42, archived: false },
    { id: "economics", name: t("guest.demo.economics"), color: COURSE_COLORS.economics, secs: 9780, pct: 33, archived: false },
    { id: "law", name: t("guest.demo.law"), color: COURSE_COLORS.law, secs: 7440, pct: 25, archived: false },
  ];
  return (
    <div className={`${styles.page} bt-stats-readable flex flex-col gap-4 xl:gap-5`}>
      <h1 className="sr-only">{t("guest.demo.statsTitle")}</h1>
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <StudyTimeChart series={demoSeries(lang)} goalMinutes={120} periodLabel={t("guest.demo.dataLabel")} period={period} periodOptions={periodOptions} onPeriodChange={setPeriod} />
        <StudyByCourse rows={rows} totalSecs={DEMO_TOTAL_SECS} periodLabel={t("guest.demo.dataLabel")} period={period} periodOptions={periodOptions} onPeriodChange={setPeriod} />
      </div>
    </div>
  );
}

function ActivityDemo({ onGate }) {
  const { t, lang } = useI18n();
  const today = isoDay(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const profiles = {
    emma: { id: "emma", pseudo: "Emma", first_name: "Emma", avatar_url: null },
    luca: { id: "luca", pseudo: "Luca", first_name: "Luca", avatar_url: null },
    samir: { id: "samir", pseudo: "Samir", first_name: "Samir", avatar_url: null },
  };
  const makePost = (id) => ({ id, likes: [], comments: [] });
  const items = [
    { type: "day", key: `day-${today}`, day: today },
    { type: "session", key: "session-emma", userId: "emma", seconds: 2700, courses: [{ name: t("guest.demo.physics"), color: COURSE_COLORS.physics }], at: new Date(Date.now() - 38 * 60 * 1000).toISOString(), post: makePost("session-emma") },
    { type: "achievement", key: "achievement-luca", userId: "luca", at: new Date(Date.now() - 74 * 60 * 1000).toISOString(), post: { ...makePost("achievement-luca"), activity: { type: "streak", days: 5 }, caption: "" } },
    { type: "session", key: "session-samir", userId: "samir", seconds: 3600, courses: [{ name: t("guest.demo.economics"), color: COURSE_COLORS.economics }], at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), post: makePost("session-samir") },
    { type: "day", key: `day-${isoDay(yesterdayDate)}`, day: isoDay(yesterdayDate) },
    { type: "session", key: "session-emma-law", userId: "emma", seconds: 1800, courses: [{ name: t("guest.demo.law"), color: COURSE_COLORS.law }], at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), post: makePost("session-emma-law") },
  ];
  const gate = () => onGate("activity");
  return (
    <div className={`${styles.page} ${styles.activityPage}`}>
      <h1 className="sr-only">{t("guest.demo.activityTitle")}</h1>
      <button type="button" className="bt-activity-composer" onClick={gate}>
        <DemoAvatar name="T" size={34} />
        <span className="bt-activity-composer-copy">{t("feed.postPrompt")}</span>
        <span className="bt-activity-composer-icon" aria-hidden="true"><Icon size={19}><path d="M21.4 18.6a2.2 2.2 0 0 1-2.2 2.2H4.8a2.2 2.2 0 0 1-2.2-2.2V8.8a2.2 2.2 0 0 1 2.2-2.2h3l1.6-2.8h5.2l1.6 2.8h3a2.2 2.2 0 0 1 2.2 2.2Z" /><circle cx="12" cy="13.4" r="3.4" /></Icon></span>
      </button>
      <div className={styles.activityLabel}><DemoLabel /></div>
      <div onClickCapture={(event) => {
        if (!event.target.closest(".bt-activity-quiet-btn")) return;
        event.preventDefault();
        event.stopPropagation();
        gate();
      }}>
        <ActivityTimeline items={items} t={t} lang={lang} user={{ id: "guest" }} isAdmin={false} profiles={profiles} photoUrls={{}} signingPhotos={{}} pending={{}} onOpenProfile={gate} onEncourage={gate} onRevealPhoto={gate} onDeletePost={gate} onEditPost={gate} commentDrafts={{}} onCommentDraft={gate} onSendComment={gate} onDeleteComment={gate} />
      </div>
    </div>
  );
}

function FriendsDemo({ onGate }) {
  const { t } = useI18n();
  const conversations = [
    { name: "Emma", detail: t("guest.demo.studiedToday"), color: COURSE_COLORS.physics },
    { name: "Samir", detail: t("guest.demo.physicsStudent"), color: COURSE_COLORS.law },
    { name: "Luca", detail: t("guest.demo.activeYesterday"), color: COURSE_COLORS.economics },
  ];
  return (
    <div className={`${styles.socialPage} bt-social-fill-grid grid gap-4 lg:grid-cols-3`}>
      <h1 className="sr-only">{t("guest.demo.friendsTitle")}</h1>
      <aside className="bt-friends-inbox min-w-0 lg:col-span-1">
        <div className="card bt-social-panel flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="text-lg font-bold">{t("social.searchConversations")}</h2>
            <button type="button" onClick={() => onGate("friends")} className="bt-feed-icon-btn min-h-11 min-w-11" aria-label={t("social.newMessage")}><Icon size={20}><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M16 3l5 5M10 14l-1 4 4-1L22 8a2 2 0 0 0-5-5Z" /></Icon></button>
          </div>
          <div className="relative shrink-0 p-3" style={{ borderBottom: "1px solid var(--bt-hairline)" }}>
            <Icon size={15} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2"><circle cx="11" cy="11" r="8" /><path d="m21 21-5.3-5.3" /></Icon>
            <button type="button" className={`${styles.searchButton} input w-full text-left text-sm`} onClick={() => onGate("friends")}>{t("social.searchPlaceholder")}</button>
          </div>
          <button type="button" onClick={() => onGate("friends")} className="flex w-full items-center justify-between px-4 py-2.5 text-sm" style={{ borderBottom: "1px solid var(--bt-hairline)" }}>
            <span className="flex items-center gap-2 font-medium"><Icon size={14}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11h-6M19 8v6" /></Icon>{t("social.requestsCompact").replace("{n}", "1")}</span>
            <Icon size={13}><path d="m9 6 6 6-6 6" /></Icon>
          </button>
          <ul className="overflow-y-auto">
            {conversations.map((person, index) => (
              <li key={person.name}><button type="button" className="bt-social-row flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => onGate("friends")}>
                <DemoAvatar name={person.name} color={person.color} size={42} />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.name}</strong><small className="block truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{person.detail}</small></span>
                {index === 0 ? <span className={styles.unread}>1</span> : null}
              </button></li>
            ))}
          </ul>
          <div className={styles.panelDemo}><DemoLabel /></div>
        </div>
      </aside>
      <section className={`${styles.friendPreview} card bt-social-panel hidden flex-col items-center justify-center p-8 text-center lg:col-span-2 lg:flex`}>
        <h2 className="mb-1 text-lg font-semibold">{t("social.emptyTitle")}</h2>
        <p className="mb-5 max-w-xs text-sm" style={{ color: "var(--bt-text-3)" }}>{t("social.emptySubtitle")}</p>
        <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => onGate("friends")}>{t("guest.demo.addFriend")}</button>
      </section>
    </div>
  );
}

function CommunityRoom({ room, onBack, onGate }) {
  const { t } = useI18n();
  return (
    <section className="bt-course-room card bt-social-panel bt-social-panel--chat">
      <header className="bt-course-room-head">
        <button type="button" className="bt-course-back bt-course-icon-btn" onClick={onBack} aria-label={t("common.back")}><Icon><path d="m15 18-6-6 6-6" /></Icon></button>
        <div className="bt-course-room-title"><h2><CourseMarker course={{ color: room.color }} /><span>{room.title}</span></h2><p>{t("courseSpaces.members").replace("{n}", String(room.members))}</p></div>
        <button type="button" className="bt-course-study" onClick={() => onGate("community")}>{t("courseSpaces.study")}</button>
      </header>
      <div className="bt-course-stream">
        <p className="bt-course-day">{t("guest.demo.today")}</p>
        {[["Emma", t("guest.demo.communityMessage1"), COURSE_COLORS.physics], ["Samir", t("guest.demo.communityMessage2"), COURSE_COLORS.law]].map(([name, text, color]) => (
          <div key={name} className="bt-course-group"><DemoAvatar name={name} color={color} size={32} /><div className="bt-course-group-body"><div className="bt-course-group-meta"><strong className="bt-course-author">{name}</strong></div><div className="bt-course-message"><div className="bt-course-bubble"><p className="bt-course-text">{text}</p></div></div></div></div>
        ))}
        {room.exam ? (
          <div className="bt-course-group"><DemoAvatar name="Nora" color={COURSE_COLORS.economics} size={32} /><div className="bt-course-group-body"><div className="bt-course-group-meta"><strong className="bt-course-author">Nora</strong></div><div className="bt-course-message"><div className="bt-course-bubble"><div className="bt-course-exam"><PlanningExamMark label={t("guest.demo.examShared")} /><time>{room.exam}</time><button type="button" className="bt-course-exam-add" onClick={() => onGate("community")}>{t("guest.demo.add")}</button></div></div></div></div></div>
        ) : null}
      </div>
      <button type="button" className={styles.communityComposer} onClick={() => onGate("community")}><span>{t("guest.demo.writeMessage")}</span><Icon size={17}><path d="m5 12 5 5L20 7" /></Icon></button>
    </section>
  );
}

function CommunitiesDemo({ onGate }) {
  const { t } = useI18n();
  const rooms = [
    { id: "physics", title: t("guest.demo.physics"), members: 28, color: COURSE_COLORS.physics, exam: t("guest.demo.examIn12"), joined: true },
    { id: "economics", title: t("guest.demo.economics"), members: 41, color: COURSE_COLORS.economics, exam: t("guest.demo.examIn18"), joined: false },
    { id: "law", title: t("guest.demo.law"), members: 16, color: COURSE_COLORS.law, exam: null, joined: false },
  ];
  const [activeId, setActiveId] = useState("physics");
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = rooms.find((room) => room.id === activeId);
  const open = (room) => { setActiveId(room.id); setMobileOpen(true); };
  useEffect(() => {
    const mobile = mobileOpen && window.matchMedia("(max-width: 1023px)").matches;
    document.documentElement.classList.toggle("bt-chat-fullscreen", mobile);
    return () => document.documentElement.classList.remove("bt-chat-fullscreen");
  }, [mobileOpen]);
  return (
    <div className={`${styles.socialPage} bt-course-spaces bt-social-fill-grid${mobileOpen ? " is-open" : ""}`}>
      <aside className="bt-course-list card bt-social-panel">
        <header className="bt-course-list-head"><h1>{t("courseSpaces.title")}</h1><button type="button" className="input bt-course-search text-left" onClick={() => onGate("community")}>{t("courseSpaces.searchPlaceholder")}</button></header>
        <div className="bt-course-list-scroll">
          <section><h2 className="bt-course-section-title">{t("courseSpaces.joinedTitle")}</h2><ul className="bt-course-rows">
            {rooms.map((room) => (
              <li key={room.id} className={`bt-course-row${activeId === room.id ? " is-selected" : ""}`}>
                <button type="button" className="bt-course-row-open" onClick={() => open(room)} aria-current={activeId === room.id ? "true" : undefined}><CourseMarker course={{ color: room.color }} /><span className="bt-course-row-text"><strong>{room.title}</strong><small>{t("courseSpaces.members").replace("{n}", String(room.members))}{room.exam ? ` · ${room.exam}` : ""}</small></span></button>
                {room.joined ? <span className="bt-course-joined">{t("courseSpaces.joinedState")}</span> : <button type="button" className="bt-course-join" onClick={() => onGate("community")}>{t("courseSpaces.join")}</button>}
              </li>
            ))}
          </ul></section>
          <div className="bt-course-list-foot"><small>{t("courseSpaces.demo")}</small></div>
        </div>
      </aside>
      <CommunityRoom room={active} onBack={() => setMobileOpen(false)} onGate={onGate} />
    </div>
  );
}

function UnavailableDemo() {
  const { t } = useI18n();
  return <div className={`${styles.page} ${styles.unavailable}`}><h1>{t("guest.demo.privateTitle")}</h1><p>{t("guest.demo.privateText")}</p><Link href="/signup" className="btn-primary">{t("guest.createAccount")}</Link><Link href="/dashboard" className="btn-ghost">{t("guest.backToTimer")}</Link></div>;
}

export default function GuestDiscovery({ pathname }) {
  const [gate, setGate] = useState(null);
  let content;
  if (pathname === "/planning") content = <PlanningDemo onGate={setGate} />;
  else if (pathname === "/stats") content = <StatsDemo />;
  else if (pathname === "/feed") content = <ActivityDemo onGate={setGate} />;
  else if (pathname === "/messages") content = <FriendsDemo onGate={setGate} />;
  else if (pathname === "/communautes") content = <CommunitiesDemo onGate={setGate} />;
  else content = <UnavailableDemo />;
  return <>{content}<GuestGate gate={gate} onClose={() => setGate(null)} /></>;
}
