import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { RankBadge } from "../Leaderboard";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// « Sur quels cours je passe mon temps » — une seule section.
//
// Avant : « Podium des cours » (30 j, top 3, barres) et « Répartition par
// cours » (camembert, bascule semaine/mois, replié dans l'analyse avancée)
// répondaient à la même question avec deux périodes différentes et deux
// classements différents. Ici, un seul classement, la période globale de la
// page, et le camembert en second rideau — il complète le classement, il ne
// le double pas.
export default function StudyByCourse({ rows, totalSecs, periodLabel, className = "" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!rows.length) {
    return (
      <section className={`card p-4 sm:p-5 ${className}`}>
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.byCourseTitle")}</h2>
        <p className="py-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.chartNoData")}</p>
      </section>
    );
  }

  const max = rows[0].secs || 1;
  const nameOf = (r) => r.name || t("stats.courseNone");
  // Le camembert ne supporte pas une variable CSS en attribut SVG : le temps
  // sans cours y prend un gris fixe, lisible dans les deux thèmes.
  const pieColor = (r) => (r.id === "__none__" ? "#9AA4B2" : r.color || "#14B885");

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.byCourseTitle")}</h2>
          <p className="mt-0.5 truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{periodLabel}</p>
        </div>
        <span className="shrink-0 font-num text-lg font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
          {formatMinutesShort(totalSecs)}
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.slice(0, open ? rows.length : 3).map((r, i) => (
          <li key={r.id} className="flex items-center gap-3">
            <RankBadge rank={i + 1} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="truncate text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>{nameOf(r)}</span>
                </span>
                <span className="shrink-0 font-num text-sm font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
                  {formatMinutesShort(r.secs)}
                  <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--bt-text-3)" }}>{r.pct}%</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
                <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${Math.max(0.03, r.secs / max)})`, backgroundColor: r.color }} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {rows.length > 1 && (
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="bt-stats-quiet-btn mt-3 w-full rounded-xl py-2 text-xs font-semibold">
          {open ? t("stats.hideBreakdown") : t("stats.viewBreakdown")}
        </button>
      )}

      {open && (
        <div className="mt-3 border-t pt-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="secs" nameKey="name" isAnimationActive={false}
                  innerRadius={48} outerRadius={80} paddingAngle={rows.length > 1 ? 3 : 0}>
                  {rows.map((r) => <Cell key={r.id} fill={pieColor(r)} stroke="none" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColor(r) }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--bt-text-1)" }}>{nameOf(r)}</span>
                <span className="shrink-0 font-num text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                  {formatMinutesShort(r.secs)} · {r.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
