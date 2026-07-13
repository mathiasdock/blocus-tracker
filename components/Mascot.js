// Mascotte de Blocus Tracker — un petit chien (type shiba) qui reagit a la
// serie de l'utilisateur. C'est le seul endroit de l'app ou l'on sort du vert
// monochrome : le pelage garde ses couleurs naturelles (exception de marque
// assumee), mais le collier reste vert #14B885 comme ancre.
//
// Etats selon la serie :
//   0        → endormi (oreilles tombantes, yeux fermes, "zzz")
//   1 a 6    → content (assis, sourire calme)
//   7 a 29   → heureux (langue sortie, queue haute)
//   30+      → en feu (heureux + petite flamme, comme la serie)
//
// Micro-animations (facon Duolingo, CSS dans globals.css, prefixe .bt-m) :
// respiration, clignement des yeux, queue qui remue (rapide quand excite),
// rebond periodique quand excite, "zzz" qui flottent, flamme qui vacille.
// Tout est coupe par prefers-reduced-motion, ou via animated={false}.
//
// ⚠️ SVG : une animation CSS `transform` ECRASE l'attribut transform de
// l'element. Toute partie animee qui a besoin d'un placement statique est
// donc imbriquee : <g transform=...><g className="bt-m-..."> ... </g></g>.

const FUR = "#E0A458";
const CREAM = "#F8EACB";
const DARK = "#2E2018";
const PINK = "#EC9AAB";
const COLLAR = "#14B885";
const FLAME = "#FBBF24";

export function mascotState(streak) {
  const s = Number(streak) || 0;
  if (s <= 0) return "asleep";
  if (s < 7) return "content";
  if (s < 30) return "happy";
  return "fired";
}

// Cle i18n de la legende d'etat (utilisee par les appelants qui veulent
// afficher un petit texte sous la mascotte).
export const MASCOT_CAPTION_KEY = {
  asleep: "mascot.asleep",
  content: "mascot.content",
  happy: "mascot.happy",
  fired: "mascot.fired",
};

export default function Mascot({ streak = 0, size = 96, className = "", ariaLabel, animated = true }) {
  const state = mascotState(streak);
  const awake = state !== "asleep";
  const excited = state === "happy" || state === "fired";
  const mood = state === "asleep" ? "bt-m--asleep" : excited ? "bt-m--excited" : "bt-m--calm";

  const tail = excited
    ? "M86 80 Q108 74 104 50 Q98 70 82 74 Z"
    : state === "asleep"
      ? "M84 98 Q102 98 98 82 Q94 94 80 94 Z"
      : "M86 88 Q104 82 99 62 Q96 78 81 82 Z";

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
      role="img" aria-label={ariaLabel || "Mascotte"}
      className={`bt-m ${animated ? "bt-m-anim" : ""} ${mood} ${className}`}
      style={{ overflow: "visible" }}>
      <g className="bt-m-all">
        {/* Queue (derriere le corps) — remue, plus vite quand excite */}
        <g className="bt-m-tail">
          <path d={tail} fill={FUR} />
        </g>

        {/* Corps assis + pattes */}
        <path d="M34 80 Q26 110 46 115 Q60 119 74 115 Q94 110 86 80 Q76 66 60 66 Q44 66 34 80 Z" fill={FUR} />
        <ellipse cx="50" cy="114" rx="9" ry="6" fill={CREAM} />
        <ellipse cx="70" cy="114" rx="9" ry="6" fill={CREAM} />

        {/* Collier vert (ancre de marque) + medaille */}
        <path d="M42 72 Q60 84 78 72" stroke={COLLAR} strokeWidth="6" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="82" r="4.5" fill={COLLAR} />

        {/* Oreilles — dressees (eveille) ou tombantes (endormi) */}
        {awake ? (
          <>
            <path d="M37 32 L53 10 L62 34 Z" fill={FUR} />
            <path d="M43 30 L53 16 L58 32 Z" fill={CREAM} />
            <path d="M83 32 L67 10 L58 34 Z" fill={FUR} />
            <path d="M77 30 L67 16 L62 32 Z" fill={CREAM} />
          </>
        ) : (
          <>
            <path d="M38 40 Q26 46 30 64 Q40 56 44 46 Z" fill={FUR} />
            <path d="M37 45 Q31 50 33 60 Q39 53 41 48 Z" fill={CREAM} />
            <path d="M82 40 Q94 46 90 64 Q80 56 76 46 Z" fill={FUR} />
            <path d="M83 45 Q89 50 87 60 Q81 53 79 48 Z" fill={CREAM} />
          </>
        )}

        {/* Tete */}
        <circle cx="60" cy="50" r="27" fill={FUR} />
        <ellipse cx="48" cy="39" rx="6" ry="4" fill={CREAM} />
        <ellipse cx="72" cy="39" rx="6" ry="4" fill={CREAM} />
        <ellipse cx="60" cy="58" rx="16" ry="13" fill={CREAM} />

        {/* Yeux — clignent quand eveille */}
        {awake ? (
          <g className="bt-m-eyes">
            <circle cx="49" cy="48" r="4" fill={DARK} />
            <circle cx="71" cy="48" r="4" fill={DARK} />
            <circle cx="47.8" cy="46.5" r="1.3" fill="#ffffff" />
            <circle cx="69.8" cy="46.5" r="1.3" fill="#ffffff" />
          </g>
        ) : (
          <>
            <path d="M45 49 Q49 52 53 49" stroke={DARK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M67 49 Q71 52 75 49" stroke={DARK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* Truffe */}
        <ellipse cx="60" cy="53" rx="4.5" ry="3.4" fill={DARK} />

        {/* Gueule */}
        {excited ? (
          <>
            <path d="M53 61 Q60 73 67 61 Z" fill={DARK} />
            <path d="M57 65 Q60 74 63 65 Z" fill={PINK} />
          </>
        ) : state === "content" ? (
          <path d="M54 62 Q60 67 66 62" stroke={DARK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M58 62 Q60 65 62 62" stroke={DARK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        )}

        {/* Zzz — endormi (flottent vers le haut en boucle) */}
        {state === "asleep" && (
          <g fill={DARK} fontStyle="italic" fontWeight="700">
            <text className="bt-m-z bt-m-z1" x="85" y="35" fontSize="9" opacity="0.5">z</text>
            <text className="bt-m-z bt-m-z2" x="92" y="26" fontSize="12" opacity="0.5">z</text>
            <text className="bt-m-z bt-m-z3" x="100" y="16" fontSize="15" opacity="0.5">z</text>
          </g>
        )}

        {/* Flamme + etincelle — en feu (30+). Groupe imbrique : le transform
            statique reste sur le parent, l'animation CSS sur l'enfant. */}
        {state === "fired" && (
          <>
            <g transform="translate(83,6) scale(0.8)">
              <g className="bt-m-flame">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill={FLAME} />
              </g>
            </g>
            <path className="bt-m-spark" d="M104 34 l1.4 3.8 3.8 1.4 -3.8 1.4 -1.4 3.8 -1.4 -3.8 -3.8 -1.4 3.8 -1.4 z" fill={FLAME} opacity="0.85" />
          </>
        )}
      </g>
    </svg>
  );
}
