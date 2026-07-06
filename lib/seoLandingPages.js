export const SEO_LANDING_PAGES = {
  "/pomodoro": {
    path: "/pomodoro",
    title: "Méthode Pomodoro pour réviser | Timer étudiant gratuit",
    description:
      "Comprends la méthode Pomodoro, adapte-la à tes révisions et lance un timer d'étude clair avec Blocus Tracker.",
    changefreq: "weekly",
    priority: "0.86",
    eyebrow: "Méthode de concentration",
    h1: "Méthode Pomodoro : réviser sans s'épuiser",
    lead:
      "La méthode Pomodoro transforme une grosse journée de révision en blocs courts, mesurables et moins intimidants. Blocus Tracker t'aide à lancer ces blocs, à garder le rythme et à voir ce que tu as réellement étudié.",
    shortAnswer:
      "La méthode Pomodoro consiste à travailler sur une seule tâche pendant 25 minutes, puis à prendre une pause courte. Pour les étudiants, elle fonctionne surtout quand chaque session a un objectif précis : exercices, fiche, chapitre, annales ou relecture active.",
    ctaLabel: "Essayer le chrono Pomodoro",
    secondaryCtaLabel: "Préparer mon planning",
    secondaryCtaHref: "/planning-revision",
    proofPoints: [
      "Timer Pomodoro et chrono libre",
      "Sessions sauvegardées avec un compte",
      "Stats et séries pour rester régulier",
    ],
    sections: [
      {
        title: "Pourquoi Pomodoro marche bien pour les révisions",
        body: [
          "Réviser demande rarement une seule compétence. Il faut commencer, rester concentré, faire des pauses et reprendre sans perdre le fil. Pomodoro aide parce qu'il réduit la prochaine action à une période courte : tu ne te demandes plus comment finir tout le cours, tu choisis simplement ce que tu fais pendant le prochain bloc.",
          "Le format classique 25/5 est un bon point de départ, mais il n'est pas obligatoire. Certains étudiants préfèrent 45 minutes quand ils font des exercices longs, ou 50 minutes quand ils préparent un examen universitaire. Le bon rythme est celui que tu peux répéter plusieurs jours sans te cramer.",
        ],
        bullets: [
          "Choisis une tâche concrète avant de lancer le timer.",
          "Coupe les distractions pendant le bloc.",
          "Note rapidement ce qui reste à faire à la fin.",
          "Garde les pauses comme de vraies pauses, pas comme une mini-session de scroll.",
        ],
      },
      {
        title: "Comment l'utiliser pendant un blocus ou une session d'examens",
        body: [
          "Pendant une période intensive, la méthode devient plus utile quand elle est reliée à un planning. Tu peux prévoir les matières prioritaires le matin, garder les tâches plus mécaniques l'après-midi et utiliser les Pomodoros comme unités de progression.",
          "Au lieu de compter seulement le nombre de pages lues, mesure aussi le temps réellement concentré. C'est souvent cette donnée qui montre si ton planning est réaliste ou si une matière prend deux fois plus de temps que prévu.",
        ],
        bullets: [
          "Un bloc pour comprendre, un bloc pour s'entraîner, un bloc pour vérifier.",
          "Deux matières différentes dans la journée pour éviter la saturation.",
          "Une pause longue après plusieurs blocs, surtout avant de changer de cours.",
        ],
      },
      {
        title: "Ce que Blocus Tracker ajoute à un simple minuteur",
        body: [
          "Un minuteur classique t'aide à commencer. Blocus Tracker ajoute la mémoire de ton travail : durée, matière, progression, objectifs, séries et statistiques. C'est ce qui rend la méthode plus motivante sur plusieurs semaines.",
          "Tu peux tester le chrono sans compte. Si tu veux conserver ton historique, retrouver tes records et suivre tes objectifs, un compte te permet de transformer tes sessions en vraie progression.",
        ],
      },
    ],
    featurePanel: {
      title: "Pomodoro dans Blocus Tracker",
      items: [
        "Choisis un mode Pomodoro ou une session libre.",
        "Associe tes sessions à tes cours.",
        "Suis ton temps d'étude, tes records et tes séries.",
        "Passe d'un timer isolé à une routine complète de révision.",
      ],
    },
    related: [
      { href: "/planning-revision", label: "Construire un planning de révision", text: "Relie tes blocs Pomodoro à un vrai calendrier d'examens." },
      { href: "/stats-etude", label: "Suivre ses statistiques d'étude", text: "Vérifie si tes sessions deviennent régulières." },
      { href: "/objectifs-etude", label: "Fixer des objectifs d'étude", text: "Transforme tes sessions en objectifs mesurables." },
    ],
    faq: [
      {
        q: "Quelle est la durée idéale d'un Pomodoro pour réviser ?",
        a: "Commence avec 25 minutes de travail et 5 minutes de pause. Si tu fais des exercices longs ou des annales, tu peux passer à 45 ou 50 minutes tant que la concentration reste bonne.",
      },
      {
        q: "Pomodoro est-il adapté aux examens universitaires ?",
        a: "Oui, surtout pour découper un gros syllabus en tâches concrètes. La méthode devient plus efficace quand tu prépares la tâche avant de lancer le timer.",
      },
      {
        q: "Faut-il toujours faire une pause après chaque session ?",
        a: "Oui. La pause évite de transformer la méthode en simple marathon. Même courte, elle aide à revenir plus proprement sur le bloc suivant.",
      },
    ],
  },

  "/planning-revision": {
    path: "/planning-revision",
    title: "Planning de révision efficace | Méthode et outil étudiant",
    description:
      "Apprends à créer un planning de révision réaliste pour tes examens, avec priorités, objectifs, pauses et suivi dans Blocus Tracker.",
    changefreq: "weekly",
    priority: "0.9",
    eyebrow: "Organisation des révisions",
    h1: "Créer un planning de révision qui tient vraiment",
    lead:
      "Un bon planning de révision ne sert pas à remplir toutes tes journées. Il sert à savoir quoi faire, quand le faire, et comment ajuster sans paniquer quand une matière prend plus de temps que prévu.",
    shortAnswer:
      "Pour organiser tes révisions, commence par lister les examens, le volume de chaque cours, tes contraintes et les matières prioritaires. Planifie ensuite des blocs réalistes, avec des pauses et une marge d'ajustement.",
    ctaLabel: "Créer mon planning dans l'app",
    secondaryCtaLabel: "Utiliser Pomodoro",
    secondaryCtaHref: "/pomodoro",
    proofPoints: [
      "Objectifs et examens au même endroit",
      "Export calendrier possible",
      "Temps réel comparé au planning",
    ],
    sections: [
      {
        title: "La méthode simple en 5 étapes",
        body: [
          "Le piège classique est de commencer par dessiner une semaine parfaite. Le bon ordre est inverse : d'abord les examens, ensuite le volume, puis les blocs. Ton planning doit refléter la difficulté réelle des cours, pas seulement ton envie d'être productif.",
        ],
        bullets: [
          "Note toutes les dates d'examen et les échéances.",
          "Estime le volume de chaque cours : chapitres, exercices, annales, fiches.",
          "Classe les matières par priorité et niveau de difficulté.",
          "Réserve les meilleurs créneaux aux tâches qui demandent le plus d'énergie.",
          "Garde une marge de sécurité pour les imprévus.",
        ],
      },
      {
        title: "Pourquoi ton planning doit rester mesurable",
        body: [
          "Un planning vague comme « réviser droit » ne te dit pas si tu avances. Un planning utile contient des actions observables : refaire 20 questions, relire un chapitre, corriger une annale, terminer une fiche ou expliquer un concept sans regarder le cours.",
          "Mesurer ton temps ne remplace pas la qualité du travail, mais cela révèle vite les écarts. Si tu pensais finir un chapitre en 1 heure et qu'il en prend 3, tu peux rééquilibrer avant la veille de l'examen.",
        ],
      },
      {
        title: "Comment Blocus Tracker aide à ajuster",
        body: [
          "Dans Blocus Tracker, le planning n'est pas séparé du chrono. Tu peux prévoir tes objectifs, lancer tes sessions, puis comparer ce que tu avais imaginé avec le temps réellement étudié.",
          "Cette boucle est précieuse : planifier, étudier, mesurer, ajuster. C'est elle qui transforme une organisation fragile en système de révision durable.",
        ],
      },
    ],
    featurePanel: {
      title: "Planning dans Blocus Tracker",
      items: [
        "Ajoute tes examens, objectifs et échéances.",
        "Relie tes sessions aux matières que tu travailles.",
        "Visualise ce qui avance et ce qui prend du retard.",
        "Exporte ton planning vers ton calendrier quand tu en as besoin.",
      ],
    },
    related: [
      { href: "/stats-etude", label: "Analyser son temps d'étude", text: "Mesure l'écart entre le planning prévu et le travail réel." },
      { href: "/objectifs-etude", label: "Fixer de bons objectifs", text: "Transforme ton planning en actions concrètes." },
      { href: "/blocus-belgique", label: "Préparer un blocus en Belgique", text: "Adapte ton planning aux périodes intensives d'examens." },
    ],
    faq: [
      {
        q: "Combien de temps avant les examens faut-il faire son planning ?",
        a: "Le plus tôt possible, idéalement dès que les dates sont connues. Même un planning imparfait trois semaines avant vaut mieux qu'un planning parfait la veille.",
      },
      {
        q: "Faut-il planifier chaque heure de la journée ?",
        a: "Non. Planifie surtout les blocs importants, les pauses et les marges. Un planning trop serré casse dès le premier imprévu.",
      },
      {
        q: "Comment savoir si mon planning est réaliste ?",
        a: "Chronomètre quelques sessions par matière. Si le temps réel dépasse toujours ton estimation, réduis le nombre de tâches ou ajoute des créneaux.",
      },
    ],
  },

  "/stats-etude": {
    path: "/stats-etude",
    title: "Statistiques d'étude | Suivre son temps de révision",
    description:
      "Découvre quelles statistiques suivre pour réviser plus régulièrement : temps d'étude, séries, records, objectifs et progression.",
    changefreq: "weekly",
    priority: "0.78",
    eyebrow: "Suivi du temps d'étude",
    h1: "Les statistiques d'étude qui aident vraiment",
    lead:
      "Les bonnes statistiques ne servent pas à se juger. Elles servent à comprendre ton rythme, repérer ce qui marche et rendre tes révisions moins floues.",
    shortAnswer:
      "Les statistiques les plus utiles pour un étudiant sont le temps d'étude réel, les jours actifs, la régularité, la répartition par matière, les objectifs atteints et les records personnels. Elles doivent aider à ajuster, pas à culpabiliser.",
    ctaLabel: "Voir mes stats d'étude",
    secondaryCtaLabel: "Définir mes objectifs",
    secondaryCtaHref: "/objectifs-etude",
    proofPoints: [
      "Temps total et sessions par matière",
      "Séries, records, badges et XP",
      "Lecture claire sans tableau compliqué",
    ],
    sections: [
      {
        title: "Quelles données suivre pendant les révisions",
        body: [
          "Le nombre d'heures seul ne suffit pas. Deux heures concentrées sur des exercices valent souvent mieux que quatre heures passives à relire. Mais sans mesure, il est difficile de savoir si tu es régulier ou si tu avances seulement par pics de stress.",
        ],
        bullets: [
          "Temps d'étude réel par jour et par semaine.",
          "Répartition par cours ou matière.",
          "Jours actifs et série de régularité.",
          "Objectifs atteints ou manqués.",
          "Records personnels pour garder une motivation saine.",
        ],
      },
      {
        title: "Utiliser les stats sans tomber dans la pression",
        body: [
          "Une statistique utile doit déclencher une décision simple : continuer, alléger, déplacer, prioriser ou faire une pause. Si une donnée te pousse seulement à culpabiliser, elle est mal utilisée.",
          "Blocus Tracker met l'accent sur les tendances lisibles : progression récente, objectifs, heatmap, séries et matières les plus travaillées. Le but est de rendre ton effort visible, pas de transformer tes études en compétition permanente.",
        ],
      },
      {
        title: "Pourquoi les stats rendent une app d'étude plus durable",
        body: [
          "La motivation baisse quand tu ne vois pas ce que tu as déjà fait. Les statistiques donnent une trace concrète : une semaine active, un record battu, une série qui tient, une matière enfin reprise.",
          "C'est particulièrement utile pendant les longues sessions d'examens, où les journées se ressemblent et où le cerveau retient surtout ce qui reste à faire.",
        ],
      },
    ],
    featurePanel: {
      title: "Stats dans Blocus Tracker",
      items: [
        "Visualise tes heures et tes jours actifs.",
        "Compare tes matières sans perdre le détail.",
        "Suis tes séries, records, badges et niveaux.",
        "Repère les périodes où tu travailles le mieux.",
      ],
    },
    related: [
      { href: "/planning-revision", label: "Faire un planning de révision", text: "Utilise tes stats pour prévoir plus justement." },
      { href: "/objectifs-etude", label: "Créer des objectifs d'étude", text: "Transforme les données en prochaines actions." },
      { href: "/application-etudiant", label: "Choisir une application pour étudier", text: "Compare les outils utiles pour un étudiant." },
    ],
    faq: [
      {
        q: "Pourquoi suivre son temps d'étude ?",
        a: "Parce que le ressenti est souvent trompeur. Le suivi montre si tu es régulier, quelles matières prennent du temps et où ajuster ton planning.",
      },
      {
        q: "Est-ce grave d'étudier moins d'heures que prévu ?",
        a: "Pas forcément. Ce qui compte est la qualité du travail et la régularité. Les stats servent à corriger le plan, pas à se punir.",
      },
      {
        q: "Les statistiques sont-elles privées ?",
        a: "Oui. Dans Blocus Tracker, tes statistiques personnelles sont liées à ton compte et ne sont pas des pages publiques indexées.",
      },
    ],
  },

  "/objectifs-etude": {
    path: "/objectifs-etude",
    title: "Objectifs d'étude | Fixer des objectifs de révision réalistes",
    description:
      "Méthode simple pour fixer des objectifs d'étude motivants, mesurables et adaptés aux examens avec Blocus Tracker.",
    changefreq: "weekly",
    priority: "0.76",
    eyebrow: "Motivation et progression",
    h1: "Fixer des objectifs d'étude que tu peux vraiment tenir",
    lead:
      "La motivation ne tient pas longtemps quand l'objectif est flou. Un bon objectif d'étude te dit quoi faire, pourquoi maintenant, et comment savoir que c'est terminé.",
    shortAnswer:
      "Un bon objectif d'étude est précis, mesurable et lié à une matière ou un examen. Il vaut mieux viser une action claire, comme finir 15 exercices, que promettre vaguement de travailler toute la journée.",
    ctaLabel: "Créer mes objectifs",
    secondaryCtaLabel: "Voir la méthode Pomodoro",
    secondaryCtaHref: "/pomodoro",
    proofPoints: [
      "Objectifs quotidiens et hebdomadaires",
      "Progression visible dans les stats",
      "Motivation par séries, XP et badges",
    ],
    sections: [
      {
        title: "La différence entre intention et objectif",
        body: [
          "« Je dois réviser » est une intention. « Faire deux Pomodoros d'exercices sur le chapitre 4 » est un objectif. Le premier met de la pression, le second donne une prochaine action.",
          "Pendant les révisions, cette précision fait gagner beaucoup d'énergie mentale. Tu n'as pas besoin de renégocier ton programme à chaque fois que tu t'assieds.",
        ],
        bullets: [
          "Commence par une matière.",
          "Ajoute une action observable.",
          "Ajoute une limite de temps ou de quantité.",
          "Prévois un critère de fin clair.",
        ],
      },
      {
        title: "Quels objectifs choisir selon ton niveau d'énergie",
        body: [
          "Tous les objectifs ne demandent pas le même effort. Quand tu es frais, garde les tâches qui exigent de comprendre ou résoudre. Quand tu es fatigué, choisis plutôt de relire activement, trier des notes ou préparer une fiche.",
          "Cette logique évite le piège du planning héroïque : tu ne peux pas mettre uniquement des tâches difficiles partout. La régularité vient d'un mélange intelligent.",
        ],
      },
      {
        title: "Comment Blocus Tracker rend les objectifs motivants",
        body: [
          "Blocus Tracker relie tes objectifs à tes sessions. Quand tu lances le chrono, tu ne travailles pas dans le vide : tu avances vers une cible visible.",
          "Les objectifs se prolongent dans les statistiques, les séries et les badges. L'app rend les petits progrès visibles, ce qui aide souvent plus qu'une grande promesse de motivation.",
        ],
      },
    ],
    featurePanel: {
      title: "Objectifs dans Blocus Tracker",
      items: [
        "Crée des objectifs par matière ou par échéance.",
        "Associe tes sessions au travail réellement fait.",
        "Suis tes objectifs atteints dans tes statistiques.",
        "Garde une progression motivante sans complexifier ton organisation.",
      ],
    },
    related: [
      { href: "/pomodoro", label: "Travailler par blocs Pomodoro", text: "Utilise le timer pour rendre chaque objectif plus concret." },
      { href: "/stats-etude", label: "Suivre la progression", text: "Vérifie si tes objectifs deviennent une habitude." },
      { href: "/planning-revision", label: "Planifier les révisions", text: "Place tes objectifs dans une semaine réaliste." },
    ],
    faq: [
      {
        q: "Quel objectif d'étude choisir pour commencer ?",
        a: "Choisis un objectif court et vérifiable : un chapitre, une série d'exercices, une fiche ou deux sessions de concentration sur une matière précise.",
      },
      {
        q: "Faut-il viser un nombre d'heures ou un résultat ?",
        a: "Les deux peuvent être utiles. Le résultat donne le sens, le temps donne le cadre. Par exemple : 45 minutes pour corriger une annale.",
      },
      {
        q: "Comment rester motivé quand on rate un objectif ?",
        a: "Réduis l'objectif suivant et reprends vite. La régularité compte plus qu'une journée parfaite.",
      },
    ],
  },

  "/application-etudiant": {
    path: "/application-etudiant",
    title: "Application pour étudier | Chrono, planning et stats étudiant",
    description:
      "Choisis une application pour étudier qui combine timer, planning de révision, statistiques, objectifs et motivation sociale.",
    changefreq: "weekly",
    priority: "0.88",
    eyebrow: "Application d'étude",
    h1: "Une application pour étudier, pas juste une app de plus",
    lead:
      "Une bonne application d'étude doit t'aider à commencer, organiser, mesurer et reprendre. Blocus Tracker rassemble le chrono, le planning, les statistiques et la motivation dans un espace pensé pour les étudiants.",
    shortAnswer:
      "La meilleure application pour étudier est celle qui réduit la friction : un timer simple, un planning clair, des objectifs réalistes et des statistiques lisibles. Elle doit soutenir tes révisions sans devenir une distraction.",
    ctaLabel: "Essayer Blocus Tracker",
    secondaryCtaLabel: "Comparer les fonctionnalités",
    secondaryCtaHref: "/stats-etude",
    proofPoints: [
      "Chrono testable sans compte",
      "Compte utile pour sauvegarder",
      "Pensé pour examens, blocus et partiels",
    ],
    sections: [
      {
        title: "Ce qu'une app d'étude doit vraiment faire",
        body: [
          "Beaucoup d'outils étudiants sont excellents sur une seule partie : flashcards, notes, calendrier, to-do list ou focus. Le problème arrive quand tout est dispersé. Tu planifies dans un endroit, tu chronomètres ailleurs, tu ne vois plus ta progression.",
          "Blocus Tracker se concentre sur le système de révision : lancer une session, savoir pourquoi tu travailles, enregistrer ce temps, puis comprendre ta progression.",
        ],
        bullets: [
          "Un chrono rapide à lancer.",
          "Un planning lié aux examens.",
          "Des objectifs concrets.",
          "Des statistiques simples à lire.",
          "Une motivation durable, sans surcharge.",
        ],
      },
      {
        title: "Pourquoi Blocus Tracker est adapté aux étudiants francophones",
        body: [
          "L'app a été pensée autour des périodes de révision réelles : blocus en Belgique, partiels, examens, semaines intensives et besoin de rester régulier quand la motivation baisse.",
          "Le vocabulaire, les pages publiques et l'expérience produit parlent directement aux étudiants francophones, sans transformer l'app en outil corporate de productivité.",
        ],
      },
      {
        title: "Quand créer un compte devient utile",
        body: [
          "Tu peux découvrir le chrono sans compte. Mais dès que tu veux sauvegarder tes sessions, suivre tes statistiques, garder ton planning, retrouver tes badges ou travailler avec d'autres étudiants, un compte devient le meilleur choix.",
        ],
      },
    ],
    featurePanel: {
      title: "Ce que Blocus Tracker regroupe",
      items: [
        "Timer d'étude et Pomodoro.",
        "Planning de révision et examens.",
        "Statistiques, objectifs, séries et records.",
        "Amis, groupes et communautés étudiantes.",
      ],
    },
    related: [
      { href: "/pomodoro", label: "Timer Pomodoro étudiant", text: "Découvre la méthode de concentration intégrée." },
      { href: "/planning-revision", label: "Planning de révision", text: "Organise les semaines avant tes examens." },
      { href: "/blocus-belgique", label: "Blocus en Belgique", text: "Vois comment l'app s'adapte aux périodes intensives." },
    ],
    faq: [
      {
        q: "Blocus Tracker remplace-t-il Notion ou Google Agenda ?",
        a: "Pas forcément. Blocus Tracker est centré sur l'étude réelle : chrono, objectifs, planning d'examens et stats. Tu peux le compléter avec tes outils de notes ou de calendrier.",
      },
      {
        q: "Peut-on utiliser Blocus Tracker gratuitement ?",
        a: "Oui. Le chrono est testable sans compte. Un compte sert à sauvegarder ton historique, ton planning, tes statistiques et ta progression.",
      },
      {
        q: "L'application est-elle adaptée au mobile ?",
        a: "Oui. Blocus Tracker est une application web responsive et installable comme PWA sur mobile ou ordinateur.",
      },
    ],
  },

  "/blocus-belgique": {
    path: "/blocus-belgique",
    title: "Blocus Belgique | Planning, méthode et application de révision",
    description:
      "Guide pratique pour réussir son blocus en Belgique : planning, rythme d'étude, pauses, objectifs et suivi avec Blocus Tracker.",
    changefreq: "weekly",
    priority: "0.92",
    eyebrow: "Examens en Belgique",
    h1: "Réussir son blocus en Belgique sans partir dans tous les sens",
    lead:
      "Le blocus demande plus qu'une grosse dose de volonté. Il faut un planning réaliste, des sessions mesurables, des pauses assumées et une façon claire de voir ce qui avance.",
    shortAnswer:
      "Pour réussir son blocus, commence par lister les examens et le volume de chaque cours, construis un planning par priorités, alterne les matières, travaille en blocs chronométrés et garde du temps pour dormir, manger et récupérer.",
    ctaLabel: "Préparer mon blocus",
    secondaryCtaLabel: "Créer un planning",
    secondaryCtaHref: "/planning-revision",
    proofPoints: [
      "Pensé pour le vocabulaire du blocus",
      "Planning, chrono et stats réunis",
      "Motivation avec amis et communautés",
    ],
    sections: [
      {
        title: "C'est quoi un bon blocus ?",
        body: [
          "Un bon blocus n'est pas une succession de journées impossibles. C'est une période où tu sais quelles matières sont prioritaires, combien de temps elles prennent, et comment garder assez d'énergie pour arriver aux examens avec un cerveau utilisable.",
          "La Belgique a un vocabulaire très spécifique autour du blocus. Blocus Tracker l'assume : l'app est pensée pour les étudiants qui vivent ces semaines intensives, avec le besoin de chronométrer, planifier et rester motivé.",
        ],
      },
      {
        title: "La structure d'une journée de blocus efficace",
        body: [
          "Une journée de blocus doit alterner travail profond, pauses et tâches plus légères. Les heures les plus fortes doivent aller aux matières difficiles. Les moments de fatigue peuvent servir à relire, classer ou préparer la prochaine session.",
        ],
        bullets: [
          "Commence par une tâche prioritaire, pas par la plus confortable.",
          "Travaille en blocs de 25 à 50 minutes selon la matière.",
          "Prévois une vraie pause longue dans la journée.",
          "Termine par un mini-bilan : temps étudié, matière avancée, prochaine priorité.",
        ],
      },
      {
        title: "Comment éviter le piège du tout ou rien",
        body: [
          "Beaucoup d'étudiants pensent qu'une journée est ratée si elle ne correspond pas au planning idéal. En pratique, le blocus se gagne souvent par ajustements : reprendre après une mauvaise matinée, déplacer une matière, réduire une tâche trop ambitieuse.",
          "Blocus Tracker rend ces ajustements plus simples parce que tu vois le travail réel. Tu ne dépends pas seulement de ton ressenti ou de ton stress du moment.",
        ],
      },
    ],
    featurePanel: {
      title: "Blocus Tracker pendant le blocus",
      items: [
        "Lance rapidement un chrono pour chaque matière.",
        "Garde un planning clair des examens et objectifs.",
        "Vois tes heures, tes séries et tes records.",
        "Reste motivé avec tes amis, groupes et communautés étudiantes.",
      ],
    },
    related: [
      { href: "/planning-revision", label: "Planning de blocus", text: "Construis une semaine réaliste avant les examens." },
      { href: "/pomodoro", label: "Pomodoro pour le blocus", text: "Découpe les grosses journées en blocs tenables." },
      { href: "/stats-etude", label: "Statistiques de révision", text: "Suis ton effort réel sans te fier seulement au ressenti." },
    ],
    faq: [
      {
        q: "Combien d'heures étudier par jour en blocus ?",
        a: "Il n'y a pas de chiffre universel. Beaucoup d'étudiants visent plusieurs blocs concentrés par jour, avec pauses et sommeil. La régularité et la qualité comptent plus qu'un total héroïque.",
      },
      {
        q: "Faut-il alterner les matières pendant le blocus ?",
        a: "Oui, c'est souvent plus durable. Alterner les matières difficiles et plus légères aide à garder de l'énergie et évite de bloquer plusieurs jours sur un seul cours.",
      },
      {
        q: "Blocus Tracker est-il seulement pour la Belgique ?",
        a: "Non. L'app fonctionne pour tous les étudiants francophones, mais la page blocus répond spécifiquement au vocabulaire et aux périodes d'examens belges.",
      },
    ],
  },
};

export const SEO_LANDING_PATHS = Object.keys(SEO_LANDING_PAGES);
