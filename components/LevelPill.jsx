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

  const bg = solid ? "#14B885" : "rgba(20,184,133,0.14)";
  const color = solid ? "#fff" : "#0E8F68";
  const border = solid ? "transparent" : "rgba(20,184,133,0.32)";

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
      <span style={{ opacity: 0.85 }}>{t("xp.level")}</span>
      <span>{level}</span>
    </span>
  );
}
