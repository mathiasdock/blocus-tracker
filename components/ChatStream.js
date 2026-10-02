import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar";
import FilterMenu from "./FilterMenu";
import Glyph from "./Glyph";
import { bubblePosition, buildChatThread, chatFullTime, chatTimeLabel } from "../lib/chatThread.mjs";
import styles from "./ChatStream.module.css";

// Fil d'une conversation de Social → Amis (messages privés et groupes), façon
// Instagram : les messages partent du bas, contre le champ ; une heure centrée
// ouvre chaque échange ; les messages d'une même personne se suivent en série,
// sa photo à côté de la dernière bulle. Le parent remonte le composant à
// chaque conversation (`key`) : elle s'ouvre toujours sur son dernier message.

// Plus près du bas que ça, on suit la conversation ; plus haut, on lit
// l'historique et rien ne doit nous en arracher.
const NEAR_BOTTOM_PX = 120;

// Sur le dernier message, en notant les hauteurs auxquelles on s'y est posé.
function pinToBottom(stream, sizes) {
  stream.scrollTop = stream.scrollHeight;
  sizes.current = { content: stream.scrollHeight, view: stream.clientHeight };
}

const IconMore = () => (
  <Glyph size={18}>
    <circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
  </Glyph>
);

const IconPaperclip = () => (
  <Glyph size={20}>
    <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.93a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
  </Glyph>
);

export default function ChatStream({
  messages, ready, viewerId, authorOf, authorFor, showNames = false, onOpenProfile,
  renderContent, actionsFor, intro = null, empty = null, label, t, lang,
}) {
  const streamRef = useRef(null);
  const contentRef = useRef(null);
  const stick = useRef(true);
  const lastId = useRef(null);
  // Hauteurs vues au dernier défilement : un défilement qui arrive avec une
  // autre hauteur vient de la page (image chargée, clavier), pas du doigt.
  const sizes = useRef({ content: 0, view: 0 });
  // Au doigt, pas de survol : toucher une bulle montre ses actions.
  const [activeId, setActiveId] = useState(null);

  const items = useMemo(() => buildChatThread(messages, { viewerId, authorOf }), [messages, viewerId, authorOf]);

  useLayoutEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const last = messages[messages.length - 1];
    // Ton propre message te ramène en bas, même si tu lisais plus haut.
    if (last && last.id !== lastId.current && authorOf(last) === viewerId) stick.current = true;
    lastId.current = last ? last.id : null;
    if (stick.current) pinToBottom(stream, sizes);
  }, [messages, ready, authorOf, viewerId]);

  // Ce qui grandit après coup (image affichée, présentation chargée) ou une
  // zone qui rétrécit (clavier, bandeau du chrono) : on reste sur le dernier
  // message si on y était.
  useEffect(() => {
    const stream = streamRef.current;
    const content = contentRef.current;
    if (!stream || !content || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (stick.current) pinToBottom(stream, sizes);
    });
    observer.observe(stream);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function onScroll() {
    const stream = streamRef.current;
    if (!stream) return;
    const { scrollHeight, clientHeight } = stream;
    const resized = scrollHeight !== sizes.current.content || clientHeight !== sizes.current.view;
    if (resized && stick.current) {
      pinToBottom(stream, sizes);
      return;
    }
    sizes.current = { content: scrollHeight, view: clientHeight };
    stick.current = scrollHeight - stream.scrollTop - clientHeight < NEAR_BOTTOM_PX;
  }

  return (
    <div ref={streamRef} className={styles.stream} onScroll={onScroll}
      role="log" aria-live="off" aria-label={label} aria-busy={!ready || undefined}>
      <div ref={contentRef} className={styles.content}>
        {ready && intro}
        {ready && !messages.length && empty}
        {items.map((item) => {
          if (item.type === "time") {
            return (
              <p key={item.key} className={styles.time}>
                <time dateTime={item.at}>{chatTimeLabel(item.at, { lang, yesterday: t("msg.yesterday") })}</time>
              </p>
            );
          }
          const author = authorFor(item.authorId) || {};
          const name = author.name || t("common.unknownUser");
          return (
            <div key={item.key} className={`${styles.run} ${item.mine ? styles.mine : styles.theirs}`}>
              {/* Premier dans le DOM (le lecteur d'écran sait qui parle), en
                  bas à l'écran (à côté de la dernière bulle). */}
              {!item.mine && (
                <button type="button" className={styles.avatar} onClick={() => onOpenProfile?.(item.authorId)}
                  aria-label={t("msg.viewProfileOf").replace("{name}", name)}>
                  <Avatar url={author.avatarUrl} pseudo={name} size={28} />
                </button>
              )}
              <div className={styles.body}>
                {item.mine
                  ? <span className="sr-only">{t("msg.you")}</span>
                  : showNames && <p className={styles.name} aria-hidden="true">{name}</p>}
                {item.messages.map((message, index) => {
                  const actions = actionsFor ? actionsFor(message, item.mine) : [];
                  const position = bubblePosition(index, item.messages.length);
                  return (
                    <div key={message.id} className={`${styles.message}${activeId === message.id ? ` ${styles.active}` : ""}`}>
                      <div className={`${styles.bubble} ${styles[position] || ""}`} title={chatFullTime(message.created_at, lang)}
                        onClick={actions.length ? (event) => {
                          if (event.target.closest("a, button")) return;
                          setActiveId((current) => (current === message.id ? null : message.id));
                        } : undefined}>
                        {renderContent(message, item.mine)}
                      </div>
                      {actions.length > 0 && (
                        <FilterMenu ariaLabel={t("msg.messageActions")} className={styles.moreWrap} triggerClassName={styles.more}
                          trigger={<IconMore />} actions={actions} align={item.mine ? "right" : "left"} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Le champ d'une conversation : une seule capsule, trombone à gauche,
// « Envoyer » à droite. Le champ porte lui-même la capsule, pour que l'anneau
// de focus de l'app l'entoure (il ne se retire pas, voir styles/globals.css).
export function ChatComposer({
  onSubmit, value, onChange, placeholder, label, maxLength, sending, canSend, fileInputRef, accept, onFile, t,
}) {
  return (
    <form onSubmit={onSubmit} className={styles.composer}>
      <div className={styles.field}>
        <button type="button" className={styles.attach} onClick={() => fileInputRef.current?.click()}
          aria-label={t("common.attach")} title={t("common.attach")}>
          <IconPaperclip />
        </button>
        <input ref={fileInputRef} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(event) => onFile(event.currentTarget)} />
        <input className={styles.input} aria-label={label} placeholder={placeholder} maxLength={maxLength}
          value={value} onChange={(event) => onChange(event.target.value)} enterKeyHint="send" autoComplete="off" />
        {/* Garder le focus dans le champ : le clavier du téléphone reste
            ouvert après l'envoi, comme dans une messagerie. */}
        <button type="submit" className={styles.send} disabled={!canSend} onMouseDown={(event) => event.preventDefault()}>
          {sending ? "…" : t("common.send")}
        </button>
      </div>
    </form>
  );
}

export const chatStyles = styles;
