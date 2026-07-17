import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import LoadingScreen from "../components/LoadingScreen";
import Layout, { Avatar } from "../components/Layout";
import UniPicker from "../components/UniPicker";
import StudyHeatmap from "../components/StudyHeatmap";
import LevelPill from "../components/LevelPill";
import BadgeIcon from "../components/BadgeIcon";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatMinutesShort } from "../lib/format";
import { isStudyingLive } from "../lib/presence";
import { COMMUNITY_BY_ID, COUNTRIES } from "../lib/universities";
import { BADGES } from "../lib/badges";
import { loadUserLevelMap } from "../lib/userLevels";
import {
  buildTimeSeries, activeUserKpis, retention,
  usersByUniversity, topActiveUniversities, activationBreakdown,
} from "../lib/adminAnalytics";
import { TEXT_LIMITS, clientRateLimit, isSafeInternalHref, trimmedText } from "../lib/security";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const ALL_UNI_FULLS = new Set(COUNTRIES.flatMap(c => c.universities).map(u => u.full));

const YEARS = [
  "BAC 1", "BAC 2", "BAC 3",
  "Année préparatoire", "Année passerelle",
  "Master 1", "Master 2",
  "Année de spécialisation", "Certificat / formation courte",
  "Doctorat", "Formation continue", "Autre",
];

const SECTIONS = [
  { id: "overview",  label: "Vue d'ensemble" },
  { id: "analytics", label: "Analytics" },
  { id: "activity",  label: "Activité" },
  { id: "members",   label: "Membres" },
  { id: "technical", label: "Technique" },
  { id: "content",   label: "Contenu" },
];

// Palette graphiques — accents distincts, cohérents avec l'app.
const C = { green: "#14B885", blue: "#0ea5e9", violet: "#8B5CF6", amber: "#F59E0B", rose: "#F43F5E", teal: "#14b8a6" };
// Axes/grilles : gris neutre littéral (les var(--bt-*) ne résolvent pas dans
// les attributs SVG de recharts) — lisible en clair comme en sombre.
const AXIS = "#94908B";
const GRID = "rgba(148,144,139,0.16)";

/* ── Helpers ───────────────────────────────────────────────── */
function relDate(isoStr) {
  if (!isoStr) return "Jamais";
  const days = Math.floor((Date.now() - new Date(isoStr).getTime()) / 864e5);
  if (days === 0) return "Auj.";
  if (days === 1) return "Hier";
  if (days < 7)  return `${days}j`;
  if (days < 30) return `${Math.floor(days / 7)} sem.`;
  return `${Math.floor(days / 30)} mois`;
}

function deltaLabel(pct) {
  if (pct === null || pct === undefined) return null;
  return { sign: pct >= 0 ? "↑" : "↓", abs: Math.abs(pct), positive: pct >= 0 };
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function egressStatusLabel(status, t) {
  if (status === "referenced") return t("admin.egressReferenced");
  if (status === "orphan") return t("admin.egressOrphanObjects");
  return t("admin.egressUnknown");
}

function cleanupReasonLabel(candidate, t) {
  return t(candidate?.reasonKey || "admin.egressUnknown");
}

function buildEgressAlerts(data, t) {
  if (!data) return [];
  const alerts = [];
  const avatars = data.buckets?.avatars;
  if (avatars?.count > 0 && avatars.averageBytes <= 400 * 1024 && avatars.p90Bytes <= 700 * 1024) {
    alerts.push({ level: "ok", text: `${t("admin.egressOk")} · avatars ${formatBytes(avatars.averageBytes)} avg / p90 ${formatBytes(avatars.p90Bytes)}` });
  } else if (avatars?.count > 0) {
    alerts.push({ level: "warn", text: `${t("admin.egressWarning")} · avatars avg ${formatBytes(avatars.averageBytes)} / p90 ${formatBytes(avatars.p90Bytes)}` });
  }
  if ((data.heavy?.over1Mb || 0) >= 5) {
    alerts.push({ level: "critical", text: `${t("admin.egressCritical")} · ${data.heavy.over1Mb} objets > 1 MB` });
  } else if ((data.heavy?.over1Mb || 0) > 0) {
    alerts.push({ level: "warn", text: `${t("admin.egressWarning")} · ${data.heavy.over1Mb} objets > 1 MB` });
  }
  if ((data.heavy?.over500Kb || 0) >= 10) {
    alerts.push({ level: "warn", text: `${t("admin.egressWarning")} · ${data.heavy.over500Kb} objets > 500 KB` });
  }
  if ((data.posts?.expiredWithImage || 0) > 0) {
    alerts.push({ level: "warn", text: `${t("admin.egressWarning")} · ${data.posts.expiredWithImage} posts expirés avec image` });
  }
  if ((data.posts?.activeWithImage || 0) > 10) {
    alerts.push({ level: "warn", text: `${t("admin.egressWarning")} · ${data.posts.activeWithImage} posts actifs avec image` });
  }
  if (!alerts.length) alerts.push({ level: "ok", text: `${t("admin.egressOk")} · aucun risque majeur détecté` });
  return alerts;
}

/* ── Tooltip graphiques (compatible dark via variables CSS) ─── */
function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-surface)", boxShadow: "0 4px 16px var(--bt-shadow)", padding: "8px 11px" }}>
      <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--bt-text-1)" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[11px] tabular-nums" style={{ color: "var(--bt-text-2)" }}>
          <span style={{ color: p.color || p.stroke || p.fill }}>●</span>{" "}
          {p.name} : <span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>{p.value}{unit ? ` ${unit}` : ""}</span>
        </p>
      ))}
    </div>
  );
}

/* ── UI primitives ─────────────────────────────────────────── */
function StatCard({ label, value, accent, sub, dot, delta }) {
  return (
    <div className="rounded-2xl p-3.5 min-w-0" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
      <div className="flex items-center gap-1.5">
        <span className="font-num font-bold tabular-nums leading-none truncate" style={{ fontSize: "1.5rem", color: accent || "var(--bt-text-1)", letterSpacing: "-0.02em" }}>{value}</span>
        {dot && <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: "#22c55e" }} />}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <p className="text-[11px] font-medium truncate" style={{ color: "var(--bt-text-3)" }}>{label}</p>
        {delta && (
          <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: delta.positive ? "#0E8F68" : "#DC2626" }}>
            {delta.sign}{delta.abs}%
          </span>
        )}
      </div>
      {sub && <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--bt-text-4)" }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{title}</h3>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

const STATUS_COLOR = { ok: "#14B885", warn: "#F59E0B", down: "#EF4444", idle: "#94908B" };
function HealthPill({ label, value, status, hint }) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.idle;
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }} />
        <span className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: "var(--bt-text-3)" }}>{label}</span>
      </div>
      <p className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>{value}</p>
      {hint && <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--bt-text-4)" }}>{hint}</p>}
    </div>
  );
}

function EgressGuardPanel({ data, loading, error, onRefresh, t }) {
  const bucketRows = [
    ["posts", "posts"],
    ["avatars", "avatars"],
    ["dm", "dm"],
    ["community", "community"],
    ["group", "group"],
  ];
  const alerts = buildEgressAlerts(data, t);
  const alertStyles = {
    ok: { bg: "var(--bt-accent-bg)", color: "#0E8F68", border: "var(--bt-accent-border)" },
    warn: { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
    critical: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  };

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
            {t("admin.egressGuard")}
          </p>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: "var(--bt-text-4)" }}>
            {t("admin.egressGuardDesc")}
          </p>
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="btn-ghost text-xs px-3 py-1.5 shrink-0">
          {loading ? "…" : t("admin.egressRefresh")}
        </button>
      </div>

      {error && (
        <p className="text-xs rounded-xl px-3 py-2 mb-4" style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
          {error}
        </p>
      )}

      {!data && loading ? (
        <LoadingScreen compact />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t("admin.egressActivePosts")} value={data.posts.active} sub={`${data.posts.activeWithImage} images`} />
            <StatCard label={t("admin.egressExpiredPosts")} value={data.posts.expired} />
            <StatCard label={t("admin.egressExpiredImages")} value={data.posts.expiredWithImage} accent={data.posts.expiredWithImage > 0 ? "#C2410C" : "#14B885"} />
            <StatCard label={t("admin.egressHeavyFiles")} value={data.heavy.over1Mb} sub="> 1 MB" accent={data.heavy.over1Mb ? "#DC2626" : "#14B885"} />
          </div>

          <div className="flex flex-wrap gap-2">
            {alerts.map((alert, index) => {
              const style = alertStyles[alert.level] || alertStyles.ok;
              return (
                <span key={`${alert.level}-${index}`} className="text-xs font-semibold rounded-full px-3 py-1"
                  style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                  {alert.text}
                </span>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--bt-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                  {[t("admin.egressBucket"), "Objets", t("admin.egressTotalSize"), "Moyenne", "p90", t("admin.egressOrphanObjects"), "Uploads 24h"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--bt-text-3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bucketRows.map(([bucket, label]) => {
                  const row = data.buckets?.[bucket] || {};
                  return (
                    <tr key={bucket} style={{ borderBottom: "1px solid var(--bt-subtle)" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "var(--bt-text-1)" }}>{label}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--bt-text-2)" }}>{row.count ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--bt-text-2)" }}>{formatBytes(row.totalBytes)}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--bt-text-2)" }}>{formatBytes(row.averageBytes)}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--bt-text-2)" }}>{formatBytes(row.p90Bytes)}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: row.orphanCount ? "#C2410C" : "var(--bt-text-2)" }}>
                        {row.orphanCount === null ? t("admin.egressUnknown") : row.orphanCount}
                      </td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--bt-text-2)" }}>{row.recent24h ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--bt-text-1)" }}>{t("admin.egressHeavyFiles")}</h3>
            {data.heavy.top.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("admin.egressNoHeavyFiles")}</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--bt-border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                      {["Bucket", "Path", "Taille", "Statut"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.heavy.top.map((file) => (
                      <tr key={`${file.bucket}:${file.path}`} style={{ borderBottom: "1px solid var(--bt-subtle)" }}>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--bt-text-1)" }}>{file.bucket}</td>
                        <td className="px-3 py-2 font-mono text-[11px] max-w-[360px] truncate" title={file.path} style={{ color: "var(--bt-text-2)" }}>{file.path}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: file.sizeBytes > 1024 * 1024 ? "#DC2626" : "var(--bt-text-2)" }}>{formatBytes(file.sizeBytes)}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: file.status === "orphan" ? "#C2410C" : "var(--bt-text-2)" }}>{egressStatusLabel(file.status, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--bt-text-4)" }}>
            <span>{t("admin.egressGeneratedAt")} {new Date(data.generatedAt).toLocaleString("fr-FR")}</span>
            <span>Scan max {data.limits.maxFilesPerBucket} objets/bucket</span>
            {data.scan?.warnings?.length > 0 && <span>{data.scan.warnings.length} avertissement(s) de scan</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("admin.egressRefresh")}.</p>
      )}
    </section>
  );
}

function StorageCleanupPanel({
  data,
  selectedIds,
  loading,
  deleting,
  error,
  result,
  onScan,
  onDelete,
  onToggle,
  t,
}) {
  const selected = data?.candidates?.filter((candidate) => selectedIds.has(candidate.id)) || [];
  const selectedBytes = selected.reduce((sum, candidate) => sum + (candidate.sizeBytes || 0), 0);
  const safeSelected = selected.filter((candidate) => candidate.safeDelete);

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
            {t("admin.cleanupTitle")}
          </p>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: "var(--bt-text-4)" }}>
            {t("admin.cleanupDesc")}
          </p>
        </div>
        <button onClick={onScan} disabled={loading || deleting}
          className="btn-ghost text-xs px-3 py-1.5 shrink-0">
          {loading ? "…" : t("admin.cleanupScan")}
        </button>
      </div>

      {error && (
        <p className="text-xs rounded-xl px-3 py-2 mb-4" style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-2xl px-3 py-2 mb-4 text-xs"
          style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68", border: "1px solid var(--bt-accent-border)" }}>
          <span className="font-semibold">{t("admin.cleanupDeleted")} : {result.deletedCount}</span>
          <span> · {formatBytes(result.deletedBytes)}</span>
          {result.skippedCount > 0 && <span> · {t("admin.cleanupSkipped")} : {result.skippedCount}</span>}
          {result.errors?.length > 0 && <span> · {result.errors.length} erreur(s)</span>}
        </div>
      )}

      {!data ? (
        <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)", border: "1px solid var(--bt-border)" }}>
          {t("admin.cleanupEmpty")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t("admin.cleanupCandidates")} value={data.summary.candidateCount} />
            <StatCard label={t("admin.cleanupSafe")} value={data.summary.safeCount} accent="#14B885" />
            <StatCard label={t("admin.cleanupRecoverable")} value={formatBytes(data.summary.safeSizeBytes)} />
            <StatCard label="DM" value={data.summary.dmPreviewCount} sub={t("admin.cleanupDmExcluded")} accent={data.summary.dmPreviewCount ? "#C2410C" : undefined} />
          </div>

          {data.warnings?.length > 0 && (
            <p className="text-xs rounded-xl px-3 py-2" style={{ backgroundColor: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA" }}>
              {data.warnings.length} avertissement(s) de scan. Les éléments incertains ne sont pas supprimables.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onDelete} disabled={deleting || safeSelected.length === 0}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
              {deleting ? "…" : t("admin.cleanupDeleteSelected")}
            </button>
            <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>
              {safeSelected.length} {t("admin.cleanupSelected")} · {formatBytes(selectedBytes)}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl max-h-[420px]" style={{ border: "1px solid var(--bt-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                  {["", "Bucket", "Path", "Taille", "Raison", "Statut"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--bt-text-3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((candidate) => (
                  <tr key={candidate.id} style={{ borderBottom: "1px solid var(--bt-subtle)" }}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(candidate.id)}
                        disabled={!candidate.safeDelete}
                        onChange={() => onToggle(candidate)}
                        aria-label={candidate.safeDelete ? t("admin.cleanupSelected") : t("admin.cleanupDmExcluded")}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: "var(--bt-text-1)" }}>{candidate.bucket}</td>
                    <td className="px-3 py-2 font-mono text-[11px] max-w-[340px] truncate" title={candidate.path} style={{ color: "var(--bt-text-2)" }}>{candidate.path}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--bt-text-2)" }}>{formatBytes(candidate.sizeBytes)}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--bt-text-2)" }}>{cleanupReasonLabel(candidate, t)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5"
                        style={candidate.safeDelete
                          ? { backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }
                          : { backgroundColor: "#FFF7ED", color: "#C2410C" }}>
                        {candidate.safeDelete ? t("admin.cleanupSafe") : t("admin.cleanupDmExcluded")}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.candidates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>
                      {t("admin.cleanupNothing")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px]" style={{ color: "var(--bt-text-4)" }}>
            {t("admin.egressGeneratedAt")} {new Date(data.generatedAt).toLocaleString("fr-FR")} · max {data.limits.maxDeleteIds} suppressions par action.
          </p>
        </div>
      )}
    </section>
  );
}

/* ── Flux d'activité — icônes par type d'évènement ─────────── */
const ACTIVITY_META = {
  signup:   { color: C.green,  icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" /> },
  session:  { color: C.blue,   icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  post:     { color: C.violet, icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /></> },
  message:  { color: C.amber,  icon: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
  badge:    { color: C.rose,   icon: <><circle cx="12" cy="8" r="6" /><path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5" /></> },
  feedback: { color: C.teal,   icon: <path d="M14 9V5a3 3 0 0 0-6 0v4M5 9h14l1 12H4L5 9z" /> },
};

function ActivityRow({ ev }) {
  const meta = ACTIVITY_META[ev.kind] || ACTIVITY_META.session;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: "1px solid var(--bt-border)" }}>
      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{meta.icon}</svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: "var(--bt-text-1)" }}>
          <span className="font-semibold">@{ev.pseudo}</span> {ev.text}
        </p>
        <p className="text-[11px]" style={{ color: "var(--bt-text-4)" }}>{relDate(ev.at)} · {new Date(ev.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      {ev.value && <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: meta.color }}>{ev.value}</span>}
    </div>
  );
}

/* ── Recherche globale ─────────────────────────────────────── */
function GlobalSearch({ users, announcements, feedback, onPickUser, onPickSection }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (needle.length < 2) return null;
    const u = users.filter(x =>
      x.pseudo?.toLowerCase().includes(needle) ||
      displayName(x).toLowerCase().includes(needle) ||
      x.university?.toLowerCase().includes(needle)
    ).slice(0, 6);
    const comms = Object.values(COMMUNITY_BY_ID)
      .filter(c => c.name?.toLowerCase().includes(needle) || c.full?.toLowerCase().includes(needle))
      .slice(0, 4);
    const anns = announcements.filter(a =>
      a.title?.toLowerCase().includes(needle) || a.message?.toLowerCase().includes(needle)
    ).slice(0, 4);
    const sugg = feedback.filter(f => f.message?.toLowerCase().includes(needle)).slice(0, 4);
    return { u, comms, anns, sugg, empty: !u.length && !comms.length && !anns.length && !sugg.length };
  }, [needle, users, announcements, feedback]);

  return (
    <div ref={wrapRef} className="relative w-full sm:w-80">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--bt-text-4)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      </span>
      <input
        className="input w-full" style={{ paddingLeft: "2.1rem" }}
        placeholder="Rechercher un membre, une communauté, une annonce…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && results && (
        <div className="absolute z-40 mt-1.5 left-0 right-0 rounded-2xl overflow-hidden max-h-[70vh] overflow-y-auto"
          style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 12px 40px var(--bt-shadow)" }}>
          {results.empty && <p className="px-4 py-4 text-sm" style={{ color: "var(--bt-text-3)" }}>Aucun résultat pour « {q} »</p>}
          {results.u.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>Membres</p>
              {results.u.map(x => (
                <button key={x.id} onClick={() => { onPickUser(x); setOpen(false); setQ(""); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                  <Avatar url={x.avatar_url} pseudo={x.pseudo} size={26} />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate" style={{ color: "var(--bt-text-1)" }}>@{x.pseudo}</span>
                    {x.university && <span className="text-[11px] block truncate" style={{ color: "var(--bt-text-3)" }}>{x.university}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.comms.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>Communautés</p>
              {results.comms.map(c => (
                <div key={c.id} className="px-4 py-2 text-sm" style={{ color: "var(--bt-text-2)" }}>{c.name} <span className="text-[11px]" style={{ color: "var(--bt-text-4)" }}>· {c.full}</span></div>
              ))}
            </div>
          )}
          {results.anns.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>Annonces</p>
              {results.anns.map(a => (
                <button key={a.id} onClick={() => { onPickSection("content"); setOpen(false); setQ(""); }}
                  className="w-full px-4 py-2 text-left text-sm transition-colors truncate" style={{ color: "var(--bt-text-2)" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>{a.title}</button>
              ))}
            </div>
          )}
          {results.sugg.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>Suggestions</p>
              {results.sugg.map(f => (
                <button key={f.id} onClick={() => { onPickSection("content"); setOpen(false); setQ(""); }}
                  className="w-full px-4 py-2 text-left text-sm transition-colors truncate" style={{ color: "var(--bt-text-2)" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>{f.message}</button>
              ))}
            </div>
          )}
          <div className="h-2" />
        </div>
      )}
    </div>
  );
}

/* ── Edit modal ────────────────────────────────────────────── */
function EditUserModal({ user, onClose, onSaved }) {
  const isCustomYear = user.study_year && !YEARS.includes(user.study_year);
  const [form, setForm] = useState({
    first_name: user.first_name || "", last_name: user.last_name || "",
    university: user.university || "", study_field: user.study_field || "",
    study_year: isCustomYear ? "Autre" : (user.study_year || ""),
    study_year_custom: isCustomYear ? user.study_year : "", bio: user.bio || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErr("");
    const actualYear = form.study_year === "Autre" ? (form.study_year_custom.trim() || "Autre") : form.study_year;
    const { error } = await supabase.from("profiles").update({
      first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null,
      university: form.university.trim() || null, study_field: form.study_field.trim() || null,
      study_year: actualYear || null, bio: form.bio.trim() || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved({ ...user, ...form, study_year: actualYear });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>Modifier @{user.pseudo}</h2>
        <form onSubmit={save} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1"><label className="label">Prénom</label><input className="input" value={form.first_name} onChange={e => set("first_name", e.target.value)} /></div>
            <div className="flex-1"><label className="label">Nom</label><input className="input" value={form.last_name} onChange={e => set("last_name", e.target.value)} /></div>
          </div>
          <div><label className="label">Université</label><UniPicker value={form.university} onChange={v => set("university", v)} placeholder="Rechercher une université…" /></div>
          <div className="flex gap-3">
            <div className="flex-1"><label className="label">Filière</label><input className="input" value={form.study_field} onChange={e => set("study_field", e.target.value)} /></div>
            <div className="flex-1"><label className="label">Année</label>
              <select className="input" value={form.study_year} onChange={e => { set("study_year", e.target.value); set("study_year_custom", ""); }}>
                <option value="">—</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {form.study_year === "Autre" && (
            <div><label className="label">Précise l&apos;année</label><input className="input" value={form.study_year_custom} onChange={e => set("study_year_custom", e.target.value)} /></div>
          )}
          <div><label className="label">Bio</label><textarea className="input" rows={2} maxLength={160} value={form.bio} onChange={e => set("bio", e.target.value)} /></div>
          {err && <p className="text-xs" style={{ color: "#DC2626" }}>{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Enregistrement…" : "Enregistrer"}</button>
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Envoyer un message (notification admin) ───────────────── */
function SendMessageModal({ user, adminId, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("private_messages").insert({
      sender_id: adminId, receiver_id: user.id, content: text.trim(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>Message à @{user.pseudo}</h2>
        <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>Envoyé comme message privé depuis ton compte admin.</p>
        {done ? (
          <p className="text-sm font-medium py-4 text-center" style={{ color: "var(--bt-accent-dark)" }}>Message envoyé ✓</p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <textarea className="input" rows={4} maxLength={1000} autoFocus value={text}
              onChange={e => setText(e.target.value)} placeholder="Ton message…" />
            {err && <p className="text-xs" style={{ color: "#DC2626" }}>{err}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !text.trim()} className="btn-primary flex-1">{busy ? "Envoi…" : "Envoyer"}</button>
              <button type="button" onClick={onClose} className="btn-ghost flex-1">Annuler</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Fiche utilisateur complète ────────────────────────────── */
function UserSheet({ user, userStat, isSelf, onClose, onEdit, onDelete, onMessage, onToggleLock }) {
  const [sessions, setSessions] = useState([]);
  const [heatSessions, setHeatSessions] = useState([]);
  const [badgeIds, setBadgeIds] = useState([]);
  const [friendCount, setFriendCount] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [levelInfo, setLevelInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const isOnline = isStudyingLive(user.studying_since);

  useEffect(() => {
    let on = true;
    async function load() {
      const yearAgo = new Date(Date.now() - 370 * 864e5).toISOString();
      const [recent, heat, badges, friends, refs, levelMap] = await Promise.all([
        supabase.from("sessions").select("duration_seconds, started_at, courses(name)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(8),
        supabase.from("sessions").select("started_at, duration_seconds").eq("user_id", user.id).gte("started_at", yearAgo),
        supabase.from("user_badges").select("badge_id").eq("user_id", user.id),
        supabase.from("friendships").select("id", { count: "exact", head: true }).or(`requester.eq.${user.id},addressee.eq.${user.id}`).eq("status", "accepted"),
        supabase.rpc("admin_get_referrals", { p_user_id: user.id }),
        loadUserLevelMap(supabase, [user.id], { selfUserId: user.id }),
      ]);
      if (!on) return;
      setSessions(recent.data || []);
      setHeatSessions(heat.data || []);
      setBadgeIds((badges.data || []).map(b => b.badge_id));
      setFriendCount(friends.count ?? 0);
      setReferrals(refs.data?.ok ? (refs.data.list || []) : []);
      setLevelInfo(levelMap[user.id] || null);
      setLoading(false);
    }
    load();
    return () => { on = false; };
  }, [user.id]);

  const lastActivity = userStat?.lastAt;
  async function toggleLock() {
    setLocking(true);
    await onToggleLock(user);
    setLocking(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-end sm:justify-center bg-black/45 sm:p-4" onClick={onClose}>
      <div className="card w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-4" style={{ borderBottom: "1px solid var(--bt-border)" }}>
          <div className="flex items-start gap-4">
            <Avatar url={user.avatar_url} pseudo={user.pseudo} size={64} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-lg" style={{ color: "var(--bt-text-1)" }}>@{user.pseudo}</span>
                {levelInfo && <LevelPill level={levelInfo.current.level} size="sm" solid />}
                {user.is_admin && <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>Admin</span>}
                {user.locked && <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>Suspendu</span>}
                {isOnline && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />En ligne</span>}
              </div>
              {displayName(user) !== user.pseudo && <p className="text-sm mt-0.5" style={{ color: "var(--bt-text-2)" }}>{displayName(user)}</p>}
              <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                {[user.study_field, user.study_year, user.university].filter(Boolean).join(" · ") || "Profil incomplet"}
              </p>
            </div>
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }}>✕</button>
          </div>
          {user.bio && <p className="text-sm italic mt-3 px-3 py-2 rounded-xl" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>« {user.bio} »</p>}
        </div>

        <div className="p-6 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: "Temps total", value: formatMinutesShort(userStat?.totalSecs || 0) },
              { label: "Sessions", value: userStat?.count ?? 0 },
              { label: "Amis", value: friendCount ?? "—" },
              { label: "Parrainages", value: referrals.length },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-3 text-center" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                <p className="text-lg font-num font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{s.value}</p>
                <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Meta line */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: "var(--bt-text-3)" }}>
            <span>Inscrit le <span style={{ color: "var(--bt-text-2)" }}>{new Date(user.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></span>
            <span>Dernière activité <span style={{ color: "var(--bt-text-2)" }}>{relDate(lastActivity)}</span></span>
            <span>Code parrain <span className="font-mono" style={{ color: "var(--bt-text-2)" }}>{user.referral_code || "—"}</span></span>
          </div>

          {/* Heatmap */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--bt-text-3)" }}>Assiduité (1 an)</p>
            {loading ? <LoadingScreen compact /> : <StudyHeatmap sessions={heatSessions} />}
          </div>

          {/* Badges */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--bt-text-3)" }}>Badges ({badgeIds.length}/{BADGES.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {BADGES.map(b => {
                const earned = badgeIds.includes(b.id);
                return (
                  <span key={b.id} title={b.id} style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: earned ? "var(--bt-accent-bg)" : "var(--bt-subtle)", border: `1px solid ${earned ? "var(--bt-accent-border)" : "var(--bt-border)"}`, opacity: earned ? 1 : 0.5 }}>
                    <BadgeIcon id={b.id} earned={earned} size={22} />
                  </span>
                );
              })}
            </div>
          </div>

          {/* Recent sessions */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--bt-text-3)" }}>Sessions récentes</p>
            {loading ? <LoadingScreen compact />
              : sessions.length === 0 ? <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Aucune session.</p>
              : (
                <div className="space-y-1">
                  {sessions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-xl" style={{ backgroundColor: "var(--bt-subtle)" }}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{s.courses?.name || "Session libre"}</p>
                        <p className="text-[10px]" style={{ color: "var(--bt-text-3)" }}>{new Date(s.started_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
                      </div>
                      <span className="text-xs font-semibold shrink-0 ml-2" style={{ color: "#14B885" }}>{formatMinutesShort(s.duration_seconds)}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 p-4 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--bt-border)", backgroundColor: "var(--bt-surface)" }}>
          <button onClick={onEdit} className="btn-primary flex-1 min-w-[100px]">Éditer</button>
          <button onClick={() => onMessage(user)} className="btn flex-1 min-w-[100px]" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", border: "1px solid var(--bt-border)" }}>Message</button>
          {!isSelf && !user.is_admin && (
            <button onClick={toggleLock} disabled={locking} className="btn flex-1 min-w-[100px]" style={{ backgroundColor: user.locked ? "var(--bt-accent-bg)" : "#FFF7ED", color: user.locked ? "#0E8F68" : "#C2410C", border: `1px solid ${user.locked ? "var(--bt-accent-border)" : "#FED7AA"}` }}>
              {locking ? "…" : user.locked ? "Réactiver" : "Suspendre"}
            </button>
          )}
          {!isSelf && !user.is_admin && (
            <button onClick={() => onDelete(user)} className="btn flex-1 min-w-[100px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FEE2E2" }}>Supprimer</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export default function Admin() {
  const { profile, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [section, setSection] = useState("overview");
  const [busy, setBusy] = useState(true);

  // Datasets
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [posts, setPosts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [badges, setBadges] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [referralCounts, setReferralCounts] = useState({});
  const [userStats, setUserStats] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [deletedAccounts, setDeletedAccounts] = useState([]);

  // Activity feed
  const [activity, setActivity] = useState([]);
  const [liveStatus, setLiveStatus] = useState("connecting"); // connecting | live | offline

  // Members controls
  const [search, setSearch] = useState("");
  const [filterUni, setFilterUni] = useState("");
  const [sortBy, setSortBy] = useState("created_at");

  // Analytics
  const [period, setPeriod] = useState(30);

  // Modals
  const [detailUser, setDetailUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [messageUser, setMessageUser] = useState(null);

  // Content sub-tab
  const [contentTab, setContentTab] = useState("announcements");
  const [annForm, setAnnForm] = useState({ title: "", message: "", type: "new", href: "" });
  const [annCreating, setAnnCreating] = useState(false);
  const [annError, setAnnError] = useState("");

  // Technical
  const [health, setHealth] = useState(null);
  const [egressGuard, setEgressGuard] = useState(null);
  const [egressLoading, setEgressLoading] = useState(false);
  const [egressError, setEgressError] = useState("");
  const [cleanupScan, setCleanupScan] = useState(null);
  const [cleanupSelected, setCleanupSelected] = useState(() => new Set());
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDeleting, setCleanupDeleting] = useState(false);
  const [cleanupError, setCleanupError] = useState("");
  const [cleanupResult, setCleanupResult] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || !profile.is_admin) router.replace("/dashboard");
  }, [loading, profile, router]);

  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);

  /* ── Initial load ──────────────────────────────────────── */
  const loadAll = useCallback(async () => {
    if (!profile || !profile.is_admin) return;
    const [uRes, sRes, pRes, mRes, bRes, fRes, refRes, annRes] = await Promise.all([
      supabase.from("profiles").select("id, pseudo, first_name, last_name, university, study_field, study_year, bio, avatar_url, created_at, is_admin, locked, studying_since, referral_code, bonus_xp").order("created_at", { ascending: false }),
      // Limite de sûreté : au-delà, agréger côté SQL (voir lib/adminAnalytics.js).
      supabase.from("sessions").select("user_id, duration_seconds, started_at").order("started_at", { ascending: false }).limit(8000),
      supabase.from("posts").select("id, user_id, created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("private_messages").select("id, sender_id, created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("user_badges").select("user_id, badge_id, earned_at").order("earned_at", { ascending: false }).limit(2000),
      supabase.from("app_feedback").select("id, user_id, type, message, status, created_at").order("created_at", { ascending: false }),
      supabase.rpc("admin_get_referral_counts"),
      supabase.from("app_announcements").select("*").order("created_at", { ascending: false }),
    ]);

    const allUsers = uRes.data || [];
    const allSessions = sRes.data || [];
    setUsers(allUsers);
    setSessions(allSessions);
    setPosts(pRes.data || []);
    setMessages(mRes.data || []);
    setBadges(bRes.data || []);
    setFeedback(fRes.data || []);
    setReferralCounts(refRes.data?.ok ? (refRes.data.counts || {}) : {});
    setAnnouncements(annRes.data || []);

    // Per-user stats (total secs, count, last session).
    const map = {};
    for (const s of allSessions) {
      const m = (map[s.user_id] ||= { totalSecs: 0, count: 0, lastAt: null });
      m.totalSecs += s.duration_seconds || 0;
      m.count += 1;
      if (!m.lastAt || s.started_at > m.lastAt) m.lastAt = s.started_at;
    }
    setUserStats(map);
    setBusy(false);
  }, [profile]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── Activity: backfill from loaded data ───────────────── */
  useEffect(() => {
    if (busy) return;
    const pseudoOf = id => usersById[id]?.pseudo || "un membre";
    const evs = [];
    users.slice(0, 30).forEach(u => evs.push({ id: `su-${u.id}`, kind: "signup", at: u.created_at, pseudo: u.pseudo, text: "a créé son compte" }));
    sessions.slice(0, 40).forEach((s, i) => evs.push({ id: `se-${s.user_id}-${i}`, kind: "session", at: s.started_at, pseudo: pseudoOf(s.user_id), text: "a étudié", value: formatMinutesShort(s.duration_seconds) }));
    posts.slice(0, 20).forEach(p => evs.push({ id: `po-${p.id}`, kind: "post", at: p.created_at, pseudo: pseudoOf(p.user_id), text: "a publié dans le feed" }));
    messages.slice(0, 20).forEach(m => evs.push({ id: `me-${m.id}`, kind: "message", at: m.created_at, pseudo: pseudoOf(m.sender_id), text: "a envoyé un message" }));
    badges.slice(0, 20).forEach((b, i) => evs.push({ id: `ba-${b.user_id}-${i}`, kind: "badge", at: b.earned_at, pseudo: pseudoOf(b.user_id), text: "a débloqué un badge" }));
    feedback.slice(0, 10).forEach(f => evs.push({ id: `fb-${f.id}`, kind: "feedback", at: f.created_at, pseudo: pseudoOf(f.user_id), text: "a envoyé une suggestion" }));
    evs.sort((a, b) => new Date(b.at) - new Date(a.at));
    setActivity(evs.slice(0, 60));
  }, [busy, users, sessions, posts, messages, badges, feedback, usersById]);

  /* ── Activity: realtime subscription ───────────────────── */
  useEffect(() => {
    if (!profile?.is_admin) return;
    const pseudoOf = id => usersById[id]?.pseudo || "un membre";
    const push = ev => setActivity(prev => [ev, ...prev].slice(0, 80));

    const ch = supabase.channel("admin-activity");
    let subscribed = false;
    ch
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, p => push({ id: `su-${p.new.id}-${Date.now()}`, kind: "signup", at: p.new.created_at || new Date().toISOString(), pseudo: p.new.pseudo || "un membre", text: "a créé son compte" }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, p => push({ id: `se-${p.new.id || Date.now()}`, kind: "session", at: p.new.started_at || new Date().toISOString(), pseudo: pseudoOf(p.new.user_id), text: "a étudié", value: p.new.duration_seconds ? formatMinutesShort(p.new.duration_seconds) : null }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, p => push({ id: `po-${p.new.id || Date.now()}`, kind: "post", at: p.new.created_at || new Date().toISOString(), pseudo: pseudoOf(p.new.user_id), text: "a publié dans le feed" }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, p => push({ id: `me-${p.new.id || Date.now()}`, kind: "message", at: p.new.created_at || new Date().toISOString(), pseudo: pseudoOf(p.new.sender_id), text: "a envoyé un message" }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_badges" }, p => push({ id: `ba-${p.new.id || Date.now()}`, kind: "badge", at: p.new.earned_at || new Date().toISOString(), pseudo: pseudoOf(p.new.user_id), text: "a débloqué un badge" }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_feedback" }, p => push({ id: `fb-${p.new.id || Date.now()}`, kind: "feedback", at: p.new.created_at || new Date().toISOString(), pseudo: pseudoOf(p.new.user_id), text: "a envoyé une suggestion" }))
      .subscribe(status => {
        if (status === "SUBSCRIBED") { subscribed = true; setLiveStatus("live"); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLiveStatus("offline");
      });
    // Si aucune confirmation après 4s (mode offline / realtime coupé), on l'indique.
    const to = setTimeout(() => { if (!subscribed) setLiveStatus("offline"); }, 4000);
    return () => { clearTimeout(to); supabase.removeChannel(ch); };
  }, [profile, usersById]);

  /* ── Technical health checks ───────────────────────────── */
  useEffect(() => {
    if (section !== "technical" || !profile?.is_admin) return;
    let cancelled = false;
    (async () => {
      // DB latency
      const t0 = performance.now();
      const { error: dbErr } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      const ms = Math.round(performance.now() - t0);
      const db = dbErr ? { status: "down", value: "Erreur", hint: dbErr.message } : { status: ms < 400 ? "ok" : ms < 1000 ? "warn" : "down", value: `${ms} ms`, hint: "Latence d'une requête de comptage" };

      // Realtime
      let rtResolved = false;
      const realtime = await new Promise(resolve => {
        const ch = supabase.channel("admin-health");
        const to = setTimeout(() => { if (!rtResolved) { rtResolved = true; supabase.removeChannel(ch); resolve({ status: "warn", value: "Lent/absent", hint: "Pas de confirmation sous 3 s" }); } }, 3000);
        ch.subscribe(st => {
          if (st === "SUBSCRIBED" && !rtResolved) { rtResolved = true; clearTimeout(to); supabase.removeChannel(ch); resolve({ status: "ok", value: "Connecté", hint: "Canal temps réel opérationnel" }); }
          else if ((st === "CHANNEL_ERROR" || st === "TIMED_OUT") && !rtResolved) { rtResolved = true; clearTimeout(to); supabase.removeChannel(ch); resolve({ status: "down", value: "Indisponible", hint: String(st) }); }
        });
      });

      const pushConfigured = !!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
      const push = pushConfigured ? { status: "ok", value: "Configuré", hint: "OneSignal App ID présent" } : { status: "warn", value: "Non configuré", hint: "NEXT_PUBLIC_ONESIGNAL_APP_ID manquant" };
      const auth = { status: "ok", value: "Session valide", hint: `Connecté en admin (@${profile.pseudo})` };
      const commit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
      const deploy = commit ? { status: "ok", value: commit.slice(0, 7), hint: "Dernier commit déployé (Vercel)" } : { status: "idle", value: "À configurer", hint: "Exposer NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA" };

      if (!cancelled) setHealth({ db, realtime, push, auth, deploy });
    })();
    return () => { cancelled = true; };
  }, [section, profile]);

  const loadEgressGuard = useCallback(async () => {
    if (!profile?.is_admin) return;
    setEgressLoading(true);
    setEgressError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Session admin introuvable.");

      const res = await fetch("/api/admin/egress-guard", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Impossible de charger Egress Guard.");
      setEgressGuard(body);
    } catch (err) {
      setEgressError(err?.message || "Impossible de charger Egress Guard.");
    } finally {
      setEgressLoading(false);
    }
  }, [profile?.is_admin]);

  useEffect(() => {
    if (section !== "technical" || !profile?.is_admin || egressGuard || egressLoading) return;
    loadEgressGuard();
  }, [section, profile?.is_admin, egressGuard, egressLoading, loadEgressGuard]);

  const loadStorageCleanup = useCallback(async () => {
    if (!profile?.is_admin) return;
    setCleanupLoading(true);
    setCleanupError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Session admin introuvable.");

      const res = await fetch("/api/admin/storage-cleanup", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Impossible de scanner Storage.");
      setCleanupScan(body);
      setCleanupSelected(new Set((body.candidates || []).filter((candidate) => candidate.safeDelete).map((candidate) => candidate.id)));
    } catch (err) {
      setCleanupError(err?.message || "Impossible de scanner Storage.");
    } finally {
      setCleanupLoading(false);
    }
  }, [profile?.is_admin]);

  function toggleCleanupCandidate(candidate) {
    if (!candidate?.safeDelete) return;
    setCleanupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });
  }

  const deleteSelectedCleanup = useCallback(async () => {
    if (!profile?.is_admin || !cleanupScan) return;
    const safeSelected = cleanupScan.candidates.filter((candidate) => candidate.safeDelete && cleanupSelected.has(candidate.id));
    const selectedBytes = safeSelected.reduce((sum, candidate) => sum + (candidate.sizeBytes || 0), 0);
    if (!safeSelected.length) return;
    const msg = t("admin.cleanupConfirm")
      .replace("{count}", String(safeSelected.length))
      .replace("{size}", formatBytes(selectedBytes));
    if (!confirm(msg)) return;

    setCleanupDeleting(true);
    setCleanupError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Session admin introuvable.");

      const res = await fetch("/api/admin/storage-cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: safeSelected.map((candidate) => candidate.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Suppression impossible.");
      setCleanupResult(body);
      await loadEgressGuard();
      await loadStorageCleanup();
    } catch (err) {
      setCleanupError(err?.message || "Suppression impossible.");
    } finally {
      setCleanupDeleting(false);
    }
  }, [cleanupScan, cleanupSelected, loadEgressGuard, loadStorageCleanup, profile?.is_admin, t]);

  const loadDeleted = useCallback(async () => {
    if (!profile?.is_admin) return;
    const { data } = await supabase.from("deleted_accounts").select("*").order("deleted_at", { ascending: false });
    setDeletedAccounts(data || []);
  }, [profile]);
  useEffect(() => { if (section === "content" && contentTab === "deleted") loadDeleted(); }, [section, contentTab, loadDeleted]);

  /* ── Actions ───────────────────────────────────────────── */
  async function deleteAccount(u) {
    if (u.id === profile.id) { alert("Tu ne peux pas supprimer ton propre compte."); return; }
    if (!confirm(`Supprimer définitivement le compte @${u.pseudo} et toutes ses données ?`)) return;
    const { error } = await supabase.rpc("admin_delete_user", { target: u.id });
    if (error) { alert("Échec : " + error.message); return; }
    setUsers(prev => prev.filter(x => x.id !== u.id));
    setDetailUser(null);
  }

  async function toggleLock(u) {
    const next = !u.locked;
    const { error } = await supabase.from("profiles").update({ locked: next }).eq("id", u.id);
    if (error) { alert("Échec : " + error.message); return; }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, locked: next } : x));
    setDetailUser(prev => prev && prev.id === u.id ? { ...prev, locked: next } : prev);
  }

  async function createAnnouncement(e) {
    e.preventDefault();
    const title = trimmedText(annForm.title, TEXT_LIMITS.announcementTitle);
    const message = trimmedText(annForm.message, TEXT_LIMITS.announcementMessage);
    const href = trimmedText(annForm.href, TEXT_LIMITS.announcementHref);
    if (!title || !message) { setAnnError(t("admin.annRequired")); return; }
    if (!isSafeInternalHref(href)) { setAnnError(t("security.invalidInternalLink")); return; }
    const action = clientRateLimit(`admin:announcement:${profile.id}`, 12, 60_000);
    if (!action.ok) { setAnnError(t("security.rateLimited")); return; }
    setAnnCreating(true); setAnnError("");
    const { error } = await supabase.from("app_announcements").insert({ title, message, type: annForm.type, href: href || null, is_active: true, created_by: profile.id });
    setAnnCreating(false);
    if (error) { setAnnError(error.message); return; }
    setAnnForm({ title: "", message: "", type: "new", href: "" });
    const { data } = await supabase.from("app_announcements").select("*").order("created_at", { ascending: false });
    setAnnouncements(data || []);
  }
  async function toggleAnnouncement(a) {
    const { error } = await supabase.from("app_announcements").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) { alert(error.message); return; }
    setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
  }
  async function deleteAnnouncement(a) {
    if (!confirm(t("admin.annDeleteConfirm"))) return;
    const { error } = await supabase.from("app_announcements").delete().eq("id", a.id);
    if (error) { alert(error.message); return; }
    setAnnouncements(prev => prev.filter(x => x.id !== a.id));
  }
  async function setFeedbackStatus(f, status) {
    const { error } = await supabase.from("app_feedback").update({ status }).eq("id", f.id);
    if (error) { alert(error.message); return; }
    setFeedback(prev => prev.map(x => x.id === f.id ? { ...x, status } : x));
  }

  /* ── Derived KPIs ──────────────────────────────────────── */
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 864e5).toISOString().slice(0, 10);
  const prevWeek = new Date(now - 14 * 864e5).toISOString().slice(0, 10);
  const monthAgo = new Date(now - 30 * 864e5).toISOString().slice(0, 10);
  const todayCount = users.filter(u => u.created_at.slice(0, 10) === todayStr).length;
  const weekCount = users.filter(u => u.created_at.slice(0, 10) >= weekAgo).length;
  const prevWeekCount = users.filter(u => u.created_at.slice(0, 10) >= prevWeek && u.created_at.slice(0, 10) < weekAgo).length;
  const monthCount = users.filter(u => u.created_at.slice(0, 10) >= monthAgo).length;
  const weekSignupDelta = prevWeekCount > 0 ? Math.round((weekCount - prevWeekCount) / prevWeekCount * 100) : null;
  const onlineNow = users.filter(u => isStudyingLive(u.studying_since)).length;

  const kpis = useMemo(() => activeUserKpis(sessions, now), [sessions, now]);
  const series = useMemo(() => buildTimeSeries({ users, sessions, posts, messages }, period, now), [users, sessions, posts, messages, period, now]);
  const ret = useMemo(() => retention(users, sessions, now), [users, sessions, now]);
  const uniDist = useMemo(() => usersByUniversity(users), [users]);
  const topUnis = useMemo(() => topActiveUniversities(users, sessions), [users, sessions]);
  const activation = useMemo(() => activationBreakdown(users, sessions, now), [users, sessions, now]);
  const sessionsToday = sessions.filter(s => s.started_at.slice(0, 10) === todayStr).length;
  const totalSecs30 = sessions.filter(s => s.started_at.slice(0, 10) >= monthAgo).reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const sessions30 = sessions.filter(s => s.started_at.slice(0, 10) >= monthAgo);
  const avgSecs = sessions30.length ? Math.round(totalSecs30 / sessions30.length) : 0;

  /* ── Members filtering ─────────────────────────────────── */
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = users
      .filter(u => !filterUni ? true : filterUni === "__autre__" ? !ALL_UNI_FULLS.has(u.university || "") : u.university === filterUni)
      .filter(u => !q || u.pseudo?.toLowerCase().includes(q) || u.first_name?.toLowerCase().includes(q) || u.last_name?.toLowerCase().includes(q) || u.university?.toLowerCase().includes(q));
    return [...base].sort((a, b) => {
      if (sortBy === "university") return (a.university || "").localeCompare(b.university || "", "fr");
      if (sortBy === "last_name") return (a.last_name || "").localeCompare(b.last_name || "", "fr");
      if (sortBy === "last_session") return (userStats[b.id]?.lastAt || "").localeCompare(userStats[a.id]?.lastAt || "");
      if (sortBy === "study_time") return (userStats[b.id]?.totalSecs || 0) - (userStats[a.id]?.totalSecs || 0);
      if (sortBy === "referrals") return (referralCounts[b.id] || 0) - (referralCounts[a.id] || 0);
      return 0;
    });
  }, [users, filterUni, q, sortBy, userStats, referralCounts]);

  // Garde admin — placée APRÈS tous les hooks pour garder leur ordre stable
  // (sinon "Rendered more hooks than during the previous render").
  if (loading || !profile) return null;
  if (!profile.is_admin) return null;

  return (
    <Layout>
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={u => { setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...u } : x)); setDetailUser(prev => prev && prev.id === u.id ? { ...prev, ...u } : prev); setEditingUser(null); }} />}
      {messageUser && <SendMessageModal user={messageUser} adminId={profile.id} onClose={() => setMessageUser(null)} />}
      {detailUser && (
        <UserSheet
          user={detailUser} userStat={userStats[detailUser.id]} isSelf={detailUser.id === profile.id}
          onClose={() => setDetailUser(null)}
          onEdit={() => { setEditingUser(detailUser); }}
          onDelete={deleteAccount}
          onMessage={u => setMessageUser(u)}
          onToggleLock={toggleLock}
        />
      )}

      <div className="max-w-[1280px] mx-auto">
        {/* ══ Cockpit header ══ */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-display" style={{ color: "var(--bt-text-1)" }}>Cockpit</h1>
            <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Pilotage de Blocus Tracker · réservé aux admins</p>
          </div>
          <GlobalSearch users={users} announcements={announcements} feedback={feedback}
            onPickUser={u => setDetailUser(u)} onPickSection={s => setSection(s)} />
        </div>

        {/* ══ Section nav ══ */}
        <div className="flex gap-1 mb-6 p-1 rounded-2xl overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ backgroundColor: "var(--bt-subtle)", scrollbarWidth: "none" }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap"
              style={section === s.id ? { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)", boxShadow: "0 1px 4px var(--bt-shadow)" } : { color: "var(--bt-text-2)" }}>
              {s.label}
            </button>
          ))}
        </div>

        {busy ? (
          <LoadingScreen />
        ) : (
          <>
            {/* ═══════════ OVERVIEW ═══════════ */}
            {section === "overview" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard label="Membres" value={users.length} accent={C.green} />
                  <StatCard label="En ligne" value={onlineNow} dot={onlineNow > 0} />
                  <StatCard label="Nouveaux (7j)" value={`+${weekCount}`} delta={deltaLabel(weekSignupDelta)} sub={`+${todayCount} aujourd'hui`} />
                  <StatCard label="DAU" value={kpis.dau} accent={C.blue} sub="actifs aujourd'hui" />
                  <StatCard label="WAU" value={kpis.wau} sub="actifs 7 jours" />
                  <StatCard label="MAU" value={kpis.mau} sub="actifs 30 jours" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard label="Sessions auj." value={sessionsToday} />
                  <StatCard label="Temps 30j" value={formatMinutesShort(totalSecs30)} />
                  <StatCard label="Durée moy." value={formatMinutesShort(avgSecs)} />
                  <StatCard label="Activés" value={`${activation.total ? Math.round(activation.active / activation.total * 100) : 0}%`} sub={`${activation.active} actifs 30j`} />
                  <StatCard label="Dormants" value={activation.dormant} sub="inactifs 30j" />
                  <StatCard label="Jamais actifs" value={activation.never} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <ChartCard className="lg:col-span-2" title="Utilisateurs actifs vs inscrits" subtitle={`${period} derniers jours`}
                    right={<PeriodPicker period={period} setPeriod={setPeriod} />}>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="registered" name="Inscrits (cumul)" stroke={C.violet} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="dau" name="Actifs / jour" stroke={C.green} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Activité en direct" subtitle={liveStatus === "live" ? "Temps réel connecté" : liveStatus === "offline" ? "Temps réel indisponible" : "Connexion…"}
                    right={<span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: liveStatus === "live" ? "#0E8F68" : "var(--bt-text-3)" }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: liveStatus === "live" ? "#22c55e" : "#94908B", animation: liveStatus === "live" ? "pulse 1.5s infinite" : "none" }} />{liveStatus === "live" ? "LIVE" : "—"}</span>}>
                    <div className="-mx-5 -mb-5 max-h-[220px] overflow-y-auto">
                      {activity.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: "var(--bt-text-3)" }}>En attente d'activité…</p>
                        : activity.slice(0, 12).map(ev => <ActivityRow key={ev.id} ev={ev} />)}
                    </div>
                  </ChartCard>
                </div>
              </div>
            )}

            {/* ═══════════ ANALYTICS ═══════════ */}
            {section === "analytics" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="grid grid-cols-3 gap-3 flex-1 min-w-[240px] max-w-md">
                    <StatCard label="DAU" value={kpis.dau} accent={C.green} />
                    <StatCard label="WAU" value={kpis.wau} accent={C.blue} />
                    <StatCard label="MAU" value={kpis.mau} accent={C.violet} />
                  </div>
                  <PeriodPicker period={period} setPeriod={setPeriod} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <ChartCard title="Nouveaux utilisateurs" subtitle={`${monthCount} sur 30 j · ${weekCount} sur 7 j`}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="signups" name="Inscriptions" fill={C.green} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Progression des inscriptions" subtitle="Cumul de comptes créés">
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                        <defs><linearGradient id="gReg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.violet} stopOpacity={0.35} /><stop offset="100%" stopColor={C.violet} stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="registered" name="Inscrits" stroke={C.violet} strokeWidth={2} fill="url(#gReg)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Heures d'étude par jour" subtitle={`${formatMinutesShort(totalSecs30)} sur 30 j`}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip unit="h" />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="studyHours" name="Heures" fill={C.blue} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Sessions créées par jour" subtitle="Volume de sessions">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="sessions" name="Sessions" fill={C.teal} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Temps moyen par session" subtitle={`Moyenne actuelle ${formatMinutesShort(avgSecs)}`}>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip unit="min" />} />
                        <Line type="monotone" dataKey="avgSession" name="Durée moy." stroke={C.amber} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Rétention" subtitle="Revient après N jours (comptes éligibles)">
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      {[["J1", ret.j1], ["J7", ret.j7], ["J30", ret.j30]].map(([label, r]) => (
                        <div key={label} className="text-center">
                          <div className="relative mx-auto mb-2" style={{ width: 76, height: 76 }}>
                            <svg viewBox="0 0 36 36" width="76" height="76">
                              <path d="M18 2a16 16 0 1 1 0 32 16 16 0 1 1 0-32" fill="none" stroke={GRID} strokeWidth="3.5" />
                              <path d="M18 2a16 16 0 1 1 0 32 16 16 0 1 1 0-32" fill="none" stroke={C.green} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(r.pct || 0)}, 100`} />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="font-num font-bold tabular-nums text-sm" style={{ color: "var(--bt-text-1)" }}>{r.pct == null ? "—" : `${r.pct}%`}</span>
                            </div>
                          </div>
                          <p className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>{label}</p>
                          <p className="text-[10px]" style={{ color: "var(--bt-text-4)" }}>{r.eligible} éligibles</p>
                        </div>
                      ))}
                    </div>
                  </ChartCard>

                  <ChartCard title="Publications Feed par jour" subtitle="Activité sociale">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="posts" name="Posts" fill={C.violet} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Messages envoyés par jour" subtitle="Messagerie privée">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} interval={Math.floor(series.length / 8)} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="messages" name="Messages" fill={C.amber} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Répartition par université" subtitle={`${uniDist.length} établissements`}>
                    <ResponsiveContainer width="100%" height={Math.max(180, uniDist.length * 26)}>
                      <BarChart data={uniDist} layout="vertical" margin={{ top: 0, right: 28, left: 4, bottom: 0 }} barCategoryGap="26%">
                        <CartesianGrid stroke={GRID} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="count" name="Membres" fill={C.green} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: AXIS }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Universités les plus actives" subtitle="Heures d'étude cumulées">
                    <ResponsiveContainer width="100%" height={Math.max(180, topUnis.length * 26)}>
                      <BarChart data={topUnis} layout="vertical" margin={{ top: 0, right: 28, left: 4, bottom: 0 }} barCategoryGap="26%">
                        <CartesianGrid stroke={GRID} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip unit="h" />} cursor={{ fill: "rgba(148,144,139,0.08)" }} />
                        <Bar dataKey="hours" name="Heures" fill={C.blue} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: AXIS }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Statut d'activation" subtitle="Répartition des membres">
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="55%" height={180}>
                        <PieChart>
                          <Pie data={[{ name: "Actifs 30j", value: activation.active }, { name: "Dormants", value: activation.dormant }, { name: "Jamais actifs", value: activation.never }]} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                            {[C.green, C.amber, "#94908B"].map((col, i) => <Cell key={i} fill={col} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {[["Actifs 30j", activation.active, C.green], ["Dormants", activation.dormant, C.amber], ["Jamais actifs", activation.never, "#94908B"]].map(([label, val, col]) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: col }} />
                            <span className="text-xs flex-1" style={{ color: "var(--bt-text-2)" }}>{label}</span>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ChartCard>

                  <ChartCard title="Répartition mobile / desktop" subtitle="Nécessite une instrumentation">
                    <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
                      <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="14" height="11" rx="1" /><path d="M2 17h14M17 8h5v11a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z" /></svg>
                      </span>
                      <p className="text-sm max-w-[260px]" style={{ color: "var(--bt-text-3)" }}>
                        Non suivi actuellement. Nécessite d'enregistrer la plateforme (colonne <span className="font-mono text-xs">device</span>) à la connexion ou par session.
                      </p>
                    </div>
                  </ChartCard>
                </div>
              </div>
            )}

            {/* ═══════════ ACTIVITY ═══════════ */}
            {section === "activity" && (
              <ChartCard title="Flux d'activité" subtitle="Comptes, sessions, posts, messages, badges, suggestions"
                right={<span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: liveStatus === "live" ? "#0E8F68" : "var(--bt-text-3)" }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: liveStatus === "live" ? "#22c55e" : "#94908B" }} />{liveStatus === "live" ? "Temps réel" : liveStatus === "offline" ? "Hors ligne" : "Connexion…"}</span>}>
                <div className="-mx-5 -mb-5 max-h-[70vh] overflow-y-auto">
                  {activity.length === 0 ? <p className="px-5 py-8 text-sm" style={{ color: "var(--bt-text-3)" }}>En attente d'activité…</p>
                    : activity.map(ev => <ActivityRow key={ev.id} ev={ev} />)}
                </div>
              </ChartCard>
            )}

            {/* ═══════════ MEMBERS ═══════════ */}
            {section === "members" && (
              <section className="card p-5">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>Membres <span className="text-sm font-normal" style={{ color: "var(--bt-text-3)" }}>({filtered.length})</span></h2>
                  <div className="flex gap-2 flex-wrap">
                    <input className="input w-36" placeholder="Filtrer…" value={search} onChange={e => setSearch(e.target.value)} />
                    <select className="input w-44" value={filterUni} onChange={e => setFilterUni(e.target.value)}>
                      <option value="">Toutes les unifs</option>
                      {COUNTRIES.map(country => (
                        <optgroup key={country.code} label={country.name.replace(/\s*[^\w\s].*/, "").trim()}>
                          {country.universities.map(u => <option key={u.id} value={u.full}>{u.name}</option>)}
                        </optgroup>
                      ))}
                      <option value="__autre__">Autre</option>
                    </select>
                    <select className="input w-44" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                      <option value="created_at">Inscription (récent)</option>
                      <option value="last_session">Dernière session</option>
                      <option value="study_time">Temps d'étude</option>
                      <option value="referrals">Parrainages</option>
                      <option value="university">Université</option>
                      <option value="last_name">Nom</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--bt-border)" }}>
                        {[
                          { label: "Membre", cls: "" }, { label: "Université", cls: "" },
                          { label: "Inscrit", cls: "hidden md:table-cell" }, { label: "Dernière session", cls: "" },
                          { label: "Temps", cls: "hidden lg:table-cell" }, { label: "Parrain.", cls: "hidden sm:table-cell" }, { label: "", cls: "" },
                        ].map(h => <th key={h.label} className={`pb-3 text-left font-semibold ${h.cls}`} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-text-3)", paddingRight: 12 }}>{h.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => {
                        const stat = userStats[u.id];
                        return (
                          <tr key={u.id} className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--bt-subtle)" }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                            onClick={() => setDetailUser(u)}>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar url={u.avatar_url} pseudo={u.pseudo} size={30} />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold truncate" style={{ color: "var(--bt-text-1)" }}>@{u.pseudo}</span>
                                    {isStudyingLive(u.studying_since) && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: "#22c55e" }} />}
                                    {u.is_admin && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>A</span>}
                                    {u.locked && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>⏸</span>}
                                  </div>
                                  {displayName(u) !== u.pseudo && <span className="text-[11px] truncate block" style={{ color: "var(--bt-text-3)" }}>{displayName(u)}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 max-w-[120px] truncate text-xs" style={{ color: "var(--bt-text-2)" }}>{u.university ? (Object.values(COMMUNITY_BY_ID).find(m => m.full === u.university)?.name || u.university.split(" ")[0]) : "—"}</td>
                            <td className="py-2.5 pr-3 whitespace-nowrap text-xs hidden md:table-cell" style={{ color: "var(--bt-text-3)" }}>{new Date(u.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}</td>
                            <td className="py-2.5 pr-3 text-xs whitespace-nowrap" style={{ color: stat?.lastAt ? "var(--bt-text-2)" : "var(--bt-text-4)" }}>{relDate(stat?.lastAt)}</td>
                            <td className="py-2.5 pr-3 text-xs hidden lg:table-cell" style={{ color: stat?.totalSecs ? "var(--bt-text-2)" : "var(--bt-text-4)" }}>{stat?.totalSecs ? formatMinutesShort(stat.totalSecs) : "—"}</td>
                            <td className="py-2.5 pr-3 text-xs hidden sm:table-cell">{referralCounts[u.id] ? <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>{referralCounts[u.id]}</span> : <span style={{ color: "var(--bt-text-4)" }}>—</span>}</td>
                            <td className="py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              <button onClick={() => setDetailUser(u)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>Ouvrir</button>
                            </td>
                          </tr>
                        );
                      })}
                      {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>Aucun résultat.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ═══════════ TECHNICAL ═══════════ */}
            {section === "technical" && (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--bt-text-3)" }}>Vérifiés automatiquement</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {health ? (
                      <>
                        <HealthPill label="Base de données" value={health.db.value} status={health.db.status} hint={health.db.hint} />
                        <HealthPill label="Temps réel" value={health.realtime.value} status={health.realtime.status} hint={health.realtime.hint} />
                        <HealthPill label="Notifications push" value={health.push.value} status={health.push.status} hint={health.push.hint} />
                        <HealthPill label="Authentification" value={health.auth.value} status={health.auth.status} hint={health.auth.hint} />
                      </>
                    ) : <p className="text-sm col-span-full" style={{ color: "var(--bt-text-3)" }}>Vérification en cours…</p>}
                  </div>
                </div>
                <EgressGuardPanel
                  data={egressGuard}
                  loading={egressLoading}
                  error={egressError}
                  onRefresh={loadEgressGuard}
                  t={t}
                />
                <StorageCleanupPanel
                  data={cleanupScan}
                  selectedIds={cleanupSelected}
                  loading={cleanupLoading}
                  deleting={cleanupDeleting}
                  error={cleanupError}
                  result={cleanupResult}
                  onScan={loadStorageCleanup}
                  onDelete={deleteSelectedCleanup}
                  onToggle={toggleCleanupCandidate}
                  t={t}
                />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--bt-text-3)" }}>Nécessite l'API Management Supabase</p>
                  <p className="text-xs mb-3" style={{ color: "var(--bt-text-4)" }}>Ces métriques ne sont pas exposées côté client. Elles demandent un endpoint serveur (clé Management Supabase / Vercel) — affichées ici en attente de branchement pour éviter des chiffres inventés.</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <HealthPill label="Stockage" value="À brancher" status="idle" hint="Storage : espace utilisé / quota" />
                    <HealthPill label="Egress / Bande passante" value="À brancher" status="idle" hint="Transfert sortant mensuel" />
                    <HealthPill label="Emails (SMTP)" value="À brancher" status="idle" hint="Envois Resend / quota" />
                    <HealthPill label="Dernière sauvegarde" value="À brancher" status="idle" hint="Backups Supabase" />
                    <HealthPill label="Dernier déploiement" value={health?.deploy?.value || "…"} status={health?.deploy?.status || "idle"} hint={health?.deploy?.hint || "Vercel"} />
                  </div>
                </div>
                <div className="card p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--bt-text-3)" }}>Volumétrie (données chargées)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Profils" value={users.length} />
                    <StatCard label="Sessions" value={sessions.length} sub={sessions.length >= 8000 ? "limite atteinte" : undefined} />
                    <StatCard label="Posts" value={posts.length} />
                    <StatCard label="Messages" value={messages.length} />
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ CONTENT ═══════════ */}
            {section === "content" && (
              <div className="space-y-5">
                <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ backgroundColor: "var(--bt-subtle)" }}>
                  {[["announcements", `Annonces (${announcements.length})`], ["suggestions", `Suggestions (${feedback.length})`], ["deleted", `Supprimés (${deletedAccounts.length})`]].map(([id, label]) => (
                    <button key={id} onClick={() => setContentTab(id)} className="px-4 py-1.5 rounded-xl text-sm font-medium transition-all" style={contentTab === id ? { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)", boxShadow: "0 1px 4px var(--bt-shadow)" } : { color: "var(--bt-text-2)" }}>{label}</button>
                  ))}
                </div>

                {contentTab === "announcements" && (
                  <section className="card p-5">
                    <form onSubmit={createAnnouncement} className="space-y-3 mb-6 pb-6" style={{ borderBottom: "1px solid var(--bt-border)" }}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--bt-text-3)" }}>{t("admin.annFormTitle")}</p>
                      <div><label className="label">{t("admin.annTitleLabel")}</label><input className="input" maxLength={120} value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder={t("admin.annTitlePlaceholder")} /></div>
                      <div><label className="label">{t("admin.annMessageLabel")}</label><textarea className="input" rows={2} maxLength={500} value={annForm.message} onChange={e => setAnnForm(f => ({ ...f, message: e.target.value }))} placeholder={t("admin.annMessagePlaceholder")} /></div>
                      <div className="flex gap-3 flex-wrap">
                        <div className="flex-1 min-w-[140px]"><label className="label">{t("admin.annTypeLabel")}</label>
                          <select className="input" value={annForm.type} onChange={e => setAnnForm(f => ({ ...f, type: e.target.value }))}><option value="new">{t("ann.typeNew")}</option><option value="info">{t("ann.typeInfo")}</option><option value="important">{t("ann.typeImportant")}</option></select>
                        </div>
                        <div className="flex-1 min-w-[140px]"><label className="label">{t("admin.annHrefLabel")}</label><input className="input" maxLength={300} value={annForm.href} onChange={e => setAnnForm(f => ({ ...f, href: e.target.value }))} placeholder={t("admin.annHrefPlaceholder")} /></div>
                      </div>
                      {annError && <p className="text-xs" style={{ color: "#DC2626" }}>{annError}</p>}
                      <button type="submit" disabled={annCreating} className="btn-primary">{annCreating ? t("admin.annCreating") : t("admin.annCreate")}</button>
                    </form>
                    {announcements.length === 0 ? <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("admin.annEmpty")}</p> : (
                      <ul className="space-y-2">
                        {announcements.map(a => {
                          const ts = { new: { bg: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", label: t("ann.typeNew") }, info: { bg: "rgba(3,105,161,0.14)", color: "#0369a1", label: t("ann.typeInfo") }, important: { bg: "rgba(220,38,38,0.14)", color: "#DC2626", label: t("ann.typeImportant") } }[a.type] || { bg: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", label: a.type };
                          return (
                            <li key={a.id} className="rounded-xl p-3 flex items-start gap-3" style={{ backgroundColor: "var(--bt-subtle)", opacity: a.is_active ? 1 : 0.55 }}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ backgroundColor: ts.bg, color: ts.color }}>{ts.label}</span>
                                  <span className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{a.title}</span>
                                  {!a.is_active && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--bt-border)", color: "var(--bt-text-3)" }}>{t("admin.annInactive")}</span>}
                                </div>
                                <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{a.message}</p>
                                <p className="text-[10px] mt-1" style={{ color: "var(--bt-text-4)" }}>{new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                              </div>
                              <div className="flex flex-col gap-1.5 shrink-0">
                                <button onClick={() => toggleAnnouncement(a)} className="text-xs px-2.5 py-1 rounded-lg font-medium whitespace-nowrap" style={{ backgroundColor: a.is_active ? "var(--bt-border)" : "var(--bt-accent-bg)", color: a.is_active ? "var(--bt-text-2)" : "#0E8F68" }}>{a.is_active ? t("admin.annDeactivate") : t("admin.annActivate")}</button>
                                <button onClick={() => deleteAnnouncement(a)} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>{t("admin.annDelete")}</button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}

                {contentTab === "suggestions" && (
                  <section className="card p-5">
                    <h2 className="text-base font-semibold mb-4" style={{ color: "var(--bt-text-1)" }}>Suggestions <span className="text-sm font-normal" style={{ color: "var(--bt-text-3)" }}>({feedback.length})</span></h2>
                    {feedback.length === 0 ? <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Aucune suggestion.</p> : (
                      <ul className="space-y-2">
                        {feedback.map(f => {
                          const sc = { new: { bg: "var(--bt-accent-bg)", color: "#0E8F68", label: "Nouveau" }, read: { bg: "rgba(3,105,161,0.14)", color: "#0369a1", label: "Lu" }, done: { bg: "var(--bt-border)", color: "var(--bt-text-3)", label: "Traité" } }[f.status] || { bg: "var(--bt-subtle)", color: "var(--bt-text-3)", label: f.status };
                          return (
                            <li key={f.id} className="rounded-xl p-3" style={{ backgroundColor: "var(--bt-subtle)" }}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--bt-text-4)" }}>{f.type} · @{usersById[f.user_id]?.pseudo || "?"}</span>
                                  </div>
                                  <p className="text-sm" style={{ color: "var(--bt-text-1)" }}>{f.message}</p>
                                  <p className="text-[10px] mt-1" style={{ color: "var(--bt-text-4)" }}>{new Date(f.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  {["new", "read", "done"].filter(s => s !== f.status).map(s => (
                                    <button key={s} onClick={() => setFeedbackStatus(f, s)} className="text-[11px] px-2 py-1 rounded-lg font-medium whitespace-nowrap" style={{ backgroundColor: "var(--bt-surface)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>{s === "new" ? "Nouveau" : s === "read" ? "Lu" : "Traité"}</button>
                                  ))}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}

                {contentTab === "deleted" && (
                  <section className="card p-5">
                    <h2 className="text-base font-semibold mb-4" style={{ color: "var(--bt-text-1)" }}>Comptes supprimés <span className="text-sm font-normal" style={{ color: "var(--bt-text-3)" }}>({deletedAccounts.length})</span></h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr style={{ borderBottom: "1px solid var(--bt-border)" }}>{["Pseudo", "Nom", "Université", "Supprimé le"].map(h => <th key={h} className="pb-3 text-left" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-text-3)", paddingRight: 12 }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {deletedAccounts.map(da => (
                            <tr key={da.id} style={{ borderBottom: "1px solid var(--bt-subtle)" }}>
                              <td className="py-3 pr-3 font-semibold" style={{ color: "var(--bt-text-1)" }}>@{da.pseudo || "—"}</td>
                              <td className="py-3 pr-3" style={{ color: "var(--bt-text-2)" }}>{[da.first_name, da.last_name].filter(Boolean).join(" ") || "—"}</td>
                              <td className="py-3 pr-3 max-w-[130px] truncate" style={{ color: "var(--bt-text-2)" }}>{da.university || "—"}</td>
                              <td className="py-3 pr-3 whitespace-nowrap text-xs" style={{ color: "var(--bt-text-3)" }}>{new Date(da.deleted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</td>
                            </tr>
                          ))}
                          {deletedAccounts.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>Aucun compte supprimé.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

/* ── Period selector ───────────────────────────────────────── */
function PeriodPicker({ period, setPeriod }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
      {[[7, "7j"], [30, "30j"], [90, "90j"]].map(([v, label]) => (
        <button key={v} onClick={() => setPeriod(v)} className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors" style={period === v ? { backgroundColor: "#14B885", color: "#fff" } : { color: "var(--bt-text-3)" }}>{label}</button>
      ))}
    </div>
  );
}
