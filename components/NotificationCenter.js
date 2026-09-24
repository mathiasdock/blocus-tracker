// Centre de notifications — ce qui s'ouvre quand on touche la cloche.
//
// Base technique : « Notification Panel » de Layro (Mohamed Uvaish), récupéré
// via 21st.dev le 2026-09-24 (id 27135), puis adapté à Blocus.
//   Gardé de l'original : la ligne construite autour d'une phrase (seul le
//   nom est mis en avant, le verbe reste calme, l'heure dessous) ; l'avatar
//   avec sa pastille de type dans le coin ; le point de non-lu à droite ;
//   « Tout marquer comme lu » dans l'en-tête ; la liste à séparateurs fins
//   plutôt qu'une carte par notification ; l'état vide sur la cloche ; Échap.
//   Retiré : onglets (Inbox / Following / Archived), archivage, menu par
//   ligne, pièces jointes, actions Approuver / Refuser, framer-motion,
//   lucide-react, la police Inter et toutes ses couleurs.
//   Adapté : tokens --bt-*, Nunito Sans, rayons et ombre de l'app, glyphes
//   Blocus, une vraie <button> par ligne (l'original imbriquait des boutons
//   dans un div role=button), regroupement Aujourd'hui / Plus tôt, « Voir
//   plus », panneau accroché à la barre latérale sur ordinateur et feuille
//   InboxSheet (celle des demandes d'amis) sur téléphone.
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useNotifications } from "../contexts/NotificationContext";
import { displayName, timeAgo } from "../lib/format";
import {
  announcementText,
  dayGroups,
  destinationFor,
  sentenceKeyFor,
  splitSentence,
} from "../lib/notificationCenter.mjs";
import Avatar from "./Avatar";
import Glyph from "./Glyph";
import InboxSheet from "./InboxSheet";
import { SkeletonRow } from "./Skeleton";
import styles from "./NotificationCenter.module.css";

const DESKTOP_QUERY = "(min-width: 1024px)";

// Pastilles de type : famille PLEINE (comme l'ancienne cloche), pour ne pas
// ressembler à une icône d'action. La forme dit le type ; la pastille reste
// à l'encre, la couleur est réservée au non-lu.
const KIND_GLYPH = {
  friend_request: <><circle cx="9" cy="8.5" r="3.4" /><path d="M3 20a6 6 0 0 1 12 0z" /><path d="M18.5 8.5v6M21.5 11.5h-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></>,
  friend_accepted: <><circle cx="9" cy="8.5" r="3.4" /><path d="M3 20a6 6 0 0 1 12 0z" /><path d="m15.5 11.8 2.3 2.3 4.2-4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></>,
  private_message: <path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />,
  comment: <path fillRule="evenodd" d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1zm3.5 4.2a1 1 0 0 0 0 2h9a1 1 0 1 0 0-2zm0 3.6a1 1 0 1 0 0 2h5.5a1 1 0 1 0 0-2z" />,
  reaction: <path d="M12 21 3.6 12.6a5.4 5.4 0 1 1 7.6-7.6l.8.8.8-.8a5.4 5.4 0 1 1 7.6 7.6z" />,
};

// Annonces : glyphe au trait, seul dans sa pastille. Étincelles, info,
// alerte ; seule l'alerte garde une teinte (c'est un statut).
const ANNOUNCEMENT_GLYPH = {
  new: <path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 17l-1.9-5.3L5 9.8l5.1-1.9zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4.5M12 8h.02" /></>,
  important: <><path d="M10.3 4 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17.5h.02" /></>,
};

function IconBell({ size }) {
  return (
    <Glyph size={size}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Glyph>
  );
}

function IconCheckAll() {
  return <Glyph size={16}><path d="m2.5 12.5 4 4 8-9M12.5 16l1 .9 8-9" /></Glyph>;
}

function capitalize(text, lang) {
  return text ? text.charAt(0).toLocaleUpperCase(lang === "en" ? "en" : "fr") + text.slice(1) : text;
}

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return desktop;
}

function Face({ item, name }) {
  if (item.kind === "announcement") {
    const type = item.announcement?.type || "info";
    return (
      <span className={`${styles.face} ${styles.announcementFace}`} data-type={type} aria-hidden="true">
        <Glyph size={20}>{ANNOUNCEMENT_GLYPH[type] || ANNOUNCEMENT_GLYPH.info}</Glyph>
      </span>
    );
  }
  return (
    <span className={styles.face} aria-hidden="true">
      <Avatar url={item.actor?.avatar_url} pseudo={name} size={40} />
      <span className={styles.kindBadge}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">{KIND_GLYPH[item.kind]}</svg>
      </span>
    </span>
  );
}

function Row({ item, t, lang, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const unread = !item.read;
  const time = capitalize(timeAgo(new Date(item.atMs).toISOString(), lang), lang);
  const isAnnouncement = item.kind === "announcement";
  const name = item.actor ? displayName(item.actor) : t("notif.someone");
  const announcement = isAnnouncement ? announcementText(item, lang) : null;
  const parts = isAnnouncement ? null : splitSentence(t(sentenceKeyFor(item)), name, item.count);
  const secondary = isAnnouncement ? announcement.body : item.excerpt ? `« ${item.excerpt} »` : null;
  // Une annonce sans lien ne mène nulle part : la toucher la déplie.
  const expandable = isAnnouncement && !destinationFor(item) && Boolean(secondary);

  return (
    <li className={styles.item}>
      <button
        type="button"
        data-notif-row=""
        className={`${styles.row}${unread ? ` ${styles.unread}` : ""}`}
        aria-expanded={expandable ? expanded : undefined}
        onClick={() => {
          if (expandable) setExpanded((open) => !open);
          onOpen(item);
        }}>
        <Face item={item} name={name} />
        <span className={styles.body}>
          {unread && <span className="sr-only">{t("notif.unread")}, </span>}
          <span className={styles.sentence}>
            {isAnnouncement
              ? <strong>{announcement.title}</strong>
              : parts.map((part, index) => (part.strong
                ? <strong key={index}>{part.text}</strong>
                : <span key={index}>{part.text}</span>))}
          </span>
          {secondary && (
            <span className={`${styles.secondary}${expanded ? ` ${styles.secondaryOpen}` : ""}`}>{secondary}</span>
          )}
          <span className={styles.meta}>{time}</span>
        </span>
        <span className={styles.dotSlot} aria-hidden="true">
          {unread && <span className={styles.dot} />}
        </span>
      </button>
    </li>
  );
}

// Flèches haut / bas entre les lignes, Début / Fin aux extrémités. Depuis le
// panneau lui-même (focus à l'ouverture), la flèche du bas entre dans la liste.
function moveRowFocus(container, event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const rows = [...(container?.querySelectorAll("[data-notif-row]") || [])];
  if (!rows.length) return;
  event.preventDefault();
  const index = rows.indexOf(document.activeElement);
  let next = 0;
  if (event.key === "End") next = rows.length - 1;
  else if (event.key === "ArrowDown") next = index < 0 ? 0 : Math.min(rows.length - 1, index + 1);
  else if (event.key === "ArrowUp") next = index < 0 ? 0 : Math.max(0, index - 1);
  rows[next].focus();
}

function List({ inbox, t, lang, onOpen, onRetry, onMore }) {
  const listRef = useRef(null);
  const moreFromRef = useRef(null);

  function onKeyDown(event) {
    moveRowFocus(listRef.current, event);
  }

  // « Voir plus » au clavier : le focus passe sur la première ligne arrivée,
  // au lieu de se perdre quand le bouton disparaît.
  useEffect(() => {
    const from = moreFromRef.current;
    if (from === null || inbox.loadingMore) return;
    moreFromRef.current = null;
    const rows = listRef.current?.querySelectorAll("[data-notif-row]") || [];
    if (rows.length > from) rows[from].focus({ preventScroll: false });
  }, [inbox.items.length, inbox.loadingMore]);

  if (inbox.status === "loading" || inbox.status === "idle") {
    return (
      <div className={styles.state} aria-busy="true">
        <span className="sr-only">{t("notif.loading")}</span>
        {[0, 1, 2].map((index) => <SkeletonRow key={index} avatar={40} lines={2} />)}
      </div>
    );
  }
  if (inbox.status === "error") {
    return (
      <div className={styles.empty} role="alert">
        <p className={styles.emptyTitle}>{t("notif.loadError")}</p>
        <button type="button" className={`btn-ghost ${styles.retry}`} onClick={onRetry}>{t("notif.retry")}</button>
      </div>
    );
  }
  if (!inbox.items.length) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyBell} aria-hidden="true"><IconBell size={24} /></span>
        <p className={styles.emptyTitle}>{t("notif.empty")}</p>
        <p className={styles.emptyHint}>{t("notif.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div ref={listRef} onKeyDown={onKeyDown}>
      {dayGroups(inbox.items).map((group) => (
        <section key={group.id} aria-label={t(group.id === "today" ? "common.today" : "notif.earlier")}>
          <h3 className={styles.groupLabel}>{t(group.id === "today" ? "common.today" : "notif.earlier")}</h3>
          <ul className={styles.rows}>
            {group.items.map((item) => <Row key={item.key} item={item} t={t} lang={lang} onOpen={onOpen} />)}
          </ul>
        </section>
      ))}
      {(inbox.hasMore || inbox.moreError) && (
        <div className={styles.more}>
          {inbox.moreError && <p className={styles.moreError} role="alert">{t("notif.loadError")}</p>}
          <button type="button" className={styles.moreButton} disabled={inbox.loadingMore}
            onClick={() => {
              moreFromRef.current = inbox.items.length;
              onMore();
            }}>
            {inbox.loadingMore ? t("notif.loading") : inbox.moreError ? t("notif.retry") : t("notif.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}

function unreadLabel(t, count) {
  return count === 1 ? t("notif.unreadOne") : t("notif.unreadMany").replace("{n}", String(count));
}

function MarkAllButton({ t, onClick }) {
  return (
    <button type="button" className={styles.markAll} onClick={onClick}>
      <IconCheckAll />
      <span>{t("notif.markAllRead")}</span>
    </button>
  );
}

export default function NotificationCenter({ open, onClose, panelId }) {
  const { t, lang } = useI18n();
  const {
    inbox, loadInbox, loadMoreInbox, markAllNotificationsRead, openNotification, notificationUnreadCount,
  } = useNotifications();
  const desktop = useDesktop();
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const titleId = useId();
  const unread = inbox.status === "ready" ? inbox.unread : notificationUnreadCount;

  // Chaque ouverture relit la première page : ce qui a été lu sur un autre
  // appareil est déjà à jour ici.
  useEffect(() => {
    if (open) loadInbox();
  }, [open, loadInbox]);

  // Ordinateur : panneau non modal. Focus dedans à l'ouverture, rendu au
  // bouton à la fermeture ; Échap et un clic à l'extérieur le ferment.
  useEffect(() => {
    if (!open || !desktop) return undefined;
    returnFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    function onPointerDown(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (event.target.closest?.("[data-notif-trigger]")) return;
      onClose();
    }
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      returnFocusRef.current?.focus?.();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, desktop, onClose]);

  function onOpenItem(item) {
    const href = openNotification(item);
    if (href) onClose();
  }

  if (!open) return null;

  const list = (
    <List inbox={inbox} t={t} lang={lang} onOpen={onOpenItem} onRetry={loadInbox} onMore={loadMoreInbox} />
  );

  if (!desktop) {
    return (
      <InboxSheet open title={t("notif.title")} closeLabel={t("common.close")} onClose={onClose}
        subheader={unread > 0 ? (
          <div className={styles.sheetBar}>
            <span className={styles.count}>{unreadLabel(t, unread)}</span>
            <MarkAllButton t={t} onClick={markAllNotificationsRead} />
          </div>
        ) : null}>
        <div className={styles.sheetList}>{list}</div>
      </InboxSheet>
    );
  }

  return (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`bt-rise ${styles.panel}`}
      onKeyDown={(event) => {
        if (event.target === panelRef.current) moveRowFocus(panelRef.current, event);
      }}
      onBlur={(event) => {
        // Le focus quitte le panneau (Tab après la dernière ligne) : il se ferme.
        const next = event.relatedTarget;
        if (next && !panelRef.current?.contains(next) && !next.closest?.("[data-notif-trigger]")) onClose();
      }}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 id={titleId} className={styles.title}>{t("notif.title")}</h2>
          {unread > 0 && (
            <span className={styles.countPill}>
              <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
              <span className="sr-only">{unreadLabel(t, unread)}</span>
            </span>
          )}
        </div>
        {unread > 0 && <MarkAllButton t={t} onClick={markAllNotificationsRead} />}
      </header>
      <div className={styles.scroll}>{list}</div>
    </div>
  );
}
