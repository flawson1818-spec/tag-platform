-- ============================================================================
-- Réseau social — vidéos : un membre peut publier une vidéo (jusqu'à 50 Mo) dans le fil
-- ou dans un groupe. Une vidéo par publication ; elle est stockée comme les photos, dans le
-- bucket privé « tag-files », et lue par lien signé.
--
-- Additif et idempotent. Sans ce fichier, l'onglet Vidéos reste vide et l'envoi répond
-- « pas encore activé ». À lancer dans l'éditeur SQL de Supabase.
-- ============================================================================

create table if not exists post_videos (
  post_id uuid primary key references posts (id) on delete cascade,
  file_id uuid not null references files (id),
  created_at timestamptz not null default now()
);

create index if not exists post_videos_file_idx on post_videos (file_id);
alter table post_videos enable row level security;

-- Le bucket accepte maintenant des fichiers jusqu'à 50 Mo (limite des vidéos).
update storage.buckets set file_size_limit = 52428800 where id = 'tag-files' and coalesce(file_size_limit, 0) < 52428800;
