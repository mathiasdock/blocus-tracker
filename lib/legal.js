// ─────────────────────────────────────────────────────────────────────────
// Contenu legal du site (bilingue FR + EN).
//
// Rendu par pages/legal.js. Les libelles d'interface (titres d'onglets, etc.)
// vivent dans lib/i18n.js ; ICI on ne met que le contenu long-forme des
// documents, dans les deux langues.
//
// ═══════════════════════════════════════════════════════════════════════
//  REGLE ABSOLUE : CE TEXTE DECRIT LE CODE, PAS UNE INTENTION.
//
//  Chaque affirmation ci-dessous a ete verifiee dans le depot au 7 septembre
//  2026. Si tu changes le comportement de l'app, ce fichier change AVEC —
//  sinon la politique devient un mensonge, ce qui est bien pire que de ne
//  rien avoir ecrit. Points a re-verifier a chaque modification :
//    • un nouveau service tiers  → section « Qui recoit tes donnees »
//    • un nouveau stockage local → onglet Cookies
//    • une nouvelle donnee       → section « Les donnees que nous traitons »
//    • une nouvelle notification → section « Notifications »
//    • un changement de fond     → incremente la version dans legalVersions.js
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️  TODO — DECISIONS QUI N'APPARTIENNENT PAS AU CODE (a trancher par Mathias)
//   1. ADRESSE DE CONTACT. LEGAL_CONTACT_EMAIL est aujourd'hui une adresse
//      Gmail personnelle. Publiee sur un site, elle est aspiree par les robots
//      de spam et lie ton identite civile au service. Une adresse dediee
//      (privacy@blocus-tracker.com) serait plus propre — et obligatoire si tu
//      cree une structure juridique.
//   2. STATUT DE L'EDITEUR. Ce texte suppose un PROJET PERSONNEL d'une
//      personne physique (etudiant), sans societe. Si tu crees une asbl ou une
//      entreprise : ajouter denomination, numero d'entreprise (BCE), adresse
//      du siege et, le cas echeant, numero de TVA dans les Mentions legales.
//      Le droit belge impose une adresse geographique de contact ; elle est
//      volontairement ABSENTE ici, car je ne peux pas inventer la tienne.
//   3. REGIONS D'HEBERGEMENT. Supabase : VERIFIE le 07/09/2026 — projet
//      xtpsavwwhkeiwfkidwcu, region eu-north-1 (Stockholm), donc dans l'UE.
//      C'est desormais ecrit tel quel dans la section 6. Reste a verifier :
//      la region de deploiement Vercel (Settings → Functions). Si elle est
//      aussi europeenne, le chapitre transferts peut encore se simplifier.
//   4. AGE MINIMUM : 16 ans. TRANCHE par Mathias le 07/09/2026, ce n'est plus
//      une question ouverte. Raison : on vise toute l'UE, ou l'age du
//      consentement numerique (RGPD art. 8) va de 13 a 16 ans selon le pays.
//      Le seuil belge de 13 ans ne gouverne PAS un utilisateur allemand ou
//      neerlandais. Sans autorisation parentale ni determination fiable du
//      pays, on retient le seuil le plus protecteur. Ne redescends a 13 que
//      si tu construis un vrai systeme de consentement parental, pays par
//      pays — pas avant.
//   5. TRANSFERTS HORS UE. La section 6 ne PRETEND RIEN : elle decrit les
//      mecanismes possibles (clauses contractuelles types, DPA, Data Privacy
//      Framework) et dit explicitement qu'on ne peut pas attester lequel est
//      en vigueur. Ne remplace ce paragraphe par une affirmation ferme que
//      lorsque tu auras verifie, prestataire par prestataire, ce qui
//      s'applique reellement a TON compte. Tant que ce n'est pas fait, le
//      texte actuel est le seul qui soit vrai.
//   6. RELECTURE. Ce contenu est une base serieuse et honnete fondee sur les
//      pratiques reelles de l'app, mais n'est PAS un avis juridique.
// ─────────────────────────────────────────────────────────────────────────

import {
  COOKIE_POLICY_VERSION,
  LEGAL_CONTACT_EMAIL as CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE as EFFECTIVE_DATE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "./legalVersions";

// Re-exportes pour ne pas casser les imports existants (pages/legal.js).
export const LEGAL_CONTACT_EMAIL = CONTACT_EMAIL;
export const LEGAL_EFFECTIVE_DATE = EFFECTIVE_DATE;
export { COOKIE_POLICY_VERSION, PRIVACY_VERSION, TERMS_VERSION };

// Chaque section : { h: titre, body: [ paragraphe | { list: [...] } ] }
export const LEGAL_DOCS = [
  // ───────────────────────── CONFIDENTIALITE ─────────────────────────
  {
    id: "privacy",
    fr: {
      title: "Politique de confidentialité",
      sections: [
        {
          h: "En bref",
          body: [
            "Blocus Tracker n'affiche aucune publicité, n'installe aucun outil de mesure d'audience et ne vend ni ne partage tes données à des fins publicitaires. Nous collectons ce que l'app doit connaître pour fonctionner : ton compte, ton activité d'étude, et ce que tu publies volontairement.",
            "Ce texte décrit ce que le code fait réellement. S'il te semble contredit par le comportement de l'app, écris-nous : c'est un bug, pas une nuance.",
          ],
        },
        {
          h: "1. Qui est responsable de tes données",
          body: [
            "Blocus Tracker est un projet personnel créé et géré par Mathias Dock, étudiant à l'ICHEC Brussels Management School (Belgique). C'est lui le responsable du traitement au sens du RGPD.",
            `Pour toute question relative à tes données : ${CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "2. Les données que nous traitons",
          body: [
            "Ce que tu nous donnes directement :",
            { list: [
              "Compte : pseudo, adresse email, prénom, établissement. Le NOM est facultatif — tu peux créer un compte sans, et le retirer à tout moment depuis ton profil en vidant le champ. Le domaine et l'année d'études, la bio et la photo de profil sont également facultatifs.",
              "Mot de passe : géré par Supabase Auth, stocké sous forme hachée — une empreinte non réversible, pas le mot de passe lui-même. Nous n'y avons jamais accès.",
              "Activité d'étude : sessions chronométrées (cours, durée, notes, horodatage), matières, objectifs, planning, examens, périodes de blocus, checklists de révision.",
              "Contenu social : publications du feed (photos et légendes), commentaires, réactions, messages privés, messages de groupe et de communauté, pièces jointes, relations d'amitié.",
              "Avis envoyés depuis la page « Améliorer l'app ».",
            ]},
            "Ce que l'app produit ou déduit :",
            { list: [
              "Progression : expérience (XP), niveaux, badges, séries, missions quotidiennes, gels de série, parrainages.",
              "Deux compteurs agrégés : le nombre total de publications que tu as faites et de réactions que tu as données. Sans date ni contenu — ils servent uniquement aux badges, dont la progression survit à la suppression quotidienne des publications.",
              "Statut « en train d'étudier » (présence), visible par tes amis pendant que ton chrono tourne.",
              "Fuseau horaire de ton appareil, pour que tes statistiques journalières soient calculées à ton heure.",
              "Préférences : thème, langue, sons et vibrations, réglages de confidentialité.",
            ]},
            "Ce que nos serveurs voient techniquement :",
            { list: [
              "Adresse IP : utilisée en mémoire vive pour limiter les tentatives de connexion et les abus. Elle n'est pas stockée en base de données et n'est associée à aucun compte.",
              "Jetons de session, conservés dans ton navigateur pour te garder connecté.",
              "Si tu actives les notifications : un identifiant d'appareil créé par OneSignal, associé à ton identifiant Blocus Tracker.",
              "Journaux techniques de notre hébergeur (Vercel) et de Supabase, produits automatiquement à chaque requête et conservés par eux pour une durée limitée.",
            ]},
          ],
        },
        {
          h: "3. Ce que les autres membres voient de toi",
          body: [
            "C'est le point le plus concret pour toi, donc il mérite d'être dit franchement. Une fois connecté, tout autre membre peut voir : ton pseudo, ton prénom, ton nom si tu en as renseigné un, ton établissement, ton domaine et ton année d'études, ta bio, ta photo de profil, ton niveau, tes badges, ton temps d'étude et ton classement.",
            "C'est précisément pour cette raison que le nom est facultatif : il n'est utile à personne ici, et le pseudo suffit à te reconnaître. Tes compteurs de publications et de réactions, eux, ne sont visibles que par toi.",
            "Ton adresse email n'est JAMAIS montrée aux autres membres, ni renvoyée par nos serveurs à leur navigateur. Elle est protégée au niveau de la base de données elle-même, et non seulement masquée à l'affichage.",
            "Tes notes de session, ton planning (sauf si tu le rends public), tes messages privés et tes réglages de confidentialité ne sont visibles que par toi — et, pour un message privé, par la personne à qui tu écris.",
          ],
        },
        {
          h: "4. Pourquoi nous les traitons, et sur quelle base",
          body: [
            { list: [
              "Fournir le service — compte, chrono, statistiques, planning, fonctions sociales. Base légale : exécution du contrat que forment les conditions d'utilisation acceptées à l'inscription (RGPD art. 6.1.b).",
              "Emails liés au compte — confirmation d'adresse, réinitialisation du mot de passe. Base légale : exécution du contrat.",
              "Sécurité et prévention des abus — limitation du nombre de tentatives de connexion, modération. Base légale : intérêt légitime à protéger le service et ses membres (art. 6.1.f).",
              "Rappels d'étude par notification — examen du lendemain, série en danger, relance douce. Base légale : ton consentement, donné en activant les notifications, révocable en un geste depuis ton profil.",
              "Annonces sur l'app par notification — nouveautés, informations de service. Base légale : ton consentement aux notifications, avec un refus séparé disponible dans tes préférences de confidentialité.",
              "Chargement de services tiers sur ton appareil (OneSignal) — base légale : ton consentement, donné dans le bandeau de confidentialité ou en activant les notifications.",
            ]},
            "Nous n'utilisons pas tes données pour du profilage publicitaire, et aucune décision automatisée n'a d'effet juridique sur toi.",
          ],
        },
        {
          h: "5. Qui reçoit tes données",
          body: [
            "Nous ne vendons pas tes données et ne les partageons pas à des fins publicitaires. Pour faire fonctionner l'app, nous nous appuyons sur des prestataires techniques (sous-traitants) qui traitent des données pour notre compte, selon nos instructions :",
            { list: [
              "Supabase — base de données, authentification, stockage des fichiers (photos de profil, photos du feed, pièces jointes) et temps réel. Reçoit l'ensemble des données de ton compte.",
              "Vercel — hébergement de l'application. Reçoit ton adresse IP et les métadonnées techniques de chaque requête (page demandée, navigateur), comme tout hébergeur web.",
              "Resend — envoi des emails de confirmation et de réinitialisation, via Supabase. Reçoit ton adresse email et le contenu de ces messages.",
              "OneSignal — notifications push. Reçoit un identifiant d'appareil, ton identifiant Blocus Tracker et le contenu des notifications, uniquement si tu actives les notifications.",
            ]},
            "Une précision honnête sur OneSignal : notre application installable (PWA) télécharge un fichier technique depuis les serveurs de OneSignal au moment où elle s'installe sur ton appareil, y compris si tu n'actives jamais les notifications. OneSignal voit alors ton adresse IP et ton navigateur. Aucun identifiant n'est créé et aucun abonnement n'existe tant que tu n'as pas activé les notifications toi-même.",
            "Nous ne transmettons tes données à personne d'autre, sauf si la loi nous y oblige (réquisition judiciaire) ou pour faire valoir nos droits en cas d'abus grave.",
          ],
        },
        {
          h: "6. Transferts hors de l'Union européenne",
          body: [
            "Une bonne nouvelle d'abord, et elle est vérifiée : la base de données qui contient ton compte, tes sessions d'étude et tes messages est hébergée dans l'Union européenne, en région de Stockholm. Tes données ne traversent donc pas l'Atlantique pour être stockées.",
            "Cela ne supprime pas tout transfert pour autant. Supabase, Vercel, Resend et OneSignal sont des sociétés américaines : leurs équipes peuvent techniquement accéder à l'infrastructure qu'elles opèrent, et selon la configuration de chaque service certaines données — journaux techniques, adresses email envoyées, identifiants de notification — peuvent être traitées aux États-Unis.",
            "Le RGPD n'interdit pas ces transferts, mais exige qu'ils soient encadrés. Les mécanismes prévus sont les clauses contractuelles types de la Commission européenne — généralement intégrées à l'accord de sous-traitance (DPA) que chaque prestataire publie — et, pour les entreprises qui y adhèrent, le cadre de protection des données UE–États-Unis (Data Privacy Framework).",
            "Nous préférons être exacts plutôt que rassurants : cette page ne peut pas attester quel mécanisme est effectivement en vigueur pour chacun de ces prestataires à la date où tu la lis, parce que cela dépend des conditions contractuelles propres à chaque service et de la manière dont notre compte y est configuré. Si tu veux le savoir pour un prestataire précis, écris-nous : nous te répondrons avec la situation réelle, pas avec une formule toute faite.",
            "Concrètement, ces entreprises peuvent être soumises à des demandes d'accès des autorités américaines. Si c'est un point important pour toi, tu peux n'utiliser que le chrono et les statistiques, sans publier de contenu ni activer les notifications.",
          ],
        },
        {
          h: "7. Combien de temps nous les conservons",
          body: [
            { list: [
              "Compte et données associées (profil, sessions, planning, progression, messages) : tant que ton compte existe. Tout est supprimé quand tu supprimes ton compte.",
              "Publications du feed : une publication cesse d'être visible 24 heures après sa mise en ligne. Elle est ensuite supprimée pour de bon — photo, légende, ligne en base, et avec elle ses commentaires et réactions. Il n'en reste aucune trace rattachée à toi.",
              "Quand exactement : la suppression est effectuée par un nettoyage automatique programmé une fois par jour. En fonctionnement normal, une publication est donc supprimée au plus tard dans les 48 heures suivant sa mise en ligne. Nous écrivons « en fonctionnement normal » parce qu'un passage automatique peut échouer (panne, incident chez notre hébergeur) : dans ce cas la suppression a lieu au passage suivant, et la publication reste invisible entre-temps.",
              "Statistiques agrégées : deux compteurs par compte — combien de publications tu as faites en tout, et combien de réactions tu as données. Sans date, sans contenu, sans lien vers une publication précise. Ils existent uniquement pour que tes badges (« première publication », « influenceur », « moteur du groupe ») ne se remettent pas à zéro chaque nuit avec la suppression de tes publications. Ils sont conservés tant que ton compte existe et disparaissent avec lui.",
              "Journal de suppression : quand un compte est supprimé, nous ne conservons qu'une ligne anonyme — date, origine (volontaire ou administrative), ancienneté du compte en mois. Aucun nom, aucun pseudo, aucun identifiant.",
              "Adresse IP : en mémoire vive uniquement, le temps d'une fenêtre de quelques minutes de limitation d'abus. Jamais écrite en base.",
              "Journaux techniques de Vercel et Supabase : conservés par ces prestataires selon leurs propres durées, de l'ordre de quelques jours à quelques semaines.",
              "Préférences de confidentialité et trace d'acceptation des conditions : tant que ton compte existe, car c'est ce qui prouve ce que tu as accepté et refusé.",
            ]},
          ],
        },
        {
          h: "8. Supprimer ton compte",
          body: [
            "Depuis ton profil, section « Confidentialité », le bouton « Supprimer mon compte » efface immédiatement et définitivement : ton compte de connexion, ton profil, tes cours, tes sessions, tes objectifs, ton planning, tes examens, tes publications, commentaires et réactions, tes messages privés, de groupe et de communauté, tes amitiés, ton XP, tes badges, tes parrainages, tes préférences — ainsi que tous les fichiers que tu as envoyés (photo de profil, photos du feed, pièces jointes).",
            "Il n'y a ni corbeille, ni délai de grâce, ni compte « désactivé » qu'on garderait au cas où. C'est irréversible.",
            "Une nuance à connaître : les messages que tu as envoyés à quelqu'un d'autre disparaissent aussi de la conversation de cette personne. En revanche, ce que d'autres ont écrit à ton sujet dans leurs propres messages leur appartient et n'est pas effacé.",
          ],
        },
        {
          h: "9. Tes droits",
          body: [
            "Conformément au RGPD, tu disposes des droits suivants — et l'app est faite pour que tu puisses les exercer toi-même, sans nous écrire :",
            { list: [
              "Accès : « Exporter mes données » dans ton profil télécharge un fichier avec tout ce que l'app contient sur toi.",
              "Rectification : la plupart de tes informations sont modifiables directement dans ton profil.",
              "Effacement : « Supprimer mon compte » dans ton profil, section Confidentialité.",
              "Portabilité : l'export est au format JSON, lisible par un humain comme par une machine.",
              "Opposition et limitation : écris-nous, nous traiterons ta demande.",
              "Retrait du consentement : « Préférences de confidentialité », depuis ton profil ou le pied de page. Retirer un consentement n'a aucun effet rétroactif sur ce qui a déjà été fait, mais arrête effectivement ce qui suit.",
            ]},
            `Pour un droit qui n'est pas disponible directement dans l'app, écris à ${CONTACT_EMAIL}. Nous répondons dans un délai d'un mois.`,
            "Tu peux aussi introduire une réclamation auprès de l'Autorité de protection des données (APD/GBA, Belgique — www.autoriteprotectiondonnees.be), ou de l'autorité de ton pays de résidence.",
          ],
        },
        {
          h: "10. Résidents des États-Unis",
          body: [
            "D'abord une précision d'honnêteté. Les lois américaines de protection de la vie privée, comme le CCPA/CPRA californien, ne s'appliquent qu'aux entreprises qui franchissent certains seuils — chiffre d'affaires annuel, nombre de résidents concernés, ou revenus tirés de la vente de données. Blocus Tracker est un projet étudiant gratuit, sans publicité et sans revenus : rien n'indique qu'il atteigne ces seuils, et nous ne prétendons donc pas être formellement soumis à ces lois.",
            "Cela ne change rien à ce que tu peux faire. Quel que soit l'endroit d'où tu nous lis, et sans avoir à démontrer qu'une loi s'applique à toi, nous t'offrons volontairement les mêmes droits qu'à tout le monde : savoir quelles catégories d'informations sont collectées et pourquoi, en obtenir une copie, les corriger, les supprimer, et ne subir aucune conséquence négative si tu les exerces. Ils s'exercent avec les outils décrits plus haut, directement dans l'app.",
            "Si une de ces lois venait à s'appliquer à nous, ou si tu résides dans un État qui t'accorde des droits supplémentaires, ces droits légaux s'ajoutent à ce que nous offrons ici — ils ne sont en aucun cas remplacés par cette page.",
            "Nous ne vendons pas tes informations personnelles et ne les partageons pas pour de la publicité ciblée intersites (« cross-context behavioral advertising ») au sens de la loi californienne. Aucun outil publicitaire ni aucun réseau de mesure n'est installé dans l'app — c'est vérifiable dans le fonctionnement décrit à l'onglet Cookies. Il n'y a donc pas de lien « Do Not Sell or Share » à part : il n'y aurait rien à désactiver.",
            "Nous respectons néanmoins le signal Global Privacy Control (GPC), partout et pour tout le monde, sans regarder d'où tu viens : si ton navigateur l'envoie, les catégories « mesure d'audience » et « publicité » restent refusées, définitivement et sans que tu aies quoi que ce soit à faire.",
            "Nous ne collectons pas de catégories d'informations dites sensibles au sens de la loi californienne (origine, santé, orientation, données biométriques, géolocalisation précise).",
          ],
        },
        {
          h: "11. Sécurité",
          body: [
            "L'accès aux données est contrôlé par la base de données elle-même (règles de sécurité par ligne), et non seulement par l'interface : une requête qui n'a pas le droit de lire une donnée ne la reçoit pas, même en contournant l'app.",
            "Les clés d'administration serveur ne sont jamais exposées au navigateur. Les adresses email sont interdites de lecture au niveau des colonnes. Les échanges sont chiffrés (HTTPS), et l'app applique une politique de sécurité du contenu qui limite strictement les domaines externes autorisés.",
            "Aucun système n'étant infaillible, choisis un mot de passe que tu n'utilises nulle part ailleurs.",
          ],
        },
        {
          h: "12. Mineurs",
          body: [
            "Il faut avoir 16 ans ou plus pour utiliser Blocus Tracker. Le service n'est pas destiné aux enfants et nous ne collectons pas sciemment de données concernant une personne de moins de 16 ans.",
            "Pourquoi 16 et pas moins. Le RGPD laisse chaque pays de l'Union fixer l'âge à partir duquel un mineur peut consentir seul à un service en ligne : il varie de 13 à 16 ans selon l'État membre. La Belgique retient 13 ans, mais ce seuil belge ne s'applique PAS automatiquement à quelqu'un qui nous lit depuis l'Allemagne, les Pays-Bas ou la France, où le seuil est plus élevé. Nous n'avons ni système d'autorisation parentale, ni moyen fiable de déterminer le pays de résidence de chacun : nous retenons donc le seuil le plus protecteur, celui qui reste valable partout dans l'Union.",
            "Nous ne demandons pas de justificatif d'âge et ne mettons en place aucune vérification d'identité : cela exigerait de collecter bien plus de données que ce que nous cherchons à protéger. Cette limite d'âge repose donc sur ta déclaration.",
            `Si tu es parent ou tuteur et que tu constates qu'un mineur plus jeune a créé un compte, écris à ${CONTACT_EMAIL} : le compte et ses données seront supprimés.`,
          ],
        },
        {
          h: "13. Modifications",
          body: [
            `Cette politique peut évoluer. Sa version actuelle est la ${PRIVACY_VERSION} et la date de dernière mise à jour figure en haut de cette page.`,
            "En cas de changement important — nouvelle finalité, nouveau destinataire, nouvelle catégorie de données — un rappel s'affiche dans l'app. Un simple ajout de traceur ne peut de toute façon pas s'activer sans repasser par le bandeau de consentement.",
          ],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      sections: [
        {
          h: "In short",
          body: [
            "Blocus Tracker shows no ads, installs no analytics tool, and neither sells nor shares your data for advertising. We collect what the app needs to work: your account, your study activity, and what you choose to post.",
            "This text describes what the code actually does. If the app seems to contradict it, write to us: that is a bug, not a nuance.",
          ],
        },
        {
          h: "1. Who is responsible for your data",
          body: [
            "Blocus Tracker is a personal project created and run by Mathias Dock, a student at ICHEC Brussels Management School (Belgium). He is the data controller under the GDPR.",
            `For any question about your data: ${CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "2. The data we process",
          body: [
            "What you give us directly:",
            { list: [
              "Account: username, email address, first name, institution. Your LAST NAME is optional — you can create an account without one, and remove it at any time from your profile by clearing the field. Field and year of study, bio and profile picture are optional too.",
              "Password: handled by Supabase Auth and stored hashed — a one-way fingerprint, not the password itself. We never have access to it.",
              "Study activity: timed sessions (course, duration, notes, timestamps), subjects, goals, planning, exams, study periods, revision checklists.",
              "Social content: feed posts (photos and captions), comments, reactions, private messages, group and community messages, attachments, friendships.",
              "Feedback sent from the \"Improve the app\" page.",
            ]},
            "What the app produces or derives:",
            { list: [
              "Progress: experience (XP), levels, badges, streaks, daily missions, streak freezes, referrals.",
              "Two aggregate counters: how many posts you have made in total and how many reactions you have given. No dates, no content — they exist only for badges, whose progress must survive the daily deletion of posts.",
              "\"Currently studying\" presence, visible to your friends while your timer runs.",
              "Your device time zone, so daily statistics are computed in your own time.",
              "Preferences: theme, language, sound and haptics, privacy settings.",
            ]},
            "What our servers see technically:",
            { list: [
              "IP address: used in memory only, to rate-limit sign-in attempts and abuse. It is not stored in the database and is not linked to any account.",
              "Session tokens, kept in your browser to keep you signed in.",
              "If you enable notifications: a device identifier created by OneSignal, linked to your Blocus Tracker identifier.",
              "Technical logs from our host (Vercel) and from Supabase, produced automatically on each request and retained by them for a limited period.",
            ]},
          ],
        },
        {
          h: "3. What other members can see about you",
          body: [
            "This is the most concrete point for you, so it deserves a straight answer. Once signed in, any other member can see: your username, your first name, your last name if you gave one, your institution, your field and year of study, your bio, your profile picture, your level, your badges, your study time and your ranking.",
            "That is exactly why the last name is optional: it is of no use to anyone here, and your username is enough to recognise you. Your post and reaction counters, on the other hand, are visible only to you.",
            "Your email address is NEVER shown to other members, nor returned by our servers to their browser. It is protected at the database level itself, not merely hidden in the interface.",
            "Your session notes, your planning (unless you make it public), your private messages and your privacy settings are visible only to you — and, for a private message, to the person you write to.",
          ],
        },
        {
          h: "4. Why we process it, and on what basis",
          body: [
            { list: [
              "Providing the service — account, timer, statistics, planning, social features. Legal basis: performance of the contract formed by the terms you accept when signing up (GDPR art. 6.1.b).",
              "Account emails — address confirmation, password reset. Legal basis: performance of the contract.",
              "Security and abuse prevention — rate limiting of sign-in attempts, moderation. Legal basis: legitimate interest in protecting the service and its members (art. 6.1.f).",
              "Study reminders by notification — exam tomorrow, streak at risk, gentle nudge. Legal basis: your consent, given by enabling notifications, withdrawable in one tap from your profile.",
              "App announcements by notification — news, service information. Legal basis: your consent to notifications, with a separate opt-out available in your privacy preferences.",
              "Loading third-party services on your device (OneSignal) — legal basis: your consent, given in the privacy banner or by enabling notifications.",
            ]},
            "We do not use your data for advertising profiling, and no automated decision produces legal effects concerning you.",
          ],
        },
        {
          h: "5. Who receives your data",
          body: [
            "We do not sell your data and do not share it for advertising. To run the app, we rely on technical providers (processors) that process data on our behalf, on our instructions:",
            { list: [
              "Supabase — database, authentication, file storage (profile pictures, feed photos, attachments) and realtime. Receives all of your account data.",
              "Vercel — application hosting. Receives your IP address and the technical metadata of each request (page requested, browser), like any web host.",
              "Resend — sending confirmation and reset emails, via Supabase. Receives your email address and the content of those messages.",
              "OneSignal — push notifications. Receives a device identifier, your Blocus Tracker identifier and the content of notifications, only if you enable notifications.",
            ]},
            "One honest detail about OneSignal: our installable app (PWA) downloads a technical file from OneSignal's servers when it installs on your device, including if you never enable notifications. OneSignal then sees your IP address and your browser. No identifier is created and no subscription exists until you enable notifications yourself.",
            "We pass your data to no one else, except where the law requires it (judicial order) or to defend our rights in case of serious abuse.",
          ],
        },
        {
          h: "6. Transfers outside the European Union",
          body: [
            "Good news first, and it is verified: the database holding your account, your study sessions and your messages is hosted in the European Union, in the Stockholm region. Your data does not cross the Atlantic to be stored.",
            "That does not remove every transfer, though. Supabase, Vercel, Resend and OneSignal are US companies: their teams can technically access the infrastructure they operate, and depending on how each service is configured some data — technical logs, emails sent, notification identifiers — may be processed in the United States.",
            "The GDPR does not forbid these transfers, but requires them to be framed. The available mechanisms are the European Commission's standard contractual clauses — usually built into the data processing agreement (DPA) each provider publishes — and, for companies that join it, the EU–US Data Privacy Framework.",
            "We would rather be accurate than reassuring: this page cannot certify which mechanism is actually in force for each of these providers on the day you read it, because that depends on each service's own contractual terms and on how our account there is configured. If you want to know for a specific provider, write to us: we will answer with the real situation, not with boilerplate.",
            "In practice, those companies may be subject to access requests from US authorities. If that matters to you, you can use only the timer and statistics, without posting content or enabling notifications.",
          ],
        },
        {
          h: "7. How long we keep it",
          body: [
            { list: [
              "Account and associated data (profile, sessions, planning, progress, messages): as long as your account exists. Everything is deleted when you delete your account.",
              "Feed posts: a post stops being visible 24 hours after it goes up. It is then deleted for good — photo, caption, database row, and with it its comments and reactions. Nothing tied to you remains.",
              "When exactly: deletion is carried out by an automatic cleanup scheduled once a day. Under normal operation a post is therefore deleted at the latest within 48 hours of going up. We write \"under normal operation\" because a scheduled run can fail (an outage, an incident at our host): deletion then happens on the next run, and the post stays invisible in the meantime.",
              "Aggregate statistics: two counters per account — how many posts you have made in total, and how many reactions you have given. No dates, no content, no link to any particular post. They exist only so your badges (\"first post\", \"influencer\", \"motivator\") do not reset every night as your posts are deleted. They are kept as long as your account exists and disappear with it.",
              "Deletion log: when an account is deleted, we keep only an anonymous line — date, origin (self-requested or administrative), account age in months. No name, no username, no identifier.",
              "IP address: in memory only, for a rate-limiting window of a few minutes. Never written to the database.",
              "Technical logs from Vercel and Supabase: retained by those providers under their own schedules, in the order of days to weeks.",
              "Privacy preferences and the record of terms acceptance: as long as your account exists, because that is what evidences what you accepted and refused.",
            ]},
          ],
        },
        {
          h: "8. Deleting your account",
          body: [
            "From your profile, \"Privacy\" section, the \"Delete my account\" button immediately and permanently erases: your sign-in account, your profile, your courses, your sessions, your goals, your planning, your exams, your posts, comments and reactions, your private, group and community messages, your friendships, your XP, your badges, your referrals, your preferences — and every file you uploaded (profile picture, feed photos, attachments).",
            "There is no bin, no grace period, and no \"deactivated\" account kept just in case. It is irreversible.",
            "One nuance worth knowing: messages you sent to someone else also disappear from that person's conversation. What others wrote about you in their own messages, however, belongs to them and is not erased.",
          ],
        },
        {
          h: "9. Your rights",
          body: [
            "Under the GDPR you have the following rights — and the app is built so you can exercise them yourself, without writing to us:",
            { list: [
              "Access: \"Export my data\" in your profile downloads a file with everything the app holds about you.",
              "Rectification: most of your information is editable directly in your profile.",
              "Erasure: \"Delete my account\" in your profile, Privacy section.",
              "Portability: the export is JSON, readable by a human and by a machine.",
              "Objection and restriction: write to us and we will handle your request.",
              "Withdrawal of consent: \"Privacy preferences\", from your profile or the footer. Withdrawing consent does not undo what was already done, but it does effectively stop what follows.",
            ]},
            `For a right not available directly in the app, email ${CONTACT_EMAIL}. We reply within one month.`,
            "You may also lodge a complaint with the Belgian Data Protection Authority (APD/GBA — www.dataprotectionauthority.be), or with the authority of your country of residence.",
          ],
        },
        {
          h: "10. United States residents",
          body: [
            "First, a point of honesty. US privacy laws such as California's CCPA/CPRA only apply to businesses that cross certain thresholds — annual revenue, number of residents whose data is processed, or revenue derived from selling data. Blocus Tracker is a free student project with no advertising and no revenue: nothing suggests it meets those thresholds, so we do not claim to be formally subject to those laws.",
            "That changes nothing about what you can do. Wherever you are reading this from, and without having to show that a particular law applies to you, we voluntarily give you the same rights as everyone else: to know what categories of information are collected and why, to obtain a copy, to correct them, to delete them, and to face no negative consequence for exercising them. They are exercised with the tools described above, directly in the app.",
            "If one of those laws did come to apply to us, or if you live in a state that grants you additional rights, those legal rights are added to what we offer here — this page never replaces them.",
            "We do not sell your personal information and do not share it for cross-context behavioral advertising within the meaning of California law. No advertising tool and no measurement network is installed in the app — which the Cookies tab lets you verify. There is therefore no separate \"Do Not Sell or Share\" link: there would be nothing to switch off.",
            "We nonetheless honour the Global Privacy Control (GPC) signal, everywhere and for everyone, without checking where you come from: if your browser sends it, the \"analytics\" and \"advertising\" categories stay refused, permanently and with nothing for you to do.",
            "We do not collect categories of information deemed sensitive under California law (origin, health, orientation, biometrics, precise geolocation).",
          ],
        },
        {
          h: "11. Security",
          body: [
            "Access to data is enforced by the database itself (row-level security), not only by the interface: a query that has no right to read a piece of data does not receive it, even bypassing the app.",
            "Server admin keys are never exposed to the browser. Email addresses are barred from being read at the column level. Traffic is encrypted (HTTPS), and the app enforces a content security policy that strictly limits the external domains allowed.",
            "No system is perfect, so choose a password you use nowhere else.",
          ],
        },
        {
          h: "12. Minors",
          body: [
            "You must be 16 or over to use Blocus Tracker. The service is not directed to children and we do not knowingly collect data about anyone under 16.",
            "Why 16 and not lower. The GDPR lets each EU country set the age at which a minor can consent on their own to an online service: it ranges from 13 to 16 depending on the Member State. Belgium sets it at 13, but that Belgian threshold does NOT automatically apply to someone reading this from Germany, the Netherlands or France, where the age is higher. We have neither a parental-authorisation system nor a reliable way to determine everyone's country of residence, so we apply the most protective threshold — the one that holds everywhere in the Union.",
            "We do not ask for proof of age and we run no identity verification: that would mean collecting far more data than we are trying to protect. This age limit therefore rests on your own declaration.",
            `If you are a parent or guardian and find that a younger minor has created an account, email ${CONTACT_EMAIL}: the account and its data will be deleted.`,
          ],
        },
        {
          h: "13. Changes",
          body: [
            `This policy may change. Its current version is ${PRIVACY_VERSION} and the last-updated date is shown at the top of this page.`,
            "For a significant change — a new purpose, a new recipient, a new category of data — a reminder appears in the app. Adding a tracker cannot activate without going through the consent banner again anyway.",
          ],
        },
      ],
    },
  },

  // ───────────────────────── CGU / TERMS ─────────────────────────
  {
    id: "terms",
    fr: {
      title: "Conditions générales d'utilisation",
      sections: [
        {
          h: "1. Objet et acceptation",
          body: [
            "Blocus Tracker est une application gratuite d'aide à l'étude : chrono, statistiques, planning et fonctions sociales entre étudiants. Elle est éditée par Mathias Dock (voir Mentions légales).",
            `En cochant la case prévue à l'inscription, tu acceptes les présentes conditions dans leur version ${TERMS_VERSION}. Si tu n'es pas d'accord, ne crée pas de compte.`,
          ],
        },
        {
          h: "2. Qui peut utiliser le service",
          body: [
            "Il faut avoir 16 ans ou plus. Ce seuil vaut dans toute l'Union européenne : l'âge du consentement numérique varie de 13 à 16 ans selon les pays, et nous retenons le plus protecteur faute d'un système d'autorisation parentale. Le service s'adresse aux étudiants, mais rien n'empêche quelqu'un d'autre de l'utiliser pour s'organiser.",
            "Un compte correspond à une seule personne. Tu ne peux pas créer de compte pour quelqu'un d'autre, ni au nom d'un établissement.",
          ],
        },
        {
          h: "3. Ton compte",
          body: [
            "Tu t'engages à fournir des informations exactes et à garder ton mot de passe confidentiel. Tu es responsable de ce qui est fait depuis ton compte.",
            "Si tu penses que quelqu'un y a accédé, change ton mot de passe et préviens-nous.",
          ],
        },
        {
          h: "4. Utilisation acceptable",
          body: [
            "Tu t'engages à ne pas :",
            { list: [
              "publier de contenu illégal, haineux, discriminatoire, violent, sexuellement explicite ou trompeur ;",
              "harceler, intimider ou usurper l'identité de quelqu'un ;",
              "publier des informations personnelles concernant autrui sans son accord ;",
              "partager du matériel de cours protégé par le droit d'auteur sans y être autorisé ;",
              "spammer, faire de la publicité, ou détourner le parrainage par des comptes fictifs ;",
              "fausser ton temps d'étude, ton XP ou ton classement par des moyens automatisés ;",
              "tenter d'accéder à des données qui ne te sont pas destinées, sonder ou surcharger le service.",
            ]},
            "Ces règles valent aussi dans les messages privés, de groupe et de communauté.",
          ],
        },
        {
          h: "5. Modération",
          body: [
            "Nous pouvons masquer ou supprimer un contenu, et suspendre ou clôturer un compte, en cas de manquement à ces règles. Nous essaierons d'expliquer pourquoi, sauf si cela devait aider à contourner la mesure.",
            `Si tu penses qu'une décision est injuste, écris à ${CONTACT_EMAIL} : elle sera réexaminée.`,
            `Pour signaler un contenu ou un comportement problématique : ${CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "6. Ton contenu",
          body: [
            "Tu restes propriétaire de ce que tu publies. Tu nous accordes uniquement le droit d'héberger, stocker, afficher et transmettre ton contenu dans l'app, dans la mesure nécessaire à son fonctionnement : par exemple montrer ta publication à tes amis, ou ton message à son destinataire.",
            "Cette autorisation est gratuite, limitée à l'exploitation du service, et prend fin quand tu supprimes le contenu ou ton compte. Nous ne l'utiliserons pas à des fins publicitaires ni ne le céderons à un tiers.",
            "Une publication du feed cesse d'être visible 24 heures après sa mise en ligne, puis elle est supprimée par un nettoyage automatique quotidien — normalement dans les 48 heures suivant sa publication. Considère toute publication comme éphémère.",
          ],
        },
        {
          h: "7. Notre contenu",
          body: [
            "Le nom « Blocus Tracker », le logo, la mascotte, le design, les textes et le code appartiennent à l'éditeur. Tu peux utiliser l'app, pas la copier, la revendre ni en faire une version dérivée.",
          ],
        },
        {
          h: "8. Disponibilité du service",
          body: [
            "Blocus Tracker est un projet étudiant fourni gratuitement et « en l'état ». Nous faisons de notre mieux pour qu'il fonctionne, sans garantir une disponibilité continue : des interruptions, maintenances, changements de fonctionnalités ou pertes de données restent possibles.",
            "Nous pouvons faire évoluer ou arrêter le service. En cas d'arrêt définitif, nous préviendrons dans l'app avec un délai raisonnable pour que tu puisses exporter tes données.",
            "Garde tes documents importants ailleurs que dans l'app : ce n'est pas un service de sauvegarde.",
          ],
        },
        {
          h: "9. Résiliation",
          body: [
            "Tu peux supprimer ton compte à tout moment depuis ton profil, section Confidentialité. La suppression est immédiate et définitive.",
            "Nous pouvons suspendre ou clôturer un compte en cas de manquement grave ou répété à ces conditions, ou si le service s'arrête.",
          ],
        },
        {
          h: "10. Responsabilité",
          body: [
            "Le service est une aide à l'organisation : les statistiques, rappels et classements sont indicatifs et ne remplacent ni ton propre travail ni les consignes de ton établissement.",
            "Dans les limites permises par la loi, notre responsabilité ne saurait être engagée pour les dommages indirects liés à l'utilisation du service — notamment une perte de données, un rappel qui n'arrive pas, ou un examen manqué.",
            "Rien dans ces conditions ne limite les droits que la loi belge et le droit de la consommation te reconnaissent de façon impérative, ni notre responsabilité en cas de faute lourde, de dol ou d'atteinte à l'intégrité physique.",
          ],
        },
        {
          h: "11. Modifications des conditions",
          body: [
            "Ces conditions peuvent être mises à jour. En cas de changement de fond, un rappel s'affiche dans l'app et te demande de valider la nouvelle version. Tu peux toujours consulter la date de mise à jour en haut de cette page.",
            "Si tu n'acceptes pas une nouvelle version, tu peux supprimer ton compte — après avoir exporté tes données si tu le souhaites.",
          ],
        },
        {
          h: "12. Droit applicable et contact",
          body: [
            "Les présentes conditions sont régies par le droit belge. Si tu es consommateur résidant dans un autre pays de l'Union européenne, tu conserves le bénéfice des dispositions impératives du droit de ce pays.",
            "En cas de litige, une solution amiable sera recherchée en priorité. À défaut, les tribunaux compétents sont ceux du lieu de résidence du défendeur ou, si tu es consommateur, ceux de ton domicile.",
            `Contact : ${CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
    en: {
      title: "Terms of Use",
      sections: [
        {
          h: "1. Purpose and acceptance",
          body: [
            "Blocus Tracker is a free study companion app: timer, statistics, planning and social features between students. It is published by Mathias Dock (see Legal notice).",
            `By ticking the box at sign-up, you accept these terms in version ${TERMS_VERSION}. If you do not agree, do not create an account.`,
          ],
        },
        {
          h: "2. Who may use the service",
          body: [
            "You must be 16 or over. That threshold applies across the European Union: the digital-consent age ranges from 13 to 16 depending on the country, and we apply the most protective one because we have no parental-authorisation system. The service is aimed at students, but nothing prevents anyone else from using it to get organised.",
            "One account belongs to a single person. You may not create an account for someone else, or on behalf of an institution.",
          ],
        },
        {
          h: "3. Your account",
          body: [
            "You agree to provide accurate information and to keep your password confidential. You are responsible for what is done from your account.",
            "If you believe someone has accessed it, change your password and let us know.",
          ],
        },
        {
          h: "4. Acceptable use",
          body: [
            "You agree not to:",
            { list: [
              "post illegal, hateful, discriminatory, violent, sexually explicit or misleading content;",
              "harass, intimidate or impersonate anyone;",
              "post personal information about others without their consent;",
              "share copyrighted course material without permission;",
              "spam, advertise, or game the referral system with fake accounts;",
              "falsify your study time, XP or ranking by automated means;",
              "attempt to access data not intended for you, probe or overload the service.",
            ]},
            "These rules apply in private, group and community messages too.",
          ],
        },
        {
          h: "5. Moderation",
          body: [
            "We may hide or remove content, and suspend or close an account, in case of breach of these rules. We will try to explain why, unless doing so would help circumvent the measure.",
            `If you think a decision is unfair, email ${CONTACT_EMAIL}: it will be reviewed again.`,
            `To report problematic content or behaviour: ${CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "6. Your content",
          body: [
            "You remain the owner of what you post. You grant us only the right to host, store, display and transmit your content within the app, to the extent needed for it to work: for example showing your post to your friends, or your message to its recipient.",
            "This permission is free of charge, limited to operating the service, and ends when you delete the content or your account. We will not use it for advertising nor transfer it to a third party.",
            "A feed post stops being visible 24 hours after it goes up, then it is deleted by an automatic daily cleanup — normally within 48 hours of posting. Treat every post as ephemeral.",
          ],
        },
        {
          h: "7. Our content",
          body: [
            "The name \"Blocus Tracker\", the logo, the mascot, the design, the texts and the code belong to the publisher. You may use the app, not copy it, resell it or make a derivative version.",
          ],
        },
        {
          h: "8. Service availability",
          body: [
            "Blocus Tracker is a student project provided free of charge and \"as is\". We do our best to keep it running, without guaranteeing continuous availability: interruptions, maintenance, feature changes or data loss remain possible.",
            "We may change or discontinue the service. If it shuts down permanently, we will give notice in the app with a reasonable delay so you can export your data.",
            "Keep your important documents somewhere other than the app: it is not a backup service.",
          ],
        },
        {
          h: "9. Termination",
          body: [
            "You can delete your account at any time from your profile, Privacy section. Deletion is immediate and permanent.",
            "We may suspend or close an account for serious or repeated breaches of these terms, or if the service shuts down.",
          ],
        },
        {
          h: "10. Liability",
          body: [
            "The service is an organisational aid: statistics, reminders and rankings are indicative and replace neither your own work nor your institution's instructions.",
            "To the extent permitted by law, we cannot be held liable for indirect damages arising from use of the service — in particular data loss, a reminder that does not arrive, or a missed exam.",
            "Nothing in these terms limits the rights Belgian law and consumer law grant you on a mandatory basis, nor our liability for gross negligence, wilful misconduct or personal injury.",
          ],
        },
        {
          h: "11. Changes to these terms",
          body: [
            "These terms may be updated. For a substantive change, a reminder appears in the app asking you to accept the new version. The last-updated date is always shown at the top of this page.",
            "If you do not accept a new version, you may delete your account — after exporting your data if you wish.",
          ],
        },
        {
          h: "12. Governing law and contact",
          body: [
            "These terms are governed by Belgian law. If you are a consumer residing in another EU country, you keep the benefit of the mandatory provisions of that country's law.",
            "In case of dispute, an amicable solution will be sought first. Failing that, the competent courts are those of the defendant's place of residence or, if you are a consumer, those of your domicile.",
            `Contact: ${CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
  },

  // ───────────────────────── COOKIES & STOCKAGE ─────────────────────────
  {
    id: "cookies",
    fr: {
      title: "Cookies & stockage local",
      sections: [
        {
          h: "En bref",
          body: [
            "Blocus Tracker n'utilise aucun cookie publicitaire, aucun outil de mesure d'audience et aucun pixel de suivi. La quasi-totalité de ce qui est stocké sur ton appareil sert uniquement à faire fonctionner l'app, et ne quitte jamais ton navigateur.",
            "Un seul service tiers peut déposer quelque chose : OneSignal, pour les notifications push, et uniquement si tu les actives. Ton choix se règle à tout moment dans « Préférences de confidentialité », depuis le pied de page ou ton profil.",
          ],
        },
        {
          h: "Strictement nécessaire — actif sans consentement",
          body: [
            "Sans ces éléments l'app ne fonctionne pas. Ils ne servent à suivre personne, et la loi n'exige pas de consentement pour eux.",
            { list: [
              "Jetons de session Supabase (stockage local, première partie) — te gardent connecté. Durée : jusqu'à la déconnexion ou l'expiration du jeton.",
              "bt_timer_v1 (stockage local, première partie) — l'état de ton chrono en cours, pour qu'il survive à un rechargement. Durée : jusqu'à la fin de la session d'étude.",
              "bt_pending_sessions_v1 (stockage local, première partie) — les sessions terminées hors-ligne, en attente d'envoi. Durée : jusqu'à leur enregistrement.",
              "bt_theme, bt_lang_pref, bt_sensory_v1 (stockage local, première partie) — thème, langue, sons et vibrations. Durée : illimitée, jusqu'à effacement par toi.",
              "bt_consent_v1 (stockage local, première partie) — ton choix sur cette page, sa date et sa version. Sans lui, on te reposerait la question à chaque visite. Durée : jusqu'à changement de ton choix ou du modèle de consentement.",
              "Caches du service worker (PWA, première partie) — pages, images et fichiers mis en cache pour l'usage hors-ligne et pour réduire ta consommation de données. Durée : 30 jours pour les images, renouvelé à chaque mise à jour de l'app.",
              "Réglages d'affichage (stockage local, première partie) — vue du planning, statistiques avancées dépliées, objectif de session par défaut, son d'ambiance choisi et son volume, partage automatique de tes sessions. Durée : illimitée, jusqu'à effacement par toi.",
              "Indicateurs d'interface (stockage local et stockage de session, première partie) — étape d'inscription franchie, bannières et invitations déjà fermées, annonces déjà vues, rappel légal reporté, code de parrainage en attente (30 jours), niveau en cache, état des notifications et motif du dernier échec d'activation. Durée : de la session en cours à quelques semaines.",
            ]},
          ],
        },
        {
          h: "Services tiers de confort — seulement si tu l'acceptes",
          body: [
            { list: [
              "OneSignal (tiers, États-Unis) — gère les notifications push. Son SDK dépose un identifiant d'abonnement et des indicateurs techniques dans le stockage de ton navigateur et dans une base IndexedDB. Il n'est chargé que si tu acceptes la catégorie « services tiers de confort », ce que fait aussi l'activation des notifications depuis ton profil. Durée : tant que tu restes abonné.",
            ]},
            "Une précision honnête : le fichier technique de OneSignal qui accompagne notre application installable (PWA) est téléchargé depuis leurs serveurs à l'installation, même si tu n'actives jamais les notifications. Ils voient alors ton adresse IP et ton navigateur, mais aucun identifiant n'est créé et aucun abonnement n'existe.",
          ],
        },
        {
          h: "Mesure d'audience et publicité",
          body: [
            "Aucun outil de ces catégories n'est installé aujourd'hui : ni Google Analytics, ni Plausible, ni Meta Pixel, ni régie publicitaire, ni aucun autre. Les interrupteurs correspondants existent dans les préférences pour qu'aucun ne puisse être ajouté sans ton accord préalable, et pour porter ton refus s'il devait y en avoir un jour.",
          ],
        },
        {
          h: "Ce qui a été retiré",
          body: [
            "Les polices d'écriture étaient auparavant chargées depuis Google Fonts, ce qui transmettait ton adresse IP à Google à chaque page, même sans compte. Elles sont désormais servies depuis notre propre domaine : plus aucune requête vers Google.",
          ],
        },
        {
          h: "Gérer tout ça",
          body: [
            "« Préférences de confidentialité » — dans le pied de page et dans ton profil — permet de changer ou de retirer ton choix à tout moment. Retirer la catégorie « services tiers de confort » désabonne réellement ton appareil des notifications, ce n'est pas qu'un interrupteur d'affichage.",
            "Tu peux aussi vider le stockage local et les caches depuis les réglages de ton navigateur, ce qui remet tout à zéro. Et si ton navigateur envoie un signal Global Privacy Control, mesure d'audience et publicité restent refusées sans que tu aies à toucher à quoi que ce soit.",
            `Version de cette page : ${COOKIE_POLICY_VERSION}.`,
          ],
        },
      ],
    },
    en: {
      title: "Cookies & Local Storage",
      sections: [
        {
          h: "In short",
          body: [
            "Blocus Tracker uses no advertising cookies, no analytics tool and no tracking pixel. Almost everything stored on your device exists solely to make the app work, and never leaves your browser.",
            "Only one third-party service can store anything: OneSignal, for push notifications, and only if you enable them. Your choice is adjustable at any time under \"Privacy preferences\", from the footer or your profile.",
          ],
        },
        {
          h: "Strictly necessary — active without consent",
          body: [
            "Without these the app does not work. They track no one, and the law does not require consent for them.",
            { list: [
              "Supabase session tokens (local storage, first-party) — keep you signed in. Duration: until sign-out or token expiry.",
              "bt_timer_v1 (local storage, first-party) — the state of your running timer, so it survives a reload. Duration: until the study session ends.",
              "bt_pending_sessions_v1 (local storage, first-party) — sessions finished offline, awaiting upload. Duration: until they are saved.",
              "bt_theme, bt_lang_pref, bt_sensory_v1 (local storage, first-party) — theme, language, sound and haptics. Duration: unlimited, until you clear them.",
              "bt_consent_v1 (local storage, first-party) — your choice on this page, its date and its version. Without it we would ask you again on every visit. Duration: until your choice or the consent model changes.",
              "Service worker caches (PWA, first-party) — pages, images and files cached for offline use and to reduce your data usage. Duration: 30 days for images, refreshed on each app update.",
              "Display settings (local storage, first-party) — planning view, expanded advanced statistics, default session goal, chosen ambient sound and its volume, automatic sharing of your sessions. Duration: unlimited, until you clear them.",
              "Interface flags (local and session storage, first-party) — sign-up step reached, banners and prompts already dismissed, announcements already seen, legal reminder snoozed, pending referral code (30 days), cached level, notification state and the reason activation last failed. Duration: from the current session to a few weeks.",
            ]},
          ],
        },
        {
          h: "Third-party convenience services — only if you accept",
          body: [
            { list: [
              "OneSignal (third-party, United States) — handles push notifications. Its SDK stores a subscription identifier and technical flags in your browser storage and in an IndexedDB database. It is loaded only if you accept the \"third-party convenience services\" category, which enabling notifications from your profile also does. Duration: as long as you stay subscribed.",
            ]},
            "One honest detail: the OneSignal technical file that ships with our installable app (PWA) is downloaded from their servers at install time, even if you never enable notifications. They then see your IP address and your browser, but no identifier is created and no subscription exists.",
          ],
        },
        {
          h: "Analytics and advertising",
          body: [
            "No tool in these categories is installed today: no Google Analytics, no Plausible, no Meta Pixel, no ad network, none at all. The corresponding switches exist in the preferences so that none can be added without your prior agreement, and to carry your refusal should one ever appear.",
          ],
        },
        {
          h: "What was removed",
          body: [
            "Fonts used to be loaded from Google Fonts, which sent your IP address to Google on every page, even without an account. They are now served from our own domain: no request to Google at all.",
          ],
        },
        {
          h: "Managing all this",
          body: [
            "\"Privacy preferences\" — in the footer and in your profile — lets you change or withdraw your choice at any time. Withdrawing the \"third-party convenience services\" category actually unsubscribes your device from notifications; it is not just a display switch.",
            "You can also clear local storage and caches from your browser settings, which resets everything. And if your browser sends a Global Privacy Control signal, analytics and advertising stay refused without you touching anything.",
            `Version of this page: ${COOKIE_POLICY_VERSION}.`,
          ],
        },
      ],
    },
  },

  // ───────────────────────── MENTIONS LEGALES ─────────────────────────
  {
    id: "notice",
    fr: {
      title: "Mentions légales",
      sections: [
        {
          h: "Éditeur",
          body: [
            "Blocus Tracker est édité par Mathias Dock, dans le cadre d'un projet personnel (étudiant à l'ICHEC Brussels Management School), en Belgique. Il ne s'agit pas d'une société commerciale.",
            `Contact : ${CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "Directeur de la publication",
          body: [
            "Mathias Dock.",
          ],
        },
        {
          h: "Hébergement",
          body: [
            "L'application est hébergée par Vercel Inc. (États-Unis). La base de données, l'authentification et le stockage des fichiers sont assurés par Supabase Inc. Les emails transactionnels passent par Resend, et les notifications push par OneSignal.",
          ],
        },
        {
          h: "Propriété intellectuelle",
          body: [
            "Le nom « Blocus Tracker », l'identité visuelle, la mascotte, le code et le design sont la propriété de l'éditeur. Le contenu publié par les utilisateurs reste la propriété de ces derniers.",
            "Les polices Nunito Sans et Quicksand sont utilisées sous licence SIL Open Font License 1.1. Les effets sonores proviennent de la bibliothèque ElevenLabs Sound Effects.",
          ],
        },
        {
          h: "Signalement",
          body: [
            `Pour signaler un contenu illicite, un comportement abusif ou une atteinte à tes droits : ${CONTACT_EMAIL}. Chaque signalement est examiné.`,
          ],
        },
        {
          h: "Contact",
          body: [
            `Pour toute question ou remarque : ${CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
    en: {
      title: "Legal Notice",
      sections: [
        {
          h: "Publisher",
          body: [
            "Blocus Tracker is published by Mathias Dock, as a personal project (student at ICHEC Brussels Management School), in Belgium. It is not a commercial company.",
            `Contact: ${CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "Publication director",
          body: [
            "Mathias Dock.",
          ],
        },
        {
          h: "Hosting",
          body: [
            "The application is hosted by Vercel Inc. (United States). The database, authentication and file storage are provided by Supabase Inc. Transactional emails go through Resend, and push notifications through OneSignal.",
          ],
        },
        {
          h: "Intellectual property",
          body: [
            "The name \"Blocus Tracker\", the visual identity, the mascot, the code and the design belong to the publisher. Content posted by users remains their property.",
            "The Nunito Sans and Quicksand typefaces are used under the SIL Open Font License 1.1. Sound effects come from the ElevenLabs Sound Effects library.",
          ],
        },
        {
          h: "Reporting",
          body: [
            `To report unlawful content, abusive behaviour or an infringement of your rights: ${CONTACT_EMAIL}. Every report is reviewed.`,
          ],
        },
        {
          h: "Contact",
          body: [
            `For any question or remark: ${CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
  },
];
