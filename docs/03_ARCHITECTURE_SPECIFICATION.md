# 03_ARCHITECTURE_SPECIFICATION.md

# ARCHITECTURE SPECIFICATION

## Objectif

Décrire l'architecture logicielle cible de TAG : découpage en services, stack technologique, communication temps réel, média, scalabilité, cloud.

Toute décision ci-dessous est contraignante. Une déviation doit être documentée et validée.

---

# 1. DÉCISION D'ARCHITECTURE

## Monolithe modulaire, pas de microservices au démarrage

TAG démarre en **monolithe modulaire** (NestJS, Nx Workspace, Domain-Driven Design, un module par contexte métier — voir ordre de génération dans [[16_AI_GENERATION_RULES]] : Identity, Community, Prayer, Communication, Storage, Analytics, Administration).

Raison : la majorité de la charge (lecture de programmes, chat, notifications) ne justifie pas la complexité opérationnelle de microservices dès le MVP. Les frontières de modules (bounded contexts) sont conçues dès le départ pour permettre une extraction ultérieure sans réécriture (voir [[09_ROADMAP_AND_BACKLOG]]).

## Services déployables séparément

Même en monolithe modulaire, 4 processus sont déployés indépendamment pour permettre un scaling différencié :

API — HTTP REST, point d'entrée synchrone.

Gateway — WebSocket, temps réel (salles, chronomètre, chat, présence).

Worker — traitement asynchrone (génération IA, transcodage média, envoi notifications/emails/WhatsApp).

Scheduler — cron et planification (génération des occurrences récurrentes de programmes, transitions de créneaux, campagnes).

Ces 4 processus partagent le même code de domaine (modules Nx partagés) mais ont des points d'entrée et des profils de scaling distincts.

## Candidats à l'extraction future en microservice

IA (orchestrateur multi-agents) — forte consommation GPU/API externe, cycle de déploiement propre.

Média/Streaming — transcodage vidéo/audio, bande passante spécifique.

Voir [[09_ROADMAP_AND_BACKLOG]] pour le déclencheur d'extraction (seuils de charge).

---

# 2. DIAGRAMME DE CONTEXTE (C4 — Niveau 1)

```mermaid
C4Context
  title TAG — Diagramme de contexte

  Person(visitor, "Visiteur / Intercesseur", "Utilise le web, mobile ou TV")
  Person(moderator, "Modérateur / Pasteur / Admin", "Anime et supervise")

  System(tag, "TAG Platform", "Plateforme mondiale d'intercession continue")

  System_Ext(push, "APNs / FCM", "Notifications push")
  System_Ext(email, "Fournisseur Email", "Transactionnel")
  System_Ext(whatsapp, "WhatsApp Business API", "Messagerie")
  System_Ext(social, "Réseaux sociaux", "Facebook, Instagram, TikTok, YouTube, X, LinkedIn, Threads")
  System_Ext(llm, "Fournisseur LLM", "Claude via Anthropic API")
  System_Ext(storage_ext, "CDN", "Diffusion média statique")

  Rel(visitor, tag, "Rejoint les salles, prie, publie", "HTTPS / WSS")
  Rel(moderator, tag, "Anime, modère, planifie", "HTTPS / WSS")
  Rel(tag, push, "Envoie")
  Rel(tag, email, "Envoie")
  Rel(tag, whatsapp, "Envoie")
  Rel(tag, social, "Publie (après validation)")
  Rel(tag, llm, "Appelle (agents IA)")
  Rel(tag, storage_ext, "Diffuse médias")
```

---

# 3. DIAGRAMME DE CONTENEURS (C4 — Niveau 2)

```mermaid
C4Container
  title TAG — Diagramme de conteneurs

  Person(user, "Utilisateur", "Tous rôles")

  System_Boundary(tag, "TAG Platform") {
    Container(web, "Web App", "Angular", "PWA responsive")
    Container(mobile, "Mobile App", "Flutter", "Android / iOS")
    Container(tv, "TV App", "Flutter/Android TV", "Lecture salle en cours")
    Container(nginx, "Reverse Proxy", "NGINX", "TLS termination, routing")
    Container(api, "API", "NestJS", "REST, auth, orchestration synchrone")
    Container(gateway, "Realtime Gateway", "NestJS + WebSocket", "Salles, chrono, chat, présence")
    Container(worker, "Worker", "NestJS + BullMQ", "Jobs asynchrones, IA, média, notifications")
    Container(scheduler, "Scheduler", "NestJS + Cron", "Récurrence programmes, transitions")
    ContainerDb(pg, "PostgreSQL", "Base relationnelle", "Données métier")
    ContainerDb(redis, "Redis", "Cache + Pub/Sub + Queues", "Sessions, chrono, files BullMQ")
    ContainerDb(minio, "MinIO / S3", "Object Storage", "Médias, témoignages, exports")
  }

  Rel(user, web, "HTTPS")
  Rel(user, mobile, "HTTPS/WSS")
  Rel(user, tv, "HTTPS/WSS")
  Rel(web, nginx, "HTTPS")
  Rel(mobile, nginx, "HTTPS/WSS")
  Rel(nginx, api, "HTTP")
  Rel(nginx, gateway, "WS")
  Rel(api, pg, "SQL")
  Rel(api, redis, "Cache")
  Rel(gateway, redis, "Pub/Sub — synchronisation multi-instance")
  Rel(worker, pg, "SQL")
  Rel(worker, minio, "Lecture/écriture média")
  Rel(scheduler, pg, "SQL")
  Rel(api, worker, "Enfile un job", "Redis Queue")
  Rel(scheduler, gateway, "Déclenche transition de créneau", "Redis Pub/Sub")
```

---

# 4. DIAGRAMME DE COMPOSANTS — MODULE PRAYER (C4 — Niveau 3)

```mermaid
C4Component
  title TAG API — Module Prayer (extrait)

  Container_Boundary(prayer, "Prayer Module") {
    Component(ctrl, "PrayerController", "NestJS Controller", "Endpoints REST programmes/créneaux")
    Component(svc, "PrayerProgramService", "NestJS Service", "Orchestration, règles métier")
    Component(engine, "PrayerEngine", "Domain Service", "Calcul des transitions de créneaux")
    Component(repo, "PrayerRepository", "Repository", "Accès données PostgreSQL")
    Component(events, "PrayerEventPublisher", "Domain Events", "Émet SlotStarted, SlotEnded")
  }

  Component_Ext(gatewayC, "Realtime Gateway", "Diffuse aux clients connectés")
  Component_Ext(schedulerC, "Scheduler", "Déclenche le calcul à échéance")
  ComponentDb_Ext(pgC, "PostgreSQL", "Programmes, créneaux")

  Rel(ctrl, svc, "Appelle")
  Rel(svc, repo, "Lit/écrit")
  Rel(svc, engine, "Délègue le calcul de transition")
  Rel(engine, events, "Publie")
  Rel(events, gatewayC, "Notifie", "Redis Pub/Sub")
  Rel(schedulerC, svc, "Déclenche à échéance")
  Rel(repo, pgC, "SQL")
```

---

# 5. DIAGRAMME DE CLASSES (extrait domaine Prayer)

```mermaid
classDiagram
  class PrayerProgram {
    +UUID id
    +string title
    +RecurrenceRule recurrence
    +PrayerSlot[] slots
    +ProgramStatus status
    +generateNextOccurrence() PrayerProgram
  }
  class PrayerSlot {
    +UUID id
    +string title
    +DateTime startAt
    +DateTime endAt
    +string guidedText
    +string[] bibleReferences
    +Category category
    +ImportanceLevel importance
    +UUID leaderId
    +getRemainingSeconds() int
  }
  class PrayerRequest {
    +UUID id
    +string description
    +Confidentiality confidentiality
    +RequestStatus status
    +promoteToSlot() PrayerSlot
  }
  class Testimony {
    +UUID id
    +MediaType type
    +TestimonyStatus status
    +approve(moderatorId) void
    +reject(moderatorId, reason) void
  }
  class Community {
    +UUID id
    +CommunityType type
    +string name
  }
  PrayerProgram "1" o-- "many" PrayerSlot
  PrayerProgram --> Community : belongsTo
  PrayerRequest ..> PrayerSlot : promotes to
  Testimony --> PrayerRequest : references
```

---

# 6. DIAGRAMME DE SÉQUENCE — TRANSITION AUTOMATIQUE DE CRÉNEAU

```mermaid
sequenceDiagram
  participant Scheduler
  participant PrayerService as PrayerProgramService
  participant DB as PostgreSQL
  participant Bus as Redis Pub/Sub
  participant Gateway as Realtime Gateway
  participant Client

  Scheduler->>PrayerService: checkExpiredSlots() [tick 1s]
  PrayerService->>DB: findActiveSlot(now)
  DB-->>PrayerService: slot (endAt <= now)
  PrayerService->>DB: markSlotEnded(slot.id)
  PrayerService->>DB: getNextSlot(program.id)
  DB-->>PrayerService: nextSlot
  PrayerService->>DB: markSlotStarted(nextSlot.id)
  PrayerService->>Bus: publish(SlotTransitioned, {roomId, nextSlot})
  Bus-->>Gateway: SlotTransitioned event
  Gateway-->>Client: WS push (nextSlot, remainingSeconds)
```

---

# 7. DIAGRAMME DE SÉQUENCE — BASCULE IA ANIMATRICE

```mermaid
sequenceDiagram
  participant Gateway as Realtime Gateway
  participant Orchestrator as AI Orchestrator
  participant IntercessionAgent as IA Intercession
  participant Room as Salle

  Gateway->>Room: aucun modérateur/responsable présent au démarrage du créneau
  Gateway->>Orchestrator: requestFallbackHost(roomId, slot)
  Orchestrator->>IntercessionAgent: activate(slot, script=guidedText)
  IntercessionAgent-->>Room: TTS(guidedText) + versets affichés
  Note over Room: Un Modérateur rejoint
  Room->>Gateway: humanJoined(moderatorId)
  Gateway->>Orchestrator: releaseFallbackHost(roomId)
  Orchestrator->>IntercessionAgent: deactivate(roomId)
```

---

# 8. STACK TECHNOLOGIQUE

## Backend

NestJS (TypeScript strict), Nx Workspace.

PostgreSQL — base de données relationnelle principale.

Redis — cache, pub/sub, files d'attente (BullMQ).

MinIO (S3-compatible) — stockage objet (médias, exports, pièces jointes).

## Temps réel

WebSocket (Socket.IO ou natif `ws` derrière NestJS Gateway) pour salles, chronomètre, chat, présence.

Redis Pub/Sub pour synchroniser plusieurs instances de Gateway (scalabilité horizontale).

## Audio / Vidéo / Streaming

WebRTC (SFU — ex. mediasoup ou LiveKit) pour prise de parole en direct dans les salles et événements.

Diffusion "lecture seule" à grande échelle (salle mondiale, TV) via HLS/LL-HLS derrière CDN pour supporter un nombre de spectateurs illimité sans dégrader le SFU.

## Frontend

Angular (Web/PWA) — voir [[11_COMPONENT_LIBRARY]] pour la parité des composants.

Flutter (Dart strict) — Mobile (Android/iOS) et TV connectée.

## IA

LLM : Claude (Anthropic API) comme fournisseur par défaut ; interface d'abstraction permettant un changement de fournisseur sans impact sur les agents (voir [[02_AI_AGENTS_SPECIFICATION]]).

RAG : base vectorielle (pgvector sur PostgreSQL pour limiter le nombre de systèmes à opérer) contenant Bible, corpus doctrinal, témoignages, base de connaissance.

TTS/STT : fournisseur externe spécialisé, abstrait derrière une interface interne.

## Authentification

JWT + Refresh Token rotatif (voir [[12_SECURITY_SPECIFICATION]]).

## Observabilité

Prometheus (métriques), Grafana (dashboards), Loki (logs), Tempo (traces) — voir [[15_DEVOPS_SPECIFICATION]].

## Reverse proxy / edge

NGINX (TLS termination, routage HTTP + WS).

CDN pour assets statiques et diffusion HLS.

---

# 9. SCALABILITÉ ET DISPONIBILITÉ MONDIALE

Déploiement multi-région : au moins 2 régions actives (ex. Europe + Amérique du Nord) pour couvrir la continuité 24/7 avec une latence acceptable partout.

Base de données : PostgreSQL primaire par région avec réplication en lecture ; écritures critiques (transitions de créneau, RBAC) centralisées par salle mondiale officielle pour éviter les conflits multi-maîtres.

Gateway WebSocket : stateless au niveau applicatif, état de présence et de chronomètre partagé via Redis, permettant un scaling horizontal derrière un load balancer avec affinité de session minimale.

Objectif de disponibilité et détail des exigences non fonctionnelles : voir [[08_NON_FUNCTIONAL_REQUIREMENTS]].

## Cache

Redis pour : session utilisateur, état du créneau courant par salle, compteurs de présence, résultats d'agrégation (carte mondiale) rafraîchis à intervalle court (ex. 5 s) plutôt que recalculés à chaque requête.

## Gestion des médias

Upload direct vers MinIO/S3 via URL pré-signée (le backend ne relaie jamais le flux binaire des gros fichiers).

Pipeline asynchrone (Worker) : scan antivirus, transcodage, génération de vignettes, avant passage à l'état `AVAILABLE` (voir [[10_STATE_MACHINES]] — agrégat FILE).

## Messagerie temps réel inter-services

Redis Pub/Sub pour la diffusion d'événements à faible latence (transition de créneau, présence).

BullMQ (sur Redis) pour les jobs différables (email, WhatsApp, génération IA différée, transcodage).

---

# OBJECTIF

L'architecture doit permettre d'ajouter une nouvelle salle régionale ou une nouvelle langue sans modification du code, uniquement par configuration et données.
