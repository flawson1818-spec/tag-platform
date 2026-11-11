-- ============================================================================
-- Louange entre deux temps de prière (salle de prière)
-- Liens YouTube ou Spotify joués pendant le court temps de louange qui sépare deux sections
-- de prière ; chaque louange prend le lien suivant. Additif et idempotent. Sans ce fichier,
-- la louange a lieu quand même, sans musique automatique (boutons YouTube / Spotify).
-- ============================================================================

alter table prayer_programs add column if not exists worship_links text[] not null default '{}';
