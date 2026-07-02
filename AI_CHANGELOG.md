# AI_CHANGELOG.md

Ce fichier sert de suivi commun pour Claude Code et Codex. Toujours le lire avant de modifier le projet afin d'eviter les doublons, les inversions de changements ou les confusions entre mode local et production.

## 2026-07-02 - Planning : paquet "quick wins" (UX + bugs)

Suite a une analyse du planning (fonctionnalites/design/simplicite), implementation du paquet de gains rapides identifie.

- `pages/planning.js`, `lib/i18n.js` :
  - Fix golden rule i18n : le popover "Reporter" de `ObjectiveRow` avait du francais en dur (`title="Reporter"`, "Reporter à demain", "Autre date") alors que la cle `plan.dayPostpone` existait deja mais n'etait jamais utilisee. Ajout de 2 nouvelles cles (`plan.postponeTooltip`, `plan.postponeOtherDate`) en FR+EN. Popover rendu dark-safe au passage (hex en dur -> variables CSS).
  - Vue Mois mobile : les titres d'objectifs tronques au milieu d'un mot ("Re...", "Fi...") remplaces par des points de couleur (comme le fond deja tinte par cours) en dessous de `sm:`. Comportement desktop/tablette inchange (texte complet conserve).
  - Toggle "planning public" : checkbox brute native remplacee par un switch coherent avec celui du profil (memes dimensions/couleurs), label dark-safe (etait `text-stone-600` en dur).
  - Fix fuite de confidentialite : `pages/friends.js` affichait les objectifs de TOUS les amis acceptes sans jamais verifier leur flag `planning_public` (contrairement a `UserProfileModal.js` qui le respectait deja). Objectifs filtres cote client selon ce flag desormais.
  - Mobile (<640px) : vue par defaut passee de "Mois" a "Jour" au premier chargement (effet mount-only, n'ecrase jamais un choix de vue fait ensuite). La vue Mois y etait trop dense pour etre utile.
  - Bug decouvert en testant le changement ci-dessus : `TimeGrid` affichait le mauvais jour de la semaine en vue Jour (toujours "LUN" quelle que soit la vraie date) car le calcul utilisait l'index du tableau (`i % 7`) au lieu du vrai jour (`d.getDay()`). Corrige — impactait aussi potentiellement la vue Semaine dans certains cas limites.
- Verification : `npm run build` OK (20/20) + verification visuelle navigateur (mode offline dev), light/dark, mobile 375px : popover i18n+dark confirme, points de couleur mois confirmes, switch confirme, jour de semaine correct confirme (Jeudi 2 juillet -> "JEU").

Reste des pistes 🟡/🔴 identifiees (pont planning->chrono, unification des 3 formulaires objectif, TimeGrid a moderniser, auto-suggestion de revision avant examen) — non traitees, discussion produit necessaire avant de s'y attaquer.

## 2026-07-02 - Refonte design (passe 2 : stats + profil + feed)

Suite de la refonte "instrument de focus". Cible : enlever les derniers tells "AI generated" signales (emojis podium, cartes profil mal organisees).

- `pages/stats.js` :
  - Emojis medailles supprimes partout (podium + 2 leaderboards). Nouveau composant `RankBadge` : #1 en accent plein, top 3 en tint accent, reste en numero discret (Space Grotesk).
  - Carte "percentile" : les "decorative blobs" + degrade triple-stop (tell IA) remplaces par la surface `.card-ink`, chiffre en Space Grotesk. Copie i18n inchangee.
  - Temps des classements/podium en `font-num`.
- `pages/profile.js` :
  - Header : banniere degrade mint generique remplacee par une banniere ink (vert profond + halo accent) qui s'enchaine avec la carte XP. Avatar agrandi (82px) + ring/ombre.
  - Section "Mon activite" ouverte par defaut (heatmap + stats visibles au lieu d'etre repliees).
- `pages/dashboard.js` : badge streak sur la carte ink : `🔥` amber (jurait sur le vert) remplace par flamme SVG ambre sur pastille translucide.
- `pages/feed.js` : formulaire de post rendu dark-safe (bordure dashed + toggles visibilite utilisaient des hex codes en dur -> variables) ; bouton photo : emoji trombone remplace par icone (camera / check).
- Verification : `npm run build` OK + navigateur (mode offline dev) light/dark, mobile 375px.

Reste (passe 3 a venir) : friends, communautes, groupes, historique — polish incremental.

## 2026-07-02 - Refonte design "instrument de focus"

Refonte visuelle globale pour enlever le look "AI generated" (fond creme + serif Fraunces). Le vert officiel `#14B885` est conserve partout.

Direction : l'app est un instrument de mesure du temps d'etude. Typographie expressive pour les titres, chiffres tabulaires geometriques pour le chrono et les stats, surface verte profonde "ink" pour les moments de marque.

Changements effectues :

- Typographie (`pages/_document.js`, `tailwind.config.js`) :
  - Fraunces (serif) remplace par **Bricolage Grotesque** (display, `font-display`, poids 500-800) ;
  - **Space Grotesk** ajoute pour les chiffres (`font-num`, poids 500-700) : chrono, stats, records ;
  - `h1/h2/h3` recoivent automatiquement Bricolage 700 + tracking -0.02em (via `@layer base`).
- Nouveaux tokens (`styles/globals.css`, light + dark) :
  - `--bt-ink`, `--bt-ink-soft`, `--bt-ink-text`, `--bt-ink-muted`, `--bt-ink-border` : surface verte profonde derivee de la famille accent (reservee aux moments de marque) ;
  - `--bt-auth-overlay` : voile des pages auth, blanc en light / sombre en dark ;
  - `--bt-scrollbar` / `--bt-scrollbar-h` : scrollbars adaptatives au theme.
- Nouvelles classes composants (`styles/globals.css`) :
  - `.card-ink` : carte hero vert profond avec voile radial accent ;
  - `.card-lift` : lift discret au hover (desktop uniquement) ;
  - `.bt-rise` / `.bt-stagger` : entree fade-up staggeree des cartes ;
  - `.btn:active` : press scale(0.97) integre a tous les boutons ;
  - `:focus-visible` : ring vert accessible global ; `::selection` teinte accent.
  - `.card` : radius 22px -> 20px ; `.btn-primary` : degrade `#14B885 -> #0E8F68`.
- Dashboard (`pages/dashboard.js`) :
  - digits du chrono en Space Grotesk bold (carte, pomodoro, mode focus) ;
  - carte "Aujourd'hui" convertie en `.card-ink` (le moment de marque) ;
  - icone decorative du header supprimee (AI-tell), header compact ;
  - bouton Demarrer en degrade ; mode focus plein ecran sur fond ink + halo accent ;
  - entree staggeree de la grille.
- Shell (`components/Layout.js`) :
  - wordmark en Bricolage bold tracking-tight (sidebar + topbar mobile) ;
  - bottom nav mobile : pill accent derriere l'icone active + label bold ;
  - pilules chrono flottantes (mobile + desktop) en degrade + `font-num`.
- Pages auth (`components/AuthBackground.js`, `pages/login.js`, `pages/signup.js`) :
  - fix dark mode : l'overlay photo s'assombrit en dark (`--bt-auth-overlay`), les textes redeviennent lisibles ;
  - entree staggeree du formulaire.
- Chiffres en Space Grotesk : `pages/stats.js` (tuiles), `pages/profile.js` (2 endroits), `components/UserProfileModal.js`.
- Entrees staggerees : `pages/stats.js`, `pages/feed.js`, `pages/profile.js`, `pages/historique.js`.
- Toutes les animations respectent `prefers-reduced-motion` (bloc etendu).
- `.claude/launch.json` ajoute (config preview dev server pour verification visuelle).
- `docs/UI.md` mis a jour avec les nouveaux tokens/classes/typo.
- Verification : `npm run build` OK (20/20 pages) + verification visuelle navigateur (mode offline dev) en light/dark, mobile 375px et desktop 1280px.

Non touche volontairement : `planning.js` et `messages.js` (pages geantes, refonte incrementale a suivre — elles beneficient deja automatiquement des nouvelles fontes et des classes globales).

## 2026-07-02 - Mode offline local Supabase

Ajout d'un mode offline local pour continuer a developper Blocus Tracker pendant l'indisponibilite de la database Supabase de production.

Changements effectues :

- Ajout du flag `NEXT_PUBLIC_OFFLINE_DEV=true` pour activer le mode offline en local.
- Creation de `lib/offlineSupabaseClient.js`.
- Modification de `lib/supabaseClient.js` pour basculer entre Supabase reel et le faux backend offline.
- Ajout de la documentation du flag dans `.env.local.example`.
- Activation locale dans `.env.local`.
- Le mode offline fonctionne avec `localStorage`.
- Faux backend Supabase local :
  - auth offline ;
  - tables locales persistantes ;
  - storage fake ;
  - realtime no-op.
- Profil Mathias admin seedé :
  - `id`: `offline-user-mathias` ;
  - `pseudo`: `mathias` ;
  - `is_admin`: `true`.
- Pages testées :
  - `/` ;
  - `/dashboard` ;
  - `/profile` ;
  - `/admin`.
- Verification : `npm run build` OK.

## 2026-07-02 - Mode invite public

Ajout d'un mode invite pour que la premiere visite arrive directement sur le chrono au lieu d'une page login obligatoire.

Changements effectues :

- `/` redirige maintenant vers `/dashboard` pour tous les visiteurs.
- `Layout` n'oblige plus les visiteurs non connectes a aller vers `/login`.
- Le dashboard/chrono est visible sans compte.
- Les visiteurs peuvent tester le chrono avec des donnees locales `localStorage`.
- Les pages necessitant un compte affichent un panneau verrouille avec CTA login/signup :
  - stats ;
  - profil ;
  - planning ;
  - social ;
  - admin et autres pages internes.
- Le mode invite ne sauvegarde rien dans Supabase.
- Le mode invite n'appelle pas les mutations Supabase du dashboard.
- Le faux backend offline n'auto-connecte plus Mathias au chargement :
  - en mode offline dev, il faut passer par `/login` ;
  - n'importe quel identifiant local connecte le profil seedé Mathias admin.
- `AuthContext.signIn` bypass `/api/login` en mode offline dev pour eviter d'attendre Supabase prod.
- Verification navigateur :
  - invite : `/dashboard` visible ;
  - invite : `/stats` verrouille ;
  - invite : `/profile` verrouille ;
  - offline login : dashboard complet ;
  - offline login : `/admin` accessible.

## Important pour Claude/Codex

- Toujours lire `AI_CHANGELOG.md` avant de modifier le projet.
- Vert officiel Blocus Tracker :
  - vert principal : `#14B885` ;
  - variable CSS : `var(--bt-accent)` ;
  - Tailwind : `accent` / `text-accent` / `bg-accent` ;
  - vert fonce : `#0E8F68` ou `var(--bt-accent-dark)` ;
  - fond vert clair : `#EAFBF4` ou `var(--bt-accent-bg)` ;
  - bordure vert clair : `#C6EED9` ou `var(--bt-accent-border)`.
- Quand on ajoute du vert dans l'interface, utiliser en priorite les variables `--bt-accent`, `--bt-accent-dark`, `--bt-accent-bg` et `--bt-accent-border` plutot que d'inventer un nouveau vert.
- Ne jamais commit `.env.local`.
- Ne pas casser le vrai backend Supabase.
- Le mode offline doit rester uniquement local/dev.
- Ne jamais activer `NEXT_PUBLIC_OFFLINE_DEV=true` sur Vercel ou en production.
- Pour revenir au vrai backend Supabase : supprimer `NEXT_PUBLIC_OFFLINE_DEV=true` ou mettre `NEXT_PUBLIC_OFFLINE_DEV=false`, puis redemarrer le serveur local.
- Les donnees du mode offline sont locales au navigateur et stockees dans `localStorage`; elles ne representent pas la production.

## Règles de travail

- Avant chaque modification : lancer `git status`.
- Après chaque modification : lancer `npm run build`.
- Ne jamais faire `git add .`.
- Stage uniquement les fichiers necessaires.
- Toujours commit les changements valides avec un message clair.
- Ne jamais push sans confirmation explicite.
