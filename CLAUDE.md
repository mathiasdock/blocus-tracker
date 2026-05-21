# blocus-tracker — CLAUDE.md

Documentation de référence pour les sessions Claude Code.
Mise à jour : 2026-05-19

---

## Objectif de l'app

Application web d'étude pour étudiants belges/francophones.
Fonctionnalités : chronomètre de sessions, planning, statistiques, feed social, messagerie privée, groupes de révision, communautés par université, badges.
Créée par **Mathias Dock**, étudiant Master 1 à l'ICHEC Brussels Management School.

---

## Stack technique

| Couche | Outil |
|--------|-------|
| Framework | Next.js 14 (pages router) |
| UI | Tailwind CSS 3, composants custom |
| Charts | Recharts |
| PWA | @ducanh2912/next-pwa |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Auth | Supabase Auth — pseudo + mot de passe (email fictif `pseudo@blocus.local` pour anciens users, vrai email pour nouveaux) |
| Email | Resend via SMTP Supabase (100 emails/jour gratuit) |
| Déploiement | Vercel |
| Images | sharp |

---

## Structure du projet

```
pages/
  index.js           → landing / redirect
  login.js           → connexion (pseudo + password)
  signup.js          → inscription (pseudo + email + password)
  forgot-password.js → demande reset mot de passe
  reset-password.js  → saisie nouveau mot de passe (après lien email)
  onboarding.js      → page post-inscription
  dashboard.js       → chronomètre pomodoro
  planning.js        → objectifs / planning
  stats.js           → statistiques + leaderboard amis
  historique.js      → historique des sessions
  friends.js         → amis, demandes, suggestions
  messages.js        → messagerie privée entre amis
  groupes.js         → groupes de révision (chat)
  communautes.js     → chat par université
  feed.js            → feed social (photos de session)
  profile.js         → profil + paramètres + email + badges
  admin.js           → tableau de bord admin

contexts/
  AuthContext.js     → user, profile, signUp, signIn, signOut, updateEmail, refreshProfile
  I18nContext.js     → t(), lang, setLang (FR/EN)
  NotificationContext.js → badges non lus

lib/
  supabaseClient.js  → client Supabase + pseudoToEmail()
  i18n.js            → toutes les traductions FR/EN
  format.js          → displayName(), timeAgo(iso, lang), formatMinutesShort(), computeStreak()
  universities.js    → liste des universités (COUNTRIES, COMMUNITY_BY_ID)
  badges.js          → définition + calcul des badges

components/
  Layout.js          → nav + footer + Avatar
  UniPicker.js       → sélecteur d'université avec recherche
  UserProfileModal.js → modal profil utilisateur
  StatsCharts.js     → graphiques recharts (dynamique, SSR désactivé)

supabase/
  schema.sql                      → schéma initial
  migration_v3_features.sql       → réactions emoji, planning public, lang
  migration_v4_locked.sql         → colonne locked
  migration_v5_presence.sql       → colonne studying_since
  migration_v6_security.sql       → colonne is_admin, RPCs admin/self delete
  migration_v7_profile_security.sql → trigger anti-escalade + policies UPDATE
  migration_v8_security.sql       → sécurisation complète (friendships, PM, DM, sessions, groups)
  migration_v9_email.sql          → colonne email sur profiles + fonction get_login_email()
  migration_v12_security_hardening.sql → audit fixes (force-add friend, email exposure, stats RPC, rate limit)
  migration_private_messages.sql  → table private_messages
  migration_communities.sql       → table community_messages
  migration_admin_policies.sql    → (obsolète, remplacé par v6)
```

---

## Authentification

### Principe
- Supabase Auth utilise des emails. Les **anciens utilisateurs** (~60) ont un email fictif `pseudo@blocus.local`.
- Les **nouveaux utilisateurs** s'inscrivent avec un vrai email.
- La connexion se fait toujours avec le **pseudo** — la fonction SQL `get_login_email(pseudo)` résout l'email correct (vrai ou fictif).

### Flux signup (nouveaux users)
1. `signup.js` collecte : prénom, nom, pseudo, **email**, université, mot de passe
2. `AuthContext.signUp()` crée le compte Supabase Auth avec le vrai email
3. Le profil est inséré dans `public.profiles` avec la colonne `email`
4. Supabase envoie un email de confirmation via Resend SMTP

### Flux login
1. `AuthContext.signIn(pseudo, password)` appelle le RPC `get_login_email(pseudo)`
2. Le RPC retourne le vrai email (si `profiles.email` non null) ou `pseudo@blocus.local`
3. `supabase.auth.signInWithPassword({ email, password })`

### Flux reset mot de passe
1. `/forgot-password` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL/reset-password })`
2. `/reset-password` → détecte l'événement `PASSWORD_RECOVERY` → `supabase.auth.updateUser({ password })`

### Variables d'environnement requises
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_SITE_URL=https://ton-domaine.com   ← utilisé pour les redirects email + CORS allowlist
SUPABASE_SERVICE_ROLE_KEY=xxx                  ← server-only (Vercel env), pour /api/login
```

### Login serveur (post-migration v12)
Depuis la migration v12, `get_login_email` est restreinte aux utilisateurs authentifiés
(anti-énumération d'emails). Le login par pseudo passe désormais par
`POST /api/login` (route Next.js qui résout l'email côté serveur via service_role,
puis renvoie uniquement les tokens de session — aucun email exposé au client).
Le client appelle ensuite `supabase.auth.setSession(...)` avec ces tokens.

Rate limit : 8 tentatives / minute / IP (in-memory). Pour multi-instance Vercel,
remplacer par Upstash Redis (voir `lib/rateLimit.js`).

---

## Internationalisation (i18n)

- Toutes les chaînes UI sont dans `lib/i18n.js` en `fr` et `en`
- Usage : `const { t, lang } = useI18n();` puis `t("clé.sous-clé")`
- Pour les dates relatives : `timeAgo(iso, lang)` depuis `lib/format.js`
- **Règle absolue** : toute nouvelle chaîne UI doit être ajoutée dans les deux langues simultanément. Ne jamais hardcoder du français dans le JSX.

---

## État Supabase

### Tables principales

| Table | Description |
|-------|-------------|
| `profiles` | id, pseudo (unique), first_name, last_name, university, study_field, study_year, bio, avatar_url, lang, planning_public, studying_since, is_admin, locked, **email** (ajout v9), created_at |
| `sessions` | sessions d'étude (user_id, course_id, duration_seconds, started_at, ended_at) |
| `courses` | cours de l'utilisateur |
| `objectives` | objectifs de planning |
| `friendships` | requester, addressee, status ('pending'/'accepted') |
| `posts` | feed social (image_url, caption, visibility) |
| `likes` | réactions emoji sur posts |
| `comments` | commentaires sur posts |
| `community_messages` | messages des chats universités |
| `private_messages` | DMs entre amis (sender_id, receiver_id, content, read) |
| `study_groups` | groupes de révision (name, description, created_by) |
| `group_members` | membres des groupes (group_id, user_id, role: 'admin'/'member') |
| `group_messages` | messages dans les groupes |
| `deleted_accounts` | log des suppressions de compte |

### RLS — règles importantes

- **profiles** : lecture publique (tous les authentifiés), UPDATE restreint via trigger + policies (v7)
- **sessions/courses/objectives** : lecture = soi-même + amis acceptés + admins (v8)
- **friendships** : seul l'`addressee` peut accepter (v8), contrainte `requester <> addressee`
- **private_messages** : insert uniquement vers un ami accepté (v8), bucket `dm` privé
- **study_groups/group_members/group_messages** : accès restreint aux membres (v8)
- **posts** : lecture publique (tous authentifiés), write = propriétaire
- **deleted_accounts** : lecture admin seulement

### Fonctions SQL sensibles

| Fonction | Rôle |
|----------|------|
| `prevent_profile_privilege_escalation()` | Trigger BEFORE UPDATE — empêche de modifier `is_admin` et `locked` |
| `admin_delete_user(target uuid)` | SECURITY DEFINER — supprime un user (admin only, vérifié côté DB) |
| `self_delete_user()` | SECURITY DEFINER — l'user supprime son propre compte |
| `get_login_email(p_pseudo text)` | SECURITY DEFINER — résout email de login, accessible par `anon` |
| `is_friend_or_self(target_user uuid)` | Helper RLS — vrai si ami accepté ou soi-même |
| `is_group_member(gid uuid)` | Helper RLS — vrai si membre du groupe |

### Storage buckets

| Bucket | Public | Accès write |
|--------|--------|-------------|
| `avatars` | ✅ | owner uniquement (par dossier uid) |
| `posts` | ✅ | owner uniquement |
| `community` | ✅ | owner uniquement |
| `dm` | ❌ (privé v8) | owner uniquement |

---

## Migrations à appliquer (si pas encore fait)

Exécuter dans l'ordre dans le SQL Editor Supabase si la base n'est pas à jour :
1. `migration_v7_profile_security.sql`
2. `migration_v8_security.sql`
3. `migration_v9_email.sql`
4. `migration_v10_audit_fix.sql`
5. `migration_v11_leaderboard.sql`
6. `migration_v12_security_hardening.sql` ← **critique** : corrige force-add friend, fuite email, stats publiques

---

## Configuration Supabase Dashboard requise

- **Authentication → Providers → Email** : activé, "Confirm email" selon besoin
- **Authentication → Settings → SMTP** : Resend configuré (host: smtp.resend.com, port: 465, user: resend)
- **Authentication → URL Configuration** : Site URL + Redirect URL `/reset-password`
- **Storage → Buckets** : limites de taille recommandées (avatars: 2MB, autres: 5MB)

---

## Fonctionnalités récentes (2026-05-19)

- **Classement public** (`stats.js`) : bascule Amis/Public dans l'onglet Stats, top 50 via RPC `get_public_leaderboard(period)`, scrollable avec scrollbar invisible
- **Position percentile** (`stats.js`) : bannière "Tu es dans le top X% aujourd'hui" via RPC `get_my_study_rank(period)`
- **Suggestions d'amis** (`friends.js`) : jusqu'à 40 suggestions, zone scrollable, chaînes i18n corrigées
- **Filtres de période amis** (`friends.js`) : bascule Aujourd'hui / 7 jours / 30 jours, sessions chargées sur 30j
- **Chrono save** (`dashboard.js`) : protection double-clic (ref), mise à jour optimiste, feedback visuel (saving/success/error)
- **Admin heures** (`admin.js`) : `formatMinutesShort` pour le temps d'étude total et moyen
- **Admin tri** (`admin.js`) : dropdown Inscription / Université / Nom / Prénom
- **Migration v11** : `get_public_leaderboard(period)` + `get_my_study_rank(period)` (SECURITY DEFINER, accessible par `authenticated`)

## Problèmes récemment corrigés

- Escalade de privilèges via UPDATE profiles (`is_admin: true`) — corrigé par trigger + policies (v7)
- `friendships_update` permettait l'auto-acceptation — corrigé (v8)
- `sessions/courses/objectives` lisibles par tous — restreints aux amis (v8)
- Tables `study_groups/group_members/group_messages` sans RLS — sécurisées (v8)
- Bucket `dm` public — rendu privé (v8)
- Upload photo sur desktop (Electron) — remplacé `<label>` par `useRef` + `.click()`
- Boucle infinie au chargement auth — `onAuthStateChange` ne doit pas être async
- `timeAgo` codé en dur en FR dans `groupes.js` — corrigé

---

## Problèmes ouverts / à surveiller

- **Reset mot de passe anciens users** : les ~60 anciens utilisateurs avec email fictif ne peuvent pas réinitialiser leur mot de passe via email. Ils doivent ajouter leur vrai email dans les paramètres du profil (`/profile` → champ Email) pour activer cette fonctionnalité.
- **Confirmation email** : si Resend SMTP mal configuré, les inscriptions échouent avec "Error sending confirmation email". Solution temporaire : désactiver "Confirm email" dans Supabase.
- **`NEXT_PUBLIC_SITE_URL`** : doit être mis à jour en production dans les variables d'env Vercel.

---

## Commandes utiles

```bash
# Développement local
npm run dev          # Lance sur http://localhost:3000

# Build et déploiement
npm run build        # Build production
npm run start        # Lance en production local

# Lint
npm run lint
```

### Déploiement Vercel
- Connecté au repo Git — chaque push sur `main` déclenche un déploiement automatique
- Variables d'env à configurer dans Vercel Dashboard :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (URL de production)

---

## Prochaines tâches recommandées

1. **Vérifier la config Resend SMTP** — s'assurer que les emails de confirmation et de reset arrivent bien
2. **Mettre à jour `NEXT_PUBLIC_SITE_URL`** en production dans Vercel
3. **Communiquer aux anciens utilisateurs** qu'ils peuvent ajouter leur email dans le profil pour activer la récupération de mot de passe
4. **Tester le flow complet** : inscription → confirmation email → connexion → reset mot de passe
5. **Limites de taille Storage** — configurer dans Supabase Dashboard (Storage → Buckets)
6. **Supabase Auth settings** — vérifier JWT expiry (recommandé : 3600s), minimum password length (recommandé : 8)
