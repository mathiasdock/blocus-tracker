import { useEffect, useRef, useState } from "react";
import UniPicker from "./UniPicker";
import { supabase } from "../lib/supabaseClient";
import { validateExchange } from "../lib/exchange.mjs";

export default function ProfileExchange({ profile, onClose, onSaved, t }) {
  const [host, setHost] = useState(profile?.exchange_university || "");
  const [start, setStart] = useState(profile?.exchange_start_date || "");
  const [end, setEnd] = useState(profile?.exchange_end_date || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = event => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save(event) {
    event.preventDefault();
    const problem = validateExchange({ home: profile?.university, host, start, end });
    if (problem) { setError(t(`profile.exchangeInvalid.${problem}`)); return; }
    setBusy(true); setError("");
    const { error: saveError } = await supabase.rpc("save_my_exchange", {
      p_university: host.trim(), p_start: start, p_end: end,
    });
    setBusy(false);
    if (saveError) { setError(t("profile.exchangeSaveError")); return; }
    await onSaved();
    onClose();
  }

  async function clearExchange() {
    if (!window.confirm(t("profile.exchangeRemoveConfirm"))) return;
    setBusy(true); setError("");
    const { error: saveError } = await supabase.rpc("save_my_exchange", {
      p_university: null, p_start: null, p_end: null,
    });
    setBusy(false);
    if (saveError) { setError(t("profile.exchangeSaveError")); return; }
    await onSaved();
    onClose();
  }

  return <>
    <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.48)" }} onClick={busy ? undefined : onClose} />
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={busy ? undefined : onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="profile-exchange-title"
        className="w-full rounded-t-[28px] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 sm:mx-4 sm:max-w-lg sm:rounded-[24px] sm:p-6"
        style={{ background: "var(--bt-surface)", color: "var(--bt-text-1)", maxHeight: "92dvh", overflowY: "auto" }}
        onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="profile-exchange-title" className="text-lg font-bold">{t("profile.exchangeTitle")}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--bt-text-2)" }}>{t("profile.exchangeIntro")}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy}
            className="bt-tap shrink-0 text-sm font-semibold" aria-label={t("common.close")}>{t("common.close")}</button>
        </div>

        <form onSubmit={save} className="mt-5 space-y-4">
          <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>
            {t("profile.exchangeHome").replace("{university}", profile?.university || "—")}
          </p>
          <div>
            <label htmlFor="exchange-university" className="label">{t("profile.exchangeHost")}</label>
            <UniPicker id="exchange-university" value={host} onChange={setHost}
              disabled={busy} placeholder={t("profile.choose")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="exchange-start" className="label">{t("profile.exchangeStart")}</label>
              <input id="exchange-start" type="date" className="input" value={start} onChange={event => setStart(event.target.value)} disabled={busy} /></div>
            <div><label htmlFor="exchange-end" className="label">{t("profile.exchangeEnd")}</label>
              <input id="exchange-end" type="date" className="input" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} disabled={busy} /></div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("profile.exchangeDateHint")}</p>

          <p className="border-t pt-4 text-sm leading-relaxed" style={{ borderColor: "var(--bt-border)", color: "var(--bt-text-2)" }}>
            {t("profile.exchangeCourseRule")}
          </p>

          {error && <p role="alert" className="text-sm" style={{ color: "var(--bt-danger)" }}>{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {profile?.exchange_university && <button type="button" onClick={clearExchange} disabled={busy}
              className="bt-tap text-sm underline underline-offset-2">{t("profile.exchangeRemove")}</button>}
            <button type="submit" disabled={busy} className="btn-primary ml-auto min-h-11 px-5">
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </section>
    </div>
  </>;
}
