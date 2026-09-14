// Un motif d'échec d'activation des notifications → une phrase.
//
// Partagé par l'invitation du tableau de bord et la rangée du profil. Chacun
// avait sa version : le profil nommait la cause, l'invitation se contentait
// d'un « l'activation n'a pas abouti » — la personne qui échouait au meilleur
// moment, juste après l'inscription, était précisément celle qui n'apprenait
// pas pourquoi.
export function pushErrorMessage(t, reason, origin) {
  switch (reason) {
    case "unconfigured": return t("push.unconfigured");
    case "preparing": return t("push.preparing");
    case "slow": return t("push.slow");
    case "unsupported": return t("push.unsupported");
    case "blocked": return t("push.blocked");
    case "timeout": return t("push.timeout");
    case "origin": return t("push.origin").replace("{url}", origin || "");
    case "no-subscription": return t("push.noSubscription");
    case "denied": return t("push.denied");
    case "error": return t("push.error");
    default: return "";
  }
}
