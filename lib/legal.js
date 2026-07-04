// ─────────────────────────────────────────────────────────────────────────
// Contenu legal du site (bilingue FR + EN).
//
// Rendu par pages/legal.js. Les libelles d'interface (titres d'onglets, etc.)
// vivent dans lib/i18n.js ; ICI on ne met que le contenu long-forme des
// documents, dans les deux langues.
//
// ⚠️  A VERIFIER / COMPLETER PAR MATHIAS avant de s'y fier juridiquement :
//   • LEGAL_CONTACT_EMAIL ci-dessous (adresse de contact publiee).
//   • Statut de l'editeur : ce texte part du principe d'un PROJET PERSONNEL
//     d'une personne physique (etudiant), PAS d'une societe. Si tu crees une
//     structure (asbl, entreprise), il faudra ajouter n° d'entreprise/TVA,
//     adresse du siege, etc. dans les Mentions legales.
//   • Regions d'hebergement exactes (Supabase / Vercel) et transferts hors UE :
//     verifie la config de ton projet Supabase et complete si besoin.
//   • Age minimum : fixe ici a 16 ans (a ajuster selon ton choix ; en Belgique
//     l'age du consentement numerique RGPD est 13 ans).
//   • LEGAL_EFFECTIVE_DATE : date de derniere mise a jour.
//   • Ce contenu est une base serieuse et honnete fondee sur les pratiques
//     reelles de l'app, mais n'est PAS un avis juridique. Fais-le relire.
// ─────────────────────────────────────────────────────────────────────────

export const LEGAL_CONTACT_EMAIL = "mathias.dock.management@gmail.com";
export const LEGAL_EFFECTIVE_DATE = { fr: "4 juillet 2026", en: "July 4, 2026" };

// Chaque section : { h: titre, body: [ paragraphe | { list: [...] } ] }
export const LEGAL_DOCS = [
  // ───────────────────────── CONFIDENTIALITE ─────────────────────────
  {
    id: "privacy",
    fr: {
      title: "Politique de confidentialité",
      sections: [
        {
          h: "1. Qui est responsable de tes données",
          body: [
            "Blocus Tracker est un projet personnel créé et géré par Mathias Dock, étudiant à l'ICHEC Brussels Management School (Belgique). C'est lui le responsable du traitement de tes données au sens du RGPD.",
            `Pour toute question relative à tes données : ${LEGAL_CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "2. Les données que nous traitons",
          body: [
            "Nous ne collectons que ce qui est utile au fonctionnement de l'app :",
            { list: [
              "Compte : pseudo, adresse email (optionnelle), prénom et nom (optionnels), université, domaine et année d'études, bio, photo de profil.",
              "Activité d'étude : sessions chronométrées (cours, durée, notes, horodatage), matières, objectifs et planning, examens, checklists de révision.",
              "Contenu social : publications du feed (photos, visibles 24 h), commentaires, réactions, messages privés, messages de communauté, relations d'amitié.",
              "Progression : expérience (XP), badges, parrainages.",
              "Données techniques : jetons de session, préférences (thème, langue), statut « en train d'étudier » (présence), et — uniquement si tu les actives — l'abonnement aux notifications push.",
            ]},
          ],
        },
        {
          h: "3. Pourquoi nous les traitons (finalités et bases légales)",
          body: [
            { list: [
              "Fournir le service (chrono, stats, planning, compte) — exécution des conditions d'utilisation que tu acceptes en créant un compte.",
              "Fonctions sociales (feed, amis, messages, communautés) — sur la base de tes actions volontaires (tu publies, tu ajoutes un ami…).",
              "Emails de connexion (confirmation, réinitialisation du mot de passe) — nécessaires à la gestion de ton compte.",
              "Notifications push — uniquement avec ton consentement, révocable à tout moment dans tes préférences.",
            ]},
          ],
        },
        {
          h: "4. Qui a accès à tes données",
          body: [
            "Nous ne vendons jamais tes données et ne les utilisons pas à des fins publicitaires. Ton adresse email n'est jamais montrée aux autres utilisateurs.",
            "Pour faire fonctionner l'app, nous nous appuyons sur des prestataires techniques (sous-traitants) qui traitent des données pour notre compte :",
            { list: [
              "Supabase — base de données, authentification, stockage des fichiers (avatars, photos) et temps réel.",
              "Vercel — hébergement de l'application.",
              "Resend — envoi des emails transactionnels (confirmation, réinitialisation), via Supabase.",
              "OneSignal — notifications push, chargé uniquement si tu actives les notifications.",
            ]},
            "Selon la configuration de ces services, certaines données peuvent être traitées en dehors de l'Union européenne, avec les garanties appropriées prévues par le RGPD.",
          ],
        },
        {
          h: "5. Combien de temps nous les conservons",
          body: [
            "Tes données sont conservées tant que ton compte existe. Lorsque tu supprimes ton compte, elles sont effacées. Les photos publiées dans le feed disparaissent automatiquement après 24 heures.",
          ],
        },
        {
          h: "6. Tes droits",
          body: [
            "Conformément au RGPD, tu disposes des droits suivants :",
            { list: [
              "Accès : savoir quelles données te concernent.",
              "Rectification : corriger tes informations — la plupart sont modifiables directement dans ton profil.",
              "Effacement : supprimer ton compte et tes données, directement depuis ton profil (« Supprimer mon compte »).",
              "Portabilité : recevoir une copie de tes données.",
              "Opposition et retrait du consentement : par exemple désactiver les notifications push.",
            ]},
            `Pour exercer un droit qui n'est pas disponible directement dans l'app, écris à ${LEGAL_CONTACT_EMAIL}. Tu peux aussi introduire une réclamation auprès de l'Autorité de protection des données (APD/GBA, Belgique — www.autoriteprotectiondonnees.be).`,
          ],
        },
        {
          h: "7. Sécurité",
          body: [
            "L'accès aux données est protégé au niveau de la base (règles de sécurité par ligne / RLS), les clés d'administration serveur ne sont jamais exposées côté navigateur, et les adresses email ne sont jamais renvoyées aux autres utilisateurs. Aucun système n'étant infaillible, nous t'encourageons à utiliser un mot de passe fort.",
          ],
        },
        {
          h: "8. Mineurs",
          body: [
            "Le service s'adresse à des étudiants de 16 ans et plus. Si tu as moins de 16 ans, l'accord d'un parent ou tuteur est nécessaire.",
          ],
        },
        {
          h: "9. Modifications",
          body: [
            "Cette politique peut évoluer. La date de dernière mise à jour figure en haut de cette page. En cas de changement important, nous ferons notre possible pour t'en informer dans l'app.",
          ],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      sections: [
        {
          h: "1. Who is responsible for your data",
          body: [
            "Blocus Tracker is a personal project created and run by Mathias Dock, a student at ICHEC Brussels Management School (Belgium). He is the data controller under the GDPR.",
            `For any question about your data: ${LEGAL_CONTACT_EMAIL}.`,
          ],
        },
        {
          h: "2. The data we process",
          body: [
            "We only collect what the app needs to work:",
            { list: [
              "Account: username, email address (optional), first and last name (optional), university, field and year of study, bio, profile picture.",
              "Study activity: timed sessions (course, duration, notes, timestamps), subjects, goals and planning, exams, revision checklists.",
              "Social content: feed posts (photos, visible for 24h), comments, reactions, private messages, community messages, friendships.",
              "Progress: experience (XP), badges, referrals.",
              "Technical data: session tokens, preferences (theme, language), \"currently studying\" presence, and — only if you enable it — your push notification subscription.",
            ]},
          ],
        },
        {
          h: "3. Why we process it (purposes and legal bases)",
          body: [
            { list: [
              "Providing the service (timer, stats, planning, account) — performance of the terms you accept when creating an account.",
              "Social features (feed, friends, messages, communities) — based on your voluntary actions (posting, adding a friend, etc.).",
              "Sign-in emails (confirmation, password reset) — necessary to manage your account.",
              "Push notifications — only with your consent, revocable at any time in your preferences.",
            ]},
          ],
        },
        {
          h: "4. Who has access to your data",
          body: [
            "We never sell your data and never use it for advertising. Your email address is never shown to other users.",
            "To run the app, we rely on technical providers (processors) that process data on our behalf:",
            { list: [
              "Supabase — database, authentication, file storage (avatars, photos) and realtime.",
              "Vercel — application hosting.",
              "Resend — transactional emails (confirmation, reset), via Supabase.",
              "OneSignal — push notifications, loaded only if you enable notifications.",
            ]},
            "Depending on how these services are configured, some data may be processed outside the European Union, with the appropriate safeguards required by the GDPR.",
          ],
        },
        {
          h: "5. How long we keep it",
          body: [
            "Your data is kept as long as your account exists. When you delete your account, it is erased. Photos posted in the feed disappear automatically after 24 hours.",
          ],
        },
        {
          h: "6. Your rights",
          body: [
            "Under the GDPR, you have the following rights:",
            { list: [
              "Access: know what data concerns you.",
              "Rectification: correct your information — most of it is editable directly in your profile.",
              "Erasure: delete your account and data, directly from your profile (\"Delete my account\").",
              "Portability: receive a copy of your data.",
              "Objection and withdrawal of consent: e.g. disabling push notifications.",
            ]},
            `To exercise a right not available directly in the app, email ${LEGAL_CONTACT_EMAIL}. You may also lodge a complaint with the Belgian Data Protection Authority (APD/GBA — www.dataprotectionauthority.be).`,
          ],
        },
        {
          h: "7. Security",
          body: [
            "Data access is protected at the database level (row-level security), server admin keys are never exposed to the browser, and email addresses are never returned to other users. No system is perfect, so we encourage you to use a strong password.",
          ],
        },
        {
          h: "8. Minors",
          body: [
            "The service is intended for students aged 16 and over. If you are under 16, a parent's or guardian's consent is required.",
          ],
        },
        {
          h: "9. Changes",
          body: [
            "This policy may change. The last-updated date is shown at the top of this page. For significant changes, we will do our best to notify you in the app.",
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
          h: "1. Objet",
          body: [
            "Blocus Tracker est une application gratuite d'aide à l'étude (chrono, statistiques, planning et fonctions sociales entre étudiants). En créant un compte ou en utilisant l'app, tu acceptes les présentes conditions.",
          ],
        },
        {
          h: "2. Ton compte",
          body: [
            "Tu t'engages à fournir des informations exactes et à garder ton mot de passe confidentiel. Tu es responsable de l'activité effectuée depuis ton compte. Un compte correspond à une seule personne.",
          ],
        },
        {
          h: "3. Utilisation acceptable",
          body: [
            "Tu t'engages à ne pas publier de contenu illégal, haineux, harcelant, trompeur ou qui porte atteinte aux droits d'autrui, et à ne pas perturber le service (spam, tentative d'accès non autorisé, etc.).",
            "Nous pouvons modérer, masquer ou supprimer tout contenu, et suspendre un compte, en cas de non-respect de ces règles.",
          ],
        },
        {
          h: "4. Ton contenu",
          body: [
            "Tu restes propriétaire du contenu que tu publies. Tu nous accordes simplement le droit de l'héberger et de l'afficher dans l'app pour son bon fonctionnement (par exemple montrer ta publication à tes amis). Les photos du feed sont automatiquement supprimées après 24 heures.",
          ],
        },
        {
          h: "5. Disponibilité du service",
          body: [
            "Blocus Tracker est un projet étudiant fourni « en l'état ». Nous faisons de notre mieux pour qu'il fonctionne, mais nous ne garantissons pas une disponibilité continue : des interruptions, maintenances ou évolutions sont possibles.",
          ],
        },
        {
          h: "6. Résiliation",
          body: [
            "Tu peux supprimer ton compte à tout moment depuis ton profil. Nous pouvons suspendre ou clôturer un compte en cas d'abus ou de non-respect des conditions.",
          ],
        },
        {
          h: "7. Responsabilité",
          body: [
            "Dans les limites permises par la loi, notre responsabilité ne saurait être engagée pour les dommages indirects liés à l'utilisation du service. Le service ne remplace pas ta propre organisation ; les statistiques et rappels sont fournis à titre indicatif.",
          ],
        },
        {
          h: "8. Droit applicable",
          body: [
            "Les présentes conditions sont régies par le droit belge. En cas de litige, une solution amiable sera recherchée en priorité.",
          ],
        },
        {
          h: "9. Modifications",
          body: [
            "Ces conditions peuvent être mises à jour. La date de dernière mise à jour figure en haut de cette page.",
          ],
        },
      ],
    },
    en: {
      title: "Terms of Use",
      sections: [
        {
          h: "1. Purpose",
          body: [
            "Blocus Tracker is a free study companion app (timer, statistics, planning and social features between students). By creating an account or using the app, you accept these terms.",
          ],
        },
        {
          h: "2. Your account",
          body: [
            "You agree to provide accurate information and to keep your password confidential. You are responsible for activity performed from your account. One account belongs to a single person.",
          ],
        },
        {
          h: "3. Acceptable use",
          body: [
            "You agree not to post illegal, hateful, harassing, misleading content or content that infringes others' rights, and not to disrupt the service (spam, unauthorized access attempts, etc.).",
            "We may moderate, hide or remove any content, and suspend an account, if these rules are not respected.",
          ],
        },
        {
          h: "4. Your content",
          body: [
            "You remain the owner of the content you post. You simply grant us the right to host and display it in the app so it can work (for example showing your post to your friends). Feed photos are automatically deleted after 24 hours.",
          ],
        },
        {
          h: "5. Service availability",
          body: [
            "Blocus Tracker is a student project provided \"as is\". We do our best to keep it running, but we do not guarantee continuous availability: interruptions, maintenance or changes may occur.",
          ],
        },
        {
          h: "6. Termination",
          body: [
            "You can delete your account at any time from your profile. We may suspend or close an account in case of abuse or breach of these terms.",
          ],
        },
        {
          h: "7. Liability",
          body: [
            "To the extent permitted by law, we cannot be held liable for indirect damages arising from use of the service. The service does not replace your own organization; statistics and reminders are provided for guidance only.",
          ],
        },
        {
          h: "8. Governing law",
          body: [
            "These terms are governed by Belgian law. In case of dispute, an amicable solution will be sought first.",
          ],
        },
        {
          h: "9. Changes",
          body: [
            "These terms may be updated. The last-updated date is shown at the top of this page.",
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
            "Blocus Tracker n'utilise aucun cookie publicitaire ni traceur tiers. Nous ne faisons pas de suivi à des fins marketing. Le seul stockage utilisé sur ton appareil est celui qui est nécessaire au fonctionnement de l'app.",
          ],
        },
        {
          h: "Stockage local (localStorage)",
          body: [
            "L'app garde quelques informations dans le stockage local de ton navigateur, uniquement pour fonctionner correctement :",
            { list: [
              "Ton thème (clair/sombre) et ta langue.",
              "L'état de ton chrono en cours (pour qu'il continue même si tu changes d'onglet ou recharges).",
              "Ton niveau/XP en cache et les annonces déjà vues, pour éviter des rechargements inutiles.",
              "Un éventuel code de parrainage et l'état d'onboarding.",
            ]},
            "Aucune de ces informations n'est transmise à un annonceur ou à un service de traçage.",
          ],
        },
        {
          h: "Application installable (PWA)",
          body: [
            "Blocus Tracker peut être installé sur ton téléphone ou ton ordinateur. Dans ce cas, un « service worker » met en cache certains fichiers et images pour permettre un fonctionnement hors-ligne et réduire ta consommation de données.",
          ],
        },
        {
          h: "Cookies d'authentification",
          body: [
            "La connexion à ton compte repose sur des jetons de session (fournis par Supabase Auth). Ils sont strictement nécessaires pour te garder connecté et ne servent pas au traçage.",
          ],
        },
        {
          h: "Services tiers",
          body: [
            "Si tu actives les notifications push, un composant OneSignal est chargé pour gérer ton abonnement. Il n'est jamais chargé tant que tu n'actives pas les notifications.",
          ],
        },
        {
          h: "Gérer tout ça",
          body: [
            "Tu peux à tout moment vider le stockage local et les caches depuis les réglages de ton navigateur, changer de thème ou de langue dans tes préférences, et désactiver les notifications push.",
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
            "Blocus Tracker uses no advertising cookies and no third-party trackers. We do not track you for marketing. The only storage used on your device is what the app needs to work.",
          ],
        },
        {
          h: "Local storage",
          body: [
            "The app keeps a little information in your browser's local storage, solely so it works correctly:",
            { list: [
              "Your theme (light/dark) and language.",
              "The state of your running timer (so it continues even if you switch tabs or reload).",
              "Your cached level/XP and already-seen announcements, to avoid unnecessary reloads.",
              "A possible referral code and onboarding state.",
            ]},
            "None of this information is shared with an advertiser or tracking service.",
          ],
        },
        {
          h: "Installable app (PWA)",
          body: [
            "Blocus Tracker can be installed on your phone or computer. In that case, a \"service worker\" caches some files and images to allow offline use and reduce your data usage.",
          ],
        },
        {
          h: "Authentication cookies",
          body: [
            "Signing in relies on session tokens (provided by Supabase Auth). They are strictly necessary to keep you signed in and are not used for tracking.",
          ],
        },
        {
          h: "Third-party services",
          body: [
            "If you enable push notifications, a OneSignal component is loaded to manage your subscription. It is never loaded until you enable notifications.",
          ],
        },
        {
          h: "Managing all this",
          body: [
            "You can clear local storage and caches at any time from your browser settings, change theme or language in your preferences, and disable push notifications.",
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
            "Blocus Tracker est édité par Mathias Dock, dans le cadre d'un projet personnel (étudiant à l'ICHEC Brussels Management School), en Belgique.",
            `Contact : ${LEGAL_CONTACT_EMAIL}.`,
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
            "L'application est hébergée par Vercel Inc. La base de données, l'authentification et le stockage des fichiers sont assurés par Supabase.",
          ],
        },
        {
          h: "Propriété intellectuelle",
          body: [
            "Le nom « Blocus Tracker », l'identité visuelle, le code et le design sont la propriété de l'éditeur. Le contenu publié par les utilisateurs reste la propriété de ces derniers.",
          ],
        },
        {
          h: "Contact",
          body: [
            `Pour toute question, remarque ou signalement : ${LEGAL_CONTACT_EMAIL}.`,
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
            "Blocus Tracker is published by Mathias Dock, as a personal project (student at ICHEC Brussels Management School), in Belgium.",
            `Contact: ${LEGAL_CONTACT_EMAIL}.`,
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
            "The application is hosted by Vercel Inc. The database, authentication and file storage are provided by Supabase.",
          ],
        },
        {
          h: "Intellectual property",
          body: [
            "The name \"Blocus Tracker\", the visual identity, the code and the design belong to the publisher. Content posted by users remains their property.",
          ],
        },
        {
          h: "Contact",
          body: [
            `For any question, remark or report: ${LEGAL_CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
  },
];
