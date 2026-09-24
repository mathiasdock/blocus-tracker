import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../../contexts/I18nContext";
import { COURSE_COLOR_SEQUENCE } from "../../lib/courseColors";
import Glyph from "../Glyph";
import Mascot from "../Mascot";
import useDialogFocus from "../useDialogFocus";
import styles from "./GuestDiscovery.module.css";

const COURSE_COLORS = {
  physics: COURSE_COLOR_SEQUENCE[1],
  economics: COURSE_COLOR_SEQUENCE[8],
  law: COURSE_COLOR_SEQUENCE[3],
};

function Icon({ children, size = 18 }) {
  return <Glyph size={size}>{children}</Glyph>;
}

function DemoHeader({ title }) {
  return (
    <header className={styles.header}>
      <h1>{title}</h1>
    </header>
  );
}

function Initial({ name, color }) {
  return (
    <span className={styles.avatar} style={{ backgroundColor: color }} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

export function GuestGate({ gate, onClose }) {
  const { t } = useI18n();
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogFocus(Boolean(gate), close);
  if (!gate) return null;

  const titleKey = `guest.gate.${gate}.title`;
  const textKey = `guest.gate.${gate}.text`;
  return (
    <div className={styles.gateLayer}>
      <button type="button" tabIndex={-1} className={styles.backdrop} onClick={onClose} aria-label={t("common.close")} />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-gate-title"
        tabIndex={-1}
        className={styles.gate}
      >
        <div className={styles.sheetHandle} aria-hidden="true" />
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t("common.close")}>
          <Icon size={17}><path d="m6.5 6.5 11 11m0-11-11 11" /></Icon>
        </button>
        <div className={styles.gateMascot}>
          <Mascot mood="focused" size={88} animated={false} ariaLabel={t("guest.gate.mascotLabel")} />
        </div>
        <div className={styles.gateCopy}>
          <h2 id="guest-gate-title">{t(titleKey)}</h2>
          <p>{t(textKey)}</p>
        </div>
        <div className={styles.gateActions}>
          <Link href="/signup" className="btn-primary">{t("guest.createAccount")}</Link>
          <button type="button" className="btn-ghost" onClick={onClose}>{t("guest.continueExploring")}</button>
        </div>
      </section>
    </div>
  );
}

function startOfWeek(offset = 0) {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day + 1 + offset * 7);
  return date;
}

function PlanningDemo({ onGate }) {
  const { t, lang } = useI18n();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState("exam");
  const locale = lang === "en" ? "en-US" : "fr-BE";
  const days = useMemo(() => {
    const start = startOfWeek(weekOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [weekOffset]);

  const items = {
    physics: { id: "physics", day: 1, time: "09:00", duration: "45 min", title: t("guest.demo.physicsRevision"), course: t("guest.demo.physics"), color: COURSE_COLORS.physics },
    exam: { id: "exam", day: 2, time: "14:00", duration: t("guest.demo.exam"), title: t("guest.demo.economicsExam"), course: t("guest.demo.economics"), color: COURSE_COLORS.economics, exam: true },
    economics: { id: "economics", day: 3, time: "16:30", duration: "1 h", title: t("guest.demo.chapter4"), course: t("guest.demo.economics"), color: COURSE_COLORS.economics },
  };
  const selectedItem = items[selected];
  const period = `${days[0].toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(locale, { day: "numeric", month: "short" })}`;

  return (
    <div className={styles.page}>
      <DemoHeader title={t("guest.demo.planningTitle")} />
      <section className={styles.productSurface}>
        <div className={styles.toolbar}>
          <button type="button" onClick={() => setWeekOffset((value) => value - 1)} aria-label={t("guest.demo.previousWeek")}>
            <Icon><path d="m15 18-6-6 6-6" /></Icon>
          </button>
          <strong>{period}</strong>
          <button type="button" onClick={() => setWeekOffset((value) => value + 1)} aria-label={t("guest.demo.nextWeek")}>
            <Icon><path d="m9 18 6-6-6-6" /></Icon>
          </button>
          <button type="button" className={styles.primaryCompact} onClick={() => onGate("planning")}>
            <Icon size={16}><path d="M12 5v14M5 12h14" /></Icon>
            {t("guest.demo.add")}
          </button>
        </div>

        <div className={styles.weekGrid}>
          {days.map((date, index) => {
            const dayItems = Object.values(items).filter((item) => item.day === index);
            return (
              <div key={date.toISOString()} className={`${styles.day} ${index > 4 ? styles.mobileExtraDay : ""}`}>
                <div className={styles.dayHeading}>
                  <span>{date.toLocaleDateString(locale, { weekday: "short" })}</span>
                  <strong>{date.getDate()}</strong>
                </div>
                <div className={styles.dayBody}>
                  {dayItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.planItem} ${item.exam ? styles.examItem : ""} ${selected === item.id ? styles.selectedItem : ""}`}
                      onClick={() => setSelected(item.id)}
                      style={{ "--course": item.color }}
                    >
                      <span>{item.time}</span>
                      <strong>{item.title}</strong>
                      <small>{item.duration}</small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.planningDetail}>
          <span className={styles.courseDot} style={{ backgroundColor: selectedItem.color }} />
          <div>
            <strong>{selectedItem.title}</strong>
            <p>{selectedItem.course} · {selectedItem.time} · {selectedItem.duration}</p>
          </div>
          <div className={styles.rowActions}>
            <button type="button" onClick={() => onGate("planning")}>{t("common.edit")}</button>
            <button type="button" onClick={() => onGate("planning")}>{t("common.delete")}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatsDemo() {
  const { t } = useI18n();
  const week = [45, 80, 60, 90, 55, 75, 90];
  const max = Math.max(...week);
  const courses = [
    ["physics", t("guest.demo.physics"), "3 h 30", 42],
    ["economics", t("guest.demo.economics"), "2 h 45", 33],
    ["law", t("guest.demo.law"), "2 h", 25],
  ];

  return (
    <div className={styles.page}>
      <DemoHeader title={t("guest.demo.statsTitle")} />
      <section className={`${styles.productSurface} ${styles.statsSurface}`}>
        <div className={styles.statsLead}>
          <div>
            <span>{t("guest.demo.thisWeek")}</span>
            <strong className={styles.bigNumber}>8 h 15</strong>
            <small className={styles.dataLabel}>{t("guest.demo.dataLabel")}</small>
          </div>
          <div className={styles.regularity}>
            <strong>5</strong>
            <span>{t("guest.demo.studyDays")}</span>
          </div>
        </div>

        <div className={styles.statsColumns}>
          <div className={styles.chartSection}>
            <div className={styles.sectionHeading}>
              <h2>{t("guest.demo.evolution")}</h2>
              <span>{t("guest.demo.minutes")}</span>
            </div>
            <div className={styles.bars} aria-label={t("guest.demo.weekChartLabel")}>
              {week.map((minutes, index) => (
                <div key={index} className={styles.barColumn}>
                  <span className={styles.barValue}>{minutes}</span>
                  <span className={styles.bar} style={{ height: `${Math.max(12, (minutes / max) * 100)}%` }} />
                  <small>{t(`guest.demo.day${index + 1}`)}</small>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.courseBreakdown}>
            <h2>{t("guest.demo.byCourse")}</h2>
            {courses.map(([key, name, duration, share]) => (
              <div key={key} className={styles.courseRow}>
                <div className={styles.courseRowLabel}>
                  <span className={styles.courseDot} style={{ backgroundColor: COURSE_COLORS[key] }} />
                  <strong>{name}</strong>
                  <span>{duration}</span>
                </div>
                <div className={styles.shareTrack}><span style={{ width: `${share}%`, backgroundColor: COURSE_COLORS[key] }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivityDemo({ onGate }) {
  const { t } = useI18n();
  const entries = [
    { name: "Emma", color: COURSE_COLORS.physics, course: t("guest.demo.physics"), duration: "45 min", time: "10:32" },
    { name: "Luca", color: "var(--bt-action)", achievement: true, title: t("guest.demo.streakReached"), detail: t("guest.demo.fiveDays") },
    { name: "Samir", color: COURSE_COLORS.economics, course: t("guest.demo.economics"), duration: "1 h", time: "09:14" },
    { name: "Emma", color: COURSE_COLORS.law, course: t("guest.demo.law"), duration: "30 min", time: t("guest.demo.yesterday") },
  ];

  return (
    <div className={styles.page}>
      <DemoHeader title={t("guest.demo.activityTitle")} />
      <section className={styles.feedSurface}>
        <div className={styles.feedDay}>
          <h2>{t("guest.demo.today")}</h2>
          {entries.slice(0, 3).map((entry, index) => entry.achievement ? (
            <div key={index} className={styles.achievementRow}>
              <div className={styles.streakMark} aria-hidden="true">
                <Icon size={24}><path d="M12 3c1.6 3 4.5 4.8 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 8.8 9 6.4 12 3Z" /><path d="M12 11c1.2 1 1.8 2 1.8 3A1.8 1.8 0 0 1 12 15.8 1.8 1.8 0 0 1 10.2 14c0-1 .6-2 1.8-3Z" /></Icon>
              </div>
              <div><strong>{entry.name} · {entry.title}</strong><p>{entry.detail}</p></div>
            </div>
          ) : (
            <div key={index} className={styles.activityRow}>
              <Initial name={entry.name} color={entry.color} />
              <div className={styles.activityMain}>
                <strong>{entry.name}</strong>
                <span className={styles.courseDot} style={{ backgroundColor: index === 0 ? COURSE_COLORS.physics : COURSE_COLORS.economics }} />
                <span>{entry.course}</span>
              </div>
              <strong className={styles.duration}>{entry.duration}</strong>
              <time>{entry.time}</time>
              <div className={styles.socialActions}>
                <button type="button" onClick={() => onGate("activity")} aria-label={t("guest.demo.react")}>
                  <Icon size={16}><path d="M7 10v10H3V10h4Zm0 8h9.5a2 2 0 0 0 1.9-1.4l1.4-4.5A2 2 0 0 0 17.9 9H14l.6-3A2.5 2.5 0 0 0 12.2 3L7 10" /></Icon>
                </button>
                <button type="button" onClick={() => onGate("activity")} aria-label={t("guest.demo.comment")}>
                  <Icon size={16}><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9Z" /></Icon>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.feedDay}>
          <h2>{t("guest.demo.yesterday")}</h2>
          <div className={styles.activityRow}>
            <Initial name={entries[3].name} color={entries[3].color} />
            <div className={styles.activityMain}><strong>{entries[3].name}</strong><span className={styles.courseDot} style={{ backgroundColor: COURSE_COLORS.law }} /><span>{entries[3].course}</span></div>
            <strong className={styles.duration}>{entries[3].duration}</strong>
            <div className={styles.socialActions}>
              <button type="button" onClick={() => onGate("activity")} aria-label={t("guest.demo.react")}><Icon size={16}><path d="M7 10v10H3V10h4Zm0 8h9.5a2 2 0 0 0 1.9-1.4l1.4-4.5A2 2 0 0 0 17.9 9H14l.6-3A2.5 2.5 0 0 0 12.2 3L7 10" /></Icon></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FriendsDemo({ onGate }) {
  const { t } = useI18n();
  const friends = [
    { name: "Emma", detail: t("guest.demo.studiedToday"), color: COURSE_COLORS.physics },
    { name: "Samir", detail: t("guest.demo.physicsStudent"), color: COURSE_COLORS.law },
    { name: "Luca", detail: t("guest.demo.activeYesterday"), color: COURSE_COLORS.economics },
  ];

  return (
    <div className={styles.page}>
      <DemoHeader title={t("guest.demo.friendsTitle")} />
      <section className={`${styles.productSurface} ${styles.friendsSurface}`}>
        <div className={styles.friendRequest}>
          <Initial name="Nora" color="var(--bt-action)" />
          <div><strong>Nora</strong><p>{t("guest.demo.friendRequest")}</p></div>
          <button type="button" className={styles.primaryCompact} onClick={() => onGate("friends")}>{t("guest.demo.accept")}</button>
        </div>
        <div className={styles.listHeading}>
          <h2>{t("guest.demo.peoplePreview")}</h2>
          <button type="button" onClick={() => onGate("friends")}>
            <Icon size={16}><path d="M12 5v14M5 12h14" /></Icon>{t("guest.demo.addFriend")}
          </button>
        </div>
        <div className={styles.friendList}>
          {friends.map((friend) => (
            <button key={friend.name} type="button" className={styles.friendRow} onClick={() => onGate("friends")}>
              <Initial name={friend.name} color={friend.color} />
              <span><strong>{friend.name}</strong><small>{friend.detail}</small></span>
              <Icon><path d="M8 12h8M13 7l5 5-5 5" /></Icon>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CommunitiesDemo({ onGate }) {
  const { t } = useI18n();
  const rooms = [
    { id: "physics", title: t("guest.demo.physics"), members: 28, color: COURSE_COLORS.physics, exam: t("guest.demo.examIn12") },
    { id: "economics", title: t("guest.demo.economics"), members: 41, color: COURSE_COLORS.economics, exam: t("guest.demo.examIn18") },
    { id: "law", title: t("guest.demo.law"), members: 16, color: COURSE_COLORS.law, exam: null },
  ];
  const [selectedId, setSelectedId] = useState("physics");
  const selected = rooms.find((room) => room.id === selectedId);

  return (
    <div className={styles.page}>
      <DemoHeader title={t("guest.demo.communitiesTitle")} />
      <section className={`${styles.productSurface} ${styles.communitySurface}`}>
        <div className={styles.roomList}>
          <div className={styles.listHeading}>
            <h2>{t("guest.demo.courseSpaces")}</h2>
            <button type="button" onClick={() => onGate("community")}>{t("guest.demo.create")}</button>
          </div>
          {rooms.map((room) => (
            <button key={room.id} type="button" onClick={() => setSelectedId(room.id)} className={`${styles.roomRow} ${selectedId === room.id ? styles.roomSelected : ""}`}>
              <span className={styles.courseDot} style={{ backgroundColor: room.color }} />
              <span><strong>{room.title}</strong><small>{t("guest.demo.members").replace("{n}", String(room.members))}{room.exam ? ` · ${room.exam}` : ""}</small></span>
              <Icon size={16}><path d="m9 18 6-6-6-6" /></Icon>
            </button>
          ))}
        </div>
        <div className={styles.roomPreview}>
          <div className={styles.roomHeader}>
            <span className={styles.courseDot} style={{ backgroundColor: selected.color }} />
            <div><h2>{selected.title}</h2><p>{t("guest.demo.members").replace("{n}", String(selected.members))}</p></div>
            <button type="button" className={styles.primaryCompact} onClick={() => onGate("community")}>{t("guest.demo.join")}</button>
          </div>
          <div className={styles.messages}>
            <div><Initial name="Emma" color={COURSE_COLORS.physics} /><p><strong>Emma</strong>{t("guest.demo.communityMessage1")}</p></div>
            <div><Initial name="Samir" color={COURSE_COLORS.law} /><p><strong>Samir</strong>{t("guest.demo.communityMessage2")}</p></div>
            {selected.exam ? <div className={styles.examMessage}><Icon size={18}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Icon><p><strong>{t("guest.demo.examShared")}</strong>{selected.exam}</p></div> : null}
          </div>
          <button type="button" className={styles.fakeComposer} onClick={() => onGate("community")}>{t("guest.demo.writeMessage")}</button>
        </div>
      </section>
    </div>
  );
}

function UnavailableDemo() {
  const { t } = useI18n();
  return (
    <div className={`${styles.page} ${styles.unavailable}`}>
      <h1>{t("guest.demo.privateTitle")}</h1>
      <p>{t("guest.demo.privateText")}</p>
      <Link href="/signup" className="btn-primary">{t("guest.createAccount")}</Link>
      <Link href="/dashboard" className="btn-ghost">{t("guest.backToTimer")}</Link>
    </div>
  );
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

  return (
    <>
      {content}
      <GuestGate gate={gate} onClose={() => setGate(null)} />
    </>
  );
}
