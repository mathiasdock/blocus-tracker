// La période d'étude comme saison bornée : deux dates suffisent. Les anciennes
// valeurs d'objectif horaire peuvent encore exister en base, mais cette surface
// ne les expose plus et les nouvelles périodes enregistrent toujours null.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  fetchBlocus, createBlocus, archiveBlocus,
  computeProgress, suggestFromExams,
} from "../lib/blocus";

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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M8 2v4M16 2v4M3 9h18" />
    </svg>
  );
}

function PeriodHeading({ children }) {
  return (
    <h2 className="bt-dashboard-title-accent flex items-center gap-2 text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
      <span className="shrink-0" style={{ color: "var(--bt-accent-text)" }}>
        <CalendarIcon size={18} />
      </span>
      <span>{children}</span>
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

export default function BlocusCard({ sessions, exams, onChange, className = "" }) {
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

  const progress = computeProgress(state.current, sessions);

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

  if (form) {
    const days = periodDays(form.start_date, form.end_date);
    return (
      <section className={`card bt-dashboard-card-mint min-w-0 p-4 sm:p-5 ${className}`}>
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
      <section className={`card bt-dashboard-card-mint min-w-0 p-4 sm:p-5 ${className}`}>
        <div className="min-w-0">
          <PeriodHeading>{t("blocus.title")}</PeriodHeading>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("blocus.none")}</p>
        </div>
        <button className="btn-primary mt-4 w-full py-2.5 text-sm"
          onClick={() => setForm(suggestFromExams(exams))}>
          {t("blocus.start")}
        </button>
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
    <section className={`card bt-dashboard-card-mint min-w-0 p-4 sm:p-5 ${className}`}>
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
    </section>
  );
}
