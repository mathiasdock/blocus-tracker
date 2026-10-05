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

**La pause est un état d'ATTENTION, et elle est volontairement forte.** Raison produit, pas préférence visuelle : les étudiants mettent en pause, se laissent distraire et oublient de relancer ; leur travail cesse d'être compté sans qu'ils le sachent. Un regard de retour sur l'écran doit suffire. Carte teintée `--bt-pause-bg` avec bordure et halo d'attention, lavis vert éteint, chiffres en `--bt-pause`, pastille blanche sur `--bt-pause-strong` portant la durée écoulée et respirant, anneau rouge sur l'unité en cours (le remplissage acquis, lui, garde sa couleur), et en plein écran le champ rouge plus une respiration périphérique. Ce n'est PAS une sémantique d'erreur : `--bt-pause*` est une famille distincte de `--bt-danger*`, réservée au chrono, et la copie ne réprimande jamais. Voir DESIGN.md § The Paused-Timer Exception — un état de pause discret a été essayé le 2026-09-15 et annulé le jour même pour cette raison.

**Statuts compacts de la progression.** Le stock de gels et la série restent des faits secondaires dans l'en-tête de la carte, pas deux CTA ni deux badges de récompense. Ils partagent le même dessin au trait et la même typographie numérique, sans capsule, fond ou contour individuel. Seuls les petits glyphes portent leur couleur sémantique (protection glacée, série chaude) ; les valeurs restent en encre claire et un simple filet sépare les deux faits.

**Sécurité du mouvement.** L'ancien battement plein écran à 1 Hz (opacité 0,14 → 1,0, attaque sèche) est remplacé par des respirations lentes (2,4–2,6 s), sans attaque, d'amplitude réduite, et la vignette du mode Focus garde son centre transparent pour que le chrono ne clignote jamais. Sous `prefers-reduced-motion`, chaque respiration devient sa version POSÉE à pleine force : l'avertissement n'est jamais retiré, le problème de comportement ne disparaissant pas pour ces personnes.

**Listes du Chrono.** « Mes cours » et « Sessions du jour » séparent leurs rangées par l'espace, sans traits horizontaux ; les repères de cours, titres, heures et actions restent inchangés. La liste de l'Historique conserve ses séparateurs, utiles entre journées et sessions plus nombreuses.

## Mascot frequency

La mascotte ne réagit plus au quart d'heure — une journée de huit heures produisait trente-deux apparitions. L'accumulation ordinaire est portée par les unités elles-mêmes, plus un retour haptique bref toutes les vingt-cinq minutes. Restent les heures pleines, l'objectif de session, l'objectif du jour, la plus longue session et le record du jour : des événements déjà existants, aucun critère nouveau.

Les réactions à ces jalons s'affichent désormais hors du flux, sous forme de coach (DESIGN.md, event coach) ancré aux Study Blocks dans le Chrono et Focus ; la carte ne réserve plus une ligne de mascotte. Téléphone : le personnage se tient à droite des chiffres, debout sur la ligne des légendes des blocs, sa bulle compacte (13,5 px) se pose sur ces légendes, qui s'effacent sur place le temps du message (`data-coach-under`, tant que le coach est réellement affiché ; la ligne d'état sous les blocs fait de même) : jamais les chiffres ni les blocs, rien ne bouge, rien ne dépasse à moitié de la bulle. Ordinateur : à moitié hors du bord droit de la carte, au niveau des blocs, la bulle dans la colonne vide au-dessus. Focus : au-dessus de la session sur téléphone, à côté des blocs sur ordinateur. Missions : sur téléphone, sur le coin haut-gauche de la carte Objectifs (le titre s'efface sur place pendant que le coach parle, décision de Mathias du 2026-09-30), la bulle s'arrête avant le compteur ; sur ordinateur, penché hors du bord gauche de la carte au niveau des défis de la semaine. Dans le sélecteur de cours, le prochain examen est une seconde ligne compacte avec glyphe calendrier, non une capsule indépendante. Le délai emploie un statut propre au Chrono : vert calme au-delà de sept jours, ambre à J-7…J-2, corail dès J-1. Les compteurs passifs ne reçoivent pas automatiquement une pilule colorée. Le corail urgent est un signal d'échéance, distinct des familles pause, examen du Planning et erreur.

## Unresolved decisions

**Mouvement ciblé (2026-10-05).** Les secondes du chrono ne glissent plus à chaque tick ; le changement des minutes reste perceptible. Après création réussie, seule la nouvelle ligne de cours entre brièvement, jamais la liste entière au chargement. Le fond Focus a été mesuré sur 180 images (resize ≈ 0,036 ms/image ; dessin CPU ≈ 0,101 ms/image) puis laissé inchangé ; aucun mouvement décoratif supplémentaire. La pause forte reste protégée.

Les objectifs horaires historiques ne sont plus exposés sur cette surface et les nouvelles périodes n'en demandent plus. La carte Missions n'apparaît pas en mode invité car les niveaux et missions sont liés au compte. La carte « À faire » reste dans le flux afin de préserver l'accès direct aux tâches du jour, même si elle est secondaire par rapport aux six étapes principales demandées. L'ordre des cartes n'a pas été modifié : il est validé par l'utilisateur et consigné ici comme dans PRODUCT.md. La compétition entre gamification et travail a été traitée à l'intérieur de la carte du chrono — le Défi du jour passe SOUS le sélecteur de cours et disparaît dès qu'une session existe. Le défi apparaît encore à la fois dans cette bande et dans la liste des objectifs tant que la session n'a pas démarré : c'est une redondance connue, laissée en l'état parce que la liste du jour doit rester complète.
