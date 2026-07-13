import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import UniPicker from "../components/UniPicker";
import StudyHeatmap from "../components/StudyHeatmap";
import LevelPill from "../components/LevelPill";
import MascotCoach from "../components/MascotCoach";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatMinutesShort, computeStreak, computeBestStreak, todayISO } from "../lib/format";
import { BADGES, computeEarnedBadgeIds } from "../lib/badges";
import { computeTotalXP, getLevelInfo, getDailyMissionDefs, evaluateMissions } from "../lib/xp";
import BadgeIcon from "../components/BadgeIcon";
import { optimizeAvatarImage } from "../lib/imageCompression";
import { isPushSupported, isIOS, isStandalone, enablePush, loginUser } from "../lib/onesignal";
import { safeStoragePath, uploadErrorMessage, validateFinalUploadFile, validateUploadFile } from "../lib/security";

// ── Thème ────────────────────────────────────────────────────
// bt_theme = "light" | "dark" | "system" (bt_dark est la clé héritée,
// migrée à la volée). "system" suit prefers-color-scheme en direct.
// Le script anti-flash équivalent vit dans pages/_document.js.
const THEME_MODES = ["light", "system", "dark"];

function useTheme() {
  const [theme, setThemeState] = useState("light");
  // `ready` est un STATE (batché avec la restauration) et non une ref :
  // sinon l'effet d'application tournerait une fois avec le défaut "light"
  // et écraserait le thème sombre déjà posé par le script _document.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      let t = localStorage.getItem("bt_theme");
      if (!t) t = localStorage.getItem("bt_dark") === "true" ? "dark" : "light";
      if (!THEME_MODES.includes(t)) t = "light";
      setThemeState(t);
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [ready, theme]);

  function setTheme(t) {
    setThemeState(t);
    try {
      localStorage.setItem("bt_theme", t);
      localStorage.removeItem("bt_dark"); // clé héritée
    } catch {}
  }

  return { theme, setTheme };
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
function IconSmartphone() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>; }
function IconInfo() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function IconLegal() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>; }
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
function IconBell() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function IconEdit() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>; }
function IconAward() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>; }
function IconSliders() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>; }
function IconGift() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>; }
function IconX() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function IconSun() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }

// ── UI primitives (uniformes sur toute la page) ─────────────
function SectionLabel({ children }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>{children}</p>;
}

function IconBox({ color, bg, children }) {
  return <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: bg || "var(--bt-subtle)", color: color || "var(--bt-text-2)" }}>{children}</span>;
}

// En-tête de carte standard : icône + libellé + contenu optionnel à droite.
// Toutes les cartes de la page l'utilisent → même rythme visuel partout.
function CardHead({ icon, label, right }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span style={{ color: "var(--bt-text-3)" }}>{icon}</span>}
        <SectionLabel>{label}</SectionLabel>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

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
          {description && <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--bt-text-3)" }} title={description}>{description}</span>}
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

// Segmented control générique (langue, thème…) — le pattern de réglage
// moderne de la page : état visible d'un coup d'œil, bascule en un tap.
function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-0.5" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 10, padding: 2 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} title={o.title || undefined}
          className="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
          style={value === o.value ? { backgroundColor: "#14B885", color: "#fff" } : { color: "var(--bt-text-3)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Tuile de statistique — même style dans le hero et la carte Activité.
function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-2xl px-2 py-2.5 text-center min-w-0"
      style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
      <p className="font-num font-bold tabular-nums leading-none truncate" style={{ fontSize: "1.05rem", color: "var(--bt-text-1)", letterSpacing: "-0.01em" }}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide mt-1 truncate" style={{ color: "var(--bt-text-3)" }} title={label}>{label}</p>
      {sub && <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--bt-text-4)" }}>{sub}</p>}
    </div>
  );
}

// ── Progression (XP) — surface ink signature ─────────────────
function XPCard({ levelInfo, missions, streak, coachMessage, coachId, t }) {
  const { current, next, progressXP, rangeXP, progressPct, totalXP } = levelInfo;
  return (
    <div id="xp-card" className="card-ink bt-grain">
      <div className="relative z-10" style={{ padding: 20 }}>

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

        <MascotCoach
          id={coachId}
          message={coachMessage}
          streak={streak}
          variant="embedded"
          surface="ink"
          persistence="day"
          className="mb-4"
        />

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
      </div>
    </div>
  );
}

// ── Badges — carte claire, compteur + grille cliquable ───────
function BadgesCard({ earnedBadgeIds, onBadgeClick, t }) {
  return (
    <div className="card overflow-hidden">
      <CardHead icon={<IconAward />} label={t("badge.title")}
        right={
          <span className="font-num text-xs font-bold tabular-nums px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
            {earnedBadgeIds.length}/{BADGES.length}
          </span>
        } />
      <div className="px-5 pb-5">
        <div className="flex flex-wrap gap-2">
          {BADGES.map(b => {
            const earned = earnedBadgeIds.includes(b.id);
            return (
              <button key={b.id} onClick={() => onBadgeClick(b)}
                title={t(b.labelKey)}
                className="bt-press"
                style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", backgroundColor: earned ? "var(--bt-accent-bg)" : "var(--bt-subtle)", border: earned ? "1px solid var(--bt-accent-border)" : "1px solid var(--bt-border)", transition: "transform 0.12s", opacity: earned ? 1 : 0.55 }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.10)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
                <BadgeIcon id={b.id} earned={earned} size={28} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Parrainage — version compacte (lien + compteur, sans pavé) ──
function ReferralCard({ t }) {
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_referral_stats");
      if (!mounted) return;
      if (!error && data && data.ok) setStats(data);
    })();
    return () => { mounted = false; };
  }, []);

  const code = stats?.code || "";
  const shareLink = code ? `https://www.blocus-tracker.com/signup?ref=${code}` : "";
  const count = stats?.count || 0;
  const list = stats?.list || [];

  async function copy() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  return (
    <div className="card overflow-hidden">
      <CardHead icon={<IconGift />} label={t("referral.title")}
        right={
          <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
            {t("referral.signupsCount")} : <span className="font-num font-bold" style={{ color: "var(--bt-text-1)" }}>{count}</span>
          </span>
        } />
      <div className="px-5 pb-4">
        <p className="text-xs mb-3" style={{ color: "var(--bt-text-3)" }}>{t("referral.subtitle")}</p>
        <div className="rounded-xl border flex items-stretch overflow-hidden"
          style={{ borderColor: "var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
          <div className="flex-1 min-w-0 px-3 py-2.5 text-xs font-mono truncate"
            style={{ color: "var(--bt-text-2)" }} title={shareLink}>
            {shareLink || "…"}
          </div>
          <button onClick={copy} disabled={!shareLink}
            className="px-3.5 text-xs font-semibold whitespace-nowrap transition-colors"
            style={{ backgroundColor: copied ? "#14B885" : "var(--bt-accent-dark)", color: "#fff" }}>
            {copied ? t("referral.copied") : t("referral.copy")}
          </button>
        </div>
      </div>
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
                  <Avatar url={r.avatar_url} pseudo={r.pseudo} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>@{r.pseudo}</p>
                    <p className="text-[11px]" style={{ color: "var(--bt-text-3)" }}>{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>+{r.xp_awarded} XP</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Notifications push — rangée de réglage compacte ──────────
function PushRow({ t, user }) {
  const [env, setEnv] = useState({ ready: false, supported: false, ios: false, standalone: false });
  const [permission, setPermission] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEnv({ ready: true, supported: isPushSupported(), ios: isIOS(), standalone: isStandalone() });
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  async function enable() {
    setBusy(true); setError("");
    try {
      const res = await enablePush();
      if (res?.reason === "unconfigured") { setError(t("push.unconfigured")); return; }
      if (res?.reason === "blocked") { setError(t("push.blocked")); return; }
      const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(perm);
      if (perm === "granted") {
        if (user) await loginUser(user.id);
        try { localStorage.setItem("bt_push_enabled", "1"); } catch (_) {}
      }
    } catch (_) {
      setError(t("push.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!env.ready) return null;

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const iosNeedsInstall = env.ios && !env.standalone;

  let description = t("push.desc");
  let right = null;
  if (!appId) {
    description = t("push.unconfigured");
  } else if (iosNeedsInstall) {
    description = t("push.iosHint");
  } else if (!env.supported) {
    description = t("push.unsupported");
  } else if (permission === "granted") {
    description = t("push.enabled");
    right = (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        OK
      </span>
    );
  } else if (permission === "denied") {
    description = t("push.denied");
  } else {
    right = (
      <button onClick={enable} disabled={busy}
        className="px-3 py-1.5 rounded-full text-xs font-semibold transition disabled:opacity-60"
        style={{ backgroundColor: "#14B885", color: "#fff" }}>
        {busy ? "…" : t("push.enable")}
      </button>
    );
  }

  return (
    <>
      <SettingsRow icon={<IconBell />} label={t("push.title")} description={error || description} right={right} />
    </>
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
            <div className={`inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-4 ${earned ? "badge-shine" : ""}`}
              style={{ backgroundColor: earned ? "var(--bt-accent-bg)" : "var(--bt-subtle)", border: earned ? "1px solid var(--bt-accent-border)" : "1px solid var(--bt-border)" }}>
              <BadgeIcon id={badge.id} earned={earned} size={72} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
              {t(badge.labelKey)}
            </h3>
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

// ── Modal d'édition du profil (infos personnelles) ───────────
function EditProfileModal({ open, onClose, form, set, saveInfo, busy, msg, locked, t }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={onClose}>
        <div className="rounded-t-[28px] sm:rounded-[24px] sm:max-w-md w-full sm:mx-4"
          style={{ backgroundColor: "var(--bt-surface)", maxHeight: "92vh", overflowY: "auto" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="flex items-center justify-between px-6 pt-3 sm:pt-5">
            <h3 className="text-base font-bold" style={{ color: "var(--bt-text-1)" }}>{t("profile.myInfo")}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }} aria-label={t("common.close")}>
              <IconX />
            </button>
          </div>
          <div className="px-6 pb-6 pt-4">
            <form onSubmit={locked ? e => e.preventDefault() : saveInfo} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label className="label">{t("profile.firstName")}</label>
                  <input className="input" value={form.first_name} onChange={e => set("first_name", e.target.value)} disabled={locked} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="label">{t("profile.lastName")}</label>
                  <input className="input" value={form.last_name} onChange={e => set("last_name", e.target.value)} disabled={locked} />
                </div>
              </div>
              <div>
                <label className="label">{t("profile.university")}</label>
                <UniPicker value={form.university} onChange={v => set("university", v)} disabled={!!locked} placeholder={t("profile.choose")} />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label className="label">{t("profile.studies")}</label>
                  <input className="input" placeholder={t("profile.studiesPlaceholder")} value={form.study_field} onChange={e => set("study_field", e.target.value)} disabled={locked} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="label">{t("profile.year")}</label>
                  <select className="input" value={form.study_year} onChange={e => { set("study_year", e.target.value); set("study_year_custom", ""); }} disabled={locked}>
                    <option value="">—</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              {form.study_year === "Autre" && (
                <div>
                  <label className="label">{t("profile.customYear")}</label>
                  <input className="input" placeholder={t("profile.customYearPlaceholder")} value={form.study_year_custom} onChange={e => set("study_year_custom", e.target.value)} disabled={locked} />
                </div>
              )}
              <div>
                <label className="label">{t("profile.bio")}</label>
                <textarea className="input" rows={2} maxLength={160} placeholder={t("profile.bioPlaceholder")} value={form.bio} onChange={e => set("bio", e.target.value)} disabled={locked} />
              </div>
              <button className="btn-primary w-full" type="submit" disabled={busy || !!locked}>
                {busy ? t("common.saving") : t("common.save")}
              </button>
              {msg && <p className="text-xs text-center" style={{ color: msg.startsWith("Erreur") ? "#DC2626" : "var(--bt-accent-dark)" }}>{msg}</p>}
            </form>
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
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const avatarInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const [earnedBadgeIds, setEarnedBadgeIds] = useState([]);
  const [profileSessions, setProfileSessions] = useState([]);
  const [profileTotalSecs, setProfileTotalSecs] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [myRank, setMyRank] = useState(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
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
  const [newBadgeId, setNewBadgeId] = useState(null);
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
        sessionCount: sessions.length,
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
        setNewBadgeId(newIds[0]);
      }
      setEarnedBadgeIds([...new Set([...existing, ...earned])]);
      setSessionCount(sessions.length);
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

  // ── Load sessions for heatmap + profile activity stats ───
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

  // ── Classement de la semaine (RPC leaderboard existant) ───
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.rpc("get_my_study_rank", { p_period: "week" });
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setMyRank(row);
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
    const precheck = validateUploadFile(rawFile, "avatar");
    if (!precheck.ok) { setAvatarMsg(uploadErrorMessage(t, precheck)); return; }
    setBusy(true); setAvatarMsg("");

    // Compresse l'avatar (≤ 320×320 px, WebP si possible) avant l'upload.
    // Chute silencieuse : on utilise le fichier original si la compression échoue.
    let uploadFile = rawFile;
    try {
      const optimized = await optimizeAvatarImage(rawFile);
      uploadFile = optimized.file || rawFile;
    } catch (_) {}

    const finalCheck = validateFinalUploadFile(uploadFile, "avatar");
    if (!finalCheck.ok) { setBusy(false); setAvatarMsg(uploadErrorMessage(t, finalCheck)); return; }
    const pathInfo = safeStoragePath(user.id, uploadFile, ["avatars"], "avatar");
    if (!pathInfo.ok) { setBusy(false); setAvatarMsg(uploadErrorMessage(t, pathInfo)); return; }
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(pathInfo.path, uploadFile, { upsert: true, cacheControl: "31536000", contentType: pathInfo.contentType });
    if (upErr) { setBusy(false); setAvatarMsg(t("profile.avatarError")); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(pathInfo.path);
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
    if (error) { setMsg("Erreur : " + error.message); toast(t("toast.genericError"), "error"); }
    else { setMsg(t("profile.updated")); refreshProfile(); toast(t("toast.saved")); }
  }

  // ── Computed values ──────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const secs30d = profileSessions.filter(s => new Date(s.started_at) >= thirtyDaysAgo).reduce((a, s) => a + s.duration_seconds, 0);
  const streak = computeStreak(profileSessions);
  const best = computeBestStreak(profileSessions);
  const activeDays = new Set(profileSessions.map(s => (s.started_at || "").slice(0, 10))).size;
  const avgDaySecs30 = Math.round(secs30d / 30);

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
  const newBadge = newBadgeId ? BADGES.find(b => b.id === newBadgeId) : null;
  const xpRemaining = levelInfo.next ? Math.max(0, levelInfo.rangeXP - levelInfo.progressXP) : 0;
  const profileCoachMessage = newBadge
    ? t("coach.profile.badge").replace("{badge}", t(newBadge.labelKey))
    : (todaySecs > 0 && streak > 0)
      ? t("coach.profile.streak")
      : levelInfo.next
        ? t("coach.profile.nextLevel").replace("{xp}", String(xpRemaining))
        : t("coach.profile.maxLevel");

  const missionDefs = getDailyMissionDefs(todayStr, user?.id);
  const missions = evaluateMissions(missionDefs, {
    todaySecs, todayMaxSessionSecs, todayDoneObj, streak,
    studiedBeforeNoon, studiedAfter20, postedToday, tomorrowObjCount, todayCoursesCount,
    friendSentToday, friendAcceptToday, referredToday,
  });

  // Classement : #N parmi les actifs de la semaine (RPC leaderboard).
  const rankValue = myRank
    ? (Number(myRank.my_secs) > 0 ? `#${Number(myRank.better_count) + 1}` : "—")
    : "…";

  const sep = <div style={{ height: 1, backgroundColor: "var(--bt-border)" }} />;

  const heroStats = [
    { label: t("profile.statTotalTime"), value: formatMinutesShort(profileTotalSecs) },
    { label: t("profile.statSessions"), value: sessionCount },
    { label: t("profile.streakDays"), value: `${streak} ${t("dash.daysShort")}` },
    { label: t("profile.bestStreakDays"), value: `${best} ${t("dash.daysShort")}` },
    { label: t("profile.statRank7d"), value: rankValue },
  ];

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto pb-10 bt-stagger">

        {/* ══ HERO — identité (pleine largeur, horizontal en desktop) ══ */}
        <div className="card overflow-hidden">
          <div className="h-20 sm:h-24 relative overflow-hidden" style={{ background: "radial-gradient(130% 150% at 82% -30%, rgba(20,184,133,0.45), transparent 58%), linear-gradient(178deg, var(--bt-ink-soft), var(--bt-ink))" }} />
          <div className="px-5 sm:px-7 pb-5 sm:pb-6">
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-end sm:text-left gap-3 sm:gap-5 pt-2">
              {/* Avatar + caméra — seul l'avatar chevauche le cover, le texte
                  reste sous la ligne pour garder son contraste */}
              <div className="relative shrink-0" style={{ marginTop: -58 }}>
                <div style={{ borderRadius: "50%", padding: 3, backgroundColor: "var(--bt-surface)", boxShadow: "0 6px 20px var(--bt-shadow)" }}>
                  <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={88} />
                </div>
                <button onClick={() => avatarInputRef.current?.click()} disabled={busy}
                  title={t("profile.changePhoto")}
                  className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ backgroundColor: "#14B885", color: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.25)" }}>
                  {busy ? <span className="block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <IconCamera />}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={uploadAvatar} disabled={busy} />
              </div>

              {/* Identité */}
              <div className="flex-1 min-w-0 sm:pb-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h2 className="text-xl font-display" style={{ color: "var(--bt-text-1)" }}>{displayName(profile)}</h2>
                  <LevelPill level={levelInfo.current.level} size="sm" solid />
                </div>
                <p className="text-sm mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                  @{profile?.pseudo}
                  {(profile?.study_field || profile?.study_year || profile?.university) && (
                    <span> · {[profile.study_field, profile.study_year, profile.university].filter(Boolean).join(" · ")}</span>
                  )}
                </p>
                {profile?.bio && (
                  <p className="text-sm mt-1.5 italic leading-snug" style={{ color: "var(--bt-text-2)" }}>« {profile.bio} »</p>
                )}
              </div>

              {/* Actions */}
              <div className="shrink-0 sm:pb-1">
                <button onClick={() => { setMsg(""); setShowEditProfile(true); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-colors bt-press"
                  style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", color: "var(--bt-text-1)" }}>
                  <IconEdit />
                  {t("profile.editProfile")}
                </button>
              </div>
            </div>

            {avatarMsg && (
              <p className="text-xs mt-2.5 text-center sm:text-left" style={{ color: avatarMsg === t("profile.avatarUpdated") ? "var(--bt-accent-dark)" : "#DC2626" }}>{avatarMsg}</p>
            )}

            {/* Rail de stats-clés — l'essentiel du profil chiffré d'un coup d'œil */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--bt-border)" }}>
              {heroStats.map((s, i) => <StatTile key={i} label={s.label} value={s.value} />)}
            </div>
          </div>
        </div>

        {/* Locked warning */}
        {profile?.locked && (
          <div className="card p-4 mt-4 flex items-start gap-3"
            style={{ borderColor: "rgba(220,38,38,0.35)", backgroundColor: "rgba(220,38,38,0.08)" }}>
            <span className="shrink-0" style={{ color: "#DC2626" }}><IconLock /></span>
            <div>
              <p className="text-sm font-medium" style={{ color: "#DC2626" }}>{t("profile.lockedTitle")}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{t("profile.lockedDesc")}</p>
            </div>
          </div>
        )}

        {/* ══ GRILLE DESKTOP : contenu 2/3 + gamification 1/3 ══
            Sur mobile, la colonne Progression vient en premier (ordre DOM),
            sur desktop elle passe à droite. */}
        <div className="mt-4 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

          {/* ── Colonne PROGRESSION (droite en desktop, 1ère en mobile) ── */}
          <div className="space-y-4 lg:order-2">
            <XPCard
              levelInfo={levelInfo}
              missions={missions}
              streak={streak}
              coachMessage={profileCoachMessage}
              coachId={newBadge ? `profile-badge-${newBadge.id}` : "profile-progress"}
              t={t}
            />
            <BadgesCard earnedBadgeIds={earnedBadgeIds} onBadgeClick={setSelectedBadge} t={t} />
            <ReferralCard t={t} />
          </div>

          {/* ── Colonne CONTENU (gauche en desktop) ── */}
          <div className="space-y-4 lg:col-span-2 lg:order-1">

            {/* Activité — heatmap GitHub + tuiles */}
            <div className="card overflow-hidden">
              <CardHead icon={<IconActivity />} label={t("profile.activitySection")} />
              <div className="px-5 pb-5">
                {profileTotalSecs > 0 ? (
                  <>
                    <StudyHeatmap sessions={profileSessions} />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                      <StatTile label={t("profile.hours30d")} value={formatMinutesShort(secs30d)} />
                      <StatTile label={t("profile.statAvgDay")} value={formatMinutesShort(avgDaySecs30)} />
                      <StatTile label={t("profile.statActiveDays")} value={activeDays} />
                      <StatTile label={t("profile.statObjDone")} value={completedObjCount} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.empty")}</p>
                )}
              </div>
            </div>

            {/* Préférences — réglages en place, aucun texte superflu */}
            <div className="card overflow-hidden">
              <CardHead icon={<IconSliders />} label={t("profile.preferencesSection")} />
              <SettingsRow icon={<IconGlobe />} label={t("profile.language")} right={
                <Segmented value={lang} onChange={changeLang}
                  options={[{ value: "fr", label: "FR" }, { value: "en", label: "EN" }]} />
              } />
              {sep}
              <SettingsRow icon={theme === "dark" ? <IconMoon /> : <IconSun />} label={t("profile.theme")} right={
                <Segmented value={theme} onChange={setTheme}
                  options={[
                    { value: "light", label: t("profile.themeLight") },
                    { value: "system", label: t("profile.themeSystem") },
                    { value: "dark", label: t("profile.themeDark") },
                  ]} />
              } />
              {sep}
              <PushRow t={t} user={user} />
            </div>

            {/* Compte — email, app, avis, légal, à propos + zone de sortie */}
            <div className="card overflow-hidden">
              <CardHead icon={<IconUser />} label={t("profile.accountSection")} />
              <SettingsRow icon={<IconMail />} label={t("profile.emailSection")}
                description={profile?.email || undefined}
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
              {sep}
              <SettingsRow icon={<IconSmartphone />} label={t("pwa.profileSection")}
                onClick={() => setShowPwa(s => !s)} right={<IconChevronDown open={showPwa} />} />
              {showPwa && (
                <div className="px-5 pb-4 pt-1 space-y-3">
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
              <SettingsRow accent icon={<IconFeedback />} href="/feedback"
                label={t("feedback.improveTitle")} right={<IconChevronRight />} />
              {sep}
              <SettingsRow icon={<IconLegal />} href="/legal"
                label={t("legal.profileRow")} right={<IconChevronRight />} />
              {sep}
              <SettingsRow icon={<IconInfo />} label={t("profile.about")}
                onClick={() => setShowAbout(s => !s)} right={<IconChevronDown open={showAbout} />} />
              {showAbout && (
                <div className="px-5 pb-4 pt-1 space-y-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                  <p><span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>blocus·tracker</span>{" "}{t("profile.aboutCreatedBy")}{" "}<span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>Mathias Dock</span>{", "}{t("profile.aboutRole")}</p>
                  <p>{t("profile.aboutDesc")}</p>
                </div>
              )}
              {sep}
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
                  {msg && <p className="text-xs text-center" style={{ color: "#DC2626" }}>{msg}</p>}
                </div>
              )}
            </div>

            {/* Administration — visible uniquement pour les admins */}
            {profile?.is_admin && (
              <div className="card overflow-hidden">
                <CardHead icon={<IconShield color="var(--bt-text-3)" />} label={t("nav.admin")} />
                <SettingsRow accent icon={<IconShield color="var(--bt-accent-dark)" />} href="/admin"
                  label={t("profile.adminDashboard")} right={<IconChevronRight />} />
                {sep}
                <SettingsRow accent icon={<IconFeedback />} href="/feedback"
                  label={t("profile.suggestionInbox")} right={<IconChevronRight />} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ Overlays ══════════════════════════════════════════ */}
      <BadgeSheet
        badge={selectedBadge}
        earned={selectedBadge ? earnedBadgeIds.includes(selectedBadge.id) : false}
        t={t}
        onClose={() => setSelectedBadge(null)}
      />
      <EditProfileModal
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        form={form} set={set} saveInfo={saveInfo} busy={busy} msg={msg}
        locked={!!profile?.locked} t={t}
      />
    </Layout>
  );
}
