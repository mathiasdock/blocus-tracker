// État de consentement partagé par toute l'app.
//
// Le rendu serveur ne peut pas connaître le choix de la personne : on part
// donc de l'état par défaut (tout refusé) et on lit le stockage APRÈS montage.
// Conséquence voulue : pendant l'hydratation, rien d'optionnel ne part.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ALLOW_ALL,
  DENY_ALL,
  defaultConsent,
  readConsent,
  writeConsent,
} from "../lib/consent";

const ConsentContext = createContext(null);

export function ConsentProvider({ children }) {
  const [consent, setConsent] = useState(defaultConsent);
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setHydrated(true);

    // Un autre onglet (ou le panneau de réglages) peut changer la décision.
    function onChange(event) {
      setConsent(event?.detail || readConsent());
    }
    function onStorage(event) {
      if (!event.key || event.key === "bt_consent_v1") setConsent(readConsent());
    }
    window.addEventListener("bt:consent-change", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("bt:consent-change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const save = useCallback((categories, source = "settings") => {
    setConsent(writeConsent(categories, source));
  }, []);

  const acceptAll = useCallback(() => save({ ...ALLOW_ALL }, "banner"), [save]);
  const rejectAll = useCallback(() => save({ ...DENY_ALL }, "banner"), [save]);

  const value = useMemo(() => ({
    consent,
    categories: consent.categories,
    gpc: consent.gpc,
    // Tant que rien n'est décidé, le bandeau doit s'afficher — mais seulement
    // une fois le stockage lu, sinon il clignoterait à chaque chargement pour
    // quelqu'un qui a déjà choisi.
    needsDecision: hydrated && !consent.decidedAt,
    hydrated,
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    save,
    acceptAll,
    rejectAll,
    allows: (category) => category === "necessary" || consent.categories[category] === true,
  }), [consent, hydrated, settingsOpen, save, acceptAll, rejectAll]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used inside <ConsentProvider>");
  return ctx;
}
