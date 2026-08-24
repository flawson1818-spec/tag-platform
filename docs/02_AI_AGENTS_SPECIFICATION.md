# 02_AI_AGENTS_SPECIFICATION.md

# AI AGENTS SPECIFICATION

## Objectif

Définir l'architecture multi-agents IA de TAG, le rôle de chaque agent, ses limites, et son intégration technique.

Principe non négociable : l'IA assiste, elle ne décide jamais seule sur les sujets sensibles (exclusion d'un membre, validation finale d'un témoignage litigieux, arbitrage de conflit). Ces décisions restent humaines (Modérateur, Pasteur, Administrateur).

---

# 1. VUE D'ENSEMBLE MULTI-AGENTS

```
                    ┌─────────────────────┐
                    │   AI ORCHESTRATOR    │
                    │  (Router + Policies)  │
                    └──────────┬───────────┘
          ┌───────────┬────────┼────────┬───────────┐
          ▼           ▼        ▼        ▼           ▼
     IA Accueil   IA Évangé-  IA Inter-  IA Commu-  IA Analyse
                  lisation    cession    nication
```

L'orchestrateur reçoit chaque événement (message utilisateur, fin de créneau, témoignage soumis, demande créée) et route vers l'agent compétent selon le contexte (`domain`, `intent`, `role appelant`).

Chaque agent partage :

Un socle LLM commun (voir [[03_ARCHITECTURE_SPECIFICATION]] pour le choix de fournisseur/modèle).

Une couche RAG commune indexant : Bible (versions autorisées), bibliothèque de témoignages validés, base de connaissance plateforme, historique des programmes.

Une mémoire courte (contexte de conversation) et une mémoire longue (profil utilisateur, historique d'interactions, préférences) — stockées séparément, jamais mélangées entre agents sans consentement explicite de l'utilisateur.

---

# 2. IA ACCUEIL

## Rôle

Premier point de contact pour tout nouvel utilisateur.

## Responsabilités

Souhaiter la bienvenue et présenter la plateforme.

Répondre aux questions d'usage ("Comment rejoindre une salle ?", "Comment créer un compte ?").

Orienter vers l'IA Évangélisation si l'intention détectée est spirituelle/évangélique plutôt qu'opérationnelle.

Escalader vers un humain (support) si la question sort du périmètre couvert par la base de connaissance.

## Limites

Ne gère aucune donnée sensible (paiement, signalement).

N'a pas d'autorité de modération.

---

# 3. IA INTERCESSION (Animatrice de prière)

## Rôle

Peut animer un créneau ou un programme entier lorsqu'aucun responsable humain n'est disponible, afin de garantir la continuité du moteur de prière ([[01_FUNCTIONAL_SPECIFICATION]] section 2).

## Responsabilités

Lire le texte guidé du créneau en cours (synthèse vocale, voir section 7).

Proposer et afficher les versets associés.

Effectuer les transitions entre créneaux (annonce du sujet suivant).

Générer un texte guidé provisoire pour un sujet créé dynamiquement (ex. demande d'urgence transformée en sujet collectif) — toujours marqué "généré par IA, à valider" tant qu'un modérateur ne l'a pas approuvé pour les usages différés (programmation future). En animation live de secours, le contenu généré peut être diffusé immédiatement pour ne pas casser la continuité, puis fait l'objet d'une revue a posteriori.

## Limites

Ne peut pas exclure un participant.

Ne peut pas modifier un programme créé par un humain sans marquage explicite de substitution temporaire.

Bascule automatiquement la main à un humain dès qu'un Modérateur ou Responsable rejoint la salle.

---

# 4. IA ÉVANGÉLISATION

## Rôle

Dialogue avec les visiteurs et nouveaux convertis sur des questions de foi.

## Responsabilités

Répondre aux questions bibliques à partir du corpus RAG (Bible + ressources doctrinales validées par l'équipe pastorale).

Présenter l'Évangile de façon claire et respectueuse.

Proposer un parcours de découverte de la foi structuré (étapes progressives, contenu adapté au niveau de connaissance déclaré).

Inviter à rejoindre une communauté ou une salle de prière.

## Garde-fous

Corpus doctrinal explicitement validé et versionné par l'équipe pastorale — l'agent ne doit jamais improviser de doctrine hors de ce corpus.

Toute question sensible détectée (détresse psychologique, idées suicidaires, situation de danger) déclenche une escalade immédiate vers un humain (Modérateur/Pasteur) et l'affichage de ressources d'urgence, avant toute poursuite de la conversation automatisée.

---

# 5. IA MODÉRATRICE

## Rôle

Assiste les modérateurs humains, ne remplace pas leur autorité de décision finale.

## Responsabilités

Détection de contenu inapproprié (texte, image, audio) dans le chat, les demandes de prière et les témoignages avant publication — classement en `flagged` avec score de confiance.

Pré-filtrage des témoignages soumis (langage, cohérence, contenu sensible) avant présentation à un modérateur humain pour validation finale.

Détection de comportements toxiques répétés (spam, harcèlement) et proposition d'action (mute temporaire) soumise à confirmation modérateur, sauf seuil critique configuré (ex. contenu illégal évident) où une mise en quarantaine automatique immédiate est autorisée, avec notification immédiate à un modérateur humain.

## Limites

Aucune exclusion définitive de compte sans validation humaine.

---

# 6. IA COMMUNICATION

## Rôle

Génère du contenu de diffusion à partir des activités validées de la plateforme.

## Responsabilités

Génère des brouillons de publications : Facebook, Instagram (posts/reels), TikTok, YouTube (descriptions), X, LinkedIn, Threads.

Génère des visuels (citations illustrées, versets illustrés) à partir de gabarits de marque validés.

Génère des invitations aux événements à partir des données de l'événement (`Event`).

## Garde-fous

Toute publication externe est un brouillon par défaut, nécessitant validation humaine (Modérateur/Responsable Communication) avant envoi, sauf si un Administrateur active explicitement le mode "auto-publish" pour un canal et un type de contenu donnés.

---

# 7. IA ANALYSE

## Rôle

Produit des statistiques et rapports à partir des données d'usage.

## Responsabilités

Heures de forte participation par fuseau horaire.

Thèmes de prière les plus demandés.

Volume et tendance des témoignages.

Croissance de la communauté.

Temps moyen de connexion, fidélisation (rétention J1/J7/J30).

Cartographie mondiale agrégée (pays, jamais de localisation individuelle précise).

## Sortie

Alimente les tableaux de bord Administrateur/Pasteur/Responsable d'équipe (voir [[07_UX_UI_SPECIFICATION]]).

---

# 8. CAPACITÉS TRANSVERSES

## Synthèse vocale (TTS)

Utilisée par l'IA Intercession pour l'animation vocale des créneaux, et disponible en accessibilité (lecture des textes) pour tous les utilisateurs.

## Reconnaissance vocale (STT)

Utilisée pour : commandes vocales dans la salle, transcription des prises de parole pour modération et archivage, sous-titrage en direct.

## Traduction temps réel

Traduction du texte guidé, des sous-titres et du chat dans la langue préférée du participant, sans changer le contenu affiché aux autres participants.

## Mémoire

Mémoire courte : contexte de la session de conversation en cours (fenêtre glissante).

Mémoire longue : préférences déclarées, historique de parcours de foi, communautés rejointes — accessible à l'utilisateur (consultation et suppression, conformité RGPD, voir [[08_NON_FUNCTIONAL_REQUIREMENTS]]).

## RAG (Retrieval-Augmented Generation)

Sources indexées : corpus biblique, corpus doctrinal validé, témoignages publiés, base de connaissance produit, programmes de prière archivés.

Toute réponse générée à partir du RAG doit être traçable à sa source pour permettre une revue humaine a posteriori.

---

# 9. ORCHESTRATION TECHNIQUE

L'orchestrateur applique, dans l'ordre, pour chaque requête entrante :

1. Authentification et contexte utilisateur (rôle, communauté, langue).
2. Classification d'intention (routage vers l'agent compétent).
3. Vérification des garde-fous (contenu sensible, escalade obligatoire).
4. Appel LLM + RAG de l'agent sélectionné.
5. Post-traitement (modération de sortie, marquage "généré par IA").
6. Journalisation (audit, traçabilité — voir [[12_SECURITY_SPECIFICATION]]).

Détails d'implémentation (files d'attente, services, scalabilité) : voir [[03_ARCHITECTURE_SPECIFICATION]].

---

# OBJECTIF

Chaque agent IA doit être remplaçable indépendamment (changement de modèle LLM, de fournisseur TTS/STT) sans impacter les autres agents ni les contrats API exposés au reste de la plateforme.
