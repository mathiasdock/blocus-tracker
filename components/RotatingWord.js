// Mot qui tourne dans un titre — l'essence du "Rotating Text" (récupéré via le
// MCP 21st.dev), portée SANS framer-motion. Deux idées reprises telles quelles :
//   • un placeholder INVISIBLE contenant le mot le plus large réserve la place
//     → aucun décalage de layout quand les mots changent de longueur ;
//   • le mot courant est en position absolue et s'anime (sortie ↑ puis entrée ↑
//     avec flou), piloté par de simples classes CSS (.bt-rotw-*), zéro dep.
//
// Le premier mot est rendu en clair (SSR/SEO). Sous prefers-reduced-motion ou
// avec un seul mot : statique. L'intervalle se met en pause onglet caché.

import { useEffect, useState } from "react";

export default function RotatingWord({ words, interval = 2600, className = "", style }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Array.isArray(words) || words.length < 2) return undefined;
    // Entrée seule : à chaque tick on incrémente ; le remount (key) rejoue
    // l'animation d'entrée du nouveau mot. Fondu doux → jamais de frame vide
    // (contrairement à un cycle sortie→entrée qui laisse un trou visible).
    const id = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % words.length);
    }, interval);
    return () => clearInterval(id);
  }, [words, interval]);

  if (!Array.isArray(words) || !words.length) return null;
  const widest = words.reduce((a, b) => (a.length >= b.length ? a : b), "");

  return (
    <span className={`bt-rotw ${className}`} style={style}>
      <span className="bt-rotw-ghost" aria-hidden="true">{widest}</span>
      <span key={index} className="bt-rotw-word">{words[index]}</span>
    </span>
  );
}
