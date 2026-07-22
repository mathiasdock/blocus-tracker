// Phrase qui s'illumine mot par mot au scroll — l'essence du "Text Reveal"
// (magicui, récupéré via le MCP 21st.dev), portée SANS framer-motion.
//
// Idée reprise telle quelle : un conteneur haut (200vh) tient une ligne `sticky`
// épinglée pendant qu'on scrolle ; la progression du scroll dans ce conteneur est
// mappée à l'opacité de chaque mot → ils s'allument de gauche à droite, comme
// une lecture. Ici piloté par un simple handler scroll (rAF), zéro dépendance.
//
// Progressive enhancement : sans JS les mots sont pleinement lisibles (opacité 1
// par défaut en CSS) ; sous prefers-reduced-motion on force 1 et on n'écoute rien
// (indispensable — sinon le texte resterait sombre là où le scroll-driven CSS
// n'est pas supporté). Le handler se coupe hors-écran.

import { useEffect, useRef } from "react";

export default function ScrollRevealText({ text, className = "", style }) {
  const wrapRef = useRef(null);
  const spansRef = useRef([]);
  const words = String(text || "").split(" ").filter(Boolean);

  useEffect(() => {
    const wrap = wrapRef.current;
    const spans = spansRef.current.filter(Boolean);
    if (!wrap || spans.length < 2) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      spans.forEach((s) => { s.style.opacity = "1"; });
      return undefined;
    }

    const n = spans.length;
    // Fenêtre d'allumage par mot (léger chevauchement) ; les départs sont répartis
    // sur [0, 1-w] pour que le DERNIER mot atteigne 1 pile à p = 1.
    const w = Math.min(Math.max(1.4 / n, 0.06), 0.5);
    const span = 1 - w;
    const starts = spans.map((_, i) => (n === 1 ? 0 : (i / (n - 1)) * span));

    let ticking = false;
    let lastP = -1;
    const apply = () => {
      ticking = false;
      const rect = wrap.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = Math.max(rect.height - vh, 1); // course de scroll pendant l'épinglage
      const p = Math.min(Math.max(-rect.top / total, 0), 1);
      if (p === lastP) return;
      lastP = p;
      for (let i = 0; i < n; i++) {
        const o = Math.min(Math.max((p - starts[i]) / w, 0), 1);
        spans[i].style.opacity = String(0.26 + 0.74 * o);
      }
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [text]);

  if (!words.length) return null;

  return (
    <div ref={wrapRef} className={`bt-reveal ${className}`} style={style}>
      <div className="bt-reveal-sticky">
        <p className="bt-reveal-text">
          {words.map((word, i) => (
            <span
              key={i}
              ref={(el) => { spansRef.current[i] = el; }}
              className="bt-reveal-word"
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
