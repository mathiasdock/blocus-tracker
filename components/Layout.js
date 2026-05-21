import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { formatDuration, displayName } from "../lib/format";
import PwaInstallBanner from "./PwaInstallBanner";

// ── SVG Icons ─────────────────────────────────────────────────

function IconTimer({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8"/>
      <path d="M12 9v4l2.5 2.5"/>
      <path d="M9.5 3h5M12 3v2"/>
    </svg>
  );
}

function IconCalendar({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  );
}

function IconChart({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/>
      <path d="M7 16V11M12 16V7M17 16V4"/>
    </svg>
  );
}

function IconChat({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconFriends({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconCommunity({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

function IconFeed({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function IconAdmin({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function IconSocial({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

function IconHistory({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15 15"/>
      <path d="M3.05 11a9 9 0 1 1 .5 4"/>
      <polyline points="3 15 3.05 11 7 11"/>
    </svg>
  );
}

function IconGroups({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3"/>
      <circle cx="17" cy="7" r="3"/>
      <path d="M1 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>
      <path d="M17 11a4 4 0 0 1 4 4v2"/>
    </svg>
  );
}

function IconProfile({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
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
    "/profile":     <IconProfile size={size} />,
    "/historique":  <IconHistory size={size} />,
    "/groupes":     <IconGroups size={size} />,
    "social":       <IconSocial size={size} />,
  };
  return map[href] || null;
}

// ── Avatar ────────────────────────────────────────────────────

function Avatar({ url, pseudo, size = 32 }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt={pseudo || "avatar"}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: "1.5px solid var(--bt-border)" }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size, height: size,
        fontSize: size * 0.4,
        backgroundColor: "var(--bt-accent-bg)",
        color: "var(--bt-accent-dark)",
        border: "1.5px solid var(--bt-accent-border)",
      }}>
      {(pseudo || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

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

const SOCIAL_PATHS = ["/feed", "/friends", "/messages", "/communautes"];

const NAV_MAIN = [
  { href: "/dashboard", key: "nav.chrono" },
  { href: "/planning",  key: "nav.planning" },
  { href: "/stats",     key: "nav.stats" },
];

const NAV_SOCIAL = [
  { href: "/feed",        key: "nav.feed" },
  { href: "/messages",    key: "nav.messages" },
  { href: "/friends",     key: "nav.friends" },
  { href: "/communautes", key: "nav.communities" },
];

const NAV_ADMIN = { href: "/admin", key: "nav.admin" };

// 5-tab mobile bottom nav
const MOBILE_5 = [
  { href: "/dashboard", key: "nav.chrono",   iconKey: "/dashboard" },
  { href: "/planning",  key: "nav.planning", iconKey: "/planning"  },
  { href: "/stats",     key: "nav.stats",    iconKey: "/stats"     },
  { href: "/feed",      key: "nav.social",   iconKey: "social",    isSocial: true },
  { href: "/profile",   key: "nav.profile",  iconKey: "/profile"   },
];

// ── Layout ────────────────────────────────────────────────────

export default function Layout({ children }) {
  const { user, profile, loading, signOut } = useAuth();
  const { running, elapsed } = useTimer();
  const { feedCount, commentCount, friendCount, totalCommunity, messageCount, msgToast, clearMsgToast } = useNotifications();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (profile?.lang && (profile.lang === "fr" || profile.lang === "en") && profile.lang !== lang) {
      setLang(profile.lang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.lang]);

  const [userLevel, setUserLevel] = useState(null);
  useEffect(() => {
    const l = localStorage.getItem("bt_level");
    if (l) setUserLevel(Number(l));
  }, []);

  const isAdmin = profile?.is_admin === true;

  function badgeFor(href) {
    if (href === "/feed")        return feedCount + commentCount;
    if (href === "/friends")     return friendCount;
    if (href === "/communautes") return totalCommunity;
    if (href === "/messages")    return messageCount;
    return 0;
  }

  const socialBadge = feedCount + commentCount + friendCount + totalCommunity + messageCount;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--bt-bg)", color: "var(--bt-text-3)" }}>
      {t("common.loading")}
    </div>
  );
  if (!user) return null;

  function renderDesktopNavItem(n) {
    const active = router.pathname === n.href;
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

  return (
    <div className="min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--bt-bg)" }}>

      {/* ══ Sidebar desktop ══════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-[232px] z-30"
        style={{ backgroundColor: "var(--bt-surface)", borderRight: "1px solid var(--bt-border)" }}>

        {/* Logo */}
        <div className="h-16 flex items-center px-5 shrink-0"
          style={{ borderBottom: "1px solid var(--bt-border)" }}>
          <Link href="/dashboard"
            className="font-display text-xl select-none"
            style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          {/* Main */}
          <div className="space-y-0.5">
            {NAV_MAIN.map(n => renderDesktopNavItem(n))}
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
        <div className="shrink-0 p-3" style={{ borderTop: "1px solid var(--bt-border)" }}>
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t("nav.quit")}
          </button>
        </div>
      </aside>

      {/* ══ Top bar mobile ═══════════════════════════════════════ */}
      {/* paddingTop: env(safe-area-inset-top) pousse le contenu sous la
          barre de statut iOS (heure + batterie) pour qu'il ne soit pas caché */}
      <header className="lg:hidden sticky top-0 z-30 backdrop-blur-sm"
        style={{ backgroundColor: "var(--bt-mobile-bg)", borderBottom: "1px solid var(--bt-border)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="h-12 flex items-center justify-between px-4">
          <Link href="/dashboard"
            className="font-display text-lg select-none"
            style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
          <div className="flex items-center gap-3">
            {running && router.pathname !== "/dashboard" && (
              <Link href="/dashboard"
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{ backgroundColor: "#14B885" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="tabular-nums">{formatDuration(elapsed)}</span>
              </Link>
            )}
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
          </div>
        </div>
      </header>

      {/* ══ Contenu principal ════════════════════════════════════ */}
      <div className="lg:ml-[232px]">

        {/* Social sub-nav mobile */}
        {SOCIAL_PATHS.includes(router.pathname) && (
          <div className="lg:hidden sticky z-20 flex"
            style={{ top: "calc(48px + env(safe-area-inset-top))", backgroundColor: "var(--bt-mobile-nav-bg)", borderBottom: "1px solid var(--bt-border)", backdropFilter: "blur(10px)" }}>
            {NAV_SOCIAL.map(n => {
              const active = router.pathname === n.href;
              const badge  = badgeFor(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors"
                  style={{ color: active ? "var(--bt-accent-dark)" : "var(--bt-text-3)" }}>
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                      style={{ backgroundColor: "#14B885" }} />
                  )}
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

        <main className="w-full max-w-[1280px] mx-auto px-5 pt-7 pb-28 lg:px-9 lg:pb-10 overflow-x-clip">
          {children}
        </main>
        <footer className="hidden lg:block text-center text-xs py-6"
          style={{ color: "var(--bt-text-3)" }}>
          {t("footer.tagline")}
        </footer>
      </div>

      {/* ══ Bottom nav mobile — 5 onglets ════════════════════════ */}
      {/* Structure en deux couches pour le safe-area-inset-bottom (indicateur home iPhone) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30"
        style={{ backgroundColor: "var(--bt-mobile-nav-bg)", borderTop: "1px solid var(--bt-border)", backdropFilter: "blur(10px)" }}>
        <div className="h-14 flex items-stretch">
        {MOBILE_5.map(n => {
          const active = n.isSocial
            ? SOCIAL_PATHS.includes(router.pathname)
            : router.pathname === n.href;
          const badge = n.isSocial ? socialBadge : badgeFor(n.href);
          return (
            <Link key={n.href} href={n.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: active ? "#14B885" : "var(--bt-text-3)" }}>
              <div className="relative">
                <NavIcon href={n.iconKey} size={22} />
                {badge > 0 && <Badge count={badge} small />}
              </div>
              <span className="text-[10px] font-medium leading-none">{t(n.key)}</span>
            </Link>
          );
        })}
        </div>
        {/* Spacer safe area pour l'indicateur home iPhone */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </nav>

      {/* PWA install banner (centré, modal) */}
      <PwaInstallBanner />

      {/* ══ Chrono flottant desktop ══════════════════════════════ */}
      {running && router.pathname !== "/dashboard" && (
        <Link href="/dashboard"
          className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full text-white pl-4 pr-5 py-2.5 text-sm font-semibold transition-all"
          style={{ backgroundColor: "#14B885", boxShadow: "0 4px 16px rgba(20,184,133,0.35)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "#0E8F68"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "#14B885"}>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="tabular-nums">{formatDuration(elapsed)}</span>
        </Link>
      )}

      {/* ══ Toast nouveau message ════════════════════════════════ */}
      {msgToast && router.pathname !== "/messages" && (
        <button
          onClick={() => { clearMsgToast(); router.push("/messages"); }}
          className="fixed bottom-20 lg:bottom-6 left-4 lg:left-auto lg:right-6 z-40 flex items-center gap-3 rounded-2xl text-white pl-4 pr-5 py-3 transition-all"
          style={{ backgroundColor: "var(--bt-text-1)", boxShadow: "0 8px 28px var(--bt-shadow)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-border)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-text-1)"}>
          <span className="text-lg">💬</span>
          <span className="text-left">
            <span className="block text-sm font-semibold">{t("msg.newMessage")}</span>
            <span className="block text-xs" style={{ color: "var(--bt-text-3)" }}>{t("msg.clickToOpen")}</span>
          </span>
        </button>
      )}

    </div>
  );
}
