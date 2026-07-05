import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

// Recharts applique `tick.fill` / `stroke` comme ATTRIBUTS SVG, où var(--bt-*)
// ne se résout pas. On utilise donc un gris/taupe neutre lisible en clair ET
// en sombre pour l'habillage des graphiques (axes, grille). Tout le reste
// (tooltips, modale, boutons) utilise des inline-styles → les variables CSS y
// fonctionnent normalement.
const AXIS_COLOR = "#94908B";
const GRID_COLOR = "#94908B";

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

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Déclenche le téléchargement d'un CSV à partir de lignes [{...}]. Client pur,
// aucune dépendance : Blob + <a download>. Échappe les guillemets/points-virgules.
function downloadCsv(filename, rows) {
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(";"), ...rows.map(r => headers.map(h => esc(r[h])).join(";"))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
              backgroundColor: active ? "#14B885" : "transparent",
              color: active ? "#fff" : "var(--bt-text-3)",
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
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function CustomTooltip({ active, payload, label, showHours }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 14, padding: "8px 14px", boxShadow: "0 4px 16px var(--bt-shadow)" }}>
      {label && <p style={{ fontSize: 11, color: "var(--bt-text-3)", marginBottom: 2 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-num tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: p.fill || "var(--bt-text-1)" }}>
          {showHours ? formatHourMinutes(p.value) : `${p.value} min`}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload, showHours }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const displayVal = showHours ? formatHourMinutes(p.value) : `${p.value} min`;
  return (
    <div style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 14, padding: "8px 14px", boxShadow: "0 4px 16px var(--bt-shadow)" }}>
      <p style={{ fontSize: 12, color: "var(--bt-text-2)", marginBottom: 2 }}>{p.name}</p>
      <p className="font-num tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: p.payload.color || "#14B885" }}>{displayVal}</p>
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
  csvLabel,
}) {
  const [showHours, setShowHours] = useState(true); // heures par défaut
  const [donutPeriod, setDonutPeriod] = useState("week");
  const [expanded, setExpanded] = useState(null); // null | "bar" | "pie"

  const activeCourse = donutPeriod === "week" ? byCourseWeek : byCourseMonth;

  function exportActive() {
    if (expanded === "bar") {
      downloadCsv("blocus-semaine.csv", dailyData.map(d => ({ jour: d.day, minutes: d.minutes })));
    } else if (expanded === "pie") {
      downloadCsv(`blocus-cours-${donutPeriod}.csv`, activeCourse.map(c => ({ cours: c.name, minutes: c.minutes })));
    }
  }

  const csvButton = (
    <button
      onClick={exportActive}
      title={csvLabel || "CSV"}
      className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0"
      style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)", cursor: "pointer" }}>
      <DownloadIcon />
    </button>
  );

  const closeButton = (
    <button
      onClick={() => setExpanded(null)}
      className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0"
      style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)", cursor: "pointer" }}>
      <CloseIcon />
    </button>
  );

  return (
    <>
      {/* ── Mini grid — toujours affichée ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Mini bar chart */}
        <section
          className="card p-3 cursor-pointer select-none relative overflow-hidden card-lift"
          onClick={() => setExpanded("bar")}>
          <div style={{ position: "absolute", top: 7, right: 7, color: "var(--bt-text-4)", opacity: 0.45 }}>
            <ExpandIcon />
          </div>
          <h2 className="text-[11px] font-semibold truncate mb-1.5 pr-4" style={{ color: "var(--bt-text-2)" }}>
            {chartTitle}
          </h2>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} barCategoryGap="30%" margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={8} tick={{ fill: AXIS_COLOR }} />
                <Bar dataKey="minutes" fill="#14B885" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Mini pie chart */}
        <section
          className="card p-3 cursor-pointer select-none relative overflow-hidden card-lift"
          onClick={() => setExpanded("pie")}>
          <div style={{ position: "absolute", top: 7, right: 7, color: "var(--bt-text-4)", opacity: 0.45 }}>
            <ExpandIcon />
          </div>
          <h2 className="text-[11px] font-semibold truncate mb-1.5 pr-4" style={{ color: "var(--bt-text-2)" }}>
            {courseChartTitle}
          </h2>
          <div className="h-24">
            {activeCourse.length === 0 ? (
              <p className="text-xs mt-2" style={{ color: "var(--bt-text-3)" }}>{noDataText}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={activeCourse} dataKey="minutes" nameKey="name"
                    innerRadius={22} outerRadius={42} paddingAngle={3}>
                    {activeCourse.map((c, i) => (
                      <Cell key={i} fill={c.color || "#14B885"} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ── Modale plein écran (bottom-sheet mobile, centrée desktop) ── */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={() => setExpanded(null)}>
          <div
            className="w-full sm:max-w-lg card rounded-t-[24px] sm:rounded-[20px] p-5"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: "88vh", overflowY: "auto" }}>

            {expanded === "bar" ? (
              <>
                <div className="flex items-center justify-between mb-4 gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg leading-tight truncate" style={{ color: "var(--bt-text-1)" }}>
                      {chartTitle}
                    </h2>
                    {weekLabel && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>{weekLabel}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <MiniToggle
                      options={[{ val: "min", label: unitMinLabel }, { val: "h", label: unitHrLabel }]}
                      value={showHours ? "h" : "min"}
                      onChange={v => setShowHours(v === "h")}
                    />
                    {csvButton}
                    {closeButton}
                  </div>
                </div>
                <div className="flex items-center gap-1 mb-3">
                  <button onClick={onPrev} disabled={!canPrev}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
                    style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", color: canPrev ? "var(--bt-text-2)" : "var(--bt-text-4)", cursor: canPrev ? "pointer" : "not-allowed" }}>
                    <ChevronIcon direction="left" />
                  </button>
                  <button onClick={onNext} disabled={!canNext}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
                    style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", color: canNext ? "var(--bt-text-2)" : "var(--bt-text-4)", cursor: canNext ? "pointer" : "not-allowed" }}>
                    <ChevronIcon direction="right" />
                  </button>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="0" stroke={GRID_COLOR} strokeOpacity={0.18} vertical={false} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: AXIS_COLOR }} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={42} tick={{ fill: AXIS_COLOR }}
                        tickFormatter={v => showHours ? formatHourMinutes(v) : v} />
                      <Tooltip content={(props) => <CustomTooltip {...props} showHours={showHours} />} cursor={{ fill: "var(--bt-subtle)" }} />
                      <Bar dataKey="minutes" fill="#14B885" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 gap-2">
                  <h2 className="font-display text-lg leading-tight" style={{ color: "var(--bt-text-1)" }}>
                    {courseChartTitle}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <MiniToggle
                      options={[{ val: "week", label: weekToggleLabel }, { val: "month", label: monthToggleLabel }]}
                      value={donutPeriod}
                      onChange={setDonutPeriod}
                    />
                    {csvButton}
                    {closeButton}
                  </div>
                </div>
                {activeCourse.length === 0 ? (
                  <p className="text-sm py-10 text-center" style={{ color: "var(--bt-text-3)" }}>{noDataText}</p>
                ) : (
                  <>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={activeCourse} dataKey="minutes" nameKey="name"
                            innerRadius={56} outerRadius={96} paddingAngle={3}>
                            {activeCourse.map((c, i) => (
                              <Cell key={i} fill={c.color || "#14B885"} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip content={(props) => <PieTooltip {...props} showHours={showHours} />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                      {activeCourse.map((c) => (
                        <li key={c.name} className="flex items-center gap-2 text-sm">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color || "#14B885" }} />
                          <span className="truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                          <span className="ml-auto font-num tabular-nums text-xs" style={{ color: "var(--bt-text-3)" }}>
                            {showHours ? formatHourMinutes(c.minutes) : `${c.minutes} min`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
