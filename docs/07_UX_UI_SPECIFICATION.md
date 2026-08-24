# 07_UX_UI_SPECIFICATION.md

# UX/UI SPECIFICATION

## Objectif

Décrire chaque écran de TAG : wireframe textuel, fonctionnalités, composants (voir [[11_COMPONENT_LIBRARY]]), parcours utilisateur, cas d'erreur, comportement responsive.

Principe directeur : un nouvel utilisateur doit pouvoir rejoindre une salle de prière active en 3 étapes maximum depuis l'écran d'accueil.

---

# 1. ACCUEIL

## Wireframe

```
┌──────────────────────────────────────────┐
│ Logo TAG          [Langue▾]  [Connexion]  │
├──────────────────────────────────────────┤
│  ▶ SALLE MONDIALE — EN DIRECT             │
│    Sujet actuel : "Nation"  ⏱ 04:12       │
│    [ REJOINDRE LA PRIÈRE ]                │
├──────────────────────────────────────────┤
│ Carte mondiale (mini)   |  Chiffres clés  │
│                         |  ex. 12 480     │
│                         |  en prière      │
├──────────────────────────────────────────┤
│ Prochains événements    │ Témoignages     │
│ (carrousel)              récents (feed)   │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Rejoindre instantanément la salle mondiale en cours (pas d'inscription requise pour écouter).

Aperçu carte mondiale, compteur global, témoignages récents publiés.

## Composants

`Navbar`, `PrayerCard`, mini `Heatmap`/carte, `Carousel`, `NotificationCard`.

## Parcours utilisateur

Arrivée → voit le créneau en cours → clique "Rejoindre" → entre en lecture immédiate (aucun compte requis) → invité à créer un compte pour interagir (chat, main levée).

## Cas d'erreur

Aucune salle active (cas théorique, dégradation du Scheduler) : affichage du prochain créneau programmé avec compte à rebours, jamais un écran vide.

Perte de connexion WebSocket : bannière "Reconnexion..." + tentative automatique, contenu affiché reste figé (pas de saut visuel).

## Responsive

Mobile : la salle mondiale devient le premier bloc plein écran, carte mondiale et témoignages passent sous forme de sections scrollables.

---

# 2. CONNEXION / INSCRIPTION

## Wireframe (Connexion)

```
┌───────────────────────┐
│   Bienvenue sur TAG    │
│  [ Email            ]  │
│  [ Mot de passe     ]  │
│  [ Se connecter ]      │
│  Mot de passe oublié ? │
│  ── ou ──               │
│  [Google] [Apple]      │
│  Pas de compte ? S'inscrire │
└───────────────────────┘
```

## Fonctionnalités

Connexion email/mot de passe, SSO (Google/Apple), MFA si activé, inscription avec choix de langue/fuseau horaire, choix de communauté initiale (facultatif).

## Composants

`FormField`, `Input(Email/Password)`, `Button`, `Toast` (erreurs), `OTP` (MFA).

## Parcours utilisateur

Inscription → vérification email → onboarding IA Accueil (2-3 écrans) → proposition de rejoindre une communauté → redirection Accueil.

## Cas d'erreur

Identifiants invalides : message générique (pas de distinction email/mot de passe, anti-énumération — voir [[12_SECURITY_SPECIFICATION]]).

Compte `LOCKED`/`SUSPENDED` : message explicite avec contact support, pas d'accès.

## Responsive

Formulaire plein écran sur mobile, clavier adapté au type de champ (email, password).

---

# 3. SALLE DE PRIÈRE

## Wireframe

```
┌──────────────────────────────────────────┐
│ ⏱ 04:12   Sujet : "Nation"   👥 12 480    │
├──────────────────────────────────────────┤
│                                            │
│     [ Texte guidé défilant ]              │
│     [ Verset mis en évidence ]            │
│                                            │
├──────────────────────────────────────────┤
│ Suivant : "Guérison" (08:20)              │
│ Intercesseur : Pasteur J. Dupont          │
├──────────────────────────────────────────┤
│ [Chat]  [🖐 Main]  [❤️ Réagir]  [🎤 Parler]│
└──────────────────────────────────────────┘
```

## Fonctionnalités

Défilement automatique du texte, versets, image facultative, chrono serveur, sujet actuel/suivant, compteur de présence, chat, réactions, lever la main, prise de parole (WebRTC), mini carte mondiale en overlay optionnel.

## Composants

`Timer`, `PrayerCard`, `Chat`, `ReactionBar`, `Avatar` (intercesseur), `Badge` (nombre connecté).

## Parcours utilisateur

Rejoint via Accueil ou Calendrier → écoute → (optionnel) s'authentifie pour interagir → lève la main → est invité à parler par un modérateur → parle → redevient auditeur.

## Cas d'erreur

Créneau se termine pendant une prise de parole : coupure douce annoncée ("Fin du sujet dans 5s") avant transition, jamais de coupure brutale sans préavis.

Perte réseau pendant prise de parole : reconnexion automatique en mode auditeur, notification "Vous avez été remis en écoute".

## Responsive / TV

Mobile : chat et réactions dans un tiroir rétractable pour maximiser le texte guidé.

TV connectée : lecture seule, aucune interaction, plein écran, sous-titres activables.

---

# 4. CALENDRIER (Programmes)

## Wireframe

```
┌──────────────────────────────────────────┐
│ [Jour] [Semaine] [Mois]     [+ Programme] │
├──────────────────────────────────────────┤
│ 08h00 Ouverture         [Modérateur: -]   │
│ 08h03 Adoration                            │
│ 08h10 Famille           [IA - fallback]   │
│ ...                                        │
├──────────────────────────────────────────┤
│ Répétition : Quotidien ▾   [Enregistrer]  │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Vue jour/semaine/mois, création/édition de créneaux (Modérateur+), récurrence, injection d'un sujet d'urgence, aperçu de qui anime chaque créneau (humain ou IA).

## Composants

`Calendar`, `Timeline`, `Stepper` (création guidée d'un programme), `Select`, `Chip` (catégories).

## Parcours utilisateur

Modérateur ouvre Calendrier → "+ Programme" → assistant en 4 étapes (Infos → Créneaux → Récurrence → Aperçu) → publication.

## Cas d'erreur

Chevauchement de créneaux dans un même programme : validation bloquante avant sauvegarde, message explicite indiquant les créneaux en conflit.

## Responsive

Mobile : vue "Jour" par défaut, bascule Semaine/Mois via un sélecteur compact.

---

# 5. DEMANDES DE PRIÈRE

## Wireframe

```
┌──────────────────────────────────────────┐
│ [+ Nouvelle demande]     [Filtrer ▾]      │
├──────────────────────────────────────────┤
│ 🔒 Anonyme — Santé — "en cours"           │
│ 👤 Marie K. — Emploi — "nouveau"          │
│ ...                                        │
├──────────────────────────────────────────┤
│ [Transformer en sujet collectif] (Modo)   │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Soumission (catégorie, confidentialité, photo/pièce jointe facultative), liste filtrable par statut/catégorie, action modérateur "promouvoir en sujet".

## Composants

`Form`, `Uploader`, `Select`, `Badge` (statut), `Table`/`List`.

## Parcours utilisateur

Utilisateur soumet → statut `NEW` → Modérateur assigne (`ASSIGNED`) ou promeut en sujet collectif → suivi jusqu'à `ANSWERED` → auteur invité à publier un témoignage.

## Cas d'erreur

Pièce jointe rejetée (type/taille) : message immédiat avant soumission, jamais après création de la demande.

## Responsive

Mobile : formulaire de soumission en plein écran, liste en cartes empilées.

---

# 6. TÉMOIGNAGES

## Wireframe

```
┌──────────────────────────────────────────┐
│ [+ Partager un témoignage]                │
├──────────────────────────────────────────┤
│ ▶ Vidéo — "Guérison" — validé              │
│ 📝 Texte — "Emploi trouvé" — en attente    │
├──────────────────────────────────────────┤
│ (Vue Modérateur) [Approuver] [Rejeter]    │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Publication multi-format, file de modération, diffusion multicanal après validation (voir [[02_AI_AGENTS_SPECIFICATION]] IA Communication).

## Composants

`Uploader` (audio/vidéo/photo), `MediaPlayer`, `Card`, `Modal` (rejet avec motif).

## Parcours utilisateur

Soumission → `DRAFT` → file de modération → `PUBLISHED` → proposition de brouillon réseaux sociaux → validation Responsable Communication → publication externe.

## Cas d'erreur

Rejet : motif obligatoire, notifié à l'auteur avec possibilité de resoumettre.

## Responsive

Mobile : enregistrement audio/vidéo directement depuis la caméra/micro de l'appareil.

---

# 7. ÉVÉNEMENTS

## Wireframe

```
┌──────────────────────────────────────────┐
│ [Veillée] [Jeûne] [Croisade] [Étude] ...  │
├──────────────────────────────────────────┤
│ 🗓 Veillée mondiale — Sam 20h  [S'inscrire]│
├──────────────────────────────────────────┤
│ En direct : 🖐 3 mains levées  [Salles ▾] │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Catalogue filtrable par type, inscription, salle en direct avec mains levées/votes/réactions, répartition en salles annexes (breakout).

## Composants

`Card(EventCard)`, `Tabs`, `Poll`, `Drawer` (liste des mains levées, vue modérateur).

## Parcours utilisateur

Découverte → inscription → rappel notification → participation live → (optionnel) répartition en petite salle → retour salle principale → clôture.

## Cas d'erreur

Capacité de salle annexe atteinte : redirection automatique vers la salle la moins chargée, jamais de blocage utilisateur.

## Responsive

Mobile : mains levées et votes accessibles via une barre d'action fixe en bas d'écran.

---

# 8. PROFIL

## Wireframe

```
┌──────────────────────────────────────────┐
│ [Avatar] Nom, Communauté, Langue          │
├──────────────────────────────────────────┤
│ 🔥 14 jours consécutifs   ⏱ 32h ce mois   │
│ 🏅 Badges: [Fidèle] [Intercesseur Nations]│
├──────────────────────────────────────────┤
│ Mes demandes | Mes témoignages | Réglages │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Statistiques personnelles (heures, streak, badges — voir [[01_FUNCTIONAL_SPECIFICATION]] section 10), historique de demandes/témoignages, gestion des préférences (langue, fuseau, notifications), export/suppression de ses données (conformité, voir [[08_NON_FUNCTIONAL_REQUIREMENTS]]).

## Composants

`ProfileCard`, `Badge`, `Progress`, `Tabs`, `Switch` (préférences notifications).

## Cas d'erreur

Demande de suppression de compte : confirmation à double étape, délai de rétractation avant purge effective (aligné soft delete `DELETED`).

## Responsive

Mobile : onglets convertis en menu déroulant compact.

---

# 9. COMMUNAUTÉS

## Wireframe

```
┌──────────────────────────────────────────┐
│ Ma cellule "Espoir Paris"                 │
├──────────────────────────────────────────┤
│ Annonces | Fil | Programme | Membres      │
├──────────────────────────────────────────┤
│ [Post] Réunion vendredi 19h — 12 réactions│
└──────────────────────────────────────────┘
```

## Fonctionnalités

Fil d'actualité, annonces épinglées, programme rattaché, gestion des membres (Responsable+), hiérarchie (cellule → église → pays).

## Composants

`Feed`, `Card(GroupCard)`, `List` (membres), `Tabs`.

## Parcours utilisateur

Découverte (recherche/invitation) → demande d'adhésion ou adhésion directe → participation au fil → accès au programme de la communauté.

## Cas d'erreur

Communauté à adhésion validée par un Responsable : état "en attente" affiché explicitement, pas de silence.

## Responsive

Mobile : navigation par onglets en bas d'écran.

---

# 10. STATISTIQUES (Tableau de bord)

## Wireframe

```
┌──────────────────────────────────────────┐
│ [Période ▾]           [Exporter]          │
├──────────────────────────────────────────┤
│ Heures de prière (LineChart)              │
│ Thèmes les + demandés (BarChart)          │
│ Croissance communauté (AreaChart)         │
│ Carte mondiale (Heatmap)                  │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Réservé Responsable+ ; alimenté par l'IA Analyse (voir [[02_AI_AGENTS_SPECIFICATION]]). Filtres période/communauté, export.

## Composants

`LineChart`, `BarChart`, `AreaChart`, `Heatmap`, `KPIs`, `Select`.

## Cas d'erreur

Aucune donnée sur la période sélectionnée : état vide explicite ("Pas encore de données"), jamais un graphique vide sans explication.

## Responsive

Mobile : graphiques empilés verticalement, interactions tactiles simplifiées (tap pour détail au lieu de hover).

---

# 11. NOTIFICATIONS

## Wireframe

```
┌──────────────────────────────────────────┐
│ Notifications          [Tout marquer lu]  │
├──────────────────────────────────────────┤
│ 🕒 Il y a 2 min — Le sujet "Nation" démarre│
│ ✅ Il y a 1h — Votre demande a une réponse │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Liste chronologique, marquage lu/non lu, lien direct vers la ressource concernée, préférences par type de notification (Profil).

## Composants

`NotificationCard`, `Badge` (compteur non lus), `List`.

## Cas d'erreur

Ressource liée supprimée entre-temps : notification reste visible avec mention "contenu indisponible", pas d'erreur 404 brute.

## Responsive

Mobile : accessible via icône cloche persistante dans la navigation.

---

# 12. CARTE MONDIALE

## Wireframe

```
┌──────────────────────────────────────────┐
│  🌍  [Filtrer par événement ▾]            │
│   ● France (412)   ● Brésil (1 204)       │
│   ● Nigéria (2 350) ...                   │
├──────────────────────────────────────────┤
│ Salles ouvertes : 6   Fuseaux actifs : 14 │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Agrégats par pays uniquement (voir [[08_NON_FUNCTIONAL_REQUIREMENTS]] — vie privée), salles ouvertes, fuseaux horaires actifs, événements en cours.

## Composants

`Heatmap`/carte interactive, `KPIs`, `Filter`.

## Cas d'erreur

Pays avec effectif très faible (< seuil d'anonymisation, ex. 5 personnes) : regroupé dans une catégorie régionale pour éviter toute identification indirecte.

## Responsive

Mobile : carte simplifiée, liste des pays triable en dessous plutôt que zoom tactile complexe.

---

# 13. ADMINISTRATION

## Wireframe

```
┌──────────────────────────────────────────┐
│ Utilisateurs | Rôles | Contenus | IA | Système │
├──────────────────────────────────────────┤
│ [Table utilisateurs — recherche, filtres] │
│ Statut ▾   Rôle ▾   [Suspendre] [Détails] │
└──────────────────────────────────────────┘
```

## Fonctionnalités

Gestion utilisateurs/rôles, file de contenus signalés, configuration des agents IA (activation, seuils, mode auto-publish), santé système (lien vers [[15_DEVOPS_SPECIFICATION]]), journaux d'audit.

## Composants

`Table`, `Modal(Confirmation)`, `Tabs`, `Toast`.

## Cas d'erreur

Action irréversible (suspension, exclusion permanente) : `Dialog Confirm` obligatoire avec rappel de la conséquence.

## Responsive

Réservé principalement à un usage desktop ; version mobile en lecture seule + actions critiques uniquement (suspension d'urgence).

---

# OBJECTIF UX GLOBAL

Cohérence stricte entre Web (Angular) et Mobile (Flutter) : mêmes libellés, mêmes états, mêmes seuils d'erreur, mêmes temps de réponse perçus — voir [[11_COMPONENT_LIBRARY]] section Mobile.
