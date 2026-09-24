// Briques partagées des pages admin : sections, surfaces, états, icônes.
// Aucune donnée ici — seulement la façon de l'écrire, identique partout.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Glyph from "../Glyph";
import useDialogFocus from "../useDialogFocus";
import { useI18n } from "../../contexts/I18nContext";
import { formatDate } from "../../lib/adminFormat.mjs";
import s from "./admin.module.css";

export { s as adminStyles };

// « 1 signalement » / « 3 signalements » : deux clés, .one et .other.
export function plural(t, base, n) {
  return t(`${base}.${n === 1 ? "one" : "other"}`).replace("{n}", String(n));
}

export function errorText(t, code) {
  const key = `adm.error.${code || "failed"}`;
  const text = t(key);
  return text === key ? t("adm.error.failed") : text;
}

// Chargement d'une lecture : { data, error, loading, reload }. Une réponse
// arrivée après un nouvel appel (filtre changé entre-temps) est ignorée.
export function useAdminLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const result = await load();
    if (mine !== seq.current) return;
    setState({ data: result?.data ?? null, error: result?.error || null, loading: false });
  }, [load]);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload, setData: (updater) => setState((prev) => ({ ...prev, data: typeof updater === "function" ? updater(prev.data) : updater })) };
}

export function Section({ id, title, aside, note, children }) {
  return (
    <section id={id} className={s.section} aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || aside) && (
        <div className={s.sectionHead}>
          {title && <h2 id={id ? `${id}-title` : undefined} className={s.h2}>{title}</h2>}
          {aside}
        </div>
      )}
      {note && <p className={s.note} style={{ marginTop: -4, marginBottom: 10 }}>{note}</p>}
      {children}
    </section>
  );
}

export function Panel({ pad = false, children, className = "", ...rest }) {
  return <div className={`${s.panel} ${pad ? s.panelPad : ""} ${className}`} {...rest}>{children}</div>;
}

const TONES = {
  ok: [s.dotOk, s.stateOk],
  danger: [s.dotDanger, s.stateDanger],
  warn: [s.dotWarn, s.stateWarn],
  quiet: [s.dotQuiet, ""],
  neutral: ["", ""],
};

export function StateMark({ tone = "neutral", children }) {
  const [dot, text] = TONES[tone] || TONES.neutral;
  return (
    <span className={`${s.state} ${text}`}>
      <span aria-hidden="true" className={`${s.dot} ${dot}`} />
      {children}
    </span>
  );
}

export function ErrorLine({ code, onRetry }) {
  const { t } = useI18n();
  return (
    <div className={s.errorLine} role="alert">
      <span>{errorText(t, code)}</span>
      {onRetry && <button type="button" className={s.linkBtn} onClick={onRetry}>{t("adm.common.retry")}</button>}
    </div>
  );
}

export function EmptyLine({ children }) {
  return <p className={s.message}>{children}</p>;
}

export function SkeletonRows({ rows = 4 }) {
  const { t } = useI18n();
  return (
    <ul className={s.rows} aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className={s.row}>
          <div className={s.rowMain}>
            <div className={s.skeleton} style={{ width: `${48 + ((index * 17) % 36)}%` }} />
            <div className={s.skeleton} style={{ width: `${26 + ((index * 11) % 20)}%`, marginTop: 8, height: 10 }} />
          </div>
          <div className={s.skeleton} style={{ width: 48 }} />
        </li>
      ))}
    </ul>
  );
}

// « Mis à jour à 14:02 » + bouton de rechargement.
export function Freshness({ at, busy, onRefresh }) {
  const { t, lang } = useI18n();
  return (
    <span className={s.headAside}>
      {at && <span>{t("adm.common.updatedAt").replace("{time}", formatDate(at, lang, "time"))}</span>}
      {onRefresh && (
        <button type="button" className={s.iconBtn} onClick={onRefresh} disabled={busy}
          aria-label={t("adm.common.refresh")} title={t("adm.common.refresh")}>
          <RefreshIcon className={busy ? s.spin : ""} />
        </button>
      )}
    </span>
  );
}

export function Pager({ offset, limit, total, onPage }) {
  const { t, lang } = useI18n();
  if (!total) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  const nf = new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-BE");
  return (
    <div className={s.pager}>
      <span>{t("adm.common.range").replace("{from}", nf.format(from)).replace("{to}", nf.format(to)).replace("{total}", nf.format(total))}</span>
      <span className="flex items-center gap-1">
        <button type="button" className={s.iconBtn} disabled={offset === 0} onClick={() => onPage(-1)} aria-label={t("adm.common.previous")}>
          <ChevronIcon direction="left" />
        </button>
        <button type="button" className={s.iconBtn} disabled={to >= total} onClick={() => onPage(1)} aria-label={t("adm.common.next")}>
          <ChevronIcon direction="right" />
        </button>
      </span>
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={s.switch} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className={s.switchKnob} />
    </button>
  );
}

// Confirmation d'un geste qui ne se rattrape pas (retirer, supprimer,
// envoyer). Le bouton d'action dit le verbe ; Échap et le fond annulent.
export function ConfirmDialog({ title, children, confirmLabel, danger = false, busy = false, error = null, onConfirm, onClose }) {
  const { t } = useI18n();
  const ids = useId();
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => { if (!busyRef.current) onCloseRef.current(); }, []);
  const dialogRef = useDialogFocus(true, close);
  return (
    <div className={s.dialogScrim} onClick={close}>
      <div ref={dialogRef} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`}
        tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <h2 id={`${ids}-title`} className="text-lg font-semibold" style={{ color: "var(--bt-text-1)", overflowWrap: "anywhere" }}>{title}</h2>
        <div className="mt-2 text-sm" style={{ color: "var(--bt-text-2)", lineHeight: 1.5 }}>{children}</div>
        {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{error}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
          <button type="button" className="btn-ghost flex-1 min-h-[44px]" onClick={close} disabled={busy}>{t("common.cancel")}</button>
          <button type="button" className={danger ? `btn flex-1 min-h-[44px] ${s.danger}` : "btn-primary flex-1 min-h-[44px]"}
            onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? t("adm.common.working") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Icônes (Glyph : trait et couleur partagés) ───────────────────── */
export function ChevronIcon({ direction = "right", size = 18 }) {
  const d = { right: "M9 6l6 6-6 6", left: "M15 6l-6 6 6 6", down: "M6 9l6 6 6-6", up: "M6 15l6-6 6 6" }[direction];
  return <Glyph size={size}><path d={d} /></Glyph>;
}
export function RefreshIcon({ size = 18, className = "" }) {
  return (
    <Glyph size={size} className={className}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
    </Glyph>
  );
}
export function SearchIcon({ size = 18 }) {
  return <Glyph size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Glyph>;
}
export function CloseIcon({ size = 20 }) {
  return <Glyph size={size}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></Glyph>;
}
export function DownloadIcon({ size = 18 }) {
  return <Glyph size={size}><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Glyph>;
}
export function BellIcon({ size = 16 }) {
  return (
    <Glyph size={size}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Glyph>
  );
}
