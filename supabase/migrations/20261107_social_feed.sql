-- ============================================================================
-- Réseau social chrétien — étape 1 : profils, fil d'actualité, photos, « Amen »
-- Les publications de communauté existantes (table posts) deviennent aussi des publications
-- personnelles quand community_id est vide : un seul système, un seul fil.
--
-- Additif et idempotent : on relâche une contrainte (community_id peut être vide) et on ajoute
-- trois tables isolées. Aucune donnée existante n'est modifiée. Sans ce fichier, les pages de
-- communauté continuent de fonctionner ; seuls le fil personnel, les photos et « Amen » attendent.
-- ============================================================================

-- Une publication personnelle n'appartient à aucune communauté.
alter table posts alter column community_id drop not null;

create index if not exists posts_feed_idx on posts (created_at desc) where deleted_at is null;

-- Jusqu'à 4 photos par publication, dans l'ordre choisi.
create table if not exists post_photos (
  post_id uuid not null references posts (id) on delete cascade,
  file_id uuid not null references files (id) on delete cascade,
  position smallint not null,
  primary key (post_id, position),
  constraint post_photos_position_check check (position between 0 and 3)
);

create index if not exists post_photos_file_idx on post_photos (file_id);
alter table post_photos enable row level security;

-- « Amen » : un par personne et par publication.
create table if not exists post_amens (
  post_id uuid not null references posts (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_amens_user_idx on post_amens (user_id);
alter table post_amens enable row level security;

-- Profil public : ce que le membre choisit de montrer. Jamais l'e-mail ni le téléphone.
create table if not exists user_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  bio text,
  church_name text,
  city text,
  updated_at timestamptz not null default now(),
  constraint user_profiles_bio_check check (bio is null or char_length(bio) <= 500),
  constraint user_profiles_church_check check (church_name is null or char_length(church_name) <= 120),
  constraint user_profiles_city_check check (city is null or char_length(city) <= 80)
);

alter table user_profiles enable row level security;
