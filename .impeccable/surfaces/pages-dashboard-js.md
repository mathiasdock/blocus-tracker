---
version: 1
slug: "pages-dashboard-js"
primary_target: "pages/dashboard.js"
related_targets: ["components/StudyBlocks.js","lib/studyBlocks.mjs","components/TodayProgressCard.js","components/TodaySessionsCard.js","components/DailyProgressCard.js","components/DashboardCoursesCard.js","components/BlocusCard.js","components/CourseChecklistModal.jsx","components/FocusShaderBackground.js","components/timer/ChronoFocus.js","components/focus/FocusEnvironmentControl.js","components/focus/FocusEnvironmentGallery.js","components/focus/FocusMiniTimer.js","components/focus/FocusMiniTimer.module.css"]
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

**Réglages de session (2026-10-13).** Mode, durées, objectif et note restent des pilules compactes de 32 px sous le chrono, mais chacune se touche sur 44 px de haut (`bt-tap-44`, zone invisible) et leurs libellés passent à 13 px, comme les options de leurs menus, hautes de 44 px comme celles du sélecteur de cours (`.bt-chrono-settings`, `.bt-chrono-menu`). Le libellé TRAVAIL / PAUSE du Pomodoro passe à 13 px dans la hauteur de ligne de l'ancien 11 px. Sur deux lignes (téléphone étroit, ou note en plus des réglages Pomodoro), 12 px séparent les pilules pour que leurs zones d'appui ne se chevauchent pas : la carte y prend 4 px, et seulement là. Les autres filtres de l'app ne changent pas.

## Environnements Focus

**Consignes de missions (2026-10-14, local).** Sous 640 px, les titres des
`MissionRow` et le titre/sous-titre de `ChallengeStrip` reviennent à la ligne,
y compris pour un nom de cours long sans espace. Les récompenses gardent
leur largeur non réductible et leur position à droite. Seule la hauteur
nécessaire au texte augmente ; typographie, couleurs, états acquis, choix du
cours et XP sont conservés. Vérifié aussi dans le résumé des missions
déplié. Dès 640 px, le comportement de troncature existant est préservé.

**Environnements Focus V1 (catalogue finalisé le 2026-10-13).** Le
sélecteur se place en haut à droite, face au son, avec quatre aperçus statiques :
Forêt/Wave gardent leurs dégradés de palette, Zenitho montre une vraie capture
du shader (`public/focus-environments/zenitho.jpg`, 27 654 octets) et Glass Fold
sa propre capture (`public/focus-environments/glass-fold.jpg`, 640 × 400,
22 086 octets), sans canvas supplémentaire. Forêt reste le fond original par
défaut (niveau 1), Gradient Wave
est disponible au niveau 5 avec ses six couleurs source alternées bleu/blanc,
40 % de la vitesse source, 30 fps et un tampon à demi-résolution. Zenitho est
disponible au niveau 12 : palette originale rose/bleu/violet/ambre et mêmes
équations/uniformes UVCanvas 0.3.0 sur le moteur Gradient Wave partagé,
avec plan XZ, densité `[0.06, 0.16]`, caméra Z `-0.0005` et antialiasing
opt-in ; seuls ses axes sont plafonnés à 180 segments. Auth/Wave gardent
leurs défauts XY et Forêt ne change pas. Zenitho garde
55 % du temps shader réellement écoulé (indépendamment du plafond 30 fps) et un
tampon à demi-résolution. Le voile sombre central en fonctionnement est retiré,
et Zenitho masque son grain global. Chiffres en encre sombre sans contour
contrasté ni ombre ; petites légendes en encre sombre directement sur les vagues,
sans rectangles blancs ni halo de remplacement. Commandes prune locales à Focus ; voile
rouge réservé à la pause. Les blocs acquis deviennent bleu/violet (`#5144B7`,
glow RGB `81, 68, 183`) sans changer fraction, capacité, ticks, rythme du glow
ou anneau rouge de pause ; le repos Pomodoro reste une piste neutre. Aucun
changement global de sémantique des Study Blocks.

Glass Fold remplace la réserve du niveau 20, quatrième et dernier choix du
catalogue. Il garde le GLSL GradFlow fourni, la palette originale
`#1e3cc8` / `#06081e` / `#96d7ff`, `speed=0.5`, `scale=1`, `noise=0.12`, sans
ralentissement ajouté. Deux triangles, dessins plafonnés à 30 fps ; vitesse
source indépendante. Le tampon suit les pixels CSS sans DPR retina, plafonné à
1 048 576 pixels et 2 048 px par axe. Le champ de verre reste visible, sans
voile sombre global en fonctionnement ni couche de grain ajoutée. Texte clair,
chiffres sans contour contrasté ni ombre et petites légendes sur un fond sombre
doux limité à leurs mots (débord 2/4 px, flou 1 px) ; Pause/Reprendre
primaires cyan/encre sombre, Terminer secondaire marine/texte clair. Remplissage
et glow acquis cyan source (`#96d7ff`, RGB `150, 215, 255`) ; en pause, le champ
rouge et ses voiles de contraste restent en place, le temps acquis garde son
cyan et son anneau rouge. Props, fractions, capacité, ticks, rythme du glow,
timer, Pomodoro et son inchangés. Forêt/Wave/Zenitho gardent leur comportement.
Le registre charge à la demande exactement un renderer sélectionné ; galerie
sans canvas et Progression sans WebGL. Arrêt pause/onglet masqué/mouvement
réduit, ResizeObserver, reprise de contexte au même temps shader,
nettoyage des ressources et fallback avec la vraie capture. Aucun paquet,
TypeScript ou shadcn ajouté.

Le choix et le plus haut niveau canonique observé sont privés et persistés par
le serveur ; un déblocage est permanent et n'équipe jamais automatiquement.
Les quatre choix sont visibles dans les deux galeries. Pause/Reprendre
sont primaires dans les couleurs de l'environnement, Terminer reste secondaire.
Le même catalogue suit le XP dans
Progression. Thème limité au plein écran Focus, avertissement rouge de pause,
cours, temps, blocs, Pomodoro et son conservés ; Échap ferme d'abord le
sélecteur, puis Focus. V86 appliquée une fois en production (`20261013152908`), avec Glass Fold et son
seuil canonique 20, mise à niveau des anciens ensembles à deux/trois choix sans
perte de préférence ni XP. 88 tests Focus / 929 complets après intégration à main, lint et build production
réussis ; navigateur FR/EN à 320/390/1280 px, fonctionnement/pause/Pomodoro,
verrou niveau 12 puis choix niveau 20 conservé après reload/baisse, sans débordement.
60 mesures GPU locales Mac par format : 1280 × 800 médiane 1,536125 ms / p95
2,068458 ms ; 390 × 844 médiane 0,626291 ms / p95 1,984374 ms. Ces mesures ne
certifient ni un iPhone physique ni un appareil PWA. Revue finale Glass Fold
**SHIP** sur les captures fournies et le code, sans relance indépendante du
navigateur/tests ni correctif matériel demandé. La migration distante a été
vérifiée (RLS, privilèges, fonction XP inchangée) ; la validation connectée et
l'état du déploiement se vérifient dans le rapport de publication. Contrat
et limites de validation : [docs/focus-environments.md](../../docs/focus-environments.md),
brief complémentaire : [Progression](pages-progression-js.md).

## Mini-chrono · V1 local

Sur ordinateur (pointeur fin, hover, largeur ≥ 768 px), une action discrète en
haut de Focus, à gauche du sélecteur d'environnement, ouvre la vraie fenêtre
Document PiP. Sur navigateur non compatible, elle reste visible et explique
Chrome/Edge en FR/EN ; aucune imitation. Option absente des layouts mobiles.
La fenêtre reprend automatiquement l'environnement équipé et ses couleurs
Focus (Forêt, Wave, Zenitho, Glass Fold), via le renderer partagé : aucune
préférence, galerie, règle de niveau ou implémentation de fond supplémentaire.
Repère/nom du cours, chiffres tabulaires sans contour ni halo, état explicite et
Revenir au Focus restent au-dessus du paysage, sans grande carte opaque.
Sous 180 px de hauteur, état et retour partagent une ligne ; la cible reste
44 px, seul le glyphe décoratif disparaît sous 240 px de largeur.
Le PiP plafonne les dessins à 24 fps et le DPR à 1 sans changer la vitesse ;
l'animation principale se suspend pendant son ouverture, puis reprend.
RAF/visibilité/resize suivent la fenêtre propriétaire du canvas. Les contrastes
restent locaux au PiP (voile Wave allégé, lavis Zenitho léger haut/bas, voile
marine Glass Fold et son fond limité aux mots), pause rouge conservée.
Styles chargés à la demande et langue/thème synchronisés sans recréer la vue.
Aucun son, badge ni seconde commande de session.
Le portail lit le même chrono : pas d'intervalle, stockage ou écriture serveur.
Fermer/revenir/quitter Focus ferme seulement cette vue, jamais la session.
La fenêtre principale doit rester ouverte. Détails et limites de vérification
dans [Mini-chrono](../../docs/mini-timer.md). Aucun déploiement dans cette passe.

## Mascot frequency

La mascotte ne réagit plus au quart d'heure — une journée de huit heures produisait trente-deux apparitions. L'accumulation ordinaire est portée par les unités elles-mêmes, plus un retour haptique bref toutes les vingt-cinq minutes. Restent les heures pleines, l'objectif de session, l'objectif du jour, la plus longue session et le record du jour : des événements déjà existants, aucun critère nouveau.

Les réactions à ces jalons s'affichent désormais hors du flux, sous forme de coach (DESIGN.md, event coach) ancré aux Study Blocks dans le Chrono et Focus ; la carte ne réserve plus une ligne de mascotte. Téléphone : le personnage se tient à droite des chiffres, debout sur la ligne des légendes des blocs, sa bulle compacte (13,5 px) se pose sur ces légendes, qui s'effacent sur place le temps du message (`data-coach-under`, tant que le coach est réellement affiché ; la ligne d'état sous les blocs fait de même) : jamais les chiffres ni les blocs, rien ne bouge, rien ne dépasse à moitié de la bulle. Ordinateur : à moitié hors du bord droit de la carte, au niveau des blocs, la bulle dans la colonne vide au-dessus. Focus : au-dessus de la session sur téléphone, à côté des blocs sur ordinateur. Missions : sur téléphone, sur le coin haut-gauche de la carte Objectifs (le titre s'efface sur place pendant que le coach parle, décision de Mathias du 2026-09-30), la bulle s'arrête avant le compteur ; sur ordinateur, penché hors du bord gauche de la carte au niveau des défis de la semaine. Dans le sélecteur de cours, le prochain examen est une seconde ligne compacte avec glyphe calendrier, non une capsule indépendante. Le délai emploie un statut propre au Chrono : vert calme au-delà de sept jours, ambre à J-7…J-2, corail dès J-1. Les compteurs passifs ne reçoivent pas automatiquement une pilule colorée. Le corail urgent est un signal d'échéance, distinct des familles pause, examen du Planning et erreur.

## Unresolved decisions

**Mouvement ciblé (2026-10-05).** Les secondes du chrono ne glissent plus à chaque tick ; le changement des minutes reste perceptible. Après création réussie, seule la nouvelle ligne de cours entre brièvement, jamais la liste entière au chargement. Le fond Focus a été mesuré sur 180 images (resize ≈ 0,036 ms/image ; dessin CPU ≈ 0,101 ms/image) puis laissé inchangé ; aucun mouvement décoratif supplémentaire. La pause forte reste protégée.

Les objectifs horaires historiques ne sont plus exposés sur cette surface et les nouvelles périodes n'en demandent plus. La carte Missions n'apparaît pas en mode invité car les niveaux et missions sont liés au compte. La carte « À faire » reste dans le flux afin de préserver l'accès direct aux tâches du jour, même si elle est secondaire par rapport aux six étapes principales demandées. L'ordre des cartes n'a pas été modifié : il est validé par l'utilisateur et consigné ici comme dans PRODUCT.md. La compétition entre gamification et travail a été traitée à l'intérieur de la carte du chrono — le Défi du jour passe SOUS le sélecteur de cours et disparaît dès qu'une session existe. Le défi apparaît encore à la fois dans cette bande et dans la liste des objectifs tant que la session n'a pas démarré : c'est une redondance connue, laissée en l'état parce que la liste du jour doit rester complète.
