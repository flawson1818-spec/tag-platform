# TAG_IMPLEMENTATION_MASTER.md

# TAG — TOTAL ADORATION & GLOBAL INTERCESSION

## Objectif

Document maître du projet TAG.

Toute IA ou tout développeur générant du code pour TAG doit se référer en priorité à ce document et aux documents numérotés qu'il indexe.

Aucune décision d'architecture, de fonctionnalité ou de règle métier ne doit contredire ce document.

---

# VISION

TAG est la plateforme mondiale de référence pour l'intercession chrétienne continue.

Une salle de prière est active quelque part dans le monde à chaque instant, 24h/24, 7j/7, 365j/an.

TAG n'est pas un outil de visioconférence. TAG est un autel numérique mondial structuré, chronométré, multilingue, assisté par IA, et animé par une communauté de modérateurs et d'intercesseurs humains.

---

# PRINCIPES DIRECTEURS

Continuité

La prière ne s'arrête jamais. Un programme est toujours actif ou planifié.

Structure

Chaque sujet de prière possède un début, une fin, un contenu et un responsable.

Supervision humaine

L'IA anime, assiste et supplée. Elle ne remplace jamais l'autorité pastorale sur les décisions sensibles (modération de conflit, validation de témoignage, exclusion d'un membre).

Sobriété technique

DDD, Clean Architecture, SOLID, Repository Pattern, Feature First, Nx Workspace, TypeScript Strict. Voir [[16_AI_GENERATION_RULES]].

Sécurité par conception

Voir [[12_SECURITY_SPECIFICATION]].

---

# INDEX DES DOCUMENTS

## Fonctionnel

[01_FUNCTIONAL_SPECIFICATION.md](./01_FUNCTIONAL_SPECIFICATION.md) — Vision produit, utilisateurs, rôles, moteur de prière continue, sujets, demandes, témoignages, événements, communauté, gamification, carte mondiale, notifications, applications cibles.

[02_AI_AGENTS_SPECIFICATION.md](./02_AI_AGENTS_SPECIFICATION.md) — Architecture multi-agents IA : Accueil, Intercession, Évangélisation, Communication, Analyse. Orchestrateur, RAG, mémoire, voix, traduction.

## Technique

[03_ARCHITECTURE_SPECIFICATION.md](./03_ARCHITECTURE_SPECIFICATION.md) — Architecture logicielle, diagrammes C4 (Contexte, Conteneurs, Composants), stack technologique, temps réel, média, scalabilité, cloud.

[04_DATABASE_SPECIFICATION.md](./04_DATABASE_SPECIFICATION.md) — Modèle de données complet, ERD, index, rétention.

[05_API_SPECIFICATION.md](./05_API_SPECIFICATION.md) — API REST et WebSocket, contrats, pagination, erreurs, authentification.

[06_RBAC_SPECIFICATION.md](./06_RBAC_SPECIFICATION.md) — Rôles, permissions atomiques, matrice d'accès.

## Expérience

[07_UX_UI_SPECIFICATION.md](./07_UX_UI_SPECIFICATION.md) — Écrans, wireframes textuels, parcours utilisateurs, responsive.

[11_COMPONENT_LIBRARY.md](./11_COMPONENT_LIBRARY.md) — Design system.

## Qualité et exploitation

[08_NON_FUNCTIONAL_REQUIREMENTS.md](./08_NON_FUNCTIONAL_REQUIREMENTS.md) — Performance, disponibilité, accessibilité, internationalisation, conformité.

[09_ROADMAP_AND_BACKLOG.md](./09_ROADMAP_AND_BACKLOG.md) — Roadmap par version, backlog Agile, risques et mitigation, recommandations de stack.

[10_STATE_MACHINES.md](./10_STATE_MACHINES.md) — Cycles de vie des agrégats métier.

[12_SECURITY_SPECIFICATION.md](./12_SECURITY_SPECIFICATION.md) — Sécurité applicative et infrastructure.

[13_TEST_SPECIFICATION.md](./13_TEST_SPECIFICATION.md) — Stratégie de test.

[14_ACCEPTANCE_CRITERIA.md](./14_ACCEPTANCE_CRITERIA.md) — Critères d'acceptation par fonctionnalité.

[15_DEVOPS_SPECIFICATION.md](./15_DEVOPS_SPECIFICATION.md) — Infrastructure, CI/CD, monitoring, sauvegardes.

[16_AI_GENERATION_RULES.md](./16_AI_GENERATION_RULES.md) — Règles de génération de code par IA.

[17_CODE_CONVENTIONS.md](./17_CODE_CONVENTIONS.md) — Conventions de code.

---

# ORDRE DE LECTURE RECOMMANDÉ

01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17

---

# SI UNE INFORMATION MANQUE

Ne jamais inventer une règle métier.

Déduire uniquement à partir de ce document et des documents qu'il indexe.

Si une contradiction apparaît entre deux documents, ce document (TAG_IMPLEMENTATION_MASTER) fait autorité.

---

# LIVRABLE ATTENDU

Un dépôt Git Nx, directement compilable, conforme à l'ensemble des documents indexés ci-dessus, prêt pour un déploiement en production à disponibilité mondiale.
