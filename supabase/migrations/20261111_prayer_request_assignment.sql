-- ============================================================================
-- Demandes de prière : seul l'administrateur reçoit, voit et assigne
-- Le membre dépose sa demande et suit son statut ; l'équipe d'administration voit toutes les
-- demandes et confie chacune à un intercesseur, qui la voit dans son espace.
--
-- Additif et idempotent : deux colonnes, un index. Sans ce fichier, l'assignation répond
-- « pas encore activée » ; le reste fonctionne.
-- ============================================================================

alter table prayer_requests add column if not exists assigned_to uuid references users (id) on delete set null;
alter table prayer_requests add column if not exists assigned_at timestamptz;

create index if not exists prayer_requests_assigned_to_idx on prayer_requests (assigned_to)
  where deleted_at is null;
