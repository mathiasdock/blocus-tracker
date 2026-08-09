// Carte « Mon blocus » — la campagne bornée, sur le dashboard.
//
// Trois états : aucune période (proposition de création), période en cours
// (compte à rebours, heures / objectif, rythme à tenir), période terminée
// (bilan à ranger). Voir lib/blocus.js et migration_v40.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  fetchBlocus, createBlocus, archiveBlocus,
  computeProgress, suggestFromExams, MAX_GOAL_HOURS,
} from "../lib/blocus";

const fmtH = (h) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

export default function BlocusCard({ sessions, exams, onChange }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState({ loading: true, supported: true, current: null });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

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
    const res = await createBlocus(supabase, user.id, form);
    setBusy(false);
    if (res.ok) { setForm(null); refresh(); }
  }

  async function archive() {
    setBusy(true);
    await archiveBlocus(supabase, user.id, state.current.id);
    setBusy(false);
    refresh();
  }

  // ── Formulaire de création ────────────────────────────────────────────
  if (form) {
    return (
      <section className="card p-5 min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "var(--bt-text-3)" }}>
          {t("blocus.title")}
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--bt-text-3)" }}>
          {form.examCount > 0
            ? t("blocus.fromExams").replace("{n}", String(form.examCount))
            : t("blocus.noExams")}
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
            <span className="w-8 shrink-0">{t("blocus.from")}</span>
            <input type="date" className="input flex-1 min-w-0" value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
            <span className="w-8 shrink-0">{t("blocus.to")}</span>
            <input type="date" className="input flex-1 min-w-0" min={form.start_date} value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
            <span className="shrink-0">{t("blocus.goal")}</span>
            <input type="number" min="1" max={MAX_GOAL_HOURS} className="input w-24"
              value={form.goal_hours}
              onChange={(e) => setForm({ ...form, goal_hours: e.target.value })} />
            <span className="shrink-0">{t("blocus.goalUnit")}</span>
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn-primary flex-1 py-2 text-sm bt-press" disabled={busy || form.end_date < form.start_date}
            onClick={submit}>
            {t("blocus.confirm")}
          </button>
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setForm(null)}>
            {t("blocus.cancel")}
          </button>
        </div>
      </section>
    );
  }

  // ── Aucune période déclarée ───────────────────────────────────────────
  if (!state.current) {
    return (
      <section className="card p-5 min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: "var(--bt-text-3)" }}>
          {t("blocus.title")}
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--bt-text-3)" }}>{t("blocus.none")}</p>
        <button className="btn-primary w-full py-2.5 text-sm bt-press"
          onClick={() => setForm(suggestFromExams(exams))}>
          {t("blocus.start")}
        </button>
      </section>
    );
  }

  // ── Période terminée : bilan ──────────────────────────────────────────
  if (progress.phase === "ended") {
    return (
      <section className="card p-5 min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "var(--bt-text-3)" }}>
          {t("blocus.endedTitle")}
        </h2>
        <p className="font-display text-2xl font-bold" style={{ color: "var(--bt-text-1)" }}>
          {t(progress.activeDays === 1 ? "blocus.recapOne" : "blocus.recap")
            .replace("{h}", String(fmtH(progress.hoursDone)))
            .replace("{days}", String(progress.activeDays))}
        </p>
        {/* « Objectif atteint à 0 % » sonnerait comme un reproche : sous les
            100 %, on énonce la part faite, et à zéro on se tait. */}
        {progress.pct > 0 && (
          <p className="text-sm mt-1" style={{ color: "var(--bt-accent-dark)" }}>
            {t(progress.pct >= 100 ? "blocus.recapGoal" : "blocus.recapPartial")
              .replace("{pct}", String(progress.pct))}
          </p>
        )}
        <button className="btn-ghost w-full py-2 text-sm mt-4" disabled={busy} onClick={archive}>
          {t("blocus.archive")}
        </button>
      </section>
    );
  }

  // ── À venir / en cours ────────────────────────────────────────────────
  const upcoming = progress.phase === "upcoming";
  const countdown = upcoming
    ? t("blocus.startsIn").replace("{n}", String(progress.daysLeft))
    : progress.daysLeft === 0
      ? t("blocus.lastDay")
      : t("blocus.daysLeft").replace("{n}", String(progress.daysLeft));

  return (
    <section className="card p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
          {t("blocus.title")}
        </h2>
        <span className="font-num tabular-nums text-[11px] font-bold px-2 py-1 rounded-full"
          style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
          {countdown}
        </span>
      </div>

      <p className="font-display text-2xl font-bold" style={{ color: "var(--bt-text-1)" }}>
        {progress.goalHours > 0
          ? t("blocus.done")
              .replace("{h}", String(fmtH(progress.hoursDone)))
              .replace("{goal}", String(progress.goalHours))
          : t("blocus.doneNoGoal").replace("{h}", String(fmtH(progress.hoursDone)))}
      </p>

      {progress.pct !== null && (
        <div className="mt-3" style={{ height: 8, borderRadius: 99, overflow: "hidden", backgroundColor: "var(--bt-subtle)" }}>
          <div style={{
            height: "100%", borderRadius: 99, width: `${progress.pct}%`,
            background: "linear-gradient(90deg, #0EA571 0%, #14B885 55%, #22E4A4 100%)",
            transition: "width 0.4s ease-out",
          }} />
        </div>
      )}

      {progress.goalHours > 0 && (
        <p className="text-xs mt-2" style={{ color: "var(--bt-text-3)" }}>
          {progress.paceNeeded <= 0
            ? t("blocus.paceDone")
            : t("blocus.pace").replace("{h}", String(fmtH(progress.paceNeeded)))}
        </p>
      )}

      <p className="text-xs mt-4 pt-4" style={{ borderTop: "1px solid var(--bt-border)", color: "var(--bt-text-3)" }}>
        {t("blocus.activeDays")
          .replace("{n}", String(progress.activeDays))
          .replace("{total}", String(progress.daysTotal))}
      </p>
    </section>
  );
}
