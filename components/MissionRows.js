import Glyph from "./Glyph";
import { missionText, weeklyText, weeklyProgressLabel, weeklyRatio } from "../lib/missionText";

// Les lignes de missions, version surface claire.
//
// Elles ne vivent plus sur le chrono : celui-ci n'affiche qu'une bande de
// résumé, et c'est la feuille de détail qui déroule la liste. Un même jeu de
// lignes pour un seul contexte visuel — le profil garde les siennes, dessinées
// pour la carte encre sombre, parce que ce sont deux matières différentes et
// non deux copies de la même.

export function MissionRow({ row, t, lead = false }) {
  const done = Boolean(row.done);
  return (
    <li className="flex min-h-9 items-center gap-3">
      <span
        className={done ? "bt-check-pop" : ""}
        style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: done ? "var(--bt-accent)" : "var(--bt-subtle)",
          border: done ? "none" : "1px solid var(--bt-border)",
        }}
      >
        {done && (
          <Glyph size={9} strokeWidth={3.5} style={{ color: "var(--bt-on-accent)" }}>
            <polyline points="20 6 9 17 4 12" />
          </Glyph>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm leading-snug"
        style={{ color: done ? "var(--bt-text-3)" : "var(--bt-text-2)", textDecoration: done ? "line-through" : "none" }}>
        {/* L'étoile marque le Défi du jour : dans une liste de quatre lignes
            identiques, c'est le seul signe qui dit « celui-là est pour toi ». */}
        {lead && (
          <Glyph size={13} strokeWidth={2.2} style={{ color: "var(--bt-accent-dark)", flexShrink: 0 }}>
            <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8z" />
          </Glyph>
        )}
        <span className="min-w-0 flex-1 truncate">{missionText(t, row).title}</span>
      </span>
      <span className="font-num shrink-0 text-xs font-bold tabular-nums"
        style={{ color: done ? "var(--bt-text-4)" : "var(--bt-accent-text)" }}>
        +{row.xp} XP
      </span>
    </li>
  );
}

// La progression est la raison d'être des missions de semaine : sept jours
// d'effort qui n'afficheraient que « fait / pas fait » ne donneraient aucune
// raison de revenir mercredi. Comptes courts en pastilles, temps en barre —
// « 6h24 sur 8h » ne se dessine pas en cinq points.
export function WeeklyRow({ row, t }) {
  const dotted = row.id === "w_days" || row.id === "w_courses";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm leading-snug" style={{ color: row.done ? "var(--bt-text-3)" : "var(--bt-text-2)" }}>
          {weeklyText(t, row)}
        </span>
        <span className="font-num shrink-0 text-xs font-bold tabular-nums"
          style={{ color: row.done ? "var(--bt-text-4)" : "var(--bt-accent-text)" }}>
          +{row.xp} XP
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        {dotted ? (
          <span className="flex flex-1 gap-1.5" aria-hidden="true">
            {Array.from({ length: row.target }, (_, i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: i < row.progress ? "var(--bt-accent)" : "var(--bt-subtle)" }} />
            ))}
          </span>
        ) : (
          <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }} aria-hidden="true">
            <span className="block h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: `scaleX(${weeklyRatio(row)})`, backgroundColor: "var(--bt-accent)" }} />
          </span>
        )}
        <span className="font-num shrink-0 text-xs tabular-nums"
          style={{ color: row.done ? "var(--bt-accent-dark)" : "var(--bt-text-3)" }}>
          {weeklyProgressLabel(t, row)}
        </span>
      </div>
    </li>
  );
}
