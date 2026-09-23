import { useState } from "react";
import FilterMenu from "../FilterMenu";
import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime } from "../../lib/format";

// « Où est allé mon temps d'étude ? » — une question, une représentation.
//
// UNE SEULE QUESTION, UN SEUL DÉNOMINATEUR : la longueur de barre et le
// pourcentage écrit à côté mesurent la même chose, le total de la période.
// Comparer deux cours entre eux reste immédiat — même dénominateur, donc deux
// fois plus de temps fait deux fois plus de barre.
//
// Phase 2 — trois retraits, chacun pour une raison :
//   • plus de médailles or / argent / bronze. Le cours le plus étudié n'est pas
//     le « meilleur » cours : il est peut-être simplement le plus difficile, ou
//     le plus en retard. L'ordre reste celui du temps, et c'est un tri, pas un
//     podium.
//   • plus de camembert ni de seconde légende. Déplié, le même jeu de données
//     s'affichait trois fois (barres, anneau, légende reprenant durées et
//     pourcentages) sans qu'aucune vue ne réponde à une autre question.
//   • plus de liste tronquée à trois lignes : au-delà de cinq cours, le reste
//     est REGROUPÉ dans une ligne qui porte son nombre, sa durée et sa part.
//     Replié, le total fait donc toujours 100 % ; rien n'est caché sans être
//     compté.
// Les noms longs passent à la ligne plutôt que d'être coupés : le nom EST
// l'identité du cours.
const VISIBLE = 5;

function Row({ name, color, secs, pct, share, archived, t, neutral = false }) {
  return (
    <>
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2">
          <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
            style={neutral
              ? { boxShadow: "inset 0 0 0 1.5px var(--bt-text-3)" }
              : { backgroundColor: color }}
            aria-hidden="true" />
          <span className="min-w-0 break-words text-sm font-medium leading-snug" style={{ color: "var(--bt-text-1)" }}>
            {name}
            {/* Un cours archivé garde son nom et ses heures — c'est le but.
                La mention dit seulement qu'il n'est plus au programme. */}
            {archived && (
              <span className="ml-1.5 inline-block rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none"
                style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
                {t("stats.courseArchived")}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap font-num text-sm font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
          {formatStudyTime(secs)}
          {/* Une part réelle mais minuscule ne s'écrit pas « 0 % » — même règle
              que « < 1 min » pour les durées. */}
          <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--bt-text-3)" }}>
            {pct === 0 && secs > 0 ? "< 1" : pct}%
          </span>
        </span>
      </div>
      {/* PART D'UN TOUT : le rail est le total de la période, le remplissage
          la part du cours. Minimum de deux pixels : du rendu, pas un arrondi. */}
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }} aria-hidden="true">
        <div className="bt-stats-quantity h-full rounded-full"
          style={{
            inlineSize: share > 0 ? `max(2px, ${share * 100}%)` : 0,
            backgroundColor: neutral ? "var(--bt-text-3)" : color,
          }} />
      </div>
    </>
  );
}

export default function StudyByCourse({
  rows, totalSecs, periodLabel,
  period, periodOptions, onPeriodChange,
  className = "",
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.byCourseTitle")}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>
          {periodLabel}
          {rows.length > 0 && (
            <>
              {" · "}
              <span className="font-num font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
                {formatStudyTime(totalSecs)}
              </span>
            </>
          )}
        </p>
      </div>
      {/* Sa propre période, indépendante du graphique : on peut vouloir la
          tendance sur l'année ET la répartition de la semaine en cours. */}
      <FilterMenu
        value={period}
        options={periodOptions}
        onChange={onPeriodChange}
        ariaLabel={t("stats.periodFilterLabel")}
        buttonClassName="bt-tap-44"
      />
    </div>
  );

  if (!rows.length) {
    return (
      <section className={`card p-4 sm:p-5 ${className}`}>
        {header}
        <p className="py-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.chartNoData")}</p>
      </section>
    );
  }

  const total = totalSecs > 0 ? totalSecs : 1;
  const nameOf = (r) => r.name || t("stats.courseNone");
  // Regrouper UNE seule ligne n'aurait aucun sens : « 1 autre cours » prend la
  // place du cours lui-même. On regroupe à partir de deux.
  const collapsible = rows.length > VISIBLE + 1;
  const shown = collapsible && !open ? rows.slice(0, VISIBLE) : rows;
  const rest = collapsible ? rows.slice(VISIBLE) : [];
  const restSecs = rest.reduce((sum, r) => sum + r.secs, 0);
  const restPct = Math.max(0, 100 - rows.slice(0, VISIBLE).reduce((sum, r) => sum + r.pct, 0));

  return (
    <section className={`card flex flex-col p-4 sm:p-5 ${className}`}>
      {header}

      <ul className="mt-4 space-y-3.5">
        {shown.map((r) => (
          <li key={r.id}>
            <Row name={nameOf(r)} color={r.color} secs={r.secs} pct={r.pct}
              share={r.secs / total} archived={r.archived} t={t}
              neutral={r.id === "__none__"} />
          </li>
        ))}
        {collapsible && !open && (
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={false}
              className="bt-stats-rest block w-full rounded-lg text-left">
              <Row name={t("stats.otherCourses").replace("{n}", String(rest.length))}
                secs={restSecs} pct={restPct} share={restSecs / total} t={t} neutral />
              <span className="sr-only"> — {t("stats.showAllCourses")}</span>
            </button>
          </li>
        )}
      </ul>

      {/* Pied de carte sur ordinateur : la répartition en une seule bande.
          La carte y prend la hauteur du graphique voisin ; avec deux cours,
          cette bande occupe le bas au lieu d'un vide, et dit d'un coup d'œil
          quel cours domine la période. */}
      <div className="mt-auto hidden pt-5 xl:block" aria-hidden="true">
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
          {rows.map((r) => (
            <span key={r.id} className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(r.secs / total) * 100}%`, backgroundColor: r.id === "__none__" ? "var(--bt-text-4)" : r.color }} />
          ))}
        </div>
      </div>

      {collapsible && open && (
        <div className="pt-3">
          <button type="button" onClick={() => setOpen(false)} aria-expanded
            className="bt-stats-quiet-btn bt-tap-44 w-full rounded-xl py-2 text-xs font-semibold">
            {t("stats.showFewerCourses")}
          </button>
        </div>
      )}
    </section>
  );
}
