import { useEffect, useRef, useState } from "react";
import { COURSE_COLORS } from "../lib/courseColors";
import { useI18n } from "../contexts/I18nContext";

export default function SetupCourseColor({ color, name, onChange, disabled }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className="setup-color" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} type="button" aria-label={t("setup.changeColor").replace("{course}", name)} aria-expanded={open} onClick={() => setOpen(!open)} disabled={disabled}><span className="setup-dot" style={{ background: color }} /></button>
    {open && <div className="setup-colors" role="group" aria-label={t("onboarding.courses.color")}>
      {COURSE_COLORS.map((value, i) => <button key={value} type="button" aria-label={`${t("onboarding.courses.color")} ${i + 1}`} aria-pressed={value === color} onClick={() => { onChange(value); setOpen(false); trigger.current?.focus(); }}><span style={{ background: value }} /></button>)}
    </div>}
  </div>;
}
