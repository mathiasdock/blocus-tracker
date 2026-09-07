// ─────────────────────────────────────────────────────────────────────────
// Versions des documents légaux — SOURCE UNIQUE.
//
// Tout ce qui a besoin d'une version (bandeau de consentement, case CGU à
// l'inscription, enregistrement en base, rappel de mise à jour) lit ICI.
// Ne jamais recopier une version ailleurs : c'est la seule façon de garantir
// qu'un enregistrement de consentement pointe vraiment vers le texte accepté.
//
// COMMENT FAIRE ÉVOLUER UN DOCUMENT
//   • Correction de forme (faute, reformulation sans changement de fond) :
//     ne touche à rien. Personne n'a à ré-accepter quoi que ce soit.
//   • Changement de fond des CGU (nouvelle obligation, nouvelle règle) :
//     incrémente TERMS_VERSION → les comptes existants voient un rappel
//     non bloquant leur demandant de valider la nouvelle version.
//   • Changement de fond de la politique de confidentialité (nouvelle
//     finalité, nouveau destinataire) : incrémente PRIVACY_VERSION → les
//     comptes existants voient le même rappel, en information (l'acceptation
//     d'une politique de confidentialité n'est PAS un consentement RGPD).
//   • Nouvelle catégorie de traceur / nouveau service tiers déposant quoi que
//     ce soit sur l'appareil : incrémente CONSENT_VERSION → le bandeau de
//     consentement réapparaît pour TOUT LE MONDE, l'ancien choix ne pouvant
//     pas valoir pour une catégorie qui n'existait pas.
//
// Format : "AAAA-MM-JJ" (date d'entrée en vigueur de la version).
// ─────────────────────────────────────────────────────────────────────────

export const TERMS_VERSION = "2026-09-07";
export const PRIVACY_VERSION = "2026-09-07";
export const COOKIE_POLICY_VERSION = "2026-09-07";

// Version du MODÈLE de consentement (catégories proposées), distincte de la
// version des textes : seule sa modification force un nouveau choix.
export const CONSENT_VERSION = "2026-09-07";

// Date affichée en haut des documents.
export const LEGAL_EFFECTIVE_DATE = {
  fr: "7 septembre 2026",
  en: "September 7, 2026",
};

// Adresse de contact publiée pour toute question vie privée.
// ⚠️ Adresse personnelle de l'éditeur — voir le TODO dans lib/legal.js.
export const LEGAL_CONTACT_EMAIL = "mathias.dock.management@gmail.com";
