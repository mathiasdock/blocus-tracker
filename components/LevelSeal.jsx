// The level mark — the ONE way a reached level is drawn.
//
// The reference is the Profile's Progression card: "Niv." in small muted type
// above a large tabular numeral. The first version of this component was a
// round mint medallion; placed on the Progression page, it meant that tapping
// the card with the big "13" led to a small circle — the same level in two
// visual languages on the student's most natural path. It now draws what the
// card draws, at whatever size the host needs (styles/level.css).
//
// The level is a STATUS. Progress toward the next level is XP, drawn apart by
// the host as a bar (`.bt-level-track` / `.bt-level-fill`) — never folded into
// this mark. `LevelPill` stays for inline metadata beside another person's
// name ("Niv. 8" in a leaderboard row).
import { useI18n } from "../contexts/I18nContext";

/**
 * @param {number}  level  the reached level
 * @param {number}  size   height of the mark in px (the numeral scales with it)
 * @param {boolean} onInk  true on the brand ink surface
 */
export default function LevelSeal({ level, size = 84, onInk = false, className = "" }) {
  const { t } = useI18n();
  if (!level || level < 1) return null;
  return (
    <span className={`bt-level-mark${onInk ? " is-on-ink" : ""} ${className}`}
      style={{ "--seal": `${size}px` }} aria-hidden="true">
      <span className="bt-level-mark-label">{t("xp.level")}</span>
      <strong className="bt-level-mark-number">{level}</strong>
    </span>
  );
}
