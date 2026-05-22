import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

function ChevronIcon({ direction }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left"
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function MiniToggle({ options, value, onChange }) {
  return (
    <div style={{
      display: "inline-flex",
      backgroundColor: "var(--bt-subtle)",
      border: "1px solid var(--bt-border)",
      borderRadius: 20,
      padding: 2,
    }}>
      {options.map(opt => {
        const active = value === opt.val;
        return (
          <button
            key={opt.val}
            onClick={() => onChange(opt.val)}
            style={{
              borderRadius: 16,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s",
              backgroundColor: active ? "var(--bt-surface)" : "transparent",
              color: active ? "var(--bt-text-1)" : "var(--bt-text-3)",
              boxShadow: active ? "0 1px 3px rgba(31,26,23,0.10)" : "none",
            }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function formatHourMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function CustomTooltip({ active, payload, label, showHours }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 14, padding: "8px 14px", boxShadow: "0 4px 16px rgba(31,26,23,0.08)" }}>
      {label && <p style={{ fontSize: 11, color: "#A8A09A", marginBottom: 2 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: 14, fontWeight: 600, color: p.fill || "var(--bt-text-1)" }}>
          {showHours ? formatHourMinutes(p.value) : `${p.value} min`}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload, showHours }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const displayVal = showHours
    ? formatHourMinutes(p.value)
    : `${p.value} min`;
  return (
    <div style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 14, padding: "8px 14px", boxShadow: "0 4px 16px rgba(31,26,23,0.08)" }}>
      <p style={{ fontSize: 12, color: "#7C746E", marginBottom: 2 }}>{p.name}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: p.payload.color || "#14B885" }}>{displayVal}</p>
    </div>
  );
}

export default function StatsCharts({
  dailyData,
  byCourseWeek,
  byCourseMonth,
  weekLabel,
  onPrev,
  onNext,
  canPrev,
  canNext,
  chartTitle,
  courseChartTitle,
  noDataText,
  unitMinLabel,
  unitHrLabel,
  weekToggleLabel,
  monthToggleLabel,
}) {
  const [showHours, setShowHours] = useState(false);
  const [donutPeriod, setDonutPeriod] = useState("week");
  const [expanded, setExpanded] = useState(null); // null | "bar" | "pie"

  const activeCourse = donutPeriod === "week" ? byCourseWeek : byCourseMonth;

  const chartData = dailyData;
  const barDataKey = "minutes";

  return (
    <div className="space-y-3">

      {/* Backdrop — click outside closes expanded chart */}
      {expanded && (
        <div className="fixed inset-0 z-[5]" onClick={() => setExpanded(null)} />
      )}

      {/* ── Expanded chart (full-width, rendered above mini grid) ── */}
      {expanded && (
        <div className="relative z-[10]" onClick={e => e.stopPropagation()}>
          {expanded === "bar" ? (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight truncate" style={{ color: "var(--bt-text-1)" }}>
                    {chartTitle}
                  </h2>
                  {weekLabel && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>{weekLabel}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <MiniToggle
                    options={[
                      { val: "min", label: unitMinLabel },
                      { val: "h",   label: unitHrLabel },
                    ]}
                    value={showHours ? "h" : "min"}
                    onChange={v => setShowHours(v === "h")}
                  />
                  <div className="flex items-center gap-1">
                    <button onClick={onPrev} disabled={!canPrev}
                      className="w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
                      style={{
                        backgroundColor: "var(--bt-subtle)",
                        border: "1px solid var(--bt-border)",
                        color: canPrev ? "var(--bt-text-2)" : "var(--bt-text-4)",
                        cursor: canPrev ? "pointer" : "not-allowed",
                      }}>
                      <ChevronIcon direction="left" />
                    </button>
                    <button onClick={onNext} disabled={!canNext}
                      className="w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
                      style={{
                        backgroundColor: "var(--bt-subtle)",
                        border: "1px solid var(--bt-border)",
                        color: canNext ? "var(--bt-text-2)" : "var(--bt-text-4)",
                        cursor: canNext ? "pointer" : "not-allowed",
                      }}>
                      <ChevronIcon direction="right" />
                    </button>
                  </div>
                  {/* Close button */}
                  <button
                    onClick={() => setExpanded(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
                    style={{ backgroundColor: "#4B5563", color: "#fff", border: "none", cursor: "pointer", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="0" stroke="#F0EBE4" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#A8A09A" }} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={42} tick={{ fill: "#A8A09A" }}
                      tickFormatter={v => showHours ? formatHourMinutes(v) : v} />
                    <Tooltip content={(props) => <CustomTooltip {...props} showHours={showHours} />} cursor={{ fill: "var(--bt-subtle)" }} />
                    <Bar dataKey={barDataKey} fill="#14B885" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-base font-semibold leading-tight" style={{ color: "var(--bt-text-1)" }}>
                  {courseChartTitle}
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                  <MiniToggle
                    options={[
                      { val: "week",  label: weekToggleLabel },
                      { val: "month", label: monthToggleLabel },
                    ]}
                    value={donutPeriod}
                    onChange={setDonutPeriod}
                  />
                  {/* Close button */}
                  <button
                    onClick={() => setExpanded(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
                    style={{ backgroundColor: "#4B5563", color: "#fff", border: "none", cursor: "pointer", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="h-52">
                {activeCourse.length === 0 ? (
                  <p className="text-sm" style={{ color: "#A8A09A" }}>{noDataText}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={activeCourse} dataKey="minutes" nameKey="name"
                        innerRadius={56} outerRadius={96} paddingAngle={3}>
                        {activeCourse.map((c, i) => (
                          <Cell key={i} fill={c.color || "#14B885"} />
                        ))}
                      </Pie>
                      <Tooltip content={(props) => <PieTooltip {...props} showHours={showHours} />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {activeCourse.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color || "#14B885" }} />
                    <span className="truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                    <span className="ml-auto tabular-nums text-xs" style={{ color: "#A8A09A" }}>
                      {showHours ? formatHourMinutes(c.minutes) : `${c.minutes} min`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── Mini grid — always shown (dimmed when one is expanded) ── */}
      <div
        className="grid grid-cols-2 gap-3"
        style={{
          opacity: expanded ? 0.4 : 1,
          pointerEvents: expanded ? "none" : "auto",
          transition: "opacity 0.2s",
        }}>

        {/* Mini bar chart */}
        <section
          className="card p-3 cursor-pointer select-none relative overflow-hidden"
          onClick={() => setExpanded("bar")}
          style={{ transition: "box-shadow 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(20,184,133,0.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; }}>
          <div style={{ position: "absolute", top: 7, right: 7, color: "var(--bt-text-4)", opacity: 0.45 }}>
            <ExpandIcon />
          </div>
          <h2 className="text-[11px] font-semibold truncate mb-1.5 pr-4" style={{ color: "var(--bt-text-2)" }}>
            {chartTitle}
          </h2>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={8} tick={{ fill: "#A8A09A" }} />
                <Bar dataKey={barDataKey} fill="#14B885" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Mini pie chart */}
        <section
          className="card p-3 cursor-pointer select-none relative overflow-hidden"
          onClick={() => setExpanded("pie")}
          style={{ transition: "box-shadow 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(20,184,133,0.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; }}>
          <div style={{ position: "absolute", top: 7, right: 7, color: "var(--bt-text-4)", opacity: 0.45 }}>
            <ExpandIcon />
          </div>
          <h2 className="text-[11px] font-semibold truncate mb-1.5 pr-4" style={{ color: "var(--bt-text-2)" }}>
            {courseChartTitle}
          </h2>
          <div className="h-24">
            {activeCourse.length === 0 ? (
              <p className="text-xs mt-2" style={{ color: "#A8A09A" }}>{noDataText}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={activeCourse} dataKey="minutes" nameKey="name"
                    innerRadius={22} outerRadius={42} paddingAngle={3}>
                    {activeCourse.map((c, i) => (
                      <Cell key={i} fill={c.color || "#14B885"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
