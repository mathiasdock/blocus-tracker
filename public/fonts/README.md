# Polices auto-hébergées

Nunito Sans et Quicksand sont servies exclusivement depuis `/fonts`. Le
navigateur ne contacte donc ni Google Fonts ni un autre CDN au chargement de
l'application.

| Fichier | Famille | Graisses | Sous-ensemble |
|---|---|---|---|
| `nunito-sans-latin.woff2` | Nunito Sans variable | 400–800 | latin |
| `nunito-sans-latin-ext.woff2` | Nunito Sans variable | 400–800 | latin-ext |
| `quicksand-latin.woff2` | Quicksand variable | 600–700 | latin |
| `quicksand-latin-ext.woff2` | Quicksand variable | 600–700 | latin-ext |

Les déclarations `@font-face` vivent dans `styles/globals.css`. Nunito Sans
est la famille principale et Quicksand est réservée aux accents typographiques.

## Sources et licences

Les fichiers proviennent du dépôt officiel Google Fonts et sont redistribués
sous SIL Open Font License 1.1. Les textes de licence se trouvent dans
`OFL-Nunito-Sans.txt` et `OFL-Quicksand.txt`.
