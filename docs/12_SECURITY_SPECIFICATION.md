# 12_SECURITY_SPECIFICATION.md

# SECURITY SPECIFICATION

## Objectif

Garantir un niveau de sécurité Enterprise.

---

# AUTHENTIFICATION

JWT

Refresh Token

Rotation

Expiration

Révocation

Blacklist

---

# MFA

Email OTP

TOTP

SMS OTP

WhatsApp OTP

Recovery Codes

Trusted Devices

---

# PASSWORD POLICY

Minimum 8 caractères. Pas de règle de composition obligatoire (majuscule/minuscule/chiffre/caractère spécial) : TAG est une plateforme d'usage grand public, et ces règles sont une friction à l'inscription sans bénéfice de sécurité démontré (NIST 800-63B recommande la longueur plutôt que la composition depuis 2017).

Historique (dernier mots de passe non réutilisables)

Blacklist (mots de passe courants/compromis rejetés, y compris les variantes sans composition depuis ce changement)

Argon2id

MFA (TOTP/OTP) disponible en complément pour qui souhaite un niveau de protection plus élevé — voir section MFA.

---

# RBAC

Permissions atomiques.

Rôles configurables.

Policies.

Ownership.

---

# API SECURITY

HTTPS

Helmet

CORS

Rate Limit

Validation DTO

Sanitization

Content Security Policy

Trusted Origins

---

# DATA ENCRYPTION

TLS 1.3

AES-256

Secrets chiffrés

Tokens hachés

Mots de passe Argon2id

---

# OWASP

Protection contre :

Injection SQL

XSS

CSRF

SSRF

Broken Authentication

Broken Access Control

Security Misconfiguration

Sensitive Data Exposure

Logging Failures

Deserialization

---

# AUDIT

Toutes les opérations critiques sont historisées.

Création

Modification

Suppression

Connexion

Déconnexion

Export

Import

Administration

---

# LOGGING

Tous les logs contiennent :

Timestamp

TraceId

RequestId

UserId

IP

User Agent

Module

Action

Résultat

---

# MONITORING

Détection :

Brute Force

Connexion inhabituelle

Tentatives répétées

Élévation de privilège

Anomalies

---

# SECRET MANAGEMENT

Aucun secret dans Git.

Utiliser :

GitHub Secrets

Kubernetes Secrets

Vault compatible

Variables d'environnement

---

# CONFORMITÉ

Soft Delete

Traçabilité

Journalisation

Export des données

Droit à la restauration

Archivage

---

# TESTS DE SÉCURITÉ

SAST

DAST

Dependency Scan

Secret Scan

Container Scan

OWASP ZAP (prévu)

---

# INCIDENT RESPONSE

Détection

Notification

Isolation

Correction

Audit

Rapport

Post Mortem

---

# OBJECTIF

La sécurité doit être intégrée dès la conception.

Aucune fonctionnalité ne doit être développée sans tenir compte de cette spécification.
