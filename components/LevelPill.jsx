// Small discrete pill showing the user's level — "Niv. 8" / "Lv. 8".
// Uses the original green accent. Two sizes: "xs" (default, inline) and "sm" (slightly bigger).

import { useI18n } from "../contexts/I18nContext";

/**
 * @param {number} level   — the level number
 * @param {"xs"|"sm"} size — visual size variant
 * @param {boolean} solid  — solid green vs subtle bg
 */
export default function LevelPill({ level, size = "xs", solid = false }) {
  const { t } = useI18n();
  if (!level || level < 1) return null;

  const cfg = size === "sm"
    ? { padX: 7,   padY: 2,    fs: 11, gap: 3 }
    : { padX: 5.5, padY: 1.5,  fs: 10, gap: 2.5 };

  // 10-11px : du petit texte, donc 4,5:1 exiges dans les deux variantes.
  // En plein, le blanc sur le vert vif ne faisait que 2,55:1 — l'aplat descend
  // d'un cran pour porter son blanc. En discret, #0E8F68 tombait a 3,8:1.
  // Le fond discret etait un vert translucide : sa valeur reelle dependait de
  // la surface derriere, et sur --bt-subtle le texte retombait a 4,27:1.
  // --bt-accent-bg est le meme vert pale, mais opaque et theme-aware : 4,97:1
  // partout, quelle que soit la carte qui porte la pastille.
  const bg = solid ? "var(--bt-accent-fill)" : "var(--bt-accent-bg)";
  const color = solid ? "var(--bt-accent-on-fill)" : "var(--bt-accent-text)";
  const border = solid ? "transparent" : "var(--bt-accent-border)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: cfg.gap,
        padding: `${cfg.padY}px ${cfg.padX}px`,
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 999,
        fontSize: cfg.fs,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        verticalAlign: "middle",
        letterSpacing: 0.1,
      }}
      title={`${t("xp.level")} ${level}`}
    >
      {/* Pas d'opacite : a 0,85 le mot « Niv. » retombait a 3,4:1. La
          hierarchie passe deja par la taille et la graisse du chiffre. */}
      <span>{t("xp.level")}</span>
      <span>{level}</span>
    </span>
  );
}
