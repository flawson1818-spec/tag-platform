# 08_NON_FUNCTIONAL_REQUIREMENTS.md

# NON FUNCTIONAL REQUIREMENTS

## Objectif

Définir les exigences non fonctionnelles de TAG : performance, disponibilité, sécurité (renvoi), accessibilité, internationalisation, vie privée, conformité.

Ces exigences sont contraignantes au même titre que les fonctionnalités. Une fonctionnalité qui les viole n'est pas acceptée (voir [[14_ACCEPTANCE_CRITERIA]]).

---

# 1. DISPONIBILITÉ

Objectif : ≥ 99,99 % de disponibilité mensuelle pour la salle mondiale officielle (≈ 4,3 minutes d'indisponibilité tolérée par mois).

La continuité du moteur de prière (voir [[01_FUNCTIONAL_SPECIFICATION]] section 2) est la métrique de disponibilité prioritaire — au-dessus de la disponibilité des fonctionnalités secondaires (statistiques, administration).

Déploiement multi-région actif-actif pour la Gateway temps réel et l'API (voir [[03_ARCHITECTURE_SPECIFICATION]] section 9).

Dégradation gracieuse : en cas de panne partielle, priorité de continuité dans cet ordre : 1) Salle mondiale (lecture) 2) Chat/interaction 3) Statistiques/Administration.

---

# 2. PERFORMANCE

| Mesure | Objectif |
|---|---|
| Temps de réponse API (p95) | < 300 ms |
| Temps de réponse API (p99) | < 800 ms |
| Latence WebSocket (tick chrono) | < 500 ms de bout en bout |
| Chargement initial Web (LCP) | < 2,5 s sur réseau 4G |
| Temps pour rejoindre une salle depuis l'accueil | < 3 s |
| Débit soutenu salle mondiale | 100 000 connexions simultanées en lecture (cible V2, voir [[09_ROADMAP_AND_BACKLOG]]) |

---

# 3. SCALABILITÉ

Scaling horizontal de l'API, de la Gateway et du Worker sans état applicatif local (état partagé via Redis/PostgreSQL, voir [[03_ARCHITECTURE_SPECIFICATION]]).

Le nombre de salles simultanées doit pouvoir croître sans modification de code (limité uniquement par les ressources infrastructure).

---

# 4. SÉCURITÉ

Renvoi intégral vers [[12_SECURITY_SPECIFICATION]] pour authentification, MFA, politique de mot de passe, RBAC, sécurité API, chiffrement, OWASP, audit, logging, gestion des secrets, tests de sécurité, réponse à incident.

---

# 5. ACCESSIBILITÉ

Conformité WCAG 2.1 niveau AA minimum sur Web et Mobile.

Support clavier complet (navigation salle, formulaires, administration).

Lecteur d'écran : tous les éléments interactifs annotés ARIA.

Sous-titrage en direct disponible sur les salles et événements (voir [[02_AI_AGENTS_SPECIFICATION]] — STT).

Contraste conforme en Dark Mode et Light Mode (voir [[11_COMPONENT_LIBRARY]]).

---

# 6. INTERNATIONALISATION ET MULTI-FUSEAUX

Toutes les chaînes d'interface externalisées (i18n), aucune chaîne codée en dur.

Langues cibles au lancement : Français, Anglais, Espagnol, Portugais — extensible sans changement de code (voir [[09_ROADMAP_AND_BACKLOG]] pour le phasage).

Traduction temps réel du texte guidé et du chat (voir [[02_AI_AGENTS_SPECIFICATION]] section 8) — la langue d'un participant n'affecte jamais le contenu vu par les autres.

Toute date/heure stockée en UTC ; affichage systématiquement converti au fuseau horaire déclaré de l'utilisateur.

Formats de date, nombre et devise localisés selon la locale utilisateur.

---

# 7. VIE PRIVÉE ET PROTECTION DES DONNÉES

La carte mondiale n'affiche jamais de position individuelle précise, uniquement des agrégats par pays, avec seuil d'anonymisation minimal (voir [[07_UX_UI_SPECIFICATION]] section 12).

Les demandes de prière anonymes ne conservent aucune donnée permettant de réidentifier l'auteur dans les vues accessibles aux modérateurs autres que l'équipe pastorale habilitée.

Droit d'accès, de rectification, d'export et de suppression des données personnelles depuis le Profil (voir [[07_UX_UI_SPECIFICATION]] section 8), conforme RGPD et équivalents régionaux.

Mémoire longue des agents IA (voir [[02_AI_AGENTS_SPECIFICATION]] section 8) consultable et supprimable par l'utilisateur.

Les mineurs (si applicable selon la juridiction) bénéficient d'un parcours de consentement parental avant toute interaction IA non supervisée.

---

# 8. FIABILITÉ DES DONNÉES

Sauvegardes quotidiennes de PostgreSQL, rétention 7/30/90/365 jours (voir [[15_DEVOPS_SPECIFICATION]]).

Aucune perte de créneau en cours en cas de bascule d'instance : l'état du chronomètre est reconstruit depuis PostgreSQL (source de vérité), Redis n'étant qu'un cache accélérateur.

---

# 9. OBSERVABILITÉ

Renvoi vers [[15_DEVOPS_SPECIFICATION]] pour métriques, logs, traces, alertes.

Indicateur métier suivi en continu : nombre de secondes cumulées sans salle mondiale active (doit rester à zéro).

---

# 10. CONFORMITÉ ET AUDITABILITÉ

Toute action de modération, de publication externe et d'administration est historisée de façon immuable (voir [[04_DATABASE_SPECIFICATION]] — `audit_logs`, [[12_SECURITY_SPECIFICATION]]).

Export des données à la demande d'un utilisateur ou à des fins légales, traçable (voir [[10_STATE_MACHINES]] — agrégat `EXPORT`).

---

# OBJECTIF

Toute nouvelle fonctionnalité proposée doit être évaluée contre ce document avant validation : elle ne doit dégrader ni la disponibilité de la salle mondiale, ni la performance perçue, ni la vie privée des utilisateurs.
