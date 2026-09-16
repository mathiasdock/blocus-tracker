---
version: 1
slug: "pages-dashboard-js"
primary_target: "pages/dashboard.js"
related_targets: ["components/StudyBlocks.js","lib/studyBlocks.mjs","components/TodayProgressCard.js","components/TodaySessionsCard.js","components/DailyProgressCard.js","components/DashboardCoursesCard.js","components/BlocusCard.js","components/CourseChecklistModal.jsx","components/FocusShaderBackground.js"]
---

## Scope and visitor mode

La route `/dashboard` est une surface **Operate** mobile-first. Elle sert à lancer, suivre et corriger le travail d'étude du jour.

Cette surface emploie le vert historique `#14B885` comme Primary pour ses grands CTA, avec un foreground ink sombre afin de conserver le contraste. Le vert forêt reste réservé à la carte forte « Progression du jour » ; les surfaces mint relient le Timer, les Missions et la Période d'étude sans colorer chaque carte différemment.

## Audience, job and task

L'étudiant doit pouvoir choisir un cours et démarrer en quelques secondes, puis comprendre sa progression sans quitter la page. Les actions principales sont Démarrer, Pause et Terminer ; Focus et Pomodoro restent immédiatement accessibles.

## Content and constraints

Préserver les sessions, objectifs, missions, XP, série, cours, checklist et période de blocus. Respecter le mode invité, Supabase, les thèmes clair/sombre, le bilingue et des cibles tactiles de 44 px. Aucune donnée de démonstration ne doit apparaître comme réelle.

## Chosen direction and memorable moment

Le chrono est le centre de gravité. Sur mobile, l'ordre est Chrono → Missions → Progression du jour → Sessions → À faire → Cours → Période d'étude. Sur desktop, Chrono/Sessions/À faire occupent la colonne principale, Missions/Progression la colonne de synthèse, puis Cours/Période d'étude ferment la page. La carte sombre « Progression du jour » est le moment de marque ; les Blocus Blocks rendent l'effort concret par unités de temps réellement mesuré.

**Les unités de temps étudié (`lib/studyBlocks.mjs`).** Une unité représente une DURÉE, jamais un état d'objectif : sa surface remplie est la fraction réellement mesurée, et un objectif atteint ne remplit pas les unités qu'il n'a pas payées — 25 min d'objectif valent une unité pleine plus deux tiers, pas deux unités. Le Chrono, le mode Focus et la progression du jour partagent la même échelle : quarts d'heure groupés par heure jusqu'à huit unités, puis heures jusqu'à douze, puis tranches de deux heures. Une journée de six heures donne six groupes d'une heure. La compression ne change ni la donnée stockée, ni l'éligibilité aux récompenses ; l'unité en cours est écrite en toutes lettres à côté de la piste. Cinq signes structurels distinguent les quantités, aucun n'étant une couleur seule : le cadre creusé dit la capacité prévue, le remplissage le temps gagné, un trait la frontière exacte de l'objectif quand elle tombe au milieu d'une unité, un écart la limite du prévu, un anneau neutre l'endroit où la session s'est arrêtée. Il n'y a plus de « +N », qui désignait tantôt des blocs étudiés cachés, tantôt des blocs d'objectif cachés. Sans objectif, aucune capacité vide n'est dessinée. La pause Pomodoro n'emprunte pas ce langage : c'est une piste continue et neutre qui se vide.

**Session en cours et journée.** Le chrono porte la session, la carte du jour porte la journée : temps enregistré + session en cours, avec la part en cours nommée. Un crédit local couvre l'aller-retour d'enregistrement, indexé sur l'identifiant de la session, donc le total ne redescend jamais et rien n'est compté deux fois. La pause Pomodoro n'alimente pas ce total.

**La pause est un état ordinaire.** Elle se dit par un libellé sobre « En pause · mm:ss », des chiffres assourdis, l'extinction du lavis vert de la carte (et le refroidissement du champ en plein écran) et l'anneau d'arrêt sur l'unité en cours. Pas de fond rouge, pas de bordure d'alerte, pas de battement à 1 Hz : le vocabulaire du danger reste réservé aux erreurs.

## Mascot frequency

La mascotte ne réagit plus au quart d'heure — une journée de huit heures produisait trente-deux apparitions. L'accumulation ordinaire est portée par les unités elles-mêmes, plus un retour haptique bref toutes les vingt-cinq minutes. Restent les heures pleines, l'objectif de session, l'objectif du jour, la plus longue session et le record du jour : des événements déjà existants, aucun critère nouveau.

## Unresolved decisions

Les objectifs horaires historiques ne sont plus exposés sur cette surface et les nouvelles périodes n'en demandent plus. La carte Missions n'apparaît pas en mode invité car les niveaux et missions sont liés au compte. La carte « À faire » reste dans le flux afin de préserver l'accès direct aux tâches du jour, même si elle est secondaire par rapport aux six étapes principales demandées. L'ordre des cartes n'a pas été modifié : il est validé par l'utilisateur et consigné ici comme dans PRODUCT.md. La compétition entre gamification et travail a été traitée à l'intérieur de la carte du chrono — le Défi du jour passe SOUS le sélecteur de cours et disparaît dès qu'une session existe. Le défi apparaît encore à la fois dans cette bande et dans la liste des objectifs tant que la session n'a pas démarré : c'est une redondance connue, laissée en l'état parce que la liste du jour doit rester complète.
