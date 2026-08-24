# 10_STATE_MACHINES.md

# STATE MACHINES

## Objectif

Définir précisément le cycle de vie de chaque agrégat métier.

Une transition non décrite ici est interdite.

---

# USER

PENDING

↓

EMAIL_VERIFIED

↓

ACTIVE

↓

LOCKED

↓

ACTIVE

↓

SUSPENDED

↓

ACTIVE

↓

DELETED (Soft Delete)

---

Transitions autorisées

PENDING → EMAIL_VERIFIED

EMAIL_VERIFIED → ACTIVE

ACTIVE → LOCKED

LOCKED → ACTIVE

ACTIVE → SUSPENDED

SUSPENDED → ACTIVE

ACTIVE → DELETED

---

# PRAYER REQUEST

DRAFT

↓

NEW

↓

ASSIGNED

↓

IN_PROGRESS

↓

WAITING

↓

ANSWERED

↓

ARCHIVED

↓

RESTORED (optionnel)

---

Transitions interdites

ANSWERED → NEW

ARCHIVED → ASSIGNED

---

# CAMPAIGN

DRAFT

↓

PLANNED

↓

ACTIVE

↓

PAUSED

↓

ACTIVE

↓

COMPLETED

↓

ARCHIVED

---

# PRAYER SESSION

CREATED

↓

SCHEDULED

↓

OPEN

↓

RUNNING

↓

FINISHED

↓

ARCHIVED

---

# GROUP

CREATED

↓

ACTIVE

↓

LOCKED

↓

ACTIVE

↓

ARCHIVED

---

# POST

DRAFT

↓

PUBLISHED

↓

EDITED

↓

ARCHIVED

---

# COMMENT

CREATED

↓

EDITED

↓

DELETED (Soft)

---

# NOTIFICATION

CREATED

↓

QUEUED

↓

SENT

↓

DELIVERED

↓

READ

↓

ARCHIVED

---

# EMAIL

CREATED

↓

QUEUED

↓

SENDING

↓

SENT

↓

DELIVERED

↓

FAILED

---

# WHATSAPP

CREATED

↓

QUEUED

↓

SENDING

↓

DELIVERED

↓

READ

↓

FAILED

---

# FILE

UPLOADING

↓

UPLOADED

↓

SCANNED

↓

AVAILABLE

↓

ARCHIVED

↓

DELETED

---

# BACKUP

CREATED

↓

RUNNING

↓

COMPLETED

↓

VERIFIED

↓

ARCHIVED

---

# EXPORT

REQUESTED

↓

GENERATING

↓

READY

↓

DOWNLOADED

↓

EXPIRED

---

Toutes les transitions doivent produire :

- un Audit Log
- un Domain Event
- un horodatage
