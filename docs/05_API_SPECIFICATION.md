# 05_API_SPECIFICATION.md

# API SPECIFICATION

## Objectif

Définir les contrats REST et WebSocket exposés par TAG. Toute route non décrite ici doit être ajoutée à ce document avant implémentation.

Documentation vivante : Swagger/OpenAPI généré depuis les DTO (voir [[17_CODE_CONVENTIONS]]).

---

# 1. CONVENTIONS GÉNÉRALES

## Base URL

`https://api.tag-platform.org/v1`

## Format

JSON uniquement. `Content-Type: application/json`.

## Authentification

`Authorization: Bearer <accessToken>` (JWT). Détails rotation/refresh : voir [[12_SECURITY_SPECIFICATION]].

## Pagination

Paramètres : `page` (défaut 1), `limit` (défaut 20, max 100).

Réponse enveloppe :

```json
{
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
}
```

## Filtres et tri

`filter[<champ>]=<valeur>`, `sort=<champ>` ou `sort=-<champ>` (décroissant).

## Enveloppe de réponse standard

Succès :

```json
{ "success": true, "data": { }, "meta": { } }
```

Erreur :

```json
{ "success": false, "error": { "code": "PRAYER_SLOT_NOT_FOUND", "message": "...", "traceId": "..." } }
```

## Codes d'erreur HTTP

`400` Validation invalide

`401` Non authentifié

`403` Permission refusée (RBAC, voir [[06_RBAC_SPECIFICATION]])

`404` Ressource introuvable

`409` Conflit d'état (transition interdite, voir [[10_STATE_MACHINES]])

`422` Règle métier violée

`429` Rate limit dépassé

`500` Erreur serveur

---

# 2. IDENTITY

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/mfa/verify
POST   /auth/password/forgot
POST   /auth/password/reset

GET    /users/me
PATCH  /users/me
GET    /users/:id
GET    /users              (Admin — liste, filtres, pagination)
PATCH  /users/:id/status   (Admin — LOCKED/SUSPENDED/ACTIVE)
DELETE /users/:id          (soft delete)

GET    /roles
POST   /roles/assign       (Responsable+ — scope communauté)
POST   /roles/revoke
```

---

# 3. COMMUNITY

```
POST   /communities
GET    /communities
GET    /communities/:id
PATCH  /communities/:id
DELETE /communities/:id

POST   /communities/:id/members
DELETE /communities/:id/members/:userId
GET    /communities/:id/members

POST   /communities/:id/posts
GET    /communities/:id/posts
POST   /posts/:id/comments
GET    /posts/:id/comments
```

---

# 4. PRAYER

```
POST   /prayer-programs
GET    /prayer-programs
GET    /prayer-programs/:id
PATCH  /prayer-programs/:id
DELETE /prayer-programs/:id

POST   /prayer-programs/:id/slots
PATCH  /prayer-slots/:id
DELETE /prayer-slots/:id
GET    /prayer-slots/active?roomId=:roomId     (créneau en cours + temps restant)
GET    /prayer-slots/:id/next

POST   /prayer-requests
GET    /prayer-requests
GET    /prayer-requests/:id
PATCH  /prayer-requests/:id/status
POST   /prayer-requests/:id/promote            (Modérateur+ — transforme en PrayerSlot)

POST   /testimonies
GET    /testimonies
PATCH  /testimonies/:id/approve                (Modérateur+)
PATCH  /testimonies/:id/reject                 (Modérateur+)

POST   /campaigns
GET    /campaigns
PATCH  /campaigns/:id/status
```

---

# 5. EVENTS

```
POST   /events
GET    /events
GET    /events/:id
PATCH  /events/:id/status

POST   /events/:id/join
POST   /events/:id/hand-raise
DELETE /events/:id/hand-raise
POST   /events/:id/breakout-rooms              (Modérateur+ — répartition)
```

---

# 6. COMMUNICATION

```
GET    /notifications
PATCH  /notifications/:id/read
PATCH  /notifications/read-all

POST   /social-publications                    (généré par IA Communication, voir [[02_AI_AGENTS_SPECIFICATION]])
GET    /social-publications
PATCH  /social-publications/:id/approve        (Responsable+)
PATCH  /social-publications/:id/reject
```

---

# 7. STORAGE

```
POST   /files/presign        (retourne une URL pré-signée d'upload direct S3/MinIO)
GET    /files/:id
DELETE /files/:id
```

---

# 8. AI AGENTS

```
POST   /ai/accueil/chat
POST   /ai/evangelisation/chat
POST   /ai/intercession/activate      (Système/Scheduler — bascule fallback, voir [[03_ARCHITECTURE_SPECIFICATION]] section 7)
POST   /ai/moderation/scan            (interne — appelé par le pipeline de publication)
POST   /ai/communication/generate     (Modérateur+ — génère un brouillon de publication)
GET    /ai/analyse/dashboard          (Responsable+)
```

Toutes les routes `/ai/*` journalisent dans `ai_interaction_logs` (voir [[04_DATABASE_SPECIFICATION]]).

---

# 9. ANALYTICS / WORLD MAP

```
GET    /analytics/world-map           (agrégats pays, jamais de position individuelle)
GET    /analytics/dashboard           (Responsable+ — heures fortes, thèmes, croissance, rétention)
GET    /analytics/export              (Admin — déclenche un Export, voir [[10_STATE_MACHINES]])
```

---

# 10. ADMINISTRATION

```
GET    /admin/audit-logs
GET    /admin/backups
POST   /admin/backups/run
GET    /admin/system/health
```

---

# 11. WEBSOCKET — NAMESPACE `/realtime`

## Connexion

`wss://api.tag-platform.org/realtime?token=<accessToken>`

## Événements — client → serveur

```
room:join            { roomId }
room:leave           { roomId }
chat:send            { roomId, message }
reaction:send        { roomId, emoji }
hand:raise           { eventId }
hand:lower           { eventId }
presence:heartbeat   { roomId }
```

## Événements — serveur → client

```
slot:started         { roomId, slot, remainingSeconds }
slot:tick            { roomId, remainingSeconds }          (diffusé toutes les 1s)
slot:ended           { roomId, slotId }
chat:message         { roomId, userId, message, timestamp }
presence:update      { roomId, connectedCount }
world-map:update     { countries: [{ code, count }] }      (diffusé toutes les 5s)
notification:new     { notification }
moderation:warning   { roomId, userId, reason }             (visible modérateurs de la salle uniquement)
```

## Garanties

Reconnexion : le client renvoie `room:join` avec le dernier `slotId` connu ; le serveur répond immédiatement avec l'état courant complet (pas d'attente du prochain tick).

Autorité serveur : `remainingSeconds` n'est jamais calculé côté client au-delà de l'affichage entre deux ticks ; en cas de dérive, le serveur fait toujours foi.

---

# OBJECTIF

Un client tiers (partenaire, TV connectée) doit pouvoir afficher la salle en cours en lecture seule en n'implémentant que `room:join`, `slot:started`, `slot:tick`, `slot:ended`.
