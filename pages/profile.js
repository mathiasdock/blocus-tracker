import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import UniPicker from "../components/UniPicker";
import StudyHeatmap from "../components/StudyHeatmap";
import PushNotificationsCard from "../components/PushNotificationsCard";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatMinutesShort, computeStreak, computeBestStreak, todayISO } from "../lib/format";
import { BADGES, computeEarnedBadgeIds } from "../lib/badges";
import { computeTotalXP, getLevelInfo, getDailyMissionDefs, evaluateMissions } from "../lib/xp";
import BadgeIcon from "../components/BadgeIcon";
import { optimizeAvatarImage } from "../lib/imageCompression";

// ── Dark mode ────────────────────────────────────────────────
function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("bt_dark", next);
    document.documentElement.classList.toggle("dark", next);
  }
  return { dark, toggle };
}

// ── Constants ────────────────────────────────────────────────
const YEARS = [
  "BAC 1", "BAC 2", "BAC 3",
  "Année préparatoire", "Année passerelle",
  "Master 1", "Master 2",
  "Année de spécialisation", "Certificat / formation courte",
  "Doctorat", "Formation continue", "Autre",
];

// ── Icons ────────────────────────────────────────────────────
function IconGlobe() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>; }
function IconMoon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function IconSun() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }
function IconSmartphone() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>; }
function IconInfo() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function IconFeedback() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 12h5"/></svg>; }
function IconShield({ color }) { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function IconLogOut() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IconTrash() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
function IconCamera() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>; }
function IconMail() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>; }
function IconActivity() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function IconUser() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IconChevronDown({ open }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>; }
function IconChevronRight() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.35 }}><polyline points="9 18 15 12 9 6"/></svg>; }
function IconLock() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function IconAlert() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }

// Rangée de réglage unifiée. Trois affordances distinctes et coherentes :
//  • onClick + right=<IconChevronDown> → se deplie sur place (accordeon)
//  • href + right=<IconChevronRight>  → mene a une autre page
//  • right=<controle>                 → s'ajuste sur place (toggle/segmented)
function SettingsRow({ icon, label, description, right, onClick, href, danger, accent }) {
  const labelColor = danger ? "#DC2626" : accent ? "var(--bt-accent-dark)" : "var(--bt-text-1)";
  const iconColor  = danger ? "#DC2626" : accent ? "var(--bt-accent-dark)" : "var(--bt-text-2)";
  const iconBg     = danger ? "rgba(220,38,38,0.10)" : accent ? "var(--bt-accent-bg)" : "var(--bt-subtle)";
  const inner = (
    <div className="flex items-center justify-between px-5 py-3.5 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <IconBox color={iconColor} bg={iconBg}>{icon}</IconBox>
        <div className="min-w-0">
          <span className="block text-sm font-medium truncate" style={{ color: labelColor }}>{label}</span>
          {description && <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--bt-text-3)" }}>{description}</span>}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
  const hoverBg = danger ? "#FEF2F2" : "var(--bt-subtle)";
  if (href) return (
    <Link href={href} className="block transition-colors"
      onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBg}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>{inner}</Link>
  );
  if (onClick) return (
    <button onClick={onClick} className="w-full text-left transition-colors"
      onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBg}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>{inner}</button>
  );
  return inner;
}

// ── Helpers ──────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>{children}</p>;
}
function IconBox({ color, bg, children }) {
  return <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: bg || "var(--bt-subtle)", color: color || "var(--bt-text-2)" }}>{children}</span>;
}
// ── XP Progression card ──────────────────────────────────────
function XPProgressCard({ levelInfo, streak, profileTotalSecs, earnedBadgeIds, missions, onBadgeClick, t }) {
  const { current, next, progressXP, rangeXP, progressPct, totalXP } = levelInfo;
  return (
    <div id="xp-card" className="card-ink bt-grain">
      <div className="relative z-10" style={{ padding: 20 }}>

        {/* Card title */}
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-ink-muted)", marginBottom: 14 }}>
          {t("xp.cardTitle")}
        </p>

        {/* Level badge + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 4px 20px rgba(20,184,133,0.50)", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.70)", lineHeight: 1 }}>{t("xp.level")}</span>
            <span className="font-num tabular-nums" style={{ fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{current.level}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "var(--bt-ink-text)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>{t(current.titleKey)}</p>
            <p className="tabular-nums" style={{ fontSize: 12, color: "var(--bt-ink-muted)", marginTop: 2 }}>{totalXP} {t("xp.xpLabel")}</p>
          </div>
        </div>

        {/* XP progress bar */}
        <div style={{ marginBottom: 18 }}>
          <div className="tabular-nums" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--bt-ink-muted)", marginBottom: 6 }}>
            <span>{next ? `${progressXP} / ${rangeXP} XP` : t("xp.maxLevel")}</span>
            {next && <span>{t("xp.nextLevel")} : {t(next.titleKey)}</span>}
          </div>
          <div style={{ height: 10, borderRadius: 99, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.14)" }}>
            <div style={{ height: "100%", borderRadius: 99, width: `${progressPct}%`, background: "linear-gradient(90deg, #0EA571 0%, #14B885 55%, #22E4A4 100%)", boxShadow: "0 0 10px rgba(20,184,133,0.70)", transition: "width 0.6s ease" }} />
          </div>
        </div>

        {/* Daily missions */}
        <div style={{ borderTop: "1px solid var(--bt-ink-border)", paddingTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-ink-muted)", marginBottom: 10 }}>
            {t("xp.missions")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {missions.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={m.done ? "bt-check-pop" : ""} style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: m.done ? "#14B885" : "rgba(255,255,255,0.14)" }}>
                  {m.done ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", display: "block", backgroundColor: "rgba(255,255,255,0.30)" }} />
                  )}
                </span>
                <span style={{ fontSize: 13, flex: 1, color: m.done ? "var(--bt-ink-text)" : "var(--bt-ink-muted)", textDecoration: m.done ? "line-through" : "none" }}>
                  {t(m.key)}
                </span>
                <span className="font-num tabular-nums" style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: "#22E4A4" }}>+{m.xp} XP</span>
              </div>
            ))}
          </div>
        </div>

        {/* Badges — clickable */}
        <div style={{ borderTop: "1px solid var(--bt-ink-border)", paddingTop: 14, marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-ink-muted)", marginBottom: 10 }}>
            {t("badge.title")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BADGES.map(b => {
              const earned = earnedBadgeIds.includes(b.id);
              return (
                <button key={b.id} onClick={() => onBadgeClick(b)}
                  title={t(b.labelKey)}
                  className="bt-press"
                  style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", backgroundColor: earned ? "rgba(20,184,133,0.18)" : "rgba(255,255,255,0.04)", border: earned ? "1px solid rgba(20,184,133,0.40)" : "1px solid rgba(255,255,255,0.08)", transition: "background-color 0.15s, transform 0.12s, border-color 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.10)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
                  <BadgeIcon id={b.id} earned={earned} size={28} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Referral / Parrainage card ───────────────────────────────
function ReferralCard({ t }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_referral_stats");
      if (!mounted) return;
      if (!error && data && data.ok) setStats(data);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const siteOrigin = "https://www.blocus-tracker.com";
  const code = stats?.code || "";
  const shareLink = code ? `${siteOrigin.replace(/\/$/, "")}/signup?ref=${code}` : "";

  async function copy() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  async function share() {
    if (!shareLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("referral.shareTitle"),
          text: t("referral.shareText"),
          url: shareLink,
        });
      } catch (_) {}
    } else {
      copy();
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>…</p>
      </div>
    );
  }

  const count = stats?.count || 0;
  const list = stats?.list || [];

  return (
    <div className="card overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <IconBox color="#14B885" bg="rgba(20,184,133,0.12)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </IconBox>
          <div className="min-w-0">
            <SectionLabel>{t("referral.title")}</SectionLabel>
            <p className="text-sm mt-0.5" style={{ color: "var(--bt-text-2)" }}>
              {t("referral.subtitle")}
            </p>
          </div>
        </div>

        <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
          {t("referral.help")}
        </p>

        {/* Share link box */}
        <div className="mt-4 rounded-xl border flex items-stretch overflow-hidden"
          style={{ borderColor: "var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
          <div className="flex-1 min-w-0 px-3 py-2.5 text-xs font-mono truncate"
            style={{ color: "var(--bt-text-2)" }} title={shareLink}>
            {shareLink || "—"}
          </div>
          <button onClick={copy} disabled={!shareLink}
            className="px-3.5 text-xs font-semibold whitespace-nowrap transition-colors"
            style={{
              backgroundColor: copied ? "#14B885" : "var(--bt-accent-dark)",
              color: "#fff",
            }}>
            {copied ? t("referral.copied") : t("referral.copy")}
          </button>
        </div>

        {/* Native share button (mobile) */}
        {typeof navigator !== "undefined" && navigator.share && (
          <button onClick={share}
            className="mt-2 w-full rounded-xl py-2 text-xs font-semibold transition-colors"
            style={{ backgroundColor: "rgba(20,184,133,0.10)", color: "var(--bt-accent-dark)" }}>
            {t("referral.share")}
          </button>
        )}

        {/* Count */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>
            {t("referral.signupsCount")}
          </span>
          <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
            {count}
          </span>
        </div>
      </div>

      {/* Referred users list — collapsible */}
      {count > 0 && (
        <div style={{ borderTop: "1px solid var(--bt-border)" }}>
          <button onClick={() => setShowList(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors"
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
              {t("referral.listTitle")}
            </span>
            <IconChevronDown open={showList} />
          </button>
          {showList && (
            <ul className="px-5 pb-4 pt-1 space-y-2.5">
              {list.map((r, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Avatar src={r.avatar_url} name={r.pseudo} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                      @{r.pseudo}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--bt-text-3)" }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>
                    +{r.xp_awarded} XP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Badge detail bottom sheet ────────────────────────────────
function BadgeSheet({ badge, earned, t, onClose }) {
  if (!badge) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center"
        onClick={onClose}>
        <div className="rounded-t-[28px] sm:rounded-[24px] sm:max-w-xs w-full sm:mx-4"
          style={{ backgroundColor: "var(--bt-surface)", maxHeight: "90vh", overflowY: "auto" }}
          onClick={e => e.stopPropagation()}>
          {/* Mobile drag handle */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="p-6 pt-4 sm:pt-6 text-center">
            {/* Icon */}
            <div className={`inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-4 ${earned ? "badge-shine" : ""}`}
              style={{ backgroundColor: earned ? "var(--bt-accent-bg)" : "var(--bt-subtle)", border: earned ? "1px solid var(--bt-accent-border)" : "1px solid var(--bt-border)" }}>
              <BadgeIcon id={badge.id} earned={earned} size={72} />
            </div>
            {/* Name */}
            <h3 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
              {t(badge.labelKey)}
            </h3>
            {/* Status + XP reward */}
            <div className="mt-2 mb-4 flex flex-wrap items-center justify-center gap-2">
              {earned ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {t("badge.earnedStatus")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)", border: "1px solid var(--bt-border)" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  {t("badge.locked")}
                </span>
              )}
              {badge.xp > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "rgba(20,184,133,0.12)", color: "#14B885" }}>
                  {t("badge.xpReward")} : +{badge.xp} XP
                </span>
              )}
            </div>
            {/* Description */}
            {!earned && (
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--bt-text-4)" }}>
                {t("badge.howToEarn")}
              </p>
            )}
            <p className="text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t(badge.descKey)}
            </p>
            <button onClick={onClose} className="btn-ghost w-full mt-5 text-sm">
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function Profile() {
  const { user, profile, refreshProfile, signOut, updateEmail } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { dark, toggle: toggleDark } = useDarkMode();
  const avatarInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const [earnedBadgeIds, setEarnedBadgeIds] = useState([]);
  const [profileSessions, setProfileSessions] = useState([]);
  const [profileTotalSecs, setProfileTotalSecs] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPwa, setShowPwa] = useState(false);
  const [examCount, setExamCount] = useState(0);
  const [completedObjCount, setCompletedObjCount] = useState(0);
  const [todayDoneObj, setTodayDoneObj] = useState(0);
  const [postedToday, setPostedToday] = useState(false);
  const [tomorrowObjCount, setTomorrowObjCount] = useState(0);
  const [friendSentToday, setFriendSentToday] = useState(false);
  const [friendAcceptToday, setFriendAcceptToday] = useState(false);
  const [referredToday, setReferredToday] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [form, setForm] = useState({
    first_name: "", last_name: "", university: "",
    study_field: "", study_year: "", study_year_custom: "", bio: "",
  });

  // ── Load badge / XP data ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadBadges() {
      const today = todayISO();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const [
        sessionsRes, examRes, objRes, friendRes, postRes, existingRes,
        doneObjRes, todayDoneRes, likesRes, commentsRes, groupRes,
        commMsgRes, todayPostRes, tomorrowObjRes,
        friendSentRes, friendAcceptRes, referralStatsRes,
      ] = await Promise.all([
        supabase.from("sessions").select("started_at, duration_seconds").eq("user_id", user.id),
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("friendships").select("id", { count: "exact", head: true })
          .or(`requester.eq.${user.id},addressee.eq.${user.id}`).eq("status", "accepted"),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("user_badges").select("badge_id").eq("user_id", user.id),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("done", true),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("done", true).eq("scheduled_date", today),
        supabase.from("likes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("comments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("group_members").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("community_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", today + "T00:00:00").lt("created_at", tomorrowStr + "T00:00:00"),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("scheduled_date", tomorrowStr),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("requester", user.id).gte("created_at", today + "T00:00:00").lt("created_at", tomorrowStr + "T00:00:00"),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("addressee", user.id).eq("status", "accepted").gte("created_at", today + "T00:00:00").lt("created_at", tomorrowStr + "T00:00:00"),
        supabase.rpc("get_my_referral_stats"),
      ]);

      const sessions = sessionsRes.data || [];
      const streak = computeStreak(sessions);
      const totalHours = sessions.reduce((a, s) => a + s.duration_seconds, 0) / 3600;
      const sessionCount = sessions.length;

      // Compute maxDailyHours for marathon_day badge
      const dayTotals = {};
      for (const s of sessions) {
        const day = s.started_at.slice(0, 10);
        dayTotals[day] = (dayTotals[day] || 0) + s.duration_seconds;
      }
      const maxDailySecs = Object.values(dayTotals).length > 0 ? Math.max(...Object.values(dayTotals)) : 0;

      const completedObj = doneObjRes.count || 0;
      const earned = computeEarnedBadgeIds({
        streak, totalHours,
        maxDailyHours: maxDailySecs / 3600,
        sessionCount,
        examCount: examRes.count || 0,
        objectiveCount: objRes.count || 0,
        completedObjCount: completedObj,
        friendCount: friendRes.count || 0,
        postCount: postRes.count || 0,
        reactionsCount: (likesRes.count || 0) + (commentsRes.count || 0),
        groupMemberCount: groupRes.count || 0,
        communityMsgCount: commMsgRes.count || 0,
        referralCount: referralStatsRes.data?.ok ? (referralStatsRes.data.count || 0) : 0,
      });

      const existing = (existingRes.data || []).map(b => b.badge_id);
      const newIds = earned.filter(id => !existing.includes(id));
      if (newIds.length) {
        await supabase.from("user_badges")
          .upsert(newIds.map(badge_id => ({ user_id: user.id, badge_id })), { onConflict: "user_id,badge_id", ignoreDuplicates: true });
      }
      setEarnedBadgeIds([...new Set([...existing, ...earned])]);
      setExamCount(examRes.count || 0);
      setCompletedObjCount(completedObj);
      setTodayDoneObj(todayDoneRes.count || 0);
      setPostedToday((todayPostRes.count || 0) > 0);
      setTomorrowObjCount(tomorrowObjRes.count || 0);
      setFriendSentToday((friendSentRes.count || 0) > 0);
      setFriendAcceptToday((friendAcceptRes.count || 0) > 0);

      const refList = referralStatsRes.data?.ok ? (referralStatsRes.data.list || []) : [];
      setReferredToday(refList.some(r => (r.created_at || "").slice(0, 10) === today));
    }
    loadBadges();
  }, [user]);

  // ── Load sessions for heatmap + activity stats ────────────
  useEffect(() => {
    if (!user) return;
    const since370 = new Date();
    since370.setDate(since370.getDate() - 370);
    (async () => {
      const [{ data: heatSessions }, { data: allSessions }] = await Promise.all([
        supabase.from("sessions").select("started_at, duration_seconds, course_id").eq("user_id", user.id).gte("started_at", since370.toISOString()),
        supabase.from("sessions").select("duration_seconds").eq("user_id", user.id),
      ]);
      setProfileSessions(heatSessions || []);
      setProfileTotalSecs((allSessions || []).reduce((a, s) => a + s.duration_seconds, 0));
    })();
  }, [user]);

  useEffect(() => {
    if (profile) {
      const isCustomYear = profile.study_year && !YEARS.includes(profile.study_year);
      setForm({
        first_name: profile.first_name || "", last_name: profile.last_name || "",
        university: profile.university || "", study_field: profile.study_field || "",
        study_year: isCustomYear ? "Autre" : (profile.study_year || ""),
        study_year_custom: isCustomYear ? profile.study_year : "", bio: profile.bio || "",
      });
      setEmailInput(profile.email || "");
    }
  }, [profile]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function changeLang(l) {
    setLang(l);
    await supabase.from("profiles").update({ lang: l }).eq("id", user.id);
    refreshProfile();
  }

  async function uploadAvatar(e) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setBusy(true); setAvatarMsg("");

    // Compresse l'avatar (≤ 400×400 px, WebP si possible) avant l'upload.
    // Chute silencieuse : on utilise le fichier original si la compression échoue.
    let uploadFile = rawFile;
    let ext = rawFile.name.split(".").pop();
    try {
      const optimized = await optimizeAvatarImage(rawFile);
      uploadFile = optimized.file || rawFile;
      ext = optimized.extension || ext;
    } catch (_) {}

    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, uploadFile, { upsert: true, cacheControl: "31536000", contentType: uploadFile.type || rawFile.type });
    if (upErr) { setBusy(false); setAvatarMsg(t("profile.avatarError")); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
    setBusy(false);
    if (updErr) setAvatarMsg(t("profile.avatarError"));
    else { setAvatarMsg(t("profile.avatarUpdated")); refreshProfile(); }
  }

  async function saveEmail(e) {
    e.preventDefault(); setEmailMsg("");
    if (!emailInput.trim()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) { setEmailMsg(t("profile.emailInvalid")); return; }
    setEmailBusy(true);
    const { error } = await updateEmail(emailInput);
    setEmailBusy(false);
    if (error) setEmailMsg(error);
    else { setEmailMsg(t("profile.emailSaved")); refreshProfile(); }
  }

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await supabase.rpc("self_delete_user");
    if (error) { setDeleting(false); setMsg("Erreur : " + error.message); setDeleteConfirm(false); return; }
    await signOut();
  }

  async function saveInfo(e) {
    e.preventDefault(); setBusy(true); setMsg("");
    const actualYear = form.study_year === "Autre" ? (form.study_year_custom.trim() || "Autre") : form.study_year;
    const { error } = await supabase.from("profiles").update({
      first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null,
      university: form.university.trim() || null, study_field: form.study_field.trim() || null,
      study_year: actualYear || null, bio: form.bio.trim() || null,
    }).eq("id", user.id);
    setBusy(false);
    if (error) setMsg("Erreur : " + error.message);
    else { setMsg(t("profile.updated")); refreshProfile(); }
  }

  // ── Computed values ──────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const secs30d = profileSessions.filter(s => new Date(s.started_at) >= thirtyDaysAgo).reduce((a, s) => a + s.duration_seconds, 0);
  const streak = computeStreak(profileSessions);
  const best = computeBestStreak(profileSessions);

  const todayStr = todayISO();
  const todaySessions = profileSessions.filter(s => s.started_at?.startsWith(todayStr));
  const todaySecs = todaySessions.reduce((a, s) => a + s.duration_seconds, 0);
  const todayMaxSessionSecs = todaySessions.length ? Math.max(...todaySessions.map(s => s.duration_seconds)) : 0;
  const studiedBeforeNoon = todaySessions.some(s => new Date(s.started_at).getHours() < 12);
  const studiedAfter20 = todaySessions.some(s => new Date(s.started_at).getHours() >= 20);
  const todayCoursesSet = new Set(todaySessions.map(s => s.course_id).filter(Boolean));
  const todayCoursesCount = todayCoursesSet.size;

  const totalXP = computeTotalXP({
    totalMinutes: profileTotalSecs / 60,
    completedObjectives: completedObjCount,
    streak, examCount, badgeCount: earnedBadgeIds.length,
    bonusXP: profile?.bonus_xp || 0,
  });
  const levelInfo = getLevelInfo(totalXP);

  const missionDefs = getDailyMissionDefs(todayStr, user?.id);
  const missions = evaluateMissions(missionDefs, {
    todaySecs, todayMaxSessionSecs, todayDoneObj, streak,
    studiedBeforeNoon, studiedAfter20, postedToday, tomorrowObjCount, todayCoursesCount,
    friendSentToday, friendAcceptToday, referredToday,
  });

  const sep = <div style={{ height: 1, backgroundColor: "var(--bt-border)" }} />;

  return (
    <Layout>
      <div className="max-w-lg mx-auto pb-10 space-y-4 bt-stagger">

        {/* ══ HEADER ══════════════════════════════════════════ */}
        <div className="card overflow-hidden">
          <div className="h-24" style={{ background: "radial-gradient(130% 150% at 82% -30%, rgba(20,184,133,0.45), transparent 58%), linear-gradient(178deg, var(--bt-ink-soft), var(--bt-ink))" }} />
          <div className="flex flex-col items-center px-6 pb-6" style={{ marginTop: -44 }}>
            <div className="relative">
              <div style={{ borderRadius: "50%", padding: 3, backgroundColor: "var(--bt-surface)", boxShadow: "0 6px 20px var(--bt-shadow)" }}>
                <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={82} />
              </div>
              <button onClick={() => avatarInputRef.current?.click()} disabled={busy}
                title={t("profile.changePhoto")}
                className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                style={{ backgroundColor: "#14B885", color: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.25)" }}>
                {busy ? <span className="block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <IconCamera />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} disabled={busy} />
            </div>
            <h2 className="text-xl mt-3 text-center" style={{ color: "var(--bt-text-1)" }}>{displayName(profile)}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--bt-text-3)" }}>@{profile?.pseudo}</p>
            {(profile?.study_field || profile?.study_year || profile?.university) && (
              <p className="text-xs mt-1.5 text-center leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                {[profile.study_field, profile.study_year].filter(Boolean).join(" · ")}
                {(profile.study_field || profile.study_year) && profile.university ? " — " : ""}
                {profile.university}
              </p>
            )}
            {profile?.bio && (
              <p className="text-sm mt-2 italic text-center px-4 leading-snug" style={{ color: "var(--bt-text-3)" }}>« {profile.bio} »</p>
            )}
            {avatarMsg && (
              <p className="text-xs mt-2.5 text-center" style={{ color: avatarMsg === t("profile.avatarUpdated") ? "var(--bt-accent-dark)" : "#DC2626" }}>{avatarMsg}</p>
            )}

            {/* Rail de stats-cles — chiffres surfaces immediatement, plus besoin de deplier */}
            <div className="grid grid-cols-3 gap-2 w-full mt-5">
              {[
                { label: t("xp.level"), value: levelInfo.current.level },
                { label: t("profile.streakDays"), value: `${streak} j` },
                { label: t("profile.totalHours"), value: formatMinutesShort(profileTotalSecs) },
              ].map((s, i) => (
                <div key={i} className="rounded-2xl py-2.5 text-center"
                  style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                  <p className="font-num font-bold tabular-nums leading-none" style={{ fontSize: "1.05rem", color: "var(--bt-text-1)", letterSpacing: "-0.01em" }}>{s.value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Locked warning */}
        {profile?.locked && (
          <div className="card p-4 flex items-start gap-3"
            style={{ borderColor: "rgba(220,38,38,0.35)", backgroundColor: "rgba(220,38,38,0.08)" }}>
            <span className="shrink-0" style={{ color: "#DC2626" }}><IconLock /></span>
            <div>
              <p className="text-sm font-medium" style={{ color: "#DC2626" }}>{t("profile.lockedTitle")}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{t("profile.lockedDesc")}</p>
            </div>
          </div>
        )}

        {/* ══ PROGRESSION (XP) ═════════════════════════════════ */}
        <XPProgressCard
          levelInfo={levelInfo} streak={streak} profileTotalSecs={profileTotalSecs}
          earnedBadgeIds={earnedBadgeIds} missions={missions}
          onBadgeClick={setSelectedBadge} t={t}
        />

        {/* ══ ACTIVITÉ (toujours visible — contenu, pas un reglage) ══ */}
        <div className="card p-5">
          <SectionLabel>{t("profile.activitySection")}</SectionLabel>
          {profileTotalSecs > 0 ? (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                {[
                  { label: t("profile.hours30d"), value: formatMinutesShort(secs30d) },
                  { label: t("profile.bestStreakDays"), value: `${best} j` },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-3 text-center"
                    style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
                    <p className="text-base font-num font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <StudyHeatmap sessions={profileSessions} />
            </div>
          ) : (
            <p className="text-sm mt-3" style={{ color: "var(--bt-text-3)" }}>{t("stats.empty")}</p>
          )}
        </div>

        {/* ══ MON COMPTE (infos + email, accordeons coherents) ══ */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-4 pb-1"><SectionLabel>{t("profile.accountSection")}</SectionLabel></div>
          <SettingsRow icon={<IconUser />} label={t("profile.myInfo")}
            onClick={() => setShowInfo(o => !o)} right={<IconChevronDown open={showInfo} />} />
          {showInfo && (
            <div className="px-5 pb-5 pt-1">
              <form onSubmit={profile?.locked ? e => e.preventDefault() : saveInfo} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="label">{t("profile.firstName")}</label>
                    <input className="input" value={form.first_name} onChange={e => set("first_name", e.target.value)} disabled={profile?.locked} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="label">{t("profile.lastName")}</label>
                    <input className="input" value={form.last_name} onChange={e => set("last_name", e.target.value)} disabled={profile?.locked} />
                  </div>
                </div>
                <div>
                  <label className="label">{t("profile.university")}</label>
                  <UniPicker value={form.university} onChange={v => set("university", v)} disabled={!!profile?.locked} placeholder={t("profile.choose")} />
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="label">{t("profile.studies")}</label>
                    <input className="input" placeholder={t("profile.studiesPlaceholder")} value={form.study_field} onChange={e => set("study_field", e.target.value)} disabled={profile?.locked} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="label">{t("profile.year")}</label>
                    <select className="input" value={form.study_year} onChange={e => { set("study_year", e.target.value); set("study_year_custom", ""); }} disabled={profile?.locked}>
                      <option value="">—</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                {form.study_year === "Autre" && (
                  <div>
                    <label className="label">{t("profile.customYear")}</label>
                    <input className="input" placeholder={t("profile.customYearPlaceholder")} value={form.study_year_custom} onChange={e => set("study_year_custom", e.target.value)} disabled={profile?.locked} />
                  </div>
                )}
                <div>
                  <label className="label">{t("profile.bio")}</label>
                  <textarea className="input" rows={2} maxLength={160} placeholder={t("profile.bioPlaceholder")} value={form.bio} onChange={e => set("bio", e.target.value)} disabled={profile?.locked} />
                </div>
                <button className="btn-primary w-full" type="submit" disabled={busy || !!profile?.locked}>
                  {busy ? t("common.saving") : t("common.save")}
                </button>
                {msg && <p className="text-xs text-center" style={{ color: msg.startsWith("Erreur") ? "#DC2626" : "var(--bt-accent-dark)" }}>{msg}</p>}
              </form>
            </div>
          )}
          {sep}
          <SettingsRow icon={<IconMail />} label={t("profile.emailSection")}
            onClick={() => setShowEmail(o => !o)} right={<IconChevronDown open={showEmail} />} />
          {showEmail && (
            <div className="px-5 pb-5 pt-1">
              <form onSubmit={saveEmail} className="space-y-2">
                <input className="input" type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} autoComplete="email" placeholder="ton@email.com" />
                <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("profile.emailHint")}</p>
                {emailMsg && <p className="text-xs" style={{ color: emailMsg === t("profile.emailSaved") ? "var(--bt-accent-dark)" : "#DC2626" }}>{emailMsg}</p>}
                <button className="btn-primary w-full" type="submit" disabled={emailBusy || !emailInput.trim() || emailInput === (profile?.email || "")}>
                  {emailBusy ? t("profile.emailSaving") : t("profile.emailSave")}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* ══ NOTIFICATIONS ════════════════════════════════════ */}
        <PushNotificationsCard />

        {/* ══ PARRAINAGE ═══════════════════════════════════════ */}
        <ReferralCard t={t} />

        {/* ══ PRÉFÉRENCES (controles en place — ni accordeon ni nav) ══ */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-4 pb-1"><SectionLabel>{t("profile.preferencesSection")}</SectionLabel></div>
          <SettingsRow icon={<IconGlobe />} label={t("profile.language")} right={
            <div className="flex gap-0.5" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 10, padding: 2 }}>
              {["fr", "en"].map(code => (
                <button key={code} onClick={() => changeLang(code)}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                  style={lang === code ? { backgroundColor: "#14B885", color: "#fff" } : { color: "var(--bt-text-3)" }}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          } />
          {sep}
          <SettingsRow icon={dark ? <IconMoon /> : <IconSun />} label={t("profile.appearance")} right={
            <button onClick={toggleDark} className="relative w-10 h-6 rounded-full transition-colors" style={{ backgroundColor: dark ? "#14B885" : "var(--bt-border)" }} aria-label={t("profile.appearance")}>
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200" style={{ transform: dark ? "translateX(18px)" : "translateX(2px)" }} />
            </button>
          } />
        </div>

        {/* ══ AIDE & À PROPOS ══════════════════════════════════ */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-4 pb-1"><SectionLabel>{t("profile.helpSection")}</SectionLabel></div>
          {/* → mene a une autre page (fleche droite) */}
          <SettingsRow accent icon={<IconFeedback />} href="/feedback"
            label={t("feedback.improveTitle")} description={t("feedback.improveDesc")}
            right={<IconChevronRight />} />
          {sep}
          {/* ▾ se deplie sur place (accordeon) */}
          <SettingsRow icon={<IconSmartphone />} label={t("pwa.profileSection")}
            onClick={() => setShowPwa(s => !s)} right={<IconChevronDown open={showPwa} />} />
          {showPwa && (
            <div className="px-5 pb-4 pt-1 space-y-3">
              <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>{t("pwa.profileDesc")}</p>
              <div className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                <span className="shrink-0 mt-0.5" style={{ color: "#D97706" }}><IconAlert /></span>
                <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("pwa.safariNote")}</p>
              </div>
              <ol className="space-y-2">
                {[t("pwa.step1"), t("pwa.step2"), t("pwa.step3")].map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
                    <span className="font-num font-bold shrink-0 w-4 text-right tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {sep}
          <SettingsRow icon={<IconInfo />} label={t("profile.about")}
            onClick={() => setShowAbout(s => !s)} right={<IconChevronDown open={showAbout} />} />
          {showAbout && (
            <div className="px-5 pb-4 pt-1 space-y-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              <p><span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>blocus·tracker</span>{" "}{t("profile.aboutCreatedBy")}{" "}<span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>Mathias Dock</span>{", "}{t("profile.aboutRole")}</p>
              <p>{t("profile.aboutDesc")}</p>
            </div>
          )}
        </div>

        {/* ══ ADMIN (si admin — navigations) ═══════════════════ */}
        {profile?.is_admin && (
          <div className="card overflow-hidden">
            <div className="px-5 pt-4 pb-1"><SectionLabel>{t("nav.admin")}</SectionLabel></div>
            <SettingsRow accent icon={<IconShield color="var(--bt-accent-dark)" />} href="/admin"
              label={t("profile.adminDashboard")} right={<IconChevronRight />} />
            {sep}
            <SettingsRow accent icon={<IconFeedback />} href="/feedback"
              label={t("profile.suggestionInbox")} right={<IconChevronRight />} />
          </div>
        )}

        {/* ══ SESSION (deconnexion + suppression — actions destructives isolees) ══ */}
        <div className="card overflow-hidden">
          <SettingsRow icon={<IconLogOut />} label={t("profile.signOut")} onClick={signOut} />
          {sep}
          {!deleteConfirm ? (
            <SettingsRow danger icon={<IconTrash />} label={t("profile.deleteAccount")}
              onClick={() => setDeleteConfirm(true)} />
          ) : (
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm font-medium text-center" style={{ color: "#DC2626" }}>{t("profile.deleteWarning")}</p>
              <div className="flex gap-2">
                <button onClick={deleteAccount} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition" style={{ backgroundColor: "#DC2626", color: "#fff" }}>
                  {deleting ? "…" : t("profile.confirmDelete")}
                </button>
                <button onClick={() => setDeleteConfirm(false)} className="btn-ghost flex-1 text-sm">{t("common.cancel")}</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ══ Badge detail sheet ════════════════════════════════ */}
      <BadgeSheet
        badge={selectedBadge}
        earned={selectedBadge ? earnedBadgeIds.includes(selectedBadge.id) : false}
        t={t}
        onClose={() => setSelectedBadge(null)}
      />
    </Layout>
  );
}
