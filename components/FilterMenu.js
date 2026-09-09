import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import { createPortal } from "react-dom";

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
// Deux usages, un seul mécanisme de placement. Par défaut c'est un sélecteur
// de valeur (`options` + `value`). Avec `actions`, c'est un menu de
// commandes — le « … » d'un en-tête de conversation, par exemple. Le portail,
// le repli dans la fenêtre, la fermeture sur Échap / clic dehors / défilement
// sont les mêmes : dupliquer cette logique pour un second menu, c'est
// s'assurer qu'un des deux finira par sortir de l'écran quelque part.
export default function FilterMenu({
  value,
  options = [],     // [{ value, label }] — mode sélecteur
  actions,          // [{ key, label, onSelect, danger }] — mode commandes
  trigger,          // remplace le bouton-valeur (ex. un « … »)
  triggerClassName = "",
  onChange,
  ariaLabel,
  align = "right",  // bord sur lequel le menu s'aligne
  className = "",
}) {
  const isActions = Array.isArray(actions) && actions.length > 0;
  const items = isActions ? actions : options;
  const [open, setOpen] = useState(false);
  // Le menu est rendu dans un PORTAIL, pas dans le flux du bouton : la carte
  // du Chrono est en `overflow-hidden` (son dégradé en dépend), ce qui
  // rognait la liste — on ne voyait que les deux premières durées. Un menu
  // ancré en absolu est à la merci du premier parent qui coupe ; en portail,
  // aucun ancêtre ne peut plus le tronquer.
  const [coords, setCoords] = useState(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => { setMounted(true); }, []);

  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    const onPointer = (e) => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    // Le menu est positionné en coordonnées d'écran : il ne suit pas le
    // défilement. On le referme plutôt que de le laisser flotter au mauvais
    // endroit — c'est le comportement attendu d'un menu natif.
    const onScroll = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Placement en coordonnées d'écran, calculé à l'ouverture. Le menu s'aligne
  // sur un bord du bouton puis est ramené dans la fenêtre : près d'un bord, il
  // sortait de l'écran, et près du bas il passait sous la barre de navigation.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    const el = menuRef.current;
    const margin = 8;
    const w = el ? el.offsetWidth : 160;
    const h = el ? el.offsetHeight : 0;

    let left = align === "right" ? b.right - w : b.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - w - margin);

    // Sous le bouton par défaut ; au-dessus s'il n'y a pas la place.
    let top = b.bottom + 6;
    if (h && top + h > window.innerHeight - margin) {
      const above = b.top - h - 6;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - h - margin);
    }
    setCoords({ top, left });
  }, [open, align, items.length]);

  function pick(v) {
    if (onChange) onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  }

  function run(action) {
    setOpen(false);
    btnRef.current?.focus();
    action.onSelect?.();
  }

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup={isActions ? "menu" : "listbox"}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={isActions ? ariaLabel : (ariaLabel ? `${ariaLabel} : ${current?.label}` : undefined)}
        className={isActions
          ? triggerClassName
          : "bt-filter-btn inline-flex min-h-8 max-w-full items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"}
      >
        {isActions ? trigger : (
          <>
            <span className="truncate">{current?.label}</span>
            <Glyph size={12} className="shrink-0" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>
              <polyline points="6 9 12 15 18 9" />
            </Glyph>
          </>
        )}
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role={isActions ? "menu" : "listbox"}
          aria-label={ariaLabel}
          className="min-w-[9.5rem] overflow-hidden rounded-xl p-1"
          style={{
            position: "fixed",
            top: coords ? coords.top : -9999,
            left: coords ? coords.left : -9999,
            zIndex: 60,
            visibility: coords ? "visible" : "hidden",
            maxHeight: "min(60vh, 24rem)",
            overflowY: "auto",
            backgroundColor: "var(--bt-surface)",
            border: "1px solid var(--bt-hairline)",
            boxShadow: "var(--bt-elev-3)",
          }}
        >
          {!isActions && options.map((o) => {
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
                    <Glyph size={12}>
                      <polyline points="20 6 9 17 4 12" />
                    </Glyph>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
          {isActions && actions.map((a) => (
            <button
              key={a.key || a.label}
              type="button"
              role="menuitem"
              onClick={() => run(a)}
              className="bt-filter-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium"
              style={a.danger ? { color: "var(--bt-danger)" } : undefined}
            >
              {a.icon && <span className="shrink-0">{a.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
