# Step 4 — preuves visuelles locales

Données synthétiques uniquement ; aucune URL privée. Captures desktop 1440 px,
mobile 390 px et FR/sombre 320 px. Le détail et les formulaires défilent dans
la fiche existante ; aucun débordement horizontal observé.

## Connexion — desktop clair

![Connexion — desktop clair](connect-desktop.png)

## Connexion — mobile clair

![Connexion — mobile clair](connect-mobile.png)

## URL invalide — mobile

![URL invalide — mobile](invalid-mobile.png)

## Association explicite — un cours mappé, un non associé

![Association explicite — un cours mappé, un non associé](matches-mobile.png)

## Résumé compact — examen probable et examen possible

![Résumé compact — examen probable et examen possible](review-mobile.png)

## Formulaire de création explicite — mobile

![Formulaire de création explicite — mobile](confirm-mobile.png)

## Formulaire de création explicite — desktop

![Formulaire de création explicite — desktop](confirm-desktop.png)

## Mois dense — desktop

![Mois dense — desktop](month-desktop.png)

## Mois dense — mobile

![Mois dense — mobile](month-mobile.png)

## Détail jour — étude puis échéances (cours non associé inclus)

![Détail jour — étude puis échéances (cours non associé inclus)](day-desktop.png)

## Nouveau cours détecté sans bloquer la synchronisation

![Nouveau cours détecté sans bloquer la synchronisation](new-course-mobile.png)

## Date source modifiée — examen local conservé

![Date source modifiée — examen local conservé](source-changed-mobile.png)

## Gestion — desktop sombre FR

![Gestion — desktop sombre FR](manage-desktop-dark-fr.png)

## Gestion — 320 px sombre FR

![Gestion — 320 px sombre FR](manage-mobile-dark-fr.png)

## Confirmation de déconnexion — 320 px sombre FR

![Confirmation de déconnexion — 320 px sombre FR](disconnect-mobile-dark-fr.png)

Tests navigateur : import de 10 événements, une conversion explicite, sync identique sans doublon, nouveau cours (11 événements), date source modifiée sans déplacer l’examen local, acquittement, correspondance modifiée, cours ignoré, puis déconnexion. Après déconnexion : 1 examen, 2 cours et 2 objectifs préservés, 0 donnée externe.

Le vrai flux Canvas et le parcours hébergé ne sont pas validés par ces fixtures.
