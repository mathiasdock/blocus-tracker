---
version: 1
slug: "pages-communautes-js"
primary_target: "pages/communautes.js"
related_targets: ["components/course-spaces/CourseSpaces.js","components/course-spaces/CourseSpaceList.js","components/course-spaces/CourseRoom.js","lib/courseSpaces.mjs","lib/courseSpacesClient.js","styles/course-spaces.css","docs/course-spaces.md"]
---

## Scope and visitor mode

La route `/communautes` est une surface **Operate** : retrouver, parmi ses propres cours, ceux qui le relient à des étudiants de son établissement, rejoindre volontairement l'espace d'un cours et y échanger simplement. Ce brief remplace celui de l'ancien réseau d'espaces académiques (université → domaine → programme → cours → examen), retiré de l'interface le 17 septembre 2026 ; ses données restent en base, privées. Le libellé de navigation « Communautés » est conservé pour l'instant. Amis reste la messagerie privée ; Activité reste le fil.

## Audience, job and task

L'étudiant ouvre la page entre deux sessions pour savoir quels de SES cours ont un espace utile, confirmer d'un geste une correspondance incertaine (« ADV Strat semble correspondre à Advertising Strategy »), rejoindre, lire la conversation du cours, écrire, partager une date d'examen ou relancer l'étude de ce cours. Blocus reste d'abord PLANIFIER → ÉTUDIER → SUIVRE → COMPRENDRE : la page ne doit pas devenir un réseau social ni une messagerie concurrente.

## Content and constraints

- Trois objets distincts : cours personnel (son nom et sa couleur restent personnels), cours canonique (titre partagé, un seul établissement), adhésion (toujours volontaire, jamais automatique). Voir `docs/canonical-courses.md` et `docs/course-spaces.md`.
- Trois groupes : **Tes espaces** (son établissement et son programme dans cet établissement, tirés du profil, adhésion automatique), **Tes cours** (espaces de cours rejoints), puis **Pour tes cours** (correspondances automatiques ou confirmées de ses cours actifs, et questions à confirmer). Peu de suggestions mises en avant ; jamais d'autre établissement, jamais de recommandation inventée, aucun espace de programme inter-établissements.
- Recherche « Chercher un cours » limitée à son établissement et aux titres canoniques ; jamais un nom de cours personnel d'un autre étudiant.
- Compteurs de membres affichés à partir de 3 seulement ; aucun « 1 étudiant ». Démarrage à froid : une phrase vraie et discrète, jamais un écran vide (les deux espaces par défaut sont là).
- Identité : logo réel de l'établissement s'il existe dans le projet, sinon ses initiales en encre ; un programme n'a pas de marque, son établissement reste visible en second ; un cours garde la pastille de sa couleur personnelle.
- Salon réservé aux membres : un seul fil chronologique, du plus ancien au plus récent, messages groupés par auteur, mes messages à droite. Pièce jointe, date d'examen partagée (ajout au planning sur SON cours) et « Étudier ce cours » (Chrono sur son cours personnel) sont les seules actions propres à Blocus.
- Modération minimale : signaler un message (masqué pour tous après 3 signalements), bloquer un étudiant, supprimer son message, limites anti-spam côté serveur, traitement admin dans `/admin`.

## Chosen direction and memorable moment

Le moment distinctif est la reconnaissance : l'étudiant retrouve ses propres cours, avec leurs couleurs, reliés à de vrais camarades de son établissement, et répond oui ou non en un geste quand Blocus hésite.

## Direction contract

THESIS: Tes vrais cours d'abord : la page répond « quels cours me relient à des étudiants de mon établissement ? ». Elle refuse l'annuaire de communautés et le fil social générique.
OWN-WORLD: Monde Blocus existant, Restrained : surfaces chaudes neutres, Nunito Sans, texte d'abord ; seule couleur d'identité : la pastille du cours personnel ; vert réservé aux actions, à la sélection et aux non-lus ; aucune tuile d'icône ni pilule d'étiquette.
STORY: L'étudiant voit ses espaces rejoints, puis ses cours qui ont un espace, confirme d'un geste une correspondance incertaine, rejoint volontairement, écrit, puis relance le Chrono sur ce cours.
FIRST VIEWPORT: Desktop : colonne d'un tiers (titre, recherche, Tes espaces, Tes cours, Pour tes cours), salon plein hauteur à droite — le premier cours rejoint, sinon l'espace de l'établissement, jamais un panneau vide. Mobile : la liste seule, puis le salon plein écran.
FORM: Liste | conversation imposée par le brief ; aucun tirage de concept (demande précisément spécifiée).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Responsive behavior and accessibility

À partir de 1024 px, la coque sociale plein hauteur partagée avec Amis : liste d'un tiers et salon séparés par un filet, chacun avec son défilement. En dessous, la liste occupe l'écran ; ouvrir un espace passe en plein écran (`bt-chat-fullscreen`) avec un retour explicite, et le composeur reste au-dessus du clavier. Cibles d'au moins 44 px, focus visible, lecture clavier des listes et du fil, annonce polie des nouveaux messages, contraste mesuré dans les deux thèmes, mouvement réduit respecté.

## Verification

Livré le 17 septembre 2026.

- Base : `supabase/tests/course_spaces_security.sql`, 46 contrôles (adhésion, RLS, modération, anciennes données), tout annulé, aucune trace ; `resolve_my_course_links()` ≈ 0,3 s pour le plus gros établissement (transaction annulée).
- Code : `node --test tests/*.test.mjs` (dont `tests/course-spaces.test.mjs`), `npm run lint`, build de production et build hors ligne.
- Parcours vérifiés dans le build hors ligne (données de démonstration étiquetées) : question Oui puis Non (le refus ne revient pas), rejoindre, écrire, date d'examen vers le planning puis « Dans ton planning » à l'arrivée, signaler, bloquer et débloquer, quitter, recherche, « Étudier ce cours » vers le Chrono, non-lus dans la liste et la navigation, section admin, trois démarrages à froid (pas d'établissement, pas de cours, pas encore de correspondance).
- Largeurs : 320, 375/390, 768, 1024, 1280, 1440 ; clair et sombre ; aucun défilement horizontal à 320. Contrastes mesurés (le texte secondaire de la ligne sélectionnée a été relevé après une mesure à 4,3:1).
- Détecteur `impeccable detect` : seulement des avertissements de rayon (cercles à 999px, bulles 18/6 px comme dans Amis), documentés dans DESIGN.md.
- Complément du 17 septembre 2026 (deux espaces par défaut) : 26 contrôles SQL supplémentaires, 105 tests Node, captures refaites à 320, 390, 1280 et 1440 px en clair et en sombre (liste à trois sections, ouverture automatique de l'établissement sans cours rejoint, quitter puis rejoindre, repli en initiales). Pas de nouvelle revue indépendante pour ce complément.
- Revue finale indépendante (référence dégradée, sans agent dédié dans ce harnais), deux tours : `fix` puis `fix` puis **`ship`**. Tour 1 : libellé de l'activité récente, pièces jointes en un geste avec lien signé renouvelé, cibles de 44 px, anneau de focus contrasté, DESIGN.md et cette section. Tour 2 : anneau de focus des menus « ⋯ » rendus en portail (`menuClassName` sur `FilterMenu`) et noms de fichiers tronqués seulement au milieu et seulement si nécessaire ; deux retours à la ligne réglés. Restent non traités, volontairement : deux finitions (espace avant la fin d'un nom tronqué, ligne de détails qui peut finir sur « · ») et les pistes de plafond de la revue (couleur du cours limitée à une pastille, pas de marqueur d'examen dans l'en-tête, pas de temps d'étude à côté d'« Étudier ce cours »). Captures : `.impeccable/review/` (desktop, desktop-preview, desktop-dark, mobile, mobile-room, mobile-320-cold-start, mobile-dark-room).

## Unresolved decisions

Le nom définitif de la fonctionnalité sera choisi après usage réel. Pas de notifications push pour les salons dans ce MVP (non-lus dans l'app seulement).
