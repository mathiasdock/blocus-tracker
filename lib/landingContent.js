// Contenu bilingue du site public : l'accueil (pages/index.js), les pages
// /fonctionnalites, /guides et /faq, et le cadre commun (en-tête, pied de page).
// Sélectionné par `lang` (I18nContext), qui vaut sur ces pages la langue de
// leur adresse — le français — et non celle de l'appareil : Google exécute le
// JavaScript avec un navigateur américain, et indexait l'anglais affiché après
// chargement. L'anglais ne sert qu'au choix manuel ou à un compte connecté
// anglophone. Seul le TEXTE vit ici ; les images, dimensions et liens restent
// dans les pages. Les FAQ vivent dans lib/seo.js, à côté de leur JSON-LD.
//
// Aucun chiffre sur les utilisateurs : on montre le produit, on ne promet pas
// de statistiques qu'on ne pourrait pas tenir à jour.

const GUIDE_LINKS = {
  fr: [
    ["/pomodoro", "Méthode Pomodoro"],
    ["/planning-revision", "Planning de révision"],
    ["/objectifs-etude", "Objectifs d'étude"],
    ["/stats-etude", "Statistiques d'étude"],
    ["/application-etudiant", "Quelle application pour étudier ?"],
    ["/blocus-belgique", "Réussir son blocus"],
  ],
  en: [
    ["/pomodoro", "The Pomodoro method"],
    ["/planning-revision", "A revision plan"],
    ["/objectifs-etude", "Study goals"],
    ["/stats-etude", "Study stats"],
    ["/application-etudiant", "Which app to study with?"],
    ["/blocus-belgique", "Exam prep in Belgium"],
  ],
};

const CONTENT = {
  fr: {
    header: {
      home: "Blocus Tracker, accueil",
      navAria: "Pages du site",
      accountAria: "Compte",
      links: [["/fonctionnalites", "Fonctionnalités"], ["/guides", "Guides"], ["/faq", "FAQ"]],
      login: "Se connecter",
      signup: "Commencer gratuitement",
      signupMobile: "Commencer",
    },

    hero: {
      eyebrow: "Application d'étude gratuite",
      titleStart: "Planifie. Étudie.",
      titleEnd: "Suis tes",
      titleMark: "progrès.",
      lead: "Tes examens, tes sessions de travail et tout ce que tu as déjà étudié, au même endroit.",
      primary: "Commencer gratuitement",
      secondary: "Tester sans compte",
      shotAlt: "Le Chrono de Blocus Tracker pendant une session de 47 minutes en méthodologie : blocs d'étude, missions du jour et progression de la journée",
    },

    tour: {
      title: "Un chrono, oui.",
      titleAfter: "Et tout ce qui va autour.",
      lead: "Chaque session compte pour un cours, un examen et ta progression.",
      plan: {
        title: "Planifie tes examens",
        text: "Pose tes examens, répartis tes objectifs sur les jours qui restent et vois ce qui t'attend aujourd'hui.",
        alt: "La semaine dans le Planning : l'examen de méthodologie dans cinq jours, les objectifs du jour et la charge de travail par cours",
      },
      focus: {
        title: "Concentre-toi",
        text: "Le mode Focus met tout le reste de côté : un cours, ton chrono, tes blocs.",
        alt: "Le mode Focus en plein écran pendant une session de méthodologie",
      },
      progress: {
        title: "Chaque heure compte",
        text: "Un bloc par quart d'heure étudié, une série qui s'allonge chaque jour, des badges quand tu passes un cap.",
        today: "Aujourd'hui",
        goal: "sur 2h",
        blocksLabel: "1 h 32 étudiées aujourd'hui sur un objectif de 2 h",
        streak: "Série en cours",
        streakUnit: "jours",
        badges: "Badges gagnés",
      },
      more: "Voir toutes les fonctionnalités",
    },

    devices: {
      title: "Sur téléphone et ordinateur",
      desktopAlt: "Le Chrono de Blocus Tracker sur ordinateur",
      mobileAlt: "Le même Chrono sur téléphone",
    },

    rhythm: {
      title: "Garde le rythme.",
      text: "Chaque jour étudié prolonge ta série, et la mascotte suit le mouvement : endormie à zéro, réveillée dès le premier jour, en feu à trente.",
      note: "Un jour sans étude ? Deux gels par mois peuvent sauver ta série.",
      stopsAria: "La mascotte selon la série",
      days: (n) => (n <= 1 ? `${n} jour` : `${n} jours`),
    },

    social: {
      title: "Tu n'étudies pas seul.",
      text: "Tes sessions restent privées, sauf ce que tu choisis de partager.",
      items: [
        { title: "Tes amis", text: "Suis leurs sessions, écris-leur et compare ta semaine à la leur." },
        { title: "Tes groupes", text: "Crée un groupe d'étude pour réviser à plusieurs, avec sa propre discussion." },
        { title: "Tes cours", text: "Retrouve les étudiants de ton établissement qui suivent le même cours : questions, fichiers et dates d'examen." },
      ],
      alt: "L'espace du cours de macroéconomie sur téléphone : une question entre étudiants, la date d'examen partagée et une synthèse de cours",
    },

    faq: {
      title: "Avant de commencer",
      more: "Toutes les questions",
    },

    cta: {
      title: "Prêt à t'y mettre ?",
      text: "Crée ton compte gratuit et lance ta première session. Ou teste le chrono tout de suite, sans compte.",
      primary: "Commencer gratuitement",
      secondary: "Tester sans compte",
    },

    footer: {
      tagline: "L'application d'étude gratuite pour planifier tes examens, étudier avec un chrono et suivre tes progrès.",
      columns: [
        { title: "Produit", links: [["/fonctionnalites", "Fonctionnalités"], ["/dashboard", "Tester sans compte"], ["/signup", "Créer un compte"], ["/login", "Se connecter"]] },
        { title: "Guides", links: [["/guides", "Tous les guides"], ...GUIDE_LINKS.fr] },
        { title: "Aide", links: [["/faq", "Questions fréquentes"], ["/legal", "Confidentialité et conditions"]] },
      ],
      cookieSettings: "Préférences de confidentialité",
      credit: "Créé par Mathias Dock",
    },

    features: {
      eyebrow: "Fonctionnalités",
      title: "Tout pour réviser, au même endroit.",
      lead: "Un chrono pour étudier, un planning pour savoir quoi faire, des statistiques pour voir où tu en es, et des amis pour tenir le rythme.",
      jump: "Aller à",
      areas: {
        chrono: {
          title: "Chrono et mode Focus",
          text: "Lance une session libre ou en Pomodoro sur un de tes cours. Le mode Focus passe en plein écran, et chaque quart d'heure étudié remplit un bloc.",
          points: ["Session libre ou Pomodoro", "Mode Focus en plein écran", "Le chrono continue si tu changes d'onglet"],
          alt: "Le Chrono pendant une session de méthodologie, avec les blocs d'étude et les missions du jour",
        },
        planning: {
          title: "Planning et examens",
          text: "Place tes examens, pose tes objectifs sur les bons jours et lance une session directement depuis ce que tu avais prévu.",
          points: ["Objectifs par jour, avec une durée", "Examens avec compte à rebours", "Export vers Apple Calendar, Google Calendar ou Outlook"],
          alt: "La semaine dans le Planning, avec l'examen de méthodologie et les objectifs par jour",
        },
        stats: {
          title: "Statistiques et historique",
          text: "Temps par cours, jours étudiés, série et objectif du jour : de quoi ajuster ta semaine sur des faits.",
          points: ["Temps d'étude par jour et par cours", "Ta régularité sur toute l'année", "L'historique de toutes tes sessions"],
          alt: "Les statistiques : temps d'étude de la semaine, répartition par cours et régularité sur l'année",
        },
        progression: {
          title: "XP, série et badges",
          text: "Chaque session fait gagner de l'XP. Tes jours d'affilée forment ta série, et les badges marquent les caps franchis.",
          points: ["Niveaux et XP", "Missions du jour et défis de la semaine", "Deux gels par mois pour protéger ta série"],
          alt: "La progression sur téléphone : niveau, XP et missions du jour",
        },
        social: {
          title: "Amis, messages et groupes",
          text: "Ajoute tes amis, suis les sessions qu'ils partagent, écris-leur en privé et crée un groupe d'étude.",
          points: ["Fil d'activité de tes amis", "Messages privés et groupes d'étude", "Classement entre amis"],
          alt: "Une conversation avec une amie pour organiser une séance de révision à la bibliothèque",
        },
        spaces: {
          title: "Espaces de cours",
          text: "Blocus Tracker relie tes cours à ceux de ton établissement : tu retrouves les étudiants qui suivent le même cours pour poser une question, partager un fichier ou une date d'examen.",
          points: ["Un espace par cours de ton établissement", "Questions, fichiers et dates d'examen", "Une date partagée s'ajoute à ton planning"],
          alt: "L'espace du cours de macroéconomie : discussion entre étudiants, date d'examen et synthèse partagée",
        },
      },
    },

    guidesPage: {
      eyebrow: "Guides",
      title: "Guides pour mieux réviser",
      lead: "Des méthodes concrètes pour planifier tes révisions, rester concentré et suivre ta progression pendant les examens.",
      methodTitle: "Une boucle en quatre temps",
      methodText: "Réviser mieux ne demande pas d'être motivé en permanence : décide, concentre-toi, mesure, puis ajuste la suite.",
      steps: [
        { title: "Décide quoi réviser", text: "Place tes examens, découpe la matière en objectifs réalistes et garde seulement ce qui compte aujourd'hui.", href: "/planning-revision", link: "Construire un planning réaliste" },
        { title: "Protège un vrai bloc", text: "Choisis une session libre ou Pomodoro, coupe les distractions et avance bloc après bloc sur une seule matière.", href: "/pomodoro", link: "Utiliser Pomodoro efficacement" },
        { title: "Transforme l'effort en progression", text: "Valide tes objectifs, garde ta série et laisse l'XP rendre visible la régularité que tu construis.", href: "/objectifs-etude", link: "Fixer de meilleurs objectifs" },
        { title: "Regarde, ajuste, recommence", text: "Compare le prévu au réel, repère tes meilleures habitudes et adapte la semaine suivante sans culpabiliser.", href: "/stats-etude", link: "Comprendre ses statistiques" },
      ],
      allTitle: "Tous les guides",
      read: "Lire le guide",
      cards: {
        "/pomodoro": "Comprends la méthode Pomodoro et adapte-la à tes révisions, bloc après bloc.",
        "/planning-revision": "Un planning réaliste pour tes examens : priorités, objectifs, pauses et suivi.",
        "/objectifs-etude": "Des objectifs d'étude motivants, mesurables et adaptés à tes examens.",
        "/stats-etude": "Les statistiques qui aident à réviser plus régulièrement, et comment les lire.",
        "/application-etudiant": "Ce qu'une bonne application d'étude doit réunir pour que tu l'ouvres chaque jour.",
        "/blocus-belgique": "Organiser son blocus en Belgique : rythme, pauses, objectifs et examens.",
      },
    },

    faqPage: {
      eyebrow: "FAQ",
      title: "Questions fréquentes",
      lead: "Prix, compte, fonctionnalités et données : ce qu'il faut savoir avant de commencer.",
    },
  },

  en: {
    header: {
      home: "Blocus Tracker, home",
      navAria: "Site pages",
      accountAria: "Account",
      links: [["/fonctionnalites", "Features"], ["/guides", "Guides"], ["/faq", "FAQ"]],
      login: "Sign in",
      signup: "Start for free",
      signupMobile: "Get started",
    },

    hero: {
      eyebrow: "Free study app",
      titleStart: "Plan. Study.",
      titleEnd: "Track your",
      titleMark: "progress.",
      lead: "Your exams, your study sessions and everything you've already studied, in one place.",
      primary: "Start for free",
      secondary: "Try without an account",
      shotAlt: "The Blocus Tracker timer during a 47-minute Research Methods session: study blocks, today's missions and the day's progress",
    },

    tour: {
      title: "A timer, yes.",
      titleAfter: "And everything around it.",
      lead: "Every session counts toward a course, an exam and your progress.",
      plan: {
        title: "Plan your exams",
        text: "Add your exams, spread your goals over the days that are left and see what's on for today.",
        alt: "The week in the planner: the Research Methods exam in five days, today's goals and the workload per course",
      },
      focus: {
        title: "Stay focused",
        text: "Focus mode puts everything else aside: one course, your timer, your blocks.",
        alt: "Full-screen Focus mode during a Research Methods session",
      },
      progress: {
        title: "Every hour counts",
        text: "One block for every quarter hour you study, a streak that grows every day, badges when you reach a milestone.",
        today: "Today",
        goal: "of 2h",
        blocksLabel: "1 h 32 min studied today out of a 2-hour goal",
        streak: "Current streak",
        streakUnit: "days",
        badges: "Badges earned",
      },
      more: "See all features",
    },

    devices: {
      title: "On phone and computer",
      desktopAlt: "The Blocus Tracker timer on a computer",
      mobileAlt: "The same timer on a phone",
    },

    rhythm: {
      title: "Keep your rhythm.",
      text: "Every day you study extends your streak, and the mascot follows along: asleep at zero, awake from day one, on fire at thirty.",
      note: "Missed a day? Two freezes a month can save your streak.",
      stopsAria: "The mascot by streak",
      days: (n) => (n === 1 ? "1 day" : `${n} days`),
    },

    social: {
      title: "You're not studying alone.",
      text: "Your sessions stay private, except what you choose to share.",
      items: [
        { title: "Your friends", text: "Follow their sessions, message them and compare your week with theirs." },
        { title: "Your groups", text: "Start a study group to review together, with its own chat." },
        { title: "Your courses", text: "Find the students at your school who take the same course: questions, files and exam dates." },
      ],
      alt: "The Macroeconomics course space on a phone: a question between students, the shared exam date and a course summary",
    },

    faq: {
      title: "Before you start",
      more: "All questions",
    },

    cta: {
      title: "Ready to get started?",
      text: "Create your free account and start your first session. Or try the timer right now, no account needed.",
      primary: "Start for free",
      secondary: "Try without an account",
    },

    footer: {
      tagline: "The free study app to plan your exams, study with a timer and track your progress.",
      columns: [
        { title: "Product", links: [["/fonctionnalites", "Features"], ["/dashboard", "Try without an account"], ["/signup", "Create an account"], ["/login", "Sign in"]] },
        { title: "Guides", links: [["/guides", "All guides"], ...GUIDE_LINKS.en] },
        { title: "Help", links: [["/faq", "Frequently asked questions"], ["/legal", "Privacy and terms"]] },
      ],
      cookieSettings: "Privacy preferences",
      credit: "Created by Mathias Dock",
    },

    features: {
      eyebrow: "Features",
      title: "Everything to study, in one place.",
      lead: "A timer to study, a planner to know what to do, stats to see where you stand, and friends to keep the rhythm.",
      jump: "Jump to",
      areas: {
        chrono: {
          title: "Timer and Focus mode",
          text: "Start an open or Pomodoro session on one of your courses. Focus mode goes full screen, and every quarter hour you study fills a block.",
          points: ["Open or Pomodoro session", "Full-screen Focus mode", "The timer keeps running if you switch tabs"],
          alt: "The timer during a Research Methods session, with study blocks and today's missions",
        },
        planning: {
          title: "Planner and exams",
          text: "Add your exams, put your goals on the right days and start a session straight from what you planned.",
          points: ["Daily goals, with a duration", "Exams with a countdown", "Export to Apple Calendar, Google Calendar or Outlook"],
          alt: "The week in the planner, with the Research Methods exam and daily goals",
        },
        stats: {
          title: "Stats and history",
          text: "Time per course, days studied, streak and daily goal: enough to adjust your week based on facts.",
          points: ["Study time per day and per course", "Your consistency across the year", "The history of all your sessions"],
          alt: "Stats: this week's study time, time per course and consistency across the year",
        },
        progression: {
          title: "XP, streak and badges",
          text: "Every session earns XP. Your days in a row build your streak, and badges mark the milestones you reach.",
          points: ["Levels and XP", "Daily missions and weekly challenges", "Two freezes a month to protect your streak"],
          alt: "Progress on a phone: level, XP and today's missions",
        },
        social: {
          title: "Friends, messages and groups",
          text: "Add your friends, follow the sessions they share, message them privately and start a study group.",
          points: ["Your friends' activity feed", "Private messages and study groups", "Leaderboard with friends"],
          alt: "A conversation with a friend to plan a study session at the library",
        },
        spaces: {
          title: "Course spaces",
          text: "Blocus Tracker links your courses to your school's courses: you find the students taking the same course to ask a question, share a file or an exam date.",
          points: ["One space per course at your school", "Questions, files and exam dates", "A shared exam date goes straight into your planner"],
          alt: "The Macroeconomics course space: discussion between students, exam date and a shared summary",
        },
      },
    },

    guidesPage: {
      eyebrow: "Guides",
      title: "Guides to study better",
      lead: "Concrete methods to plan your revision, stay focused and track your progress during exams.",
      methodTitle: "A loop in four steps",
      methodText: "Studying better doesn't require being motivated all the time: decide, focus, measure, then adjust what's next.",
      steps: [
        { title: "Decide what to review", text: "Place your exams, break the material into realistic goals and keep only what matters today.", href: "/planning-revision", link: "Build a realistic plan" },
        { title: "Protect a real block", text: "Pick an open or Pomodoro session, cut the distractions and move block after block on a single subject.", href: "/pomodoro", link: "Use Pomodoro effectively" },
        { title: "Turn effort into progress", text: "Check off your goals, keep your streak alive and let XP make the consistency you're building visible.", href: "/objectifs-etude", link: "Set better goals" },
        { title: "Look, adjust, repeat", text: "Compare planned vs. actual, spot your best habits and adapt the next week without guilt.", href: "/stats-etude", link: "Understand your stats" },
      ],
      allTitle: "All guides",
      read: "Read the guide",
      cards: {
        "/pomodoro": "Understand the Pomodoro method and adapt it to your revision, block after block.",
        "/planning-revision": "A realistic plan for your exams: priorities, goals, breaks and tracking.",
        "/objectifs-etude": "Study goals that are motivating, measurable and fit your exams.",
        "/stats-etude": "The stats that help you study more consistently, and how to read them.",
        "/application-etudiant": "What a good study app should bring together so you open it every day.",
        "/blocus-belgique": "Organizing your exam prep in Belgium: rhythm, breaks, goals and exams.",
      },
    },

    faqPage: {
      eyebrow: "FAQ",
      title: "Frequently asked questions",
      lead: "Price, account, features and data: what to know before you start.",
    },
  },
};

export function getLandingContent(lang) {
  return CONTENT[lang === "en" ? "en" : "fr"];
}
