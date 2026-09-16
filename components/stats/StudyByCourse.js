import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { RankBadge } from "../Leaderboard";
import FilterMenu from "../FilterMenu";
import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime } from "../../lib/format";

// « Sur quels cours je passe mon temps » — une seule section.
//
// Avant : « Podium des cours » (30 j, top 3, barres) et « Répartition par
// cours » (camembert, bascule semaine/mois, replié dans l'analyse avancée)
// répondaient à la même question avec deux périodes différentes et deux
// classements différents. Ici, un seul classement, sa propre période affichée
// dans l'en-tête, et le camembert en second rideau — il complète le classement,
// il ne le double pas.
//
// UNE SEULE QUESTION, UN SEUL DÉNOMINATEUR : « quelle part de mon temps est
// allée à ce cours ? ». La longueur de barre et le pourcentage écrit à côté
// mesurent donc exactement la même chose, le total de la période. Avant, la
// barre se mesurait au cours le PLUS étudié et le pourcentage au TOTAL : le
// premier cours avait toujours une barre pleine, y compris quand elle était
// suivie de « 40 % ». Deux encodages côte à côte qui semblent partager un
// dénominateur doivent le partager pour de bon. Comparer deux cours entre eux
// reste immédiat — même dénominateur, donc deux fois plus de temps fait deux
// fois plus de barre.
export default function StudyByCourse({
  rows, totalSecs, periodLabel,
  period, periodOptions, onPeriodChange,
  className = "",
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Sa propre période, indépendante du graphique : on peut vouloir la tendance
  // du temps sur l'année ET la répartition des cours de la semaine en cours.
  const head = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.byCourseTitle")}</h2>
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{periodLabel}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <FilterMenu
          value={period}
          options={periodOptions}
          onChange={onPeriodChange}
          ariaLabel={t("stats.periodFilterLabel")}
          buttonClassName="bt-tap-44"
        />
        {rows.length > 0 && (
          <span className="font-num text-lg font-bold leading-none tabular-nums" style={{ color: "var(--bt-text-1)" }}>
            {formatStudyTime(totalSecs)}
          </span>
        )}
      </div>
    </div>
  );

  if (!rows.length) {
    return (
      <section className={`card p-4 sm:p-5 ${className}`}>
        {head}
        <p className="py-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.chartNoData")}</p>
      </section>
    );
  }

  const total = totalSecs > 0 ? totalSecs : 1;
  const nameOf = (r) => r.name || t("stats.courseNone");
  // Le camembert ne supporte pas une variable CSS en attribut SVG : le temps
  // sans cours y prend un gris fixe, lisible dans les deux thèmes.
  const pieColor = (r) => (r.id === "__none__" ? "#9AA4B2" : r.color || "#14B885");

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {head}

      <ul className="mt-4 space-y-3">
        {rows.slice(0, open ? rows.length : 3).map((r, i) => (
          <li key={r.id} className="flex items-center gap-3">
            <RankBadge rank={i + 1} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {/* La pastille garde sa pleine couleur : c'est l'identité du
                      cours, et l'atténuer pendant que sa barre reste pleine
                      faisait dire deux choses contraires au même rang. La
                      mention « archivé » suffit à situer le cours. */}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="truncate text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>{nameOf(r)}</span>
                  {/* Un cours archivé garde son nom et ses heures — c'est le
                      but. La pastille dit seulement qu'il n'est plus au
                      programme, pour qu'on ne le cherche pas dans le chrono. */}
                  {r.archived && (
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                      style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
                      {t("stats.courseArchived")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-num text-sm font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
                  {formatStudyTime(r.secs)}
                  <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--bt-text-3)" }}>{r.pct}%</span>
                </span>
              </div>
              {/* Aucun plancher de 3 % : un cours à 1 % dessine 1 %. Seul un
                  minimum de DEUX PIXELS garantit qu'une part réelle reste
                  visible — c'est du rendu, pas un arrondi de la donnée. */}
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
                <div className="bt-stats-quantity h-full rounded-full"
                  style={{ inlineSize: `max(2px, ${(r.secs / total) * 100}%)`, backgroundColor: r.color }} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {rows.length > 1 && (
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="bt-stats-quiet-btn bt-tap-44 mt-3 w-full rounded-xl py-2 text-xs font-semibold">
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
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--bt-text-1)" }}>
                  {nameOf(r)}
                  {r.archived && <span style={{ color: "var(--bt-text-3)" }}> · {t("stats.courseArchived")}</span>}
                </span>
                <span className="shrink-0 font-num text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                  {formatStudyTime(r.secs)} · {r.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
