import { useCallback, useMemo, useState } from "react";
import Glyph from "../Glyph";
import {
  BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from "recharts";
import FilterMenu from "../FilterMenu";
import useDialogFocus from "../useDialogFocus";
import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime, formatMinutesShort } from "../../lib/format";
import { bucketLongLabel } from "../../lib/statsPeriod";

// Recharts pose `tick.fill` / `stroke` en ATTRIBUTS SVG, où var(--bt-*) ne se
// résout pas — mais `currentColor`, si. L'habillage (axes, grille, ligne
// d'objectif) prend donc la couleur CSS du conteneur, `--bt-text-2` : 4,5:1 en
// clair, 6,6:1 en sombre. L'ancien taupe fixe #94908B ne tenait que 3,1:1 sur
// fond clair, ce qui passait tant que l'axe était caché ; il ne l'est plus.
const AXIS = "currentColor";

// Graduations RONDES. Laissé à lui-même, recharts coupait le domaine en quatre
// parts égales et écrivait « 1h25 » ou « 4h12 » : des repères qu'on ne peut pas
// lire d'un coup d'œil. Le pas est choisi dans une liste de durées qu'on se
// représente (15 min, 30 min, 1 h, 2 h…), pour quatre intervalles au plus, avec
// une petite marge au-dessus de la plus haute valeur.
const STEPS_MIN = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 5760, 8640, 11520];
export function roundTicks(maxMinutes) {
  const top = Math.max(1, maxMinutes) * 1.05;
  const step = STEPS_MIN.find((s) => top / s <= 4) || Math.ceil(top / 4 / 1440) * 1440;
  const end = Math.ceil(top / step) * step;
  const ticks = [];
  for (let v = 0; v <= end; v += step) ticks.push(v);
  return { ticks, end };
}

function ExpandIcon({ size = 14 }) {
  return (
    <Glyph size={size}>
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </Glyph>
  );
}
function CloseIcon() {
  return (
    <Glyph size={14}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </Glyph>
  );
}

// Graphique principal de la page : « comment mon volume d'étude a évolué ? ».
// Une seule unité, lisible telle quelle (« 2h30 », « 45 min »).
//
// Phase 2 — c'est l'objet d'analyse principal de la page, il en a désormais
// les moyens :
//   • un axe vertical gradué. Sans lui on comparait des hauteurs sans jamais
//     pouvoir les lire ; la ligne d'objectif était le seul repère.
//   • la ligne d'objectif porte son nom SUR le graphique, là où l'œil la voit,
//     au lieu d'une phrase d'explication sous la carte.
//   • les seaux INCOMPLETS (le mois en cours, la première semaine d'un
//     historique commencé un mercredi) sont plus clairs et cernés de
//     pointillés : ils comptent moins de jours que leurs voisins, et sans le
//     dire ils se lisaient comme une chute d'effort.
//   • des étiquettes à 11 px au lieu de 9.
// Étiquette de la ligne d'objectif, posée sur un fond de carte. Dessinée
// APRÈS les barres : sans fond, une barre plus haute que l'objectif la
// recouvrait. Les propriétés `style` résolvent les variables CSS dans le SVG,
// contrairement aux attributs de présentation.
function GoalTag({ viewBox, value }) {
  if (!viewBox) return null;
  const width = Math.round(String(value).length * 6.1 + 12);
  const x = viewBox.x + viewBox.width - width;
  const y = viewBox.y - 19;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={width} height={17} rx={5} style={{ fill: "var(--bt-surface)", opacity: 0.94 }} />
      <text x={width / 2} y={12} textAnchor="middle" fontSize={11} style={{ fill: "var(--bt-text-2)" }}>{value}</text>
    </g>
  );
}

function Chart({ data, goalMinutes, goalLabel, selectedIso, onSelect, tall }) {
  const showGoal = goalMinutes > 0 && data.length > 0 && data[0].gran === "day";
  // Le domaine inclut l'objectif pour qu'il reste visible même une semaine
  // sans aucune barre qui l'atteint.
  const { ticks, end } = roundTicks(Math.max(...data.map((d) => d.minutes), showGoal ? goalMinutes : 0));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap={tall ? "28%" : "22%"}
        margin={{ top: 14, right: 4, left: 0, bottom: 0 }}
        onClick={(state) => {
          const p = state?.activePayload?.[0]?.payload;
          if (p) onSelect(p.iso === selectedIso ? null : p.iso);
        }}>
        <CartesianGrid strokeDasharray="0" stroke={AXIS} strokeOpacity={0.14} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false}
          fontSize={11} tick={{ fill: AXIS }}
          interval="preserveStartEnd" minTickGap={tall ? 10 : 6} />
        <YAxis tickLine={false} axisLine={false} width={tall ? 52 : 44} fontSize={11}
          tick={{ fill: AXIS }} ticks={ticks} domain={[0, end]} interval={0}
          tickFormatter={(v) => (v === 0 ? "0" : formatMinutesShort(v * 60))} />
        <Bar dataKey="minutes" radius={[5, 5, 0, 0]} isAnimationActive={false} cursor="pointer">
          {data.map((d) => {
            const dim = selectedIso && d.iso !== selectedIso;
            const base = d.partial ? 0.42 : 1;
            return (
              <Cell key={d.iso}
                fill={showGoal && d.minutes >= goalMinutes ? "#0E8F68" : "#14B885"}
                fillOpacity={dim ? base * 0.4 : base}
                stroke={d.partial ? "#14B885" : "none"}
                strokeDasharray={d.partial ? "3 2" : undefined}
                strokeWidth={d.partial ? 1.5 : 0} />
            );
          })}
        </Bar>
        {showGoal && (
          <ReferenceLine y={goalMinutes} stroke={AXIS} strokeDasharray="3 3" strokeOpacity={0.75}
            label={<GoalTag value={goalLabel} />} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// « Période en cours · 16 j sur 30 » : ce qu'une barre incomplète représente.
function partialNote(bucket, t) {
  if (!bucket?.partial) return "";
  return t(bucket.current ? "stats.bucketInProgress" : "stats.bucketPartial")
    .replace("{n}", String(bucket.days))
    .replace("{total}", String(bucket.fullDays));
}

// Détail d'une barre : le jour, le temps, le nombre de sessions. Répond à
// « c'était quoi, cette barre ? » sans survoler — au doigt, au clic ou aux
// flèches. Annoncé poliment : c'est lui qui parle quand on parcourt au clavier.
function BucketDetail({ bucket, lang }) {
  const { t } = useI18n();
  return (
    <div aria-live="polite">
      {bucket && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl px-3 py-2.5"
          style={{ backgroundColor: "var(--bt-mint-surface)", border: "1px solid var(--bt-accent-border)" }}>
          <span className="text-xs font-semibold first-letter:uppercase" style={{ color: "var(--bt-accent-text)" }}>
            {bucketLongLabel(bucket, lang)}
          </span>
          <span className="font-num text-sm font-bold tabular-nums" style={{ color: "var(--bt-accent-text)" }}>
            {formatStudyTime(bucket.secs)}
          </span>
          <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-2)" }}>
            {bucket.count === 1
              ? t("stats.oneSession")
              : t("stats.nSessions").replace("{n}", String(bucket.count))}
          </span>
          {bucket.partial && (
            <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>{partialNote(bucket, t)}</span>
          )}
        </div>
      )}
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
  const closeExpanded = useCallback(() => setExpanded(false), []);
  const dialogRef = useDialogFocus(expanded, closeExpanded);

  const data = useMemo(
    () => series.map((b) => ({ ...b, minutes: Math.round(b.secs / 60) })),
    [series]
  );
  const selected = data.find((d) => d.iso === selectedIso) || null;
  const totalSecs = data.reduce((a, d) => a + d.secs, 0);
  const hasData = totalSecs > 0;
  const hasPartial = data.some((d) => d.partial);
  const goalLabel = t("stats.chartGoalLabel").replace("{time}", formatStudyTime(goalMinutes * 60));

  // Parcours au clavier : ← → d'une barre à l'autre, Début/Fin aux extrémités,
  // Échap pour désélectionner. On part de la barre la plus récente — c'est
  // celle qu'on cherche presque toujours.
  function onChartKey(e) {
    if (!data.length) return;
    // Échap désélectionne d'abord ; dans la vue agrandie, le second Échap
    // ferme la fenêtre (la propagation n'est arrêtée que si une barre était
    // sélectionnée).
    if (e.key === "Escape") {
      if (selectedIso) { e.preventDefault(); e.stopPropagation(); setSelectedIso(null); }
      return;
    }
    const index = data.findIndex((d) => d.iso === selectedIso);
    let next = null;
    if (e.key === "ArrowLeft") next = index < 0 ? data.length - 1 : Math.max(0, index - 1);
    else if (e.key === "ArrowRight") next = index < 0 ? data.length - 1 : Math.min(data.length - 1, index + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = data.length - 1;
    if (next === null) return;
    e.preventDefault();
    setSelectedIso(data[next].iso);
  }

  // Le graphique lui-même est une image : recharts ne produit ni texte ni
  // cible focalisable. Le conteneur, lui, est focalisable et se parcourt aux
  // flèches ; les valeurs exactes vivent aussi dans une liste lue par les
  // lecteurs d'écran.
  const chartRegion = (heightClass, tall) => (
    <>
      <div role="group" tabIndex={0} onKeyDown={onChartKey}
        aria-label={`${t("stats.studyTimeTitle")} — ${periodLabel}`}
        className={`bt-chart-focus ${heightClass}`}>
        <div className="h-full" aria-hidden="true" style={{ color: "var(--bt-text-2)" }}>
          <Chart data={data} goalMinutes={goalMinutes} goalLabel={goalLabel}
            selectedIso={selectedIso} onSelect={setSelectedIso} tall={tall} />
        </div>
      </div>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.iso}>
            {`${bucketLongLabel(d, lang)} : ${formatStudyTime(d.secs)}${d.partial ? ` (${partialNote(d, t)})` : ""}`}
          </li>
        ))}
      </ul>
      <BucketDetail bucket={selected} lang={lang} />
    </>
  );

  // Le filtre vit DANS l'en-tête de la carte, à côté de son titre : c'est ce
  // qui dit sans ambiguïté qu'il ne commande que ce graphique. Le total suit
  // la période choisie, il est donc placé juste sous elle.
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.studyTimeTitle")}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>
          {periodLabel}
          {hasData && (
            <>
              {" · "}
              <span className="font-num font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
                {formatStudyTime(totalSecs)}
              </span>
            </>
          )}
        </p>
      </div>
      <FilterMenu
        value={period}
        options={periodOptions}
        onChange={onPeriodChange}
        ariaLabel={t("stats.periodFilterLabel")}
        buttonClassName="bt-tap-44"
      />
    </div>
  );

  return (
    <>
      <section className={`card flex flex-col p-4 sm:p-5 ${className}`}>
        {header}

        {hasData ? (
          <>
            <div className="mt-3">
              {chartRegion("h-52 sm:h-56 xl:h-60", false)}
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
              <p className="text-[11px] leading-snug" style={{ color: "var(--bt-text-4)" }}>
                {t("stats.chartTapHint")}
                {hasPartial && <><br />{t("stats.chartPartialHint")}</>}
              </p>
              <button onClick={() => setExpanded(true)}
                className="btn-ghost bt-tap-44 flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
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
          onClick={closeExpanded}>
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("stats.studyTimeTitle")}
            className="bt-stats-readable card w-full rounded-t-[24px] p-5 focus:outline-none sm:max-w-2xl sm:rounded-[20px]"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "88vh", overflowY: "auto" }}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display truncate text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
                  {t("stats.studyTimeTitle")}
                </h2>
                <p className="mt-0.5 truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{periodLabel}</p>
              </div>
              <button onClick={closeExpanded} aria-label={t("common.close")}
                className="btn-ghost flex h-11 w-11 shrink-0 items-center justify-center p-0">
                <CloseIcon />
              </button>
            </div>
            {chartRegion("h-72", true)}
          </div>
        </div>
      )}
    </>
  );
}
