// Centered level-up celebration. Pops in with a glow + light confetti.
// Auto-dismisses after a few seconds but always shows a close (X) button.
// Dark-mode safe (CSS variables) and works on mobile + desktop.

import { useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";

const CONFETTI_COLORS = ["#14B885", "#22E4A4", "#0E8F68", "#C6EED9"];
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 7 + 4) % 100}%`,
  delay: `${(i % 7) * 0.08}s`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 3) * 2,
}));

export default function LevelUpModal({ level, titleKey, onClose }) {
  const { t } = useI18n();

  useEffect(() => {
    const id = setTimeout(onClose, 5000);
    return () => clearTimeout(id);
  }, [onClose]);

  if (!level) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      {/* Light confetti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="bt-confetti absolute top-0"
            style={{
              left: c.left,
              animationDelay: c.delay,
              width: c.size,
              height: c.size,
              borderRadius: i % 2 ? "50%" : 2,
              backgroundColor: c.color,
            }}
          />
        ))}
      </div>

      <div
        className="bt-pop-in card relative w-full max-w-xs text-center px-6 py-7"
        style={{ backgroundColor: "var(--bt-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={t("levelup.close")}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-lg leading-none transition-colors"
          style={{ color: "var(--bt-text-3)" }}
        >
          ✕
        </button>

        {/* Level badge with glow */}
        <div
          className="bt-pulse-green mx-auto flex flex-col items-center justify-center"
          style={{
            width: 88,
            height: 88,
            borderRadius: 28,
            background: "linear-gradient(135deg, #0E8F68 0%, #14B885 55%, #22E4A4 100%)",
            boxShadow: "0 8px 32px rgba(20,184,133,0.55)",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.75)", lineHeight: 1 }}>
            {t("xp.level")}
          </span>
          <span style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{level}</span>
        </div>

        {/* Star accent */}
        <div style={{ fontSize: 22, marginTop: 10 }}>⭐</div>

        {/* Title: "Niveau 4 débloqué" / "Level 4 unlocked" */}
        <p className="mt-2 text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
          {t("levelup.levelWord")} {level} {t("levelup.unlockedSuffix")}
        </p>

        {/* Level name */}
        <p className="mt-1 text-base font-semibold" style={{ color: "var(--bt-accent-dark)" }}>
          {t(titleKey)}
        </p>

        <p className="mt-2 text-xs" style={{ color: "var(--bt-text-3)" }}>
          {t("levelup.subtitle")}
        </p>
      </div>
    </div>
  );
}
