# AI_CHANGELOG.md

Ce fichier sert de suivi commun pour Claude Code et Codex. Toujours le lire avant de modifier le projet afin d'eviter les doublons, les inversions de changements ou les confusions entre mode local et production.

## 2026-07-14 - Correctif affichage du code de parrainage

- `lib/offlineSupabaseClient.js` renvoie desormais le meme contrat que la RPC live `get_my_referral_stats` (`ok`, `code`, `count`, `list`). L'ancien contrat local (`referral_code`, `referrals_count`) laissait la carte bloquee sur `...`.
- `pages/profile.js` utilise aussi `profile.referral_code` comme repli si la RPC de statistiques est temporairement indisponible. Le lien reste donc visible sans masquer une erreur reseau ponctuelle.
- Verification Supabase live : 234 profils, aucun `referral_code` vide, RPC `get_my_referral_stats()` presente, `SECURITY DEFINER` et executable par `authenticated`. Aucune donnee de parrainage n'a ete modifiee.

## 2026-07-14 - Gamification v28 : progression coherente et autoritaire cote serveur

Application des 8 recommandations issues de l'audit gamification, sans supprimer de progression historique.

1. **XP canonique** : ajout de `get_gamification_levels(uuid[])`. Profil, classements et admin utilisent desormais le meme calcul serveur (temps, objectifs, serie, examens, badges et bonus) avec fallback compatible offline.
2. **XP protege et tracable** : `profiles.bonus_xp`, `referred_by` et `referral_code` ne sont plus modifiables directement par un utilisateur. La nouvelle table `xp_ledger` rend les recompenses de missions idempotentes et auditables.
3. **Badges fiables** : attribution centralisee cote Postgres, lecture seulement pour l'utilisateur/admin, ecritures client bloquees et backfill des badges merites manquants. `user_badges.earned_at` remplace les usages errones de `created_at`.
4. **Missions quotidiennes serveur** : quatre missions deterministes par jour et par utilisateur, une par categorie, avec objectifs de duree/focus adaptes aux 14 derniers jours. Les recompenses sont creditees une seule fois. Le mode offline conserve un evaluateur local coherent.
5. **Courbe de niveaux lissee** : 20 seuils progressifs de 0 a 100 000 XP, sans faire redescendre les utilisateurs existants. Les titres FR/EN ont ete simplifies et rendus plus calmes.
6. **Temps local coherent** : ajout de `profiles.timezone` (defaut `Europe/Paris`) et detection du fuseau de l'appareil. Series, journees et missions utilisent cette timezone plutot qu'un decoupage UTC implicite.
7. **Sessions anti-abus** : nouvelle session limitee a 12 h, timestamps coherents avec la duree, pas de futur lointain et maximum 16 h creditees par jour. Le chrono local se met en pause automatiquement a 12 h. Les anciennes sessions restent intactes.
8. **Equilibrage et corrections** : missions photo/ami/6 h retirees, textes de badges sociaux rendus generiques, parrainage fixe a 600 XP total les jours concernes et actions admin alignees sur le calcul canonique.

Migrations Supabase appliquees sur le projet live :

- `supabase/migration_v28_gamification_integrity.sql` ;
- `supabase/migration_v28_1_gamification_advisor_fixes.sql`.

Verification live : 97 badges merites manquants ont ete ajoutes (aucun badge retire), aucune timezone vide, droits d'ecriture client bloques sur XP/badges, garde sessions active et RPC canoniques disponibles. Les deux avertissements Security Advisor restants concernent volontairement les deux RPC `SECURITY DEFINER`, exposees uniquement aux utilisateurs authentifies et limitees aux donnees de progression autorisees.

## 2026-07-14 - 6 pages SEO traduites (visible EN, meta/JSON-LD toujours FR)

Suite au choix utilisateur ("les traduire aussi") : les 6 pages SEO mots-cles suivent maintenant la langue de l'appareil pour le CONTENU VISIBLE, tout en gardant leur SEO francais.

- **`lib/seoLandingPagesEn.js`** (nouveau) : traductions anglaises des champs VISIBLES des 6 pages (eyebrow, h1, lead, shortAnswer, ctaLabel, secondaryCtaLabel, proofPoints, sections{title,body,bullets}, featurePanel, related, faq), clees par path. PAS de title/description (ils restent FR).
- **`components/SeoLandingPage.js`** : lit `lang` (I18nContext). Si anglais → fusionne les champs visibles EN par-dessus la page FR (`{ ...page, ...en }`) + un dico `UI` bilingue pour les chaines fixes de la coquille (header, "Reponse courte"/"Short answer", "Inclus"/"Included", "Continuer intelligemment"/"Keep going, smartly", FAQ, CTA final). `secondaryCtaHref` et les hrefs restent structurels.
- **SEO preserve** : `components/SeoHead.js` continue de lire `lib/seoLandingPages.js` (FR) pour `<title>`, `<meta description>` et le JSON-LD FAQPage → c'est le FRANCAIS qui est indexe pour les mots-cles FR ciblés. Le SSG rend le francais ; l'anglais s'affiche cote client apres hydratation. Aucune modification de seoLandingPages.js (FR inchange).

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK puis `npm run build` normal OK ; script de couverture confirme que les 6 paths ont leur traduction EN. En navigateur (build offline, navigateur en-GB) `/pomodoro` : contenu visible ANGLAIS (H1 "The Pomodoro method: revise without burning out", "FOCUS METHOD", "Short answer", "Included", "Try the Pomodoro timer" — capture) MAIS `document.title` reste "Methode Pomodoro pour reviser | Timer etudiant gratuit" (FR, meta SEO intacte). Preference FR forcee + reload → francais d'origine ("Methode Pomodoro : reviser sans s'epuiser"), zero fuite EN, zero texte accentue residuel. Zero erreur console.

## 2026-07-14 - Landing publique traduite (suit la langue de l'appareil)

Suite du device-language : la landing `pages/index.js` etait en francais code en dur (0 i18n) et ne suivait pas l'appareil. Traduite pour suivre `lang` comme le reste de l'app.

- **`lib/landingContent.js`** (nouveau) : objet de contenu bilingue `getLandingContent(lang)` — TOUT le texte de la landing en fr + en (hero, stats, focus, planning, stats, social, visite guidee des 6 espaces, methode + parcours, guides, FAQ, CTA, footer, alts d'images, aria-labels). Meme pattern que `lib/seoLandingPages.js`. Le francais reproduit l'original a l'identique (aucune regression pour les francophones).
- **`pages/index.js`** : les 4 tableaux de contenu (STATS/APP_AREAS/STUDY_FLOW/EXTRA_GUIDES) reduits a leurs champs STRUCTURELS (dimensions, screenshots, liens, ids) ; le texte est fusionne par langue dans le composant (`const c = getLandingContent(lang)`). Toutes les chaines JSX passees en `c.*`. (Piege corrige : la section Social faisait `.map((c, i) => …)` qui masquait l'objet contenu `c` → variable de map renommee `fig`.)
- **`lib/seo.js`** : ajout de `HOME_FAQ_EN` (traduction anglaise de la FAQ d'accueil). Le JSON-LD SEO continue d'utiliser `HOME_FAQ` (francais) — c'est ce qui est indexe pour les recherches francophones ; la FAQ VISIBLE suit l'appareil.
- **SEO-safe** : le HTML genere au build (SSG) reste francais → Google indexe le francais ; l'anglais s'affiche cote client apres hydratation pour les appareils anglophones. Les balises meta/JSON-LD (lib/seo.js) restent francaises.

**Pas encore fait** : les 6 pages SEO mots-cles (`/pomodoro`, `/planning-revision`, `/stats-etude`, `/objectifs-etude`, `/blocus-belgique`, `/application-etudiant`, via `lib/seoLandingPages.js` + `components/SeoLandingPage.js`) restent en francais. Elles ciblent des mots-cles de recherche FRANCAIS : un anglophone n'y arrive pas via ces requetes, donc le gain d'une traduction est marginal (a discuter avec l'utilisateur avant de traduire ~490 lignes de contenu).

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK puis `npm run build` normal OK (page `/` 11.9 kB). En navigateur (build offline, navigateur en-GB, visiteur deconnecte) : landing entierement en ANGLAIS (H1 "The timer that makes your exam prep clearer.", nav "Features/Explore the app/FAQ/Sign in/Create my space", onglets "Timer/Planning/Stats/Progress/Social/Communities", methode, FAQ, CTA, footer — capture hero + capture visite guidee). Preference FR forcee + reload → francais a l'identique de l'original, zero fuite EN. Seuls textes accentues restants = noms d'ecoles reels (ULiege, HEC Liege, Galilee), a ne pas traduire. Zero erreur console.

## 2026-07-14 - Langue de l'app selon l'appareil (fr/en auto) + selecteur Auto/FR/EN

Demande utilisateur : "blocus tracker doit etre en anglais ou en francais en fonction de l'appareil" (telephone en anglais → app en anglais, et inversement).

Constat prealable (important) : `profiles.lang` est `text NOT NULL default 'fr'` (migration_v3) — impossible de distinguer "choix explicite" du "defaut fr" cote base. Et `components/Layout.js` FORCAIT `setLang(profile.lang)` au chargement pour les connectes → c'est ce qui aurait ecrase toute detection appareil. Verifie aussi que les push suivent DEJA l'appareil : `lib/pushServer.js` envoie l'objet `{fr,en}` complet a OneSignal, et `lib/onesignal.js` ne force jamais la langue → OneSignal sert la bonne langue par appareil tout seul. Donc `profile.lang` ne pilotait QUE l'affichage in-app.

- **`contexts/I18nContext.js`** : nouvelle logique. Langue effective = preference manuelle locale si presente, sinon **langue de l'appareil** (`detectDeviceLang()` : `navigator.languages` → "en" si un code commence par en, "fr" si fr, sinon fr — public francophone). Nouveau state `langPref` ("auto"|"fr"|"en") + `setLangPref`. Cle de stockage `bt_lang_pref` (presente UNIQUEMENT si choix manuel). **Migration douce** : un ancien `bt_lang === "en"` (l'ancienne cle, polluee en "fr" pour tout le monde par l'ancien sync, mais "en" ne pouvait venir que d'un choix explicite car le defaut etait "fr") est promu en `bt_lang_pref="en"` → les rares utilisateurs ayant explicitement choisi l'anglais le gardent ; tous les autres suivent desormais leur appareil. `setLang` conserve en alias de compat.
- **`components/Layout.js`** : suppression du `useEffect` qui forcait `profile.lang` → l'app ne re-ecrase plus la detection appareil pour les connectes.
- **`pages/profile.js`** : le selecteur de langue passe de [FR|EN] a **[Auto|FR|EN]** (`langPref`/`setLangPref`). "Auto" = suivre l'appareil (efface `bt_lang_pref`). `changeLang` met encore a jour `profile.lang` (NOT NULL) avec la langue effective pour les donnees admin, mais ca ne pilote plus l'affichage. Garde `if (user)` autour de l'update DB (les invites peuvent changer la langue localement).
- **i18n** : cle `profile.languageAuto` = "Auto" (FR + EN).

**Limite connue a signaler** : la landing publique `pages/index.js` (et les pages SEO) sont en francais CODE EN DUR (0 usage i18n) — elles ne suivent PAS l'appareil. Seule l'app (toutes les pages basees sur `t()`) suit la langue. Traduire la landing = chantier separe.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK puis `npm run build` normal OK. En navigateur (build offline, navigateur en `en-GB`) : compte `mathias` (profile.lang="fr") connecte → dashboard/profil en ANGLAIS (nav "Timer/Activity/Communities", "Choose a goal", "Start") malgre profile.lang="fr" — l'ancien forcage est bien neutralise. Selecteur [Auto|FR|EN] avec "Auto" actif ; clic FR → app francaise + `bt_lang_pref="fr"` ; rechargement → reste francais (segment FR vert) ; clic Auto → efface la pref + revient a l'anglais (appareil). Logique `detectDeviceLang` verifiee (fr-FR/fr-BE→fr, en-US→en, nl-BE/es-ES→fr, mixte→1er match). Migration douce verifiee (`bt_lang="en"` sans pref → promu `bt_lang_pref="en"` au reload). Zero erreur console.

## 2026-07-14 - Retrait du lien "Boite a suggestions" de la sidebar admin (redondant)

Demande utilisateur (capture d'ecran a l'appui) : le lien "Boite a suggestions" sous "Admin" dans la sidebar menait a `/feedback`, qui affiche (pour un admin) la meme liste que Admin -> Contenu -> Suggestions dans `pages/admin.js`. Raccourci redondant, source de confusion.

- **`components/Layout.js`** : `NAV_ADMIN_FEEDBACK` (definition + appel `renderDesktopNavItem`) retire de la section Admin de la sidebar desktop. Seul point d'usage dans tout le repo (verifie par grep) — aucune duplication mobile a nettoyer.
- **`lib/i18n.js`** : cle `nav.suggestionInbox` (FR+EN) supprimee, devenue orpheline.
- **`pages/feedback.js` INCHANGE** : cette page fait double usage — un formulaire d'envoi ouvert a tous les utilisateurs (lie depuis les parametres du profil, `pages/profile.js`) ET, en plus, une section admin en bas de page qui duplique la meme liste. Seul le RACCOURCI de nav est retire ; la page et son formulaire restent pleinement fonctionnels et atteignables depuis le profil.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK puis `npm run build` normal OK. En navigateur (build offline, compte admin) : lecture DOM de la sidebar confirme que la section Admin ne contient plus que "Admin" (plus de "Boite a suggestions") ; `/feedback` reste accessible directement et son formulaire s'affiche normalement. Zero erreur console. (La sidebar desktop `lg:` n'est pas visible dans cet environnement de preview, plafonne a 382px de large — verification faite par lecture directe du DOM du `<nav>` plutot que par capture.)

## 2026-07-13 - Palette de couleurs des cours : 16 -> 20, plus de teintes qui se confondent

Demande utilisateur : "il y a trop de couleurs qui se ressemblent [...] par exemple, il y a trois types de violets". La palette avait effectivement indigo `#6366f1`, violet `#8b5cf6`, purple `#7c3aed` a quelques degres d'ecart de teinte, tout en n'ayant aucun marron, gris-bleu ou vert-prairie.

- **`lib/courseColors.js`** (nouveau) : `COURSE_COLORS`, 20 teintes espacees d'au moins ~15 degres sur le cercle chromatique. Le trio violet est reduit a 2 teintes bien separees (indigo, violet — l'ancien "purple" du milieu est retire). 3 couleurs "hors camaieu vif" ajoutees (marron, ardoise, bordeaux) pour de vraies options supplementaires sans recreer un cluster proche d'une couleur deja utilisee.
- **`pages/dashboard.js`** et **`pages/onboarding.js`** avaient CHACUN leur propre tableau `COLORS` code en dur (copie identique) — remplaces par un import de `COURSE_COLORS`, pour eviter que les deux ecrans se desynchronisent a l'avenir.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK puis `npm run build` normal OK. En navigateur (build offline) : 20 pastilles confirmees par lecture DOM sur le dashboard (defilement horizontal, capture rouge->emeraude, capture teal->rose avec la zone violette reduite a 2, capture marron/ardoise/bordeaux en fin de liste) et sur l'onboarding (grille complete 7x3 visible d'un coup, capture clair + sombre). Zero erreur console.

## 2026-07-13 - Mascotte coach : progression utile, discrete et non intrusive

Demande utilisateur : faire de la mascotte un petit coach signature dans les moments utiles (chrono, progression, interpretation des stats, planning et etats vides), sans popups repetitives ni distraction pendant l'etude.

- **`components/MascotCoach.js`** (nouveau) : composant reutilisable avec formats bulle, integre et mascotte seule. Il gere la fermeture, la non-repetition par session ou par jour via le stockage local, un seul message a la fois et 6 paliers semantiques de serie (0, 1-2, 3-6, 7-13, 14-29, 30+). Aucune requete reseau et aucune donnee Supabase ajoutee.
- **Chrono** (`pages/dashboard.js`) : coach visible avant le depart, en pause et pendant 8 secondes lors d'un bloc, objectif ou record valide. Il disparait pendant le travail normal. Le message passe en rappel doux apres 10 minutes de pause. La fin de session utilise la notification existante, maintenant accompagnee de la mascotte et fermable. La mascotte decorative de la carte Aujourd'hui est retiree pour eviter le doublon ; la serie reste affichee comme badge.
- **Profil** (`pages/profile.js`) : la mascotte quitte le cover decoratif et rejoint la carte Ma progression. Elle annonce en priorite un nouveau badge, une serie maintenue aujourd'hui ou les XP restants avant le niveau suivant. Elle ne figure jamais dans les reglages.
- **Stats et Planning** (`pages/stats.js`, `pages/planning.js`) : une seule intervention dans le resume Stats (journee a relancer, objectif proche, record, regularite) et un seul conseil sous la carte Aujourd'hui du planning (examen a J-7 sans preparation, journee chargee, planning vide ou pret).
- **Etats vides** (`components/EmptyState.js`, `pages/feed.js`, `pages/messages.js`, `pages/communautes.js`) : la mascotte remplace l'illustration seulement dans les etats vides utiles d'Activite, Social et du salon Communaute. Elle n'apparait jamais dans une conversation DM ou groupe active.
- **i18n** (`lib/i18n.js`) : textes complets FR/EN, ton court et non culpabilisant. Les animations restent celles de `Mascot.js`, deja couvertes par `prefers-reduced-motion`; le coach n'ajoute aucune animation de conteneur.

Verifie : `npm run lint` clean, `npm run build` OK (26/26), `git diff --check` clean. Navigateur en build de production local : Chrono desktop + mobile 390 px, Profil mobile, Stats mobile, Planning mobile et Social desktop. Une seule mascotte visible par page, zero mascotte dans un groupe actif, aucun overflow horizontal et zero erreur console.

## 2026-07-13 - Accueil public et mode decouverte : vraie visite produit guidee par la mascotte

Demande utilisateur : l'accueil SEO representait mal l'app (section Guides trop generique, FAQ pauvre, mauvaise impression typographique) et le mode invite ne montrait pas assez les espaces disponibles. Ajout egalement de compteurs animes sur la bande de chiffres.

- **`pages/index.js`** : toute la landing utilise maintenant explicitement la police de marque **Bricolage Grotesque** (`font-display`), avec Space Grotesk conservee pour les chiffres. La bande 200+ / 80 / 5 / 100% s'anime une seule fois de 0 a la valeur finale quand elle entre dans le viewport (980 ms, ease-out, `prefers-reduced-motion` respecte, valeur finale conservee dans le HTML SSR pour le SEO).
- **Visite produit interactive** : l'ancienne section mobile generique est remplacee par 6 espaces selectionnables — Chrono, Planning, Stats + historique, Progression + profil, Feed/Social, Communautes. Chaque selection change le vrai screenshot, les capacites expliquees et la bulle de la mascotte. CTA central "Creer un compte pour garder ma progression" ; le chrono reste testable sans compte. Les onglets sont scrollables sans barre visible sur mobile.
- **Section Guides refaite** : elle devient "La methode Blocus Tracker", une boucle en 4 etapes fidele au produit (decider, se concentrer, progresser, mesurer/ajuster). Les 6 pages SEO restent toutes maillees, mais dans un contexte utile : planning, Pomodoro, objectifs, stats, choix d'une application et reussite du blocus.
- **FAQ enrichie et synchronisee SEO** : 9 questions/reponses concretes (fonctionnement de l'app, gratuite, mode invite, difference avec un simple Pomodoro, planning, social, mobile/PWA, blocus, confidentialite). `HOME_FAQ` vit desormais dans `lib/seo.js` et alimente a la fois l'UI et le JSON-LD `FAQPage`, donc aucun decalage possible entre contenu visible et donnees structurees.
- **Mode decouverte de l'app** (`components/Layout.js`, `pages/dashboard.js`) : la navigation invite montre desormais Chrono, Planning, Stats, Activite, Social, Communautes et Profil sur desktop, avec les 5 entrees principales sur mobile. Le dashboard invite accueille le visiteur avec la mascotte en bulle + raccourcis vers les espaces. Chaque page protegee affiche une preview dediee (vraie promesse + 3 capacites), guidee par la mascotte, puis les CTA compte/retour chrono. Les donnees et fonctions restent verrouillees tant que l'utilisateur n'a pas de compte.
- Aucun changement Supabase, aucune migration, aucune donnee modifiee.

Verifie : `npm run lint` clean, `npm run build` OK (26/26). Navigateur en build de production : accueil desktop 1440 px + mobile 390 px, police calculee Bricolage Grotesque, aucun overflow (`scrollWidth == viewport`), compteur observe de 0 a 200/80/5/100, changement d'onglet Chrono -> Planning (texte + image + mascotte), FAQ 9 entrees, dashboard invite mobile, page Planning verrouillee mobile et page Social verrouillee desktop. Zero erreur console en build de production.

## 2026-07-13 - Mascotte v2 : micro-animations facon Duolingo + presence sur le site public

Demande utilisateur : "il faut que le chien soit plus anime comme la mascotte Duolingo et il faut aussi qu'il apparaisse sur le site, anime".

- **`components/Mascot.js`** : le SVG est restructure en groupes animables (`.bt-m-all`, `.bt-m-tail`, `.bt-m-eyes`, `.bt-m-z1/2/3`, `.bt-m-flame`, `.bt-m-spark`) + prop `animated` (defaut true, classe racine `.bt-m-anim`). **Piege SVG documente dans le fichier** : une animation CSS `transform` ECRASE l'attribut `transform` de l'element — la flamme (qui a un placement statique `translate(83,6) scale(0.8)`) est donc imbriquee dans un double groupe (transform statique sur le parent, animation sur l'enfant).
- **`styles/globals.css`** : 8 nouveaux keyframes `bt-m-*` + classes pilotees par l'humeur. Par etat : endormi = respiration lente 5s + "zzz" qui flottent en boucle (stagger 0.55s/1.1s, opacite geree par l'animation) ; calme (serie 1-6) = respiration 3.4s + clignement des yeux toutes les ~4.6s + coup de queue occasionnel ; excite (7+) = rebond periodique (translateY % de la bbox, `transform-box: fill-box`) + queue qui remue vite (0.45s alternate) + clignement ; en feu (30+) = idem + flamme qui vacille (0.9s) + etincelle qui scintille. Toutes les classes ajoutees au bloc `prefers-reduced-motion` (animation: none).
- **`pages/index.js`** (site public) : 2 apparitions. Hero — le chien "heureux" est perche sur l'arete superieure du cadre navigateur du screenshot (a gauche, en contrepoids du telephone flottant a droite ; tailles responsive h-14/sm:h-20, offsets -50px/-71px calcules pour que les pattes se posent sur l'arete). CTA final — le chien "en feu" au-dessus de "Lance ta premiere session maintenant." sur la surface ink. Les deux en `aria-hidden` (decoratifs).
- Aucune nouvelle cle i18n, aucune migration.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK puis `npm run build` normal OK. En navigateur (build offline) : landing en visiteur deconnecte (session offline retiree) → 2 mascottes, animations LIVE prouvees par echantillonnage des matrices de transform a 300ms d'intervalle (queue : -5,7° → +10,2°) et par `animationName` calcule (hero : bounce+blink+wag ; CTA : + flamme `bt-m-flick` + etincelle `bt-m-spark` + queue 0.45s) ; dashboard reconnecte (session offline forgee — NB : le formulaire de login ne peut pas etre rempli par l'eval du preview, monde isole → ecrire directement `bt_offline_session_v1`, forme `{user: {id: "offline-user-mathias", ...}, access_token: "offline-token"}`) → chien calme qui respire + cligne ; celebration 100 j → excite, flamme + etincelle animees. Zero erreur console partout. Captures hero + CTA prises.

## 2026-07-13 - Mascotte : un chien qui reagit a la serie (identite de marque)

Demande utilisateur (proposition design F) : une mascotte facon Duolingo/Forest, liee au systeme de serie (contente en serie haute, endormie a 0). Apres exploration visuelle (6 animaux proposes : renard/chat/ours/tortue en vert, puis chien/aigle en couleurs reelles), l'utilisateur a choisi le **chien en couleurs reelles**.

- **`components/Mascot.js`** (nouveau) : petit chien type shiba, SVG dessine a la main dans un viewBox 0 0 120 120. C'est le SEUL endroit de l'app qui sort du vert monochrome (exception de marque assumee) : pelage fauve/creme naturel, mais **collier vert #14B885** comme ancre. Export `mascotState(streak)` + `MASCOT_CAPTION_KEY`. 4 etats selon la serie : `0` endormi (oreilles tombantes, yeux fermes, "zzz"), `1-6` content (assis, sourire calme), `7-29` heureux (langue sortie, queue haute), `30+` en feu (heureux + petite flamme ambre, comme la serie). Rendu net a toutes les tailles (42 → 116 px).
- **Cablage (3 emplacements)** : `pages/dashboard.js` (le badge serie de la carte "Aujourd'hui" devient chien + compteur — le chien reflete la serie du jour) ; `pages/profile.js` (le chien depasse du cover du hero, reflete la serie du profil) ; `components/Celebration.js` (la variante serie affiche desormais la mascotte a la place du medaillon flamme → ton chien fete le palier avec toi ; le medaillon vert reste pour le level-up). Suppression au passage du composant `Flame` devenu mort dans Celebration.
- **i18n** : 4 cles `mascot.*` (legendes d'etat, utilisees en aria-label), FR + EN.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK, puis `npm run build` normal OK. En navigateur (build offline, compte a serie 3) : chien "content" dans le badge du dashboard et sur le cover du profil ; via la trappe QA des celebrations, chien "en feu" a 30 jours (flamme + etincelle) et "heureux" a 7 jours (langue, sans flamme). Clair ET sombre (le chien fauve/creme reste lisible sur les surfaces ink et sur `--bt-surface`). Zero erreur console.

## 2026-07-13 - Etats vides : petit set d'illustrations "trait unique" (vert de marque)

Demande utilisateur (proposition design D) : remplacer les etats vides generiques (icone + texte, ou juste un tiret) par un petit set d'illustrations au trait, dans le vert de marque, coherentes avec le reste — pas une nouvelle direction artistique.

- **`components/EmptyState.js`** (nouveau) : 8 illustrations SVG au trait unique dans un viewBox 0 0 96 96 (messages, friends, leaderboard, feed, questions, resources, exams, generic), meme langage que les icones deja utilisees partout (stroke fin, coins arrondis). Couleur pilotee par `currentColor = var(--bt-accent)` posee par le wrapper → dark-mode safe, aucune couleur en dur. Les aplats utilisent currentColor a 10 % (lisibles clair + sombre). Export d'un wrapper `<EmptyState illustration title subtitle action />` + de la map `emptyIllustrations` pour les cas sur mesure.
- **Cablage** : `pages/communautes.js` (le `TabEmptyState` passe du filigrane logo a une illustration par onglet : Salon→messages, Questions→questions, Ressources→resources, Examens→exams) ; `components/Leaderboard.js` (le simple tiret d'un classement vide → illustration podium + message) ; `pages/feed.js` (texte nu → illustration feed) ; `pages/messages.js` (l'icone "users" generique de l'etat "Bienvenue dans Social" → illustration friends).
- **i18n** : `feed.emptyTitle`, `stats.leaderboardEmptyTitle`, `stats.leaderboardEmptySubtitle` (FR + EN). Les autres etats reutilisent leurs cles existantes.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK, puis `npm run build` normal OK. En navigateur (build offline) : etat "Bienvenue dans Social" (illustration friends, confirmee dans le DOM), onglet Examens vide d'une communaute (illustration calendrier + coche, capture), onglet Questions vide (bulle + point d'interrogation, capture) — le point d'interrogation et le calendrier (les 2 traces les plus complexes) rendent proprement. Dark mode verifie (illustration + texte lisibles via tokens). Zero erreur console.

## 2026-07-13 - Gamification : moment de celebration unifie (paliers de serie + level-up)

Demande utilisateur (proposition design B) : un moment de celebration ORCHESTRE pour les paliers de serie (7/30/100 jours) ET le level-up — un seul effet marquant, pas des micro-animations partout. Constat : le level-up avait deja sa modale (confettis + pop-in + lueur) via `GlobalLevelUpWatcher` dans `_app.js`, mais franchir un palier de serie ne declenchait AUCUN moment (le badge etait juste attribue en silence).

- **`components/Celebration.js`** (nouveau, remplace `components/LevelUpModal.jsx` supprime) : UN seul effet reutilise pour les deux cas via une prop `data` (`{kind:"level",...}` ou `{kind:"streak", days}`). Meme medaillon vert de marque + lueur `bt-pulse-green` + confettis + `bt-pop-in`, differencie seulement par le glyphe (flamme + nombre de jours / "Niv." + niveau) et le texte. Echap pour fermer, auto-fermeture 5,5 s, croix toujours visible. Dark-mode safe (tokens), reduced-motion couvert (les 3 animations sont deja dans le bloc `prefers-reduced-motion`).
- **`lib/userLevels.js`** : `loadUserLevelMap` expose desormais `streak` (purement additif — la valeur etait deja calculee en interne, aucune requete en plus ; les autres consommateurs l'ignorent).
- **`pages/_app.js`** : le watcher global detecte maintenant AUSSI les paliers de serie a partir du meme calcul de niveau. File d'attente (`queueRef`) : si un level-up ET un palier tombent au meme check (ex. le badge serie fait aussi monter de niveau), les deux s'affichent l'un apres l'autre au lieu de s'ecraser. Paliers volontairement rares (7/30/100 seulement — on ne fete pas chaque badge serie 3/14, sinon ca perd son sens), jamais re-fetes (modele "plus haut palier atteint", comme les badges/niveaux ; un `localStorage blocus:last-streak-milestone:<uid>` + un repere en memoire evitent tout spam, et un premier passage fixe la baseline pour ne rien fanfaronner aux comptes deja avances).
- **Trappe de QA (build offline UNIQUEMENT)** : `?bt_celebrate=streak:7|level:5` et `window.__btCelebrate(...)` permettent de previsualiser une celebration sans franchir un vrai palier. Gardee derriere `isOfflineDev` (false en prod) → entierement eliminee du bundle Vercel.
- **i18n** : 5 cles `streak.celeb*` (titre + 3 sous-titres par palier + caption), FR + EN.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK, puis `npm run build` normal OK. En navigateur (build offline) via la trappe QA : variante serie 7 (medaillon flamme "7", "7 jours d'affilee !", 16 confettis, capture) et 30/100 ; variante niveau 5 (medaillon "Niv. 5", "Niveau 5 debloque", capture) ; **file d'attente** testee en rafale (level 8 + serie 100 simultanes → niveau affiche d'abord, serie 100 en attente, fermeture → serie 100 apparait). Zero erreur console.

## 2026-07-13 - Chrono : Wake Lock — l'ecran reste allume pendant une session (complete le mode focus)

Demande utilisateur : "fais la modif A" (mode focus plein ecran du chrono, propose dans une liste d'idees design). Constat en ouvrant le code : le mode focus plein ecran existe DEJA et est tres abouti (overlay ink, maree de progression, etat pause bordeaux, Blocus Blocks agrandis, controles auto-masques apres 4,5 s, Echap/Espace, un bouton Demarrer y bascule direct). Le vrai trou n'etait pas l'UI mais un manque fonctionnel : rien ne gardait l'ecran allume. Sur un telephone pose sur le bureau, l'iPhone verrouille l'ecran apres ~30 s (les controles se masquent expres → plus aucune interaction) et toute la respiration ambiante du mode focus s'eteint. C'est ce que Forest / Flow / Session empechent avec un Screen Wake Lock. Aucune occurrence de `wakeLock` dans le repo avant ce commit.

- **`lib/useWakeLock.js`** (nouveau, ~60 l.) : hook `useWakeLock(active)` autour de la Screen Wake Lock API. Robuste par conception (meme philosophie que le durcissement `initOneSignal`) : no-op silencieux si l'API n'existe pas (Safari < 16.4, contexte non securise) ; le navigateur relache seul le verrou quand l'onglet passe en arriere-plan, on le RE-acquiert automatiquement au retour au premier plan (`visibilitychange`) tant que `active` reste vrai ; ne throw jamais (NotAllowedError / non supporte / onglet cache avales). Garde-fous anti-double-acquisition (ref de sentinelle) et nettoyage complet au unmount / passage `active` a false.
- **`pages/dashboard.js`** : import + `useWakeLock(running)` place pres de l'etat du chrono. Portee = `running` : l'ecran reste allume tant qu'une session tourne (inline OU mode focus), relache automatiquement en pause / a l'arret. Comme le verrou n'est de toute facon tenu que quand l'onglet est visible, aucun cout batterie quand l'utilisateur quitte l'app.
- **Silencieux, sans UI** : aucune cle i18n, aucun toggle — comportement attendu d'un vrai timer d'etude (l'absence se remarque, la presence est transparente). Aucune migration.

Verifie : `NEXT_PUBLIC_OFFLINE_DEV=true npm run build` OK (dashboard 14.8 kB). En navigateur (build offline, `navigator.wakeLock` present) via instrumentation de `wakeLock.request` : au Demarrer le verrou est demande EXACTEMENT 1 fois au bon moment (pas de boucle malgre les re-renders 500 ms — encore 1 apres 4 s / ~8 renders) ; le Chrome d'automatisation REFUSE le verrou (`NotAllowedError`, pas de vrai ecran) et le hook l'avale en silence → console vierge, chrono continue ; cycle pause → reprise ré-arme correctement (compteur passe a 2). Le chemin succes (verrou reellement tenu) n'est pas observable en headless (permission refusee par l'environnement) mais la requete est emise correctement — sur un vrai iPhone / navigateur elle sera accordee. Zero erreur console, aucune regression visuelle du mode focus (capture prise, controles auto-masques = exactement le cas ou l'ecran se serait eteint).

Demande utilisateur : le classement ne montrait que les heures d'etude — le rendre plus intelligent avec des filtres pertinents.

- **`supabase/migration_v27_leaderboard_v2.sql`** (nouvelle, a executer manuellement) : RPC `get_leaderboard_v2(p_period, p_metric, p_scope, p_university, p_study_field, p_study_year)`. Metriques : `time` (secondes sur la periode), `streak` (serie de jours consecutifs, meme definition que `computeStreak()` client, gaps-and-islands SQL), `regularity` (jours actifs sur la periode). Periodes : jour / semaine / **mois (nouveau)**. Portee : `all` (top 50 des actifs) ou `friends` (amis acceptes via `auth.uid()` cote serveur, **moi toujours inclus meme a 0**). Filtres profil : universite, filiere, annee (egalite exacte). SECURITY DEFINER + search_path, EXECUTE reserve a `authenticated`. L'ancienne `get_public_leaderboard` (v11-v13) est conservee.
- **`components/Leaderboard.js`** (nouveau, 365 l.) : le classement extrait de `pages/stats.js` (1225 → 947 lignes, refactor incremental conforme a CLAUDE.md). Deux rangees de controles coherentes avec le reste des Stats : [Public|Amis] + [Jour|Semaine|Mois] puis [Temps|Serie|Regularite] + chips [Ma fac][Ma filiere][Mon annee] (chips visibles seulement si le champ existe dans le profil, cumulables). La metrique contraint la periode : Serie masque le selecteur (independant de la periode), Regularite retire "Jour". Affichage par metrique : temps vert, serie flamme ambre "N j", regularite "N/7 j" ou "N/30 j". Sous-titre dynamique ("Top 50 · Serie", "Regularite · Mois"...). Suppression au passage du doublon de toggle periode mobile/desktop. `RankBadge` deplace ici et re-exporte (le podium des cours de stats.js l'importe).
- **Repli automatique** : tant que la migration v27 n'est pas executee en prod, le composant detecte l'absence de la RPC et retombe sur l'ancien comportement complet (ancienne RPC publique + calcul amis cote client, anciens controles uniquement) — meme pattern que `get_study_comparison`/v24. Rien ne casse au deploy.
- **`lib/offlineSupabaseClient.js`** : mock `get_leaderboard_v2` (replique JS fidele de la RPC : metriques, portee, filtres, periodes) + escape hatch `localStorage.bt_force_legacy_leaderboard=1` pour tester le repli legacy en preview.
- **i18n** : 5 nouvelles cles fr+en (`stats.metricTime/metricStreak/metricRegularity`, `stats.filterMyField/filterMyYear`).

Verifie : lint + build clean. En navigateur (build offline) : v2 public temps/jour, Serie (re-classement, flammes, periode masquee), Regularite+Mois ("14/30 j", "Jour" retire), filtre Ma filiere (14 → 1 ligne, moi conserve), mode Amis v2 (moi + 3 amis injectes, zeros inclus), **repli legacy complet** (controles degrades, sous-titre ancien, mode Amis calcule client) via l'escape hatch. Zero erreur console.

**A faire cote utilisateur** : executer `supabase/migration_v27_leaderboard_v2.sql` dans le SQL Editor Supabase pour activer les nouvelles metriques et les filtres (sans elle, l'app garde silencieusement l'ancien classement).

## 2026-07-12 - Planning : reharmonisation complete de la page

Demande utilisateur : "le planning manque de coherence, les fonctionnalites vont un peu dans tous les sens, reharmonise tout pour que ce soit plus simple et coherent".

Problemes identifies (verifies en navigateur avant modification) :
- Les memes objectifs apparaissaient DEUX fois a l'ecran (carte "Aujourd'hui" + carte "A preparer cette semaine" juste en dessous, qui incluait aussi le jour meme).
- DEUX surfaces concurrentes pour gerer un jour : le panneau lateral "Ajouter tes objectifs" (formulaire toujours deplie, son propre bouton examen) ET le modal de detail du jour (formulaires replies, autre presentation) — deux UX differentes pour exactement les memes actions.
- Barre d'outils eclatee sur 3 lignes (boutons, puis switch de partage en pleine largeur avec sa longue phrase).

Reharmonisation (pages/planning.js, ~1750 → ~1200 lignes, -22% de code) :
- **Une seule surface jour** : le modal de detail (bottom sheet mobile / centre desktop). Tout clic sur un jour (case du mois, en-tete ou creneau de la grille semaine/jour, carte Aujourd'hui, puce de la bande semaine) ouvre CE modal. Le panneau lateral, son toggle "Ajouter tes objectifs" et le drag-&-drop (dont la source etait ce panneau) sont supprimes.
- **Parite de fonctions dans le modal** : ajout des actions qui n'existaient que dans le panneau supprime — reporter a demain / a une date (bande inline sous la ligne), lancer le chrono (aujourd'hui + cours), badge de recurrence (`↻ quotidien` etc.) dans les metadonnees. Le formulaire d'ajout se pre-remplit sur l'heure cliquee dans la grille horaire (nouvel etat modalPrefillTime + reset propre a chaque ouverture), et l'ajout affiche desormais le meme toast que l'ancien panneau.
- **Une seule carte resume** : la bande "A preparer cette semaine" est integree en bas de la carte Aujourd'hui et ne montre QUE demain → J+6 (plus jamais le jour meme, donc plus de doublon). Puces cliquables → modal du jour concerne. Max 6 puces + compteur.
- **Une seule barre d'outils** : ‹ › + Aujourd'hui + periode + selecteur Jour/Semaine/Mois + pastille de partage compacte ("Prive"/"Partage" + point de statut, phrase complete en title/aria) + export .ics (texte masque sur mobile). Nouvelles cles i18n plan.sharePrivate / plan.shareShared (fr + en).
- **Calendrier pleine largeur** dans les 3 vues (le detail vivant dans le modal, la colonne laterale n'existe plus).

Verifie en navigateur (build offline, mobile + desktop 1440px, clair + sombre) : plus de doublon dans le hero ; clic case du mois → modal ; report vers date custom puis retour (l'objectif bouge bien dans le calendrier et la bande semaine se met a jour en direct) ; clic creneau 09h vue semaine → modal avec formulaire pre-ouvert et 09:00 pre-rempli ; creation + suppression d'un objectif OK ; zero erreur console. `npm run lint` + `npm run build` OK.

## 2026-07-12 - Logos des communautes : 19 nouveaux + optimisation complete

Demande utilisateur : l'utilisateur a depose les images de logo manquantes dans `public/logos-commu/` (les 10 nouvelles ecoles francaises + 9 ecoles belges qui utilisaient encore le fallback initiales) et a demande qu'elles soient associees aux bonnes communautes, sans alourdir le chargement du site.

- **19 nouveaux logos identifies et assignes** dans `lib/universities.js` (verifie visuellement un par un via une planche contact) : FR — Sciences Po, Dauphine, Sorbonne, Paris-Saclay, INSEAD, SKEMA, NEOMA, Audencia, TSE, GEM (les 10 nouvelles ecoles francaises, plus aucune n'utilise le fallback initiales) ; BE — CAD, HE2B, HELHa, HE Vinci, Haute Ecole Galilee, ISFSC, La Cambre, UMONS, Francisco Ferrer (les 9 dernieres ecoles belges sans logo — **toutes les 22 ecoles belges ont desormais un vrai logo**).
- **`scripts/optimize-logos.js`** (nouveau) : script d'optimisation reutilisable — redimensionne chaque logo (existant + nouveau, 48 au total) a 320px max et convertit en WebP qualite 82, renomme chaque fichier en `<id-ecole>.webp` (ex. `sciencespo.webp`) pour eliminer les espaces/accents/parentheses des noms de fichiers d'origine. Poids total du dossier : **2.3 Mo → 311 Ko** (−87%), le plus gros fichier individuel passe de 312 Ko a 14 Ko. Supprime aussi le doublon `images.png` (logo ESSEC en double, ESSEC avait deja son logo).
- **`pages/index.js`** : la landing page affichait encore "40 communautés" (chiffre fige au moment de la premiere redaction). Remplace par `UNIVERSITY_COUNT`/`COUNTRY_COUNT` calcules depuis `lib/universities.js` (meme pattern que `SCHOOL_LOGOS` deja en place) — affiche desormais "80 communautés, 5 pays" et ne redeviendra plus jamais faux quand de nouvelles ecoles seront ajoutees.

Verifie : `npm run lint` + `npm run build` clean. En navigateur : 0 logo casse sur 45+ affiches (sidebar Communautes + filigrane d'etat vide), 0 requete 404 sur `/logos-commu/*` (toutes en 200 OK, verifie via le panel reseau sur Communautes ET la landing page marquee), page d'accueil deconnectee affiche bien "80 communautés, 5 pays" et le marquee tourne avec les nouveaux logos (ESCP, EDHEC, EM Lyon, KEDGE, Sciences Po, Dauphine... visibles).

## 2026-07-11 - 40 nouvelles ecoles (FR/NL/ES/CH) dans `lib/universities.js`

Demande utilisateur : ajouter 10 ecoles par pays (France, Pays-Bas, Espagne, Suisse) fournies dans le message, plus verifier la recherche intelligente et le tri alphabetique du selecteur d'universite.

- **`lib/universities.js`** : 40 entrees ajoutees (id/name/full/color/logo:null — pas de logo fourni, fallback initiales colorees via `CommunityLogo` deja en place). Total : 40 → **80 universites**, 5 pays inchanges. IDs verifies uniques par script (aucune collision avec les 40 existants).
- **`supabase/migration_v26_new_universities.sql`** (nouvelle, a executer manuellement) : enregistre les 40 (id, full_name) dans `university_communities` — necessaire pour que `can_access_community()` (v18) autorise l'ECRITURE des etudiants de ces ecoles dans leur propre communaute (la LECTURE etait deja ouverte a tous depuis v25, independante de cette table). Chaque paire id/full_name verifiee programmatiquement identique entre le fichier lib et la migration SQL (script de cross-check, 40/40 OK).
- **Recherche intelligente + tri alphabetique** : deja implementes (`components/UniPicker.js` a l'inscription, `pages/communautes.js` pour l'annuaire) — filtrage par sous-chaine sur nom/nom complet/pays + `localeCompare("fr")` par groupe de pays. Aucun changement de code necessaire, verifie en navigateur que ca fonctionne correctement avec les 80 ecoles (recherche "Universidad" → 7 resultats pertinents et tries ; recherche "Universi" → tous pays groupes et tries, y compris Suisse).

Verifie : `npm run lint` clean, `npm run build` OK. En navigateur (build offline) : selecteur d'inscription (recherche + tri + groupement par pays), page Communautes (recherche "sciences po", ouverture de la communaute, en-tete/onglets/etat vide fonctionnels), aucune erreur console.

**A faire cote utilisateur** : executer `supabase/migration_v26_new_universities.sql` dans le SQL Editor Supabase pour que les etudiants des 40 nouvelles ecoles puissent ECRIRE dans leur communaute (ils peuvent deja toutes les VOIR sans cette migration, grace a v25).

## 2026-07-11 - Landing (`/`) : refonte complete "app-first" avec vrais screenshots (style Aave)

Demande utilisateur : refaire le site public de zero, en s'inspirant du style d'aave.com (fintech soft-premium), avec les screenshots reels desktop+mobile qu'il a deposes dans `public/site-web/`, ses couleurs, et ses vrais chiffres (200 utilisateurs, pas plus).

- **Assets** : 11 screenshots choisis parmi les 16 fournis, optimises en WebP dans `public/site-web/opt/` (276 KB au TOTAL pour toute la page, verifie au runtime). Les originaux (5.8 MB) restent en local, NON commites. **Piege PWA desamorce** : `publicExcludes: ["!site-web/**/*"]` dans `next.config.js` — sans ca, le service worker aurait precache tout le dossier a chaque installation (verifie : 0 occurrence de site-web dans `public/sw.js` genere).
- **Structure (adaptation Aave → Blocus Tracker)** : header sticky flou (safe-area conservee) avec ancres Fonctionnalites/Guides/FAQ ; hero centre gros type avec le VRAI produit dessous (screenshot desktop en cadre navigateur + mobile flottant en cadre telephone) ; bande de chiffres reels (200+ etudiants / 40 communautes / 5 pays / 100% gratuit — 40 = compte exact de lib/universities) ; section Mode focus pleine largeur sur surface ink ; splits Planning et Stats (screenshot classement superpose incline) ; grand conteneur teinte Social/Communautes avec **marquee des vrais logos d'ecoles** (derives dynamiquement de `lib/universities.js`, donc toujours synchro) ; rangee de 3 telephones "Dans ta poche" ; Guides (liens SEO conserves) ; FAQ en accordeon natif `<details>` (memes 3 Q&A que le JSON-LD de lib/seo.js) ; CTA final ink ; footer 3 colonnes.
- **Motion** (sobre, tout couvert par prefers-reduced-motion) : revelation au scroll via IntersectionObserver + `[data-reveal]` (nouvelles regles globals.css), un seul marquee (pause au hover), un seul flottement ambiant (le telephone du hero), hovers card-lift existants. Aucun listener scroll.
- **Discipline anti-slop** (skills frontend-design + ui-ux-pro-max + design-taste-frontend) : zero em-dash, un seul intent par CTA ("Creer mon espace" unifie partout, nav comprise), chiffres 100% reels, pas de faux temoignages, pas de fausse UI en divs (que des screenshots reels), max 2 splits zigzag consecutifs, ≥4 familles de layout, logos = logos (pas de labels categorie).
- SEO conserve : meme H1 keyword ("Le chrono qui rend ton blocus plus clair."), memes liens guides, meme FAQ, redirect utilisateur connecte → /dashboard inchange.

Verifie : `npm run lint` clean, `npm run build` OK. En navigateur (build offline, invite) : hero desktop 1440px + mobile 375px (aucun debordement horizontal, docW=375), les 24 cibles data-reveal se revelent au scroll, marquee anime, accordeon FAQ fonctionne, dark mode complet (tokens), 0 erreur console, 276 KB d'images charges.

## 2026-07-10 - Fix : bouton "Activer les notifications" restait bloque en chargement infini

Signale par l'utilisateur : sur `/profile`, le bouton "Activer les notifications" tournait indefiniment, sans jamais confirmer l'activation ni afficher d'erreur.

- **Cause** (`lib/onesignal.js`) : `initOneSignal()` n'avait AUCUN timeout. Le SDK OneSignal est une cible frequente des bloqueurs de pub/trackers (uBlock, Brave Shields, protection anti-tracking Safari...) — beaucoup repondent au script par un 200 vide plutot que de bloquer franchement, donc `script.onerror` ne se declenche jamais, ET `window.OneSignalDeferred` n'est jamais traite. Sans filet, la Promise attendait pour toujours → `enablePush()` ne se terminait jamais → le `finally` de `PushRow.enable()` (qui remet `busy` a `false`) n'etait jamais atteint → bouton bloque en boucle, silencieusement.
- **Fix** : `initOneSignal()` fait desormais la course (`Promise.race`) entre le chargement reel et un timeout de 8s ; en cas d'echec, `initPromise` est reinitialise a `null` pour qu'un nouveau clic relance une vraie tentative (au lieu de rejouer l'echec en cache indefiniment). `enablePush()` distingue ce cas (`reason: "blocked"`) d'une erreur generique, et `pages/profile.js` affiche un message specifique et actionnable ("un bloqueur de pub ou de trackers empeche peut-etre..." + reessaie possible) au lieu de laisser le bouton tourner. `loginUser()` durci en passant (deja appele avec un try/catch existant en amont dans `_app.js`, mais desormais protege aussi en direct).
- Nouvelle cle i18n `push.blocked` (FR+EN).

Verifie : `npm run lint` clean, `npm run build` OK (26/26). Le mecanisme de timeout + reset a ete valide directement dans un vrai moteur JS navigateur en simulant un SDK qui ne rappelle jamais (scenario bloqueur) : rejette proprement au lieu de bloquer, et un 2e appel relance une vraie nouvelle tentative. `/profile` verifie sans erreur console (en local, `NEXT_PUBLIC_ONESIGNAL_APP_ID` n'est pas configure donc c'est l'etat "non configure" qui s'affiche, comportement inchange et correct). Le scenario reel (bloqueur sur le vrai SDK OneSignal en prod) se confirmera au prochain test utilisateur sur le site en ligne.

## 2026-07-09 - Notifications push : rappels quotidiens + annonce ponctuelle

Demande utilisateur : une annonce "l'app remarche" a tous, + des rappels quotidiens (serie en danger, examen demain, pense a etudier / a faire ton planning). L'infra d'ENVOI existait deja (`lib/pushServer.js` + OneSignal) mais uniquement evenementielle (webhooks Supabase). Ajout de la partie temporelle.

- **`lib/pushServer.js`** : refactor. `sendPushToUser` conserve, + `sendPushToUsers` (batch, chunke a 2000 external_id/appel) et `sendBroadcast` (segment "Subscribed Users"). OneSignal ne delivre qu'aux abonnes reels → aucun envoi a un non-abonne.
- **`pages/api/push/daily.js`** (nouveau) : rappels quotidiens, UN seul par user/jour par priorite : (1) examen demain, (2) serie en danger = a etudie hier mais pas aujourd'hui, (3) nudge etude/planning = a etudie il y a 2-3j mais pas aujourd'hui (>3j sans etudier = pas relance, anti-harcelement). Dates en Europe/Bruxelles. Le nudge alterne etude/planning selon le jour. Requetes `exams`/`sessions` paginees (PostgREST plafonne a 1000).
- **`pages/api/push/announce.js`** (nouveau) : diffusion ponctuelle a tous les abonnes (`{ title, body, url }`), pour l'annonce "l'app remarche" et les futures.
- **`vercel.json`** (nouveau) : cron `0 18 * * *` (18:00 UTC ≈ 19-20h Bruxelles) → `/api/push/daily`.
- **Securite / safe-by-default** : les deux routes exigent `CRON_SECRET` (Vercel injecte `Authorization: Bearer` sur les crons ; on accepte aussi `x-cron-secret` / `?secret=` pour declenchement manuel). TANT QUE `CRON_SECRET` n'est PAS defini dans Vercel, tout retourne 401 → RIEN n'est envoye. Deployer ce commit n'envoie donc aucune notification tant que l'utilisateur n'a pas active le secret. Mode `?dry=1` = calcule et renvoie qui serait notifie sans envoyer.

**A faire cote utilisateur (Vercel) :**
1. Ajouter l'env var `CRON_SECRET` (chaine aleatoire) — active le cron ET les endpoints.
2. Verifier a blanc : `GET /api/push/daily?secret=<CRON_SECRET>&dry=1`.
3. Envoyer l'annonce "l'app remarche" (une fois) : `POST /api/push/announce` avec header `x-cron-secret: <CRON_SECRET>` et corps `{ "title": {"fr":"...","en":"..."}, "body": {...}, "url": "/dashboard" }` — OU directement depuis le dashboard OneSignal (New Message → Subscribed Users).

Verifie : `npm run lint` clean, `npm run build` OK (routes `/api/push/daily` + `/api/push/announce` enregistrees), garde-fous d'auth testes en local (401 sans secret, 405 mauvaise methode, 401 mauvais secret ; `/api/push/notify` non regresse). L'ENVOI reel (OneSignal) et la logique dry-run se valident en prod (secret + creds requis) — a tester avec `?dry=1` d'abord.

## 2026-07-09 - Fiabilite : banniere de recuperation de compte pour les emails legacy

Un des problemes ouverts du CLAUDE.md : ~60 utilisateurs "legacy" ont un faux email `<pseudo>@blocus.local` et ne peuvent pas reinitialiser leur mot de passe tant qu'ils n'ajoutent pas une vraie adresse dans `/profile` — mais rien ne les en informe.

- Nouveau `components/LegacyEmailBanner.js` : banniere ambre discrete affichee en haut du contenu (dans `Layout`, `<main>`) UNIQUEMENT si `profile.email` est vide ou finit par `@blocus.local`. CTA "Ajouter mon email" → `/profile` (le formulaire `updateEmail` y met deja a jour l'email `profiles` ET l'email Supabase Auth, ce qui debloque la recuperation). Bouton "Plus tard" = snooze 3 jours (localStorage), pour ne pas harceler.
- Ne s'affiche jamais pour les comptes avec un vrai email (les nouveaux inscrits), ni en etat guest-locked.
- 4 cles i18n `banner.email*` (FR+EN).

Verifie : `npm run lint` clean, `npm run build` OK (26/26). En navigateur (build offline, email force a `@blocus.local`) : banniere affichee, CTA pointe `/profile`, "Plus tard" masque + stocke le snooze ; confirme qu'elle NE s'affiche PAS avec un email normal.

## 2026-07-09 - Logo : tuile OG affinee + icone PWA alignee sur le vrai logo

Suite du fix precedent. L'utilisateur trouvait le rendu encore "pas bon" et voulait aussi aligner l'icone PWA sur `logo-source.png`.

- **Tuile OG affinee** (`scripts/generate-og.js`) : l'icone du vrai logo est maintenant auto-recadree via `sharp.trim()` (retire le vert uniforme autour → recentrage parfait, plus robuste que des coords en dur), posee avec une marge respirante (~62% de remplissage) sur une tuile verte arrondie, un peu plus grande (90px). Plus de rendu serre/coupe.
- **Icone PWA alignee** : le `manifest.json` referencait encore `/icon.svg` (l'ancienne marque livre+horloge, differente du vrai logo) EN PREMIER, donc un installeur pouvait la choisir. Entree `icon.svg` retiree du manifest, fichier `public/icon.svg` supprime. Le manifest ne garde que `icon-192/512` (regeneres depuis `logo-source.png` — deja identiques, confirmant qu'ils etaient deja bons). Ajout d'un `<link rel="icon">` dans `pages/_app.js` pour que l'onglet du navigateur montre aussi le vrai logo.
- Verifie : `npm run lint` clean, `npm run build` OK (26/26), en navigateur les endpoints icones/manifest repondent 200, le `sw.js` regenere ne precache plus `icon.svg` (pas d'erreur d'install SW), `icon.svg` n'est plus reference nulle part.

## 2026-07-09 - Image OG : correction du logo (le vrai chrono+livre au lieu du mauvais)

L'utilisateur a signale que l'image de partage montrait le MAUVAIS logo. Le premier jet utilisait `public/icon.svg` (une marque simplifiee livre+horloge en trait), alors que le vrai logo de l'app est `public/logo-source.png` (chrono + livre ouvert, celui des icones PWA). En prime, `logo-source.png` avait ete supprime du working tree (jamais commite), d'ou le fallback.

- `scripts/generate-og.js` recadre desormais l'icone du VRAI logo (`logo-source.png`, sans le texte "blocus/tracker" du bas), la recentre sur une tuile verte de marque (#10AD84) aux coins arrondis, et la composite en haut a gauche de l'image (via `sharp.composite`, apres rendu) au lieu d'inliner `icon.svg`.
- `public/logo-source.png` restaure dans le working tree (asset suivi, source des icones PWA — ne devrait jamais etre supprime).
- `public/seo-preview.png` regeneree avec le bon logo.
- Note : `manifest.json` reference encore `icon.svg` (l'ancienne marque livre+horloge) comme icone SVG PWA, a cote des PNG `icon-192/512` generes depuis le vrai logo — petite incoherence a aligner un jour (hors scope de ce fix OG).

## 2026-07-09 - Image de partage (Open Graph) refaite : `public/seo-preview.png` + `scripts/generate-og.js`

Signale par l'utilisateur : l'apercu affiche au partage du lien (WhatsApp, etc.) etait "moche / effort IA" (photo de bureau delavee + fausses barres de progression + boutons "Étudier/Progresser" bizarres) et ne montrait pas le logo de l'app.

- **Nouvelle image** (1200×630) rendue 100% vectoriel via `sharp`/librsvg, dans l'identite reelle de l'app : surface "ink" vert profond (comme la landing), le **vrai logo** (`public/icon.svg`) en carre arrondi, wordmark "blocus·tracker", titre en Bricolage Grotesque gras ("Le chrono qui rend ton blocus **plus clair.**"), sous-titre, les **Blocus Blocks** + timer `1:47:12` (signature du produit), anneau d'horloge ghoste, et `blocus-tracker.com`. Aucune photo stock, aucune fausse UI.
- **Script reproductible** `scripts/generate-og.js` (comme `generate-icons.js`) : telecharge les polices de marque (Bricolage Grotesque + Space Grotesk) si absentes, les embarque en base64 dans le SVG (librsvg les honore — verifie ; fontconfig est vide dans cet environnement), inline le logo, rend en 2x puis redimensionne pour un anti-aliasing net. Rejouable : `node scripts/generate-og.js`.
- **Aucun changement de code cote references** : le fichier garde le meme nom (`/seo-preview.png`), donc la balise OG (`lib/seo.js`) ET l'usage inline sur les pages SEO (`components/SeoLandingPage.js`) prennent la nouvelle image automatiquement.
- **Cache des reseaux sociaux** : WhatsApp/Facebook mettent l'apercu en cache par URL de page. Pour forcer le rafraichissement immediat : re-scraper via le Facebook Sharing Debugger (bouton "Scrape Again") ; sinon WhatsApp se rafraichit tout seul en quelques jours.

Verification : `npm run lint` clean, `npm run build` propre (26/26), image relue visuellement (rendu correct, net, on-brand) et verifiee en contexte inline sur une page SEO (`/pomodoro`, 1200×630 charge OK).

## 2026-07-09 - Fix : toggle "Rendre mon planning visible par mes amis" se bloquait (`pages/planning.js`)

Signale par l'utilisateur : le bouton d'activation du partage de planning ne repondait plus.

- **Cause** : `togglePlanningPublic()` n'avait ni `try` ni `finally` autour de l'appel Supabase + `refreshProfile()`. Le verrou anti-double-clic (`togglingShareRef`, deja en place depuis un fix precedent) passe a `true` en debut de fonction et n'etait remis a `false` qu'a la toute fin du chemin "heureux" — si l'appel echouait pour une raison quelconque (reseau, erreur transitoire), aucune ligne ne remettait jamais le verrou a `false`. Le bouton restait alors bloque en silence a **chaque clic suivant**, meme apres un rechargement de page tant que le composant restait monte, donnant l'impression que "l'activation" ne marche plus du tout.
- **Fix** : corps de la fonction enveloppe dans `try { ... } catch { toast(erreur) } finally { deverrouille toujours }` — le verrou est desormais garanti de se relacher quoi qu'il arrive.
- Aucune restriction RLS/colonne trouvee sur `profiles.planning_public` (colonne simple, `boolean default false`, sans policy dediee) — la cause etait bien cote client, pas base de donnees.

Verification : `npm run lint` clean, `npm run build` propre (26/26). Verifie en navigateur (build prod offline) : ON→OFF puis OFF→ON confirmes (aria-checked + rendu visuel), triple-clic rapide absorbe par le verrou anti-course sans rester bloque ensuite, aucune erreur console.

## 2026-07-09 - Landing page (`/`) : refonte premium + fix bug safe-area header (`pages/index.js`)

La page d'accueil publique (celle que voient les visiteurs sans compte, route `/`) etait "moche" et surtout **cassee sur mobile** : le header (logo + bouton "Se connecter") passait SOUS la status bar iOS et etait intappable. Signale par l'utilisateur avec capture (PWA plein ecran, `viewport-fit=cover` + status bar translucide -> le contenu demarre a y=0).

**Bug corrige (critique)** : header passe en `sticky top-0` avec `paddingTop: env(safe-area-inset-top)` + fond translucide flou (`var(--bt-mobile-nav-bg)` + `backdrop-filter: blur`). Le fond remplit derriere la status bar, le contenu est pousse dessous. Boutons a `minHeight: 44` (cible tactile HIG). Verifie : "Se connecter" est bien l'element top-most a son centre (non recouvert) et navigue vers `/login`.

**Refonte (skills `/frontend-design` + `/ui-ux-pro-max`)** : parti pris = la landing est la porte d'entree de l'app, donc elle doit RESSEMBLER a l'app (identite reutilisee, aucune nouvelle couleur/police). 
- Suppression de la photo de fond stock (`auth-bg`) delavee sous un voile 62% (cause du rendu "moche/template") -> fond `--bt-bg` propre + un halo radial accent tres subtil.
- **Signature** : le hero montre le PRODUIT au lieu de le decrire — une vraie carte Chrono sur la surface de marque `card-ink` (vert profond + grain), avec le timer `1:47:12` (chiffres tabulaires Space Grotesk), un cours, et les **Blocus Blocks** (5/8, le bloc actif qui pulse via `bt-block-active` existant, reduced-motion-safe).
- Hero 2 colonnes (texte + carte) centre verticalement sur desktop, empile sur mobile (thesis d'abord). H1 avec "plus clair." en accent vert. Ligne de confiance honnete ("Gratuit, sans carte...") a la place des 4 cartes "Inclus" vides.
- Sections features (icones ligne dans pastilles accent), guides (fleche au hover), FAQ conservees et polies ; nouvelle section CTA finale sur `card-ink` + footer avec safe-area-bottom.
- 100% tokens `--bt-*` -> dark mode correct (verifie), une seule animation ambiante (bloc actif).

Verification : `npm run lint` clean, `npm run build` propre (26/26). Verifie en navigateur (build prod offline, en invite via suppression de la session offline) : mobile 375px (header propre, hero premium, carte chrono avec blocs), desktop 1440px (hero 2 colonnes centre), dark mode, "Se connecter" tappable -> `/login`, aucune erreur console.

## 2026-07-09 - Micro-interactions premium : systeme de toasts global + skeletons + transitions

Passe globale de micro-interactions sobres sur toute l'app. **Constat de depart** : l'infra d'animations etait deja tres riche (`styles/globals.css` : ~25 keyframes `bt-*`, blocs Chrono anime, `bt-stagger`/`bt-rise` d'entree de page, `prefers-reduced-motion` couvert). Le vrai manque etait le **feedback d'action** (uniquement un toast "nouveau message" ; les succes passaient par `alert()` ou du texte inline) et les **skeletons**. Travail centre sur la coherence, pas sur l'ajout d'effets partout.

- **Systeme de toasts global** (nouveau `contexts/ToastContext.js`, monte dans `_app.js`) : `useToast().toast(message, type)` avec `success|error|info`, file plafonnee a 3, auto-dismiss 3s, entree montante + sortie douce (`bt-toast-in`/`bt-toast-out`). Sobre : carte surface + pastille coloree (check vert / croix rouge douce / info neutre), bottom-right desktop, pleine largeur au-dessus de la nav sur mobile. 100% CSS vars (dark mode gratuit), respecte `prefers-reduced-motion`.
- **Toasts cables** sur les actions explicitement demandees : ami (demande envoyee / acceptee), objectif ajoute, examen ajoute, calendrier exporte, profil enregistre, question publiee, ressource partagee, "ajoute a mon planning", + erreurs. Les `alert()` de succes/erreur proches ont ete convertis en toasts. **Choix delibere** : PAS de toast a chaque message envoye (l'apparition du message EST le feedback — un toast par message serait spammy, pas premium).
- **Skeletons** (nouveau `components/Skeleton.js` : `SkeletonBar/Circle/Row/List`, utilitaire `.bt-skeleton` a balayage doux, theme-neutre via nouvelle var `--bt-shimmer`) : remplacent le texte "Chargement…" du classement public (Stats) et des recherches/suggestions (Social).
- **Transitions** : `bt-tab-fade` (nouveau) sur le changement d'onglet Communautes et le changement de vue mois/semaine/jour du Planning ; `bt-rise` d'entree ajoute a Messages et Communautes (les 2 pages qui n'en avaient pas).
- **Boutons/cartes** : l'infra existante (`.btn:active` scale, hover, `.card-lift`) etait deja bonne — pas touchee. Le gain cote boutons vient du feedback de succes (toasts).
- **Reduced-motion** : les 4 nouvelles animations (`bt-toast-in/out`, `bt-tab-fade`, `bt-skeleton::after`) ajoutees au bloc `@media (prefers-reduced-motion: reduce)`.

Verification : `npm run lint` clean, `npm run build` propre (26/26). Verifie en navigateur (build prod offline) : toast a l'export calendrier (desktop bottom-right + mobile pleine largeur au-dessus de la nav, pile de 3), fade d'onglet Communautes, changement de vue Planning mois->semaine (JSX restructure — grille semaine intacte), aucune erreur console.

## 2026-07-09 - Communautes : refonte en vrai "hub etudiant" ouvert a tous (`pages/communautes.js`)

Demande explicite en 11 points, precedee d'une investigation en 5 agents paralleles puis d'une revue adversariale en 4 axes (RLS/securite, egress, i18n, non-regression) avant finalisation.

**Changement le plus important : visibilite ouverte a tous.**
- Nouvelle migration `supabase/migration_v25_community_public_read.sql` (a executer manuellement) : relache `cmsg_read` de "sa propre universite uniquement" (`can_access_community()`, v18) vers `USING (true)` — n'importe quel utilisateur authentifie peut desormais LIRE n'importe quelle communaute. `cmsg_insert`/`cmsg_delete` restent INCHANGES (ecriture toujours restreinte a sa propre communaute, ou admin) — decision deliberee : "voir et ouvrir" a ete interprete comme lecture ouverte, pas ecriture ouverte.
- Ajoute aussi 2 colonnes nullables purement additives : `parent_id` (fil de reponses sous une Question, `ON DELETE CASCADE` pour eviter des reponses orphelines qui reapparaitraient comme messages Salon hors contexte si l'auteur de la question supprime son compte) et `exam_date` (date structuree, necessaire pour un vrai badge J-5/J-12 et le bouton "Ajouter a mon planning").
- **A savoir avant d'executer la migration** : elle rend aussi visible retroactivement tout l'historique existant (messages/pieces jointes postes sous l'ancien modele restreint) a tous les utilisateurs d'un coup, et elle reactive un chemin de code jusqu'ici dormant dans `NotificationContext.js` (badges nom-lus deja calcules pour toutes les universites, juste invisibles sous l'ancienne RLS) — desormais chaque ecole de l'annuaire affichera un vrai badge, pas seulement la sienne.

**Refonte de la page** :
- Mobile : plus de cartes qui debordent (cause racine : grille sans `grid-cols-1` explicite + bulles de message sans `min-w-0`/`break-words`, cf. investigation). Nouveau pattern liste/plein-ecran/retour identique a `pages/messages.js`.
- Colonne gauche : recherche ("Rechercher une ecole, universite ou pays..."), section epinglee "Ton ecole", puis "Toutes les communautes" en accordeons par pays (celui de l'utilisateur ouvert par defaut, sinon Belgique).
- En-tete communaute enrichi avec de vrais compteurs (pas invente) : nombre d'etudiants (`count` sur `profiles.university`) et actifs cette semaine (reutilise `get_public_leaderboard`, RPC deja utilisee sur Stats).
- 4 onglets vraiment distincts : Salon (chat), Questions (mini-forum avec fil de reponses via `parent_id`), Ressources (partage de fichiers, gate click-to-load reutilise, aucune nouvelle requete), Examens (badge J-X + "Ajouter a mon planning" qui insere dans la table `exams` de l'utilisateur).
- Etats vides dedies par onglet avec logo en filigrane subtil.
- Lecture seule automatique (nouvelle notice, pas de formulaire) quand l'utilisateur navigue une communaute qui n'est pas la sienne et n'est pas admin — evite un rejet RLS silencieux a l'envoi.

**Corrections suite a la revue adversariale** : bouton supprimer manquant sur les questions elles-memes (seules les reponses l'avaient) ajoute ; `ON DELETE SET NULL` change en `ON DELETE CASCADE` sur `parent_id` ; 2 chaines codees en dur ("Document", "Examen") remplacees par des cles i18n existantes ; fonction morte `spaceForId` supprimee.

Verification : `npm run lint` clean, `npm run build` propre (26/26). Verifie en navigateur (build prod offline) : toutes les communautes du monde visibles (pas seulement la sienne), recherche fonctionnelle, question posee + reponse + suppression testees de bout en bout, ressource partagee, examen ajoute avec badge J-5 puis ajoute au planning, notice lecture seule confirmee en simulant un compte non-admin sur une communaute etrangere, responsive mobile (liste -> plein ecran -> retour) sans aucun debordement.

## 2026-07-09 - "Messages" devient "Social" : refonte complete (`pages/messages.js`)

Demande explicite en 10 points : fusionner amis / messages prives / groupes dans une seule interface fluide, au lieu de 3 grandes cartes separees. Design garde (minimal, vert, sobre), aucune migration Supabase (scoring et recherche 100% client).

- **Renommage** : `nav.messages` → "Social" (sidebar), titre/description SEO de `/messages` mis a jour (`lib/seo.js`), nouveau H1 + sous-titre "Amis, messages et groupes d'etude." en tete de page.
- **Liste unifiee** : les cartes "Messages prives" et "Groupes" fusionnees en une seule liste type Discord/Messenger (`conversations`, triee non-lus puis recence), chaque item indiquant son type ("Privé" / "Groupe · N membres"). Filtres Tout / Prives / Groupes.
- **Recherche sociale centrale** : barre "Rechercher un ami, un groupe ou un pseudo…" en tete de colonne gauche. Recherche unifiee (`searchSocial`, debounce 280ms) melant conversations existantes et nouvelles personnes, avec classement (`searchTier` + `scoreCandidate`) : pseudo exact > nom > amis en commun > meme universite > activite recente.
- **Suggestions ameliorees** : `loadSuggestions` ne trie plus seulement par universite — score reel combinant amis en commun (poids fort), meme universite, activite des 7 derniers jours (`fetchSocialSignals`, requetes batch sans N+1).
- **Demandes d'amis discretes** : plus de grosse carte — ligne compacte "Demandes d'amis · N", cliquable, avec onglets Recues/Envoyees.
- **Etat vide repense** : plus de grand vide a droite — "Bienvenue dans Social" + 2 CTA (Rechercher un ami / Creer un groupe) + apercu de 3 suggestions.
- **En-tetes de conversation enrichis** : DM avec pastille "en ligne" (`studying_since`, deja utilisee ailleurs dans l'app) + boutons Voir profil / Lancer un chrono ; Groupe avec "N membres · Groupe d'etude" + boutons Infos / Lancer un chrono explicites.
- **Mobile** : reutilise l'infra `mobileView` deja existante (liste ⇄ conversation plein ecran ⇄ retour), aucune regression.
- Redirection historique `/friends → /messages?tab=relations` conservee (`openRelations` ouvre desormais le tiroir "Demandes d'amis" au lieu de l'ancien panneau plein ecran).

i18n : namespace `social.*` ajoute en FR+EN (~30 cles : recherche, filtres, demandes, etat vide, en-tetes).

Verification : `npm run lint` clean, `npm run build` propre OK (26/26). Verifie en navigateur (build prod offline, compte demo avec 1 groupe + 1 demande recue) : recherche avec statut de relation correct ("en attente"), demandes d'amis Accepter/Refuser, en-tete de groupe (Infos/Lancer un chrono), suggestions avec raisons ("Active cette semaine"), responsive mobile (liste → groupe plein ecran → bouton retour testes), aucune erreur console.

## 2026-07-08 - Chrono : "Sessions du jour" deplacee dans la colonne gauche, alignee sur "Mes cours"

Suite du fix de grille etiree (`lg:items-start`) : ce fix avait bien supprime le vide DANS la carte Chrono, mais en creait un NOUVEAU entre les deux blocs de grille — "Sessions du jour" vivait dans une grille separee, plus bas dans le fichier, qui ne demarrait qu'apres la fin de toute la sidebar (tres haute avec plusieurs cours). Signale par l'utilisateur avec capture d'ecran.

- **Restructuration** (`pages/dashboard.js`) : "Sessions du jour" et "A faire aujourd'hui" sont deplacees physiquement dans la MEME colonne que le Chrono (empilees dessous), au lieu d'une grille separee `mt-5` plus bas. La colonne gauche (`lg:col-span-2`) est desormais un flex-col : Chrono (hauteur naturelle) + ces deux cartes (`flex-1`, hauteur variable).
- **Alignement dynamique** : la grille externe passe en `alignItems: stretch` UNIQUEMENT s'il y a des sessions ou objectifs a afficher (`sessions.length > 0 || todayObjectives.length > 0`), sinon `start` (comme avant) — evite de re-etirer la carte Chrono dans le vide quand il n'y a rien a afficher en dessous.
- **Defilement interne, pas de croissance** : "Sessions du jour" / "A faire aujourd'hui" utilisent `flex:1 1 260px/200px` (a partir de `lg:` seulement) — la carte s'etire pour egaler la hauteur de la colonne Aujourd'hui/Mes cours (qui reste le "moteur" naturel, non borne), et si le contenu de la LISTE depasse cette hauteur, c'est elle qui defile (`overflow-y-auto`), jamais la carte.
- **Bug trouve et corrige pendant la verification** : le premier essai utilisait `style={{ flex: "1 1 260px" }}` en dur, actif a TOUTE largeur — en dessous du breakpoint `lg` (mobile, mono-colonne, aucune colonne a egaler), ca forcait quand meme une hauteur minimale de 260px, recreant un petit vide artificiel. Corrige en passant a la classe Tailwind responsive `lg:[flex:1_1_260px]` (active uniquement a partir de `lg:`, hauteur 100% naturelle en dessous).
- Verification navigateur (build prod offline, 5 cours + sessions demo) : plus de vide entre Chrono et Sessions du jour, alignement desktop confirme au pixel pres (mesure DOM directe), defilement interne confirme avec 20 sessions injectees (`scrollHeight` 860 vs `clientHeight` 182, carte plafonnee a 260px), et le fix mobile confirme via simulation CSS du mono-colonne (fenetre du navigateur bloquee a 1130px dans cet environnement, resize impossible en dessous). `npm run lint` clean, `npm run build` propre OK (26/26).

## 2026-07-08 - Planning : 8 corrections cibles (export, partage, vue, legende, examens, ajout, semaine)

Serie de 8 demandes precises sur `pages/planning.js`, precedee d'une vague d'investigation (7 agents en parallele) pour cartographier chaque zone avant edition. Design conserve, aucune migration Supabase.

1. **Bouton PDF supprime** (appelait juste `window.print()` — aucune vraie lib PDF, donc aucun code mort a nettoyer).
2. **Bouton Agenda renomme** "Exporter calendrier" + tooltip explicite ("Exporte tes examens et objectifs vers Apple, Google Calendar ou Outlook.") — le tooltip existait deja via `title={t(...)}`, seules les valeurs i18n ont change (`plan.exportCalendar` / `plan.exportCalendarHint`, FR+EN).
3. **Toggle de partage corrige** : la cause etait une race condition — sans garde ni await, un clic pendant la requete relisait le meme `profile.planning_public` perime (stale closure) et recalculait la meme valeur au lieu d'inverser, donnant l'impression d'un toggle fige. Fix en 2 temps : garde `useState` (disable visuel du bouton) PUIS, suite a un test qui a revele qu'un double-clic strictement synchrone contournait encore la garde (une maj de state React n'est visible qu'apres le prochain rendu), ajout d'un verrou `useRef` mis a jour immediatement. Erreur Supabase desormais signalee (`plan.shareError`) au lieu d'echouer silencieusement.
4. **Vue "Mois" par defaut partout** : le `useState` etait deja `"month"`, mais un effet au montage forcait `"day"` sur mobile (<640px). Retire pour honorer la demande litteralement ; verifie a 390-500px que MonthView reste lisible (rendu mobile deja en points colores, pas de regression).
5. **Legende supprimee** (redondante avec "Revision par cours" juste en dessous qui affiche deja les memes couleurs de cours + une info utile en plus) — composant, appel et cle i18n `plan.legend` retires.
6. **Badges d'examen J-X unifies** : nouveau composant `ExamBadge` (3 paliers de couleur repris du pattern deja utilise sur le Chrono/dashboard.js — rouge <=0j, orange <=7j, vert au-dela), applique dans DayPanel, DayDetailModal et la nouvelle carte hebdo. Au passage, les chaines francaises codees en dur du formulaire examen (non traduites en EN) ont ete corrigees.
7. **Ajout objectif / examen clairement separes** : DayPanel a desormais deux sections a puce coloree distinctes ("Ajouter un objectif" vert, "Ajouter un examen" rouge). DayDetailModal (vue Mois) n'offrait AUCUN moyen d'ajouter un examen (affichage/suppression seulement) — capacite ajoutee, symetrique a l'ajout d'objectif deja present.
8. **Nouvelle zone "A preparer cette semaine"** : `UpcomingExamsStrip` renomme/etendu en `WeekAheadCard` plutot que d'ajouter un widget redondant a cote — fenetre fixe de 7 jours (aujourd'hui inclus), examens ET objectifs non termines confondus, calcul 100% client (donnees deja chargees par `load()`, aucun nouvel appel Supabase).

i18n : ~10 cles `plan.*` ajoutees/modifiees en FR+EN (`plan.tomorrow`, `plan.dayAddExam`, `plan.newExamTitle`, `plan.examNamePlaceholder`, `plan.examLocationPlaceholder`, `plan.examSubmit`, `plan.weekAheadTitle`, `plan.shareError`, plus le renommage export/tooltip et le retrait de `plan.legend`).

Verification : `npm run lint` clean, `npm run build` propre OK (26/26). Verifie en navigateur (build prod offline) : toolbar (PDF absent, tooltip confirme via l'arbre d'accessibilite), vue Mois par defaut a toutes les largeurs, WeekAheadCard avec badges colores corrects (J-3 orange, objectifs "Aujourd'hui"/"Demain"/jour court), DayDetailModal — ajout d'examen teste de bout en bout (soumission + affichage + suppression), toggle de partage teste avec double-clic synchrone volontairement agressif (aucun blocage residuel), responsive 390-500px.

## 2026-07-06 - Chrono : fix espace blanc sous la carte (grille etiree)

Signale par l'utilisateur avec capture d'ecran (compte reel, 5 cours dans "Mes cours").

- **Cause** : la grille `grid grid-cols-1 gap-5 lg:grid-cols-3` (carte Chrono `lg:col-span-2` + colonne laterale Aujourd'hui/Mes cours) etire par defaut toutes les colonnes a la hauteur de la plus haute ligne. Avec 5 cours listes, la colonne laterale devient haute → la carte Chrono (peu de contenu a l'arret) etait etiree, laissant un grand vide sous le bouton Demarrer.
- **Fix** : ajout de `lg:items-start` sur le conteneur de grille (`pages/dashboard.js`) — chaque colonne garde desormais sa hauteur naturelle.
- Verification navigateur (offline, 5 cours factices reproduisant la capture) : plus de vide en idle, etat "running" (Blocus Blocks) inchange, colonne laterale garde son propre scroll. `npm run lint` clean, `npm run build` OK (26/26).

## 2026-07-06 - Chrono : "Blocus Blocks" remplacent l'onde (nouvelle signature)

Remplacement de l'onde facon Spotify (trop "audio", pas d'identite propre) par les **Blocus Blocks** : l'utilisateur ne remplit pas une barre, il CONSTRUIT sa session bloc par bloc (1 bloc = 15 min). `pages/dashboard.js` + `styles/globals.css` + i18n.

- **Composant `BlocusBlocks`** (remplace `SessionWave`, supprimee) : rangee de blocs — vide (discret) · valide (vert plein) · en cours (se remplit + pulse doux) · pause (bordeaux doux qui pulse) · bonus (vert degrade, valorise mais sobre). Utilise sur la page normale ET en focus plein ecran.
  - **Mode libre** : blocs qui s'accumulent, pas de "fin". Session longue → collapse "[10 valides] +N [bloc en cours]".
  - **Mode objectif / pomodoro** : progression vers un total (ex. 2h = 8 blocs), puis blocs bonus une fois depasse.
- **Texte intelligent** sous les blocs, UNE phrase selon le mode : libre "3 blocs valides · prochain bloc dans 13 min" · objectif "3/8 blocs · encore 1h12 pour ton objectif" · depasse "Objectif depasse de 38 min" · pause "Pause depuis mm:ss · reprends pour valider ton bloc". (Remplace la rotation `liveMessage`/`msgIdx`, supprimee ; les "moments" celebration restent en priorite 8 s.)
- **Pause beaucoup plus visible mais elegante** : suivi `pausedAt` + tick chaque seconde → "Pause depuis mm:ss" ; pastille "EN PAUSE" bordeaux qui pulse (`bt-pause-pulse`) ; chiffres + bloc en cours en bordeaux (`#CB5A4E`) ; carte teintee ; bouton Reprendre proeminent (pulse `bt-pause-cta`). En focus : fond bordeaux + maree bordeaux pulsee (`bt-pause-tide`) a la place de la verte.
- CSS : keyframes `bt-block-active` / `bt-block-paused` / `bt-pause-pulse` / `bt-pause-tide` / `bt-pause-cta` (+ reduced-motion). Suppression des keyframes `bt-wave-bob` / `bt-wave-wake`. La maree verte du focus monte vers l'objectif (`focusTidePct`), reste basse en libre (aucune fin suggeree).
- i18n : 9 cles `dash.blk*` / `dash.resumeBig` FR+EN.
- Verification navigateur (build prod offline, cohorte demo) : libre (3 blocs), objectif 2h (3/8), objectif depasse (2 blocs + 2 bonus + "depasse de 38 min"), focus plein ecran, pause normale + focus, barre espace pause/reprise, session longue (+6), pomodoro (0/2 blocs), responsive etroit. `npm run lint` clean, `npm run build` OK (26/26).

## 2026-07-06 - SEO contenu phase 2 : 6 landing pages publiques

Creation d'une vraie presence SEO publique pour Blocus Tracker, orientee requetes etudiantes FR/BE/CH et comprehension par moteurs IA.

- **Strategie retenue** : 6 pages a meilleur ROI au lieu d'un blog generique : `/pomodoro`, `/planning-revision`, `/stats-etude`, `/objectifs-etude`, `/application-etudiant`, `/blocus-belgique`.
- **Contenu** : chaque page a un H1, reponse courte lisible par LLM, sections H2 utiles, FAQ, CTA vers l'app et liens internes vers les pages proches.
- **Implementation** : contenu centralise dans `lib/seoLandingPages.js`, rendu par `components/SeoLandingPage.js`, avec 6 fichiers de routes Next.js tres fins.
- **SEO technique** : `lib/seo.js` ajoute les metadata uniques, sitemap indexable, JSON-LD `Article` + `FAQPage` + breadcrumbs pour ces pages. `llms.txt` liste maintenant les pages publiques avec titre et description.
- **Maillage interne** : la homepage pointe vers les 6 guides ; chaque guide relie 3 pages proches pour construire les silos Pomodoro -> Planning -> Stats -> Objectifs -> App et Blocus Belgique.
- **Important** : ces pages sont publiques et indexables. Les pages privees (`/dashboard`, `/admin`, `/messages`, `/profile`, etc.) restent hors sitemap et en `noindex`.

## 2026-07-06 - SEO technique : metadata, sitemap, robots, JSON-LD et homepage publique

Passe SEO/GEO appliquee pour rendre Blocus Tracker plus lisible par Google et les moteurs IA, sans changer les pages connectees.

- **SEO centralise** : `lib/seo.js` definit les routes indexables, les titres/descriptions/canoniques/robots et les schemas JSON-LD. `components/SeoHead.js` injecte title, description, canonical, Open Graph, Twitter Cards, robots et structured data depuis `_app.js`.
- **Pages indexables** : seules `/` et `/legal` sont dans le sitemap. Les pages de compte, app privee, `/dashboard`, admin, auth et social prive restent en `noindex`.
- **Homepage publique** : `/` devient une vraie page produit statique/SSR-friendly avec H1, sections, FAQ visible et CTA vers le chrono. Les utilisateurs deja connectes sont toujours rediriges cote client vers `/dashboard`.
- **Crawl** : ajout de `/sitemap.xml`, `/robots.txt` et `/llms.txt` generes cote serveur. `robots.txt` bloque uniquement `/api/` et declare le sitemap.
- **Structured data** : schemas `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `WebPage` et `BreadcrumbList` sur les pages publiques pertinentes. Pas de schema `Article` tant qu'il n'existe pas de vrais articles publics.
- **Partage social** : nouvelle image Open Graph `public/seo-preview.png` en 1200x630.

## 2026-07-06 - Nettoyage : gitignore des fichiers PWA auto-generes

Fin du churn permanent du `git status` a chaque build (valide par l'utilisateur).

- `.gitignore` : ajout de `public/sw.js`, `public/sw.js.map`, `public/workbox-*.js`, `public/workbox-*.js.map`, `public/swe-worker-*.js`, `public/fallback-*.js`.
- `git rm --cached` sur les 3 fichiers suivis (`public/sw.js`, `public/swe-worker-5c72df51bb1f6ee0.js`, `public/workbox-f1770938.js`) : retires du suivi Git mais CONSERVES sur le disque. Vercel les regenere au build, donc zero impact prod.
- Resultat : plus aucun fichier PWA en untracked/modifie dans `git status`.

## 2026-07-06 - Nettoyage : suppression du composant push orphelin

Petit menage de code mort (aucun changement fonctionnel).

- `components/PushNotificationsCard.jsx` supprime : devenu orphelin depuis la refonte du Profil (le reglage "Notifications push" est desormais inline via `PushRow` dans `pages/profile.js`). Verifie : plus aucun import dans tout le repo, seul un commentaire le referencait.
- `lib/onesignal.js` : commentaire mis a jour pour pointer vers `pages/profile.js` au lieu du composant supprime.
- `npm run build` OK (20/20).
- NON traite ici (necessite une action manuelle / decision partagee) : (1) le dossier `.next.corrupt-*` (~377 Mo de litiere, `rm -rf` refuse par les permissions) a supprimer a la main ; (2) `public/sw.js` et `public/workbox-*.js` (auto-generes par next-pwa) ne sont pas gitignores et polluent le `git status` a chaque build — a gitignorer + `git rm --cached` si validé.

## 2026-07-06 - Stats : hierarchie a deux niveaux (essentiel vs Analyse avancee)

La page etait devenue trop dense (tout au meme niveau). Reorganisation SANS rien supprimer (`pages/stats.js`), inspiree Strava/GitHub Insights/Apple Fitness.

- **Niveau 1 (toujours visible)** : Temps d'etude (KPI) → Resume intelligent → Objectifs → Heatmap (+ synthese) → Comparaison → Podium des cours → Classement (percentile Top X% + leaderboard). C'est la page principale, aeree.
- **Niveau 2 (repliable « Analyse avancee »)** : un seul bouton premium en bas de page ouvre en accordeon Graphiques detailles + Habitudes + Performances/Records + Badges. Etat persiste dans localStorage (`bt_stats_advanced`) : un curieux qui l'ouvre le retrouve ouvert. Chevron qui pivote, reveal en cascade (`bt-stagger`), affiche seulement si des sessions existent.
- Aucune statistique retiree : Habitudes, Performances, Records, Badges, graphiques sont juste deplaces sous le pli. L'etat vide premium (CTA "Lancer un chrono") reste au Niveau 1 pour les nouveaux comptes.
- i18n : 2 cles `stats.advancedTitle` / `stats.advancedSub` FR+EN.
- Verification navigateur (build prod offline, dark mode, cohorte de demo) : ordre Niveau 1 correct, toggle ouvre/ferme, tout le Niveau 2 s'affiche (habitudes, perf/records, badges 3/9). `npm run build` propre OK (20/20).

## 2026-07-06 - Stats : vague 2 (comparaison, export CSV, heatmap enrichie)

Suite de l'enrichissement Stats. Verifie visuellement cette fois (voir note preview plus bas).

- **Comparaison avec les autres** (item 11) : nouvelle carte comparant, sur 30 j, tes moyennes a celles de ta fac et de toute l'app (temps moyen/jour, sessions, jours actifs), en barres Toi/Ta fac/Toute l'app + chip d'ecart vs l'app. **Migration `supabase/migration_v24_stats_comparison.sql`** : RPC `get_study_comparison()` SECURITY DEFINER qui ne renvoie QUE des moyennes, jamais de donnees individuelles, et masque une cohorte de < 3 utilisateurs (anti-desanonymisation). A EXECUTER MANUELLEMENT dans le SQL Editor. Tant que non executee en prod, la RPC renvoie une erreur → la section se masque proprement (aucun crash). Mock offline ajoute dans `lib/offlineSupabaseClient.js`.
- **Export CSV des graphiques** (item 4, partiel) : bouton telecharger dans la modale plein ecran de `StatsCharts.js` (barres semaine + repartition cours). Client pur (Blob + `<a download>`, BOM UTF-8, separateur `;`). Le plein ecran + navigation semaine + toggle h/min existaient deja. PNG differe (necessiterait une dependance de rasterisation).
- **Heatmap enrichie** (item 5) : tooltip au survol enrichi (jour + date localises + duree formatee / "Aucune etude") dans `StudyHeatmap.js` ; ligne de synthese sous la heatmap (serie en cours, plus longue serie, meilleur mois, moy./jour).
- i18n : ~12 cles `stats.cmp*` + `stats.exportCsv` FR+EN.
- **Reporte** (honnete) : historique/evolution du classement (necessite des snapshots de rang periodiques → table + job cron), export PNG des graphiques (dependance).
- **Verification visuelle FAITE** : build de production avec `NEXT_PUBLIC_OFFLINE_DEV=true` puis `next start` sur un port dedie, pilote au navigateur. Necessaire car le nouveau CSP de `next.config.js` (ajoute par Codex, sans `unsafe-eval`) casse le Fast Refresh en **dev** (page blanche) — la prod n'utilise pas `eval` donc passe. Toutes les sections vues en clair ET sombre : Resume, Objectifs, Habitudes, Perf/Records, Badges (3/9), Comparaison (avec garde-fou cohorte < 3 → barre "Ta fac" masquee), export CSV present.
- **A signaler a Codex** : le CSP inconditionnel de `next.config.js` rend `npm run dev` inutilisable (EvalError react-refresh). A conditionner a la production, ou ajouter `'unsafe-eval'` en dev.

## 2026-07-06 - Stats : enrichissement insights (vague 1) — resume, objectifs, habitudes, records, badges

Enrichissement de `pages/stats.js` (design minimal conserve) a la demande de l'utilisateur : rendre la page plus intelligente/motivante sans la surcharger. Nouveau module pur `lib/statsInsights.js` (calculs depuis les sessions deja chargees, aucun nouveau backend).

- **Resume intelligent** (haut de page) : 2-4 phrases dynamiques priorisees (rien etudie aujourd'hui + relance de serie ; sinon temps du jour + total du mois + meilleur jour + regularite vs semaine passee + encouragement).
- **Objectifs proeminents** : 4 barres `GoalBar` (journalier 2h, hebdo 10h, mensuel 40h, serie en cours) avec %, valeur/cible, reste ("Encore X !") et etat atteint. Pourcentage anime (count-up, respecte reduced-motion).
- **Habitudes** : repartition matin/apres-midi/soir/nuit (barres), jour prefere, duree moyenne de session, heure moyenne de debut.
- **Performances + Records** : jour/heure les plus productifs, plus longue session, plus grande journee ; records serie/semaine/mois/total.
- **Badges statistiques** : 9 badges a icones SVG teintees accent (premiere heure, serie 7j, session 3h+, journee marathon, 50h, 100h, apres minuit, leve-tot, objectif 10j d'affilee), debloques auto + compteur. NB : icones SVG et non emojis pour rester coherent avec la dir. "de-emojifiee" de l'app.
- **Classement enrichi** : la carte percentile ink affiche desormais "Top X%" + "#N sur T etudiants" (depuis le RPC get_my_study_rank existant, better_count/total_active).
- **Etat vide premium** des graphiques : illustration + titre + sous-titre motivant + CTA "Lancer un chrono" (vers /dashboard) au lieu d'un texte nu.
- **Responsive/mobile** : ordre pense mobile-first (Resume + Objectifs juste apres les KPI), grilles 1→2 colonnes.
- i18n : ~60 cles `stats.*` FR+EN. Micro-interactions : count-up (`useCountUp`), reveal via `bt-stagger` existant.
- **Reporte en vague 2 (necessite backend/composant graphique)** : comparaison avec les autres (moyennes uni/app → nouvelles RPC agregees), export PNG/CSV + zoom + plein ecran des graphiques (composant StatsCharts), historique/evolution du classement, enrichissement du tooltip de la heatmap.
- **Verification** : `npm run build` OK (20/20). ATTENTION : verification visuelle en direct NON faite — le dev local pointait sur le vrai Supabase (flag offline retire) sans identifiants de test ; a controler visuellement des que le mode offline est reactive ou avec un vrai compte.

## 2026-07-05 - Securite : hardening Next/Supabase anti-abus

Passe de durcissement securite appliquee cote code, avec migration Supabase preparee mais **non appliquee automatiquement**.

- **Headers securite Next/Vercel** (`next.config.js`) : CSP compatible Supabase/OneSignal/PWA, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `poweredByHeader: false`.
- **API routes** : nouveau helper `lib/apiSecurity.js`; body size limite, `no-store`, validation JSON, rate limit et comparaison timing-safe du secret webhook. Nouvelle route serveur `pages/api/storage/sign.js` pour signer les pieces jointes DM privees apres verification JWT + participation a la conversation.
- **Uploads** : nouveau helper `lib/security.js` avec tailles max, MIME autorises, noms/chemins Storage generes sans faire confiance au nom original. SVG/HTML/JS/EXE bloques. Feed/avatars images uniquement; DM/groupes/communautes acceptent images + PDF/TXT/Office. Messages/captions/commentaires bornes.
- **DM prives** : les nouveaux fichiers DM sont stockes comme reference `dm:<path>` et lus via URL signee courte. Le code est pret pour fermer la policy Storage trop large `dm_read_authenticated`.
- **Emails profils** : `contexts/AuthContext.js` ne fait plus `select("*")` sur `profiles`; l'email du compte courant passe par `get_my_email()` ou l'utilisateur Auth. La migration v24 revoque `SELECT(email)` pour `anon/authenticated`.
- **Anti-abus client** : cooldowns locaux sur posts, commentaires, reactions, DM, messages de groupe/communaute, invitations, annonces admin. Ce n'est pas la barriere principale, juste une protection UX.
- **Admin** : liens d'annonces limites aux chemins internes (`/…`), et les notifications refusent de naviguer vers un href externe/technique.
- **Migration SQL ajoutee** : `supabase/migration_v24_security_hardening.sql` prepare :
  - revoke des RPC `SECURITY DEFINER` exposables a `anon`;
  - limites MIME/taille buckets `avatars`, `posts`, `community`, `dm`;
  - suppression des policies Storage de listing public large;
  - lecture DM directe limitee a l'uploader, lecture receiver via `/api/storage/sign`;
  - contraintes texte/visibility/attachment type en `NOT VALID`;
  - triggers DB anti-spam sur posts/comments/likes/messages/friend requests;
  - suppression de policies legacy en double.
- **Important** : appliquer la migration v24 dans Supabase SQL Editor seulement apres revue. Ne pas executer sans backup mental du plan, car elle change des permissions RLS/Storage en production.
- Verification : `npm run build` OK (20 pages). La migration n'a pas ete appliquee a Supabase pendant cette passe.

## 2026-07-05 - Admin : transformation en cockpit de gestion

Refonte complete de `pages/admin.js` (monolithe 1014 L) en cockpit multi-sections, a la demande de l'utilisateur. Design premium/vert conserve. Nouveau module pur `lib/adminAnalytics.js` pour les agregations.

- **Navigation en 6 sections** (segmented) : Vue d'ensemble · Analytics · Activite · Membres · Technique · Contenu.
- **Recherche globale** (`GlobalSearch`) : membres (pseudo/nom/fac), communautes (statique), annonces, suggestions — dropdown groupe, clic membre → fiche.
- **Flux d'activite temps reel** : backfill initial (comptes, sessions, posts, messages, badges, suggestions fusionnes/tries) + abonnement Supabase Realtime `postgres_changes` INSERT sur 6 tables → prepend en direct. Indicateur LIVE/hors-ligne (timeout 4 s ; en offline le stub `channel()` ne crashe pas). 
- **Fiche utilisateur complete** (`UserSheet`) : avatar, niveau, stats (temps/sessions/amis/parrainages), inscription + derniere activite + code parrain, **heatmap 1 an** (reutilise StudyHeatmap), **grille de badges** (via `user_badges`), sessions recentes. Actions rapides : Editer, **Message** (insert `private_messages` depuis l'admin), **Suspendre/Reactiver** (toggle colonne `locked`, autorise par le trigger v7 pour un admin editant autrui), Supprimer (RPC `admin_delete_user`).
- **Analytics** (filtre periode 7/30/90 j, tooltips au survol, dark-safe) : nouveaux users/jour, progression cumulee des inscriptions, DAU/WAU/MAU, heures d'etude/jour, sessions/jour, temps moyen/session, retention J1/J7/J30 (anneaux, "revient apres N jours" sur comptes eligibles), publications feed/jour, messages/jour, repartition par universite, universites les plus actives, statut d'activation (donut), actifs vs inscrits.
- **Honnetete des donnees non calculables** : repartition mobile/desktop → carte "non suivi, necessite une colonne device" (pas de chiffre invente).
- **Dashboard technique** : verifies auto (latence DB chronometree, temps reel via subscribe, push via env, auth) avec pastilles vert/orange/rouge ; Storage/Egress/Emails/Sauvegarde → "a brancher" (necessitent l'API Management Supabase, endpoint serveur) ; dernier deploiement via `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` si expose ; volumetrie des donnees chargees.
- **Contenu** : sous-onglets Annonces (formulaire conserve) · **Suggestions** (`app_feedback`, changement de statut new/read/done) · Comptes supprimes.
- **Seed offline enrichi** (`lib/offlineSupabaseClient.js`, DB_KEY v1→v2) : ~16 membres deterministes (mulberry32) sur plusieurs universites, sessions/posts/messages/badges etales sur 45 j → cockpit reellement demontrable en dev.
- **Echelle** : agregations client plafonnees (sessions limit 8000) ; commentaire indiquant de passer a des RPC SQL `GROUP BY` au-dela de quelques milliers d'utilisateurs.
- **i18n** : la page admin etait deja en francais code en dur (page admin-only) ; convention conservee pour la coherence du fichier. Fix hooks-order : garde `is_admin` deplacee apres tous les `useMemo`.
- Verification navigateur (offline dev, 16 membres/121 sessions) : les 6 sections, tous les graphiques (clair + sombre), fiche + suspension persistee, recherche globale, panneau technique, `npm run build` OK (20/20).

## 2026-07-05 - Profil : refonte complete avec vraie version desktop

Refonte totale de `pages/profile.js` demandee par l'utilisateur : fin de la "version mobile etiree", vraie mise en page desktop multi-colonnes, esprit GitHub (heatmap) x Duolingo (progression) x Strava (profil).

- **Layout desktop** : conteneur `max-w-[1200px]`, hero identite pleine largeur puis grille `lg:grid-cols-3` — contenu 2/3 (activite, activite recente, preferences, compte, admin) + gamification 1/3 (XP/missions, badges, parrainage). Sur mobile l'ordre DOM place la progression juste apres le hero (colonne droite en premier), rien de casse.
- **Hero horizontal (Strava)** : cover ink + avatar chevauchant (seul l'avatar chevauche — le nom reste sous la ligne pour le contraste), nom + LevelPill, @pseudo · etudes · fac sur une ligne, bio, bouton "Modifier le profil" → **modal d'edition** (l'ancien accordeon "Mes infos" devient `EditProfileModal`). **Rail de 5 stats** : Temps total · Sessions · Serie · Record · Rang (7 j) via le RPC existant `get_my_study_rank('week')` (normalise objet/tableau).
- **Activite** : heatmap GitHub en piece maitresse pleine largeur + 4 tuiles (30 derniers jours, Moyenne/jour 30 j, Jours actifs 1 an, Objectifs atteints). **Activite recente** : les 8 dernieres sessions reelles avec pastille couleur du cours, date + heure locale, duree (nouvelle requete `courses` id/name/color pour le mapping, donnees propres a l'utilisateur).
- **Preferences modernes** : rangees uniformes (`SettingsRow` + `CardHead` partout) — Langue en segmented FR/EN, **Theme en segmented Clair / Systeme / Sombre** (nouveau mode Systeme), Notifications push reduites a une rangee compacte (`PushRow` inline, `PushNotificationsCard` devenu orphelin mais conserve).
- **Fix theme** : nouveau `useTheme` — storage `bt_theme` ("light"|"dark"|"system"), migration de la cle heritee `bt_dark`, ecoute `prefers-color-scheme` en mode systeme, `ready` en state (meme pattern que le fix TimerContext pour eviter l'ecrasement StrictMode). Script anti-flash de `pages/_document.js` mis a jour (lit bt_theme, gere system, migre bt_dark).
- **Compte** : email (valeur visible en description), installer l'app (texte raccourci, pave d'aide supprime), avis, legal, a propos, deconnexion et suppression regroupes dans une seule carte coherente. **Parrainage compact** : lien + copier + compteur, gros texte d'aide supprime, liste filleuls repliable conservee (fix props Avatar url/pseudo au passage).
- **Admin** : carte dediee en bas, visible uniquement `is_admin` (dashboard + boite a suggestions).
- i18n : ~16 cles `profile.*` FR+EN (stats, theme, activite recente...).
- Verification navigateur (offline dev) : desktop 1280/1360 clair+sombre, theme Sombre/Systeme/Clair + persistance apres reload (segment actif restaure), migration bt_dark → bt_theme observee, modal edition ouvert/ferme, mobile 390 (hero centre, rail 3+2, progression en premier). `npm run build` OK (20/20).

## 2026-07-05 - Correctifs Social : logos communautes, scroll naturel, Messages premium

Passe de correction apres la refonte Social phase 1.

- **Logos communautes** : `lib/universities.js` pointe maintenant vers `/logos-commu/...` (les anciens fichiers `/public/logos` ayant ete deplaces hors de cette passe). `pages/communautes.js` utilise un composant `CommunityLogo` avec fallback initiales couleur si l'image manque vraiment ou echoue au chargement.
- **Scroll communautes** : suppression de l'auto-scroll global a chaque refresh. Le scroll va en bas au chargement initial et apres envoi ; lors du polling, il ne descend automatiquement que si un nouveau message arrive et que l'utilisateur est deja proche du bas.
- **Messages** : hauteur unifiee des panneaux avec `calc(100dvh - 148px)` pour mieux utiliser l'espace desktop/mobile. La carte Groupes redevient neutre, avec le vert uniquement en accent. L'espace "Relations" est renomme **Amis** dans l'interface.
- Aucune logique Supabase, table, policy, bucket ou migration modifiee.

## 2026-07-05 - Refonte sociale phase 1 : Activite, Relations, Communautes entraide

Premiere passe concrete de la refonte Social avec objectif prioritaire : rendre la partie sociale plus vivante et moins couteuse en stockage/egress Supabase, sans migration destructive.

- **Navigation sociale simplifiee** (`components/Layout.js`) : l'onglet separe `/friends` est retire de la navigation Social. Les demandes d'amis sont maintenant comptees dans le badge de `/messages`.
- **Fusion Amis -> Messages** (`pages/messages.js`) : ajout d'un espace **Relations** dans Messages avec recherche d'utilisateur, demandes recues/envoyees, suggestions, liste d'amis et ouverture directe d'une conversation. La route `/friends` redirige vers `/messages?tab=relations`.
- **Feed -> Activite** (`pages/feed.js`, `lib/i18n.js`) : le feed devient un fil d'activite. Il accepte maintenant une publication texte sans photo. Pour rester compatible avec le schema actuel (`posts.image_url not null`), les posts texte utilisent une minuscule image placeholder en data URL au lieu d'uploader un fichier Supabase. Les photos restent possibles, compressees avant upload comme avant.
- **Preparation du partage automatique** : ajout d'un panneau de preferences locales dans Activite pour les futurs posts generes automatiquement : fin de session, objectif atteint, record, niveau, streak. Pour l'instant ces preferences sont stockees dans `localStorage` (`bt_social_auto_share_v1`) et ne modifient pas la base.
- **Communautes -> entraide** (`pages/communautes.js`) : ajout d'espaces visibles **Salon / Questions / Ressources / Examens** sans nouvelle table. Les messages hors Salon sont tagues dans `community_messages.content` (`[Question]`, `[Ressource]`, `[Examen]`) afin de tester l'UX avant une vraie migration `community_threads`.
- **Important technique** : aucune table, policy RLS, bucket, secret ou migration Supabase n'a ete modifie dans cette phase. La prochaine phase propre sera une migration dediee pour `posts.kind/event_type/payload` ou une table `social_activities`, puis de vraies tables `community_threads/community_replies` si l'UX est validee.

## 2026-07-05 - Chrono : passe motion design (signature) + fix restore du timer

Second passage sur la page Chrono a la demande de l'utilisateur : micro-interactions et motion design pour en faire une signature. Aucune nouvelle fonctionnalite metier.

- **Chiffres vivants** : effet odometre (`RollChar`) — chaque caractere qui change glisse vers le haut en fondu, fente a largeur fixe `1ch` (pas de clip : un overflow-hidden inline-block casse la baseline, bug rencontre puis corrige).
- **Onde plus naturelle** : profil lisse par 2 passes de moyenne voisin-a-voisin (colline organique au lieu du peigne) ; **respiration** des 4 barres au bord de progression (scaleY desynchronise, durees variees) ; **sweep de reveil** au demarrage (56 barres en cascade, delai 12 ms/barre) ; trainee d'opacite (0.62 → 1 vers la tete) ; dim a 0.4 en pause.
- **Fond evolutif** : halo radial vert en bas de la carte dont l'opacite suit la progression (GPU, opacity seule) ; en mode focus, **maree verte** qui monte du bas de l'ecran au fil de la session (transform scaleY, origin bottom, transition 2.5 s), coupee sur l'etat pause rouge.
- **Moments** : messages evenementiels au franchissement de seuil, une fois par session, affiches 8 s en vert accent (pop `.bt-msg-pop`) en priorite sur la rotation ambiante — objectif de session atteint, 2h du jour, record du jour battu, plus longue session depassee, chaque heure pleine. Ordre d'ecrasement du plus banal au plus precieux.
- **Focus habitable** : controles qui s'estompent apres 4,5 s d'inactivite (pattern lecteur video, pointer-events coupes) et reapparaissent au moindre mouvement ; **barre espace = pause/reprise** (hint discret desktop) ; jamais caches quand le chrono est en pause.
- **Fix `contexts/TimerContext.js`** (bug latent revele par les tests) : en dev, le double-effect de React StrictMode ecrasait le localStorage avec les etats par defaut avant la relecture → le chrono ne survivait pas au reload. `hydrated` passe de ref a state (batch avec les valeurs restaurees). Comportement prod inchange, promesse "le chrono continue apres reload" reparee en dev.
- CSS : keyframes `bt-msg-pop`, `bt-digit-roll`, `bt-wave-bob`, `bt-wave-wake` + ajout au bloc reduced-motion. i18n : 6 cles `dash.moment*`/`dash.spaceHint` FR+EN.
- Verification navigateur (offline dev) : restore 25 min apres reload OK, moment "objectif de session" observe en direct a 25:01, bascule 59→1:00 des chiffres, auto-hide/reapparition des controles focus, espace pause/reprise, light+dark, `npm run build` OK (20/20).

## 2026-07-05 - Chrono : refonte premium de l'experience (onde de session, objectif, messages vivants, records)

Refonte complete de la page Chrono (`pages/dashboard.js`) demandee par l'utilisateur : design premium/minimaliste inspire Apple/Notion/Spotify, le chrono redevient le heros. Aucune logique metier touchee (save/queue/pomodoro/guest intacts).

- **L'onde de session remplace l'anneau circulaire** : 56 fines barres (enveloppe symetrique, hauteurs deterministes) qui se remplissent de vert selon la progression — objectif de session > phase pomodoro > 2h du jour. Composants `SessionWave` + `TimerDigits` (secondes de-emphasees, plus d'heures affichees sous 1h).
- **Objectif de session** : chips 25 min / 45 min / 1 h / 1 h 30 / 2 h / infini avant de demarrer (mode libre uniquement), persiste dans localStorage `bt_session_goal_v1`. L'onde vise cet objectif.
- **Messages vivants** : ligne contextuelle qui tourne toutes les 12 s pendant la session (objectif de session restant/atteint, 2h du jour, XP de la session, serie en cours, record du jour a battre / en train d'etre battu, plus longue session depassee). Que des faits calcules, hauteur fixe (zero layout shift), animation `.bt-msg-swap` (globals.css, reduced-motion ok).
- **Records (90 j)** dans la carte ink Aujourd'hui : Meilleur jour / Plus longue session / Cette semaine / Meilleure serie. Requete `recentRes` etendue a `started_at, duration_seconds` (donnees propres a l'utilisateur, RLS ok).
- **Layout epure** : titre/sous-titre supprimes → barre de contexte (pill cours + badge examen J-X + segmented Libre·Pomodoro neutre + bouton plein ecran) ; note discrete (soulignee au focus) ; boutons pill inline centres (Terminer masque tant que rien a enregistrer) ; micro-caption "le chrono continue…" sous les boutons.
- **Mode focus** aligne : onde + memes chiffres + message vivant (anneau supprime la aussi).
- i18n : ~19 cles `dash.*` FR+EN (messages, records, objectif). `ProgressRing` supprime.
- Verification : `npm run build` OK (20/20) + navigateur offline dev — idle/running/pause/pomodoro/focus, light + dark, desktop 1280 + mobile 390, flux save complet (records mis a jour en direct apres enregistrement), zero erreur console.

## 2026-07-05 - Planning : export calendrier (.ics / Google Agenda, Apple, Outlook)

Nouvelle fonctionnalite : bouton "Agenda" dans la barre d'outils du planning qui telecharge un fichier `.ics` (iCalendar RFC 5545) regroupant les examens et les objectifs, importable dans n'importe quel agenda externe. Evite de ressaisir manuellement examens/objectifs dans son vrai calendrier.

- `lib/ics.js` (NOUVEAU, pur / sans Supabase) : `buildIcs()`, `downloadIcs()`, `countExportable()`.
  - Objectifs et examens avec heure → evenements en heure LOCALE flottante (14:30 reste 14:30 quel que soit le fuseau) ; sans heure → journee entiere (VALUE=DATE, DTEND exclusif).
  - Objectifs recurrents → `RRULE:FREQ=WEEKLY;BYDAY=…` (+ `UNTIL` optionnel). `recurrence_weekdays` = valeurs getDay() (0=Dim…6=Sam) mappees vers BYDAY.
  - Examens → `LOCATION` si renseigne, prefixe SUMMARY "Examen —"/"Exam —".
  - Objectifs deja `done` exclus (un agenda regarde vers l'avenir). Echappement RFC (`\; \, \n`), pliage de lignes, CRLF.
- `pages/planning.js` : import + handler `exportCalendar()` (alert si rien a exporter) + bouton "Agenda" (icone calendrier) a cote du bouton PDF, `no-print`.
- `lib/i18n.js` : 6 cles FR+EN (`plan.exportCalendar`, `plan.exportCalendarHint`, `plan.calendarName`, `plan.examPrefix`, `plan.icsStudyBlock`, `plan.exportEmpty`).
- Verification : test unitaire Node du generateur (evenements timed/all-day, RRULE lun/mer, echappement, `done` exclu, CRLF) + `npm run build` OK (20/20) + navigateur (offline dev) : clic sur "Agenda" produit bien un Blob `text/calendar` valide (3 VEVENT depuis les donnees offline).

## 2026-07-04 - Communautes : reduction du logo en filigrane

Le logo d'universite affiche en fond de chaque chat de communaute prenait trop de place — confirme visuellement (logo ULB "UNIVERSITE LIBRE DE BRUXELLES" bien lisible, dominant presque toute la zone de messages).

- `pages/communautes.js` : filigrane reduit de `width: 55% / maxWidth 400 / opacity 0.10` a `width: 26% / maxWidth 190 / opacity 0.08`.
- Verification : `npm run build` OK (20/20) + navigateur (mode offline dev) : logo desormais discret sur ULB ET UCLouvain (le fix s'applique via `activeMeta.logo`, donc a toutes les communautes), verifie en light et dark.

## 2026-07-04 - Refonte page Stats (cartes, graphiques, podium, tendances)

### `pages/stats.js`
- **Cartes de stats (StatTile)** : fond vert uniforme `rgba(20,184,133,0.06)` -> fond neutre `var(--bt-subtle)` + `var(--bt-border)` (comme la carte activite du profil, deja neutralisee). Les puces d'icones passent de tints doux a des couleurs PLEINES (vert accent / ambre serie / bleu total) pour ressortir sur le fond neutre.
- **Podium & classements (RankBadge)** : le 1/2/3 tout-vert -> or (#F59E0B + glow ambré) / argent (#9AA4B2) / bronze (#C2703D), le reste en numero discret. Le 1er se demarque nettement. S'applique aux 3 endroits (podium cours + leaderboard amis + leaderboard public, deja unifies sur RankBadge).
- **Fleches de tendance** : nouveau composant `TrendChip` (fleche ▲/▼/– + %, vert/rouge/neutre). Ajoute sur la tuile "Aujourd'hui" (vs hier, `todayDeltaPct` calcule via `lastNDates(2)[0]`) et "Cette semaine" (vs semaine derniere, `weekDeltaPct` deja calcule ; l'ancien sous-texte delta est remplace par la chip + un sous-titre court `stats.vsLastWeek`).
- **Objectif du jour** : la tuile "Aujourd'hui" a maintenant une barre de progression vers l'objectif 2h (meme logique que le dashboard, `DAILY_GOAL_SECS=7200`) + libelle "X% · Objectif 2h" (reutilise `dash.goal`).
- Nettoyage : `todayLabel` (devenu inutilise) supprime. `stats.weekUpPct/weekDownPct/weekSamePct` deviennent orphelines (laissees, inoffensives).
- 1 nouvelle cle i18n `stats.vsLastWeek` (FR+EN).

### `components/StatsCharts.js`
- **Heures par defaut** : `showHours` initialise a `true` (etait `false`/minutes).
- **Ouverture des graphiques** : l'ancien affichage "au-dessus de la grille grisee-mais-toujours-presente" (qui doublait la hauteur) remplace par une VRAIE modale plein ecran (bottom-sheet mobile / centree desktop, backdrop assombri + blur, comme les autres modales de l'app). La mini-grille reste en place dessous.
- **Dark mode** (ce composant n'y avait JAMAIS ete passe) : couleurs en dur corrigees. Habillage des graphiques (axes/grille) en gris neutre `#94908B` (car Recharts applique `tick.fill`/`stroke` comme ATTRIBUTS SVG ou var(--bt-*) ne se resout pas) ; tooltips/modale/boutons/toggle en `var(--bt-*)` (inline-style, vars OK). Bouton fermer neutralise, MiniToggle actif en vert plein.
- Verification : `npm run build` OK (20/20) + navigateur mode offline dev, LIGHT et DARK, mobile 375px : fond neutre + icones pleines OK, podium or/argent/bronze avec 1er qui ressort, tuile Aujourd'hui avec tendance ▲33% + barre 50% objectif 2h, heures par defaut, modale graphique bottom-sheet propre en clair ET sombre (le vrai gain : le composant est enfin correct en dark).

## 2026-07-04 - Partie sociale : badge messages de groupe + de-emojification

Suite de l'analyse "partie sociale" (apres la suppression de /groupes).

### Decouverte en cours de route : le chrono de groupe n'a PAS de lacune XP
Verifie dans `supabase/migration_v12_group_chrono.sql` : la fonction `finish_group_chrono` insere deja une vraie ligne dans `sessions` (duration_seconds, note "Chrono de groupe — {nom}") pour CHAQUE participant accepte. Le chrono de groupe compte donc deja normalement dans les minutes totales, le streak et les stats — exactement comme une session solo. Pas de rééquilibrage necessaire sur ce point ; le vrai "trou" XP se limite au chat/messagerie (chatter ne devrait probablement pas rapporter d'XP de toute facon, pour eviter le farming).

### Badge de notification manquant pour les messages de groupe (corrige)
`contexts/NotificationContext.js` ne suivait que les DM prives (`private_messages`) — les nouveaux messages dans un chat de groupe ne remontaient nulle part (ni badge nav, ni panneau de notifications).
- Nouveau `groupCount` (dict par groupe) + `totalGroups`, calcules dans `poll()` avec le meme pattern de lecture groupee deja utilise pour les communautes (derniere-vue en localStorage, cle `group_<uuid>` — aucun risque de collision avec les slugs de communaute).
- Nouvelle fonction `markGroupSeen(groupId)`, appelee depuis `pages/messages.js` a l'ouverture d'un groupe.
- `components/Layout.js` : le badge `/messages` et le total social incluent desormais `totalGroups`.
- `pages/messages.js` : badge non-lu par groupe dans la liste laterale (meme style que le badge non-lu par ami en DM).

### De-emojification (messages.js, communautes.js, feed.js)
- `chronoStatusChip` (statuts participant du chrono de groupe) : suffixes texte `✓`/`✗`/`⌛` remplaces par des icones SVG (check / croix / horloge).
- Trombone `📎` (4 occurrences messages.js, 2 communautes.js) remplace par un composant local `IconPaperclip` reutilisable.
- `title="Joindre"` / `"Joindre un fichier"` en dur -> cle i18n `common.attach` (FR+EN).
- Alertes d'upload en dur (`"Échec upload : "`, `"Erreur upload : "`, `"Échec de l'envoi du fichier : "`) unifiees sous une seule cle `common.uploadFailed`, appliquee aussi a `feed.js` qui avait la meme chaine en dur (`"Échec de l'upload : "`) — meme classe de bug, meme correction.
- Fallback `pseudo: "Utilisateur"` (messages.js + communautes.js) -> cle `common.unknownUser`.
- 3 nouvelles cles i18n FR+EN : `common.attach`, `common.uploadFailed`, `common.unknownUser`.
- Verification : `npm run build` OK (20/20) + navigateur (mode offline dev) : nav "Messages" badge=1 sans NaN/doublon apres l'ajout de `totalGroups`, icone trombone rendue correctement dans le composeur, aucune erreur console. Les icones de statut chrono (✓/✗/⌛→SVG) n'ont pas pu etre testees visuellement en mock offline (necessite plusieurs participants), verifiees par lecture de code + build reussi.

## 2026-07-04 - Suppression de la page fantome /groupes (analyse "partie sociale")

Suite a une analyse complete des 5 pages sociales (feed, messages, amis, communautes, groupes). Premiere action retenue : nettoyer `/groupes`.

**Constat verifie independamment** : `pages/groupes.js` (490 lignes) n'avait **aucun lien entrant nulle part** dans le code (absent de `NAV_SOCIAL`, `SOCIAL_PATHS`, et de tout `href`/`router.push`). Seul un utilisateur devinant l'URL aurait pu y acceder. Son contenu (creation/gestion de groupes d'etude, messagerie de groupe) etait quasi duplique dans `pages/messages.js`, qui est un **sur-ensemble strict** : memes tables (`study_groups`, `group_members`, `group_messages`) + en plus le chrono de groupe synchronise (invitations, statuts accepte/refuse/en attente, RPC `finish_group_chrono`) que `groupes.js` n'avait pas.

- `pages/groupes.js` **supprime** entierement (git rm).
- `components/Layout.js` : `IconGroups` (fonction morte, utilisee nulle part ailleurs) et l'entree `"/groupes"` du map d'icones (deja inatteignable) retires.
- `lib/i18n.js` : `nav.groups` (FR+EN, jamais consomme par un tableau de nav) + 10 cles `groups.*` verifiees comme exclusivement utilisees par la page supprimee (`title`, `subtitle`, `noGroups`, `members`, `delete`, `chronoNote`, `chronoParticipants`, `viewMembers`, `photoUpdated`, `noActive`) retirees en FR+EN. Les ~18 autres cles `groups.*` **conservees** : verifie qu'elles sont activement utilisees par la fonctionnalite groupe de `messages.js` (chrono, invitations, membres...).
- `docs/ARCHITECTURE.md` : ligne de route `/groupes` retiree du tableau, note ajoutee sur `/messages` precisant qu'il couvre aussi les groupes + le chrono synchronise.
- Verification : `npm run build` OK (21 -> **20 pages**, confirmant la route disparue) + navigateur (mode offline dev) : nav sans "Groupes", `/messages` fonctionne toujours normalement (liste des groupes, ouverture d'un groupe, panneau "Nouveau chrono de groupe" — toutes les cles i18n partagees rendent correctement apres le nettoyage).

Reste de l'analyse sociale (non traite maintenant) : rééquilibrage XP/missions (messagerie/chat de groupe/communaute ne rapportent actuellement aucun XP, contrairement au feed et aux demandes d'ami), emojis decoratifs a corriger (📎 trombone, ✓/✗/⌛ statuts chrono, ★ badge admin dans messages.js et communautes.js), chaines FR en dur restantes dans messages.js, badge de notification manquant pour les messages de groupe non lus.

## 2026-07-02 - Partie legale du site (confidentialite, CGU, cookies, mentions)

Ajout de tout le volet legal, accessible depuis le profil et le footer. Contenu redige d'apres un AUDIT REEL des pratiques de l'app (pas un template generique).

### Nouveaux fichiers
- `lib/legal.js` : contenu bilingue (FR + EN) des 4 documents, structure en sections. Constantes `LEGAL_CONTACT_EMAIL` et `LEGAL_EFFECTIVE_DATE`. En-tete du fichier = liste des points a verifier/completer par Mathias (voir plus bas).
- `pages/legal.js` : page unique avec un selecteur d'onglets (Confidentialite / CGU / Cookies & stockage / Mentions legales), deep-linkable via `/legal?doc=cookies`. Rendu selon la langue active.

### Contenu (fonde sur l'audit)
- **Confidentialite** : responsable = Mathias Dock (projet perso etudiant) ; donnees reellement collectees (profil, sessions, cours/objectifs/examens, contenu social, XP/badges/parrainages, technique) ; finalites + bases legales ; sous-traitants reels (Supabase, Vercel, Resend, OneSignal si push active) ; conservation (photos feed = 24 h) ; droits RGPD (rectification = profil, effacement = suppression de compte in-app) ; APD Belgique.
- **CGU** : objet, compte, usage acceptable, contenu, disponibilite "en l'etat" (projet etudiant), resiliation, responsabilite, droit belge.
- **Cookies & stockage** : point honnete cle -> AUCUN cookie publicitaire ni traceur tiers ; uniquement localStorage fonctionnel (liste des cles reelles), cache PWA, jetons de session Supabase ; OneSignal charge seulement si notifications activees.
- **Mentions legales** : editeur, directeur de publication, hebergement (Vercel + Supabase), propriete intellectuelle.

### Integrations
- `components/Layout.js` : `/legal` ajoute a `GUEST_PUBLIC_PATHS` (les pages legales DOIVENT etre publiques) ; lien "Legal & confidentialite" ajoute au footer desktop.
- `pages/profile.js` : rangee "Legal & confidentialite" (nav, fleche droite) dans la carte "Aide & a propos", nouvelle icone `IconLegal`.
- `pages/signup.js` : ligne de consentement sous le bouton ("En creant un compte, tu acceptes...") liant vers `/legal`.
- `lib/i18n.js` : cles UI (titre, sous-titre, 4 onglets, "derniere mise a jour", libelle profil, footer, consentement signup) en FR+EN. Le contenu long-forme reste dans `lib/legal.js` (bilingue).
- Verification : `npm run build` OK (21/21, nouvelle route `/legal`) + navigateur : page publique en invite, onglets + deep-link OK, light ET dark, rangee profil + lien footer OK.

### ⚠️ A FAIRE / VERIFIER PAR MATHIAS avant de s'y fier (aussi liste en tete de lib/legal.js)
- Adresse de contact publiee (`LEGAL_CONTACT_EMAIL` = mathias.dock.management@gmail.com actuellement).
- Statut de l'editeur : le texte suppose une personne physique / projet perso. Si structure (asbl, entreprise) -> ajouter n° d'entreprise/TVA, adresse.
- Regions d'hebergement exactes Supabase/Vercel + transferts hors UE.
- Age minimum (fixe a 16 ans).
- Date de derniere mise a jour.
- Ce contenu est une base serieuse et honnete mais N'EST PAS un avis juridique -> faire relire.

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
