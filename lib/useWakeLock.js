import { useEffect, useRef } from "react";

/**
 * Maintient l'écran allumé tant que `active` est vrai (Screen Wake Lock API).
 *
 * Pensé pour le chrono : quand une session tourne, l'écran ne doit pas se
 * mettre en veille / se verrouiller. Sinon, sur un téléphone posé sur le bureau,
 * l'iPhone éteint l'écran après ~30 s (les contrôles du mode focus se masquent
 * exprès après 4,5 s → plus aucune interaction) et toute la respiration ambiante
 * du mode focus disparaît. C'est le comportement attendu d'un vrai timer d'étude.
 *
 * Robuste par conception :
 *  - No-op silencieux si l'API n'existe pas (Safari < 16.4, contexte non sécurisé).
 *  - Le navigateur relâche seul le verrou quand l'onglet passe en arrière-plan ;
 *    on le ré-acquiert automatiquement au retour au premier plan (visibilitychange)
 *    tant que `active` reste vrai.
 *  - Ne throw jamais : toute erreur (non supporté / bloqué / onglet caché) est
 *    avalée, comme le durcissement fait sur initOneSignal.
 */
export function useWakeLock(active) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      // Rien à faire si un verrou vivant existe déjà, ou si l'onglet est caché
      // (la requête échouerait alors avec NotAllowedError).
      if (cancelled || sentinelRef.current || document.visibilityState !== "visible") return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) { sentinel.release().catch(() => {}); return; }
        sentinelRef.current = sentinel;
        // Le navigateur peut relâcher le verrou de lui-même (onglet caché,
        // batterie faible) : on nettoie la ref pour pouvoir le reprendre au
        // prochain retour au premier plan.
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Non supporté / bloqué / onglet caché : abandon silencieux.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const s = sentinelRef.current;
      sentinelRef.current = null;
      if (s) s.release().catch(() => {});
    };
  }, [active]);
}
