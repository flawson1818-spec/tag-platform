# 01_FUNCTIONAL_SPECIFICATION.md

# FUNCTIONAL SPECIFICATION

## Objectif

Décrire sans ambiguïté toutes les fonctionnalités attendues de TAG.

Toute fonctionnalité non décrite ici doit être validée avant implémentation.

---

# 1. UTILISATEURS ET RÔLES

## 1.1 Liste des rôles

Visiteur

Nouveau converti

Intercesseur

Modérateur

Responsable d'équipe

Pasteur

Administrateur

Super administrateur

IA Accueil (agent système)

IA Évangéliste (agent système)

IA Modératrice (agent système)

IA Animatrice de prière (agent système)

Le détail des permissions de chaque rôle est défini dans [[06_RBAC_SPECIFICATION]].

## 1.2 Résumé fonctionnel par rôle

VISITEUR

Accède aux salles publiques en lecture/écoute.

Peut discuter avec l'IA Évangéliste.

Peut soumettre une demande de prière anonyme.

Ne peut pas créer de contenu permanent.

NOUVEAU CONVERTI

Accès Visiteur, plus :

Parcours de découverte de la foi.

Profil personnel.

Rejoint une communauté (groupe, cellule, église).

INTERCESSEUR

Accès Nouveau Converti, plus :

Participe activement aux salles (micro, chat, réactions).

Publie des témoignages.

Publie des demandes de prière publiques.

Rejoint des équipes et cellules.

Suit ses statistiques personnelles (heures de prière, séries).

MODÉRATEUR

Accès Intercesseur, plus :

Anime une salle de prière.

Crée et édite des programmes de prière.

Valide ou rejette les témoignages soumis.

Transforme une demande individuelle en sujet collectif.

Gère les participants d'une salle (mute, exclusion temporaire, avertissement).

RESPONSABLE D'ÉQUIPE

Accès Modérateur, plus :

Gère une équipe/cellule/communauté (membres, rôles internes, annonces).

Planifie les créneaux récurrents de son équipe.

PASTEUR

Accès Responsable d'équipe, plus :

Valide les décisions sensibles de modération (exclusion définitive, contenu litigieux).

Publie des communications officielles à l'échelle d'une communauté ou nation.

Supervise la santé spirituelle des cellules qui lui sont rattachées.

ADMINISTRATEUR

Accès plateforme complet hors paramétrage infrastructure :

Gestion des utilisateurs, rôles, communautés, contenus, IA.

Consultation des tableaux de bord globaux.

SUPER ADMINISTRATEUR

Accès total, y compris :

Configuration système, sécurité, clés API, agents IA, facturation, conformité.

---

# 2. MOTEUR DE PRIÈRE CONTINUE

## 2.1 Principe

À tout instant, au moins une salle de prière mondiale est active.

Le programme est découpé en créneaux successifs sans interruption.

Exemple :

```
JEUDI 06 AOÛT 2026

08h00–08h03  Prière d'ouverture
08h03–08h10  Adoration
08h10–08h15  Sujet 1 — Famille
08h15–08h20  Sujet 2 — Nation
08h20–08h25  Sujet 3 — Guérison
...
08h58–09h00  Bénédiction finale
```

## 2.2 Contenu d'un créneau

Chaque créneau (`PrayerSlot`) possède :

Thème

Heure de début / heure de fin (dérivées de la durée et de la position dans le programme)

Texte guidé de la prière

Références bibliques

Responsable (utilisateur humain ou IA Animatrice si aucun humain n'est assigné)

Chants proposés

Objectif spirituel

Temps restant (calculé côté serveur, diffusé en temps réel)

## 2.3 Comportement du chronomètre

Le chronomètre est piloté côté serveur (source de vérité unique), jamais côté client uniquement.

À expiration d'un créneau, le créneau suivant démarre automatiquement, sans action humaine requise.

Si le programme atteint sa fin et qu'aucun programme suivant n'est planifié, l'IA Animatrice bascule sur un programme de secours (playlist de sujets par défaut) pour garantir la continuité.

Toute transition de créneau émet un événement domaine (voir [[10_STATE_MACHINES]]) et une notification temps réel aux participants connectés.

## 2.4 Salles multiples et fuseaux horaires

Plusieurs salles peuvent être actives simultanément (par langue, par continent, par communauté).

Une salle "mondiale" officielle assure la continuité 24/7 ; des salles secondaires (communauté, église, cellule) suivent leur propre programme.

Chaque salle affiche l'heure locale du participant en plus de l'heure du programme.

---

# 3. GESTION DES SUJETS DE PRIÈRE (PROGRAMMES)

## 3.1 Création d'un programme

Un modérateur (ou supérieur) crée un `PrayerProgram` composé d'une liste ordonnée de `PrayerSlot`.

Chaque `PrayerSlot` contient :

Titre

Heure de début, heure de fin (ou durée)

Texte de la prière

Références bibliques

Chants recommandés

Niveau d'importance (Normal, Important, Urgent)

Catégorie : Famille, Finances, Santé, Guérison, Évangélisation, Nation, Jeunesse, Mariage, Église, Mission, Urgence, Autre

## 3.2 Récurrence

Un programme peut être marqué récurrent : Quotidien, Hebdomadaire, Mensuel.

Le moteur de planification génère automatiquement les occurrences futures selon la récurrence, sans intervention manuelle.

Une occurrence générée peut être ajustée individuellement sans modifier la règle de récurrence (exception ponctuelle).

## 3.3 Sujets d'urgence

Un sujet catégorisé "Urgence" peut être injecté dans le programme actif en cours d'exécution par un Responsable d'équipe, Pasteur ou Administrateur, en interrompant ou en insérant avant le créneau suivant. Cette action est journalisée (audit).

---

# 4. PRÉSENTATION PENDANT LA PRIÈRE

Pendant l'exécution d'un créneau, l'écran de salle affiche :

Défilement automatique du texte guidé

Versets bibliques mis en évidence

Images ou visuels associés (facultatif)

Temps restant du créneau en cours

Sujet actuel et sujet suivant

Intercesseur (ou IA) responsable du créneau

Nombre de participants connectés en temps réel

Carte mondiale simplifiée des participants (voir section 9)

---

# 5. DEMANDES DE PRIÈRE

## 5.1 Soumission

Tout utilisateur (y compris Visiteur) peut soumettre une demande de prière (`PrayerRequest`).

Catégories exemples : Maladie, Mariage, Emploi, Études, Visa, Enfant, Délivrance, Famille, Autre.

Champs :

Titre / description

Photo facultative

Pièce jointe facultative

Niveau de confidentialité : Anonyme, Privé (visible modérateurs uniquement), Public

## 5.2 Cycle de vie

Voir [[10_STATE_MACHINES]] pour les états autorisés : `NEW → ASSIGNED → IN_PROGRESS → WAITING → ANSWERED → ARCHIVED` (+ `RESTORED` optionnel).

## 5.3 Transformation en sujet collectif

Un modérateur peut transformer une `PrayerRequest` individuelle en `PrayerSlot` inséré dans un programme, avec attribution automatique de la catégorie et génération assistée du texte guidé (proposée par l'IA Intercession, validée par le modérateur).

---

# 6. TÉMOIGNAGES

## 6.1 Publication

Un intercesseur peut publier un témoignage : texte, audio, vidéo ou photo, rattaché ou non à une `PrayerRequest` répondue.

## 6.2 Validation

Tout témoignage est à l'état `DRAFT` puis soumis à modération avant publication (`PUBLISHED`). Un modérateur valide ou rejette avec motif.

## 6.3 Diffusion multicanal

Un témoignage validé peut être transformé automatiquement (par l'IA Communication, voir [[02_AI_AGENTS_SPECIFICATION]]) en publications adaptées pour : Facebook, Instagram, TikTok, YouTube, X, LinkedIn, Threads — avec génération automatique de visuels. La publication externe reste soumise à validation humaine avant envoi (pas de publication automatique sans confirmation, sauf configuration explicite "auto-publish" activée par un Administrateur).

---

# 7. ÉVÉNEMENTS EN LIGNE

## 7.1 Types

Veillée, Jeûne, Croisade, Conférence, Étude biblique, Débat biblique, Formation, Intercession spéciale.

## 7.2 Fonctionnalités pendant un événement

Lever la main

Prendre la parole (sous validation modérateur)

Écrire (chat)

Réagir (emoji)

Voter (sondage)

Répartition en salles de prière (breakout rooms)

## 7.3 Cycle de vie

`CREATED → SCHEDULED → OPEN → RUNNING → FINISHED → ARCHIVED` (aligné sur `PRAYER SESSION`, voir [[10_STATE_MACHINES]]).

---

# 8. COMMUNAUTÉ

## 8.1 Structures supportées

Groupes, Équipes, Cellules, Pays, Villes, Églises, Ministères — toutes modélisées comme des variantes d'une entité générique `Community` avec un `type`.

## 8.2 Contenu d'une communauté

Fil d'actualité

Annonces

Programme (liste de `PrayerProgram` rattachés)

Documents

Membres (avec rôle interne)

Responsables

---

# 9. CARTE MONDIALE

Affiche en temps réel :

Personnes actuellement en prière (agrégées par pays, jamais de position précise individuelle — voir vie privée dans [[08_NON_FUNCTIONAL_REQUIREMENTS]])

Salles actuellement ouvertes

Pays représentés

Fuseaux horaires actifs

Événements en cours

---

# 10. GAMIFICATION

Éléments :

Heures de prière cumulées

Jours consécutifs (streak)

Défis communautaires

Badges

Objectifs communautaires (ex. "10 000 heures ce mois")

Classement mondial (opt-in, jamais imposé)

Principe directeur : la gamification valorise la fidélité et la constance ; elle ne doit jamais présenter la prière comme une compétition entre individus (pas de classement "top intercesseur" mis en avant publiquement par défaut — uniquement des objectifs collectifs).

---

# 11. NOTIFICATIONS

Déclencheurs :

Début d'un sujet suivi/favori

Fin d'un sujet

Réponse à une demande de prière

Témoignage validé

Nouvel événement dans une communauté suivie

Invitation

Rappel de prière (planifié par l'utilisateur)

Anniversaire

Canaux : Push, Email, WhatsApp (voir [[10_STATE_MACHINES]] pour les cycles de vie `NOTIFICATION`, `EMAIL`, `WHATSAPP`).

---

# 12. APPLICATIONS CIBLES

Web (PWA)

Android

iOS

Windows

macOS

TV connectée (Android TV / tvOS, lecture seule prioritaire : diffusion de la salle en cours)

Le comportement fonctionnel doit être identique entre plateformes ; voir [[11_COMPONENT_LIBRARY]] pour la parité des composants.

---

# OBJECTIF

Toute implémentation doit permettre à un intercesseur, n'importe où dans le monde, à n'importe quelle heure, de rejoindre en moins de 3 secondes une salle de prière active et contextualisée.
