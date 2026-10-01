import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../contexts/I18nContext";
import { coachMetrics, placeCoach, planCoach } from "../lib/mascotPlacement.mjs";
import Mascot from "./Mascot";
import { canShowMoment, markMomentSeen } from "../lib/mascotMoments";

// Comment la mascotte se présente.
//
// Avant, elle n'avait qu'une seule forme : un rectangle menthe pleine largeur,
// mascotte à gauche, phrase à droite, sur presque tous les écrans. Répétée
// partout, cette forme a fini par se lire comme un bandeau d'information —
// donc comme quelque chose qu'on saute.
//
// Présentations choisies selon ce que le moment PÈSE :
//
//   bubble       Petite mascotte + bulle de dialogue à la taille du texte.
//                Le défaut. Elle ne prend PAS toute la largeur : c'est ce qui
//                la distingue d'un bandeau.
//   moment       Personnage plus grand, qui déborde le haut de son conteneur.
//                Pour un état vide où il y a vraiment quelque chose à faire.
//   celebration  Pleine présence, centrée. Records, paliers, déblocages.
//   companion    Mascotte seule, posée à côté d'un chiffre ou d'un bouton.
//                Aucun texte : le message vit dans l'infobulle.
//   toast        Réaction courte après une action, qui s'efface toute seule.
//   anchored     Le coach : le personnage et sa bulle ne font qu'un objet,
//                posé contre la surface dont il parle (`anchorKind` : Study
//                Blocks, Focus, examen, missions, badges). Hors du flux :
//                rien n'est réservé, rien ne bouge à la fermeture.
//
// ── Règle de contenu ────────────────────────────────────────
// Le message doit être COURT. « 4 blocs déjà ! », « Nouveau record ! »,
// « Ta série est sauvée. » Si une idée réclame un paragraphe, elle n'est pas
// pour la mascotte : c'est à l'interface de la dire, en texte, à sa place.

const SIZES = {
  bubble: 46,
  moment: 92,
  celebration: 116,
  companion: 34,
  toast: 40,
};

// Un seul coach visible à la fois : un jalon du chrono (éphémère, `live`)
// passe devant une mission ou un examen, qui reviennent ensuite. Le plus
// récent l'emporte à priorité égale. Rien n'est marqué « vu » tant qu'un
// coach attend son tour.
const coachQueue = [];
const coachListeners = new Set();
function notifyCoaches() { coachListeners.forEach((listener) => listener()); }
function useCoachTurn(priority) {
  const token = useRef(null);
  if (!token.current) token.current = { priority };
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const entry = token.current;
    coachQueue.push(entry);
    coachListeners.add(rerender);
    notifyCoaches();
    return () => {
      coachListeners.delete(rerender);
      const index = coachQueue.indexOf(entry);
      if (index >= 0) coachQueue.splice(index, 1);
      notifyCoaches();
    };
  }, []);
  let top = null;
  for (const entry of coachQueue) if (!top || entry.priority >= top.priority) top = entry;
  return top === token.current;
}

// Le texte de l'élément (pour que la bulle ne le recouvre jamais) : la boîte
// des lignes écrites, pas celle des blocs, qui vont jusqu'au bord de la carte,
// et chaque ligne à part. Les textes réservés aux lecteurs d'écran (1 px) ne
// comptent pas.
function textBox(element) {
  if (!element || typeof document === "undefined") return null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const lines = [];
  let box = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 4) continue;
      lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      box = box
        ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
  }
  return box ? { ...box, width: box.right - box.left, height: box.bottom - box.top, lines } : null;
}

function findFrame(anchor, frameRef) {
  return frameRef?.current
    || anchor.querySelector("[data-coach-frame]")
    || anchor.closest("[data-coach-frame]")
    || anchor.closest("section")
    || anchor;
}

const TAIL = {
  side: "M14 1.5C12.6 7.4 8 10.6.5 11.4c6 .9 10.5 3 13.5 5.6Z",
  down: "M1.5 0C7.4 1.4 10.6 6 11.4 13.5C12.3 7.5 14.4 3 17 0Z",
};

function CoachMoment({
  kind, anchorRef, frameRef, live, onShown, className, mascotProps, children, closeButton,
}) {
  const bubbleRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const hasTurn = useCoachTurn(live ? 1 : 0);
  const shownRef = useRef(false);

  useLayoutEffect(() => {
    if (!hasTurn) { setLayout(null); return undefined; }
    const anchor = anchorRef?.current;
    if (!anchor) return undefined;
    let frame = 0;
    let last = "";

    function update() {
      frame = 0;
      const bubble = bubbleRef.current;
      if (!bubble || !anchor.isConnected) return;
      const frameEl = findFrame(anchor, frameRef);
      const clearEl = frameEl.querySelector("[data-coach-clear]");
      const spotEl = frameEl.querySelector("[data-coach-spot]");
      const spotRect = spotEl?.getBoundingClientRect();
      const floorRect = frameEl.querySelector("[data-coach-floor]")?.getBoundingClientRect();
      const width = window.innerWidth;
      const focus = document.documentElement.classList.contains("bt-focus-active");
      const viewport = {
        width,
        height: window.innerHeight,
        topInset: 12,
        bottomInset: width < 1024 && !focus ? 92 : 12,
      };
      const modal = document.querySelector('dialog[open], [aria-modal="true"]');
      const text = textBox(anchor);
      const plan = modal ? null : planCoach(kind, {
        anchor: anchor.getBoundingClientRect(),
        frame: frameEl.getBoundingClientRect(),
        text,
        lines: text?.lines,
        clear: textBox(clearEl),
        spot: spotRect && spotRect.width > 0 ? spotRect : null,
        floor: floorRect && floorRect.height > 0 ? floorRect : null,
      }, viewport);
      if (!plan) {
        if (last !== "none") { last = "none"; setLayout(null); }
        return;
      }
      // La largeur permise d'abord, puis la taille réelle de la bulle. Les
      // dimensions de mise en page ignorent l'animation d'entrée (scale).
      const maxWidth = `${plan.maxWidth}px`;
      if (bubble.style.maxWidth !== maxWidth) bubble.style.maxWidth = maxWidth;
      const next = placeCoach(plan, { width: bubble.offsetWidth, height: bubble.offsetHeight }, viewport);
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setLayout(next); }
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    update();
    // L'ancre, sa carte (qui grandit quand une liste s'y ajoute) et la bulle.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(anchor);
    const frameEl = findFrame(anchor, frameRef);
    if (frameEl !== anchor) observer?.observe(frameEl);
    if (bubbleRef.current) observer?.observe(bubbleRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    // Une fenêtre modale passe devant : le coach se retire et revient après.
    const mutations = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    mutations?.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["open", "aria-modal"] });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [anchorRef, frameRef, kind, hasTurn]);

  useEffect(() => {
    if (layout && !shownRef.current) { shownRef.current = true; onShown?.(); }
  }, [layout, onShown]);

  if (typeof document === "undefined") return null;
  const ready = Boolean(layout);
  const size = layout?.mascot.size || coachMetrics(window.innerWidth).size;
  const tailStyle = layout
    ? layout.tail.edge === "bottom" ? { left: layout.tail.offset - 9 } : { top: layout.tail.offset - 9 }
    : undefined;
  return createPortal(
    <div className={`bt-coach ${className}`} data-mascot-coach="" data-kind={kind} data-side={layout?.side}
      data-ready={ready ? "" : undefined} hidden={!hasTurn}
      style={{
        "--coach-enter-x": `${layout?.enter.x || 0}px`,
        "--coach-enter-y": `${layout?.enter.y || 0}px`,
        "--coach-tail-x": layout?.tail.edge === "bottom" ? `${layout.tail.offset}px` : layout?.tail.edge === "left" ? "0px" : "100%",
        "--coach-tail-y": layout?.tail.edge === "bottom" ? "100%" : `${layout?.tail.offset || 0}px`,
      }}>
      <div ref={bubbleRef} className="bt-coach-bubble" data-coach-part="bubble"
        role="status" aria-live={live ? "polite" : "off"}
        style={layout ? { left: layout.bubble.x, top: layout.bubble.y } : undefined}>
        {/* La croix flotte DANS le paragraphe : posée à côté, elle n'entrait
            pas dans la largeur naturelle de la bulle, et « Examen demain. »
            passait sur deux lignes dans une bulle qui avait la place. */}
        <p className="bt-coach-text">{closeButton}{children}</p>
        <svg className={`bt-coach-tail is-${layout?.tail.edge || "right"}`} style={tailStyle}
          width={layout?.tail.edge === "bottom" ? 18 : 14} height={layout?.tail.edge === "bottom" ? 14 : 18}
          viewBox={layout?.tail.edge === "bottom" ? "0 0 18 14" : "0 0 14 18"} aria-hidden="true" focusable="false">
          <path d={layout?.tail.edge === "bottom" ? TAIL.down : TAIL.side} />
        </svg>
      </div>
      {ready && (
        <span className="bt-coach-mascot" data-coach-part="mascot" aria-hidden="true"
          style={{ left: layout.mascot.x, top: layout.mascot.y, width: size, height: size }}>
          <Mascot {...mascotProps} size={size} />
        </span>
      )}
    </div>,
    document.body,
  );
}

export default function MascotMoment({
  message,
  mood = "neutral",
  presentation = "bubble",
  streak = 0,
  // Identité du moment + à quelle fréquence il a le droit de revenir.
  // Sans `eventKey`, le moment n'est pas mémorisé : à réserver aux réactions
  // immédiates, où réapparaître EST le comportement voulu.
  eventKey,
  frequency = "session",
  dismissible = true,
  // Marque le moment comme vu dès l'affichage, sans attendre une fermeture.
  // Pour ce qui se lit au passage et n'a pas de bouton (un toast).
  seenOnShow = false,
  autoHideMs,
  anchorRef,
  // Coach (presentation "anchored") : de quoi il parle — "studyBlocks",
  // "focusBlocks", "exam", "mission", "achievement" — et, si besoin, la
  // surface contre laquelle il se pose (sinon la carte de l'ancre).
  anchorKind = "exam",
  frameRef,
  onDismiss,
  action,          // { label, onClick } — appel à l'action facultatif
  size,
  animated = true,
  className = "",
  live = false,
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(null);

  // L'état part de `false` et n'est calculé qu'après le montage : la réponse
  // dépend du stockage du navigateur, qui n'existe pas au rendu serveur.
  useEffect(() => {
    if (!message) { setVisible(false); return; }
    setVisible(canShowMoment(eventKey, frequency));
  }, [message, eventKey, frequency]);

  useEffect(() => {
    const identity = `${frequency}:${eventKey}`;
    if (!visible || !seenOnShow || presentation === "anchored" || seenRef.current === identity) return;
    seenRef.current = identity;
    markMomentSeen(eventKey, frequency);
  }, [visible, seenOnShow, eventKey, frequency, presentation]);

  useEffect(() => {
    if (!visible || !autoHideMs) return undefined;
    const id = setTimeout(() => setVisible(false), autoHideMs);
    return () => clearTimeout(id);
  }, [visible, autoHideMs]);

  function dismiss() {
    setVisible(false);
    markMomentSeen(eventKey, frequency);
    onDismiss?.();
  }

  // Le portail est visuellement près de sa source, mais arrive en fin de DOM.
  // Escape permet de le fermer sans forcer le focus à quitter le travail.
  useEffect(() => {
    if (!visible || presentation !== "anchored") return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
      // Seul le coach affiché répond : celui qui attend son tour est caché.
      if (document.querySelector("[data-mascot-coach]:not([hidden])")?.dataset.kind !== anchorKind) return;
      setVisible(false);
      markMomentSeen(eventKey, frequency);
      onDismiss?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, presentation, eventKey, frequency, onDismiss, anchorKind]);

  function markAnchoredShown() {
    const identity = `${frequency}:${eventKey}`;
    if (!seenOnShow || seenRef.current === identity) return;
    seenRef.current = identity;
    markMomentSeen(eventKey, frequency);
  }

  if (!message || !visible) return null;

  const mascotSize = size || SIZES[presentation] || SIZES.bubble;
  const mascot = (
    <Mascot streak={streak} mood={mood} size={mascotSize} animated={animated} reactionKey={eventKey || message}
      ariaLabel={t("mascot.label")} />
  );

  const closeBtn = dismissible ? (
    <button type="button" onClick={dismiss} aria-label={t("coach.close")} title={t("coach.close")}
      className="bt-mascot-close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" />
      </svg>
    </button>
  ) : null;

  const cta = action ? (
    <button type="button" onClick={() => { action.onClick?.(); dismiss(); }}
      className="bt-mascot-cta">
      {action.label}
    </button>
  ) : null;

  if (presentation === "anchored") {
    // Une entrée, un geste court joué pendant l'entrée (≈ 450 ms en tout),
    // puis le calme : pas de respiration ni de gestes d'attente à côté du
    // travail de l'étudiant. Une réussite lève les deux bras (pose « cheer »)
    // au lieu du grand saut des célébrations.
    const celebrating = mood === "celebrating" || mood === "celebrate";
    const reaction = celebrating ? "cheer" : mood === "proud" ? "beam" : mood === "focused" ? "affirm" : "hello";
    return (
      <CoachMoment kind={anchorKind} anchorRef={anchorRef} frameRef={frameRef} live={live}
        onShown={markAnchoredShown} className={className}
        closeButton={dismissible ? (
          <button type="button" onClick={dismiss} aria-label={t("coach.close")} title={t("coach.close")}
            className="bt-coach-close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="m17.4 6.6-10.8 10.8M6.6 6.6l10.8 10.8" />
            </svg>
          </button>
        ) : null}
        mascotProps={{
          streak, mood, animated, reactionKey: eventKey || message, ariaLabel: t("mascot.label"),
          idle: false, reaction, reactionDelay: 70, pose: celebrating ? "cheer" : undefined,
        }}>
        {message}{cta}
      </CoachMoment>
    );
  }

  // ── Compagnon : la mascotte seule, sans surface ni texte ──
  if (presentation === "companion") {
    return (
      <span className={`inline-flex shrink-0 ${className}`} title={message} aria-label={message} role="img">
        <Mascot streak={streak} mood={mood} size={mascotSize} animated={animated} reactionKey={eventKey || message} ariaLabel={message} />
      </span>
    );
  }

  // ── Célébration : pleine présence, centrée ────────────────
  if (presentation === "celebration") {
    return (
      <div className={`bt-mascot-celebration ${className}`} role="status" aria-live={live ? "polite" : "off"}>
        <div className="bt-mascot-celebration-art">{mascot}</div>
        <p className="bt-mascot-celebration-text">{message}</p>
        {cta}
      </div>
    );
  }

  // ── Moment : le personnage déborde le haut de sa carte ────
  if (presentation === "moment") {
    return (
      <div className={`bt-mascot-moment ${className}`} role="status" aria-live={live ? "polite" : "off"}>
        {closeBtn}
        <div className="bt-mascot-moment-art">{mascot}</div>
        <p className="bt-mascot-moment-text">{message}</p>
        {cta}
      </div>
    );
  }

  // ── Bulle (défaut) et toast : même objet, ancrage différent ──
  return (
    <div
      className={`bt-mascot-bubble${presentation === "toast" ? " bt-mascot-bubble--toast" : ""} ${className}`}
      role="status"
      aria-live={live ? "polite" : "off"}
    >
      <span className="bt-mascot-bubble-art">{mascot}</span>
      <span className="bt-mascot-bubble-body">
        <span className="bt-mascot-bubble-text">{message}</span>
        {cta}
      </span>
      {closeBtn}
    </div>
  );
}
