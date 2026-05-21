# blocus-tracker

Suivi d'étude avec un mini réseau social entre amis.
Next.js (pages router) · Tailwind CSS · Supabase · Recharts.

## Fonctionnalités

- Compte & connexion par **pseudo + mot de passe**
- **Photo de profil** (Supabase Storage)
- **Chronomètre d'étude** par cours
- **Planning** avec objectifs (minutes visées, dates, à cocher)
- **Statistiques** avec graphiques (minutes/jour, répartition par cours)
- **Amis** : temps d'étude, cours et planning de tes amis
- **Feed social** : publier une photo de session, liker, commenter

## 1. Configurer Supabase

1. Crée un projet gratuit sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, colle et exécute tout le contenu de
   [`supabase/schema.sql`](supabase/schema.sql) (tables, RLS, buckets).
3. Dans **Authentication → Providers → Email** : **désactive « Confirm email »**.
   L'app utilise des e-mails internes (`pseudo@blocus.local`), donc la
   confirmation par e-mail doit être désactivée pour pouvoir se connecter.
4. Dans **Project Settings → API**, récupère :
   - `Project URL`
   - `anon` `public` key

## 2. Lancer en local

```bash
cp .env.local.example .env.local
# édite .env.local avec ton URL + anon key
npm install
npm run dev
```

Ouvre http://localhost:3000

## 3. Déployer sur Vercel (gratuit)

1. Pousse ce dossier sur un repo GitHub.
2. Sur [vercel.com](https://vercel.com), **New Project → Import** le repo.
3. Dans **Environment Variables**, ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. C'est tout — Vercel détecte Next.js automatiquement.

## Notes techniques

- L'authentification par pseudo passe par Supabase Auth en mappant
  `pseudo → pseudo@blocus.local` (voir `lib/supabaseClient.js`).
- Les RLS autorisent la **lecture** des données d'étude entre utilisateurs
  connectés (nécessaire pour l'onglet Amis et le Feed) ; l'**écriture** reste
  réservée au propriétaire.
- Les fichiers (avatars/posts) sont stockés sous un dossier `=<user_id>/` ;
  les policies Storage empêchent d'écrire dans le dossier d'un autre.
