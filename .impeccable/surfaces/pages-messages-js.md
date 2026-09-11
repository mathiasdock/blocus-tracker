---
version: 1
slug: "pages-messages-js"
primary_target: "pages/messages.js"
related_targets: ["components/InboxSheet.js", "components/Layout.js", "components/useSocialSwipe.js", "lib/socialSwipe.mjs", "lib/i18n.js", "styles/globals.css"]
---

## Scope and visitor mode

La route `/messages` est une surface **Operate** : retrouver une conversation, écrire à un ami ou à un groupe, et gérer ses demandes d'amitié. Son libellé central est **Amis** en français et **Friends** en anglais. L'entrée globale **Social** conserve son nom. Ce brief documente la réorganisation de cette surface et la navigation mobile entre `/feed`, `/messages` et `/communautes` ; il ne redéfinit pas l'identité visuelle globale.

## Audience, job and task

L'étudiant reprend rapidement ses échanges récents, puis ouvre la composition lorsqu'il veut démarrer une autre conversation. La découverte de personnes et les demandes d'amitié restent accessibles sans occuper la place de la liste des échanges.

## Content and constraints

Une seule inbox mêle messages privés et groupes, triés par activité la plus récente. Les DM utilisent la date du dernier message ; les groupes utilisent celle du dernier message ou, à défaut, leur date de création. Le non-lu se traduit par un nom plus appuyé et un compteur, sans modifier cet ordre. Une indication textuelle et un signe sur l'avatar distinguent les groupes.

Les contacts sans aucun message restent disponibles dans la composition et la recherche, mais n'occupent pas l'inbox au repos. La recherche rassemble les conversations et contacts existants ainsi que les nouvelles personnes, avec leurs actions pertinentes : ouvrir, écrire, ajouter ou consulter une demande en attente. Préserver les états de chargement, d'absence de résultat et de confirmation d'action.

Les fonctions existantes de DM, groupes, pièces jointes, profils et étude en groupe restent portées par leurs écrans de conversation. Ce brief n'introduit aucune nouvelle promesse concernant leurs données ou leur disponibilité.

## Chosen direction and memorable moment

La liste de conversations est le centre de gravité. Au-dessus, une recherche et une action de composition donnent accès au reste. Les demandes reçues et envoyées occupent une ligne compacte avec leur total lorsqu'il existe des demandes en attente. Cette ligne ouvre une feuille avec deux choix comptés, Reçues/Envoyées (Received/Sent) : accepter ou refuser une demande reçue, annuler une demande envoyée.

La feuille de composition rassemble les contacts pour démarrer un DM, la création d'un groupe et une action qui ramène à la recherche de personnes. Les suggestions y sont repliées au départ, puis affichent leur motif lorsqu'il est disponible. Elles accompagnent une intention de contact explicite.

Les surfaces chaudes, accents verts, avatars, icônes `Glyph`, typographie, rayons et élévations existants restent la référence. L'organisation change ; les tokens de marque et les ressources partagées sont conservés. `DESIGN.md` et son sidecar global ne sont pas modifiés.

## Responsive behavior and accessibility

Sur desktop, l'inbox et la conversation se partagent l'espace. Sur mobile, la conversation ouverte prend tout l'écran et possède son retour. Les feuilles utilisent un dialogue natif : fond inerte, confinement du focus, fermeture par Échap et restitution du focus à la fermeture. Elles se placent en bas sous 640px, puis deviennent centrées ; leurs boutons atteignent 44px. Les rangées de conversation acceptent Entrée/Espace et affichent un focus visible.

Sous 1024px, un glissement horizontal permet de parcourir dans l'ordre `/feed` → `/messages` → `/communautes`, sans boucle aux extrémités. Les liens des trois onglets restent disponibles. Le geste suit l'axe horizontal seulement après discrimination ; un mouvement vertical conserve le défilement. Il est exclu dans une conversation plein écran, lorsqu'un dialogue est ouvert, depuis les champs, boutons, liens, médias, éléments éditables, sliders et zones marquées sans swipe, ainsi que dans les conteneurs à défilement horizontal. Les 24px de bord sont réservés aux gestes du navigateur et les gestes à plusieurs doigts sont abandonnés.

Le contenu et l'indicateur d'onglet suivent légèrement le geste avant stabilisation. Avec `prefers-reduced-motion`, le changement de route reste disponible sans déplacement visuel du contenu pendant le glissement ni transition de l'indicateur.

## Verification

Les vérifications locales rapportées par l'agent principal couvrent la recherche et l'ajout d'amis, les demandes reçues/envoyées, la création et l'envoi dans un groupe, l'envoi de DM, le tri par activité, le swipe entre les trois routes, ainsi que les exclusions pour défilement vertical et champs et le comportement en mouvement réduit. Ce relevé ne constitue pas une vérification en production réelle ni sur appareil physique.

## Unresolved decisions

Aucune décision de direction ouverte pour cette refonte délimitée. La validation en production réelle et sur appareil physique reste hors des vérifications effectuées.
