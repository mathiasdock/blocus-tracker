// Sélecteur segmenté avec glissière à ressort — l'essence du "Discrete Tab"
// (récupéré via le MCP 21st.dev), portée SANS framer-motion : un pouce absolu
// (.bt-seg-thumb, transition CSS) glisse sous l'option active ; le JS ne fait
// que mesurer offsetLeft/offsetWidth et poser transform/width sur le nœud.
// Remesure à chaque rendu (labels/langue) et au resize. A11y : role=tablist
// optionnel laissé au parent ; ici de simples boutons, focus natif conservé.
//
// Props :
//   options  : [{ value, label }]
//   value    : valeur active
//   onChange : (value) => void
//   tone     : "surface" (pouce blanc + ombre — défaut) | "accent" (pouce teinté)
//   className / buttonClassName : compléments de style du conteneur / des boutons

import { useEffect, useRef } from "react";

export default function SegmentedGlide({
  options,
  value,
  onChange,
  tone = "surface",
  className = "",
  buttonClassName = "px-3 py-1.5 text-xs",
}) {
  const wrapRef = useRef(null);
  const thumbRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const thumb = thumbRef.current;
    if (!wrap || !thumb) return undefined;
    const place = () => {
      const btn = wrap.querySelector(`[data-seg="${CSS.escape(String(value))}"]`);
      if (!btn) return;
      thumb.style.width = `${btn.offsetWidth}px`;
      thumb.style.transform = `translateX(${btn.offsetLeft}px)`;
      thumb.style.opacity = "1";
    };
    place();
    window.addEventListener("resize", place);
    // Les métriques bougent quand la police display finit de charger.
    document.fonts?.ready?.then(place).catch(() => {});
    return () => window.removeEventListener("resize", place);
  }, [value, options]);

  const thumbStyle = tone === "accent"
    ? { backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }
    : { backgroundColor: "var(--bt-surface)", boxShadow: "0 1px 4px var(--bt-shadow)" };

  return (
    <div ref={wrapRef} className={`relative flex rounded-xl p-0.5 gap-0.5 ${className}`}
      style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
      <span ref={thumbRef} aria-hidden="true" className="bt-seg-thumb" style={thumbStyle} />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" data-seg={o.value}
            onClick={() => onChange(o.value)} aria-pressed={active}
            className={`relative z-[1] rounded-[10px] font-semibold transition-colors ${buttonClassName}`}
            style={{
              color: active
                ? (tone === "accent" ? "var(--bt-accent-dark)" : "var(--bt-text-1)")
                : "var(--bt-text-2)",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
