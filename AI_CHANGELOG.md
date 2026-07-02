# AI_CHANGELOG.md

Ce fichier sert de suivi commun pour Claude Code et Codex. Toujours le lire avant de modifier le projet afin d'eviter les doublons, les inversions de changements ou les confusions entre mode local et production.

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
