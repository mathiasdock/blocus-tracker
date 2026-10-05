import { Fragment, useRef, useState } from "react";
import Glyph from "../Glyph";
import PlanPopover from "./PlanPopover";

// A list of commands: arrow keys move, Enter/Space run the focused command,
// Escape closes (PlanPopover). Destructive commands sit last, behind a
// separator, in the danger ink — never mixed in among ordinary ones.
//
// item: { key, label, description?, hint?, icon?, onSelect, danger?, disabled?,
//         checked? (on/off command), separated? (rule above), keepOpen? }
export function MenuList({ items, label, onDone, className = "" }) {
  const listRef = useRef(null);
  function onKeyDown(event) {
    const nodes = [...listRef.current.querySelectorAll('[role^="menuitem"]:not([disabled])')];
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement);
    let next = null;
    if (event.key === "ArrowDown") next = nodes[(index + 1) % nodes.length];
    else if (event.key === "ArrowUp") next = nodes[(index - 1 + nodes.length) % nodes.length];
    else if (event.key === "Home") next = nodes[0];
    else if (event.key === "End") next = nodes[nodes.length - 1];
    if (next) { event.preventDefault(); next.focus(); }
  }
  return (
    <div ref={listRef} role="menu" aria-label={label} className={`bt-plan-menu ${className}`} onKeyDown={onKeyDown}>
      {items.filter(Boolean).map(item => (
        <Fragment key={item.key}>
          {item.separated && <div role="separator" className="bt-plan-menu-sep" />}
          <button type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked === undefined ? undefined : !!item.checked}
            disabled={item.disabled}
            data-danger={item.danger ? "1" : undefined}
            className="bt-plan-menu-item"
            onClick={() => { if (!item.keepOpen) onDone?.(); item.onSelect?.(); }}>
            {item.icon && <span className="bt-plan-menu-icon" aria-hidden="true">{item.icon}</span>}
            <span className="bt-plan-menu-text">
              <span>{item.label}</span>
              {item.description && <span className="bt-plan-menu-desc">{item.description}</span>}
            </span>
            {item.hint && <span className="bt-plan-menu-hint">{item.hint}</span>}
            {item.checked !== undefined && !item.hint && (
              <span className="bt-plan-menu-check" aria-hidden="true">
                {item.checked && <Glyph size={16} strokeWidth={2.4}><polyline points="20 6 9 17 4 12" /></Glyph>}
              </span>
            )}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

// Trigger + menu. `ariaLabel` only for an icon trigger: a visible word is
// already its own name.
export default function PlanMenu({ label, items, children, triggerClassName = "", ariaLabel, align = "end", width = 264, disabled = false }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  return (
    <>
      <button ref={anchor} type="button" aria-haspopup="menu" aria-expanded={open}
        aria-label={ariaLabel} disabled={disabled}
        className={triggerClassName} onClick={() => setOpen(value => !value)}>
        {children}
      </button>
      <PlanPopover open={open} anchorRef={anchor} onClose={() => setOpen(false)}
        label={label} role="presentation" align={align} width={width}>
        <MenuList items={items} label={label} onDone={() => setOpen(false)} />
      </PlanPopover>
    </>
  );
}
