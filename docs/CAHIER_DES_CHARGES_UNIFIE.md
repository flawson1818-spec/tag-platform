# Cahier des charges unifié — Tour d'avant-garde

**Version 1.1 — 10 novembre 2026.** Document unique de référence du projet. Il remplace, pour
toute décision produit, les quatre sources qui coexistaient :

| Source | Contenu | Ce qu'on en fait |
|---|---|---|
| `tag-platform` (ce dépôt) + `docs/01…17` | Plateforme en ligne : NestJS + React + Supabase, salle de prière 24 h/24, réseau social, administration | **Socle conservé.** C'est ici que tout se développe. |
| `Tour-d-Avant-Garde-PILOTE-V1` (`tag-final`, versions V3 → V20) | Seconde conception : Le Veilleur, WhatsApp, intention mondiale, Flambeau, actes de foi, candidatures, profils d'intercesseurs, mobilisation de groupes | **Fonctions reprises** et réécrites dans ce socle (liste §5). Le code (sql.js, frontend HTML, squelette mobile) n'est pas importé. |
| `Downloads/tag-tour-de-garde` | Version antérieure du pilote (même README, statut plus ancien) | Rien de plus que le pilote V1 : **remplacé**. |
| `Tour-d-Avant-Garde-main` (branche principale GitHub du pilote) | Même projet que `tag-tour-de-garde` ; tous ses fichiers et toutes ses routes existent dans le pilote V1, qui ajoute en plus 37 fichiers (salle des sujets, mobilisations, candidatures, modération) | Aucune fonction propre : **remplacé** par le pilote V1. Ses modules Actes de foi et Réunions sont couverts par §5.8 et par les Événements. |
| `FORMATION IA/tag-app` | Maquette statique (tableau de bord, campagnes, groupes, réunions, chroniques) | Écrans déjà couverts : **remplacé**. |

Règle : quand ce document et un autre se contredisent, ce document gagne. Les documents
`docs/01…17` restent la référence de détail pour ce qu'ils décrivent et qui n'est pas modifié ici.

---

## 1. Vision

Tour d'avant-garde est une **plateforme chrétienne de prière en continu, 24 h/24 et 7 j/7**.
« Une prière s'élève à chaque instant » ; « Sur tes murs j'ai placé des gardes : ils ne se
tairont ni jour ni nuit » (Ésaïe 62:6).

Trois piliers :

1. **La salle de prière** ne s'arrête jamais. Les modérateurs écrivent les créneaux à l'avance
   (pour un jour, une semaine, un mois) ; chacun démarre à son heure et le suivant enchaîne ; une
   heure non écrite est prolongée par l'IA.
   Les créneaux se programment **sur une semaine, un mois et jusqu'à trois mois** (une journée
   collée se répète chaque jour ; une semaine collée se répète semaine après semaine), se
   modifient ou s'annulent à tout moment (recoller un jour le remplace ; « Annuler ce jour »).
   Un modérateur présent peut **reprendre la main à tout moment** sur l'IA : il dirige en direct
   avec le sujet qu'il écrit, pendant la durée choisie (3 h au plus), puis rend la main ; le
   programme continue en arrière-plan et la salle le reprend là où il en est.
   Entre deux temps de prière d'une heure, un **bref temps de louange** (5 minutes par défaut) :
   la salle joue la louange choisie par l'administration (liens YouTube ou Spotify, pris à tour
   de rôle), puis le temps de prière suivant commence. Un petit trou du calendrier (30 minutes
   au plus) est rempli par la louange.
2. **Les demandes de prière** sont reçues par l'administration, confiées à des intercesseurs,
   suivies jusqu'à l'exaucement et, si le demandeur l'accepte, portées dans la salle.
3. **La communauté** fonctionne comme un réseau social chrétien : on partage un message, une
   **expérience** vécue, un **écrit** (méditation, enseignement) et des photos ; le fil se filtre
   (tout, mes groupes, photos, expériences, écrits) ; Amen, commentaires, membres, messages privés.
   **Églises et groupes** : mes groupes d'abord, puis « Découvrir » (recherche, filtre par type,
   cartes avec nombre de membres et un seul bouton Rejoindre / Demander). Chaque groupe a sa page :
   Salle en direct · Publications · Membres · Annonces · Documents · Sous-groupes ; les outils de
   gestion n'apparaissent qu'à ses responsables. **Salle en direct** de chaque groupe : un
   responsable réunit les membres (formation, information, prédication, louange, prière) avec une
   vidéo (YouTube / Facebook Live dans la page, ou lien Zoom / Meet / visio Jitsi gratuite), une
   louange jouée pour tous (YouTube / Spotify), et les membres interagissent : discussion,
   réactions, mains levées ; les membres sont prévenus quand le direct commence.

---

## 2. Rôles et ce que chacun voit

| Rôle | Ce qu'il fait | Ce qu'il voit en plus |
|---|---|---|
| **Visiteur** (non connecté) | Voit la salle, le globe, dépose une demande de prière | — |
| **Membre** (Visiteur, Nouveau converti) | Prie dans la salle, publie dans la communauté, écrit aux membres, dépose et suit **ses** demandes | Son accueil personnel, ses demandes |
| **Intercesseur** | Comme le membre + porte les demandes **qui lui sont confiées** | « Demandes qui te sont confiées » |
| **Modérateur** | Anime la salle (parole, chat, relais), écrit les créneaux | Administration : Salle, Programmes et créneaux, Modération |
| **Responsable d'équipe / Pasteur** | Comme le modérateur + statistiques, publications officielles | Administration étendue |
| **Administrateur** | Reçoit et confie les demandes, gère les membres et rôles (jusqu'à Pasteur) | Toute l'administration |
| **Super administrateur** | Tout, nomme les administrateurs | Système |

Règles :

- Un membre ne voit **jamais** les demandes de prière des autres.
- Le menu « Administration » n'apparaît qu'aux rôles qui ouvrent au moins une rubrique ; le
  serveur vérifie chaque action quel que soit l'affichage.
- Personne ne modifie son propre rôle d'administration ; « Super administrateur » ne se donne
  pas par le site.
- Pilote : un nouvel inscrit **candidate** pour devenir intercesseur ; il reste Membre jusqu'à
  validation (§5.4).

---

## 3. Navigation

Membre connecté : **Accueil · Salle de prière · Communauté · Demande de prière · Plus**
(Témoignages, Événements, Campagnes, Carte mondiale, Le Veilleur, IA Évangélisation).
À droite : 🛡️ Administration (responsables seulement), ✉️ Messages, 🔔 Notifications, avatar
(profil, tableau de bord, paramètres, langue, thème, installer l'application, déconnexion).
Téléphone : barre du bas Accueil · Prière · Communauté · Demandes · Messages.

**Accueil** : le **grand globe qui tourne** en premier, l'état de la salle, le sujet en cours, le
bouton « Rejoindre la prière » ; puis l'intention mondiale du jour et le Flambeau (§5.2, §5.3), la
prière du moment, les raccourcis, mes demandes, les nouvelles de la communauté.

---

## 4. Fonctions en place (socle)

| Domaine | État |
|---|---|
| Comptes, connexion, double authentification (TOTP, SMS Twilio, e-mail), appareils de confiance | ✅ |
| Rôles et permissions (8 rôles, permissions par rubrique), espace Administration, membres et rôles | ✅ |
| Salle de prière temps réel : chat, mains levées, prise de parole, réactions, musique, relais modérateur/IA | ✅ |
| Calendrier de prière 24 h/24 (jour, semaine, mois), collage des créneaux, fuseaux horaires | ✅ |
| Temps de louange entre deux temps de prière, avec musique YouTube / Spotify | ✅ |
| Demandes de prière : dépôt, confidentialité, réception par l'administration, assignation, statuts, portage dans la salle | ✅ |
| Témoignages + modération + brouillons de publication réseaux sociaux | ✅ |
| Communauté : fil, photos, Amen, commentaires, églises et groupes, annuaire des membres, profils | ✅ |
| Messagerie privée en direct, blocage | ✅ |
| Événements, campagnes, notifications (application, push web), carte mondiale et globe | ✅ |
| IA Accueil et IA Évangélisation, modération IA | ✅ |
| E-mails réels (Brevo), PWA installable, quatre langues (FR, EN, ES, PT) | ✅ |

---

## 5. Fonctions reprises du pilote V1 (à développer dans ce socle)

Ordre de développement = ordre de ce chapitre. État : ✅ fait · 🔨 à faire · ⛔ bloqué.

### 5.1 Le Veilleur (pilote V17) — ✅
L'IA d'accueil prend le nom **Le Veilleur**. Missions : accueillir, guider vers la salle,
recevoir une demande de prière, donner le programme du jour, rappeler la prochaine rencontre,
mettre en relation avec un responsable. C'est l'actuelle « IA Accueil » renommée et enrichie.

### 5.2 Intention de prière mondiale du jour (pilote, Sprint 1) — ✅
Chaque jour a une intention collective (titre, texte, verset) préparée à l'avance par
l'administration. Affichée sur l'accueil sous le globe et dans la salle. Sans intention prévue,
rien ne s'affiche (jamais de contenu inventé).

### 5.3 Le Flambeau de la journée (pilote, Sprint 1) — ✅
Chaque jour, un responsable est **Gardien du Flambeau** : il veille sur la journée de prière.
Une liste de veille (ouvrir la journée, vérifier le programme, accueillir les nouveaux,
encourager, clôturer) qu'il coche ; un mot d'encouragement publié sur l'accueil.
L'administration désigne les gardiens à l'avance.

### 5.4 Candidatures (pilote V1) — ✅
- **Intercesseur** : un membre candidate (motivation, disponibilités) ; un administrateur valide
  (le rôle Intercesseur est donné) ou refuse.
- **Église / communauté** : une communauté candidate ; elle n'apparaît dans l'annuaire qu'après
  validation ; le candidat en devient le responsable (rôle Responsable d'équipe pour cette
  communauté). Le téléphone de contact n'est visible que par l'administration.
- Écrans : menu de l'avatar → Candidatures ; Communauté → Églises et groupes → « Inscrire mon
  église » ; Administration → Candidatures (accepter / refuser avec un mot pour le candidat).

### 5.5 Profil opérationnel des intercesseurs et recommandation (pilote V8) — ✅
Disponibilité (disponible, occupé, absent), sujets de prédilection, capacité (demandes
actives maximum). À l'assignation d'une demande, la plateforme **recommande** les intercesseurs
(sujet 40 pts, disponibilité 25, capacité 25, urgence/présence 10) ; l'administrateur décide —
aucune assignation automatique.
- Écrans : Demande de prière → « Mon profil d'intercesseur » (intercesseurs et plus) ;
  Administration → Demandes de prière → « ✨ Recommandés » puis « Confier ».

### 5.6 Mobilisation d'un groupe sur une demande (pilote V13) — ✅
L'administration peut confier une demande à un **groupe** (église, cellule, équipe) en plus d'un
intercesseur : invité → accepté / décliné → terminé. Le responsable du groupe est notifié.

### 5.7 « Je prie pour ce sujet » (pilote V9-V10, adapté) — ✅
Quand une demande est portée dans la salle, chacun peut appuyer « Je prie pour ce sujet » : un
compteur sans double comptage par personne, et le demandeur voit combien ont prié.
**Adaptation** : dans le pilote, les sujets « ouverts » étaient visibles par tout le réseau. Ici,
conformément à la décision du 10/11/2026, **seule l'administration** décide de porter une demande
dans la salle, et seulement si le demandeur l'a autorisé (confidentialité « Public »), sans son
nom.

### 5.8 Actes de foi (pilote) — ✅
Un membre enregistre un acte de foi (engagement, jeûne, don de temps) ; il apparaît dans son
profil et nourrit les témoignages.
- Types : engagement, jeûne, don de temps, veille de prière, évangélisation ; durée (1, 3, 7, 21,
  40 jours ou sans fin) ; public ou privé. Les autres membres appuient « Je te soutiens ».
- Accompli : le membre peut raconter ce que Dieu a fait ; ce récit devient un témoignage, publié
  après relecture comme les autres. Écrans : menu de l'avatar → Mes actes de foi ; profil.

### 5.9 WhatsApp (pilote V17) — ⛔ bloqué par un élément externe
Menu conversationnel 1-6 (rejoindre la prière, déposer une demande, programme du jour,
prochaine rencontre, témoignage, parler à un responsable), webhook Meta signé, simulateur.
Nécessite un compte Meta Business (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).

### 5.10 Pilotage (pilote V7) — 🔨
Le tableau de bord ajoute : taux d'assignation, de prise en charge, d'exaucement, de publication
des témoignages, sources des demandes, série sur 7 à 90 jours.

---

## 6. Ce qui est abandonné

- Le second backend du pilote (NestJS + TypeORM + sql.js) et son frontend HTML : remplacés par
  ce socle (NestJS + Supabase PostgreSQL + React).
- Le squelette d'application mobile React Native (jamais lancé) : remplacé par l'application
  installable (PWA). Une application des stores reste possible plus tard.
- Les deux maquettes (`tag-app`, `tag-tour-de-garde`) : leurs écrans existent déjà.
- La visibilité « OPEN » où tout le réseau lit les demandes : remplacée par §5.7.
- Les données de démonstration de secours du pilote : l'application ne montre que des données
  réelles.

---

## 7. Hors périmètre actuel (plus tard)

Salle audio/vidéo (WebRTC) et voix de l'IA ; applications des stores ; académie, observatoire
mondial ; campagnes publicitaires automatisées.

---

## 8. Exigences techniques

- Hébergement : site sur Vercel, serveur sur Render, base et fichiers sur Supabase.
- Chaque évolution de base = une migration additive et rejouable dans `supabase/migrations`.
- Le code fonctionne avant la migration (lecture vide, écriture « pas encore activée »).
- Tests automatisés pour toute règle métier ; interface vérifiée sur ordinateur et téléphone.
- Jamais d'e-mail ni de téléphone sur une page publique ; secrets jamais enregistrés en clair.
- Guide de mise en ligne : `docs/MISE_EN_LIGNE.md`.

---

## 9. État au 11 novembre 2026 et reste à faire

### 9.1 À développer

| Point | État | Ce qu'il faut |
|---|---|---|
| §5.10 Pilotage | 🔨 | Développement (taux d'assignation, de prise en charge, d'exaucement, sources, séries 7-90 jours) |
| §5.9 WhatsApp | ⛔ | Un compte Meta Business vérifié, puis WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID |

### 9.2 Développé, mais à activer en production

Chaque fonction marche sans sa migration (lecture vide, écriture « pas encore activée »).
Pour la rendre active, il faut lancer sa migration dans l'éditeur SQL de Supabase, dans l'ordre :

| Migration | Active |
|---|---|
| 20261106_prayer_slot_duration | Durée propre de chaque segment |
| 20261107_social_feed | Fil, photos, Amen, profils |
| 20261108_direct_messages | Messages privés |
| 20261109_storage_bucket | Envoi des photos et documents |
| 20261110_prayer_calendar | Calendrier de prière (jour, semaine, 3 mois) |
| 20261111_prayer_request_assignment | Confier une demande à un intercesseur |
| 20261112_daily_watch | Intention du jour, Flambeau |
| 20261113_applications | Candidatures intercesseur / église |
| 20261114_intercessor_profiles | Profil d'intercesseur |
| 20261115_worship_interlude | Liens de louange entre les prières |
| 20261116_social_post_kinds | Expériences et écrits dans le fil |
| 20261117_prayer_request_mobilizations | Mobiliser un groupe sur une demande |
| 20261118_prayer_request_prayers | « Je prie pour ce sujet » |
| 20261119_faith_acts | Actes de foi |

Réglages du serveur (Render → Environment) dont dépendent certaines fonctions :

| Réglage | Sans lui |
|---|---|
| ANTHROPIC_API_KEY | Le Veilleur, IA Évangélisation, modération IA et textes de prière générés ne répondent pas (repli sans IA) |
| EMAIL_RELAY_URL + EMAIL_RELAY_SECRET (Gmail, voir docs/gmail-relay.gs) ou BREVO_API_KEY + EMAIL_FROM | Pas d'e-mails (inscription, mot de passe oublié, double authentification par e-mail). Render gratuit bloque l'envoi SMTP : seuls ces envois par HTTPS marchent |
| VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT | Pas de notifications sur le téléphone (elles restent dans l'application) |
| TWILIO_* | Pas de double authentification par SMS |
| PRAYER_WORSHIP_LINKS (facultatif) | La louange entre les prières n'a pas de musique par défaut tant qu'aucun lien n'est enregistré dans le programme |

### 9.3 Limites connues de l'hébergement actuel

- **Render gratuit** : le serveur se réveille tout seul toutes les 10 minutes, mais un redémarrage
  (mise à jour, panne) efface ce qui est gardé en mémoire : salles en direct des groupes, main
  reprise par un modérateur, louange en cours, discussion de la salle en direct. La prière, elle,
  reprend seule. Un plan payant (« Starter ») évite la mise en veille et les redémarrages
  imprévus.
- **Un seul serveur** : les salles en direct supposent une seule instance du serveur. Pour en
  avoir plusieurs, il faudra partager l'état (Redis).
- **Vidéo** : la plateforme montre les directs YouTube / Facebook et ouvre les visios (Zoom,
  Meet, Jitsi) ; elle n'héberge pas elle-même la vidéo (WebRTC, §7).
- **Ancienne adresse** `dist-pi-lovat-44.vercel.app` : n'est plus mise à jour. L'adresse
  officielle est `tag-platform-inky.vercel.app` (à relier plus tard à un nom de domaine).
