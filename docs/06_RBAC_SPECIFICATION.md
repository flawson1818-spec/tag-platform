# 06_RBAC_SPECIFICATION.md

# RBAC SPECIFICATION

## Objectif

Définir le modèle de contrôle d'accès basé sur les rôles (RBAC) de TAG : rôles, permissions atomiques, portée (globale ou communauté), règles de possession (ownership).

Complète [[01_FUNCTIONAL_SPECIFICATION]] (section 1) et [[12_SECURITY_SPECIFICATION]] (section RBAC).

---

# 1. PRINCIPES

Permissions atomiques : chaque action sensible correspond à un code de permission unique (`entité.action`), jamais de vérification basée uniquement sur le nom du rôle dans le code métier.

Portée : une attribution de rôle (`role_assignment`) est globale (`community_id = NULL`) ou scopée à une communauté précise. Un utilisateur peut être Modérateur d'une cellule sans l'être ailleurs.

Ownership : certaines permissions ne s'appliquent qu'à la ressource dont l'utilisateur est l'auteur (ex. modifier sa propre demande de prière tant qu'elle est `NEW`).

Escalade interdite : un rôle ne peut jamais s'auto-attribuer une permission supérieure à celle qu'il possède déjà (contrôle serveur, jamais côté client).

---

# 2. HIÉRARCHIE DES RÔLES

```
SuperAdministrateur
   └── Administrateur
        └── Pasteur
             └── ResponsableÉquipe
                  └── Modérateur
                       └── Intercesseur
                            └── NouveauConverti
                                 └── Visiteur
```

Un rôle supérieur hérite implicitement des permissions de lecture des rôles inférieurs dans son périmètre (communauté ou global), mais jamais de leurs permissions d'écriture sans attribution explicite — l'héritage RBAC de TAG est un héritage de **lecture**, pas d'écriture.

Les agents IA (Accueil, Intercession, Évangélisation, Modératrice, Communication) possèdent des rôles système dédiés, non hiérarchiques, avec des permissions strictement listées en section 5.

---

# 3. MATRICE RÔLES × PERMISSIONS (extrait des permissions clés)

| Permission | Visiteur | NouveauConverti | Intercesseur | Modérateur | ResponsableÉquipe | Pasteur | Admin | SuperAdmin |
|---|---|---|---|---|---|---|---|---|
| `room.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `prayer_request.create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `prayer_request.create_public` | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `testimony.create` | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `testimony.approve` | | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `prayer_program.create` | | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `prayer_request.promote` | | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `room.moderate` (mute, avertissement) | | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `community.manage_members` | | | | | ✓ | ✓ | ✓ | ✓ |
| `community.recurring_schedule` | | | | | ✓ | ✓ | ✓ | ✓ |
| `moderation.exclude_permanent` | | | | | | ✓ | ✓ | ✓ |
| `content.publish_official` | | | | | | ✓ | ✓ | ✓ |
| `user.manage` | | | | | | | ✓ | ✓ |
| `role.assign` (jusqu'à Pasteur) | | | | | | | ✓ | ✓ |
| `system.configure` (IA, clés, infra) | | | | | | | | ✓ |
| `billing.manage` | | | | | | | | ✓ |

Note : le tableau ci-dessus est un extrait représentatif. La liste exhaustive des permissions atomiques vit dans la table `permissions` ([[04_DATABASE_SPECIFICATION]]) et doit être tenue à jour à chaque nouvelle fonctionnalité — ce document en est le reflet fonctionnel, la base de données fait foi en cas de divergence.

---

# 4. RÈGLES D'OWNERSHIP

| Ressource | Règle |
|---|---|
| `PrayerRequest` | L'auteur peut modifier/supprimer tant que `status = NEW`. Après `ASSIGNED`, seul un Modérateur+ peut agir. |
| `Testimony` | L'auteur peut éditer tant que `status = DRAFT`. Après soumission, seul un Modérateur+ peut approuver/rejeter. |
| `Comment` | L'auteur peut éditer/supprimer son propre commentaire à tout moment (soft delete). Un Modérateur+ peut supprimer n'importe quel commentaire de sa communauté. |
| `Post` | L'auteur ou un Responsable+ de la communauté peut éditer/archiver. |
| `PrayerProgram` | Créateur ou Responsable+ de la communauté rattachée. Le programme mondial officiel (`community_id = NULL`) requiert Administrateur+. |

---

# 5. PERMISSIONS DES AGENTS IA (RÔLES SYSTÈME)

| Agent | Permissions accordées | Interdictions explicites |
|---|---|---|
| IA Accueil | `chat.respond`, `knowledge_base.read` | Aucune action de modification de données métier |
| IA Intercession | `prayer_slot.narrate`, `prayer_slot.generate_draft_text` (marqué IA), `room.fallback_host` | `room.moderate`, `prayer_program.delete` |
| IA Évangélisation | `chat.respond`, `faith_path.propose`, `escalation.trigger` | Aucune publication de doctrine hors corpus validé |
| IA Modératrice | `content.flag`, `content.prefilter`, `user.mute_temporary` (sous seuil configuré) | `moderation.exclude_permanent`, jamais sans notification humaine immédiate |
| IA Communication | `social_publication.draft` | `social_publication.publish` (sauf mode `auto-publish` activé explicitement par SuperAdministrateur pour un canal donné) |
| IA Analyse | `analytics.read_aggregate` | Aucun accès à des données individuelles non agrégées |

---

# 6. VÉRIFICATION TECHNIQUE

Chaque endpoint API déclare ses permissions requises via un décorateur/guard (`@RequirePermission('testimony.approve')`).

La vérification se fait toujours côté serveur, au niveau du Guard NestJS, avant l'exécution du contrôleur — jamais uniquement côté frontend (le frontend masque des actions pour l'UX, il ne sécurise rien).

Toute vérification de permission scoped-communauté résout d'abord `role_assignments` pour `(user_id, community_id)`, puis remonte la hiérarchie de la communauté (`parent_id`) si aucune attribution directe n'existe et que la permission est de type lecture.

---

# OBJECTIF

Ajouter une nouvelle permission ne doit jamais nécessiter de modifier le code des Guards — uniquement une entrée dans `permissions` et `role_permissions`.
