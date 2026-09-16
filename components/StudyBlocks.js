import { studyBlockLayout, firstOverIndex } from "../lib/studyBlocks.mjs";

// Les Blocus Blocks — la quantité de temps étudié, rendue à l'échelle.
//
// Cinq signes, aucun n'est une couleur : le CADRE dit la capacité prévue, le
// REMPLISSAGE dit le temps réellement mesuré, le TRAIT dit où tombe exactement
// l'objectif quand il ne s'arrête pas sur un bord d'unité, l'ÉCART sépare le
// prévu du temps en plus, et l'ANNEAU dit où la session s'est arrêtée. C'est ce
// qui remplace le « +N » d'avant, qui voulait dire tantôt des blocs étudiés
// cachés, tantôt des blocs d'objectif cachés.
//
// L'échelle vient de lib/studyBlocks.mjs, partagée avec la carte du jour : les
// trois vues comptent désormais pareil.
export default function StudyBlocks({
  earnedSecs,
  plannedSecs = null,
  running = false,
  paused = false,
  focus = false,
  maxUnits = 12,
  label,
  className = "",
}) {
  const layout = studyBlockLayout({ earnedSecs, plannedSecs, maxUnits });
  if (!layout.units.length) return null;

  const overIndex = firstOverIndex(layout);
  const quarterScale = layout.unitSecs === 900;

  return (
    <div
      className={`bt-blocks${focus ? " is-focus" : ""} ${className}`}
      role="img"
      aria-label={label}
    >
      {layout.units.map((unit, i) => {
        const live = (running || paused) && i === layout.activeIndex;
        return (
          <span
            key={i}
            className={`bt-block${live && running ? " bt-block-active" : ""}${live && paused ? " is-held" : ""}`}
            // Respiration d'une heure toutes les quatre unités de quart d'heure ;
            // au-delà l'unité EST l'heure, il n'y a plus rien à regrouper.
            data-cluster={quarterScale && i > 0 && i % 4 === 0 ? "1" : undefined}
            data-over={i === overIndex ? "1" : undefined}
            style={{ "--c": unit.capacity, "--f": unit.fill }}
          >
            {unit.capacity > 0 && <span className="bt-block-slot" />}
            {unit.fill > 0 && <span className="bt-block-fill" />}
            {i === layout.goalIndex && (
              <span className="bt-block-goal" style={{ "--g": layout.goalAt }} />
            )}
            {live && paused && <span className="bt-block-hold" />}
          </span>
        );
      })}
    </div>
  );
}

// La pause Pomodoro n'est PAS du temps étudié : elle n'a donc pas droit au
// langage des blocs. Une seule piste continue, neutre, qui se VIDE pendant que
// les blocs, eux, se remplissent — la différence se lit sans couleur.
export function RestTrack({ remainingSecs, totalSecs, focus = false, label }) {
  const ratio = totalSecs > 0 ? Math.max(0, Math.min(1, remainingSecs / totalSecs)) : 0;
  return (
    <div
      className={`bt-rest${focus ? " is-focus" : ""}`}
      role="img"
      aria-label={label}
    >
      <span className="bt-rest-fill" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}
