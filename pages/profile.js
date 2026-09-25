import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import Layout, { Avatar } from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import UniPicker from "../components/UniPicker";
import StudyFieldPicker from "../components/StudyFieldPicker";
import StudyProgramInput from "../components/StudyProgramInput";
import { STUDY_YEARS, studyYearShortLabel } from "../lib/studyYears";
import { universityShortName } from "../lib/universities";
import MascotMoment from "../components/MascotMoment";
import AnimatedNumber from "../components/AnimatedNumber";
import PwaHomeScreenVisual from "../components/PwaHomeScreenVisual";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { useAuth } from "../contexts/AuthContext";
import { useI18n, detectDeviceLang } from "../contexts/I18nContext";
import { useConsent } from "../contexts/ConsentContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatStudyTime, computeStreak, computeBestStreak } from "../lib/format";
import { BADGES } from "../lib/badges";
import { fetchCanonicalBadgeIds } from "../lib/badgeTruth.mjs";
import { computeTotalXP, getLevelInfo } from "../lib/xp";
import { clearUserLevelCache, loadUserLevelMap } from "../lib/userLevels";
import ProfileAchievementCards from "../components/ProfileAchievementCards";
import ProfileExchange from "../components/ProfileExchange";
import { exchangeState } from "../lib/exchange.mjs";
import Glyph from "../components/Glyph";
import DetailSheet from "../components/DetailSheet";
import { optimizeAvatarImage } from "../lib/imageCompression";
import { avatarUploadErrorMessage, uploadProfileAvatar, validateAvatarSourceFile } from "../lib/avatarUpload.mjs";
import { isPushSupported, isIOS, isStandalone, enablePush, getAppId, collectPushDiagnostics } from "../lib/onesignal";
import { clearPushOwner, readPushOwner } from "../lib/pushOwner.mjs";
import { pushErrorMessage } from "../lib/pushMessages";
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

// The catalogue order every badge count follows (lib/badgeTruth).
const BADGE_IDS = BADGES.map((badge) => badge.id);

// AuthContext.updateEmail codes → sentences in the reader's language.
const EMAIL_ERROR_KEYS = {
  required: "profile.emailRequired",
  invalid: "profile.emailInvalid",
  rate_limited: "profile.emailRateLimited",
  taken: "profile.emailTaken",
  failed: "profile.emailFailed",
};

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
      // Le script de _document.js pose `colorScheme` en style EN LIGNE, qui bat
      // la feuille de styles : sans cette ligne, changer de thème ici laissait
      // une déclaration périmée, et les ascenseurs comme le fond que peint le
      // navigateur restaient sur l'ancien schéma.
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
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
const YEARS = STUDY_YEARS.map(year => year.value);

// ── Icônes ───────────────────────────────────────────────────
// Dessins seulement : la grille, l'épaisseur et l'accessibilité viennent de
// components/Glyph. Cette page en avait sa propre copie, comme deux autres
// écrans — trois définitions du même objet, qui allaient diverger au premier
// ajustement. Les rangées de réglages restent à 22 px : sorties de leur
// pastille, les icônes ne peuvent plus compter sur un fond pour se faire voir.

const IconGlobe = () => <Glyph size={22}><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4a13.4 13.4 0 0 1 0 17.2 13.4 13.4 0 0 1 0-17.2Z"/></Glyph>;
const IconMoon = () => <Glyph size={22}><path d="M20.4 13.6A8.6 8.6 0 1 1 10.4 3.6a6.8 6.8 0 0 0 10 10Z"/></Glyph>;
const IconSun = () => <Glyph size={22}><circle cx="12" cy="12" r="4.4"/><path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4 6 6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6"/></Glyph>;
const IconSystem = () => <Glyph size={22}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></Glyph>;
const IconSmartphone = () => <Glyph size={22}><rect x="6.2" y="2.6" width="11.6" height="18.8" rx="2.8"/><path d="M10.6 5.8h2.8M12 18.2h.01"/></Glyph>;
const IconVolume = () => <Glyph size={22}><path d="M11.4 4.6 6.6 8.8H3.2v6.4h3.4l4.8 4.2Z"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M18.2 6.4a8 8 0 0 1 0 11.2"/></Glyph>;
const IconVibration = () => <Glyph size={22}><rect x="8.4" y="3.2" width="7.2" height="17.6" rx="2.2"/><path d="M4.8 8.6v6.8M19.2 8.6v6.8M2 10.6v2.8M22 10.6v2.8"/></Glyph>;
const IconInfo = () => <Glyph size={22}><circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5M12 7.9h.01"/></Glyph>;
const IconLegal = () => <Glyph size={22}><path d="M6.2 3.4h7.2l5 5v12.2H6.2Z"/><path d="M13.4 3.4v5h5"/><path d="M9.2 13.2h5.6M9.2 16.6h3.8"/></Glyph>;
const IconFeedback = () => <Glyph size={22}><path d="M20.6 14.6a2.4 2.4 0 0 1-2.4 2.4H8.2l-4.8 3.6V5.8a2.4 2.4 0 0 1 2.4-2.4h12.4a2.4 2.4 0 0 1 2.4 2.4Z"/><path d="M8.2 8.6h7.6M8.2 12.2h4.8"/></Glyph>;
const IconShield = () => <Glyph size={22}><path d="M12 3 19 6v6c0 4.6-3 8.3-7 9-4-.7-7-4.4-7-9V6Z"/></Glyph>;
const IconShieldCheck = () => <Glyph size={22}><path d="M12 3 19 6v6c0 4.6-3 8.3-7 9-4-.7-7-4.4-7-9V6Z"/><path d="m9 12.1 2.2 2.2L15.4 10"/></Glyph>;
const IconLogOut = () => <Glyph size={22}><path d="M9.6 20.6H5.4a2.2 2.2 0 0 1-2.2-2.2V5.6a2.2 2.2 0 0 1 2.2-2.2h4.2"/><path d="m16 16.6 4.6-4.6L16 7.4"/><path d="M20.6 12H9.4"/></Glyph>;
const IconTrash = () => <Glyph size={22}><path d="M3.8 6.2h16.4"/><path d="M18.4 6.2 17.3 20a1.6 1.6 0 0 1-1.6 1.4H8.3A1.6 1.6 0 0 1 6.7 20L5.6 6.2"/><path d="M10 10.6v6.2M14 10.6v6.2"/><path d="M9.2 6.2V4.4a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.8"/></Glyph>;
const IconCamera = () => <Glyph size={14}><path d="M21.4 18.6a2.2 2.2 0 0 1-2.2 2.2H4.8a2.2 2.2 0 0 1-2.2-2.2V8.8a2.2 2.2 0 0 1 2.2-2.2h3l1.6-2.8h5.2l1.6 2.8h3a2.2 2.2 0 0 1 2.2 2.2Z"/><circle cx="12" cy="13.4" r="3.4"/></Glyph>;
const IconMail = () => <Glyph size={22}><rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.6"/><path d="m3.8 7.6 8.2 5.8 8.2-5.8"/></Glyph>;
const IconActivity = () => <Glyph size={22}><path d="M2.8 12.4h3.6l2.6-7.6 4.4 14 2.6-6.4h5.2"/></Glyph>;
const IconUser = () => <Glyph size={22}><circle cx="12" cy="8" r="4"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/></Glyph>;
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
const IconCookie = () => <Glyph size={22}><path d="M12 3.4a8.6 8.6 0 1 0 8.6 8.6 3.8 3.8 0 0 1-4.3-2.1A3.8 3.8 0 0 1 12 3.4Z"/><path d="M9.4 10h.01M14.2 14.4h.01M9 15.2h.01"/></Glyph>;
const IconMegaphone = () => <Glyph size={22}><path d="M3.4 9.6v4.8h3l6.6 4V5.6l-6.6 4Z"/><path d="M16.8 9.2a4 4 0 0 1 0 5.6M19.6 6.4a8 8 0 0 1 0 11.2"/></Glyph>;
const IconDownload = () => <Glyph size={22}><path d="M20.6 15.4v3.2a2.2 2.2 0 0 1-2.2 2.2H5.6a2.2 2.2 0 0 1-2.2-2.2v-3.2"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M12 15V3.4"/></Glyph>;
const IconLock = () => <Glyph size={22}><rect x="4" y="10.6" width="16" height="10.4" rx="2.6"/><path d="M7.8 10.6V7.6a4.2 4.2 0 0 1 8.4 0v3"/></Glyph>;
const IconAlert = () => <Glyph size={16}><path d="M10.5 4 2.6 17.8a1.7 1.7 0 0 0 1.5 2.6h15.8a1.7 1.7 0 0 0 1.5-2.6L13.5 4a1.7 1.7 0 0 0-3 0Z"/><path d="M12 9.6v4M12 16.9h.01"/></Glyph>;
const IconPower = () => <Glyph size={22}><path d="M12 3.4v8"/><path d="M6.4 6.6a7.6 7.6 0 1 0 11.2 0"/></Glyph>;
const IconUsers = () => <Glyph size={22}><circle cx="9" cy="8" r="3.6"/><path d="M2.6 20a6.4 6.4 0 0 1 12.8 0"/><path d="M15.6 4.6a3.6 3.6 0 0 1 0 6.8M18 14.2a6.4 6.4 0 0 1 3.4 5.8"/></Glyph>;
const IconBell = () => <Glyph size={22}><path d="M18 9.6a6 6 0 0 0-12 0c0 5.4-2.2 6.4-2.6 7a.6.6 0 0 0 .5.9h16.2a.6.6 0 0 0 .5-.9c-.4-.6-2.6-1.6-2.6-7Z"/><path d="M13.8 20.4a2 2 0 0 1-3.6 0"/></Glyph>;
const IconEdit = () => <Glyph size={14}><path d="M16.6 3.4a2.7 2.7 0 0 1 3.8 3.8L7.6 20 2.8 21.2 4 16.4Z"/></Glyph>;
const IconAward = () => <Glyph size={22}><circle cx="12" cy="9.2" r="6"/><path d="m8.4 14.4-1.2 7 4.8-2.6 4.8 2.6-1.2-7"/></Glyph>;
const IconSliders = () => <Glyph size={22}><path d="M4.4 21v-6.2M4.4 10.6V3M12 21v-8.6M12 8.2V3M19.6 21v-4.6M19.6 12.2V3"/><path d="M2 14.8h4.8M9.6 12.4h4.8M17.2 16.4H22"/></Glyph>;
const IconGift = () => <Glyph size={22}><path d="M20 11.6V21H4v-9.4"/><rect x="2.4" y="7.2" width="19.2" height="4.4" rx="1.4"/><path d="M12 21V7.2"/><path d="M12 7.2H7.8a2.4 2.4 0 0 1 0-4.8c3.2 0 4.2 4.8 4.2 4.8ZM12 7.2h4.2a2.4 2.4 0 0 0 0-4.8C13 2.4 12 7.2 12 7.2Z"/></Glyph>;
const IconX = () => <Glyph size={17}><path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8"/></Glyph>;

// ── UI primitives (uniformes sur toute la page) ─────────────
// Titre de rubrique. La petite capitale grise de 10 px est abandonnée : à
// cette taille, l'espacement des capitales RALENTIT la lecture — on croyait
// gagner en hiérarchie, on perdait en lisibilité.
function SectionLabel({ children }) {
  return <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--bt-text-2)" }}>{children}</p>;
}

// Icône de rangée. Elle est POSÉE dans la ligne, sans pastille ni fond : une
// tuile pastel derrière chaque réglage donnait à la page l'air d'un tableau
// de bord générique, et surtout mettait douze rubriques au même niveau de
// cri — quand tout est signalé, plus rien ne l'est.
//
// L'icône seule porte le sens ; c'est le libellé qui la nomme. Trois tons,
// pas douze couleurs :
//   neutral — la règle. Encre foncée, contraste franc.
//   accent  — le vert de marque, réservé à ce qui appartient au produit
//             lui-même (les données d'étude). Un seul par écran.
//   danger  — sortie et suppression, les deux gestes dont on ne revient pas
//             tout seul.
const ROW_ICON_COLOR = {
  neutral: "var(--bt-text-1)",
  accent: "var(--bt-accent-dark)",
  danger: "var(--bt-danger)",
};

function RowIcon({ tone = "neutral", children }) {
  return (
    <span className="flex shrink-0 items-center justify-center"
      style={{ width: 26, color: ROW_ICON_COLOR[tone] || ROW_ICON_COLOR.neutral }}>
      {children}
    </span>
  );
}

// En-tête de carte standard : icône + libellé + contenu optionnel à droite.
function CardHead({ icon, tone, label, right }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <RowIcon tone={tone}>{icon}</RowIcon>}
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
function SettingsRow({ icon, tone, label, description, right, onClick, href, danger, inlineControl = false }) {
  const inner = (
    // Le contrôle passe à la ligne plutôt que d'écraser le texte : sur 375 px,
    // un bouton large ne laissait qu'une centaine de pixels au libellé et à la
    // description, tous deux tronqués. « Autorisation accordée, mais
    // l'inscription a échoué » s'affichait « Autorisation a... » — le
    // diagnostic était à l'écran, illisible, et nous a coûté plusieurs essais.
    <div className={`flex items-center justify-between px-[18px] py-4 ${inlineControl ? "gap-2" : "flex-wrap gap-3"}`}>
      <div className={`flex flex-1 items-center gap-3.5 ${inlineControl ? "min-w-0" : "min-w-[55%]"}`}>
        <RowIcon tone={danger ? "danger" : tone}>{icon}</RowIcon>
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

// A line of short facts separated by "·". The separator is glued to the
// fact before it by a non-breaking space, so a wrapped line never starts with
// a lone dot — while a long free-text program can still wrap inside itself.
function Parts({ items }) {
  return items.map((item, index) => (
    <span key={index} className="bt-profile-part">{item}{index < items.length - 1 ? "\u00a0·" : ""}{" "}</span>
  ));
}

// ── Liste groupée — la navigation du profil ──────────────────
// La page montrait tout, tout le temps : quatorze cartes dépliées, dont onze
// de réglages qu'on ouvre trois fois par an. Ce qui compte — qui je suis, où
// j'en suis, ce que j'ai gagné — se retrouvait noyé au milieu du reste.
// Ces rangées replient les réglages sans les cacher : le libellé reste
// visible, et `value` affiche l'état courant à droite. « Préférences › » ne
// dit rien ; « Préférences · FR · Clair › » répond à la question qu'on venait
// poser, sans ouvrir.
function NavRow({ tone, icon, label, description, value, onClick, href, danger, chevron = true }) {
  // Un geste d'avertissement se signale entier : une icône rouge sous un
  // libellé noir se lit comme une erreur de rendu, pas comme une mise en garde.
  const alarm = danger || tone === "danger";
  const inner = (
    <>
      <RowIcon tone={alarm ? "danger" : tone}>{icon}</RowIcon>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight"
          style={{ color: alarm ? "var(--bt-danger)" : "var(--bt-text-1)" }}>{label}</span>
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
  const cls = `bt-prof-row${alarm ? " bt-prof-row--danger" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function NavGroup({ children }) {
  return <div className="card overflow-hidden">{children}</div>;
}

// Segmented control générique (langue, thème…) — le pattern de réglage
// moderne de la page : état visible d'un coup d'œil, bascule en un tap.
function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 10, padding: 2 }}>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} title={o.title || o.label}
          aria-label={o.label} aria-pressed={value === o.value}
          className={`rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 ${o.icon ? "h-11 w-11" : "px-2.5 py-1"}`}
          style={value === o.value ? { backgroundColor: "var(--bt-action)", color: "#fff" } : { color: o.icon ? "var(--bt-text-2)" : "var(--bt-text-3)" }}>
          {o.icon || o.label}
        </button>
      ))}
    </div>
  );
}

function MiniSwitch({ checked, onChange, label, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors bt-press disabled:opacity-40"
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
    catch (_) { window.prompt(t("push.copyPrompt"), text.replace(/\n/g, " · ")); }
    setDiagCopied(true);
    setTimeout(() => setDiagCopied(false), 4000);
  }
  // Une permission accordée ne prouve rien : seul ce drapeau, posé après une
  // inscription OneSignal vérifiée, autorise l'affichage "activé". Il est
  // propre au COMPTE (lib/pushOwner.mjs) : sur un appareil partagé, le compte
  // suivant n'hérite pas de l'activation du précédent.
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const supported = isPushSupported();
    setEnv({ ready: true, supported, ios: isIOS(), standalone: isStandalone() });
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    try {
      const ok = readPushOwner(localStorage, user?.id).mine;
      setConfirmed(ok);
      if (!ok) {
        const [reason, origin] = (localStorage.getItem(PUSH_ERROR_KEY) || "").split("|");
        if (reason) setFailure({ reason, origin });
      }
    } catch (_) {}
    // Plus de préchargement du SDK ici. Il servait à préserver le geste
    // utilisateur sur iOS, ce que enablePush() garantit désormais en demandant
    // la permission par l'API native avant toute attente. Il faisait en
    // revanche réécrire le worker par OneSignal à la simple ouverture de la
    // page : c'était le point de départ de la boucle de rechargement du profil,
    // et une initialisation lancée trop tôt dont l'activation héritait.
  }, [user?.id]);

  async function enable() {
    setBusy(true); setFailure(null);
    const fail = (reason, origin) => {
      try { localStorage.setItem(PUSH_ERROR_KEY, origin ? `${reason}|${origin}` : reason); } catch (_) {}
      setFailure({ reason, origin });
    };
    try {
      // L'abonnement naît rattaché au compte : enablePush fait le login avant
      // de s'abonner, plus besoin de le rattacher après coup.
      const res = await enablePush(user?.id);
      const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(perm);

      // Permission accordée ≠ inscription créée : sans ce garde-fou l'écran
      // affichait "activé" alors qu'aucune notification ne pouvait arriver.
      // enablePush a déjà rattaché l'appareil à ce compte (lib/pushOwner.mjs).
      if (res?.ok && perm === "granted") {
        try { localStorage.removeItem(PUSH_ERROR_KEY); } catch (_) {}
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
        <Glyph size={11}><polyline points="20 6 9 17 4 12"/></Glyph>
        OK
      </span>
    );
  } else if (permission === "denied") {
    description = t("push.denied");
  } else {
    right = (
      <button onClick={enable} disabled={busy}
        className="px-3 py-1.5 rounded-full text-xs font-semibold transition disabled:opacity-60"
        style={{ backgroundColor: "var(--bt-action)", color: "#fff" }}>
        {busy ? "…" : t("push.enable")}
      </button>
    );
  }

  return (
    <>
      <SettingsRow icon={<IconBell />} label={t("push.title")}
        description={pushErrorMessage(t, failure?.reason, failure?.origin) || description}
        right={right} />
      {/* Le motif seul ne suffit pas à distinguer les causes possibles d'un
          abonnement manquant. Ce bouton met l'état technique de l'appareil dans
          le presse-papiers pour qu'un testeur puisse l'envoyer tel quel. */}
      {["no-subscription", "slow", "preparing", "error", "blocked", "unsupported"].includes(failure?.reason) && (
        <div className="px-5 pb-4 -mt-1">
          <button type="button" onClick={copyDiagnostics}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-hairline)" }}>
            {diagCopied ? t("push.diagCopied") : t("push.copyDiag")}
          </button>
        </div>
      )}
    </>
  );
}

// ── Modal d'édition du profil (infos personnelles) ───────────
function EditProfileModal({ open, onClose, onOpenExchange, exchangeSummary, form, set, saveInfo, busy, msg, locked, t }) {
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
              <button type="button" onClick={onOpenExchange} disabled={!!locked}
                className="bt-tap flex w-full items-center justify-between gap-3 border-t py-3 text-left text-sm disabled:opacity-50"
                style={{ borderColor: "var(--bt-border)", color: "var(--bt-text-1)" }}>
                <span className="font-semibold">{t("profile.exchangeTitle")}</span>
                <span className="text-right" style={{ color: "var(--bt-text-2)" }}>{exchangeSummary}</span>
              </button>
              <StudyFieldPicker value={form.broad_field} onChange={value => set("broad_field", value)} disabled={!!locked} id="profile-broad-field" />
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label className="label">{t("profile.year")}</label>
                  <select className="input" value={form.study_year} onChange={e => { set("study_year", e.target.value); set("study_year_custom", ""); }} disabled={locked}>
                    <option value="">—</option>
                    {STUDY_YEARS.map(year => <option key={year.value} value={year.value}>{t(year.key)}</option>)}
                  </select>
                </div>
              </div>
              <StudyProgramInput value={form.study_field} onChange={value => set("study_field", value)} disabled={!!locked} id="profile-program" />
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
              {msg && <p className="text-xs text-center" role={msg.kind === "error" ? "alert" : "status"} style={{ color: msg.kind === "error" ? "var(--bt-danger)" : "var(--bt-accent-text)" }}>{msg.text}</p>}
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
  const [avatarMsg, setAvatarMsg] = useState(null);
  // null = the server did not answer: the card then says nothing about the
  // count rather than announcing an empty collection.
  const [earnedBadgeIds, setEarnedBadgeIds] = useState(null);
  const [profileSessions, setProfileSessions] = useState([]);
  const [frozenDays, setFrozenDays] = useState([]); // gel de série (v29)
  const [freezeStock, setFreezeStock] = useState(null); // stock restant (null = pas encore lu)
  const [profileTotalSecs, setProfileTotalSecs] = useState(0);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showExchange, setShowExchange] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPwa, setShowPwa] = useState(false);
  const [pwaPlatform, setPwaPlatform] = useState(null);
  const [examCount, setExamCount] = useState(0);
  const [completedObjCount, setCompletedObjCount] = useState(0);
  // Feuille de détail ouverte : "activity" | "referral" | "prefs" | "account"
  // | "privacy". Une seule à la fois — deux surfaces modales empilées, c'est
  // un piège pour en sortir.
  const [sheet, setSheet] = useState(null);
  const [newBadgeId, setNewBadgeId] = useState(null);
  const [canonicalLevelInfo, setCanonicalLevelInfo] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Préférences vie privée rattachées au compte. `unavailable` = migration v44
  // pas encore passée : on masque alors les réglages plutôt que d'afficher des
  // interrupteurs qui ne s'enregistreraient nulle part.
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY_SETTINGS);
  const [privacyAvailable, setPrivacyAvailable] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);
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
    study_field: "", broad_field: "", study_year: "", study_year_custom: "", bio: "",
  });

  useEffect(() => {
    setSensoryPrefs(readSensoryPreferences());
    setPwaPlatform(isStandalone() ? "installed" : isIOS() ? "ios" : "browser");
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
  // Badges: the server's list only (lib/badgeTruth), exactly what the Badges
  // page reads. The profile used to recompute the rules here and add its own
  // result — with UTC days and without blocus periods — so it announced more
  // badges than the collection it links to. Level and XP come from the
  // canonical RPC (loadUserLevelMap); the counts below only feed its offline
  // fallback.
  useEffect(() => {
    if (!user) return;
    async function loadBadges() {
      const [examRes, doneObjRes, badgeIds] = await Promise.all([
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("objectives").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("done", true),
        fetchCanonicalBadgeIds(supabase, user.id, BADGE_IDS),
      ]);
      const allBadges = badgeIds || [];

      // The celebration stays local: it shows a badge that appeared since the
      // last visit, never on the first observation.
      if (badgeIds) {
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
      }

      setExamCount(examRes.count || 0);
      setCompletedObjCount(doneObjRes.count || 0);

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

  useEffect(() => {
    if (profile) {
      const isCustomYear = profile.study_year && !YEARS.includes(profile.study_year);
      setForm({
        first_name: profile.first_name || "", last_name: profile.last_name || "",
        university: profile.university || "", study_field: profile.study_field || "",
        broad_field: profile.broad_field || "",
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
    const input = e.currentTarget;
    const rawFile = input.files?.[0];
    if (!rawFile) return;
    const precheck = validateAvatarSourceFile(rawFile);
    if (!precheck.ok) {
      setAvatarMsg({ kind: "error", text: avatarUploadErrorMessage(t, precheck) });
      input.value = "";
      return;
    }
    setBusy(true); setAvatarMsg(null);
    try {
      const result = await uploadProfileAvatar({
        client: supabase,
        userId: user.id,
        sourceFile: rawFile,
        previousAvatarUrl: profile?.avatar_url,
        processImage: optimizeAvatarImage,
      });
      if (!result.ok) {
        setAvatarMsg({ kind: "error", text: avatarUploadErrorMessage(t, result) });
        return;
      }
      await refreshProfile();
      setAvatarMsg({ kind: "success", text: t("profile.avatarUpdated") });
    } catch {
      setAvatarMsg({ kind: "error", text: t("profile.avatarUploadError") });
    } finally {
      setBusy(false);
      input.value = "";
    }
  }

  async function saveEmail(e) {
    e.preventDefault(); setEmailMsg(null);
    if (!emailInput.trim()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) { setEmailMsg({ kind: "error", text: t("profile.emailInvalid") }); return; }
    setEmailBusy(true);
    const { error, code } = await updateEmail(emailInput);
    setEmailBusy(false);
    // AuthContext answers with a code; the sentence is chosen here, in the
    // reader's language — never the French text it also returns.
    if (error) setEmailMsg({ kind: "error", text: t(EMAIL_ERROR_KEYS[code] || "profile.emailFailed") });
    else { setEmailMsg({ kind: "success", text: t("profile.emailSaved") }); refreshProfile(); }
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
        if (res.ok) {
          try { clearPushOwner(localStorage); } catch (_) {}
          await signOut();
          return;
        }
      }
    } catch (_) {}

    const { error } = await supabase.rpc("self_delete_user");
    if (error) { console.error("Account deletion failed:", error); setDeleting(false); setMsg({ kind: "error", text: t("profile.deleteError") }); setDeleteConfirm(false); return; }
    try { clearPushOwner(localStorage); } catch (_) {}
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
    e.preventDefault(); setBusy(true); setMsg(null);
    const actualYear = form.study_year === "Autre" ? (form.study_year_custom.trim() || "Autre") : form.study_year;
    const { error } = await supabase.from("profiles").update({
      first_name: form.first_name.trim() || null, last_name: form.last_name.trim() || null,
      university: form.university.trim() || null, study_field: form.study_field.trim() || null,
      broad_field: form.broad_field || null,
      study_year: actualYear || null, bio: form.bio.trim() || null,
    }).eq("id", user.id);
    setBusy(false);
    if (error) { console.error("Profile save failed:", error); setMsg({ kind: "error", text: t("profile.saveError") }); toast(t("toast.genericError"), "error"); }
    else { setMsg({ kind: "success", text: t("profile.updated") }); refreshProfile(); toast(t("toast.saved")); }
  }

  // ── Computed values ──────────────────────────────────────
  const streak = computeStreak(profileSessions, frozenDays);
  const best = computeBestStreak(profileSessions, frozenDays);
  const fallbackTotalXP = computeTotalXP({
    totalMinutes: profileTotalSecs / 60,
    completedObjectives: completedObjCount,
    bestStreak: best, examCount, badgeIds: earnedBadgeIds || [],
    bonusXP: profile?.bonus_xp || 0,
  });
  const levelInfo = canonicalLevelInfo || getLevelInfo(fallbackTotalXP);
  const newBadge = newBadgeId ? BADGES.find(b => b.id === newBadgeId) : null;
  // The Progression card already carries the mascot. A second shiba right
  // below it is only justified by a real event — a badge that just arrived,
  // the last level reached — never by a daily "your streak is safe": that is
  // the Timer's message, not the profile's.
  const profileMoment = newBadge
    ? { key: `badge-${newBadge.id}`, mood: "celebrating", frequency: "once",
        message: t("mascot.badge").replace("{badge}", t(newBadge.labelKey)) }
    : !levelInfo.next
      ? { key: "level-max", mood: "celebrating", frequency: "once", message: t("mascot.maxLevel") }
      : null;

  const sep = <div style={{ height: 1, backgroundColor: "var(--bt-hairline)" }} />;

  // Identity in one short line: program, year, institution — each in its
  // shortest faithful form ("Médecine · Bac 2 · UCLouvain"), never the
  // onboarding sentence "Premier cycle (Bachelor / Licence) · année 2".
  const identityParts = [
    profile?.study_field,
    studyYearShortLabel(profile?.study_year, t),
    universityShortName(profile?.university),
  ].filter(Boolean);
  const exchangeStatus = exchangeState(profile, new Date(), profile?.timezone);
  const exchangeSummary = exchangeStatus === "active"
    ? t("profile.exchangeActiveShort").replace("{university}", universityShortName(profile?.exchange_university))
    : exchangeStatus === "upcoming" ? t("profile.exchangeUpcomingShort")
      : profile?.exchange_university ? t("profile.exchangeEndedShort") : t("profile.exchangeAdd");

  // Two facts, written as information rather than drawn as tiles: the time
  // studied and the streak. The weekly rank left — empty for anyone who has
  // not studied this week, and a competition, not an identity. The freeze
  // stock comes along with the streak it protects (it used to be visible only
  // inside "Mon activité").
  const metrics = [
    profileTotalSecs > 0 && t("profile.metricStudied").replace("{time}", formatStudyTime(profileTotalSecs)),
    streak > 0 && t(streak === 1 ? "profile.metricStreakOne" : "profile.metricStreak").replace("{n}", streak),
    streak > 0 && freezeStock != null && t("profile.metricFreezes").replace("{n}", freezeStock),
  ].filter(Boolean);

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
      <div className="bt-profile mx-auto pb-10 bt-stagger">

        {/* ══ IDENTITÉ ═══════════════════════════════════════════
            Qui on est, en une rangée. Plus de bannière décorative, plus de
            grand avatar posé dessus, plus de trois tuiles de chiffres : c'est
            la page d'identité d'un étudiant, pas l'en-tête d'un réseau social.
            La progression arrive juste en dessous, dès le premier écran. */}
        <header className="bt-profile-id">
          <div className="bt-profile-avatar">
            <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={64} />
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={busy}
              title={t("profile.changePhoto")} aria-label={t("profile.changePhoto")}
              className="bt-profile-photo-btn">
              {busy ? <span className="block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <IconCamera />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" className="hidden" onChange={uploadAvatar} disabled={busy} />
          </div>

          <div className="bt-profile-id-text">
            <h1 className="font-display">{displayName(profile)}</h1>
            <p className="bt-profile-id-line"><Parts items={[`@${profile?.pseudo || ""}`, ...identityParts]} /></p>
            {exchangeStatus === "active" && <p className="bt-profile-id-line">
              {t("profile.exchangeActiveShort").replace("{university}", universityShortName(profile?.exchange_university))}
            </p>}
            {profile?.bio && <p className="bt-profile-bio">{profile.bio}</p>}
            {metrics.length > 0 && <p className="bt-profile-metrics"><Parts items={metrics} /></p>}
            {avatarMsg && (
              <p className="bt-profile-inline-msg" role={avatarMsg.kind === "error" ? "alert" : "status"}
                data-kind={avatarMsg.kind}>{avatarMsg.text}</p>
            )}
          </div>

          <button type="button" onClick={() => { setMsg(null); setShowEditProfile(true); }}
            className="bt-profile-edit bt-press">
            <IconEdit />
            <span>{t("profile.editProfile")}</span>
          </button>
        </header>

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

        {/* ══ LES DEUX PORTES ════════════════════════════════════
            Progression et collection : ce qui distingue ce profil de n'importe
            quel autre. Elles prennent toute la largeur, directement sous
            l'identité — elles étaient serrées dans une demi-colonne pendant
            que l'en-tête et les réglages occupaient l'écran. */}
        <div className="bt-profile-doors">
          <ProfileAchievementCards levelInfo={levelInfo} earnedBadgeIds={earnedBadgeIds} t={t} />
          {profileMoment && (
            <MascotMoment
              eventKey={profileMoment.key}
              message={profileMoment.message}
              mood={profileMoment.mood}
              frequency={profileMoment.frequency}
              streak={streak}
              className=""
            />
          )}
        </div>

        {/* ══ CE QU'ON VIENT FAIRE, PUIS RÉGLER ════════════════
            Deux colonnes dès qu'il y a la largeur. Elles n'ont pas à être de
            même hauteur : chacune a la taille de ce qu'elle contient. */}
        <div className="bt-profile-rest">

          <div className="space-y-4">
            {/* « Mon activité » répétait la page Stats (calendrier, moyennes,
                jours actifs, record). Il n'en reste qu'une porte vers Stats ;
                la seule information propre au profil — les gels de série —
                est passée à côté de la série, dans l'identité. */}
            <NavGroup>
              <NavRow tone="accent" icon={<IconActivity />}
                label={t("profile.statsRow")} description={t("profile.statsRowDesc")}
                href="/stats" />
              <NavRow icon={<IconGift />}
                label={t("referral.title")} description={t("referral.subtitle")}
                onClick={() => setSheet("referral")} />
              {/* Une seule entrée vers les retours : la même page montre la
                  boîte de réception aux administrateurs. */}
              <NavRow icon={<IconFeedback />}
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
                  {/* L'interrupteur général vaut pour tous les appareils du
                      compte ; les catégories ne comptent que s'il est allumé. */}
                  <SettingsRow icon={<IconPower />} label={t("privacy.pushGeneral")}
                    description={privacy.push_enabled !== false ? t("privacy.pushGeneralDesc") : t("privacy.pushGeneralOff")}
                    right={<MiniSwitch checked={privacy.push_enabled !== false}
                      onChange={value => setPushPreference("push_enabled", value)}
                      label={t("privacy.pushGeneral")} />} />
                  {sep}
                  <SettingsRow icon={<IconActivity />} label={t("privacy.pushReminders")}
                    description={t("privacy.pushRemindersDesc")}
                    right={<MiniSwitch checked={privacy.push_enabled !== false && privacy.push_reminders !== false}
                      disabled={privacy.push_enabled === false}
                      onChange={value => setPushPreference("push_reminders", value)}
                      label={t("privacy.pushReminders")} />} />
                  {sep}
                  <SettingsRow icon={<IconUsers />} label={t("privacy.pushSocial")}
                    description={t("privacy.pushSocialDesc")}
                    right={<MiniSwitch checked={privacy.push_enabled !== false && privacy.push_social !== false}
                      disabled={privacy.push_enabled === false}
                      onChange={value => setPushPreference("push_social", value)}
                      label={t("privacy.pushSocial")} />} />
                  {sep}
                  <SettingsRow icon={<IconMegaphone />} label={t("privacy.pushAnnouncements")}
                    description={t("privacy.pushAnnouncementsDesc")}
                    right={<MiniSwitch checked={privacy.push_enabled !== false && privacy.push_announcements !== false}
                      disabled={privacy.push_enabled === false}
                      onChange={value => setPushPreference("push_announcements", value)}
                      label={t("privacy.pushAnnouncements")} />} />
                </>
              )}
            </div>
          </div>

          {/* ── Ce qu'on vient régler ──────────────────────── */}
          <div className="space-y-4">
            {/* Réglages — ce qu'on ouvre trois fois par an. */}
            <NavGroup>
              <NavRow icon={<IconSliders />}
                label={t("profile.preferencesSection")} value={prefsSummary}
                onClick={() => setSheet("prefs")} />
              <NavRow icon={<IconUser />}
                label={t("profile.accountSection")} value={profile?.email || undefined}
                onClick={() => setSheet("account")} />
              <NavRow icon={<IconShieldCheck />}
                label={t("privacy.section")}
                onClick={() => setSheet("privacy")} />
            </NavGroup>

            {/* Administration — visible uniquement pour les admins */}
            {profile?.is_admin && (
              <NavGroup>
                <NavRow icon={<IconShield />} label={t("profile.adminDashboard")} href="/admin" />
              </NavGroup>
            )}

            <NavGroup>
              <NavRow tone="danger" icon={<IconLogOut />} label={t("profile.signOut")}
                onClick={signOut} chevron={false} />
            </NavGroup>
          </div>
        </div>
      </div>

      {/* ══ Feuilles de détail ════════════════════════════════ */}
      <DetailSheet open={sheet === "referral"} title={t("referral.title")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <ReferralBody t={t} fallbackCode={profile?.referral_code} />
      </DetailSheet>

      <DetailSheet open={sheet === "prefs"} title={t("profile.preferencesSection")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <SettingsRow icon={<IconGlobe />} label={t("profile.language")} right={
          <Segmented value={langPref} onChange={changeLang}
            options={[{ value: "auto", label: t("profile.languageAuto") }, { value: "fr", label: "FR" }, { value: "en", label: "EN" }]} />
        } />
        {sep}
        <SettingsRow icon={theme === "dark" ? <IconMoon /> : <IconSun />} label={t("profile.theme")} inlineControl right={
          <Segmented value={theme} onChange={setTheme} label={t("profile.theme")}
            options={[
              { value: "light", label: t("profile.themeLight"), icon: <IconSun /> },
              { value: "system", label: t("profile.themeSystem"), icon: <IconSystem /> },
              { value: "dark", label: t("profile.themeDark"), icon: <IconMoon /> },
            ]} />
        } />
        {sep}
        <SettingsRow icon={<IconVolume />} label={t("sensory.soundTitle")}
          description={t("sensory.soundDesc")}
          right={<MiniSwitch checked={sensoryPrefs.sound}
            onChange={enabled => setSensoryPreference("sound", enabled)}
            label={t("sensory.soundTitle")} />} />
        {sep}
        <SettingsRow icon={<IconVibration />} label={t("sensory.hapticsTitle")}
          description={t("sensory.hapticsDesc")}
          right={<MiniSwitch checked={sensoryPrefs.haptics}
            onChange={enabled => setSensoryPreference("haptics", enabled)}
            label={t("sensory.hapticsTitle")} />} />
      </DetailSheet>

      <DetailSheet open={sheet === "account"} title={t("profile.accountSection")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <SettingsRow icon={<IconMail />} label={t("profile.emailSection")}
          description={profile?.email || undefined}
          onClick={() => setShowEmail(o => !o)} right={<IconChevronDown open={showEmail} />} />
        {showEmail && (
          <div className="px-5 pb-5 pt-1">
            <form onSubmit={saveEmail} className="space-y-2">
              <input className="input" type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} autoComplete="email" placeholder="ton@email.com" />
              <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("profile.emailHint")}</p>
              {emailMsg && <p className="text-xs" role={emailMsg.kind === "error" ? "alert" : "status"} style={{ color: emailMsg.kind === "error" ? "var(--bt-danger)" : "var(--bt-accent-text)" }}>{emailMsg.text}</p>}
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
            {pwaPlatform === "installed" ? (
              <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>{t("pwa.installed")}</p>
            ) : pwaPlatform === "ios" ? (<>
            <div className="flex items-start gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: "var(--bt-reward-bg)", color: "var(--bt-reward-text)" }}>
              <span className="shrink-0 mt-0.5"><IconAlert /></span>
              <p className="text-xs">{t("pwa.safariNote")}</p>
            </div>
            <ol className="space-y-2">
              {[t("pwa.step1"), t("pwa.step2")].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
                  <span className="font-num font-bold shrink-0 w-4 text-right tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {/* Les étapes seules ne suffisent pas : « Sur l'écran d'accueil »
                est noyé dans un long menu iOS, personne ne le trouve. */}
            <PwaHomeScreenVisual />
            </>) : (
              <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>{t("pwa.browserFallback")}</p>
            )}
          </div>
        )}
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
      </DetailSheet>

      {/* Tout ce qui relève des droits de la personne au même endroit :
          consulter, exporter, régler ce qui la suit, supprimer. Éclaté sur
          trois écrans, un droit n'est un droit que sur le papier. */}
      <DetailSheet open={sheet === "privacy"} title={t("privacy.section")}
        closeLabel={t("common.close")} onClose={closeSheet}>
        <SettingsRow icon={<IconCookie />} label={t("privacy.cookieSettings")}
          description={t("privacy.cookieSettingsDesc")}
          onClick={() => { closeSheet(); openConsentSettings(); }} right={<IconChevronRight />} />
        {sep}
        <SettingsRow icon={<IconDownload />} label={t("privacy.exportData")}
          description={t("privacy.exportDataDesc")}
          onClick={exporting ? undefined : exportMyData}
          right={exporting
            ? <span className="text-xs font-semibold" style={{ color: "var(--bt-text-3)" }}>…</span>
            : <IconChevronRight />} />
        {sep}
        <SettingsRow icon={<IconLegal />} href="/legal?doc=privacy"
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
            {msg && <p className="text-xs text-center" role="alert" style={{ color: "var(--bt-danger)" }}>{msg.text}</p>}
          </div>
        )}
      </DetailSheet>

      {/* ══ Overlays ══════════════════════════════════════════ */}
      <EditProfileModal
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onOpenExchange={() => { setShowEditProfile(false); setShowExchange(true); }}
        exchangeSummary={exchangeSummary}
        form={form} set={set} saveInfo={saveInfo} busy={busy} msg={msg}
        locked={!!profile?.locked} t={t}
      />
      {showExchange && <ProfileExchange profile={profile}
        onClose={() => setShowExchange(false)}
        onSaved={async () => { await refreshProfile(); toast(t("profile.exchangeSaved")); }}
        t={t} />}
    </Layout>
  );
}
