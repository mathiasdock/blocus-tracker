# Auth UCF — activation progressive

Ce document concerne uniquement Turnstile, la confirmation email et les limites
Supabase Auth. Il ne remplace pas l'audit de sécurité final. **Aucun réglage
Supabase ou Cloudflare n'est activé par le code seul.**

## Turnstile

- Créer dans Cloudflare Turnstile un widget **Managed** pour
  `www.blocus-tracker.com` et `blocus-tracker.com` (ancien PWA sur l'apex).
  Ne pas autoriser tous les domaines ni `localhost` sur ce widget de production.
- Copier la **site key publique** dans `NEXT_PUBLIC_TURNSTILE_SITE_KEY` sur
  Vercel pour Production, puis redéployer. Aucun secret Turnstile n'est utilisé
  dans l'application ou ses variables `NEXT_PUBLIC_*`.
- Vérifier en production que Login, Signup et Forgot password montrent le widget
  en FR/EN, clair/sombre et mobile, et qu'ils ne lancent aucune requête Auth avant
  résolution. Vérifier aussi le login par pseudo. Google OAuth reste inchangé.
- **Seulement après ce déploiement vérifié**, dans Supabase : Authentication →
  Bot and Abuse Protection → activer CAPTCHA, choisir Cloudflare Turnstile et
  saisir la **secret key** Cloudflare dans le champ privé du dashboard.
  Supabase Auth vérifie les tokens côté serveur. Tester un nouvel email, un
  mauvais token, un email existant, un pseudo, et une demande de reset. Si
  blocage, désactiver immédiatement CAPTCHA dans Supabase ; le code reste
  compatible et l'Auth email continue de fonctionner.
- Pendant la fenêtre « code publié, CAPTCHA Supabase encore désactivé », les
  anciennes PWA en cache peuvent toujours se connecter par pseudo : seul
  Supabase Auth fait respecter CAPTCHA. Après activation, un ancien client qui
  n'envoie pas encore de jeton devra se mettre à jour. Prévoir un contrôle
  explicite des PWA installées avant d'activer le réglage serveur.
- Pour localhost ou une preview, créer un widget/une clé distincte autorisant
  exactement ces hostnames et associer son secret au projet Supabase de test.
  Les clés de test Cloudflare ne valident **pas** contre un secret de production.

Supabase protège `/signup`, `/recover`, `/resend` et `/token` (connexion par
mot de passe), pas le callback Google. Blocus n'expose pas de bouton de renvoi
de confirmation aujourd'hui ; tout ajout futur de `auth.resend` doit transmettre
un nouveau `captchaToken`. Le token est à usage unique et valable cinq minutes ;
chaque requête le consomme. Le pseudo passe via `/api/login`, qui transmet le
token à Supabase sans vérifier deux fois le même jeton.
Sur Signup, un email déjà utilisé propose désormais de se connecter : ce
parcours reprend aussi les anciens comptes sans profil, avec un nouveau jeton
sur la page Login plutôt que de réutiliser un jeton consommé par Signup.

## Confirmation email — étape séparée

Après validation réelle de Turnstile, ajouter **exactement**
`https://www.blocus-tracker.com/onboarding` dans Authentication → URL
Configuration → Redirect URLs. Garder Site URL sur
`https://www.blocus-tracker.com`. Pas de wildcard de production. Le signup
envoie déjà ce `emailRedirectTo` ; le formulaire affiche déjà « Vérifie tes
emails » si Supabase ne renvoie pas de session. Le lien d'email aboutit à
`/onboarding`, où l'état du profil et des cours reprend la première étape
incomplète. Le Google OAuth ne passe pas par cette confirmation.

Le template de confirmation utilise bien `{{ .ConfirmationURL }}` et aucun
localhost, mais **annonce actuellement 24 h** alors que **Email OTP expiration
= 3 600 secondes (1 h)**. Avant activation, corriger le texte du template pour
indiquer 1 h (ou décider explicitement de changer la durée serveur). Le modèle
de récupération ne montre aucun localhost dans sa partie inspectée ; vérifier
son lien complet dans le dashboard. Le SMTP custom `hello@blocus-tracker.com`
via Resend est activé ; vérifier SPF/DKIM/DMARC et la capacité d'envoi avant de
changer les limites. Activer ensuite **Confirm email** dans
Authentication → Providers → Email, créer un compte de test avec une adresse
réelle, ouvrir le lien une seule fois, vérifier session + onboarding + profil
unique, puis tester encore Google et recovery. Ne pas utiliser de compte de
test en production sans le nettoyer.

## Limites proposées pour le lancement UCF

Valeurs « actuelles » ci-dessous : vérifiées en lecture seule dans le dashboard
le 2026-09-28 ; **recontrôler avant toute modification**. Supabase limite par
projet, adresse IP ou utilisateur selon la ligne. Les nombres proposés sont un
point de départ après CAPTCHA et confirmation testés, pas des changements
automatiques.

| Limite Supabase | Pré-audit | Consommation / risque | Proposition UCF |
| --- | --- | --- | --- |
| Emails Auth, projet | 30/h | Signup confirmé, reset, resend et changement d'email partagent le budget ; un pic stoppe les vrais emails. Trop haut : coût/spam SMTP. | 200/h **si** le plan Resend et la délivrabilité le permettent ; sinon augmenter par paliers mesurés. |
| Signup/recover/resend/user, IP | 30/5 min | Un Wi-Fi UCF derrière un NAT peut partager le seau ; trop haut facilite création/spam. | 120/5 min après CAPTCHA et avec surveillance des 429. |
| `/auth/v1/verify`, IP | 30/5 min | Confirmations depuis le même NAT ; trop haut facilite essais de liens. | 120/5 min après activation de Confirm email. |
| `/auth/v1/token`, IP | 150/5 min | Password login + refresh ; les appels pseudo transitent par le serveur. Trop haut facilite brute force. | Garder 150/5 min d'abord ; envisager 300/5 min seulement si des 429 légitimes sont observés. |
| Même utilisateur, email | 60 s | Évite les resend/reset répétés ; trop bas gêne la réception, trop haut spamme. | Garder 60 s. |
| `/api/login` pseudo, IP | 8/min par instance | Garde-fou propre à Blocus ; un NAT partagé peut le saturer. | Surveiller ; ne pas lever aveuglément avant un rate limiter distribué. |

Google OAuth ne consomme pas le budget d'emails de confirmation des signups
email/password, mais ses sessions restent soumises aux mécanismes Auth propres
à Supabase. Ajuster **une seule limite à la fois**, suivre 429/volumes SMTP et
revenir à la valeur notée avant changement si l'abus augmente. Ne jamais lever
toutes les limites ensemble.

## Renouvellement de session sur le réseau partagé

Le seau `/token` est compté **par IP** : tout le campus UCF derrière un même
NAT le partage (30 d'avance, puis 150 / 5 min). `lib/authSessionGuard.mjs`,
branché dans `lib/supabaseClient.js` (fetch et stockage passés à
`createClient`, `supabase.auth.signOut` enveloppé), protège ce seau et les
sessions sans modifier auth-js ni aucun réglage Supabase :

- **Horloge du téléphone ignorée.** L'échéance lue par auth-js est recalculée
  à chaque lecture : `expires_in` moins le temps écoulé depuis l'envoi de la
  demande (le plus grand de `performance.now()` et `Date.now()`, qui avance
  aussi pendant le sommeil de l'appareil). Un téléphone décalé d'une heure ne
  renouvelle plus à chaque requête (avance) et n'envoie plus de jeton expiré
  (retard). Un « JWT expired » du serveur fait renouveler le jeton.
- **429 (ou 500, 503) au renouvellement : pas de déconnexion.** Attente de 5 s,
  10 s, 20 s… jusqu'à 60 s, tirée entre 50 et 100 %, partagée entre onglets
  (`localStorage.bt_auth_refresh_backoff`), pendant laquelle aucune demande de
  renouvellement ne part. Le jeton courant reste utilisé tant qu'il lui reste
  plus de 30 s ; ensuite les requêtes de données échouent localement avec le
  code `BT_SESSION_RENEWAL_PENDING` (HTTP 401) au lieu de partir en anonyme.
  Réseau coupé, 502 et 504 : relances rapides d'auth-js, inchangées.
- **Seules les erreurs définitives déconnectent** : jeton de renouvellement
  invalide ou déjà utilisé, session révoquée, compte banni ou supprimé.
- **Un seul renouvellement à la fois** entre onglets (Web Lock
  `bt-auth-refresh`) ; un onglet ne renvoie jamais un jeton déjà échangé par
  un autre (Supabase révoquerait toute la session au-delà de 10 s).
- **Déconnexion demandée** : si le renouvellement est impossible à cet
  instant (attente, réseau coupé), la session est oubliée localement.

Diagnostic : les réponses fabriquées par la garde ne partent pas sur le réseau
et portent l'en-tête `X-Blocus-Auth` (raison) ; les journaux Supabase ne voient
que les vraies demandes. Limite connue : une app ouverte avec un jeton expiré
pendant une saturation affiche l'état déconnecté jusqu'au renouvellement, qui
se fait ensuite seul, sans mot de passe.

## Mots de passe divulgués

Le projet est actuellement sur le **plan Free**. Supabase indique que **Leaked
Password Protection** est disponible en plan Pro et supérieur : Authentication
→ Sign In / Providers → Email. Le réglage est donc indisponible sur le plan
actuel ; ne pas prétendre qu'il est activable sans upgrade. Après un éventuel
passage en Pro, le tester sur signup, login d'un compte existant et reset avant
activation généralisée. Les nouveaux mots de passe divulgués sont refusés ;
Supabase documente aussi un éventuel avertissement/erreur sur un mot de passe
existant lors de la connexion. Vérifier ce comportement réel avant généralisation
et prévoir un message de récupération clair. Ce réglage ne nécessite pas de
secret ni de migration dans Blocus.
