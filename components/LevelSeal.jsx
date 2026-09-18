// Level seal — the ONE object that represents a reached level.
//
// Before this component there were three: the pill next to a name
// (`LevelPill`), the rounded gradient tile at the top of Progression, and a
// double-ring medal that existed only inside Activity, with its colors written
// in hexadecimal. DESIGN.md asks for a single seal: a circular medallion, a
// readable numeral, the "Niv." identity and a consistent rim — so Profile,
// Progression and Activity show a student the same object.
//
// `LevelPill` stays for inline metadata (a name followed by "Niv. 8"); the seal
// is the object itself, used whenever the level IS the subject.
import { useI18n } from "../contexts/I18nContext";

/**
 * @param {number} level  the reached level
 * @param {number} size   diameter in px
 * @param {boolean} onInk true when the seal sits on the brand ink surface
 */
export default function LevelSeal({ level, size = 96, onInk = false, className = "" }) {
  const { t } = useI18n();
  if (!level || level < 1) return null;
  return (
    <span
      className={`bt-level-seal${onInk ? " is-on-ink" : ""} ${className}`}
      style={{ "--seal": `${size}px` }}
      aria-hidden="true"
    >
      <span className="bt-level-seal-label">{t("xp.level")}</span>
      <strong className="bt-level-seal-number">{level}</strong>
    </span>
  );
}
