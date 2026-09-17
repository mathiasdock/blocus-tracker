---
version: 1
slug: "pages-communautes-js"
primary_target: "pages/communautes.js"
related_targets: ["components/StudyCommunities.js", "styles/study-spaces.css", "components/UniPicker.js", "components/InboxSheet.js", "lib/studySpaces.mjs", "lib/studySpacesClient.js", "lib/studySpacesCopy.js", "docs/study-spaces.md"]
---

## Scope and visitor mode

La route `/communautes` est une surface **Operate** : retrouver les étudiants de ses études, ouvrir un espace pertinent et y participer. Ce brief documente l'extension de Communities en réseau d'espaces académiques, dans l'identité existante de Blocus Tracker. Les espaces et leurs publications sont accessibles aux étudiants connectés ; **Amis / Friends** reste l'inbox privée, avec ses messages et groupes privés distincts.

## Audience, job and task

L'étudiant cherche d'abord ses propres études, puis les discussions, questions, ressources et examens qui les concernent. Il peut rejoindre plusieurs espaces et, lorsqu'un groupe précis est encore calme, accéder explicitement à une communauté plus large mais pertinente. La progression attendue est : retrouver ses études → ouvrir leur fil commun → participer → élargir vers les cohortes proches.

## Content and constraints

La hiérarchie relie **Tous les étudiants → Université → Grand domaine → Programme → Cours → Examen**. Les grands domaines utilisent 22 identifiants stables ; le programme reste un texte libre précis dans `study_field`. Un programme ou un cours peut dépendre directement de l'université si les niveaux intermédiaires sont inconnus. Des domaines globaux relient les universités, tandis que le fil d'Ariane conserve les ancêtres de l'espace consulté.

Les appartenances sont multiples. La synchronisation du profil ajoute l'université, les domaines local/global et un programme réellement plus précis que le domaine ; changer d'études n'efface pas les anciennes appartenances. Une signature du profil préserve le choix de quitter un espace lors des réouvertures suivantes. Le classement du 14 septembre 2026 rattache les anciennes filières uniquement par correspondances exactes normalisées et vérifiées, sans écraser un domaine déjà choisi ni modifier le texte d'origine. Les intitulés ambigus restent à confirmer. Le domaine est le champ principal du profil ; une section repliée permet d'ajouter ou modifier une spécialisation facultative, sans effacer sa valeur à la fermeture.

La recherche principale retrouve les espaces déjà enregistrés, tous niveaux confondus. Elle renvoie jusqu'à 40 résultats et invite à préciser une recherche trop large ; les espaces rejoints sont chargés séparément, jusqu'à 200. La création propose les parents compatibles parmi les espaces chargés. Les aperçus des sous-espaces sont bornés à 40. Découvrir met en avant des espaces actifs et des domaines globaux ; ce n'est pas un catalogue exhaustif des universités.

Le sélecteur partagé d'université conserve la liste existante et recherche aussi l'annuaire mondial via `/api/universities`, dès deux caractères. Il propose une saisie personnalisée lorsque l'établissement manque ou que l'annuaire est indisponible. Cette recherche mondiale est disponible dans la création d'espace, le profil et l'inscription ; une université non enregistrée n'apparaît pas automatiquement dans la recherche principale. Les anciennes identités d'université et l'historique des messages restent conservés.

Les identités reposent sur des noms normalisés, sans rapprochement sémantique : abréviations, traductions et variantes de noms peuvent produire des espaces distincts. Les cours portant le même nom normalisé sont réutilisés au sein d'une université, jamais entre universités. Un examen dépend de son cours et de sa date éventuelle ; le formulaire demande de préciser la session dans son nom. Aucun statut officiel d'établissement, fusion automatique ou outil de modération des alias n'est promis.

Chaque espace présente un fil unique, par défaut **Tout**, avec des filtres facultatifs Discussion / Question / Ressource / Examen. Le contenu existant et les pièces jointes restent portés par `community_messages`, y compris les anciens types encodés dans le texte. Publications et réponses sont paginées par date et identifiant, 30 éléments à la fois ; les réponses les plus récentes apparaissent en premier. L'actualisation à 30 secondes est conditionnée à un onglet visible, près du haut de la première page, sans composition ni fil de réponses ouvert. Les compteurs de non-lu suivent les espaces rejoints.

Lire ne requiert pas de rejoindre l'espace ; publier et répondre le requiert dans l'interface. La composition permet un type, du texte, une pièce jointe et une date pour un examen. Les pièces jointes utilisent l'accès signé existant ; les examens datés conservent l'ajout au planning personnel. Les erreurs, chargements et possibilités de réessayer restent explicites. Un fil vide invite à commencer une publication si l'étudiant est membre ; un filtre sans résultat nomme son type et propose **Voir toutes les publications** pour retrouver le fil commun.

## Chosen direction and memorable moment

**Thèse :** la pertinence académique donne un point d'entrée précis, avec des cohortes plus larges toujours accessibles lorsque le groupe local est calme. Le moment distinctif est ce passage volontaire du cours ou de l'examen vers ses ancêtres et son domaine global, sans mélanger des publications sans rapport ni imposer une redirection.

**Monde conservé :** surfaces chaudes, accents menthe, vert foncé des actions, Nunito Sans, avatars, logos d'université existants et icônes `Glyph`. Les boutons, champs, rayons, élévations et dialogues réutilisent les primitives de l'application. Il s'agit d'une extension du monde existant ; aucun nouvel atelier d'identité ni composition au pixel approuvée n'a été établi. `PRODUCT.md`, `DESIGN.md` et le sidecar global restent les références, sans réécriture pour cette surface.

Le premier écran organise **Tes espaces / Your spaces** puis **Découvrir / Discover**, sous une recherche et une action de création. Les rangées associent nom, niveau académique, université quand elle s'applique et indicateurs réels d'activité ou de membres. Le panneau ouvert expose son titre, l'appartenance, ses ancêtres et le fil commun. Chaque type d'espace se reconnaît d'abord à sa forme — logo ou monogramme de l'université, boussole du domaine, toque du programme, livre du cours, date de l'examen — puis à une teinte `--bt-kind-*` bornée au pictogramme et au mot du type (DESIGN.md § Study-Space Kinds) ; le vert reste la sélection, les actions et les non-lus. Les suggestions de Découvrir disent pourquoi elles apparaissent (lié à tes cours, à ton domaine, dans un espace rejoint, à ton université, activité récente) à partir de faits réels seulement. L'en-tête de l'espace tient sur deux lignes : nom, puis type · chemin discret · nombre d'étudiants ; l'appartenance est un bouton sobre « Membre » dont le départ est replié. L'espace plus large proposé est unique — l'ancêtre ou le domaine global réellement actif avant « Tous les étudiants » — et tient sur une ligne : en tête d'un fil calme, dans l'état vide, ou en fin de fil d'un espace actif. Les sous-espaces forment une rangée de pastilles défilante en haut du fil.

La participation occupe une barre en bas du panneau, comme un champ de message (ou « Rejoindre » pour un non-membre), et les publications sont séparées par des lignes discrètes plutôt que par une succession de cartes. La création présente les cinq types comme des choix illustrés, propose le parent compatible, et signale avant l'envoi un espace identique (le bouton devient « Rejoindre l'espace existant ») ou des espaces proches. Le type associe une icône et un mot. Les profils s'ouvrent depuis l'auteur et les réponses dans une feuille. La suppression autorisée à l'auteur ou à l'administrateur reste derrière un overflow natif `details/summary`, suivi de la confirmation du navigateur.

## Responsive behavior and accessibility

À partir de 1024px, Friends et Communities partagent la même coque : une seule surface en pleine hauteur à droite de la barre latérale, liste (un tiers) et panneau ouvert (deux tiers) séparés par un filet, chacun avec son défilement, sans pied de page (`bt-social-fill` dans globals.css). Sous ce seuil, la liste est une surface continue jusqu'au bas de l'écran, avec un dégagement de défilement sous la navigation flottante. Ouvrir un espace remplace la liste par son fil plein écran avec retour explicite. Le nom de l'espace reste prioritaire dans l'en-tête mobile ; son pictogramme y est masqué. Le fil d'Ariane et les filtres défilent horizontalement au besoin et sont exclus du geste de navigation entre routes.

La création, la composition et les réponses réutilisent `InboxSheet` : dialogue natif, fond inerte, focus confiné et restitué, fermeture par Échap, feuille mobile puis dialogue centré à partir de 640px. Les rangées, filtres et actions principales atteignent au moins 44px. Les boutons de filtre exposent `aria-pressed`, l'espace sélectionné `aria-current`, les actions iconographiques ont un nom accessible et les erreurs utilisent des alertes. Le sélecteur d'université expose un combobox/listbox avec navigation par flèches, validation par Entrée et fermeture par Échap. La recherche mobile utilise une taille de 16px. Les couleurs suivent les tokens sémantiques clair/sombre ; la transition des rangées est supprimée en mouvement réduit.

## Verification

La revue finale indépendante rapportée par l'agent principal conclut **SHIP**, sans élément matériel restant après résolution de la suppression derrière l'overflow natif et du retour au fil complet depuis un filtre vide.

Les captures de référence rapportées sont `/tmp/study-spaces-desktop-final.png`, `/tmp/study-spaces-mobile-final.png`, `/tmp/study-spaces-mobile-list.png` et `/tmp/study-spaces-filter-empty-final.png`. Elles proviennent du navigateur local avec `NEXT_PUBLIC_OFFLINE_DEV=true` et les données explicitement synthétiques de `lib/offlineStudySpaces.js`. Elles ne montrent pas d'activité réelle et n'impliquent aucune insertion de contenu exemple dans Supabase.

Les vérifications rapportées couvrent la navigation mobile/desktop, les types de publication, filtres, réponses, rejoindre/quitter, la création d'un examen et la recherche/création de Stanford via l'annuaire mondial. Les tests de domaine et les suites existantes sont consignés dans `docs/study-spaces.md`. Les deux migrations additives `20260913174717_study_spaces.sql` et `20260913180559_study_spaces_preferences.sql` ont été appliquées au projet Supabase le 13 septembre 2026, sans suppression des anciens messages. Des transactions annulées ont vérifié les hiérarchies, la réutilisation des cours, les permissions d'appartenance/publication, les refus inter-espaces et la persistance d'un départ volontaire.

Ce relevé distingue les contrôles de base de données réels des scénarios de navigateur sur fixtures. Il ne constitue pas une validation sur iPhone physique ou un parcours complet authentifié en production, et n'implique ni déploiement du frontend ni push Git.

## Unresolved decisions

Aucune décision de direction ouverte pour cette extension délimitée. La validation sur appareil physique et le parcours complet authentifié en production restent hors des vérifications effectuées. Le rapprochement sémantique des noms et la fusion modérée d'espaces demeurent des extensions futures, non des capacités de cette livraison.

**Statut au 17 septembre 2026 : taxonomie héritée.** Cette hiérarchie d'espaces sera reconstruite plus tard autour d'espaces de cours. Les fondations de l'identité de cours (cours canonique par établissement, liens privés, confirmations et refus) existent côté base, sans aucune interface : voir `docs/canonical-courses.md`. Ce brief décrit toujours l'interface actuelle ; il ne décrit pas la future.
