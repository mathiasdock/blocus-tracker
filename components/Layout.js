import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { useConsent } from "../contexts/ConsentContext";
import { formatDuration, displayName } from "../lib/format";
import LegacyEmailBanner from "./LegacyEmailBanner";
import PageSkeleton from "./PageSkeleton";
import { isOfflineDev } from "../lib/supabaseClient";
import Glyph from "./Glyph";
import useSocialSwipe from "./useSocialSwipe";
import GuestDiscovery from "./guest/GuestDiscovery";
import Avatar from "./Avatar";
import NotificationCenter from "./NotificationCenter";

// ── Icônes ─────────────────────────────────────────────────
// Dessins seulement : grille, épaisseur et accessibilité viennent de
// ./Glyph. Seul NotifGlyph reste en SVG direct — c'est une famille PLEINE,
// pas tracée, et elle sert de pastille de type ; la mélanger au jeu au trait
// reviendrait à lui faire dire la même chose qu'une icône d'action.

function IconTimer({ size = 20 }) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="13" r="8"/>
      <path d="M12 9v4l2.5 2.5"/>
      <path d="M9.5 3h5M12 3v2"/>
    </Glyph>
  );
}

function IconCalendar({ size = 20 }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </Glyph>
  );
}

function IconChart({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M3 3v18h18"/>
      <path d="M7 16V11M12 16V7M17 16V4"/>
    </Glyph>
  );
}

function IconChat({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </Glyph>
  );
}

function IconFriends({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </Glyph>
  );
}

function IconCommunity({ size = 20 }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </Glyph>
  );
}

function IconBell({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </Glyph>
  );
}

function IconFeed({ size = 20 }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </Glyph>
  );
}

function IconAdmin({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </Glyph>
  );
}

function IconFeedback({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 8h8M8 12h5"/>
    </Glyph>
  );
}

function IconSocial({ size = 20 }) {
  return (
    <Glyph size={size}>
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </Glyph>
  );
}

function IconHistory({ size = 20 }) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15 15"/>
      <path d="M3.05 11a9 9 0 1 1 .5 4"/>
      <polyline points="3 15 3.05 11 7 11"/>
    </Glyph>
  );
}

function IconProfile({ size = 20 }) {
  return (
    <Glyph size={size}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </Glyph>
  );
}

function NavIcon({ href, size = 20 }) {
  const map = {
    "/dashboard":   <IconTimer size={size} />,
    "/planning":    <IconCalendar size={size} />,
    "/stats":       <IconChart size={size} />,
    "/messages":    <IconChat size={size} />,
    "/friends":     <IconFriends size={size} />,
    "/communautes": <IconCommunity size={size} />,
    "/feed":        <IconFeed size={size} />,
    "/admin":       <IconAdmin size={size} />,
    "/feedback":    <IconFeedback size={size} />,
    "/profile":     <IconProfile size={size} />,
    "/historique":  <IconHistory size={size} />,
    "social":       <IconSocial size={size} />,
    "notifications": <IconBell size={size} />,
  };
  return map[href] || null;
}

// ── Avatar ────────────────────────────────────────────────────
// Dans ./Avatar ; réexporté ici pour les imports existants.
export { Avatar };

// ── Badge ─────────────────────────────────────────────────────

function Badge({ count, small = false }) {
  if (!count) return null;
  const base = "inline-flex items-center justify-center font-bold bg-red-500 text-white rounded-full leading-none";
  if (small) return (
    <span className={`${base} absolute -top-1 -right-1.5 min-w-[14px] h-[14px] text-[9px] px-0.5`}>
      {count > 9 ? "9+" : count}
    </span>
  );
  return (
    <span className={`${base} min-w-[18px] h-[18px] text-[10px] px-1`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── Nav data ──────────────────────────────────────────────────

const SOCIAL_PATHS = ["/feed", "/messages", "/communautes"];

const NAV_MAIN = [
  { href: "/dashboard", key: "nav.chrono" },
  { href: "/planning",  key: "nav.planning" },
  { href: "/stats",     key: "nav.stats" },
];

const NAV_SOCIAL = [
  { href: "/feed",        key: "nav.feed" },
  { href: "/messages",    key: "nav.messages" },
  { href: "/communautes", key: "nav.communities" },
];

const NAV_ADMIN = { href: "/admin", key: "nav.admin" };

// 5-tab mobile bottom nav
const MOBILE_5 = [
  { href: "/dashboard", key: "nav.chrono",   iconKey: "/dashboard" },
  { href: "/planning",  key: "nav.planning", iconKey: "/planning"  },
  { href: "/stats",     key: "nav.stats",    iconKey: "/stats"     },
  { href: "/messages",  key: "nav.social",   iconKey: "social",    isSocial: true },
  { href: "/profile",   key: "nav.profile",  iconKey: "/profile"   },
];

const GUEST_PUBLIC_PATHS = ["/dashboard", "/legal"];
const NOTIFICATION_PANEL_ID = "bt-notification-center";

// ── Layout ────────────────────────────────────────────────────

export default function Layout({ children }) {
  const { user, profile, loading, signOut } = useAuth();
  const { running, elapsed } = useTimer();
  const {
    feedCount,
    friendCount,
    totalCommunity,
    messageCount,
    totalGroups,
    notificationUnreadCount,
    msgToast,
    clearMsgToast,
  } = useNotifications();
  const { t } = useI18n();
  const { openSettings: openConsentSettings } = useConsent();
  const router = useRouter();
  const socialSurfaceRef = useSocialSwipe(router, SOCIAL_PATHS);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const isGuest = !user;
  const guestLocked = isGuest && !GUEST_PUBLIC_PATHS.includes(router.pathname);
  const fillsSocialViewport = !guestLocked && (router.pathname === "/messages" || router.pathname === "/communautes");
  const mainNav = NAV_MAIN;
  const mobileNav = MOBILE_5;

  // La langue de l'app suit l'appareil (ou le choix manuel local) — voir
  // I18nContext. On ne force plus `profile.lang` ici : sinon le défaut "fr" de
  // la colonne écraserait systématiquement la détection pour les connectés.

  const [userLevel, setUserLevel] = useState(null);
  useEffect(() => {
    if (!user) {
      setUserLevel(null);
      return;
    }
    function syncLevel(e) {
      const next = e?.detail?.level || localStorage.getItem("bt_level");
      setUserLevel(next ? Number(next) : null);
    }
    syncLevel();
    window.addEventListener("bt-level-updated", syncLevel);
    return () => window.removeEventListener("bt-level-updated", syncLevel);
  }, [user]);

  const isAdmin = profile?.is_admin === true;

  function badgeFor(href) {
    if (isGuest) return 0;
    if (href === "/feed")        return feedCount;
    if (href === "/communautes") return totalCommunity;
    if (href === "/messages")    return messageCount + totalGroups + friendCount;
    return 0;
  }

  const socialBadge = feedCount + friendCount + totalCommunity + messageCount + totalGroups;

  useEffect(() => {
    setNotificationsOpen(false);
  }, [router.pathname]);

  // Gate global (auth en cours). `?bt_loader=1` : trappe de QA build offline
  // UNIQUEMENT (isOfflineDev est false en prod → bloc éliminé du bundle) pour
  // prévisualiser l'écran de chargement sans dépendre du timing de l'auth.
  if (loading || (isOfflineDev && router.query.bt_loader === "1")) {
    return <PageSkeleton pathname={router.pathname} />;
  }

  function renderDesktopNavItem(n) {
    // L'admin a six pages (/admin, /admin/members…) : toutes allument l'entrée.
    const active = n.href === "/admin" ? router.pathname.startsWith("/admin") : router.pathname === n.href;
    const badge  = badgeFor(n.href);
    return (
      <Link key={n.href} href={n.href}
        className="relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[14px] font-medium transition-all"
        style={active ? {
          backgroundColor: "var(--bt-accent-bg)",
          color: "var(--bt-accent-dark)",
          fontWeight: 600,
        } : {
          color: "var(--bt-text-2)",
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = ""; }}>
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
            style={{ backgroundColor: "#14B885" }} />
        )}
        <span>
          <NavIcon href={n.href} size={18} />
        </span>
        <span className="flex-1">{t(n.key)}</span>
        {badge > 0 && <Badge count={badge} />}
      </Link>
    );
  }

  // La cloche, dans la barre latérale (ordinateur) et l'en-tête (téléphone).
  // Visuel de 36 px, zone de toucher de 44 px (le ::after déborde de 4 px).
  function renderNotificationsBell() {
    const unread = notificationUnreadCount;
    const label = unread > 0
      ? `${t("nav.notifications")}, ${unread === 1 ? t("notif.unreadOne") : t("notif.unreadMany").replace("{n}", String(unread))}`
      : t("nav.notifications");
    return (
      <button
        type="button"
        data-notif-trigger=""
        onClick={() => setNotificationsOpen((open) => !open)}
        className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 after:absolute after:-inset-1 after:content-['']"
        style={{
          color: notificationsOpen ? "var(--bt-accent-dark)" : "var(--bt-text-2)",
          backgroundColor: notificationsOpen ? "var(--bt-accent-bg)" : "var(--bt-subtle)",
          border: "1px solid var(--bt-hairline)",
        }}
        aria-haspopup="dialog"
        aria-expanded={notificationsOpen}
        aria-label={label}>
        <IconBell size={18} />
        {unread > 0 && <Badge count={unread} small />}
      </button>
    );
  }

  return (
    <div className="bt-app-shell min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--bt-bg)" }}>

      {/* ══ Sidebar desktop ══════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-[232px] z-30"
        style={{ backgroundColor: "var(--bt-surface)", borderRight: "1px solid var(--bt-border)" }}>

        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 shrink-0"
          style={{ borderBottom: "1px solid var(--bt-hairline)" }}>
          <Link href="/dashboard"
            className="font-display font-bold text-xl tracking-tight select-none"
            style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
          {!isGuest && renderNotificationsBell()}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          {/* Main */}
          <div className="space-y-0.5">
            {mainNav.map(n => renderDesktopNavItem(n))}
          </div>

          {/* Social section */}
          <div className="pt-4 pb-1.5 px-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--bt-text-4)" }}>Social</p>
          </div>
          <div className="space-y-0.5">
            {NAV_SOCIAL.map(n => renderDesktopNavItem(n))}
          </div>

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1.5 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--bt-text-4)" }}>Admin</p>
              </div>
              <div className="space-y-0.5">
                {renderDesktopNavItem(NAV_ADMIN)}
              </div>
            </>
          )}
        </nav>

        {/* Profile block */}
        <div className="shrink-0 p-3" style={{ borderTop: "1px solid var(--bt-hairline)" }}>
          {isGuest ? (
            <div className="space-y-2">
              <Link href="/signup" className="btn-primary w-full text-sm py-2.5">
                {t("guest.createAccount")}
              </Link>
              <Link href="/login" className="btn-ghost w-full text-sm py-2.5">
                {t("guest.signIn")}
              </Link>
            </div>
          ) : (
            <>
              <Link href="/profile"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl transition-all"
                style={router.pathname === "/profile" ? { backgroundColor: "var(--bt-accent-bg)" } : {}}
                onMouseEnter={e => { if (router.pathname !== "/profile") e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                onMouseLeave={e => { if (router.pathname !== "/profile") e.currentTarget.style.backgroundColor = ""; }}>
                <div className="relative shrink-0">
                  <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={32} />
                  {userLevel && (
                    <span style={{
                      position: "absolute", bottom: -3, right: -7,
                      backgroundColor: "#14B885", color: "#fff",
                      fontSize: 9, fontWeight: 800,
                      borderRadius: 99, padding: "1px 5px",
                      border: "1.5px solid var(--bt-surface)",
                      lineHeight: 1.4, pointerEvents: "none",
                    }}>{userLevel}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--bt-text-1)" }}>
                    {displayName(profile)}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>
                    @{profile?.pseudo}
                  </p>
                </div>
              </Link>
              <button onClick={signOut}
                className="mt-0.5 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] transition-colors text-left"
                style={{ color: "var(--bt-text-3)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--bt-text-2)"; e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--bt-text-3)"; e.currentTarget.style.backgroundColor = ""; }}>
                <Glyph size={12}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </Glyph>
                {t("nav.quit")}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ══ Top bar mobile ═══════════════════════════════════════ */}
      {/* paddingTop: env(safe-area-inset-top) pousse le contenu sous la
          barre de statut iOS (heure + batterie) pour qu'il ne soit pas caché */}
      <header data-bt-appheader className="lg:hidden sticky top-0 z-30 backdrop-blur-sm"
        style={{ backgroundColor: "var(--bt-mobile-bg)", borderBottom: "1px solid var(--bt-hairline)", paddingTop: "env(safe-area-inset-top)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}>
        <div className="h-12 flex items-center justify-between px-4">
          <Link href="/dashboard"
            className="font-display font-bold text-lg tracking-tight select-none"
            style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
          <div className="flex items-center gap-3">
            {running && router.pathname !== "/dashboard" && (
              <Link href="/dashboard"
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{ backgroundImage: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 2px 8px rgba(20,184,133,0.3)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="font-num tabular-nums">{formatDuration(elapsed)}</span>
              </Link>
            )}
            {isGuest ? (
              <Link href="/login" className="text-xs font-semibold px-3 py-2 rounded-full"
                style={{ color: "#0E8F68", backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
                {t("guest.signIn")}
              </Link>
            ) : (
              <>
                {renderNotificationsBell()}
                <Link href="/profile" style={{ position: "relative", display: "inline-block" }}>
                  <Avatar url={profile?.avatar_url} pseudo={displayName(profile)} size={32} />
                  {userLevel && (
                    <span style={{
                      position: "absolute", bottom: -3, right: -7,
                      backgroundColor: "#14B885", color: "#fff",
                      fontSize: 9, fontWeight: 800,
                      borderRadius: 99, padding: "1px 5px",
                      border: "1.5px solid var(--bt-surface)",
                      lineHeight: 1.4, pointerEvents: "none",
                    }}>{userLevel}</span>
                  )}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ══ Contenu principal ════════════════════════════════════ */}
      <div ref={socialSurfaceRef} className={`${fillsSocialViewport ? "bt-social-fill-shell" : ""} lg:ml-[232px]`}>

        {/* Social sub-nav mobile */}
        {SOCIAL_PATHS.includes(router.pathname) && (
          <div data-bt-subnav className="lg:hidden sticky z-20 flex"
            style={{ top: "calc(48px + env(safe-area-inset-top))", backgroundColor: "var(--bt-mobile-bg)", borderBottom: "1px solid var(--bt-hairline)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}>
            <span aria-hidden="true" data-social-indicator className="bt-social-indicator" style={{ transform: `translateX(${SOCIAL_PATHS.indexOf(router.pathname) * 100}%)` }}><i /></span>
            {NAV_SOCIAL.map(n => {
              const active = router.pathname === n.href;
              const badge  = badgeFor(n.href);
              return (
                <Link key={n.href} href={n.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors"
                  style={{ color: active ? "var(--bt-accent-dark)" : "var(--bt-text-3)" }}>
                  {t(n.key)}
                  {badge > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5 leading-none">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <main data-bt-route-content className={`${fillsSocialViewport ? "bt-social-fill-main" : ""} w-full max-w-[1280px] mx-auto px-5 pt-7 pb-28 lg:px-9 lg:pb-10 overflow-x-clip`}>
          {!guestLocked && <LegacyEmailBanner />}
          {guestLocked ? <GuestDiscovery pathname={router.pathname} /> : children}
        </main>
        {/* Pas de pied de page sous Friends et Communautés : ce sont des interfaces
            en pleine hauteur, et il faudrait défiler la page pour l'atteindre. */}
        <footer className={`${fillsSocialViewport ? "hidden" : "hidden lg:flex"} items-center justify-center gap-3 text-xs py-6`}
          style={{ color: "var(--bt-text-3)" }}>
          <span>{t("footer.tagline")}</span>
          <span aria-hidden="true">·</span>
          <Link href="/legal" className="transition-colors hover:underline"
            onMouseEnter={e => e.currentTarget.style.color = "var(--bt-accent-dark)"}
            onMouseLeave={e => e.currentTarget.style.color = ""}>
            {t("footer.legal")}
          </Link>
          <span aria-hidden="true">·</span>
          {/* Retirer un consentement doit être aussi simple que le donner :
              l'entrée reste au même endroit, sur toutes les pages. */}
          <button type="button" onClick={openConsentSettings}
            className="transition-colors hover:underline"
            onMouseEnter={e => e.currentTarget.style.color = "var(--bt-accent-dark)"}
            onMouseLeave={e => e.currentTarget.style.color = ""}>
            {t("footer.cookieSettings")}
          </button>
        </footer>
      </div>

      {/* ══ Bottom nav mobile — 5 onglets ════════════════════════ */}
      {/* Structure en deux couches pour le safe-area-inset-bottom (indicateur home iPhone) */}
      {/* Barre FLOTTANTE : detachee des bords, translucide, le contenu defile
          dessous. Avant, une barre pleine largeur collee en bas avec un filet
          superieur — la forme d'un site web, pas d'une app. Le style vit en
          CSS (.bt-nav*) : en inline il ne pouvait pas s'adapter au theme, au
          mode contraste eleve ni a `prefers-reduced-transparency`. */}
      <nav className="bt-nav lg:hidden" aria-label={t("nav.primary")}>
        <div className="bt-nav-bar">
        {mobileNav.map(n => {
          const active = n.isSocial
            ? SOCIAL_PATHS.includes(router.pathname)
            : router.pathname === n.href;
          const badge = isGuest ? 0 : n.isSocial ? socialBadge : badgeFor(n.href);
          return (
            <Link key={n.href} href={n.href}
              aria-current={active ? "page" : undefined}
              className={`bt-nav-item ${active ? "is-active" : ""}`}>
              <span className="bt-nav-pill">
                <NavIcon href={n.iconKey} size={22} />
                {badge > 0 && <Badge count={badge} small />}
              </span>
              <span className="bt-nav-label">{t(n.key)}</span>
            </Link>
          );
        })}
        </div>
      </nav>

      {!isGuest && (
        <NotificationCenter open={notificationsOpen} onClose={closeNotifications} panelId={NOTIFICATION_PANEL_ID} />
      )}

      {/* ══ Chrono flottant desktop ══════════════════════════════ */}
      {running && router.pathname !== "/dashboard" && (
        <Link href="/dashboard"
          className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full text-white pl-4 pr-5 py-2.5 text-sm font-semibold transition-all"
          style={{ backgroundImage: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 4px 16px rgba(20,184,133,0.35)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundImage = "linear-gradient(165deg, #0FA173, #0E8F68 115%)"}
          onMouseLeave={e => e.currentTarget.style.backgroundImage = "linear-gradient(165deg, #14B885, #0E8F68 115%)"}>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="font-num tabular-nums">{formatDuration(elapsed)}</span>
        </Link>
      )}

      {/* ══ Toast nouveau message ════════════════════════════════ */}
      {!isGuest && msgToast && router.pathname !== "/messages" && (
        <button
          onClick={() => { clearMsgToast(); router.push("/messages"); }}
          className="fixed bottom-20 lg:bottom-6 left-4 lg:left-auto lg:right-6 z-40 flex items-center gap-3 rounded-2xl text-white pl-4 pr-5 py-3 transition-all"
          style={{ backgroundColor: "var(--bt-text-1)", boxShadow: "0 8px 28px var(--bt-shadow)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-border)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-text-1)"}>
          <span className="shrink-0"><Glyph size={20}><path d="M20.6 14.6a2.4 2.4 0 0 1-2.4 2.4H8.2l-4.8 3.6V5.8a2.4 2.4 0 0 1 2.4-2.4h12.4a2.4 2.4 0 0 1 2.4 2.4Z"/></Glyph></span>
          <span className="text-left">
            <span className="block text-sm font-semibold">{t("msg.newMessage")}</span>
            <span className="block text-xs" style={{ color: "var(--bt-text-3)" }}>{t("msg.clickToOpen")}</span>
          </span>
        </button>
      )}

    </div>
  );
}
