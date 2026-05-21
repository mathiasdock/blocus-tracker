import { useState, useRef, useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";

const LEVELS = [
  "var(--bt-border)",
  "rgba(20, 184, 133, 0.20)",
  "rgba(20, 184, 133, 0.45)",
  "rgba(20, 184, 133, 0.70)",
  "rgba(20, 184, 133, 1.00)",
];

function getLevel(minutes) {
  if (!minutes) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

const MONTH_LABELS = {
  fr: ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const NUM_WEEKS = 53;
const CELL = 11;
const GAP  = 3;

export default function StudyHeatmap({ sessions = [] }) {
  const { lang } = useI18n();
  const [tooltip, setTooltip] = useState(null);
  const scrollRef = useRef(null);

  // Auto-scroll right so the current week (rightmost) is visible on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  const dateMap = {};
  sessions.forEach(s => {
    const d = s.started_at.slice(0, 10);
    dateMap[d] = (dateMap[d] || 0) + Math.round(s.duration_seconds / 60);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7; // Mon=0, Sun=6

  const weeks = [];
  for (let w = NUM_WEEKS - 1; w >= 0; w--) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOfWeek - w * 7 + d);
      const iso = date.toISOString().slice(0, 10);
      const isFuture = date > today;
      week.push({ iso, minutes: dateMap[iso] || 0, isFuture });
    }
    weeks.push(week);
  }

  // Month labels: show label on the first week of each new month
  const months = MONTH_LABELS[lang] || MONTH_LABELS.fr;
  const monthLabelMap = new Set();
  let prevMonth = -1;
  weeks.forEach((week, wi) => {
    const m = new Date(week[0].iso + "T12:00:00").getMonth();
    if (m !== prevMonth) {
      monthLabelMap.add(wi);
      prevMonth = m;
    }
  });

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={scrollRef}
        style={{
          overflowX: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        <div style={{ width: "fit-content", paddingBottom: 2 }}>

          {/* Month labels row */}
          <div style={{ display: "flex", gap: GAP, marginBottom: 4, height: 14 }}>
            {weeks.map((week, wi) => {
              const showLabel = monthLabelMap.has(wi);
              const m = new Date(week[0].iso + "T12:00:00").getMonth();
              return (
                <div key={wi} style={{ width: CELL, flexShrink: 0, position: "relative" }}>
                  {showLabel && (
                    <span style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      fontSize: 9,
                      fontWeight: 600,
                      color: "var(--bt-text-3)",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.02em",
                    }}>
                      {months[m]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cells grid */}
          <div style={{ display: "flex", gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      backgroundColor: day.isFuture
                        ? "transparent"
                        : LEVELS[getLevel(day.minutes)],
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                      if (day.isFuture) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        iso: day.iso,
                        minutes: day.minutes,
                        x: rect.left + CELL / 2,
                        y: rect.top - 34,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip (desktop hover only) */}
      {tooltip && (
        <div style={{
          position: "fixed",
          top: tooltip.y,
          left: tooltip.x,
          transform: "translateX(-50%)",
          backgroundColor: "#1F1A17",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 8,
          fontSize: 11,
          pointerEvents: "none",
          zIndex: 9999,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}>
          {tooltip.minutes > 0 ? `${tooltip.minutes} min` : "—"} · {tooltip.iso}
        </div>
      )}
    </div>
  );
}
