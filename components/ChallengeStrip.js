import Glyph from "./Glyph";
import { useI18n } from "../contexts/I18nContext";
import { missionText } from "../lib/missionText";

// Le Défi du jour, contre le bouton Start.
//
// Il était la septième ligne d'une liste de missions, dans une carte de 774 px
// posée à côté du chrono. C'est le seul objectif de la journée qui puisse
// changer ce qu'on est sur le point de faire — il nomme un cours et une durée,
// et le sélecteur de cours est à dix centimètres. Enterré dans une liste, il
// ne servait à rien ; ici, il arme la session.
//
// Quand le défi porte sur un cours précis, la bande devient un BOUTON qui le
// sélectionne. Les défis sans cours (« bats ta journée d'hier », « protège ta
// série ») restent du texte : proposer un tap qui ne fait rien est pire que
// pas de tap du tout.
export default function ChallengeStrip({ challenge, onPickCourse, className = "" }) {
  const { t } = useI18n();
  if (!challenge) return null;

  const { title, body } = missionText(t, challenge);
  const done = Boolean(challenge.done);
  const courseId = challenge.params?.course_id || null;
  const actionable = Boolean(courseId && onPickCourse && !done);

  const inner = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: done ? "var(--bt-accent)" : "var(--bt-accent-bg)",
          color: done ? "var(--bt-on-accent)" : "var(--bt-accent-dark)",
        }}>
        {done ? (
          <Glyph size={14} strokeWidth={3}><polyline points="20 6 9 17 4 12" /></Glyph>
        ) : (
          <Glyph size={15} strokeWidth={2.2}>
            <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8z" />
          </Glyph>
        )}
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold leading-snug"
          style={{ color: "var(--bt-text-1)", textDecoration: done ? "line-through" : "none" }}>
          {title}
        </span>
        {body && (
          <span className="block truncate text-xs leading-snug" style={{ color: "var(--bt-text-3)" }}>
            {body}
          </span>
        )}
      </span>

      <span className="font-num shrink-0 text-xs font-bold tabular-nums"
        style={{ color: done ? "var(--bt-text-4)" : "var(--bt-accent-dark)" }}>
        +{challenge.xp}
      </span>
      {actionable && (
        <Glyph size={16} style={{ color: "var(--bt-text-4)", flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6" />
        </Glyph>
      )}
    </>
  );

  const style = {
    backgroundColor: "var(--bt-surface)",
    boxShadow: "inset 0 0 0 1px var(--bt-accent-border)",
    opacity: done ? 0.72 : 1,
  };
  const cls = `flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 ${className}`;

  if (!actionable) return <div className={cls} style={style}>{inner}</div>;
  return (
    <button type="button" onClick={() => onPickCourse(courseId)}
      className={`${cls} text-left transition-transform active:scale-[0.99]`} style={style}>
      {inner}
    </button>
  );
}
