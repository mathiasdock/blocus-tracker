---
version: 1
slug: "pages-dashboard-js"
primary_target: "pages/dashboard.js"
related_targets: ["components/TodayProgressCard.js","components/TodaySessionsCard.js","components/DailyProgressCard.js","components/DashboardCoursesCard.js","components/BlocusCard.js","components/CourseChecklistModal.jsx"]
---

## Scope and visitor mode

La route `/dashboard` est une surface **Operate** mobile-first. Elle sert à lancer, suivre et corriger le travail d'étude du jour.

Cette surface emploie le vert historique `#14B885` comme Primary pour ses grands CTA, avec un foreground ink sombre afin de conserver le contraste. Le vert forêt reste réservé à la carte forte « Progression du jour » ; les surfaces mint relient le Timer, les Missions et la Période d'étude sans colorer chaque carte différemment.

## Audience, job and task

L'étudiant doit pouvoir choisir un cours et démarrer en quelques secondes, puis comprendre sa progression sans quitter la page. Les actions principales sont Démarrer, Pause et Terminer ; Focus et Pomodoro restent immédiatement accessibles.

## Content and constraints

Préserver les sessions, objectifs, missions, XP, série, cours, checklist et période de blocus. Respecter le mode invité, Supabase, les thèmes clair/sombre, le bilingue et des cibles tactiles de 44 px. Aucune donnée de démonstration ne doit apparaître comme réelle.

## Chosen direction and memorable moment

Le chrono est le centre de gravité. Sur mobile, l'ordre est Chrono → Missions → Progression du jour → Sessions → À faire → Cours → Période d'étude. Sur desktop, Chrono/Sessions/À faire occupent la colonne principale, Missions/Progression la colonne de synthèse, puis Cours/Période d'étude ferment la page. La carte sombre « Progression du jour » est le moment de marque ; les Blocus Blocks rendent l'effort concret par unités de 15 minutes regroupées visuellement par heure.

## Unresolved decisions

Les objectifs horaires historiques ne sont plus exposés sur cette surface et les nouvelles périodes n'en demandent plus. La carte Missions n'apparaît pas en mode invité car les niveaux et missions sont liés au compte. La carte « À faire » reste dans le flux afin de préserver l'accès direct aux tâches du jour, même si elle est secondaire par rapport aux six étapes principales demandées.
