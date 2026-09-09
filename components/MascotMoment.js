import { useEffect, useRef, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import Mascot from "./Mascot";
import { canShowMoment, markMomentSeen } from "../lib/mascotMoments";

// Comment la mascotte se présente.
//
// Avant, elle n'avait qu'une seule forme : un rectangle menthe pleine largeur,
// mascotte à gauche, phrase à droite, sur presque tous les écrans. Répétée
// partout, cette forme a fini par se lire comme un bandeau d'information —
// donc comme quelque chose qu'on saute.
//
// Cinq présentations, choisies selon ce que le moment PÈSE :
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
  action,          // { label, onClick } — appel à l'action facultatif
  size,
  animated = true,
  className = "",
  live = false,
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(false);

  // L'état part de `false` et n'est calculé qu'après le montage : la réponse
  // dépend du stockage du navigateur, qui n'existe pas au rendu serveur.
  useEffect(() => {
    if (!message) { setVisible(false); return; }
    setVisible(canShowMoment(eventKey, frequency));
  }, [message, eventKey, frequency]);

  useEffect(() => {
    if (!visible || !seenOnShow || seenRef.current) return;
    seenRef.current = true;
    markMomentSeen(eventKey, frequency);
  }, [visible, seenOnShow, eventKey, frequency]);

  useEffect(() => {
    if (!visible || !autoHideMs) return undefined;
    const id = setTimeout(() => setVisible(false), autoHideMs);
    return () => clearTimeout(id);
  }, [visible, autoHideMs]);

  function dismiss() {
    setVisible(false);
    markMomentSeen(eventKey, frequency);
  }

  if (!message || !visible) return null;

  const mascotSize = size || SIZES[presentation] || SIZES.bubble;
  const mascot = (
    <Mascot streak={streak} mood={mood} size={mascotSize} animated={animated}
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

  // ── Compagnon : la mascotte seule, sans surface ni texte ──
  if (presentation === "companion") {
    return (
      <span className={`inline-flex shrink-0 ${className}`} title={message} aria-label={message} role="img">
        <Mascot streak={streak} mood={mood} size={mascotSize} animated={animated} ariaLabel={message} />
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
