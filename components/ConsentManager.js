// Bandeau de consentement + panneau « Préférences de confidentialité ».
//
// RÈGLES DE CONCEPTION, ET POURQUOI
//   • « Tout refuser » a exactement le même poids visuel que « Tout accepter ».
//     Un refus rendu plus discret que l'acceptation vicie le consentement :
//     c'est le dark pattern le plus sanctionné en Europe.
//   • Aucune catégorie optionnelle n'est pré-cochée. Le consentement doit être
//     un acte, pas une absence de réaction.
//   • Le bandeau ne bloque pas la page et ne se réaffiche pas en boucle : on
//     peut le refermer, ce qui vaut refus jusqu'au prochain passage.
//   • Le panneau reste accessible à vie depuis le pied de page et le profil :
//     un consentement doit être aussi facile à retirer qu'à donner.
//
// CE QUE LE BANDEAU NE FAIT PAS : il ne bloque rien de « strictement
// nécessaire ». Session, chrono, thème, langue et cache hors-ligne continuent
// de fonctionner quel que soit le choix — les refuser casserait le service
// demandé sans protéger personne.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useConsent } from "../contexts/ConsentContext";
import { useI18n } from "../contexts/I18nContext";
import { CONSENT_CATEGORIES, DENY_ALL } from "../lib/consent";

const CATEGORY_KEYS = {
  functional: { label: "consent.cat.functional", desc: "consent.cat.functionalDesc" },
  analytics: { label: "consent.cat.analytics", desc: "consent.cat.analyticsDesc" },
  marketing: { label: "consent.cat.marketing", desc: "consent.cat.marketingDesc" },
};

function Switch({ checked, disabled, onChange, label, describedBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors bt-press disabled:opacity-45"
      style={{ backgroundColor: checked ? "var(--bt-accent)" : "var(--bt-border)" }}
    >
      <span
        className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }}
      />
    </button>
  );
}

function CategoryRow({ id, title, description, checked, locked, lockedLabel, onChange }) {
  const descId = `${id}-desc`;
  return (
    <div className="flex items-start gap-3 py-3.5" style={{ borderTop: "1px solid var(--bt-hairline)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{title}</p>
        <p id={descId} className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{description}</p>
      </div>
      {locked ? (
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", border: "1px solid var(--bt-accent-border)" }}
        >
          {lockedLabel}
        </span>
      ) : (
        <Switch checked={checked} onChange={onChange} label={title} describedBy={descId} />
      )}
    </div>
  );
}

/** Le corps réutilisé par le bandeau (mode « personnaliser ») et par le panneau. */
function CategoryList({ draft, setDraft, gpc, t }) {
  const baseId = useId();
  return (
    <div>
      <CategoryRow
        id={`${baseId}-necessary`}
        title={t("consent.cat.necessary")}
        description={t("consent.cat.necessaryDesc")}
        locked
        lockedLabel={t("consent.alwaysOn")}
      />
      {CONSENT_CATEGORIES.map((key) => {
        // Un GPC actif est une demande explicite du navigateur : on l'affiche
        // comme telle plutôt que de laisser croire que l'interrupteur est libre.
        const forcedOff = gpc && (key === "analytics" || key === "marketing");
        return (
          <CategoryRow
            key={key}
            id={`${baseId}-${key}`}
            title={t(CATEGORY_KEYS[key].label)}
            description={`${t(CATEGORY_KEYS[key].desc)}${forcedOff ? ` ${t("consent.gpcForced")}` : ""}`}
            checked={forcedOff ? false : draft[key]}
            locked={false}
            onChange={(next) => setDraft((current) => ({ ...current, [key]: forcedOff ? false : next }))}
          />
        );
      })}
    </div>
  );
}

export function ConsentSettingsPanel({ open, onClose }) {
  const { categories, gpc, save } = useConsent();
  const { t } = useI18n();
  const [draft, setDraft] = useState(categories);
  const dialogRef = useRef(null);

  useEffect(() => { if (open) setDraft(categories); }, [open, categories]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function apply(next, source = "settings") {
    save(next, source);
    onClose();
  }

  return (
    <div
      className="bt-course-editor-scrim fixed inset-0 z-[3000] flex items-end justify-center sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-settings-title"
        className="bt-course-editor-panel flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[24px] focus:outline-none sm:max-w-lg sm:rounded-2xl"
        style={{ backgroundColor: "var(--bt-surface)", boxShadow: "0 18px 60px rgba(31,26,23,0.22)" }}
      >
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-9 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id="consent-settings-title" className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
              {t("consent.settingsTitle")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("consent.settingsIntro")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="bt-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[var(--bt-subtle)]"
            style={{ color: "var(--bt-text-2)" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
          {gpc && (
            <div className="mb-1 mt-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", border: "1px solid var(--bt-accent-border)" }}>
              {t("consent.gpcNotice")}
            </div>
          )}
          <CategoryList draft={draft} setDraft={setDraft} gpc={gpc} t={t} />
          <p className="py-3 text-xs leading-relaxed" style={{ borderTop: "1px solid var(--bt-hairline)", color: "var(--bt-text-3)" }}>
            {t("consent.noSaleNotice")}{" "}
            <Link href="/legal?doc=cookies" className="bt-accent-link font-medium underline underline-offset-2" onClick={onClose}>
              {t("consent.cookiePolicyLink")}
            </Link>
          </p>
        </div>

        <div className="shrink-0 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5"
          style={{ borderTop: "1px solid var(--bt-hairline)" }}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-neutral flex-1 min-h-11" onClick={() => apply({ ...DENY_ALL })}>
              {t("consent.rejectAll")}
            </button>
            <button type="button" className="btn-primary flex-1 min-h-11" onClick={() => apply(draft)}>
              {t("consent.saveChoices")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConsentManager() {
  const { needsDecision, gpc, acceptAll, rejectAll, save, settingsOpen, closeSettings } = useConsent();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(DENY_ALL);

  useEffect(() => { if (needsDecision) setDraft({ ...DENY_ALL }); }, [needsDecision]);

  return (
    <>
      {needsDecision && (
        <div
          className="fixed inset-x-0 bottom-0 z-[2900] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-banner-title"
        >
          <div
            className="mx-auto w-full max-w-2xl rounded-2xl p-4 sm:p-5"
            style={{
              backgroundColor: "var(--bt-surface)",
              border: "1px solid var(--bt-hairline)",
              boxShadow: "0 14px 44px rgba(31,26,23,0.18)",
            }}
          >
            <h2 id="consent-banner-title" className="text-base font-bold" style={{ color: "var(--bt-text-1)" }}>
              {t("consent.bannerTitle")}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("consent.bannerBody")}{" "}
              <Link href="/legal?doc=cookies" className="bt-accent-link font-medium underline underline-offset-2">
                {t("consent.cookiePolicyLink")}
              </Link>
            </p>

            {expanded && (
              <div className="mt-2">
                {gpc && (
                  <div className="mb-1 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
                    style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", border: "1px solid var(--bt-accent-border)" }}>
                    {t("consent.gpcNotice")}
                  </div>
                )}
                <CategoryList draft={draft} setDraft={setDraft} gpc={gpc} t={t} />
              </div>
            )}

            {/* Même taille, même hauteur, même poids visuel : refuser doit être
                aussi immédiat qu'accepter (voir .btn-neutral dans globals.css). */}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn-neutral min-h-11 w-full" onClick={rejectAll}>
                {t("consent.rejectAll")}
              </button>
              <button type="button" className="btn-primary min-h-11 w-full" onClick={acceptAll}>
                {t("consent.acceptAll")}
              </button>
            </div>
            <div className="mt-2 flex justify-center">
              {expanded ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center px-3 text-sm font-semibold underline underline-offset-2"
                  style={{ color: "var(--bt-text-2)" }}
                  onClick={() => save(draft, "banner")}
                >
                  {t("consent.saveChoices")}
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center px-3 text-sm font-semibold underline underline-offset-2"
                  style={{ color: "var(--bt-text-2)" }}
                  onClick={() => setExpanded(true)}
                  aria-expanded={expanded}
                >
                  {t("consent.customize")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Un seul panneau pour toute l'app : le pied de page et le profil
          appellent `openSettings()` du contexte, ils n'en montent pas d'autre. */}
      <ConsentSettingsPanel open={settingsOpen} onClose={closeSettings} />
    </>
  );
}
