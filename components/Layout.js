import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTimer } from "../contexts/TimerContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { formatDuration, displayName, timeAgo } from "../lib/format";
import PwaInstallBanner from "./PwaInstallBanner";
import LegacyEmailBanner from "./LegacyEmailBanner";
import Mascot from "./Mascot";
import PageSkeleton from "./PageSkeleton";
import { isOfflineDev } from "../lib/supabaseClient";

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

function IconBell({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
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

function IconFeedback({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 8h8M8 12h5"/>
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
    "/feedback":    <IconFeedback size={size} />,
    "/profile":     <IconProfile size={size} />,
    "/historique":  <IconHistory size={size} />,
    "social":       <IconSocial size={size} />,
    "notifications": <IconBell size={size} />,
  };
  return map[href] || null;
}

// ── Avatar ────────────────────────────────────────────────────

function Avatar({ url, pseudo, size = 32 }) {
  if (url) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={pseudo || "avatar"}
          loading="lazy" decoding="async"
          className="rounded-full object-cover shrink-0"
          style={{ width: size, height: size, border: "1.5px solid var(--bt-border)" }} />
      </>
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

// Glyphes d'activité (remplis) posés en pastille sur l'avatar : chaque type de
// notif "de personne" se reconnaît d'un coup d'œil sans lire le texte.
function NotifBadgeGlyph({ name, size = 11 }) {
  const paths = {
    friend: <><circle cx="9" cy="8.5" r="3.4" /><path d="M3 20a6 6 0 0 1 12 0z" /><path d="M18.5 8.5v6M21.5 11.5h-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></>,
    chat: <path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />,
    heart: <path d="M12 21 3.6 12.6a5.4 5.4 0 1 1 7.6-7.6l.8.8.8-.8a5.4 5.4 0 1 1 7.6 7.6z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// Jetons d'annonce (contour, dans la couleur du type) : nouveauté / info / alerte.
function AnnGlyph({ name, size = 17 }) {
  const paths = {
    sparkles: <path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 17l-1.9-5.3L5 9.8l5.1-1.9zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4.5M12 8h.02" /></>,
    alert: <><path d="M10.3 4 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17.5h.02" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// Avatar + pastille d'activité colorée dans le coin.
function NotifAvatar({ item, name }) {
  const badge = {
    friend_request: { bg: "var(--bt-accent)", glyph: "friend" },
    comment:        { bg: "#0369a1", glyph: "chat" },
    reaction:       { bg: "#DC2626", glyph: "heart" },
  }[item.type];
  return (
    <span className="relative shrink-0">
      <Avatar url={item.actor?.avatar_url} pseudo={name} size={40} />
      {badge && (
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full"
          style={{ width: 18, height: 18, backgroundColor: badge.bg, color: "#fff", border: "2px solid var(--bt-surface)" }}>
          <NotifBadgeGlyph name={badge.glyph} />
        </span>
      )}
    </span>
  );
}

function NotificationPanel({
  items,
  t,
  onClose,
  onAcceptFriend,
  onRefuseFriend,
  onOpenFeed,
  onDismissAnnouncement,
}) {
  const { lang } = useI18n();
  const nameOf = (profile) => displayName(profile) || t("notif.someone");
  const when = (item) => (item.created_at ? timeAgo(item.created_at, lang) : null);

  const rowHover = {
    onMouseEnter: (e) => (e.currentTarget.style.backgroundColor = "var(--bt-subtle)"),
    onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = ""),
  };

  return (
    <div
      className="bt-rise fixed z-50 left-3 right-3 lg:left-[244px] lg:right-auto lg:w-[400px] rounded-3xl overflow-hidden"
      style={{
        top: "calc(58px + env(safe-area-inset-top))",
        backgroundColor: "var(--bt-surface)",
        border: "1px solid var(--bt-border)",
        boxShadow: "0 24px 60px var(--bt-shadow)",
      }}>
      <div className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: "1px solid var(--bt-border)" }}>
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
            <IconBell size={16} />
          </span>
          <p className="text-[15px] font-bold" style={{ color: "var(--bt-text-1)" }}>{t("notif.title")}</p>
          {items.length > 0 && (
            <span className="text-[11px] font-bold font-num tabular-nums px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--bt-accent)", color: "#fff" }}>
              {items.length}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }}
          aria-label={t("common.close")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "min(70vh, 520px)" }}>
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto mb-3.5 flex w-14 h-14 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-4)" }}>
              <IconBell size={24} />
            </span>
            <p className="text-sm font-semibold" style={{ color: "var(--bt-text-2)" }}>{t("notif.empty")}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("notif.emptyHint")}</p>
          </div>
        ) : (
          <ul>
            {items.map((item, idx) => {
              const bordered = idx > 0 ? { borderTop: "1px solid var(--bt-border)" } : {};
              const ts = when(item);

              if (item.type === "announcement") {
                // Annonces figées : clés i18n. Annonces BDD : texte littéral.
                const annTitle = item.titleKey ? t(item.titleKey) : item.title;
                const annBody  = item.bodyKey  ? t(item.bodyKey)  : item.body;
                const s = {
                  new:       { bg: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", glyph: "sparkles" },
                  info:      { bg: "rgba(3,105,161,0.14)", color: "#0369a1", glyph: "info" },
                  important: { bg: "rgba(220,38,38,0.12)", color: "#DC2626", glyph: "alert" },
                }[item.annType || "info"] || { bg: "rgba(3,105,161,0.14)", color: "#0369a1", glyph: "info" };
                return (
                  <li key={item.key} style={bordered}>
                    <button type="button"
                      onClick={() => { onDismissAnnouncement(item.id, item.href); onClose(); }}
                      className="w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors" {...rowHover}>
                      <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: s.bg, color: s.color }}>
                        <AnnGlyph name={s.glyph} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold leading-snug" style={{ color: "var(--bt-text-1)" }}>{annTitle}</span>
                          {ts && <span className="text-[11px] shrink-0 pt-0.5" style={{ color: "var(--bt-text-4)" }}>{ts}</span>}
                        </span>
                        <span className="block text-xs mt-1 leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{annBody}</span>
                      </span>
                    </button>
                  </li>
                );
              }

              const name = nameOf(item.actor);

              if (item.type === "friend_request") {
                return (
                  <li key={item.key} className="px-4 py-3.5" style={bordered}>
                    <div className="flex gap-3 items-start">
                      <NotifAvatar item={item} name={name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm leading-snug" style={{ color: "var(--bt-text-2)" }}>
                            <span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>{name}</span>{" "}
                            {t("notif.friendRequest")}
                          </p>
                          {ts && <span className="text-[11px] shrink-0 pt-0.5" style={{ color: "var(--bt-text-4)" }}>{ts}</span>}
                        </div>
                        <div className="flex gap-2 mt-2.5">
                          <button type="button" onClick={() => onAcceptFriend(item.id).catch(console.error)}
                            className="btn-primary text-xs px-4 py-1.5">
                            {t("friends.accept")}
                          </button>
                          <button type="button" onClick={() => onRefuseFriend(item.id).catch(console.error)}
                            className="btn-ghost text-xs px-4 py-1.5">
                            {t("friends.refuse")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              }

              const textKey = item.type === "comment" ? "notif.commentedPost" : "notif.reactedPost";
              return (
                <li key={item.key} style={bordered}>
                  <button type="button"
                    onClick={() => { onOpenFeed(); onClose(); }}
                    className="w-full text-left flex gap-3 px-4 py-3.5 transition-colors" {...rowHover}>
                    <NotifAvatar item={item} name={name} />
                    <span className="min-w-0 flex-1 flex items-start justify-between gap-2">
                      <span className="text-sm leading-snug" style={{ color: "var(--bt-text-2)" }}>
                        <span className="font-semibold" style={{ color: "var(--bt-text-1)" }}>{name}</span>{" "}
                        {t(textKey)}
                        {item.type === "reaction" && item.emoji && <span className="ml-1 text-base align-middle">{item.emoji}</span>}
                      </span>
                      {ts && <span className="text-[11px] shrink-0 pt-0.5" style={{ color: "var(--bt-text-4)" }}>{ts}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
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
  { href: "/feed",      key: "nav.social",   iconKey: "social",    isSocial: true },
  { href: "/profile",   key: "nav.profile",  iconKey: "/profile"   },
];

const GUEST_PUBLIC_PATHS = ["/dashboard", "/legal"];
// Chaque valeur est une CLÉ i18n, résolue au rendu via t() (FR + EN).
const GUEST_PAGE_PREVIEWS = {
  "/planning":     { eyebrow: "guest.planning.eyebrow",     title: "guest.planning.title",     text: "guest.planning.text",     features: ["guest.planning.f1", "guest.planning.f2", "guest.planning.f3"] },
  "/stats":        { eyebrow: "guest.stats.eyebrow",        title: "guest.stats.title",        text: "guest.stats.text",        features: ["guest.stats.f1", "guest.stats.f2", "guest.stats.f3"] },
  "/historique":   { eyebrow: "guest.historique.eyebrow",   title: "guest.historique.title",   text: "guest.historique.text",   features: ["guest.historique.f1", "guest.historique.f2", "guest.historique.f3"] },
  "/feed":         { eyebrow: "guest.feed.eyebrow",         title: "guest.feed.title",         text: "guest.feed.text",         features: ["guest.feed.f1", "guest.feed.f2", "guest.feed.f3"] },
  "/messages":     { eyebrow: "guest.messages.eyebrow",     title: "guest.messages.title",     text: "guest.messages.text",     features: ["guest.messages.f1", "guest.messages.f2", "guest.messages.f3"] },
  "/communautes":  { eyebrow: "guest.communautes.eyebrow",  title: "guest.communautes.title",  text: "guest.communautes.text",  features: ["guest.communautes.f1", "guest.communautes.f2", "guest.communautes.f3"] },
  "/profile":      { eyebrow: "guest.profile.eyebrow",      title: "guest.profile.title",      text: "guest.profile.text",      features: ["guest.profile.f1", "guest.profile.f2", "guest.profile.f3"] },
};

const GUEST_DEFAULT_PREVIEW = {
  eyebrow: "guest.default.eyebrow", title: "guest.default.title", text: "guest.default.text",
  features: ["guest.default.f1", "guest.default.f2", "guest.default.f3"],
};

function GuestLockedPanel({ pathname }) {
  const { t } = useI18n();
  const page = GUEST_PAGE_PREVIEWS[pathname] || GUEST_DEFAULT_PREVIEW;

  return (
    <div className="mx-auto max-w-3xl bt-rise">
      <section className="card overflow-hidden p-0">
        <div className="grid items-stretch md:grid-cols-[0.78fr_1.22fr]">
          <div className="relative flex min-h-[230px] items-end justify-center overflow-hidden px-6 pt-8"
            style={{ backgroundColor: "var(--bt-accent-bg)", borderRight: "1px solid var(--bt-accent-border)" }}>
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-28"
              style={{ background: "radial-gradient(circle at 50% 0%, rgba(20,184,133,0.2), transparent 70%)" }} />
            <div className="relative flex items-end gap-2">
              <Mascot streak={12} size={132} className="h-32 w-32" />
              <div className="relative mb-16 max-w-[170px] rounded-2xl px-3.5 py-3 text-xs leading-relaxed"
                style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", color: "var(--bt-text-2)", boxShadow: "0 12px 28px var(--bt-shadow)" }}>
                <span aria-hidden="true" className="absolute -left-2 bottom-4 h-4 w-4 rotate-45"
                  style={{ backgroundColor: "var(--bt-surface)", borderBottom: "1px solid var(--bt-border)", borderLeft: "1px solid var(--bt-border)" }} />
                <span className="relative">{t("guest.tooltip")}</span>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-accent-dark)" }}>{t(page.eyebrow)}</p>
            <h1 className="mt-3 text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>{t(page.title)}</h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t(page.text)}</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-3">
              {page.features.map((feature) => (
                <li key={feature} className="rounded-xl px-3 py-2.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
                  {t(feature)}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href="/signup" className="btn-primary px-5 py-3 text-sm">{t("guest.createAccount")}</Link>
              <Link href="/dashboard" className="btn-ghost px-5 py-3 text-sm">{t("guest.backToTimer")}</Link>
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--bt-text-3)" }}>
              {t("guest.browseHint")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────

export default function Layout({ children }) {
  const { user, profile, loading, signOut } = useAuth();
  const { running, elapsed } = useTimer();
  const {
    feedCount,
    commentCount,
    reactionCount,
    friendCount,
    totalCommunity,
    messageCount,
    totalGroups,
    notificationItems,
    notificationUnreadCount,
    msgToast,
    clearMsgToast,
    refreshNotifications,
    acceptFriendRequest,
    refuseFriendRequest,
    openFeedNotification,
    dismissAnnouncement,
  } = useNotifications();
  const { t } = useI18n();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isGuest = !user;
  const guestLocked = isGuest && !GUEST_PUBLIC_PATHS.includes(router.pathname);
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
    if (href === "/feed")        return feedCount + commentCount + reactionCount;
    if (href === "/communautes") return totalCommunity;
    if (href === "/messages")    return messageCount + totalGroups + friendCount;
    return 0;
  }

  const socialBadge = feedCount + commentCount + reactionCount + friendCount + totalCommunity + messageCount + totalGroups;

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

  function renderDesktopNotificationsBell() {
    return (
      <button
        type="button"
        onClick={() => {
          refreshNotifications();
          setNotificationsOpen((open) => !open);
        }}
        className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
        style={{
          color: notificationsOpen ? "var(--bt-accent-dark)" : "var(--bt-text-2)",
          backgroundColor: notificationsOpen ? "var(--bt-accent-bg)" : "var(--bt-subtle)",
          border: "1px solid var(--bt-border)",
        }}
        aria-label={t("nav.notifications")}>
        <IconBell size={18} />
        {notificationUnreadCount > 0 && <Badge count={notificationUnreadCount} small />}
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
          style={{ borderBottom: "1px solid var(--bt-border)" }}>
          <Link href="/dashboard"
            className="font-display font-bold text-xl tracking-tight select-none"
            style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
          {!isGuest && renderDesktopNotificationsBell()}
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
        <div className="shrink-0 p-3" style={{ borderTop: "1px solid var(--bt-border)" }}>
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                {t("nav.quit")}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ══ Top bar mobile ═══════════════════════════════════════ */}
      {/* paddingTop: env(safe-area-inset-top) pousse le contenu sous la
          barre de statut iOS (heure + batterie) pour qu'il ne soit pas caché */}
      <header className="lg:hidden sticky top-0 z-30 backdrop-blur-sm"
        style={{ backgroundColor: "var(--bt-mobile-bg)", borderBottom: "1px solid var(--bt-border)", paddingTop: "env(safe-area-inset-top)" }}>
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
                <button
                  type="button"
                  onClick={() => {
                    refreshNotifications();
                    setNotificationsOpen((open) => !open);
                  }}
                  className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    color: notificationsOpen ? "var(--bt-accent-dark)" : "var(--bt-text-2)",
                    backgroundColor: notificationsOpen ? "var(--bt-accent-bg)" : "var(--bt-subtle)",
                    border: "1px solid var(--bt-border)",
                  }}
                  aria-label={t("nav.notifications")}>
                  <IconBell size={18} />
                  {notificationUnreadCount > 0 && <Badge count={notificationUnreadCount} small />}
                </button>
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

        <main data-bt-route-content className="w-full max-w-[1280px] mx-auto px-5 pt-7 pb-28 lg:px-9 lg:pb-10 overflow-x-clip">
          {!guestLocked && <LegacyEmailBanner />}
          {guestLocked ? <GuestLockedPanel pathname={router.pathname} /> : children}
        </main>
        <footer className="hidden lg:flex items-center justify-center gap-3 text-xs py-6"
          style={{ color: "var(--bt-text-3)" }}>
          <span>{t("footer.tagline")}</span>
          <span aria-hidden="true">·</span>
          <Link href="/legal" className="transition-colors hover:underline"
            onMouseEnter={e => e.currentTarget.style.color = "var(--bt-accent-dark)"}
            onMouseLeave={e => e.currentTarget.style.color = ""}>
            {t("footer.legal")}
          </Link>
        </footer>
      </div>

      {/* ══ Bottom nav mobile — 5 onglets ════════════════════════ */}
      {/* Structure en deux couches pour le safe-area-inset-bottom (indicateur home iPhone) */}
      <nav className="bt-mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-30"
        style={{ backgroundColor: "var(--bt-mobile-nav-bg)", borderTop: "1px solid var(--bt-border)", backdropFilter: "blur(10px)" }}>
        <div className="h-14 flex items-stretch">
        {mobileNav.map(n => {
          const active = n.isSocial
            ? SOCIAL_PATHS.includes(router.pathname)
            : router.pathname === n.href;
          const badge = isGuest ? 0 : n.isSocial ? socialBadge : badgeFor(n.href);
          return (
            <Link key={n.href} href={n.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
              style={{ color: active ? "var(--bt-accent-dark)" : "var(--bt-text-3)" }}>
              <div className="relative rounded-full px-3.5 py-0.5 transition-all duration-200"
                style={{ backgroundColor: active ? "var(--bt-accent-bg)" : "transparent" }}>
                <NavIcon href={n.iconKey} size={22} />
                {badge > 0 && <Badge count={badge} small />}
              </div>
              <span className="text-[10px] leading-none"
                style={{ fontWeight: active ? 700 : 500 }}>{t(n.key)}</span>
            </Link>
          );
        })}
        </div>
        {/* Spacer safe area pour l'indicateur home iPhone */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </nav>

      {!isGuest && notificationsOpen && (
        <NotificationPanel
          items={notificationItems}
          t={t}
          onClose={() => setNotificationsOpen(false)}
          onAcceptFriend={acceptFriendRequest}
          onRefuseFriend={refuseFriendRequest}
          onOpenFeed={openFeedNotification}
          onDismissAnnouncement={dismissAnnouncement}
        />
      )}

      {/* PWA install banner (centré, modal) */}
      <PwaInstallBanner />

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
