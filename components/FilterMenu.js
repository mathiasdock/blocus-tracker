import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Contrôle de filtre compact : un bouton qui affiche la valeur courante, et
// un menu qui ne s'ouvre qu'à la demande.
//
// Remplace les rangées d'onglets segmentés. Cinq périodes en onglets, c'est
// cinq boutons permanents dont quatre sont inactifs : ils occupent une ligne
// entière par section et, sur téléphone, poussent le contenu sous la ligne de
// flottaison. Ici la place occupée est celle d'un seul libellé — et le libellé
// affiché EST la réponse à « je regarde quoi ? ».
//
// Le menu se ferme sur Échap, au clic dehors et après un choix ; le focus
// revient au bouton, sinon on se retrouve en haut du document après chaque
// changement de filtre.
export default function FilterMenu({
  value,
  options,          // [{ value, label }]
  onChange,
  ariaLabel,
  align = "right",  // bord sur lequel le menu s'aligne
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    const onPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  // Recadrage dans la fenêtre. Le menu s'aligne sur un bord du bouton, mais un
  // bouton près du bord de l'écran projetait le menu en dehors : sur un
  // téléphone, le premier filtre d'une rangée voyait sa colonne de coches
  // coupée. On mesure la position réelle et on décale d'autant — écrit
  // directement sur le nœud plutôt qu'en state, sinon le re-rendu remesurerait
  // la position DÉJÀ décalée et le menu oscillerait.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!open || !el) return;
    el.style.transform = "none";
    const r = el.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    if (r.left < margin) dx = margin - r.left;
    else if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
    el.style.transform = dx ? `translateX(${dx}px)` : "none";
  }, [open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  }

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel ? `${ariaLabel} : ${current?.label}` : undefined}
        className="bt-filter-btn inline-flex min-h-8 max-w-full items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
      >
        <span className="truncate">{current?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className="shrink-0" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-full z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl p-1 ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            backgroundColor: "var(--bt-surface)",
            border: "1px solid var(--bt-border)",
            boxShadow: "0 12px 32px var(--bt-shadow)",
          }}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(o.value)}
                className="bt-filter-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium"
                style={active ? { color: "var(--bt-accent-text)" } : undefined}
              >
                <span className="w-3 shrink-0">
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
