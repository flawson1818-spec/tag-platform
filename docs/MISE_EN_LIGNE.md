# Mettre Tour d'avant-garde en ligne

Trois services, tous gratuits pour commencer :

| Service | Rôle | Adresse |
|---|---|---|
| **Supabase** | la base de données et les fichiers | https://supabase.com/dashboard/project/vlbvjntypatgcaidsjrc |
| **Render** | le serveur (API, salle de prière en direct, messagerie) | https://dashboard.render.com |
| **Vercel** | le site que les membres ouvrent et installent sur leur téléphone | https://vercel.com/dashboard |

GitHub (`flawson1818-spec/tag-platform`, branche `master`) alimente Render et Vercel : chaque
nouvelle version envoyée sur GitHub se met en ligne toute seule.

## 1. Supabase — la base

Dans l'éditeur SQL, lancer une fois chacun de ces fichiers de `supabase/migrations/` qui ne l'a pas
encore été (on peut les relancer sans risque) :

- `20261005_redact_stored_secrets.sql`
- `20261106_prayer_slot_duration.sql`
- `20261107_social_feed.sql`
- `20261108_direct_messages.sql`
- `20261109_storage_bucket.sql` (crée l'espace privé « tag-files » pour les photos et documents)

Puis, dans **Project Settings → API**, noter :
- **Project URL** → sera `SUPABASE_URL`
- la clé **service_role** (secrète) → sera `SUPABASE_SERVICE_ROLE_KEY`

## 2. Render — le serveur

**New → Blueprint**, choisir le dépôt `tag-platform` : Render lit `render.yaml` et crée le service
`tag-platform-api`. Il demande les valeurs suivantes :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | la Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé service_role de Supabase |
| `WEB_ORIGIN` | l'adresse du site Vercel, ex. `https://tour-avant-garde.vercel.app` (plusieurs : séparées par des virgules) |
| `BREVO_API_KEY`, `EMAIL_FROM` | facultatif : envoi réel des e-mails (voir §4) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | facultatif : notifications sur téléphone |
| `TWILIO_*` | facultatif : codes de connexion par SMS |

Vérification : `https://tag-platform-api.onrender.com/api/health` répond `{"status":"ok"…}`.
Si Render a donné une autre adresse, la reporter dans Vercel (étape 3).

Plan gratuit : le serveur s'endort après 15 minutes sans visite ; la première visite suivante
attend environ une minute. Le plan payant « Starter » le garde éveillé.

## 3. Vercel — le site

**Add New → Project**, importer le dépôt `tag-platform`. Ne rien changer : `vercel.json` à la
racine indique déjà comment construire le site. Cliquer **Deploy**.

L'adresse de l'API est dans `packages/web/.env.production`. Si le serveur Render a une autre
adresse, ajouter dans **Settings → Environment Variables** :
- `VITE_API_URL` = `https://<adresse-render>/api`
- `VITE_WS_URL` = `https://<adresse-render>`

puis **Redeploy**. Reporter enfin l'adresse du site dans `WEB_ORIGIN` sur Render.

## 4. E-mails réels (mot de passe oublié, vérification)

Sans fournisseur, les e-mails sont seulement enregistrés. Avec Brevo (gratuit, 300 e-mails/jour) :
créer un compte sur https://www.brevo.com, valider l'adresse d'envoi (une adresse Gmail convient),
créer une clé API (SMTP & API → API Keys), puis sur Render : `BREVO_API_KEY` = la clé,
`EMAIL_FROM` = l'adresse validée.

## 5. Installer l'application sur un téléphone

Ouvrir l'adresse du site :
- **Android (Chrome)** : bouton « Installer l'application » en haut du site, ou menu ⋮ → Installer.
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

## 6. Premier administrateur

Créer son compte sur le site, puis dans l'éditeur SQL de Supabase (remplacer l'adresse) :

```sql
insert into role_assignments (user_id, role_id, community_id)
select u.id, r.id, null
from users u, roles r
where u.email = 'mon.adresse@exemple.com' and r.code = 'SUPER_ADMINISTRATEUR'
on conflict do nothing;
```

Se déconnecter puis se reconnecter : les menus d'administration et de modération apparaissent.
