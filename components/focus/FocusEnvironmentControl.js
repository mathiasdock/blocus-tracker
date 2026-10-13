import { useEffect, useRef, useState } from "react";
import Glyph from "../Glyph";
import { useI18n } from "../../contexts/I18nContext";
import FocusEnvironmentGallery from "./FocusEnvironmentGallery";
import styles from "./FocusEnvironments.module.css";

export default function FocusEnvironmentControl({ preferences, visible, onOpenChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector("[data-gallery] button")?.focus();
    function onPointer(event) { if (!root.current?.contains(event.target)) setOpen(false); }
    function onKey(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  return <div ref={root} className={styles.control} style={{ opacity: visible || open ? 1 : 0, pointerEvents: visible || open ? "auto" : "none" }}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={t("focusEnv.title")}
      aria-expanded={open} aria-controls="focus-environment-gallery" onClick={() => {
        if (!open) preferences.refresh();
        setOpen(value => !value);
      }}>
      <Glyph size={18}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Glyph>
    </button>
    {open && <section data-gallery id="focus-environment-gallery" className={styles.panel} aria-label={t("focusEnv.title")}>
      <div className={styles.panelHeader}><h2>{t("focusEnv.title")}</h2>
        <button type="button" onClick={close} aria-label={t("common.close")}><Glyph size={16}><path d="m6 6 12 12M6 18 18 6"/></Glyph></button>
      </div>
      <FocusEnvironmentGallery preferences={preferences} inFocus onSelected={close} />
    </section>}
  </div>;
}
