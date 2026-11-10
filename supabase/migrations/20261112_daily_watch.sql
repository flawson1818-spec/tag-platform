-- ============================================================================
-- La veille du jour : intention de prière mondiale et Flambeau de la journée
-- Cahier des charges unifié §5.2 et §5.3 (repris du pilote V1).
--   world_prayer_intentions : une intention collective par jour (titre, texte, verset).
--   flambeau_assignments    : le Gardien du Flambeau de chaque jour, sa liste de veille et
--                             son mot d'encouragement.
-- Les jours sont des dates locales (fuseau de la salle mondiale, PRAYER_TIMEZONE).
--
-- Additif et idempotent. Sans ce fichier, l'accueil n'affiche simplement ni intention ni Flambeau.
-- ============================================================================

create table if not exists world_prayer_intentions (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  title text not null,
  description text,
  bible_reference text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_prayer_intentions_title_check check (char_length(title) between 1 and 160),
  constraint world_prayer_intentions_description_check check (description is null or char_length(description) <= 2000),
  constraint world_prayer_intentions_reference_check check (bible_reference is null or char_length(bible_reference) <= 300)
);
alter table world_prayer_intentions enable row level security;

create table if not exists flambeau_assignments (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  guardian_id uuid not null references users (id) on delete cascade,
  checklist jsonb not null default '[]'::jsonb,
  encouragement text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flambeau_assignments_encouragement_check check (encouragement is null or char_length(encouragement) <= 1000)
);
create index if not exists flambeau_assignments_guardian_idx on flambeau_assignments (guardian_id);
alter table flambeau_assignments enable row level security;
