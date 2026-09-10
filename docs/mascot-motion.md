# Mouvement de la mascotte

Le shiba a été redessiné pour l'animation : tête plus large, masque crème,
yeux expressifs, queue enroulée, foulard vert, épaules, coudes et pattes arrière
séparés. Le SVG utilise un viewBox de 160 × 160. Ses groupes imbriqués séparent
la posture de repos des articulations animées. `lib/mascotMotion.mjs` orchestre
les mouvements avec Web Animations, sans librairie supplémentaire ni mise à
jour React à chaque image.

## Utilisation

`Mascot` conserve ses props existantes (`streak`, `mood`, `size`, `animated`,
`ariaLabel`). Les humeurs sont `neutral`, `focused`, `happy`, `proud`,
`celebrating` (alias `celebrate`), `sleepy`, `worried` et `surprised`.

Une nouvelle humeur déclenche une réaction, suivie d'un repos vivant. Pour
rejouer une réaction à humeur identique, changer `reactionKey` avec l'identifiant
stable du nouvel événement. Ne pas utiliser une valeur aléatoire ou un timestamp
recalculé à chaque rendu. `MascotMoment` transmet déjà sa clé d'événement ; ses
règles d'apparition, de fréquence et de stockage sont inchangées.

La célébration est une séquence de deux bonds, pas une boucle : anticipation,
bras levés au sommet du saut, jambes repliées, retombée et reprise d'équilibre.
Un salut de la patte accueille l'utilisateur en humeur neutre/heureuse ; un
livre fait partie de la pose concentrée ; sommeil et fierté ont leurs propres
dessins des yeux et positions des membres. Les gestes sont séquencés,
avec des pauses variables et des clignements irréguliers. La respiration est
suspendue pendant les réactions les plus expressives. Une grande série conserve
son dessin avec flamme, mais n'entraîne pas de sauts répétés.

## Accessibilité et cycle de vie

- `prefers-reduced-motion: reduce` ou `animated={false}` : posture expressive
  statique, sans animation ni timer du directeur.
- Mascotte hors écran ou onglet caché : annulation des animations et du timer.
- Retour à l'écran : reprise du repos, sans rejouer une réaction déjà consommée.
- Changement d'humeur : retour amorti depuis la position actuelle, puis nouvelle
  réaction ; démontage : nettoyage complet.

## Vérification

- `node --test tests/mascot-motion.test.mjs` : orchestration, événements,
  interruptions, réduction des mouvements et nettoyage.
- `npm run lint` et `npm run build`.
- `npm run dev`, puis `/dev/mascot` : huit humeurs, répétition, pause,
  démontage et tailles 46/96/160/192 px. Cet atelier renvoie 404 en production.

## Limites du dessin

Les nouvelles articulations permettent le salut, les bras levés, l'étirement
et les changements d'appui. Le personnage reste dessiné de face : un vrai
profil, une rotation en 3D ou une marche à quatre pattes nécessiteraient encore
des vues dédiées. Le système d'apparition de MascotMoment reste inchangé.
