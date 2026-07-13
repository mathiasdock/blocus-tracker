import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import Mascot from "./Mascot";

export function mascotCoachStage(streak) {
  const days = Number(streak) || 0;
  if (days <= 0) return "asleep";
  if (days <= 2) return "content";
  if (days <= 6) return "motivated";
  if (days <= 13) return "proud";
  if (days <= 29) return "energetic";
  return "legendary";
}

function storageFor(persistence) {
  if (typeof window === "undefined") return null;
  return persistence === "session" ? window.sessionStorage : window.localStorage;
}

export default function MascotCoach({
  id,
  message,
  streak = 0,
  variant = "bubble",
  surface = "default",
  persistence = "day",
  dismissible = true,
  className = "",
  live = false,
  size,
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(!persistence);
  const stage = mascotCoachStage(streak);
  const stageLabel = t(`coach.stage.${stage}`);
  const dateKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const storageKey = id
    ? `bt_mascot_coach:${id}${persistence === "day" ? `:${dateKey}` : ""}`
    : null;

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    if (!persistence || !storageKey) {
      setVisible(true);
      return;
    }
    try {
      setVisible(storageFor(persistence)?.getItem(storageKey) !== "dismissed");
    } catch {
      setVisible(true);
    }
  }, [message, persistence, storageKey]);

  function dismiss() {
    setVisible(false);
    if (!persistence || !storageKey) return;
    try { storageFor(persistence)?.setItem(storageKey, "dismissed"); } catch {}
  }

  if (!message || !visible) return null;

  const mascotSize = size || (variant === "solo" ? 54 : 62);
  const isInk = surface === "ink";
  const isEmbedded = variant === "embedded";

  if (variant === "solo") {
    return (
      <div className={`inline-flex ${className}`} title={message}>
        <Mascot streak={streak} size={mascotSize} ariaLabel={`${stageLabel}. ${message}`} />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center gap-3 text-left ${isEmbedded ? "" : "rounded-2xl px-3 py-2.5"} ${className}`}
      style={isEmbedded ? undefined : {
        backgroundColor: isInk ? "rgba(255,255,255,0.08)" : "var(--bt-accent-bg)",
        border: `1px solid ${isInk ? "rgba(255,255,255,0.12)" : "var(--bt-accent-border)"}`,
      }}
      role="status"
      aria-live={live ? "polite" : "off"}
    >
      <div className="shrink-0 flex items-end justify-center" style={{ width: mascotSize, height: mascotSize }}>
        <Mascot streak={streak} size={mascotSize} ariaLabel={stageLabel} />
      </div>
      <p
        className="min-w-0 flex-1 text-sm font-medium leading-relaxed"
        style={{ color: isInk ? "var(--bt-ink-text)" : "var(--bt-text-2)" }}
      >
        {message}
      </p>
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          className="self-start shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base leading-none transition-colors"
          style={{ color: isInk ? "var(--bt-ink-muted)" : "var(--bt-text-3)" }}
          aria-label={t("coach.close")}
          title={t("coach.close")}
        >
          ×
        </button>
      )}
    </div>
  );
}
