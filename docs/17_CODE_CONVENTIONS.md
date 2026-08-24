# 17_CODE_CONVENTIONS.md

# CODE CONVENTIONS

## Objectif

Uniformiser tout le code du projet.

---

# LANGAGE

TypeScript Strict

Dart Strict

---

# NOMMAGE

Classes

PascalCase

Interfaces

PascalCase

Enums

PascalCase

Méthodes

camelCase

Variables

camelCase

Constantes

UPPER_SNAKE_CASE

Fichiers

kebab-case

---

# DOSSIERS

feature/

controllers/

services/

repositories/

entities/

dto/

events/

interfaces/

tests/

---

# IMPORTS

Node

↓

Externes

↓

Internes

↓

Relatifs

---

# COMMENTAIRES

TSDoc obligatoire

Méthodes publiques documentées

Aucune documentation obsolète

---

# FONCTIONS

Petites

Lisibles

Responsabilité unique

---

# CLASSES

Responsabilité unique

Faible couplage

Forte cohésion

---

# CONTROLLERS

Uniquement :

Validation

Appel Service

Retour ApiResponse

Jamais de logique métier.

---

# SERVICES

Orchestration

Appels Domain

Événements

Transactions

---

# REPOSITORIES

Accès données uniquement.

Jamais de logique métier.

---

# DTO

Validation

Transformation

Documentation Swagger

---

# TESTS

Même structure que le code.

Nommage cohérent.

---

# FORMATAGE

Prettier

ESLint

Convention Commits

---

# OBJECTIF

Quel que soit le développeur ou l'IA, le code doit sembler avoir été écrit par une seule équipe.
