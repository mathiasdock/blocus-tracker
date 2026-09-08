import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from "recharts";
import FilterMenu from "../FilterMenu";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";
import { bucketLongLabel } from "../../lib/statsPeriod";

// Recharts pose `tick.fill` / `stroke` en ATTRIBUTS SVG, où var(--bt-*) ne se
// résout pas. D'où un taupe neutre lisible en clair ET en sombre pour
// l'habillage (axes, grille) ; tout le reste passe par des styles inline.
const AXIS_COLOR = "#94908B";

function ExpandIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Graphique principal de la page : la régularité et l'intensité sur la période
// choisie. Une seule unité, lisible telle quelle (« 2h30 », « 45 min ») — le
// basculement min/h de l'ancienne modale demandait un choix pour lire un
// chiffre, sans jamais rendre le graphique plus clair.
function Chart({ data, goalMinutes, selectedIso, onSelect, tall }) {
  const showGoal = goalMinutes > 0 && data.length > 0 && data[0].gran === "day";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap={tall ? "28%" : "24%"}
        margin={{ top: 8, right: 4, left: tall ? 4 : -22, bottom: 0 }}
        onClick={(state) => {
          const p = state?.activePayload?.[0]?.payload;
          if (p) onSelect(p.iso === selectedIso ? null : p.iso);
        }}>
        {tall && <CartesianGrid strokeDasharray="0" stroke={AXIS_COLOR} strokeOpacity={0.16} vertical={false} />}
        <XAxis dataKey="label" tickLine={false} axisLine={false}
          fontSize={tall ? 11 : 9} tick={{ fill: AXIS_COLOR }}
          interval="preserveStartEnd" minTickGap={tall ? 8 : 4} />
        {/* Axe Y masqué en aperçu mais nécessaire : sans lui recharts n'a pas
            d'échelle et ne sait pas placer la ligne d'objectif. Le domaine
            inclut l'objectif pour qu'il reste visible même une semaine sans
            aucune barre qui l'atteint. */}
        <YAxis hide={!tall} tickLine={false} axisLine={false} width={52} fontSize={11}
          tick={{ fill: AXIS_COLOR }}
          tickFormatter={(v) => formatMinutesShort(v * 60)}
          domain={[0, (max) => Math.max(max || 0, showGoal ? goalMinutes : 0) * 1.12]} />
        {showGoal && (
          <ReferenceLine y={goalMinutes} stroke={AXIS_COLOR} strokeDasharray="3 3" strokeOpacity={0.75} />
        )}
        <Bar dataKey="minutes" radius={[5, 5, 0, 0]} isAnimationActive={false} cursor="pointer">
          {data.map((d) => {
            const dim = selectedIso && d.iso !== selectedIso;
            return (
              <Cell key={d.iso}
                fill={showGoal && d.minutes >= goalMinutes ? "#0E8F68" : "#14B885"}
                fillOpacity={dim ? 0.32 : 1} />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Détail d'une barre : le jour, le temps, le nombre de sessions. Répond à
// « c'était quoi, cette barre ? » sans quitter la page ni survoler (le survol
// n'existe pas au doigt — c'était le trou de l'ancienne version sur téléphone).
function BucketDetail({ bucket, lang }) {
  const { t } = useI18n();
  if (!bucket) return null;
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: "var(--bt-mint-surface)", border: "1px solid var(--bt-accent-border)" }}>
      <span className="text-xs font-semibold first-letter:uppercase" style={{ color: "var(--bt-accent-text)" }}>
        {bucketLongLabel(bucket, lang)}
      </span>
      <span className="font-num text-sm font-bold tabular-nums" style={{ color: "var(--bt-accent-text)" }}>
        {formatMinutesShort(bucket.secs)}
      </span>
      <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-2)" }}>
        {bucket.count === 1
          ? t("stats.oneSession")
          : t("stats.nSessions").replace("{n}", String(bucket.count))}
      </span>
    </div>
  );
}

export default function StudyTimeChart({
  series, goalMinutes = 0, periodLabel,
  period, periodOptions, onPeriodChange,
  className = "",
}) {
  const { t, lang } = useI18n();
  const [selectedIso, setSelectedIso] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(
    () => series.map((b) => ({ ...b, minutes: Math.round(b.secs / 60) })),
    [series]
  );
  const selected = data.find((d) => d.iso === selectedIso) || null;
  const totalSecs = data.reduce((a, d) => a + d.secs, 0);
  const hasData = totalSecs > 0;

  // Le filtre vit DANS l'en-tête de la carte, à côté de son titre : c'est ce
  // qui dit sans ambiguïté qu'il ne commande que ce graphique. Le total suit
  // la période choisie, il est donc placé juste sous elle.
  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.studyTimeTitle")}</h2>
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{periodLabel}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <FilterMenu
          value={period}
          options={periodOptions}
          onChange={onPeriodChange}
          ariaLabel={t("stats.periodFilterLabel")}
        />
        <span className="font-num text-lg font-bold leading-none tabular-nums" style={{ color: "var(--bt-text-1)" }}>
          {formatMinutesShort(totalSecs)}
        </span>
      </div>
    </div>
  );

  return (
    <>
      <section className={`card p-4 sm:p-5 ${className}`}>
        {header}

        {hasData ? (
          <>
            <div className="mt-4 h-40 sm:h-48">
              <Chart data={data} goalMinutes={goalMinutes} selectedIso={selectedIso} onSelect={setSelectedIso} />
            </div>
            <BucketDetail bucket={selected} lang={lang} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px]" style={{ color: "var(--bt-text-4)" }}>
                {goalMinutes > 0 && data[0]?.gran === "day" ? t("stats.chartGoalHint") : t("stats.chartTapHint")}
              </p>
              <button onClick={() => setExpanded(true)}
                className="btn-ghost flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
                <ExpandIcon size={12} />
                {t("stats.chartExpand")}
              </button>
            </div>
          </>
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.chartNoData")}</p>
        )}
      </section>

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={() => setExpanded(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("stats.studyTimeTitle")}
            className="card w-full rounded-t-[24px] p-5 sm:max-w-2xl sm:rounded-[20px]"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "88vh", overflowY: "auto" }}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display truncate text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
                  {t("stats.studyTimeTitle")}
                </h2>
                <p className="mt-0.5 truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{periodLabel}</p>
              </div>
              <button onClick={() => setExpanded(false)} aria-label={t("common.close")}
                className="btn-ghost flex h-9 w-9 shrink-0 items-center justify-center p-0">
                <CloseIcon />
              </button>
            </div>
            <div className="h-72">
              <Chart data={data} goalMinutes={goalMinutes} selectedIso={selectedIso} onSelect={setSelectedIso} tall />
            </div>
            <BucketDetail bucket={selected} lang={lang} />
          </div>
        </div>
      )}
    </>
  );
}
