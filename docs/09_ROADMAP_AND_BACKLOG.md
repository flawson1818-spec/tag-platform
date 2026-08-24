# 09_ROADMAP_AND_BACKLOG.md

# ROADMAP AND BACKLOG

## Objectif

Découper TAG en versions livrables, fournir un backlog Agile de référence (Epics → Features → User Stories), analyser les risques techniques et recommander la stack finale.

---

# 1. ROADMAP PAR VERSION

## MVP — Preuve de continuité (≈ 10-12 semaines)

Objectif : démontrer une salle de prière continue fonctionnelle avec un noyau minimal.

Inclus : Identity (auth simple, rôles de base), une salle mondiale unique, `PrayerProgram`/`PrayerSlot` avec chronomètre serveur et transition automatique, lecture web uniquement (pas de mobile), IA Intercession en fallback texte+TTS basique, demandes de prière (sans promotion automatique), notifications email uniquement.

Exclu : événements, gamification, carte mondiale, réseaux sociaux, mobile natif.

Charge estimée : 1 équipe de 4 (2 backend, 1 frontend, 1 devops) — 10-12 semaines.

## V1 — Communauté et interaction (≈ 8-10 semaines après MVP)

Chat temps réel, réactions, lever la main, communautés (groupes/cellules), témoignages avec modération, RBAC complet ([[06_RBAC_SPECIFICATION]]), notifications push + WhatsApp, IA Accueil et IA Évangélisation.

Charge estimée : équipe élargie à 6 (3 backend, 2 frontend, 1 devops) — 8-10 semaines.

## V2 — Échelle mondiale et mobile (≈ 12 semaines après V1)

Application mobile Flutter (Android/iOS), multi-salles régionales, carte mondiale, gamification, événements (veillées, jeûnes, croisades), WebRTC pour prise de parole, déploiement multi-région.

Charge estimée : équipe 8-9 (3 backend, 2 frontend, 2 mobile, 1-2 devops) — 12 semaines.

## V3 — IA avancée et diffusion (≈ 10 semaines après V2)

IA Communication (génération multicanal), IA Analyse (tableaux de bord avancés), traduction temps réel, TV connectée, extraction du module IA en service dédié si les seuils de charge de la section 4 sont atteints.

Charge estimée : équipe 8-9, +1 spécialiste IA/ML — 10 semaines.

## Version Enterprise

Multi-tenant pour organisations/dénominations (isolation de données par organisation), SLA contractuel, SSO d'entreprise (SAML/OIDC), export de conformité avancé, support prioritaire.

## Version Internationale

Extension linguistique au-delà des 4 langues de lancement, partenariats de diffusion régionaux, conformité juridique locale (protection des données par région), salles régionales supplémentaires pour couverture 24/7 fine par fuseau horaire.

---

# 2. BACKLOG AGILE — EXTRAIT DE RÉFÉRENCE

## EPIC 1 — Moteur de prière continue

### Feature 1.1 — Chronomètre serveur et transition automatique

**User Story** : En tant que Modérateur, je veux que le créneau suivant démarre automatiquement à la fin du créneau en cours, afin que la continuité de la prière ne dépende jamais d'une action humaine.

Critères d'acceptation :
- ✓ Le créneau suivant démarre au plus tard 2 secondes après la fin du créneau précédent.
- ✓ Tous les clients connectés reçoivent l'événement `slot:started` dans le même intervalle.
- ✓ Si aucun créneau suivant n'existe, le programme de secours prend le relais (voir [[01_FUNCTIONAL_SPECIFICATION]] section 2.3).

### Feature 1.2 — Bascule IA Intercession

**User Story** : En tant qu'Administrateur, je veux que l'IA Intercession anime automatiquement un créneau sans responsable humain assigné, afin que la salle mondiale ne soit jamais silencieuse.

Critères d'acceptation :
- ✓ Détection d'absence de responsable dans les 10 premières secondes du créneau.
- ✓ Bascule humaine immédiate dès qu'un Modérateur rejoint (voir [[03_ARCHITECTURE_SPECIFICATION]] section 7).

## EPIC 2 — Demandes de prière

### Feature 2.1 — Soumission et cycle de vie

**User Story** : En tant que Visiteur, je veux soumettre une demande de prière anonyme, afin d'obtenir un soutien sans exposer mon identité.

Critères d'acceptation :
- ✓ Champ confidentialité par défaut sur `ANONYMOUS` pour un utilisateur non authentifié.
- ✓ Aucune donnée d'identification stockée en clair pour une demande anonyme, hors nécessité légale (voir [[08_NON_FUNCTIONAL_REQUIREMENTS]] section 7).

### Feature 2.2 — Promotion en sujet collectif

**User Story** : En tant que Modérateur, je veux transformer une demande individuelle en sujet de prière collectif, afin de mobiliser la communauté sur un besoin urgent.

Critères d'acceptation :
- ✓ La promotion crée un `PrayerSlot` rattaché, avec catégorie héritée.
- ✓ Un texte guidé provisoire est proposé par l'IA Intercession, marqué "généré par IA".

## EPIC 3 — Témoignages et diffusion

### Feature 3.1 — Modération de témoignage

Critères d'acceptation :
- ✓ Aucun témoignage visible publiquement avant validation par un Modérateur.
- ✓ Rejet toujours accompagné d'un motif transmis à l'auteur.

### Feature 3.2 — Diffusion multicanal assistée par IA

Critères d'acceptation :
- ✓ Brouillon généré automatiquement à la validation d'un témoignage.
- ✓ Aucune publication externe sans validation humaine, sauf mode `auto-publish` explicitement activé (voir [[02_AI_AGENTS_SPECIFICATION]] section 6, [[06_RBAC_SPECIFICATION]] section 5).

## EPIC 4 — Communautés

### Feature 4.1 — Hiérarchie de communautés

Critères d'acceptation :
- ✓ Une cellule peut être rattachée à une église, elle-même rattachée à un pays.
- ✓ Les permissions de lecture remontent la hiérarchie (voir [[06_RBAC_SPECIFICATION]] section 6).

## EPIC 5 — Carte mondiale et gamification

### Feature 5.1 — Agrégation en temps réel

Critères d'acceptation :
- ✓ Rafraîchissement toutes les 5 secondes maximum.
- ✓ Aucun pays sous le seuil d'anonymisation affiché individuellement (voir [[08_NON_FUNCTIONAL_REQUIREMENTS]] section 7).

*(La suite du backlog — Events, Notifications, Administration, Analytics — suit la même structure Epic → Feature → User Story → Critères, à dériver de [[01_FUNCTIONAL_SPECIFICATION]] pour chaque section fonctionnelle non encore détaillée ci-dessus.)*

---

# 3. RECOMMANDATION DE STACK — RÉCAPITULATIF

| Couche | Choix | Raison |
|---|---|---|
| Backend | NestJS / TypeScript strict | Cohérence DDD/Clean Architecture, écosystème mature, aligné [[16_AI_GENERATION_RULES]] |
| Frontend Web | Angular | Structure imposée par composants forts, adaptée à une longue durée de vie produit |
| Mobile | Flutter / Dart strict | Un seul code pour Android/iOS/TV, parité avec le design system ([[11_COMPONENT_LIBRARY]]) |
| Base de données | PostgreSQL (+ pgvector) | Fiabilité transactionnelle + RAG sans système vectoriel séparé |
| Cache / Queue | Redis (+ BullMQ) | Pub/Sub pour le temps réel et files de jobs dans un seul composant opérationnel |
| Stockage objet | MinIO (S3-compatible) | Portabilité entre cloud et on-premise |
| Temps réel | WebSocket + WebRTC (SFU) | Salles à grande échelle (WS diffusion) + prise de parole (WebRTC) |
| IA / LLM | Claude (Anthropic API) via interface abstraite | Qualité de raisonnement pour l'assistance pastorale, remplaçable sans impact agents |
| Observabilité | Prometheus / Grafana / Loki / Tempo | Stack open-source cohérente, déjà actée en [[15_DEVOPS_SPECIFICATION]] |
| CI/CD | Pipeline Nx (lint → build → test → scan → deploy) | Aligné [[15_DEVOPS_SPECIFICATION]] |

---

# 4. ANALYSE DES RISQUES ET MITIGATION

| Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|
| Panne de la Gateway temps réel pendant un créneau mondial | Rupture de continuité de la prière | Moyenne | Multi-instance + Redis Pub/Sub, reconstruction d'état depuis PostgreSQL, bascule IA Intercession si nécessaire |
| Coût/latence des appels LLM à grande échelle (chat, animation IA) | Dégradation UX, dépassement budgétaire | Élevée | Mise en cache des réponses fréquentes, RAG local pour réduire les appels, quotas par agent, monitoring coût dédié |
| Contenu doctrinal incorrect généré par l'IA Évangélisation | Réputation, dérive théologique | Moyenne | Corpus doctrinal fermé et versionné, validation pastorale du corpus, aucune génération hors corpus (voir [[02_AI_AGENTS_SPECIFICATION]] section 4) |
| Charge imprévisible lors d'événements mondiaux (croisade, veillée) | Indisponibilité au pire moment | Élevée | Auto-scaling horizontal, bascule lecture seule HLS/CDN au-delà d'un seuil de participants WebRTC (voir [[03_ARCHITECTURE_SPECIFICATION]] section 8) |
| Abus de modération automatique (faux positifs IA Modératrice) | Frustration utilisateur, censure perçue | Moyenne | Seuils de confiance conservateurs, action réversible par défaut (mute temporaire, jamais exclusion), supervision humaine systématique au-delà du seuil critique |
| Fragmentation de la parité fonctionnelle Web/Mobile | Expérience incohérente | Moyenne | Design system unique ([[11_COMPONENT_LIBRARY]]), tests de parité en CI |
| Non-conformité RGPD sur la carte mondiale ou les demandes anonymes | Risque légal | Faible | Anonymisation par seuil, revue légale avant V1, export/suppression de données opérationnels dès V1 |
| Dépendance à un unique fournisseur LLM/TTS/STT | Interruption de service, hausse tarifaire | Moyenne | Interfaces d'abstraction par capacité (voir [[02_AI_AGENTS_SPECIFICATION]] section 9), fournisseur secondaire qualifié en réserve |
| Sous-dimensionnement du Scheduler lors de la génération de récurrences en masse | Programmes manquants, salle vide | Faible | Génération anticipée (J+30 glissant), alerte si aucune occurrence future planifiée pour la salle mondiale |

---

# 5. SEUILS DE DÉCLENCHEMENT D'EXTRACTION MICROSERVICE

Voir [[03_ARCHITECTURE_SPECIFICATION]] section 1. Déclencheurs concrets :

Module IA extrait en service dédié dès que le volume d'appels LLM dépasse un seuil impactant la latence du monolithe (mesuré en V2, cible indicative : > 50 req/s soutenues) ou dès qu'un besoin GPU dédié apparaît (TTS/STT auto-hébergé).

Module Média/Streaming extrait dès que le transcodage impacte la disponibilité du Worker partagé avec les jobs métier (notifications, exports).

---

# OBJECTIF

Chaque version livrée doit rester déployable en une seule commande automatisée (voir [[15_DEVOPS_SPECIFICATION]]) et ne jamais régresser la disponibilité de la salle mondiale déjà en production.
