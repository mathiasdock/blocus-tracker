import { useCallback, useId, useRef, useState } from "react";
import useDialogFocus from "../useDialogFocus";
import { useI18n } from "../../contexts/I18nContext";
import { isOfflineDev, supabase } from "../../lib/supabaseClient";
import {
  MODERATION_ACTIONS, REASON_MAX, deletionConfirmed, validateReason,
} from "../../lib/adminModeration.mjs";

// Confirmation des actions admin sur un membre : suspendre, réactiver,
// supprimer, modérer le profil. Chaque action exige un motif (journal
// d'audit, jamais montré au membre) ; la suppression exige en plus de
// retaper le pseudo. Tout passe par les routes serveur
// /api/admin/members/[id]/* — le navigateur n'écrit plus rien lui-même.
//
// kind : "suspend" | "unsuspend" | "delete" | "moderate"
// onDone(result) reçoit la réponse de la route ({ ok, … }) après succès.

const DANGER = {
  color: "var(--bt-danger)",
  backgroundColor: "var(--bt-danger-bg)",
  border: "1px solid var(--bt-danger-border)",
};

async function callMemberRoute(memberId, kind, payload) {
  if (isOfflineDev) {
    // Aperçu hors ligne : aucune route serveur ne tourne. On renvoie la même
    // forme de réponse pour pouvoir vérifier l'écran, sans rien écrire.
    return {
      ok: true,
      data: kind === "moderate" && payload.action === "reset_username"
        ? { ok: true, action: payload.action, pseudo: "user_offline" }
        : { ok: true, authBlocked: true, action: payload.action },
    };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "session" };

  const base = `/api/admin/members/${encodeURIComponent(memberId)}`;
  const request = {
    suspend: { url: `${base}/suspension`, method: "POST", body: { suspend: true, reason: payload.reason } },
    unsuspend: { url: `${base}/suspension`, method: "POST", body: { suspend: false, reason: payload.reason } },
    moderate: { url: `${base}/moderation`, method: "POST", body: { action: payload.action, reason: payload.reason } },
    delete: { url: base, method: "DELETE", body: { reason: payload.reason, confirm: payload.confirm } },
  }[kind];

  try {
    const res = await fetch(request.url, {
      method: request.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(request.body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof json.error === "string" ? json.error : "failed" };
    return { ok: true, data: json };
  } catch (_) {
    return { ok: false, error: "network" };
  }
}

export default function MemberActionDialog({ kind, member, onClose, onDone }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [action, setAction] = useState(MODERATION_ACTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const ids = useId();

  // Une fermeture stable : si elle changeait à chaque rendu, le piège à focus
  // se réinstallerait et renverrait le focus derrière la fenêtre.
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => { if (!busyRef.current) onCloseRef.current(); }, []);
  const dialogRef = useDialogFocus(true, close);
  const setWorking = (value) => { busyRef.current = value; setBusy(value); };

  const pseudo = member?.pseudo || "";
  const destructive = kind === "delete" || kind === "suspend";
  const reasonCheck = validateReason(reason);
  const confirmOk = kind !== "delete" || deletionConfirmed(confirm, pseudo);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!reasonCheck.ok) { setError(t(`adminMod.error.${reasonCheck.error}`)); return; }
    if (!confirmOk) { setError(t("adminMod.error.confirmation_mismatch")); return; }
    setWorking(true);
    setError("");
    const result = await callMemberRoute(member.id, kind, { reason: reasonCheck.reason, confirm, action });
    setWorking(false);
    if (!result.ok) {
      const key = `adminMod.error.${result.error}`;
      const text = t(key);
      setError(text === key ? t("adminMod.error.failed") : text);
      return;
    }
    // Suspendu en base mais connexion pas encore bloquée : on le dit, sans
    // fermer, pour que l'admin sache qu'il peut réessayer.
    if (kind === "suspend" && result.data?.authBlocked === false && !warning) {
      setWarning(t("adminMod.suspendAuthWarning"));
      onDone({ kind, action, ...result.data });
      return;
    }
    onDone({ kind, action, ...result.data });
    onCloseRef.current();
  }

  const title = t(`adminMod.${kind}.title`).replace("{pseudo}", pseudo);
  const consequences = kind === "moderate" ? [] : t(`adminMod.${kind}.consequences`).split("\n").filter(Boolean);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.48)" }} onClick={close}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`} tabIndex={-1}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-[24px] sm:rounded-[22px] p-5 sm:p-6 outline-none"
        style={{ backgroundColor: "var(--bt-surface)", boxShadow: "var(--bt-elev-3)", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}>
        <h2 id={`${ids}-title`} className="text-lg font-semibold" style={{ color: "var(--bt-text-1)", overflowWrap: "anywhere" }}>{title}</h2>

        {consequences.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--bt-text-2)" }}>
            {consequences.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: destructive ? "var(--bt-danger)" : "var(--bt-text-3)" }} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          {kind === "moderate" && (
            <fieldset>
              <legend className="label">{t("adminMod.moderate.pick")}</legend>
              <div className="space-y-2">
                {MODERATION_ACTIONS.map((value) => (
                  <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl p-3"
                    style={{ border: `1px solid ${action === value ? "var(--bt-text-2)" : "var(--bt-border)"}`, backgroundColor: action === value ? "var(--bt-subtle)" : "transparent" }}>
                    <input type="radio" name={`${ids}-action`} value={value} checked={action === value}
                      onChange={() => setAction(value)} className="mt-1" disabled={busy} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{t(`adminMod.moderate.${value}`)}</span>
                      <span className="block text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{t(`adminMod.moderate.${value}Hint`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <label className="label" htmlFor={`${ids}-reason`}>{t("adminMod.reasonLabel")}</label>
            <textarea id={`${ids}-reason`} className="input" rows={3} maxLength={REASON_MAX} value={reason}
              style={{ fontSize: 16 }} disabled={busy}
              onChange={(event) => { setReason(event.target.value); if (error) setError(""); }}
              aria-describedby={`${ids}-reason-hint`} />
            <p id={`${ids}-reason-hint`} className="mt-1 text-xs" style={{ color: "var(--bt-text-2)" }}>{t("adminMod.reasonHint")}</p>
          </div>

          {kind === "delete" && (
            <div>
              {/* Pas de .label ici : ses majuscules déformeraient le pseudo à retaper. */}
              <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--bt-text-2)", overflowWrap: "anywhere" }} htmlFor={`${ids}-confirm`}>
                {t("adminMod.delete.confirmLabel").split("{pseudo}").map((part, index) => (
                  index === 0 ? part : <span key={index}><strong style={{ color: "var(--bt-text-1)" }}>{pseudo}</strong>{part}</span>
                ))}
              </label>
              <input id={`${ids}-confirm`} className="input" value={confirm} autoComplete="off" autoCapitalize="none"
                spellCheck="false" style={{ fontSize: 16 }} disabled={busy}
                onChange={(event) => { setConfirm(event.target.value); if (error) setError(""); }} />
            </div>
          )}

          {warning && <p className="text-sm rounded-xl px-3 py-2" role="status" style={{ ...DANGER }}>{warning}</p>}
          {error && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button type="button" className="btn-ghost flex-1 min-h-[44px]" onClick={close} disabled={busy}>
              {warning ? t("common.close") : t("common.cancel")}
            </button>
            {!warning && (
              <button type="submit" className={destructive ? "btn flex-1 min-h-[44px]" : "btn-primary flex-1 min-h-[44px]"}
                style={destructive ? DANGER : undefined}
                disabled={busy} aria-busy={busy}>
                {busy ? t("adminMod.working") : t(`adminMod.${kind}.confirm`)}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
