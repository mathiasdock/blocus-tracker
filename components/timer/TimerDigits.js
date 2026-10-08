import { formatDuration } from "../../lib/format";

// Un caractère du chrono dans une fente à largeur fixe : quand sa valeur
// change, le nouveau chiffre glisse vers le haut en fondu (effet odomètre).
// Seuls les caractères qui changent s'animent — la clé porte la valeur.
// Pas de clip : un overflow-hidden inline-block casserait la baseline.
function RollChar({ ch, animate = true }) {
  return (
    <span className="inline-block" style={{ width: /\d/.test(ch) ? "1ch" : undefined }}>
      <span key={ch} className={animate ? "bt-digit-roll" : undefined}>{ch}</span>
    </span>
  );
}

// Chiffres du chrono — heures:minutes en héros, secondes dé-emphasées
// (plus petites, atténuées) : la lecture premium façon minuteur Apple.
export default function TimerDigits({
  seconds,
  color,
  size = "clamp(4.9rem, 23vw, 7.5rem)",
  // Une session de plus d'une heure affiche TROIS groupes de chiffres. A la
  // taille du cas courant, « 11:56:58 » debordait et le « 8 » des secondes
  // passait a la ligne sous le chrono a 320 px. Le cas courant garde sa taille.
  hoursSize = "clamp(3.4rem, 16vw, 6.4rem)",
}) {
  const [hh, mm, ss] = formatDuration(seconds).split(":");
  const showHours = hh !== "00";
  const main = showHours ? `${hh}:${mm}` : mm;
  return (
    <div className="font-num font-bold tabular-nums" data-coach-clear=""
      style={{ fontSize: showHours ? hoursSize : size, lineHeight: 1, letterSpacing: "-0.04em", whiteSpace: "nowrap", color, transition: "color 0.3s" }}>
      {main.split("").map((ch, i) => <RollChar key={`m${i}`} ch={ch} />)}
      <span style={{ fontSize: "0.42em", fontWeight: 600, opacity: 0.72, marginLeft: "0.06em" }}>
        :{ss.split("").map((ch, i) => <RollChar key={`s${i}`} ch={ch} animate={false} />)}
      </span>
    </div>
  );
}
