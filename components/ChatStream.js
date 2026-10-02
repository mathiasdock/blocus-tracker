import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar";
import FilterMenu from "./FilterMenu";
import Glyph from "./Glyph";
import { bubblePosition, buildChatThread, chatFullTime, chatTimeLabel } from "../lib/chatThread.mjs";
import styles from "./ChatStream.module.css";

// Le fil d'une conversation, façon Instagram, partagé par les messages privés,
// les groupes (Social → Amis) et les salons de cours (Communautés) : les
// messages partent du bas, contre le champ ; une heure centrée ouvre chaque
// échange ; les messages d'une même personne se suivent en série, sa photo à
// côté de la dernière bulle. Le parent remonte le composant à chaque
// conversation (`key`) : elle s'ouvre toujours sur son dernier message.

// Plus près du bas que ça, on suit la conversation ; plus haut, on lit
// l'historique et rien ne doit nous en arracher.
const NEAR_BOTTOM_PX = 120;
// Le champ grandit avec le texte jusqu'à six lignes, puis défile.
const FIELD_MAX_PX = 154;

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

const IconPaperclip = ({ size = 20 }) => (
  <Glyph size={size}>
    <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.93a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
  </Glyph>
);

const IconClose = () => <Glyph size={16}><path d="m6 6 12 12M6 18 18 6" /></Glyph>;

export default function ChatStream({
  messages, ready, viewerId, authorOf, authorFor, showNames = false, onOpenProfile,
  renderContent, actionsFor, actionsMenuClassName = "", receipt = null,
  before = null, intro = null, empty = null, label, t, lang,
}) {
  const streamRef = useRef(null);
  const contentRef = useRef(null);
  const stick = useRef(true);
  const lastId = useRef(null);
  const firstId = useRef(null);
  // Hauteurs vues au dernier défilement : un défilement qui arrive avec une
  // autre hauteur vient de la page (image chargée, clavier), pas du doigt.
  const sizes = useRef({ content: 0, view: 0 });
  // Distance entre le haut de l'écran et le bas du fil, pour retrouver sa
  // place quand des messages plus anciens s'ajoutent au-dessus.
  const fromBottom = useRef(0);
  // Au doigt, pas de survol : toucher une bulle montre ses actions.
  const [activeId, setActiveId] = useState(null);

  const items = useMemo(() => buildChatThread(messages, { viewerId, authorOf }), [messages, viewerId, authorOf]);

  useLayoutEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const first = messages[0];
    const last = messages[messages.length - 1];
    const olderAdded = !!first && !!firstId.current && first.id !== firstId.current
      && messages.some((message) => message.id === firstId.current);
    firstId.current = first ? first.id : null;
    // Ton propre message te ramène en bas, même si tu lisais plus haut.
    if (last && last.id !== lastId.current && authorOf(last) === viewerId) stick.current = true;
    lastId.current = last ? last.id : null;
    if (stick.current) {
      pinToBottom(stream, sizes);
    } else if (olderAdded) {
      // Des messages plus anciens arrivent au-dessus : on garde sous les yeux
      // ce qu'on lisait.
      stream.scrollTop = stream.scrollHeight - fromBottom.current;
      sizes.current = { content: stream.scrollHeight, view: stream.clientHeight };
    }
  }, [messages, ready, authorOf, viewerId]);

  // Ce qui grandit après coup (image affichée, « Vu ») ou une zone qui
  // rétrécit (clavier, bandeau du chrono) : on reste sur le dernier message si
  // on y était.
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
    fromBottom.current = scrollHeight - stream.scrollTop;
    stick.current = scrollHeight - stream.scrollTop - clientHeight < NEAR_BOTTOM_PX;
  }

  return (
    <div ref={streamRef} className={styles.stream} onScroll={onScroll}
      role="log" aria-live="off" aria-label={label} aria-busy={!ready || undefined}>
      <div ref={contentRef} className={styles.content}>
        {before}
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
                          menuClassName={actionsMenuClassName} trigger={<IconMore />} actions={actions} align={item.mine ? "right" : "left"} />
                      )}
                    </div>
                  );
                })}
                {receipt && item.messages.some((message) => message.id === receipt.id) && (
                  <p className={styles.receipt}>{receipt.label}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Le champ d'une conversation, le même partout : une capsule avec le trombone
// (et les outils propres à l'écran) à gauche, « Envoyer » à droite. Le champ
// porte lui-même la capsule, pour que l'anneau de focus de l'app l'entoure (il
// ne se retire pas, voir styles/globals.css). Il grandit sur plusieurs lignes ;
// Entrée envoie avec un clavier physique, va à la ligne au doigt.
export function ChatComposer({
  onSubmit, value, onChange, placeholder, label, maxLength, sending, canSend,
  file = null, onRemoveFile, fileInputRef, accept, onFile,
  tools = [], above = null, below = null, inputRef, inputId, describedBy, t,
}) {
  const ownRef = useRef(null);
  const fieldRef = inputRef || ownRef;
  const formRef = useRef(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight + 2, FIELD_MAX_PX)}px`;
  }, [value, fieldRef]);

  function onKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    event.preventDefault();
    const form = formRef.current;
    if (!canSend || !form) return;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={styles.composer}>
      {(file || above) && (
        <div className={styles.extras}>
          {file && (
            <div className={styles.extra}>
              <span className={styles.extraIcon} aria-hidden="true"><IconPaperclip size={16} /></span>
              <span className={styles.fileName} title={file.name}>{file.name}</span>
              <button type="button" className={styles.extraRemove} onClick={onRemoveFile}
                aria-label={t("msg.removeFile").replace("{name}", file.name)}>
                <IconClose />
              </button>
            </div>
          )}
          {above}
        </div>
      )}
      {/* Trombone + outils à gauche : la marge du texte suit leur nombre. */}
      <div className={styles.field} style={{ "--lead": `${8 + 40 * (1 + tools.length)}px` }}>
        <button type="button" className={styles.tool} style={{ left: 3 }} onClick={() => fileInputRef.current?.click()}
          aria-label={t("common.attach")} title={t("common.attach")}>
          <IconPaperclip />
        </button>
        {tools.map((tool, index) => (
          <button key={tool.key} type="button" className={`${styles.tool}${tool.pressed ? ` ${styles.toolOn}` : ""}`}
            style={{ left: 3 + 40 * (index + 1) }} onClick={tool.onClick} aria-pressed={tool.pressed}
            aria-label={tool.label} title={tool.label}>
            {tool.icon}
          </button>
        ))}
        <input ref={fileInputRef} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(event) => onFile(event.currentTarget)} />
        <textarea ref={fieldRef} id={inputId} className={styles.input} rows={1} aria-label={label}
          aria-describedby={describedBy} placeholder={placeholder} maxLength={maxLength} value={value}
          onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} />
        {/* Garder le focus dans le champ : le clavier du téléphone reste
            ouvert après l'envoi, comme dans une messagerie. */}
        <button type="submit" className={styles.send} disabled={!canSend} onMouseDown={(event) => event.preventDefault()}>
          {sending ? t("msg.sending") : t("common.send")}
        </button>
      </div>
      {below}
    </form>
  );
}

// Téléphone, conversation en plein écran : iOS garde 100dvh quand le clavier
// s'ouvre. Le panneau suit la partie visible de l'écran, pour que le champ
// reste au-dessus du clavier et l'en-tête en vue. `key` : un autre panneau a
// pu prendre la place (message privé → groupe).
export function useChatViewport(ref, active, key) {
  useEffect(() => {
    const element = ref.current;
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !element || !viewport) return undefined;
    const narrow = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      if (!narrow.matches) { element.style.removeProperty("--bt-chat-viewport"); return; }
      element.style.setProperty("--bt-chat-viewport", `${Math.round(viewport.height)}px`);
      if (window.scrollY) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener("resize", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      element.style.removeProperty("--bt-chat-viewport");
    };
  }, [ref, active, key]);
}

export const chatStyles = styles;
