// La période d'étude comme saison bornée : deux dates suffisent. Les anciennes
// valeurs d'objectif horaire peuvent encore exister en base, mais cette surface
// ne les expose plus et les nouvelles périodes enregistrent toujours null.

import { useCallback, useEffect, useState } from "react";
import Glyph from "./Glyph";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  fetchBlocus, createBlocus, archiveBlocus,
  computeProgress, suggestFromExams,
} from "../lib/blocus";
import { todayISO } from "../lib/format";

const fmtH = (h) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

function periodDays(start, end) {
  if (!start || !end || end < start) return 0;
  return Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
}

function formatDate(value, locale) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function CalendarIcon({ size = 18 }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 9h18" />
    </Glyph>
  );
}

function PeriodHeading({ children }) {
  return (
    // Titre nu, comme « Mes cours » ou « Sessions du jour » : aucune autre
    // carte du tableau de bord ne porte d'icône devant son titre.
    <h2 className="bt-dashboard-title-accent text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
      {children}
    </h2>
  );
}

function RangeArrow() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 7h17M15 3l4 4-4 4" />
    </svg>
  );
}

function DurationBadge({ days, t }) {
  if (!days) return null;
  const label = days === 1 ? t("blocus.durationOne") : t("blocus.duration").replace("{n}", String(days));
  return (
    <span className="font-num inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold tabular-nums" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
      <CalendarIcon size={13} />
      {label}
    </span>
  );
}

function PeriodTimeline({ start, end, locale, days, t }) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl px-3 py-3.5" style={{ backgroundColor: "var(--bt-accent-bg)" }}>
        <p className="min-w-0 text-center font-num text-sm font-bold capitalize tabular-nums" style={{ color: "var(--bt-text-1)" }}>{formatDate(start, locale)}</p>
        <span style={{ color: "var(--bt-accent-text)" }}><RangeArrow /></span>
        <p className="min-w-0 text-center font-num text-sm font-bold capitalize tabular-nums" style={{ color: "var(--bt-text-1)" }}>{formatDate(end, locale)}</p>
      </div>
      <div className="mt-2 flex justify-center"><DurationBadge days={days} t={t} /></div>
    </div>
  );
}

function daysUntil(date, today) {
  return Math.round((new Date(`${date}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
}

// Les examens qui arrivent, en ordre de date. Sur ordinateur cette carte est
// posée à côté de « Mes cours » et fait toujours sa hauteur : la liste ne pèse
// rien dans ce calcul (`basis-0`) et prend la place qui reste, puis défile à
// l'intérieur s'il y a plus d'examens que de place. Un plancher de deux lignes
// garde la liste lisible quand « Mes cours » est courte — c'est alors « Mes
// cours » qui s'allonge d'autant, les deux cartes restant égales.
// Sur téléphone les cartes s'empilent, rien n'est à combler : elle n'y est pas.
const EXAM_ROW = 56;

function ExamHorizon({ exams, courses, locale, t }) {
  const today = todayISO();
  const upcoming = (exams || []).filter((exam) => String(exam.exam_date).slice(0, 10) >= today);
  const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short" });

  return (
    <div className="mt-5 hidden min-h-0 flex-1 basis-0 flex-col border-t pt-4 lg:flex" style={{ borderColor: "var(--bt-accent-border)" }}>
      <h3 className="shrink-0 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>{t("blocus.nextExams")}</h3>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("blocus.noUpcomingExams")}</p>
      ) : (
        <ul className="bt-scroll-y -mr-2 mt-1 min-h-0 flex-1 overflow-y-auto pr-2" style={{ minHeight: EXAM_ROW * 2 }} tabIndex={0} aria-label={t("blocus.nextExams")}>
          {upcoming.map((exam) => {
            const date = String(exam.exam_date).slice(0, 10);
            const at = new Date(`${date}T12:00:00`);
            const course = courses.find((item) => item.id === exam.course_id);
            const left = daysUntil(date, today);
            const when = left <= 0 ? t("blocus.examToday") : left === 1 ? t("blocus.examTomorrow") : t("blocus.examIn").replace("{n}", String(left));
            return (
              <li key={exam.id} className="flex items-center gap-3" style={{ height: EXAM_ROW }}>
                <span className="flex w-11 shrink-0 flex-col items-center rounded-xl py-1" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-accent-border)" }}>
                  <span className="font-num text-base font-extrabold leading-tight tabular-nums" style={{ color: "var(--bt-text-1)" }}>{dayFormat.format(at)}</span>
                  <span className="text-[10px] font-semibold uppercase leading-tight" style={{ color: "var(--bt-text-3)" }}>{monthFormat.format(at).replace(".", "")}</span>
                </span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course?.color || "var(--bt-text-4)" }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{exam.name || course?.name || t("dash.noCourse")}</span>
                <span className="font-num shrink-0 text-xs font-bold tabular-nums" style={{ color: left <= 7 ? "var(--bt-accent-text)" : "var(--bt-text-3)" }}>{when}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function BlocusCard({ studyDays, exams, courses = [], onChange, className = "" }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [state, setState] = useState({ loading: true, supported: true, current: null });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const locale = lang === "en" ? "en-US" : "fr-BE";

  const refresh = useCallback(async () => {
    if (!user) return;
    const res = await fetchBlocus(supabase, user.id);
    setState({ loading: false, supported: res.supported, current: res.current });
    onChange?.(res);
  }, [user, onChange]);

  useEffect(() => { refresh(); }, [refresh]);

  // Migration v40 pas encore exécutée : on n'affiche rien plutôt qu'une carte cassée.
  if (state.loading || !state.supported || !user) return null;

  const progress = computeProgress(state.current, studyDays);

  async function submit() {
    setBusy(true);
    const res = await createBlocus(supabase, user.id, { ...form, goal_hours: null });
    setBusy(false);
    if (res.ok) { setForm(null); refresh(); }
  }

  async function archive() {
    setBusy(true);
    await archiveBlocus(supabase, user.id, state.current.id);
    setBusy(false);
    refresh();
  }

  const horizon = <ExamHorizon exams={exams} courses={courses} locale={locale} t={t} />;

  if (form) {
    const days = periodDays(form.start_date, form.end_date);
    return (
      <section className={`card bt-dashboard-card-mint flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
        <div className="min-w-0">
          <PeriodHeading>{t("blocus.title")}</PeriodHeading>
          <p className="mt-1 text-xs" style={{ color: "var(--bt-text-2)" }}>
            {form.examCount > 0
              ? t("blocus.fromExams").replace("{n}", String(form.examCount))
              : t("blocus.noExams")}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
          <label className="min-w-0 text-xs font-bold" style={{ color: "var(--bt-text-2)" }}>
            <span className="mb-1.5 block">{t("blocus.from")}</span>
            <input type="date" className="input min-h-11 min-w-0 px-2 text-sm" value={form.start_date}
              onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
          </label>
          <span className="flex h-11 items-center" style={{ color: "var(--bt-accent-text)" }}><RangeArrow /></span>
          <label className="min-w-0 text-xs font-bold" style={{ color: "var(--bt-text-2)" }}>
            <span className="mb-1.5 block">{t("blocus.to")}</span>
            <input type="date" className="input min-h-11 min-w-0 px-2 text-sm" min={form.start_date} value={form.end_date}
              onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
          </label>
        </div>

        <div className="mt-3 flex justify-center"><DurationBadge days={days} t={t} /></div>

        {horizon}

        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1 py-2 text-sm" disabled={busy || !days}
            onClick={submit}>
            {t("blocus.confirm")}
          </button>
          <button className="btn-ghost px-4 py-2 text-sm" disabled={busy} onClick={() => setForm(null)}>
            {t("blocus.cancel")}
          </button>
        </div>
      </section>
    );
  }

  if (!state.current) {
    return (
      <section className={`card bt-dashboard-card-mint flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
        <PeriodHeading>{t("blocus.title")}</PeriodHeading>
        {horizon}
        <div className="mt-4">
          <button className="btn-primary w-full py-2.5 text-sm"
            onClick={() => setForm(suggestFromExams(exams))}>
            {t("blocus.start")}
          </button>
        </div>
      </section>
    );
  }

  const days = progress.daysTotal;

  if (progress.phase === "ended") {
    return (
      <section className={`card bt-dashboard-card-mint min-w-0 p-4 sm:p-5 ${className}`}>
        <PeriodHeading>{t("blocus.endedTitle")}</PeriodHeading>
        <PeriodTimeline start={state.current.start_date} end={state.current.end_date} locale={locale} days={days} t={t} />
        <p className="mt-4 font-display text-2xl font-bold" style={{ color: "var(--bt-text-1)" }}>
          {t(progress.activeDays === 1 ? "blocus.recapOne" : "blocus.recap")
            .replace("{h}", String(fmtH(progress.hoursDone)))
            .replace("{days}", String(progress.activeDays))}
        </p>
        <button className="btn-ghost mt-4 w-full py-2 text-sm" disabled={busy} onClick={archive}>
          {t("blocus.archive")}
        </button>
      </section>
    );
  }

  const upcoming = progress.phase === "upcoming";
  const countdown = upcoming
    ? t("blocus.startsIn").replace("{n}", String(progress.daysLeft))
    : progress.daysLeft === 0
      ? t("blocus.lastDay")
      : t("blocus.daysLeft").replace("{n}", String(progress.daysLeft));

  return (
    <section className={`card bt-dashboard-card-mint flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <PeriodHeading>{t("blocus.title")}</PeriodHeading>
        <span className="font-num shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums" style={{ backgroundColor: "var(--bt-accent)", color: "var(--bt-on-accent)" }}>
          {countdown}
        </span>
      </div>

      <PeriodTimeline start={state.current.start_date} end={state.current.end_date} locale={locale} days={days} t={t} />

      <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--bt-accent-border)" }}>
        <div>
          <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("blocus.studied")}</p>
          <p className="mt-0.5 font-num text-xl font-extrabold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{fmtH(progress.hoursDone)} h</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("blocus.studyDays")}</p>
          <p className="mt-0.5 font-num text-xl font-extrabold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{progress.activeDays}/{days}</p>
        </div>
      </div>

      {horizon}
    </section>
  );
}
