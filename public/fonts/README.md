# Polices auto-hébergées

Ces fichiers étaient auparavant chargés depuis `fonts.googleapis.com` /
`fonts.gstatic.com`. Chaque visiteur — y compris non connecté et avant tout
consentement — transmettait alors son adresse IP à Google. Les polices sont
donc désormais servies depuis notre propre domaine : aucune requête vers un
tiers, aucune donnée transmise, et un rendu identique.

| Fichier | Famille | Sous-ensemble | Source |
|---|---|---|---|
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque (variable 500–800) | latin | Google Fonts v9 |
| `bricolage-grotesque-latin-ext.woff2` | Bricolage Grotesque (variable 500–800) | latin-ext | Google Fonts v9 |
| `space-grotesk-latin.woff2` | Space Grotesk (variable 500–700) | latin | Google Fonts v22 |
| `space-grotesk-latin-ext.woff2` | Space Grotesk (variable 500–700) | latin-ext | Google Fonts v22 |

Les déclarations `@font-face` vivent dans `styles/globals.css`.
Les noms de familles sont inchangés (`Bricolage Grotesque`, `Space Grotesk`),
donc `tailwind.config.js` et le rendu canvas de `components/StudyRecap.js`
continuent de fonctionner sans modification.

## Licences

Les deux familles sont sous SIL Open Font License 1.1 (redistribution
autorisée) — voir `OFL-Bricolage-Grotesque.txt` et `OFL-Space-Grotesk.txt`.

## Mettre à jour

Retélécharger le `.woff2` depuis l'URL `fonts.gstatic.com` publiée par
`https://fonts.googleapis.com/css2?family=…` et remplacer le fichier.
