# Blocus Tracker

Application web gratuite pour étudier avec un chrono, planifier ses examens et suivre ses progrès.

- **Site officiel :** https://www.blocus-tracker.com/
- **Minuteur Pomodoro en ligne, sans compte :** https://www.blocus-tracker.com/pomodoro

## Pour qui ?

Pour les étudiants qui préparent leurs cours, leurs examens et leur blocus, la période de révision avant les examens en Belgique francophone. L'application a été pensée autour du blocus, mais elle convient à toute période d'examens, en Belgique comme ailleurs. L'interface existe en français et en anglais.

## Ce que fait l'application

### Chrono

- **Session libre ou Pomodoro** sur un de tes cours, avec les pauses du Pomodoro.
- **Mode Focus** : le chrono en plein écran, le reste de l'application mis de côté.
- Le chrono continue si tu changes d'onglet, et une session en cours reprend après un rechargement de la page.

### Essayer sans compte

- **Mode découverte** ([« Tester sans compte »](https://www.blocus-tracker.com/dashboard)) : le vrai chrono, avec deux cours d'exemple. Planning, Stats et Social y sont présentés en aperçu.
- **Minuteur public** ([/pomodoro](https://www.blocus-tracker.com/pomodoro)) : Pomodoro par défaut, session libre possible, mode Focus.
- Les sessions faites sans compte restent dans le navigateur de l'appareil. Elles ne sont pas transférées vers un compte créé ensuite : le compte gratuit enregistre les sessions suivantes.

### Planning et objectifs

- Des cours avec leur couleur, leur date d'examen et leur checklist.
- Des objectifs par jour, avec une durée, que tu peux reporter ou lancer directement dans le chrono.
- Des examens avec compte à rebours.
- L'export de tes examens et objectifs vers Apple Calendar, Google Calendar ou Outlook.

### Statistiques et progression

- Le temps d'étude par jour et par cours, ta régularité sur l'année et un objectif du jour.
- L'historique de toutes tes sessions, que tu peux corriger ou supprimer.
- De l'XP et des niveaux, des missions du jour et des défis de la semaine.
- Une série de jours étudiés, protégée par deux gels par mois, et des badges quand tu passes un cap.

### Fonctions sociales (avec un compte)

- **Amis** : demandes d'ami, messages privés et suivi des sessions qu'ils choisissent de partager.
- **Activité** : ce que tes amis partagent (sessions, badges, niveaux) et de courtes publications.
- **Groupes d'étude**, chacun avec sa discussion et un chrono de groupe.
- **Classement** du temps d'étude : général, entre amis ou dans ton établissement.
- **Espaces de cours** : les étudiants de ton établissement qui suivent le même cours, pour poser une question, partager un fichier ou une date d'examen.

Tes sessions, ton planning détaillé et tes statistiques restent liés à ton compte. Seul ce que tu choisis de partager est visible par les autres.

### Gratuit, web et installable

- Gratuit, sans carte bancaire. Le compte se crée avec une adresse e-mail.
- S'utilise dans le navigateur, sur téléphone comme sur ordinateur, en thème clair ou sombre.
- S'installe sur l'écran d'accueil comme une application (PWA), sans passer par un store.

## Pour les développeurs

Next.js 14 (pages router, JavaScript) · Tailwind CSS 3 · Supabase (base de données, Auth, Storage, Realtime) · Recharts · PWA avec `@ducanh2912/next-pwa` · hébergé sur Vercel.

Il faut Node.js 18.17 ou plus récent.

### Lancer en local sans Supabase

```bash
npm install
NEXT_PUBLIC_OFFLINE_DEV=true npm run dev
```

Ouvre http://localhost:3000. Le client Supabase est remplacé par une base de démonstration stockée dans le navigateur : rien n'est envoyé à Supabase. Sans connexion, `/dashboard` ouvre le mode découverte. Sur `/login`, n'importe quel pseudo et mot de passe ouvrent le compte de démonstration local.

### Lancer avec un projet Supabase

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Renseigne dans `.env.local` l'URL et la clé `anon` de ton projet (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Les autres variables sont décrites dans [`docs/SUPABASE.md`](docs/SUPABASE.md).

Le schéma initial est [`supabase/schema.sql`](supabase/schema.sql). Les fichiers `supabase/migration_*.sql` et `supabase/migrations/` l'ont fait évoluer depuis. Aucune commande unique ne recrée encore toute la base : la référence (tables, migrations, configuration Auth) est dans [`docs/SUPABASE.md`](docs/SUPABASE.md).

### Vérifier avant de publier

```bash
npm run lint
node --test tests/*.test.mjs
npm run build
```

Vercel déploie automatiquement la branche `main`. N'y pousse rien si `npm run build` échoue.

### Documentation

- [`PRODUCT.md`](PRODUCT.md) : public visé, intention et principes du produit.
- [`DESIGN.md`](DESIGN.md) : langage visuel, « Blocus makes studying tangible ».
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : routes et organisation du code.
- [`docs/SUPABASE.md`](docs/SUPABASE.md) : base de données, migrations et variables d'environnement.
- [`docs/I18N.md`](docs/I18N.md) : textes en français et en anglais, tous dans `lib/i18n.js`.
- [`AI_CHANGELOG.md`](AI_CHANGELOG.md) : historique des changements.
- [`CLAUDE.md`](CLAUDE.md) et [`AGENTS.md`](AGENTS.md) : règles pour les assistants de code.

---

Créé par Mathias Dock.
