// Moment de célébration unifié — UN seul effet marquant, réutilisé pour le
// level-up ET les paliers de série (7 / 30 / 100 jours). Pop-in + lueur verte
// + confettis légers. Auto-fermeture après quelques secondes, croix toujours
// visible, Échap pour fermer. Dark-mode safe (variables CSS), mobile + desktop.
//
// Piloté par `data` :
//   { kind: "level",  level, titleKey }
//   { kind: "streak", days }            // days ∈ {7, 30, 100}

import { useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";
import Mascot from "./Mascot";
import Flame from "./Flame";

const CONFETTI_COLORS = ["#14B885", "#22E4A4", "#0E8F68", "#C6EED9"];
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 6 + 3) % 100}%`,
  delay: `${(i % 8) * 0.07}s`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 3) * 2,
}));

// Sous-titre par palier de série.
const STREAK_SUBTITLE_KEY = { 7: "streak.celebSub7", 30: "streak.celebSub30", 100: "streak.celebSub100" };

export default function Celebration({ data, onClose }) {
  const { t } = useI18n();

  useEffect(() => {
    const id = setTimeout(onClose, 5500);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  if (!data) return null;

  const isStreak = data.kind === "streak";

  // Contenu selon le type de célébration.
  const title = isStreak
    ? t("streak.celebTitle").replace("{n}", String(data.days))
    : `${t("levelup.levelWord")} ${data.level} ${t("levelup.unlockedSuffix")}`;
  const subtitle = isStreak
    ? t(STREAK_SUBTITLE_KEY[data.days] || "streak.celebSub7")
    : t(data.titleKey);
  const caption = isStreak ? t("streak.celebCaption") : t("levelup.subtitle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      {/* Confettis légers */}
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
        {/* Fermer */}
        <button
          onClick={onClose}
          aria-label={t("levelup.close")}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-lg leading-none transition-colors"
          style={{ color: "var(--bt-text-3)" }}
        >
          ✕
        </button>

        {/* Héros — la mascotte fête la série ; le médaillon vert pour le niveau */}
        {isStreak ? (
          <div className="mx-auto flex items-center justify-center" style={{ width: 116, height: 116 }}>
            <Mascot streak={data.days} size={116} ariaLabel={title} />
          </div>
        ) : (
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
            <span className="font-num tabular-nums" style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
              {data.level}
            </span>
          </div>
        )}

        {/* Accent */}
        <div style={{ fontSize: 22, marginTop: 10 }}>{isStreak ? <Flame size={26} style={{ color: "#F59E0B" }} /> : "⭐"}</div>

        {/* Titre */}
        <p className="mt-2 text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
          {title}
        </p>

        {/* Sous-titre (nom du niveau / libellé du palier) */}
        <p className="mt-1 text-base font-semibold" style={{ color: "var(--bt-accent-dark)" }}>
          {subtitle}
        </p>

        <p className="mt-2 text-xs" style={{ color: "var(--bt-text-3)" }}>
          {caption}
        </p>
      </div>
    </div>
  );
}
