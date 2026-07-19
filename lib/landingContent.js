// Contenu bilingue de la landing publique (pages/index.js). Sélectionné par
// `lang` (I18nContext) → la page suit la langue de l'appareil, comme le reste
// de l'app. Le HTML généré au build (SSG) reste français : c'est ce que Google
// indexe pour les recherches francophones ; l'anglais s'affiche côté client
// pour les appareils anglophones. Seul le TEXTE vit ici ; les champs structurels
// (screenshots, dimensions, liens, ids) restent dans pages/index.js.

const CONTENT = {
  fr: {
    nav: { features: "Fonctionnalités", discover: "Découvrir l'app", faq: "FAQ", login: "Se connecter", signup: "Créer mon espace" },
    navSectionsAria: "Sections de la page",
    navMainAria: "Navigation principale",

    hero: {
      badge: "Application d'étude pour étudiants",
      titleBefore: "Le chrono qui rend ton blocus ",
      titleAccent: "plus clair.",
      subtitle: "Chronomètre tes sessions, planifie tes examens, suis ta progression. Seul ou avec tes amis, gratuitement.",
      tryTimer: "Essayer le chrono",
      createSpace: "Créer mon espace",
      desktopAlt: "Le chrono Blocus Tracker sur ordinateur : session prête à démarrer, objectifs du jour et cours",
      mobileAlt: "Le chrono Blocus Tracker sur téléphone",
      chipChrono: "Session en cours",
    },

    statLabels: ["étudiants inscrits", "communautés d'écoles", "pays représentés", "gratuit, sans carte"],

    focus: {
      title: "Un mode focus qui coupe tout le reste.",
      text: "Plein écran, une matière, et des blocs de concentration qui se remplissent au fil de la session. Le chrono continue même si tu changes d'onglet.",
      list: ["Blocs de 25 minutes ou session libre", "Pause visible, reprise en un geste", "Ta session s'enregistre dans tes stats"],
      alt: "Le mode focus de Blocus Tracker en plein écran",
    },

    planning: {
      title: "Sache exactement quoi réviser aujourd'hui.",
      text: "Des objectifs par jour, tes examens avec compte à rebours, et une carte \"à préparer cette semaine\" qui pense à ta place.",
      list: ["Objectifs quotidiens, cochés en un tap", "Examens avec badge J-7, J-3, demain", "Export vers Apple ou Google Calendar"],
      alt: "Le planning de révision Blocus Tracker : vue mois, objectifs du jour et examens à venir",
    },

    statsSection: {
      title: "Ta progression, noir sur blanc.",
      text: "Temps d'étude, séries, records et classement entre amis. De quoi rester motivé sans te raconter d'histoires.",
      link: "Voir le chrono en action",
      alt: "Les statistiques d'étude Blocus Tracker : temps, séries et progression",
      overlayAlt: "Le classement entre amis",
    },

    social: {
      title: "Le blocus, c'est mieux à plusieurs.",
      text: "Messages privés, groupes d'étude et une communauté pour ton école. Compare ta semaine avec tes amis et restez réguliers ensemble.",
      captions: ["Amis, messages et groupes d'étude", "Salon, questions et examens par école"],
      socialAlt: "L'espace Social de Blocus Tracker : amis, messages et groupes",
      communautesAlt: "Les communautés d'écoles de Blocus Tracker",
      marquee: (u, c) => `${u} communautés, ${c} pays`,
    },

    tour: {
      eyebrow: "Visite guidée",
      title: "Toutes tes révisions, dans un seul espace.",
      text: "Chaque page a un rôle précis. Explore-les ici, puis teste le chrono sans compte. Ton compte sert à garder tout ce que tu construis.",
      cta: "Créer un compte pour garder ma progression",
      tablistAria: "Espaces de Blocus Tracker",
      tryTimer: "Tester le chrono",
      unlockAll: "Tout débloquer",
      footnote: "Disponible sur ordinateur et mobile. Installable sur l'écran d'accueil, sans App Store.",
    },

    areas: {
      chrono: {
        label: "Chrono", title: "Chrono et mode Focus",
        description: "Lance une session libre ou Pomodoro, choisis ta matière et construis ta concentration bloc après bloc sans quitter l'écran des yeux.",
        mascot: "Commence ici : choisis un cours, lance le chrono et je construis chaque bloc avec toi.",
        alt: "Le chrono et les Blocus Blocks de Blocus Tracker",
        features: ["Session libre ou Pomodoro", "Mode Focus plein écran", "Pause, objectif et temps réel"],
      },
      planning: {
        label: "Planning", title: "Planning et examens",
        description: "Pose tes objectifs sur les bons jours, garde tes examens visibles et lance directement une session depuis ce que tu avais prévu.",
        mascot: "Ici, on transforme le stress en prochaines actions : aujourd'hui, cette semaine, puis l'examen.",
        alt: "Le planning de révision, les objectifs et les examens",
        features: ["Objectifs quotidiens", "Examens avec compte à rebours", "Export calendrier"],
      },
      stats: {
        label: "Stats", title: "Statistiques et historique",
        description: "Retrouve le temps étudié, ta régularité, tes meilleurs créneaux et chaque session passée pour ajuster la suite sur des faits.",
        mascot: "Pas besoin d'étudier au hasard : je t'aide à voir quand tu avances vraiment et où ajuster.",
        alt: "Les statistiques et l'historique d'étude",
        features: ["Temps par matière", "Séries, records et régularité", "Historique des sessions"],
      },
      progression: {
        label: "Progression", title: "Profil, XP et badges",
        description: "Chaque session nourrit une progression lisible : niveau, série, missions du jour et badges donnent un rythme sans transformer l'étude en jeu bruyant.",
        mascot: "Je réagis à ta série, et ton profil garde la trace de tout ce que tu as construit.",
        alt: "Le profil, les missions, l'XP et les badges",
        features: ["Niveaux et XP", "Série de jours étudiés", "Missions et badges"],
      },
      social: {
        label: "Social", title: "Feed, amis et groupes",
        description: "Suis les efforts de tes amis, retrouve tes conversations privées et organise un groupe d'étude sans mélanger toute ta vie sociale.",
        mascot: "Un bon groupe ne remplace pas le travail : il rend juste plus facile le fait de revenir demain.",
        alt: "Le feed, les amis, les messages privés et les groupes d'étude",
        features: ["Fil d'activité léger", "Amis et messages privés", "Groupes d'étude"],
      },
      communautes: {
        label: "Communautés", title: "Communautés d'écoles",
        description: "Retrouve les étudiants de ton école dans un espace structuré pour les discussions, questions, ressources et examens.",
        mascot: "Choisis ton école : les questions, ressources et dates utiles restent au même endroit.",
        alt: "Les discussions, questions, ressources et examens d'une communauté d'école",
        features: ["Salon étudiant", "Questions et ressources", "Examens de la communauté"],
      },
    },

    method: {
      eyebrow: "La méthode Blocus Tracker",
      title: "Réviser mieux, c'est une boucle simple.",
      text: "L'app ne te demande pas d'être motivé en permanence. Elle t'aide à décider, te concentrer, mesurer, puis ajuster la suite.",
    },

    studyFlow: [
      { title: "Décide quoi réviser", text: "Place tes examens, découpe la matière en objectifs réalistes et garde seulement ce qui compte aujourd'hui.", app: "Planning · Objectifs · Examens", link: "Construire un planning réaliste" },
      { title: "Protège un vrai bloc", text: "Choisis une session libre ou Pomodoro, coupe les distractions et avance bloc après bloc sur une seule matière.", app: "Chrono · Pomodoro · Mode Focus", link: "Utiliser Pomodoro efficacement" },
      { title: "Transforme l'effort en progression", text: "Valide tes objectifs, maintiens ta série et laisse l'XP rendre visible la régularité que tu construis.", app: "Missions · Série · XP · Badges", link: "Fixer de meilleurs objectifs" },
      { title: "Regarde, ajuste, recommence", text: "Compare le prévu au réel, repère tes meilleures habitudes et adapte la semaine suivante sans culpabiliser.", app: "Stats · Historique · Classements", link: "Comprendre ses statistiques" },
    ],

    extraGuides: [
      { title: "Quelle application pour étudier ?", text: "Les critères utiles pour choisir un système que tu ouvriras vraiment chaque jour." },
      { title: "Comment réussir son blocus ?", text: "Une méthode concrète pour organiser le travail, les pauses et les examens." },
    ],

    faqSection: {
      title: "Questions fréquentes",
      text: "Ce que tu peux tester sans compte, ce qui est enregistré et la manière dont chaque espace t'aide à étudier.",
      boxTitle: "Le plus simple pour te faire une idée ?",
      boxText: "Lance une session découverte. Aucun compte n'est demandé avant de démarrer le chrono.",
      boxLink: "Essayer maintenant",
    },

    cta: {
      title: "Lance ta première session maintenant.",
      text: "Aucune inscription pour essayer. Ton espace se crée quand tu veux garder tes stats et ta progression.",
      tryTimer: "Essayer le chrono",
      createSpace: "Créer mon espace",
    },

    footer: {
      tagline: "Reste calme, étudie régulièrement. L'app d'étude gratuite pour les périodes de blocus et d'examens.",
      productAria: "Produit", resourcesAria: "Ressources",
      productHead: "Produit", resourcesHead: "Ressources",
      productLinks: [["/dashboard", "Essayer le chrono"], ["/signup", "Créer mon espace"], ["/login", "Se connecter"]],
      resourceLinks: [["/pomodoro", "Méthode Pomodoro"], ["/blocus-belgique", "Blocus Belgique"], ["/legal", "Confidentialité"]],
      credit: "Créé par Mathias Dock",
    },
  },

  en: {
    nav: { features: "Features", discover: "Explore the app", faq: "FAQ", login: "Sign in", signup: "Create my space" },
    navSectionsAria: "Page sections",
    navMainAria: "Main navigation",

    hero: {
      badge: "Study app for students",
      titleBefore: "The timer that makes your exam prep ",
      titleAccent: "clearer.",
      subtitle: "Time your sessions, plan your exams, track your progress. Solo or with friends, for free.",
      tryTimer: "Try the timer",
      createSpace: "Create my space",
      desktopAlt: "The Blocus Tracker timer on desktop: session ready to start, today's goals and courses",
      mobileAlt: "The Blocus Tracker timer on a phone",
      chipChrono: "Session running",
    },

    statLabels: ["students signed up", "school communities", "countries represented", "free, no card"],

    focus: {
      title: "A focus mode that shuts out everything else.",
      text: "Full screen, one subject, and focus blocks that fill up as your session goes. The timer keeps running even if you switch tabs.",
      list: ["25-minute blocks or an open session", "Visible pause, resume in one tap", "Your session saves to your stats"],
      alt: "Blocus Tracker's full-screen focus mode",
    },

    planning: {
      title: "Know exactly what to review today.",
      text: "Daily goals, your exams with a countdown, and a \"to prep this week\" card that thinks for you.",
      list: ["Daily goals, checked off in one tap", "Exams with a D-7, D-3, tomorrow badge", "Export to Apple or Google Calendar"],
      alt: "Blocus Tracker's revision planner: month view, daily goals and upcoming exams",
    },

    statsSection: {
      title: "Your progress, in black and white.",
      text: "Study time, streaks, records and a leaderboard with friends. Enough to stay motivated without kidding yourself.",
      link: "See the timer in action",
      alt: "Blocus Tracker's study stats: time, streaks and progress",
      overlayAlt: "The friends leaderboard",
    },

    social: {
      title: "Exam season is better together.",
      text: "Private messages, study groups and a community for your school. Compare your week with friends and keep each other consistent.",
      captions: ["Friends, messages and study groups", "Chat, questions and exams by school"],
      socialAlt: "Blocus Tracker's Social space: friends, messages and groups",
      communautesAlt: "Blocus Tracker's school communities",
      marquee: (u, c) => `${u} communities, ${c} countries`,
    },

    tour: {
      eyebrow: "Guided tour",
      title: "All your revision, in one place.",
      text: "Each page has a clear role. Explore them here, then try the timer without an account. Your account is for keeping everything you build.",
      cta: "Create an account to keep my progress",
      tablistAria: "Blocus Tracker spaces",
      tryTimer: "Try the timer",
      unlockAll: "Unlock everything",
      footnote: "Available on desktop and mobile. Installable on your home screen, no App Store.",
    },

    areas: {
      chrono: {
        label: "Timer", title: "Timer and Focus mode",
        description: "Start an open or Pomodoro session, pick your subject and build your focus block after block without looking away.",
        mascot: "Start here: pick a course, start the timer and I'll build each block with you.",
        alt: "Blocus Tracker's timer and Blocus Blocks",
        features: ["Open or Pomodoro session", "Full-screen Focus mode", "Pause, goal and live time"],
      },
      planning: {
        label: "Planning", title: "Planning and exams",
        description: "Put your goals on the right days, keep your exams visible and start a session straight from what you planned.",
        mascot: "Here we turn stress into next actions: today, this week, then the exam.",
        alt: "The revision planner, goals and exams",
        features: ["Daily goals", "Exams with a countdown", "Calendar export"],
      },
      stats: {
        label: "Stats", title: "Stats and history",
        description: "Find your study time, consistency, best time slots and every past session so you can adjust based on facts.",
        mascot: "No need to study at random: I help you see when you're really moving forward and where to adjust.",
        alt: "Study stats and history",
        features: ["Time per subject", "Streaks, records and consistency", "Session history"],
      },
      progression: {
        label: "Progress", title: "Profile, XP and badges",
        description: "Every session feeds a readable progression: level, streak, daily missions and badges give you a rhythm without turning study into a noisy game.",
        mascot: "I react to your streak, and your profile keeps track of everything you've built.",
        alt: "The profile, missions, XP and badges",
        features: ["Levels and XP", "Streak of study days", "Missions and badges"],
      },
      social: {
        label: "Social", title: "Feed, friends and groups",
        description: "Follow your friends' efforts, find your private chats and organize a study group without mixing up your whole social life.",
        mascot: "A good group doesn't replace the work: it just makes it easier to come back tomorrow.",
        alt: "The feed, friends, private messages and study groups",
        features: ["Light activity feed", "Friends and private messages", "Study groups"],
      },
      communautes: {
        label: "Communities", title: "School communities",
        description: "Find the students from your school in a structured space for discussions, questions, resources and exams.",
        mascot: "Pick your school: the questions, resources and useful dates all stay in one place.",
        alt: "The discussions, questions, resources and exams of a school community",
        features: ["Student chat", "Questions and resources", "Community exams"],
      },
    },

    method: {
      eyebrow: "The Blocus Tracker method",
      title: "Studying better is a simple loop.",
      text: "The app doesn't ask you to be motivated all the time. It helps you decide, focus, measure, then adjust what's next.",
    },

    studyFlow: [
      { title: "Decide what to review", text: "Place your exams, break the material into realistic goals and keep only what matters today.", app: "Planning · Goals · Exams", link: "Build a realistic plan" },
      { title: "Protect a real block", text: "Pick an open or Pomodoro session, cut the distractions and move block after block on a single subject.", app: "Timer · Pomodoro · Focus mode", link: "Use Pomodoro effectively" },
      { title: "Turn effort into progress", text: "Check off your goals, keep your streak alive and let XP make the consistency you're building visible.", app: "Missions · Streak · XP · Badges", link: "Set better goals" },
      { title: "Look, adjust, repeat", text: "Compare planned vs. actual, spot your best habits and adapt the next week without guilt.", app: "Stats · History · Leaderboards", link: "Understand your stats" },
    ],

    extraGuides: [
      { title: "Which app to study with?", text: "The useful criteria for choosing a system you'll actually open every day." },
      { title: "How to nail your exam prep?", text: "A concrete method to organize work, breaks and exams." },
    ],

    faqSection: {
      title: "Frequently asked questions",
      text: "What you can try without an account, what's saved, and how each space helps you study.",
      boxTitle: "The easiest way to get a feel for it?",
      boxText: "Start a discovery session. No account needed before you start the timer.",
      boxLink: "Try it now",
    },

    cta: {
      title: "Start your first session now.",
      text: "No sign-up to try. Your space is created whenever you want to keep your stats and progress.",
      tryTimer: "Try the timer",
      createSpace: "Create my space",
    },

    footer: {
      tagline: "Stay calm, study regularly. The free study app for intensive study and exam periods.",
      productAria: "Product", resourcesAria: "Resources",
      productHead: "Product", resourcesHead: "Resources",
      productLinks: [["/dashboard", "Try the timer"], ["/signup", "Create my space"], ["/login", "Sign in"]],
      resourceLinks: [["/pomodoro", "Pomodoro method"], ["/blocus-belgique", "Exam prep in Belgium"], ["/legal", "Privacy"]],
      credit: "Created by Mathias Dock",
    },
  },
};

export function getLandingContent(lang) {
  return CONTENT[lang === "en" ? "en" : "fr"];
}
