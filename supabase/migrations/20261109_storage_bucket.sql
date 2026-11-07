-- ============================================================================
-- Espace de stockage des fichiers (photos du fil, avatars, documents, pièces jointes)
-- L'API dépose et lit les fichiers dans le bucket privé « tag-files » de Supabase Storage,
-- toujours au travers de liens signés à durée limitée. Ce script le crée s'il n'existe pas.
-- Idempotent ; à lancer dans l'éditeur SQL de Supabase (le schéma « storage » n'existe que là).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('tag-files', 'tag-files', false, 26214400)
on conflict (id) do nothing;
