// Rappel de mise à jour des documents légaux — pour les comptes existants.
//
// POURQUOI IL N'EST PAS BLOQUANT
// Bloquer l'accès à son propre espace d'étude tant qu'on n'a pas cliqué sur un
// bouton est une forme de contrainte : un accord arraché de cette façon n'est
// pas librement donné. Et une politique de confidentialité, de toute façon,
// ne « se consent » pas — elle s'informe. Le rappel est donc une carte qu'on
// peut refermer ; elle revient à la prochaine session tant que la nouvelle
// version des CGU n'a pas été validée, et disparaît définitivement ensuite.
//
// Rien ne s'affiche si la table user_privacy_settings n'existe pas encore
// (migration v44 non exécutée) : on n'invente pas un rappel qu'on serait
// incapable d'enregistrer.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { loadPrivacySettings, recordLegalAcceptance } from "../lib/privacySettings";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legalVersions";

const SNOOZE_KEY = "bt_legal_notice_snoozed";

export default function LegalUpdateNotice() {
  const { user, profileStatus } = useAuth();
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || profileStatus !== "ready") { setShow(false); return undefined; }
    // Refermé pendant cette session : on ne le repropose pas maintenant.
    try {
      if (sessionStorage.getItem(SNOOZE_KEY) === "1") return undefined;
    } catch (_) {}

    let cancelled = false;
    (async () => {
      const { settings, unavailable } = await loadPrivacySettings(supabase, user.id);
      if (cancelled || unavailable) return;
      // Pas de ligne du tout = compte antérieur au backfill : on demande aussi.
      const upToDate = settings?.terms_version === TERMS_VERSION;
      setShow(!upToDate);
    })();
    return () => { cancelled = true; };
  }, [user, profileStatus]);

  const accept = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const { ok } = await recordLegalAcceptance(supabase, user.id, {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    });
    setBusy(false);
    if (ok) setShow(false);
    // Un échec réseau laisse la carte : mieux vaut la revoir que croire à tort
    // que l'acceptation est enregistrée.
  }, [user]);

  function snooze() {
    try { sessionStorage.setItem(SNOOZE_KEY, "1"); } catch (_) {}
    setShow(false);
  }

  if (!show) return null;

  return (
    // Remonte au-dessus de la barre de navigation mobile : ce rappel peut
    // revenir plusieurs sessions de suite, il ne doit pas condamner un onglet.
    <div className="fixed inset-x-0 bottom-0 z-[2800] px-3 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-2 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div
        className="mx-auto w-full max-w-xl rounded-2xl p-4"
        style={{
          backgroundColor: "var(--bt-surface)",
          border: "1px solid var(--bt-border)",
          boxShadow: "0 14px 44px rgba(31,26,23,0.18)",
        }}
        role="region"
        aria-label={t("legalUpdate.title")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("legalUpdate.title")}</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("legalUpdate.body")}{" "}
              <Link href="/legal?doc=terms" className="bt-accent-link font-medium underline underline-offset-2">
                {t("legalUpdate.readTerms")}
              </Link>
              {" · "}
              <Link href="/legal?doc=privacy" className="bt-accent-link font-medium underline underline-offset-2">
                {t("legalUpdate.readPrivacy")}
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={snooze}
            aria-label={t("common.close")}
            className="bt-tap flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bt-subtle)]"
            style={{ color: "var(--bt-text-3)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="btn-primary mt-3 min-h-11 w-full"
          onClick={accept}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "…" : t("legalUpdate.accept")}
        </button>
      </div>
    </div>
  );
}
