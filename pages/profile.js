import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import UniPicker from "../components/UniPicker";
import StudyHeatmap from "../components/StudyHeatmap";
import LevelPill from "../components/LevelPill";
import MascotCoach from "../components/MascotCoach";
import AnimatedNumber from "../components/AnimatedNumber";
import PwaHomeScreenVisual from "../components/PwaHomeScreenVisual";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { useAuth } from "../contexts/AuthContext";
import { useI18n, detectDeviceLang } from "../contexts/I18nContext";
import { useConsent } from "../contexts/ConsentContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatMinutesShort, computeStreak, computeBestStreak, todayISO } from "../lib/format";
import { BADGES, computeEarnedBadgeIds } from "../lib/badges";
import { computeTotalXP, getLevelInfo, getDailyMissionDefs, evaluateMissions } from "../lib/xp";
import { clearUserLevelCache, loadUserLevelMap } from "../lib/userLevels";
import BadgeIcon from "../components/BadgeIcon";
import { optimizeAvatarImage } from "../lib/imageCompression";
import { isPushSupported, isIOS, isStandalone, enablePush, loginUser, getAppId, initOneSignal, collectPushDiagnostics } from "../lib/onesignal";
import { safeStoragePath, uploadErrorMessage, validateFinalUploadFile, validateUploadFile } from "../lib/security";
import { buildDataExport, downloadJson } from "../lib/dataExport";
import {
  DEFAULT_PRIVACY_SETTINGS,
  loadPrivacySettings,
  savePrivacySettings,
} from "../lib/privacySettings";
import {
  DEFAULT_SENSORY_PREFERENCES,
  playSensoryCue,
  readSensoryPreferences,
  writeSensoryPreferences,
} from "../lib/sensoryFeedback";

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
      if (!t) {
        // Jamais réglé → clair par défaut (ne PAS suivre l'OS : un iPhone en
        // sombre ne doit pas silencieusement passer l'app en sombre). Un choix
        // HÉRITÉ explicite reste respecté : bt_dark valait "true"/"false"
        // quand l'utilisateur avait lui-même tranché.
        const legacy = localStorage.getItem("bt_dark");
        t = legacy === "true" ? "dark" : "light";
      }
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

// ── Icônes ───────────────────────────────────────────────────
// Un seul jeu : grille 24, tracé 1,9, extrémités rondes, 18 px par défaut.
// La page mélangeait jusqu'ici sept épaisseurs et cinq tailles ; alignées dans
// une même colonne, les icônes se lisaient comme des polices dépareillées.
// Le dessin reste volontairement simple : à 18 px dans une pastille de 34,
// tout détail sous 2 px se referme et fait une tache.
function Glyph({ size = 18, style, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {children}
    </svg>
  );
}

const IconGlobe = () => <Glyph><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4a13.4 13.4 0 0 1 0 17.2 13.4 13.4 0 0 1 0-17.2Z"/></Glyph>;
const IconMoon = () => <Glyph><path d="M20.4 13.6A8.6 8.6 0 1 1 10.4 3.6a6.8 6.8 0 0 0 10 10Z"/></Glyph>;
const IconSun = () => <Glyph><circle cx="12" cy="12" r="4.4"/><path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4 6 6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6"/></Glyph>;
const IconSmartphone = () => <Glyph><rect x="6.2" y="2.6" width="11.6" height="18.8" rx="2.8"/><path d="M10.6 5.8h2.8M12 18.2h.01"/></Glyph>;
const IconVolume = () => <Glyph><path d="M11.4 4.6 6.6 8.8H3.2v6.4h3.4l4.8 4.2Z"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M18.2 6.4a8 8 0 0 1 0 11.2"/></Glyph>;
const IconVibration = () => <Glyph><rect x="8.4" y="3.2" width="7.2" height="17.6" rx="2.2"/><path d="M4.8 8.6v6.8M19.2 8.6v6.8M2 10.6v2.8M22 10.6v2.8"/></Glyph>;
const IconInfo = () => <Glyph><circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5M12 7.9h.01"/></Glyph>;
const IconLegal = () => <Glyph><path d="M6.2 3.4h7.2l5 5v12.2H6.2Z"/><path d="M13.4 3.4v5h5"/><path d="M9.2 13.2h5.6M9.2 16.6h3.8"/></Glyph>;
const IconFeedback = () => <Glyph><path d="M20.6 14.6a2.4 2.4 0 0 1-2.4 2.4H8.2l-4.8 3.6V5.8a2.4 2.4 0 0 1 2.4-2.4h12.4a2.4 2.4 0 0 1 2.4 2.4Z"/><path d="M8.2 8.6h7.6M8.2 12.2h4.8"/></Glyph>;
const IconShield = () => <Glyph><path d="M12 3 19 6v6c0 4.6-3 8.3-7 9-4-.7-7-4.4-7-9V6Z"/></Glyph>;
const IconShieldCheck = () => <Glyph><path d="M12 3 19 6v6c0 4.6-3 8.3-7 9-4-.7-7-4.4-7-9V6Z"/><path d="m9 12.1 2.2 2.2L15.4 10"/></Glyph>;
const IconLogOut = () => <Glyph><path d="M9.6 20.6H5.4a2.2 2.2 0 0 1-2.2-2.2V5.6a2.2 2.2 0 0 1 2.2-2.2h4.2"/><path d="m16 16.6 4.6-4.6L16 7.4"/><path d="M20.6 12H9.4"/></Glyph>;
const IconTrash = () => <Glyph><path d="M3.8 6.2h16.4"/><path d="M18.4 6.2 17.3 20a1.6 1.6 0 0 1-1.6 1.4H8.3A1.6 1.6 0 0 1 6.7 20L5.6 6.2"/><path d="M10 10.6v6.2M14 10.6v6.2"/><path d="M9.2 6.2V4.4a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.8"/></Glyph>;
const IconCamera = () => <Glyph size={14}><path d="M21.4 18.6a2.2 2.2 0 0 1-2.2 2.2H4.8a2.2 2.2 0 0 1-2.2-2.2V8.8a2.2 2.2 0 0 1 2.2-2.2h3l1.6-2.8h5.2l1.6 2.8h3a2.2 2.2 0 0 1 2.2 2.2Z"/><circle cx="12" cy="13.4" r="3.4"/></Glyph>;
const IconMail = () => <Glyph><rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.6"/><path d="m3.8 7.6 8.2 5.8 8.2-5.8"/></Glyph>;
const IconActivity = () => <Glyph><path d="M2.8 12.4h3.6l2.6-7.6 4.4 14 2.6-6.4h5.2"/></Glyph>;
const IconUser = () => <Glyph><circle cx="12" cy="8" r="4"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/></Glyph>;
const IconChevronDown = ({ open }) => (
  <Glyph size={17} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s cubic-bezier(0.22,1,0.36,1)", flexShrink: 0 }}>
    <path d="m6.6 9.4 5.4 5.2 5.4-5.2"/>
  </Glyph>
);
// Le chevron de navigation n'est pas une icône de rubrique : il ne prend pas
// la couleur de la ligne, il reste en gris de fond. Sinon deux signaux
// visuels de même force se disputent la rangée.
const IconChevronRight = () => (
  <span style={{ display: "flex", flexShrink: 0, color: "var(--bt-text-4)" }}>
    <Glyph size={17}><path d="m9.8 6.4 5.4 5.6-5.4 5.6"/></Glyph>
  </span>
);
const IconCookie = () => <Glyph><path d="M12 3.4a8.6 8.6 0 1 0 8.6 8.6 3.8 3.8 0 0 1-4.3-2.1A3.8 3.8 0 0 1 12 3.4Z"/><path d="M9.4 10h.01M14.2 14.4h.01M9 15.2h.01"/></Glyph>;
const IconMegaphone = () => <Glyph><path d="M3.4 9.6v4.8h3l6.6 4V5.6l-6.6 4Z"/><path d="M16.8 9.2a4 4 0 0 1 0 5.6M19.6 6.4a8 8 0 0 1 0 11.2"/></Glyph>;
const IconDownload = () => <Glyph><path d="M20.6 15.4v3.2a2.2 2.2 0 0 1-2.2 2.2H5.6a2.2 2.2 0 0 1-2.2-2.2v-3.2"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M12 15V3.4"/></Glyph>;
const IconLock = () => <Glyph><rect x="4" y="10.6" width="16" height="10.4" rx="2.6"/><path d="M7.8 10.6V7.6a4.2 4.2 0 0 1 8.4 0v3"/></Glyph>;
const IconAlert = () => <Glyph size={16}><path d="M10.5 4 2.6 17.8a1.7 1.7 0 0 0 1.5 2.6h15.8a1.7 1.7 0 0 0 1.5-2.6L13.5 4a1.7 1.7 0 0 0-3 0Z"/><path d="M12 9.6v4M12 16.9h.01"/></Glyph>;
const IconBell = () => <Glyph><path d="M18 9.6a6 6 0 0 0-12 0c0 5.4-2.2 6.4-2.6 7a.6.6 0 0 0 .5.9h16.2a.6.6 0 0 0 .5-.9c-.4-.6-2.6-1.6-2.6-7Z"/><path d="M13.8 20.4a2 2 0 0 1-3.6 0"/></Glyph>;
const IconEdit = () => <Glyph size={14}><path d="M16.6 3.4a2.7 2.7 0 0 1 3.8 3.8L7.6 20 2.8 21.2 4 16.4Z"/></Glyph>;
const IconAward = () => <Glyph><circle cx="12" cy="9.2" r="6"/><path d="m8.4 14.4-1.2 7 4.8-2.6 4.8 2.6-1.2-7"/></Glyph>;
const IconSliders = () => <Glyph><path d="M4.4 21v-6.2M4.4 10.6V3M12 21v-8.6M12 8.2V3M19.6 21v-4.6M19.6 12.2V3"/><path d="M2 14.8h4.8M9.6 12.4h4.8M17.2 16.4H22"/></Glyph>;
const IconGift = () => <Glyph><path d="M20 11.6V21H4v-9.4"/><rect x="2.4" y="7.2" width="19.2" height="4.4" rx="1.4"/><path d="M12 21V7.2"/><path d="M12 7.2H7.8a2.4 2.4 0 0 1 0-4.8c3.2 0 4.2 4.8 4.2 4.8ZM12 7.2h4.2a2.4 2.4 0 0 0 0-4.8C13 2.4 12 7.2 12 7.2Z"/></Glyph>;
const IconX = () => <Glyph size={17}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8"/></Glyph>;

// ── UI primitives (uniformes sur toute la page) ─────────────
// Titre de rubrique. La petite capitale grise de 10 px est abandonnée : à
// cette taille, l'espacement des capitales RALENTIT la lecture — on croyait
// gagner en hiérarchie, on perdait en lisibilité.
function SectionLabel({ children }) {
  return <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--bt-text-2)" }}>{children}</p>;
}

// Pastille d'icône. Le contour de la même famille que la teinte est ce qui
// fait tenir le glyphe comme un objet posé sur la carte, plutôt que comme un
// dessin qui flotte ; et la teinte donne à chaque rubrique un repère qu'on
// attrape avant même d'avoir lu le libellé. Cinq familles fermées, pas une
// couleur par rangée : la couleur CLASSE, elle ne décore pas.
function IconBox({ fam = "util", danger, size = 34, children }) {
  const bg   = danger ? "var(--bt-danger-bg)"     : `var(--bt-fam-${fam}-soft)`;
  const fg   = danger ? "var(--bt-danger)"        : `var(--bt-fam-${fam}-ink)`;
  const ring = danger ? "var(--bt-danger-border)" : `var(--bt-fam-${fam}-ring)`;
  return (
    <span className="flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.32),
        backgroundColor: bg, color: fg, boxShadow: `inset 0 0 0 1px ${ring}`,
      }}>
      {children}
    </span>
  );
}

// En-tête de carte standard : icône + libellé + contenu optionnel à droite.
function CardHead({ icon, fam, label, right }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <IconBox fam={fam} size={30}>{icon}</IconBox>}
        <SectionLabel>{label}</SectionLabel>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// Rangée de réglage — le contrôle est DANS la rangée, on n'en sort pas.
//  • onClick + right=<IconChevronDown> → se déplie sur place (accordéon)
//  • href + right=<IconChevronRight>   → mène à une autre page
//  • right=<contrôle>                  → s'ajuste sur place (toggle/segmented)
function SettingsRow({ icon, fam = "util", label, description, right, onClick, href, danger }) {
  const inner = (
    // Le contrôle passe à la ligne plutôt que d'écraser le texte : sur 375 px,
    // un bouton large ne laissait qu'une centaine de pixels au libellé et à la
    // description, tous deux tronqués. « Autorisation accordée, mais
    // l'inscription a échoué » s'affichait « Autorisation a... » — le
    // diagnostic était à l'écran, illisible, et nous a coûté plusieurs essais.
    <div className="flex flex-wrap items-center justify-between px-5 py-3.5 gap-3">
      <div className="flex items-center gap-3 min-w-[55%] flex-1">
        <IconBox fam={fam} danger={danger}>{icon}</IconBox>
        <div className="min-w-0">
          <span className="block text-sm font-medium" style={{ color: danger ? "var(--bt-danger)" : "var(--bt-text-1)" }}>{label}</span>
          {description && <span className="block text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>{description}</span>}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
  const hoverBg = danger ? "var(--bt-danger-bg)" : "var(--bt-subtle)";
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

// ── Liste groupée — la navigation du profil ──────────────────
// La page montrait tout, tout le temps : quatorze cartes dépliées, dont onze
// de réglages qu'on ouvre trois fois par an. Ce qui compte — qui je suis, où
// j'en suis, ce que j'ai gagné — se retrouvait noyé au milieu du reste.
// Ces rangées replient les réglages sans les cacher : le libellé reste
// visible, et `value` affiche l'état courant à droite. « Préférences › » ne
// dit rien ; « Préférences · FR · Clair › » répond à la question qu'on venait
// poser, sans ouvrir.
function NavRow({ fam = "util", icon, label, description, value, onClick, href, danger, chevron = true }) {
  const inner = (
    <>
      <IconBox fam={fam} danger={danger}>{icon}</IconBox>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight"
          style={{ color: danger ? "var(--bt-danger)" : "var(--bt-text-1)" }}>{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug" style={{ color: "var(--bt-text-3)" }}>{description}</span>}
      </span>
      {value && (
        <span className="shrink-0 truncate text-xs font-medium" style={{ color: "var(--bt-text-3)", maxWidth: 132 }} title={typeof value === "string" ? value : undefined}>
          {value}
        </span>
      )}
      {chevron && <IconChevronRight />}
    </>
  );
  const cls = `bt-prof-row${danger ? " bt-prof-row--danger" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function NavGroup({ children }) {
  return <div className="card overflow-hidden">{children}</div>;
}

// ── Feuille de détail ────────────────────────────────────────
// Même matière que les autres surfaces modales de la page : poignée et bord
// bas sur téléphone, carte centrée au-delà. C'est elle qui permet au profil de
// ne plus tout déballer d'un coup SANS rien enterrer — une rangée, un titre,
// le contenu entier, rien de tronqué. L'en-tête reste collé en haut : sur une
// longue liste de réglages, on doit pouvoir refermer sans remonter.
function DetailSheet({ open, title, closeLabel, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={title}
          className="rounded-t-[28px] sm:rounded-[24px] sm:max-w-md w-full sm:mx-4"
          style={{ backgroundColor: "var(--bt-surface)", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--bt-elev-3)" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5"
            style={{ backgroundColor: "var(--bt-surface)" }}>
            <h3 className="bt-section-title truncate">{title}</h3>
            <button onClick={onClose} aria-label={closeLabel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }}>
              <IconX />
            </button>
          </div>
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </>
  );
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

function MiniSwitch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors bt-press"
      style={{ backgroundColor: checked ? "var(--bt-accent)" : "var(--bt-border)" }}>
      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
    </button>
  );
}

// Tuile de statistique — même style dans le hero et la carte Activité.
// En creux et sans filet : bordée, elle faisait du cadre dans du cadre à
// l'intérieur d'une carte déjà posée. Le libellé quitte la petite capitale de
// 10 px en gris clair — elle se lisait moins bien qu'un corps normal et
// n'ajoutait aucune hiérarchie ; c'est le chiffre qui doit dominer, pas
// l'étiquette qui crie.
function StatTile({ label, value, sub }) {
  return (
    <div className="card-inset min-w-0 px-1.5 py-3 text-center">
      {/* Taille fluide : a 1,35 rem fixe, « 130h13 » ne tenait pas dans une
          tuile de 96 px sur un iPhone et se coupait en « 130h… ». Le chiffre
          reste le plus gros element de la tuile, mais il s'adapte a sa boite. */}
      <p className="font-num truncate text-[clamp(1.05rem,4.9vw,1.35rem)] font-bold leading-none tracking-[-0.02em] tabular-nums" style={{ color: "var(--bt-text-1)" }}>{value}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium" style={{ color: "var(--bt-text-2)" }} title={label}>{label}</p>
      {sub && <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--bt-text-4)" }}>{sub}</p>}
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
            <AnimatedNumber value={current.level} style={{ fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.1 }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "var(--bt-ink-text)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>{t(current.titleKey)}</p>
            <p className="tabular-nums" style={{ fontSize: 12, color: "var(--bt-ink-muted)", marginTop: 2 }}>
              <AnimatedNumber value={totalXP} suffix={` ${t("xp.xpLabel")}`} />
            </p>
          </div>
        </div>

        {/* XP progress bar */}
        <div style={{ marginBottom: 18 }}>
          <div className="tabular-nums" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--bt-ink-muted)", marginBottom: 6 }}>
            <span>{next ? <><AnimatedNumber value={progressXP} /> / <AnimatedNumber value={rangeXP} suffix=" XP" /></> : t("xp.maxLevel")}</span>
            {next && <span>{t("xp.nextLevel")} : {t(next.titleKey)}</span>}
          </div>
          <div style={{ height: 10, borderRadius: 99, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.14)" }}>
            <div style={{ height: "100%", borderRadius: 99, width: `${progressPct}%`, background: "linear-gradient(90deg, #0EA571 0%, #14B885 55%, #22E4A4 100%)", boxShadow: "0 0 10px rgba(20,184,133,0.70)", transition: "width 0.3s ease-out" }} />
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

// ── Badges — le tableau de chasse ────────────────────────────
// Deuxième grand objet visuel de la page après le niveau. Les emblèmes
// portent maintenant la couleur de leur famille : vue de loin, la planche
// raconte OÙ on progresse (temps d'étude, régularité, organisation, social)
// avant même qu'on lise un libellé. Les emplacements verrouillés restent
// neutres — c'est ce contraste qui donne envie d'aller les chercher.
function BadgesCard({ earnedBadgeIds, onBadgeClick, t }) {
  const pct = BADGES.length ? Math.round((earnedBadgeIds.length / BADGES.length) * 100) : 0;
  return (
    <div className="card overflow-hidden">
      <CardHead icon={<IconAward />} fam="streak" label={t("badge.title")}
        right={
          <span className="font-num text-xs font-bold tabular-nums px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
            <AnimatedNumber value={earnedBadgeIds.length} />/<AnimatedNumber value={BADGES.length} />
          </span>
        } />
      <div className="px-5 pb-5">
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
          <div className="h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none"
            style={{ transform: `scaleX(${pct / 100})`, backgroundColor: "var(--bt-accent)" }} />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {BADGES.map(b => {
            const earned = earnedBadgeIds.includes(b.id);
            return (
              // L'emblème porte lui-même sa surface : un second cadre autour
              // empâtait la grille et écrasait la distinction acquis/verrouillé.
              <button key={b.id} onClick={() => onBadgeClick(b)}
                title={t(b.labelKey)}
                aria-label={t(b.labelKey)}
                className="bt-press"
                style={{ display: "flex", flexShrink: 0, cursor: "pointer", background: "none", border: "none", padding: 0, transition: "transform 0.12s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.10)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
                <BadgeIcon id={b.id} earned={earned} size={44} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Parrainage — contenu nu, posé dans une feuille de détail ──
// Plus de carte ni d'en-tête : la feuille qui l'accueille porte déjà les deux.
// Une carte dans une carte, c'était exactement le cadre-dans-le-cadre qu'on
// enlève partout ailleurs.
function ReferralBody({ t, fallbackCode = "" }) {
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

  const code = stats?.code || fallbackCode || "";
  const shareLink = code ? `https://www.blocus-tracker.com/signup?ref=${code}` : "";
  const count = stats?.count || 0;
  const list = stats?.list || [];

  async function copy() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      playSensoryCue("confirm");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  return (
    <>
      <div className="px-5">
        <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>{t("referral.subtitle")}</p>
        <div className="mt-4 flex items-stretch overflow-hidden rounded-xl"
          style={{ backgroundColor: "var(--bt-subtle)", boxShadow: "inset 0 0 0 1px var(--bt-hairline)" }}>
          <div className="min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-xs"
            style={{ color: "var(--bt-text-2)" }} title={shareLink}>
            {shareLink || "…"}
          </div>
          <button onClick={copy} disabled={!shareLink}
            className="whitespace-nowrap px-3.5 text-xs font-semibold transition-colors"
            style={{ backgroundColor: copied ? "var(--bt-accent)" : "var(--bt-accent-dark)", color: "#fff" }}>
            {copied ? t("referral.copied") : t("referral.copy")}
          </button>
        </div>
        <p className="mt-3 text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
          {t("referral.signupsCount")} :{" "}
          <span className="font-num font-bold" style={{ color: "var(--bt-text-1)" }}><AnimatedNumber value={count} /></span>
        </p>
      </div>
      {count > 0 && (
        <div className="mt-4" style={{ borderTop: "1px solid var(--bt-hairline)" }}>
          <button onClick={() => setShowList(o => !o)}
            className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors"
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--bt-text-2)" }}>
              {t("referral.listTitle")}
            </span>
            <IconChevronDown open={showList} />
          </button>
          {showList && (
            <ul className="space-y-2.5 px-5 pb-2 pt-1">
              {list.map((r, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Avatar url={r.avatar_url} pseudo={r.pseudo} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>@{r.pseudo}</p>
                    <p className="text-[11px]" style={{ color: "var(--bt-text-3)" }}>{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>+{r.xp_awarded} XP</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

// ── Notifications push — rangée de réglage compacte ──────────
// Le motif d'echec doit survivre a un rechargement : sinon l'utilisateur qui
// va verifier ses reglages systeme revient sur un ecran muet, et l'information
// qui expliquait la panne est perdue.
const PUSH_ERROR_KEY = "bt_push_last_error";

function pushErrorMessage(t, reason, origin) {
  if (reason === "unconfigured") return t("push.unconfigured");
  if (reason === "blocked") return t("push.blocked");
  if (reason === "timeout") return t("push.timeout");
  if (reason === "origin") return t("push.origin").replace("{url}", origin || "");
  if (reason === "no-subscription") return t("push.noSubscription");
  if (reason === "denied") return t("push.denied");
  if (reason === "error") return t("push.error");
  return "";
}

function PushRow({ t, user }) {
  const [env, setEnv] = useState({ ready: false, supported: false, ios: false, standalone: false });
  const [permission, setPermission] = useState("default");
  const [busy, setBusy] = useState(false);
  // On garde le motif brut, pas le texte : il se traduit au rendu et suit donc
  // un changement de langue.
  const [failure, setFailure] = useState(null);
  const [diagCopied, setDiagCopied] = useState(false);

  async function copyDiagnostics() {
    const diag = await collectPushDiagnostics({ motif: failure?.reason || "?" });
    const text = Object.entries(diag)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.join(" | ") || "aucun") : String(v)}`)
      .join("\n");
    try { await navigator.clipboard.writeText(text); }
    catch (_) { window.prompt("Copie ce texte :", text.replace(/\n/g, " · ")); }
    setDiagCopied(true);
    setTimeout(() => setDiagCopied(false), 4000);
  }
  // Une permission accordée ne prouve rien : seul ce drapeau, posé après une
  // inscription OneSignal vérifiée, autorise l'affichage "activé".
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const supported = isPushSupported();
    setEnv({ ready: true, supported, ios: isIOS(), standalone: isStandalone() });
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    try {
      const ok = localStorage.getItem("bt_push_enabled") === "1";
      setConfirmed(ok);
      if (!ok) {
        const [reason, origin] = (localStorage.getItem(PUSH_ERROR_KEY) || "").split("|");
        if (reason) setFailure({ reason, origin });
      }
    } catch (_) {}

    // Précharge le SDK pour qui s'apprête à cliquer. Sans ça, le clic doit
    // attendre un chargement réseau avant d'atteindre subscribe(), et WebKit a
    // alors perdu le geste utilisateur : l'abonnement échoue sur iOS. Le coût
    // reste nul pour les visiteurs qui ne verront jamais le bouton.
    if (supported && getAppId() && typeof Notification !== "undefined"
        && Notification.permission !== "denied") {
      initOneSignal().catch(() => {});
    }
  }, []);

  async function enable() {
    setBusy(true); setFailure(null);
    const fail = (reason, origin) => {
      try { localStorage.setItem(PUSH_ERROR_KEY, origin ? `${reason}|${origin}` : reason); } catch (_) {}
      setFailure({ reason, origin });
    };
    try {
      const res = await enablePush();
      const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(perm);

      // Permission accordée ≠ inscription créée : sans ce garde-fou l'écran
      // affichait "activé" alors qu'aucune notification ne pouvait arriver.
      if (res?.ok && perm === "granted") {
        if (user) await loginUser(user.id);
        try {
          localStorage.setItem("bt_push_enabled", "1");
          localStorage.removeItem(PUSH_ERROR_KEY);
        } catch (_) {}
        setConfirmed(true);
        return;
      }
      if (res?.reason) fail(res.reason, res.origin);
    } catch (_) {
      fail("error");
    } finally {
      setBusy(false);
    }
  }

  if (!env.ready) return null;

  const appId = getAppId();
  const iosNeedsInstall = env.ios && !env.standalone;

  let description = t("push.desc");
  let right = null;
  if (!appId) {
    description = t("push.unconfigured");
  } else if (iosNeedsInstall) {
    description = t("push.iosHint");
  } else if (!env.supported) {
    description = t("push.unsupported");
  } else if (permission === "granted" && confirmed) {
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
      <SettingsRow fam="streak" icon={<IconBell />} label={t("push.title")}
        description={pushErrorMessage(t, failure?.reason, failure?.origin) || description}
        right={right} />
      {/* Le motif seul ne suffit pas à distinguer les causes possibles d'un
          abonnement manquant. Ce bouton met l'état technique de l'appareil dans
          le presse-papiers pour qu'un testeur puisse l'envoyer tel quel. */}
      {failure?.reason === "no-subscription" && (
        <div className="px-5 pb-4 -mt-1">
          <button type="button" onClick={copyDiagnostics}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
            {diagCopied ? t("push.diagCopied") : t("push.copyDiag")}
          </button>
        </div>
      )}
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
            {/* L'emblème porte sa propre couleur de famille et son propre
                contour : l'enfermer dans un second carré vert le contredisait
                — dans la feuille, TOUS les badges redevenaient verts. */}
            <div className={`mb-4 inline-flex ${earned ? "badge-shine" : ""}`}>
              <BadgeIcon id={badge.id} earned={earned} size={88} />
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
                  <div className="mb-1 flex items-center justify-between">
                    <label className="label mb-0">{t("profile.lastName")}</label>
                    <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("signup.optional")}</span>
                  </div>
                  <input className="input" value={form.last_name} onChange={e => set("last_name", e.target.value)} disabled={locked} />
                  {/* Vider le champ enregistre NULL (saveInfo fait `|| null`) :
                      c'est le geste par lequel on retire son nom du profil. */}
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--bt-text-3)" }}>{t("profile.lastNameHint")}</p>
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
  const { t, langPref, setLangPref } = useI18n();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { openSettings: openConsentSettings } = useConsent();
  const avatarInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const [earnedBadgeIds, setEarnedBadgeIds] = useState([]);
  const [profileSessions, setProfileSessions] = useState([]);
  const [frozenDays, setFrozenDays] = useState([]); // gel de série (v29)
  const [freezeStock, setFreezeStock] = useState(null); // stock restant (null = pas encore lu)
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
  const [tomorrowObjCount, setTomorrowObjCount] = useState(0);
  const [referredToday, setReferredToday] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState(null);
  // Feuille de détail ouverte : "activity" | "referral" | "prefs" | "account"
  // | "privacy". Une seule à la fois — deux surfaces modales empilées, c'est
  // un piège pour en sortir.
  const [sheet, setSheet] = useState(null);
  const [newBadgeId, setNewBadgeId] = useState(null);
  const [serverMissions, setServerMissions] = useState(null);
  const [canonicalLevelInfo, setCanonicalLevelInfo] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Préférences vie privée rattachées au compte. `unavailable` = migration v44
  // pas encore passée : on masque alors les réglages plutôt que d'afficher des
  // interrupteurs qui ne s'enregistreraient nulle part.
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY_SETTINGS);
  const [privacyAvailable, setPrivacyAvailable] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  // Premier chargement des donnees du profil. Tant qu'il n'est pas termine on
  // affiche un squelette : sinon la page rend un niveau 1, zero badge et des
  // compteurs a zero, que les gens lisent comme un bug.
  // NOTE : cette page a deja un `ready` qui concerne la restauration du THEME,
  // rien a voir — d'ou un nom distinct.
  const [dataReady, setDataReady] = useState(false);
  const forceSkeleton = useSkeletonHatch();
  const [sensoryPrefs, setSensoryPrefs] = useState(DEFAULT_SENSORY_PREFERENCES);
  const [form, setForm] = useState({
    first_name: "", last_name: "", university: "",
    study_field: "", study_year: "", study_year_custom: "", bio: "",
  });

  useEffect(() => {
    setSensoryPrefs(readSensoryPreferences());
  }, []);

  // Préférences vie privée du compte. Tant que la migration v44 n'est pas
  // passée, `unavailable` reste vrai et la carte n'affiche que ce qui
  // fonctionne réellement — jamais d'interrupteur décoratif.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      const { settings, unavailable } = await loadPrivacySettings(supabase, user.id);
      if (cancelled) return;
      setPrivacyAvailable(!unavailable);
      if (settings) setPrivacy(settings);
    })();
    return () => { cancelled = true; };
  }, [user]);

  function setSensoryPreference(key, enabled) {
    setSensoryPrefs(writeSensoryPreferences({ [key]: enabled }));
    if (key === "sound" && enabled) playSensoryCue("start");
  }

  useEffect(() => {
    if (newBadgeId) playSensoryCue("xp");
  }, [newBadgeId]);

  // ── Load badge / XP data ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadBadges() {
      const today = todayISO();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const [
        sessionsRes, examRes, objRes, friendRes, activityTotalsRes, existingRes,
        doneObjRes, todayDoneRes, groupRes,
        commMsgRes, tomorrowObjRes, referralStatsRes, syncedBadgesRes,
        missionsRes,
      ] = await Promise.all([
        supabase.from("sessions").select("started_at, duration_seconds, course_id, note").eq("user_id", user.id),
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("friendships").select("id", { count: "exact", head: true })
          .or(`requester.eq.${user.id},addressee.eq.${user.id}`).eq("status", "accepted"),
        // Publications et réactions sont supprimées au bout de 24 h (v46) :
        // les compter en direct ferait retomber la progression vers les badges
        // à zéro chaque jour. On lit le total à vie, alimenté à la création.
        supabase.from("user_activity_totals")
          .select("lifetime_posts, lifetime_reactions")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("user_badges").select("badge_id").eq("user_id", user.id),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("done", true),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("done", true).eq("scheduled_date", today),
        supabase.from("group_members").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("community_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("scheduled_date", tomorrowStr),
        supabase.rpc("get_my_referral_stats"),
        supabase.rpc("sync_my_badges"),
        supabase.rpc("get_my_daily_missions"),
      ]);

      const sessions = sessionsRes.data || [];
      // Jours gelés inclus : badges streak_x et XP cohérents avec l'affichage.
      const freezeRes = await runStreakFreezeUpkeep(supabase, user.id, sessions);
      const streak = computeStreak(sessions, freezeRes.supported ? freezeRes.frozenDays : []);
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
        postCount: activityTotalsRes.data?.lifetime_posts || 0,
        reactionsCount: activityTotalsRes.data?.lifetime_reactions || 0,
        groupMemberCount: groupRes.count || 0,
        communityMsgCount: commMsgRes.count || 0,
        referralCount: referralStatsRes.data?.ok ? (referralStatsRes.data.count || 0) : 0,
      });

      const synced = Array.isArray(syncedBadgesRes.data) ? syncedBadgesRes.data : [];
      const existing = (existingRes.data || []).map(b => b.badge_id);
      const allBadges = [...new Set([...synced, ...existing, ...earned])];

      // Badge rows are now awarded by the database. Keep the celebration local
      // and show it only when a badge appears after the first observed baseline.
      try {
        const seenKey = `blocus:seen-badges:${user.id}`;
        const rawSeen = localStorage.getItem(seenKey);
        const seen = rawSeen ? JSON.parse(rawSeen) : null;
        if (Array.isArray(seen)) {
          const newlySeen = allBadges.filter(id => !seen.includes(id));
          if (newlySeen.length) setNewBadgeId(newlySeen[0]);
        }
        localStorage.setItem(seenKey, JSON.stringify(allBadges));
      } catch (_) {
        // Progress remains correct if storage is unavailable.
      }
      setEarnedBadgeIds(allBadges);

      if (Array.isArray(missionsRes.data) && missionsRes.data.length) {
        setServerMissions(missionsRes.data.map(m => ({
          id: m.mission_id,
          key: m.label_key,
          xp: Number(m.xp || 0),
          done: Boolean(m.done),
        })));
      }
      setSessionCount(sessions.length);
      setExamCount(examRes.count || 0);
      setCompletedObjCount(completedObj);
      setTodayDoneObj(todayDoneRes.count || 0);
      setTomorrowObjCount(tomorrowObjRes.count || 0);

      const refList = referralStatsRes.data?.ok ? (referralStatsRes.data.list || []) : [];
      setReferredToday(refList.some(r => (r.created_at || "").slice(0, 10) === today));

      clearUserLevelCache();
      const levelMap = await loadUserLevelMap(supabase, [user.id], {
        selfUserId: user.id,
        includeSelfReferralStats: true,
      });
      setCanonicalLevelInfo(levelMap[user.id] || null);
    }
    loadBadges().finally(() => setDataReady(true));
  }, [user]);

  // ── Load sessions for heatmap + profile activity stats ───
  useEffect(() => {
    if (!user) return;
    const since370 = new Date();
    since370.setDate(since370.getDate() - 370);
    (async () => {
      const [{ data: heatSessions }, { data: allSessions }] = await Promise.all([
        supabase.from("sessions").select("started_at, duration_seconds, course_id, note").eq("user_id", user.id).gte("started_at", since370.toISOString()),
        supabase.from("sessions").select("duration_seconds").eq("user_id", user.id),
      ]);
      setProfileSessions(heatSessions || []);
      setProfileTotalSecs((allSessions || []).reduce((a, s) => a + s.duration_seconds, 0));
      // Gel de série : mêmes jours gelés que le dashboard (mémoïsé par jour).
      const freeze = await runStreakFreezeUpkeep(supabase, user.id, heatSessions || []);
      if (freeze.supported) { setFrozenDays(freeze.frozenDays); setFreezeStock(freeze.stock); }
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

  async function changeLang(pref) {
    setLangPref(pref);
    // profile.lang (NOT NULL) garde une valeur concrète = la langue effective.
    // Elle ne pilote plus l'affichage (l'app suit l'appareil / le choix local),
    // mais on la maintient à jour pour les données admin.
    const effective = pref === "auto" ? detectDeviceLang() : pref;
    if (user) {
      await supabase.from("profiles").update({ lang: effective }).eq("id", user.id);
      refreshProfile();
    }
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

  // La suppression passe par /api/account/delete : le RPC seul laissait en
  // ligne tous les FICHIERS envoyés (avatar, photos du feed, pièces jointes),
  // que la cascade base de données n'atteint pas. La route efface d'abord le
  // stockage, puis appelle le même RPC avec le jeton de la personne.
  // Repli sur le RPC direct si la route est indisponible : mieux vaut une
  // suppression incomplète qu'un compte qu'on ne peut plus supprimer du tout.
  async function deleteAccount() {
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        const res = await fetch("/api/account/delete", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { await signOut(); return; }
      }
    } catch (_) {}

    const { error } = await supabase.rpc("self_delete_user");
    if (error) { setDeleting(false); setMsg("Erreur : " + error.message); setDeleteConfirm(false); return; }
    await signOut();
  }

  // Un refus de notification doit tenir CÔTÉ SERVEUR : on l'écrit d'abord, et
  // on ne bascule l'interface que si l'écriture a réussi. L'inverse laisserait
  // croire à un refus enregistré alors que les envois continueraient.
  async function setPushPreference(key, value) {
    if (!user) return;
    const previous = privacy[key];
    setPrivacy(current => ({ ...current, [key]: value }));
    const { ok } = await savePrivacySettings(supabase, user.id, { [key]: value });
    if (!ok) {
      setPrivacy(current => ({ ...current, [key]: previous }));
      toast(t("toast.genericError"), "error");
    }
  }

  async function exportMyData() {
    if (!user || exporting) return;
    setExporting(true);
    try {
      const { export: payload, notes } = await buildDataExport(supabase, { user, profile });
      if (!payload) { toast(t("toast.genericError"), "error"); return; }
      downloadJson(payload, `blocus-tracker-${new Date().toISOString().slice(0, 10)}.json`);
      toast(notes.length ? t("privacy.exportPartial") : t("privacy.exportDone"));
    } catch (_) {
      toast(t("toast.genericError"), "error");
    } finally {
      setExporting(false);
    }
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
  const streak = computeStreak(profileSessions, frozenDays);
  const best = computeBestStreak(profileSessions, frozenDays);
  const activeDays = new Set(profileSessions.map(s => (s.started_at || "").slice(0, 10))).size;
  const avgDaySecs30 = Math.round(secs30d / 30);

  const todayStr = todayISO();
  const todaySessions = profileSessions.filter(s => s.started_at?.startsWith(todayStr));
  const todaySecs = todaySessions.reduce((a, s) => a + s.duration_seconds, 0);
  const todayMaxSessionSecs = todaySessions.length ? Math.max(...todaySessions.map(s => s.duration_seconds)) : 0;
  const studiedBeforeNoon = todaySessions.some(s => new Date(s.started_at).getHours() < 12);
  const todayCoursesSet = new Set(todaySessions.map(s => s.course_id).filter(Boolean));
  const todayCoursesCount = todayCoursesSet.size;
  const todaySessionCount = todaySessions.length;
  const hasStudyNote = todaySessions.some(s => Boolean((s.note || "").trim()));

  const fallbackTotalXP = computeTotalXP({
    totalMinutes: profileTotalSecs / 60,
    completedObjectives: completedObjCount,
    bestStreak: best, examCount, badgeCount: earnedBadgeIds.length,
    bonusXP: profile?.bonus_xp || 0,
  });
  const levelInfo = canonicalLevelInfo || getLevelInfo(fallbackTotalXP);
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
  const fallbackMissions = evaluateMissions(missionDefs, {
    todaySecs, todayMaxSessionSecs, todayDoneObj, streak,
    studiedBeforeNoon, tomorrowObjCount, todayCoursesCount,
    todaySessionCount, hasStudyNote,
    referredToday,
  });
  const missions = serverMissions || fallbackMissions;

  // Classement : #N parmi les actifs de la semaine (RPC leaderboard).
  const rankValue = myRank
    ? (Number(myRank.my_secs) > 0
        ? <AnimatedNumber value={Number(myRank.better_count) + 1} prefix="#" />
        : "—")
    : "…";

  const sep = <div style={{ height: 1, backgroundColor: "var(--bt-hairline)" }} />;

  // Les trois chiffres qui répondent à « où j'en suis » restent sous les yeux.
  // Les six autres — sessions, record, gels, moyennes — passent dans la
  // feuille « Mon activité » : ils comptent, mais personne n'ouvre son profil
  // pour les vérifier tous les jours, et à neuf tuiles côte à côte plus aucune
  // ne ressortait.
  const heroStats = [
    { label: t("profile.statTotalTime"), value: <AnimatedNumber value={profileTotalSecs} format={formatMinutesShort} /> },
    { label: t("profile.streakDays"), value: <AnimatedNumber value={streak} suffix={` ${t("dash.daysShort")}`} /> },
    { label: t("profile.statRank7d"), value: rankValue },
  ];

  const activityStats = [
    { label: t("profile.hours30d"), value: <AnimatedNumber value={secs30d} format={formatMinutesShort} /> },
    { label: t("profile.statAvgDay"), value: <AnimatedNumber value={avgDaySecs30} format={formatMinutesShort} /> },
    { label: t("profile.statActiveDays"), value: <AnimatedNumber value={activeDays} /> },
    { label: t("profile.statObjDone"), value: <AnimatedNumber value={completedObjCount} /> },
    { label: t("profile.statSessions"), value: <AnimatedNumber value={sessionCount} /> },
    { label: t("profile.bestStreakDays"), value: <AnimatedNumber value={best} suffix={` ${t("dash.daysShort")}`} /> },
    // Les gels n'étaient visibles NULLE PART sur le profil : on ne pouvait pas
    // savoir combien il en restait. Affiché dès que la fonctionnalité répond,
    // y compris à 0 (sinon on ne découvre jamais que ce filet existe).
    ...(freezeStock == null ? [] : [{
      label: t("streak.stockLabel"),
      value: (
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={freezeStock > 0 ? "#38BDF8" : "var(--bt-text-4)"} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5"/>
          </svg>
          <span className="font-num tabular-nums">{freezeStock}/2</span>
        </span>
      ),
      // La valeur affiche déjà « n/2 » : le sous-titre sert donc à dire QUAND
      // ça se recharge, l'info qui manque vraiment (et qui tient dans la tuile).
      sub: t("streak.stockRefill"),
    }]),
  ];

  const closeSheet = () => setSheet(null);
  // L'état courant s'affiche sur la rangée fermée : c'est ce qui distingue
  // « replié » de « caché ». On vient vérifier sa langue, on l'a sans ouvrir.
  const prefsSummary = [
    langPref === "auto" ? t("profile.languageAuto") : String(langPref).toUpperCase(),
    theme === "dark" ? t("profile.themeDark") : theme === "system" ? t("profile.themeSystem") : t("profile.themeLight"),
  ].join(" · ");

  if (!dataReady || forceSkeleton) return <Layout><PageContentSkeleton pathname="/profile" /></Layout>;

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto pb-10 bt-stagger">

        {/* ══ HERO — identité ══════════════════════════════════ */}
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
                  style={{ backgroundColor: "var(--bt-subtle)", boxShadow: "inset 0 0 0 1px var(--bt-hairline)", color: "var(--bt-text-1)" }}>
                  <IconEdit />
                  {t("profile.editProfile")}
                </button>
              </div>
            </div>

            {avatarMsg && (
              <p className="text-xs mt-2.5 text-center sm:text-left" style={{ color: avatarMsg === t("profile.avatarUpdated") ? "var(--bt-accent-dark)" : "var(--bt-danger)" }}>{avatarMsg}</p>
            )}

            {/* Rail de stats-clés — trois chiffres, pas neuf. */}
            <div className="grid grid-cols-3 gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--bt-hairline)" }}>
              {heroStats.map((s, i) => <StatTile key={i} label={s.label} value={s.value} sub={s.sub} />)}
            </div>
          </div>
        </div>

        {/* Locked warning */}
        {profile?.locked && (
          <div className="card p-4 mt-4 flex items-start gap-3"
            style={{ backgroundColor: "var(--bt-danger-bg)", boxShadow: "inset 0 0 0 1px var(--bt-danger-border)" }}>
            <span className="shrink-0" style={{ color: "var(--bt-danger)" }}><IconLock /></span>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--bt-danger)" }}>{t("profile.lockedTitle")}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{t("profile.lockedDesc")}</p>
            </div>
          </div>
        )}

        {/* ══ GRILLE ═══════════════════════════════════════════
            Deux natures de contenu, deux colonnes en desktop, un seul fil en
            mobile : à gauche ce qu'on vient REGARDER (niveau, missions,
            badges), à droite ce qu'on vient FAIRE (rangées de navigation et
            réglages). L'ordre du DOM est déjà le bon ordre mobile — aucune
            inversion d'ordre n'est nécessaire. */}
        <div className="mt-4 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

          {/* ── Colonne PROGRESSION ────────────────────────── */}
          <div className="space-y-4 lg:col-span-2">
            <XPCard
              levelInfo={levelInfo}
              missions={missions}
              streak={streak}
              coachMessage={profileCoachMessage}
              coachId={newBadge ? `profile-badge-${newBadge.id}` : "profile-progress"}
              t={t}
            />
            <BadgesCard earnedBadgeIds={earnedBadgeIds} onBadgeClick={setSelectedBadge} t={t} />
          </div>

          {/* ── Colonne RUBRIQUES ──────────────────────────── */}
          <div className="space-y-4">

            {/* Ce qui appartient à l'utilisateur : son activité, ses filleuls,
                sa voix. Trois portes, pas trois pavés dépliés. */}
            <NavGroup>
              <NavRow fam="time" icon={<IconActivity />}
                label={t("profile.activitySection")} description={t("profile.activityRowDesc")}
                onClick={() => setSheet("activity")} />
              <NavRow fam="social" icon={<IconGift />}
                label={t("referral.title")} description={t("referral.subtitle")}
                onClick={() => setSheet("referral")} />
              <NavRow fam="plan" icon={<IconFeedback />}
                label={t("feedback.improveTitle")} href="/feedback" />
            </NavGroup>

            {/* Notifications — jamais repliées. C'est le seul réglage qu'on
                vient vérifier en urgence (« pourquoi je ne reçois rien ? ») :
                le mettre derrière une rangée serait le rendre introuvable au
                moment précis où il compte. */}
            <div className="card overflow-hidden">
              <CardHead label={t("profile.notificationsSection")} />
              <PushRow t={t} user={user} />
              {privacyAvailable && (
                <>
                  {sep}
                  <SettingsRow fam="time" icon={<IconBell />} label={t("privacy.pushReminders")}
                    description={t("privacy.pushRemindersDesc")}
                    right={<MiniSwitch checked={privacy.push_reminders !== false}
                      onChange={value => setPushPreference("push_reminders", value)}
                      label={t("privacy.pushReminders")} />} />
                  {sep}
                  <SettingsRow fam="social" icon={<IconMegaphone />} label={t("privacy.pushAnnouncements")}
                    description={t("privacy.pushAnnouncementsDesc")}
                    right={<MiniSwitch checked={privacy.push_announcements !== false}
                      onChange={value => setPushPreference("push_announcements", value)}
                      label={t("privacy.pushAnnouncements")} />} />
                </>
              )}
            </div>

            {/* Réglages — ce qu'on ouvre trois fois par an. */}
            <NavGroup>
              <NavRow fam="util" icon={<IconSliders />}
                label={t("profile.preferencesSection")} value={prefsSummary}
                onClick={() => setSheet("prefs")} />
              <NavRow fam="plan" icon={<IconUser />}
                label={t("profile.accountSection")} value={profile?.email || undefined}
                onClick={() => setSheet("account")} />
              <NavRow fam="night" icon={<IconShieldCheck />}
                label={t("privacy.section")}
                onClick={() => setSheet("privacy")} />
            </NavGroup>

            {/* Administration — visible uniquement pour les admins */}
            {profile?.is_admin && (
              <NavGroup>
                <NavRow fam="util" icon={<IconShield />} label={t("profile.adminDashboard")} href="/admin" />
                <NavRow fam="util" icon={<IconFeedback />} label={t("profile.suggestionInbox")} href="/feedback" />
              </NavGroup>
            )}

            <NavGroup>
              <NavRow fam="util" icon={<IconLogOut />} label={t("profile.signOut")}
                onClick={signOut} chevron={false} />
            </NavGroup>
          </div>
        </div>
      </div>

      {/* ══ Feuilles de détail ════════════════════════════════ */}
      <DetailSheet open={sheet === "activity"} title={t("profile.activitySection")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <div className="px-5">
          {profileTotalSecs > 0 ? (
            <>
              <StudyHeatmap sessions={profileSessions} />
              <div className="grid grid-cols-2 gap-2 mt-4">
                {activityStats.map((s, i) => <StatTile key={i} label={s.label} value={s.value} sub={s.sub} />)}
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.empty")}</p>
          )}
        </div>
      </DetailSheet>

      <DetailSheet open={sheet === "referral"} title={t("referral.title")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <ReferralBody t={t} fallbackCode={profile?.referral_code} />
      </DetailSheet>

      <DetailSheet open={sheet === "prefs"} title={t("profile.preferencesSection")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <SettingsRow fam="plan" icon={<IconGlobe />} label={t("profile.language")} right={
          <Segmented value={langPref} onChange={changeLang}
            options={[{ value: "auto", label: t("profile.languageAuto") }, { value: "fr", label: "FR" }, { value: "en", label: "EN" }]} />
        } />
        {sep}
        <SettingsRow fam="night" icon={theme === "dark" ? <IconMoon /> : <IconSun />} label={t("profile.theme")} right={
          <Segmented value={theme} onChange={setTheme}
            options={[
              { value: "light", label: t("profile.themeLight") },
              { value: "system", label: t("profile.themeSystem") },
              { value: "dark", label: t("profile.themeDark") },
            ]} />
        } />
        {sep}
        <SettingsRow fam="time" icon={<IconVolume />} label={t("sensory.soundTitle")}
          description={t("sensory.soundDesc")}
          right={<MiniSwitch checked={sensoryPrefs.sound}
            onChange={enabled => setSensoryPreference("sound", enabled)}
            label={t("sensory.soundTitle")} />} />
        {sep}
        <SettingsRow fam="time" icon={<IconVibration />} label={t("sensory.hapticsTitle")}
          description={t("sensory.hapticsDesc")}
          right={<MiniSwitch checked={sensoryPrefs.haptics}
            onChange={enabled => setSensoryPreference("haptics", enabled)}
            label={t("sensory.hapticsTitle")} />} />
      </DetailSheet>

      <DetailSheet open={sheet === "account"} title={t("profile.accountSection")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <SettingsRow fam="plan" icon={<IconMail />} label={t("profile.emailSection")}
          description={profile?.email || undefined}
          onClick={() => setShowEmail(o => !o)} right={<IconChevronDown open={showEmail} />} />
        {showEmail && (
          <div className="px-5 pb-5 pt-1">
            <form onSubmit={saveEmail} className="space-y-2">
              <input className="input" type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} autoComplete="email" placeholder="ton@email.com" />
              <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("profile.emailHint")}</p>
              {emailMsg && <p className="text-xs" style={{ color: emailMsg === t("profile.emailSaved") ? "var(--bt-accent-dark)" : "var(--bt-danger)" }}>{emailMsg}</p>}
              <button className="btn-primary w-full" type="submit" disabled={emailBusy || !emailInput.trim() || emailInput === (profile?.email || "")}>
                {emailBusy ? t("profile.emailSaving") : t("profile.emailSave")}
              </button>
            </form>
          </div>
        )}
        {sep}
        <SettingsRow fam="util" icon={<IconSmartphone />} label={t("pwa.profileSection")}
          onClick={() => setShowPwa(s => !s)} right={<IconChevronDown open={showPwa} />} />
        {showPwa && (
          <div className="px-5 pb-4 pt-1 space-y-3">
            <div className="flex items-start gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: "var(--bt-reward-bg)", color: "var(--bt-reward-text)" }}>
              <span className="shrink-0 mt-0.5"><IconAlert /></span>
              <p className="text-xs">{t("pwa.safariNote")}</p>
            </div>
            <ol className="space-y-2">
              {[t("pwa.step1"), t("pwa.step2"), t("pwa.step3")].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
                  <span className="font-num font-bold shrink-0 w-4 text-right tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {/* Les étapes seules ne suffisent pas : « Sur l'écran d'accueil »
                est noyé dans un long menu iOS, personne ne le trouve. */}
            <PwaHomeScreenVisual />
          </div>
        )}
        {sep}
        <SettingsRow fam="util" icon={<IconLegal />} href="/legal"
          label={t("legal.profileRow")} right={<IconChevronRight />} />
        {sep}
        <SettingsRow fam="util" icon={<IconInfo />} label={t("profile.about")}
          onClick={() => setShowAbout(s => !s)} right={<IconChevronDown open={showAbout} />} />
        {showAbout && (
          <div className="px-5 pb-4 pt-1 space-y-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
            <p><span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>blocus·tracker</span>{" "}{t("profile.aboutCreatedBy")}{" "}<span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>Mathias Dock</span>{", "}{t("profile.aboutRole")}</p>
            <p>{t("profile.aboutDesc")}</p>
          </div>
        )}
      </DetailSheet>

      {/* Tout ce qui relève des droits de la personne au même endroit :
          consulter, exporter, régler ce qui la suit, supprimer. Éclaté sur
          trois écrans, un droit n'est un droit que sur le papier. */}
      <DetailSheet open={sheet === "privacy"} title={t("privacy.section")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <SettingsRow fam="night" icon={<IconCookie />} label={t("privacy.cookieSettings")}
          description={t("privacy.cookieSettingsDesc")}
          onClick={() => { closeSheet(); openConsentSettings(); }} right={<IconChevronRight />} />
        {sep}
        <SettingsRow fam="time" icon={<IconDownload />} label={t("privacy.exportData")}
          description={t("privacy.exportDataDesc")}
          onClick={exporting ? undefined : exportMyData}
          right={exporting
            ? <span className="text-xs font-semibold" style={{ color: "var(--bt-text-3)" }}>…</span>
            : <IconChevronRight />} />
        {sep}
        <SettingsRow fam="plan" icon={<IconLegal />} href="/legal?doc=privacy"
          label={t("privacy.yourRights")} description={t("privacy.yourRightsDesc")}
          right={<IconChevronRight />} />
        {sep}
        {!deleteConfirm ? (
          <SettingsRow danger icon={<IconTrash />} label={t("profile.deleteAccount")}
            description={t("privacy.deleteDesc")}
            onClick={() => setDeleteConfirm(true)} />
        ) : (
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-center" style={{ color: "var(--bt-danger)" }}>{t("profile.deleteWarning")}</p>
            <div className="flex gap-2">
              <button onClick={deleteAccount} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition" style={{ backgroundColor: "var(--bt-danger-solid)", color: "#fff" }}>
                {deleting ? "…" : t("profile.confirmDelete")}
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="btn-ghost flex-1 text-sm">{t("common.cancel")}</button>
            </div>
            {msg && <p className="text-xs text-center" style={{ color: "var(--bt-danger)" }}>{msg}</p>}
          </div>
        )}
      </DetailSheet>

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
