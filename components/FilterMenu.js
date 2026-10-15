import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import { createPortal } from "react-dom";

// Le placement se mesure avant la peinture dans le navigateur. Au rendu
// serveur (le Chrono de /pomodoro), le menu est fermé : rien à mesurer, et
// useLayoutEffect y déclenchait un avertissement de React.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  // Classes ajoutées au bouton-valeur. Sert à étendre la cible tactile
  // (`bt-tap-44`) là où le contrôle doit rester visuellement compact.
  buttonClassName = "",
  onChange,
  ariaLabel,
  align = "right",  // bord sur lequel le menu s'aligne
  className = "",
  // Classe ajoutée au menu lui-même. Il est rendu en portail, hors de la
  // surface qui l'ouvre : c'est le seul moyen pour elle d'en régler le focus
  // sans restyler tous les menus de l'app.
  menuClassName = "",
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
  const [activeKey, setActiveKey] = useState(null);
  const pendingFocus = useRef(null);
  const previousValue = useRef(value);
  const search = useRef({ text: "", time: 0 });
  const pageScroll = useRef(null);
  const keyOf = item => isActions ? (item.key || item.label) : item.value;

  useEffect(() => { setMounted(true); }, []);

  const current = options.find((o) => o.value === value) || options[0];

  function close(restore = false) {
    setOpen(false);
    if (restore) btnRef.current?.focus({ preventScroll: true });
  }

  function show(edge = "selected") {
    pendingFocus.current = edge;
    previousValue.current = value;
    search.current = { text: "", time: 0 };
    pageScroll.current = { x: window.scrollX, y: window.scrollY };
    setCoords(null);
    setOpen(true);
  }

  function focusItem(index) {
    const menu = menuRef.current;
    const node = menu?.querySelectorAll('[role="option"], [role="menuitem"]')[index];
    if (!node) { menu?.focus({ preventScroll: true }); return; }
    node.focus({ preventScroll: true });
    // Scroll only this menu, never an ancestor/page (which would close it).
    const bounds = menu.getBoundingClientRect(), item = node.getBoundingClientRect();
    if (item.top < bounds.top + 4) menu.scrollTop -= bounds.top + 4 - item.top;
    else if (item.bottom > bounds.bottom - 4) menu.scrollTop += item.bottom - bounds.bottom + 4;
  }

  useEffect(() => {
    if (!open) return undefined;
    const inside = target => wrapRef.current?.contains(target) || menuRef.current?.contains(target);
    const onPointer = (e) => {
      if (!inside(e.target)) setOpen(false);
    };
    // Le menu est positionné en coordonnées d'écran : il ne suit pas le
    // défilement. On le referme plutôt que de le laisser flotter au mauvais
    // endroit — c'est le comportement attendu d'un menu natif.
    const onScroll = e => {
      if (e.target !== window && menuRef.current?.contains(e.target)) return;
      // A scroll queued before the opening click may arrive afterwards.
      if (e.type === "scroll" && e.target === document && window.scrollX === pageScroll.current.x && window.scrollY === pageScroll.current.y) return;
      close(menuRef.current?.contains(document.activeElement));
    };
    const onFocus = e => { if (!inside(e.target)) setOpen(false); };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Placement en coordonnées d'écran, calculé à l'ouverture. Le menu s'aligne
  // sur un bord du bouton puis est ramené dans la fenêtre : près d'un bord, il
  // sortait de l'écran, et près du bas il passait sous la barre de navigation.
  useBrowserLayoutEffect(() => {
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

  // Run after placement, also reconciling external value/options updates.
  // Keep an existing focused item by identity when the list is reordered.
  useBrowserLayoutEffect(() => {
    if (!open || !mounted || !coords) return;
    const selected = isActions ? -1 : items.findIndex(item => item.value === value);
    const edge = pendingFocus.current;
    const changed = previousValue.current !== value;
    pendingFocus.current = null;
    previousValue.current = value;
    if (edge || changed || !menuRef.current?.contains(document.activeElement) || (items.length && document.activeElement === menuRef.current)) {
      const retained = items.findIndex(item => keyOf(item) === activeKey);
      const index = edge === "last" ? items.length - 1
        : edge === "first" ? 0
        : selected >= 0 && (edge || changed) ? selected
        : !edge && retained >= 0 ? retained : Math.max(0, selected);
      focusItem(index);
    }
  });

  function onTriggerKeyDown(event) {
    if (event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); event.stopPropagation();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      if (!open) show(isActions ? (event.key === "ArrowUp" ? "last" : "first") : "selected");
      else focusItem(event.key === "ArrowUp" ? items.length - 1 : 0);
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); close(true);
    }
  }

  function onMenuKeyDown(event) {
    const nodes = [...menuRef.current.querySelectorAll('[role="option"], [role="menuitem"]')];
    const index = nodes.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : index < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1)
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      focusItem(next);
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (event.key === "Tab") {
      // A body portal is last in DOM order. Rebase native Tab traversal on
      // its trigger, then let the browser leave the widget in either direction.
      event.stopPropagation(); close(true);
    } else if (event.key === "Enter" || event.key === " ") {
      // Native button activation is the only path to onChange/onSelect.
      event.stopPropagation();
      if (event.repeat) event.preventDefault();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); event.stopPropagation();
      const letter = event.key.toLocaleLowerCase();
      const text = event.timeStamp - search.current.time < 500 ? search.current.text + letter : letter;
      search.current = { text, time: event.timeStamp };
      const prefix = [...text].every(char => char === letter) ? letter : text;
      const match = items.findIndex((_, offset) => String(items[(index + 1 + offset) % items.length].label).trim().toLocaleLowerCase().startsWith(prefix));
      if (match >= 0) focusItem((index + 1 + match) % items.length);
    }
  }

  function pick(v) {
    if (onChange) onChange(v);
    close(true);
  }

  function run(action) {
    close(true);
    action.onSelect?.();
  }

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={btnRef}
        id={`${menuId}-trigger`}
        type="button"
        onClick={() => open ? close() : show()}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup={isActions ? "menu" : "listbox"}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={isActions ? ariaLabel : (ariaLabel ? `${ariaLabel} : ${current?.label}` : undefined)}
        className={isActions
          ? triggerClassName
          : `bt-filter-btn inline-flex min-h-8 max-w-full items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${buttonClassName}`}
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
          aria-labelledby={ariaLabel ? undefined : `${menuId}-trigger`}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={`min-w-[9.5rem] overflow-hidden rounded-xl p-1 ${menuClassName}`}
          style={{
            position: "fixed",
            top: coords ? coords.top : -9999,
            left: coords ? coords.left : -9999,
            zIndex: 60,
            visibility: coords ? "visible" : "hidden",
            maxHeight: "min(60vh, 24rem)",
            overflowY: "auto",
            overscrollBehavior: "contain",
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
                tabIndex={activeKey === o.value ? 0 : -1}
                onFocus={() => setActiveKey(o.value)}
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
              tabIndex={activeKey === keyOf(a) ? 0 : -1}
              onFocus={() => setActiveKey(keyOf(a))}
              onClick={() => run(a)}
              className="bt-filter-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium"
              style={a.danger ? { color: "var(--bt-danger)" } : undefined}
            >
              {a.icon && <span className="shrink-0">{a.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
            </button>
          ))}
        </div>,
        btnRef.current?.closest("dialog[open]") || document.body
      )}
    </div>
  );
}
