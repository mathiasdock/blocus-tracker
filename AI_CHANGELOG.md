# AI_CHANGELOG.md

Ce fichier sert de suivi commun pour Claude Code et Codex. Toujours le lire avant de modifier le projet afin d'eviter les doublons, les inversions de changements ou les confusions entre mode local et production.

## 2026-07-02 - Sidebar desktop : cloche de notifications deplacee dans l'en-tete

Sur demande explicite (capture d'ecran annotee) : la cloche de notifications quittait sa place dans la liste de nav "Social" (melangee aux vraies pages Feed/Messages/Amis/Communautes alors qu'elle ouvre un panneau, pas une page) pour rejoindre l'en-tete a cote du logo.

- `components/Layout.js` :
  - `renderDesktopNotificationsItem()` (rangee pleine largeur dans la liste nav) renomme `renderDesktopNotificationsBell()` et transforme en bouton icone circulaire (`w-9 h-9`, meme style que la cloche du top bar mobile deja existante) — coherence entre les deux tailles d'ecran.
  - Retire de la liste "Social" ; ajoute dans le header du logo (`justify-between`, cote droit), visible uniquement hors invite.
  - Comportement inchange : toggle du panneau, badge de compteur non lu, position du `NotificationPanel` deja compatible (calee sur la hauteur d'en-tete).
- Verification : `npm run build` OK (20/20) + navigateur — cloche + badge visibles a cote du logo, clic ouvre bien le panneau au bon endroit, liste "Social" ne montre plus que les vraies pages (Feed/Messages/Amis/Communautes).

## 2026-07-02 - Profil : carte XP unifiee sur le langage ink (+6,5 Mo d'images mortes supprimees)

Dernier decalage d'identite de l'app : la carte XP du profil etait le seul endroit avec un fond photo + voile sombre, la ou tout le reste (hero chrono, percentile stats, TodayCard planning, mode Focus) utilise la surface ink.

- `pages/profile.js` (`XPProgressCard`) :
  - Coquille photo (2 `<img>` mobile/desktop + overlay `rgba(6,28,20,0.65)`) remplacee par `.card-ink bt-grain` — meme degrade + grain que partout ailleurs.
  - Couleurs alignees sur les tokens ink : `rgba(255,255,255,*)` -> `var(--bt-ink-text)` / `var(--bt-ink-muted)` / `var(--bt-ink-border)`.
  - Typo alignee : numero de niveau et valeurs XP en Space Grotesk tabulaire (`font-num`), titre de niveau en Bricolage (`font-display`) ; pastille de niveau passee au degrade officiel `#14B885 -> #0E8F68` (comme btn-primary).
  - Barre de progression, missions et grille de badges inchangees fonctionnellement.
- `public/fond d'ecran/` **supprime entierement** (~6,5 Mo) :
  - `format pc.png` / `format tel.png` : uniquement utilisees par la carte XP, desormais mortes.
  - `ECran d'entrée Tel.png` / `Ecran d'entrée PC.png` : verifiees byte-identiques (`cmp`) a `bg-mobile.png` / `bg-desktop.png` (les copies racine utilisees par `.auth-bg`) — doublons morts depuis longtemps.
  - Verifie par grep : plus aucune reference a `fond d'ecran` dans le code. Le precache PWA (sw.js auto-genere) ne les inclura plus au prochain build -> pages plus legeres a precacher.
- Verification : `npm run build` OK (20/20) + navigateur (mode offline dev), profil en light ET dark, mobile 375px — carte XP coherente avec le reste, aucune image cassee.

## 2026-07-02 - Chrono : degrade ink vivant + 4 ajouts (mode Focus)

Suite du brainstorm sur l'arriere-plan du Chrono. Option B retenue (degrade anime plutot que wallpaper photo) + les 4 ajouts "petits, reversibles".

- `styles/globals.css` :
  - `--bt-noise` : variable de bruit alpha-only (feTurbulence SVG en data-URI), theme-neutre.
  - `.bt-grain` : classe opt-in (grain + vignette via `::after`, `pointer-events:none`, `mix-blend-mode: overlay`) — reutilisable sur toute surface ink.
  - `.bt-ink-drift` + `@keyframes bt-ink-drift` : blob radial flou qui derive lentement (18s, transform uniquement — jamais `background-position`) derriere le contenu du mode Focus. Ajoute a `prefers-reduced-motion: reduce`.
- `pages/dashboard.js` :
  - Nouveau composant `ProgressRing` (SVG, viewBox fixe 200, `strokeDashoffset` anime) reutilise a 3 endroits : carte chrono principale (Libre + Pomodoro) et mode Focus.
  - Calcul du pourcentage : en Pomodoro, progression de la phase en cours ; en Libre, `(totalToday + elapsed) / DAILY_GOAL_SECS` — progression reelle vers l'objectif du jour, coherent avec `goalPct` et qui avance en temps reel pendant la session en cours.
  - Mode Focus : fond remplace par `var(--bt-ink)` + `.bt-ink-drift` (coupe automatiquement sur l'etat "pause" rouge, qui reste un flat `#220000`) + `.bt-grain`.
  - Halo pulse (`bt-pulse-green`, deja utilise sur la carte principale) etendu au mode Focus : applique sur le conteneur circulaire de l'anneau (forme naturelle pour un box-shadow qui se propage), actif uniquement quand `running`.
  - Message contextuel selon l'heure (`focusGreeting()`) en mode Focus : 4 tranches (matin/apres-midi/soir/nuit), discret, au-dessus du nom du cours.
  - `.card-ink` + `.bt-grain` ajoutes sur la carte "Aujourd'hui" (tout le contenu existant enveloppe dans un `relative z-10` pour rester au-dessus du nouveau `::after`).
- `pages/stats.js` : meme traitement `.bt-grain` sur la carte percentile (contenu deja dans un seul conteneur, juste passe en `relative z-10`).
- i18n : 4 nouvelles cles `dash.focusGreeting*` (FR+EN).
- Verification : `npm run build` OK (20/20) + navigateur (mode offline dev) — anneau verifie via `stroke-dashoffset` reel (50.1% pour 1h loggee/2h objectif, cross-check DOM), Libre/Pomodoro/Focus tous testes, etat pause rouge confirme sans derive/pulse, dark mode, mobile 375px, `bt-ink-drift` confirme present dans le bloc `prefers-reduced-motion`.

Non fait (mis de cote lors du brainstorm, pas demande) : wallpaper photo (option A) — reste disponible comme piste future si voulu, l'anneau/pulse/grain resteraient compatibles avec une image en fond.

## 2026-07-02 - Refonte complete de l'onglet Profil

Reorganisation totale de `pages/profile.js` (skill ui-ux-pro-max). Problemes corriges : cartes desorganisees, modeles d'interaction melanges (accordeon vs navigation de facon imprevisible), emojis "AI generated", redondances.

### Interaction unifiee — 3 affordances distinctes et coherentes
Nouveau composant `SettingsRow` partage. Chaque rangee exprime clairement ce qui va se passer :
- chevron bas (`IconChevronDown`) = se deplie sur place (accordeon)
- fleche droite (`IconChevronRight`) = mene a une autre page
- controle inline (segmented / toggle) = s'ajuste sur place
C'est le fix du "mal trie" : l'affordance annonce le comportement.

### Nouvelle architecture d'information (de haut en bas)
1. **Entete** (ink) + rail de 3 stats-cles (Niveau / Serie / Total) — chiffres surfaces immediatement, plus besoin de deplier "Mon activite" pour les voir.
2. **Progression** (carte XP) — rangee de 3 stats redondante supprimee (deja dans le rail de l'entete).
3. **Activite** — passee d'accordeon a **toujours visible** (c'est du contenu, pas un reglage) ; ne montre plus que les 2 stats distinctes du rail (30 jours + Record) + heatmap.
4. **Compte** — "Mes informations" + "Email" regroupes dans UNE carte, accordeons coherents.
5. **Notifications** (PushNotificationsCard).
6. **Parrainage** (ReferralCard) — descendu (promotionnel, pas identitaire).
7. **Preferences** — Langue + Apparence, controles en place uniquement.
8. **Aide & a propos** — Ameliorer l'app (nav), Installer l'app (accordeon), A propos (accordeon).
9. **Admin** (si admin) — carte dediee, navigations.
10. **Session** — Se deconnecter + Supprimer mon compte, **carte isolee** (action destructive separee, rouge).

### Dé-emojification complete
- `pages/profile.js` : drapeaux `🇫🇷🇬🇧` du selecteur de langue -> segmented "FR"/"EN" propre ; `🔒` (warning verrouille + BadgeSheet) -> `IconLock` SVG ; `✓` (badge obtenu) -> SVG check.
- `components/PushNotificationsCard.jsx` : `🔔` -> cloche SVG en chip accent, `📲` -> SVG telephone, `✅` -> SVG check.

### Nettoyage
Composants/vars devenus inutilises supprimes : `PrefRow`, `stats`, `activitySummary`, state `showActivity`, icones `IconGift`/`IconBell` non retenues. Warning "verrouille" et hover destructif rendus dark-safe (rgba au lieu de hex figes). Nouvelle cle i18n `profile.helpSection` (FR+EN).

### Verification
`npm run build` OK (20/20) + navigateur (mode offline dev) : profil complet parcouru en **light ET dark**, mobile 375px. Rail de stats OK, accordeon "Mes informations" se deplie avec le formulaire intact, selecteur FR/EN sans drapeaux, zone destructive isolee, zero emoji. profile.js : 995 -> 937 lignes.

## 2026-07-02 - Planning : unification des formulaires d'objectif

Refactor a iso-comportement : les 4 blocs de champs quasi-identiques (titre / cours / minutes / heure / recurrence) qui existaient sont remplaces par un seul composant `ObjectiveForm` controle.

- `pages/planning.js` :
  - Nouveau composant `ObjectiveForm` (controle : `value` {title,courseId,minutes,time,weekdays,until} + `onChange(patch)` + `onSubmit` + `onCancel` optionnel). Constante `EMPTY_OBJECTIVE_FORM` partagee.
  - Remplace les 4 formulaires dupliques :
    - `DayPanel` (ajout, cote lateral) — mappe l'etat contexte (title/courseId/... + newTime, garde le couplage TimeGrid -> heure pre-remplie) via un onChange qui route chaque patch vers le bon setter ; bouton "Ajouter" pleine largeur (pas de onCancel).
    - `ObjectiveRow` (edition inline dans la liste) — etait un `<li>` avec des `onClick`, devient un vrai `<form>` (Entree = submit).
    - `DayDetailModal` (ajout) — les 6 useState separes consolides en un seul objet `addForm`.
    - `DayDetailModal` (edition inline) — utilise `editForm` existant.
  - i18n : le `Cours —` en dur (4 occurrences) remplace par la cle `plan.courseSelect` (FR+EN).
  - Nettoyage : `courses` retire des destructurations de `ObjectiveRow` et `DayDetailModal` (desormais recupere via le contexte par `ObjectiveForm`).
- Verification : `npm run build` OK + navigateur (mode offline dev) : les **4** sites testes en creation ET edition — ajout via DayPanel (avec weekday + reset du formulaire), ajout via modal, edition inline modal (titre modifie sauve), edition inline ObjectiveRow (pre-remplie, 7 pastilles). Recurrence "↻ hebdo" correctement persistee et affichee. Tout coherent visuellement (meme layout de champs partout).

## 2026-07-02 - Planning : modernisation TimeGrid (vue Semaine/Jour)

Alignement de la grille horaire (vue Semaine et vue Jour) sur la passe design "instrument de focus". C'etait la partie la plus datee du fichier : couleurs hex en dur, aucun support dark mode, ancienne typo.

- `pages/planning.js` (`TimeGrid` + toggle de vue de l'en-tete) :
  - Tous les hex en dur (`#E8E2DC`, `#F7F3EF`, `#EAFBF4`, `#F0FBF6`, `#A8A09A`, `#1F1A17`, `bg-white`, `bg-stone-50/60`, `border-stone-*`) remplaces par les variables CSS `--bt-*` -> **dark mode fonctionne enfin** sur la grille horaire (avant : grille blanche figee en mode sombre).
  - Colonne du jour : teinte `rgba(20,184,133,0.06)` (voile accent lisible en light ET dark) au lieu du `#F0FBF6` fige.
  - Chiffres (numeros de jour dans l'en-tete, heures `07h`, minutes des blocs) passes en Space Grotesk tabulaire (`font-num`).
  - Toggle Jour/Semaine/Mois de l'en-tete : hex en dur -> variables, dark-safe.
  - i18n : 2 chaines FR en dur corrigees (`Tj.` -> `plan.allDayShort`, `Examen :` -> `plan.examTag`), FR+EN.
- Verification : `npm run build` OK + navigateur (mode offline dev), vue Semaine en light ET dark, colonne du jour teintee, chips objectifs/examens lisibles, plus aucune fuite light-mode en dark.

## 2026-07-02 - Planning : 3 nouvelles fonctionnalites (paquet 🟡)

Suite de l'analyse planning. Implementation des 3 fonctionnalites "valeur moyenne / effort modere" retenues.

### 1. Carte "Aujourd'hui" permanente (`TodayCard`)

- Nouvelle carte `.card-ink` (meme langage que le hero chrono du dashboard et la carte percentile des stats) affichee en permanence en tete de page, avant meme le calendrier — independante de la date navigee/selectionnee.
- Contenu condense : ratio objectifs faits/total du jour, prochain examen (ou nombre d'examens si un examen tombe aujourd'hui), jusqu'a 3 objectifs du jour avec checkbox de completion inline + bouton de lancement du chrono.
- Clic sur la carte (hors checkbox/bouton) -> ouvre `DayDetailModal` sur aujourd'hui.

### 2. Recurrence par jours de semaine + date de fin

- **Nouvelle migration** `supabase/migration_v23_objective_recurrence_weekdays.sql` (a executer manuellement) : ajoute `objectives.recurrence_weekdays` (integer[], jours JS getDay() 0-6) et `objectives.recurrence_until` (date). Contrainte CHECK sur les valeurs 0-6.
- Nouveau composant partage `RecurrencePicker` (7 pastilles Lun->Dim + champ date de fin optionnel) integre dans les **3** formulaires d'objectif : `DayPanel` (ajout), `ObjectiveRow` (edition inline), `DayDetailModal` (ajout ET edition inline — cette derniere n'avait *aucun* champ recurrence avant et effacait silencieusement la recurrence existante a chaque edition, bug corrige au passage).
- Retro-compatibilite : `weekdaysFromObjective()` derive un tableau de jours a partir de l'ancien `recurrence` ('daily'=7 jours, 'weekly'=jour de `scheduled_date`) pour les lignes existantes, donc aucune migration de donnees necessaire — l'edition d'un ancien objectif recurrent bascule naturellement vers le nouveau format des sa prochaine sauvegarde.
- `toggle()` (marquer termine) et le badge d'affichage (`↻ Lun Mer`, ou "quotidien"/"hebdo" pour les motifs simples) utilisent la meme logique de calcul du prochain jour, qui respecte desormais la date de fin.

### 3. Pont Planning -> Chrono

- Bouton "lancer" (icone play) sur les objectifs du jour meme (dans `TodayCard` et `ObjectiveRow`, uniquement quand `scheduled_date === aujourd'hui` et qu'un cours est associe).
- `launchTimer(courseId)` (nouvelle fonction de contexte) pre-remplit `TimerContext.courseId` puis navigue vers `/dashboard` — le chrono est deja pret a demarrer, plus besoin de rechoisir le cours manuellement.
- Garde-fou : si une session est deja en cours (ou du temps non enregistre en pause) sur un **autre** cours, une confirmation est demandee avant d'ecraser (meme logique que `confirmDiscardIfWorking` deja utilisee sur le dashboard) — aucune perte de temps silencieuse.

### Divers
- 9 nouvelles cles i18n FR+EN (`plan.recurrenceUntil`, `plan.recurDaily`, `plan.recurWeekly`, `plan.launchTimer`, `plan.confirmSwitchCourse`, `plan.todayCard*`).
- Verification : `npm run build` OK (20/20) + verification navigateur complete (mode offline dev) : creation d'un objectif avec recurrence Lun+Mer+date de fin, badge affiche correctement, formulaire se reinitialise apres ajout, lancement du chrono depuis planning confirme (cours pre-rempli sur /dashboard), tout verifie en light ET dark, desktop ET mobile 375px.

**Action utilisateur requise** : executer `supabase/migration_v23_objective_recurrence_weekdays.sql` dans le Supabase SQL Editor avant que la recurrence par jours personnalises fonctionne en production (daily/weekly legacy continuent de fonctionner sans la migration).

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
