# AI_CHANGELOG.md

Ce fichier sert de suivi commun pour Claude Code et Codex. Toujours le lire avant de modifier le projet afin d'eviter les doublons, les inversions de changements ou les confusions entre mode local et production.

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
