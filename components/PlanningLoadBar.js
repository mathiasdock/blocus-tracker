import { loadRatio, loadSegments } from "../lib/planningInsights.mjs";

// La bande de charge — combien de travail est PRÉVU ce jour-là, et à quels
// cours il appartient. Réservée au planning ; partagée par le mois et la
// semaine pour qu'une même longueur veuille dire la même durée partout
// (échelle absolue : plein = LOAD_FULL_MINUTES).
//
// Ce n'est PAS un Study Block. Un Study Block oppose du temps gagné à du temps
// prévu ; ici rien n'est encore étudié — une journée future n'a pas de
// « rempli ». La quantité est la longueur, la subdivision est académique, pas
// temporelle. DESIGN.md § Study Blocks autorise explicitement, à l'échelle
// semaine/mois, une « bande de durée rectangulaire compacte » à condition d'en
// énoncer l'unité, ce que fait la semaine en toutes lettres et le mois dans son
// libellé accessible.
//
// Ce n'est pas non plus une barre de progression : la longueur est une
// quantité, pas un ratio d'avancement. Cocher un objectif ne raccourcit pas la
// journée — le plan reste le plan.
export default function PlanningLoadBar({ load, courseColor, max = 3, label, className = "" }) {
  if (!load || !(load.minutes > 0)) return null;
  const segments = loadSegments(load, max);
  return (
    <span className={`bt-plan-load ${className}`} role="img" aria-label={label}>
      <span className="bt-plan-load-fill" style={{ inlineSize: `${loadRatio(load.minutes) * 100}%` }}>
        {segments.map((segment, i) => {
          const color = segment.rest ? null : courseColor(segment.id);
          return (
            <span
              key={`${segment.id || "none"}-${i}`}
              className={`bt-plan-load-seg${segment.rest ? " is-rest" : color ? "" : " is-unassigned"}`}
              style={{ flexGrow: segment.share, backgroundColor: color || undefined }}
            />
          );
        })}
      </span>
    </span>
  );
}
