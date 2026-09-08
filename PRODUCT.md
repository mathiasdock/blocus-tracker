# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Blocus Tracker s'adresse d'abord aux étudiants qui préparent leurs cours, examens et périodes de blocus. Ils l'utilisent au quotidien pour commencer à étudier rapidement, garder le cap et comprendre leur progression sans devoir reconstruire leur journée à la main.

## Product Purpose

Blocus Tracker relie le temps réellement étudié à des cours, objectifs, examens, tâches, statistiques, missions et interactions sociales. Le produit réussit lorsque l'étudiant peut lancer une session en quelques secondes, rester concentré, puis retrouver une trace utile et motivante de son travail.

## Positioning

Le produit n'est pas un simple minuteur : chaque session alimente un système étudiant cohérent — cours, planning, progression quotidienne, XP, séries, période de blocus et communauté.

## Operating Context

- Sessions libres ou Pomodoro, souvent lancées depuis un téléphone.
- Utilisation répétée pendant une journée de révision, avec interruptions, pauses et retours dans l'application.
- Cours associés à une couleur, une date d'examen et une checklist.
- Consultation rapide des missions, de l'avancement du jour et des sessions déjà enregistrées.
- Mode invité disponible avec données locales ; les fonctions persistantes complètes utilisent un compte.

## Capabilities and Constraints

- Le Chrono est l'action principale et doit rester le point d'entrée le plus direct.
- Les fonctionnalités existantes de session, Focus, Pomodoro, correction, suppression, objectifs, cours, missions, XP, série et période de blocus doivent être préservées.
- L'interface est bilingue français/anglais, responsive, compatible thème clair/sombre et PWA.
- Les données applicatives sont stockées dans Supabase ; l'expérience doit se dégrader proprement hors ligne ou lorsqu'une migration optionnelle n'est pas disponible.
- Les ressources de police sont auto-hébergées et la CSP ne doit pas être affaiblie.

## Brand Commitments

Le nom Blocus Tracker, la palette verte, les surfaces sombres de marque, la mascotte et le ton direct, encourageant et étudiant sont des éléments identitaires à préserver. Nunito Sans est la police principale et Quicksand reste une police d'accent rare.

## Evidence on Hand

- Interface et comportements existants : `pages/dashboard.js` et composants associés.
- Brief de hiérarchie validé par l'utilisateur : Chrono → Missions → progression du jour → sessions → cours → période de blocus sur mobile ; composition Chrono/Sessions à gauche et Missions/Progression à droite sur desktop.
- Aucune statistique commerciale, aucun témoignage et aucune promesse chiffrée supplémentaire ne doivent être inventés.

## Product Principles

1. Faire démarrer l'étude avant de demander de gérer le système.
2. Montrer d'abord ce qui aide aujourd'hui, puis l'historique et les réglages.
3. Transformer l'effort en progression visible sans distraire du travail.
4. Garder les corrections et actions secondaires accessibles par divulgation progressive.
5. Préserver la continuité et les données, même quand le réseau ou l'installation évolue.

## Accessibility & Inclusion

Les actions principales doivent être utilisables au clavier et au toucher, les cibles tactiles mesurer au moins 44 px, les états ne doivent pas dépendre uniquement de la couleur et les animations doivent respecter `prefers-reduced-motion`.
