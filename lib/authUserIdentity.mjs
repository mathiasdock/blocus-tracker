// Faut-il remplacer l'utilisateur React après un événement Supabase Auth ?
//
// supabase-js émet SIGNED_IN à CHAQUE retour sur l'onglet (session relue du
// stockage local), TOKEN_REFRESHED toutes les heures et INITIAL_SESSION au
// chargement — chaque fois avec un NOUVEL objet user, identique au précédent.
// Remplacer l'objet relançait tout ce qui dépend de `user` dans l'app : chaque
// ouverture faisait 2 à 3 fois chaque requête (audit du 2026-09-26).
//
// On garde donc l'objet existant tant que rien de réel ne change : même
// compte, même e-mail, mêmes métadonnées, même date de mise à jour. Une vraie
// modification (USER_UPDATED, confirmation d'e-mail, autre compte) produit un
// objet différent et se propage normalement.
function sameJson(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

export function sameAuthUser(previous, next) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.id === next.id
    && (previous.email || null) === (next.email || null)
    && (previous.phone || null) === (next.phone || null)
    && (previous.updated_at || null) === (next.updated_at || null)
    && (previous.email_confirmed_at || null) === (next.email_confirmed_at || null)
    && sameJson(previous.user_metadata, next.user_metadata)
    && sameJson(previous.app_metadata, next.app_metadata);
}

// Relire la fiche profil ? Seulement si elle doit l'être : autre compte, vraie
// modification du compte, ou fiche pas encore chargée pour ce compte (un
// échec réseau précédent se répare au prochain événement, comme avant).
export function profileNeedsReload({ event, accountChanged, readyForUserId, userId }) {
  if (!userId) return false;
  if (accountChanged) return true;
  if (event === "USER_UPDATED") return true;
  return readyForUserId !== userId;
}
