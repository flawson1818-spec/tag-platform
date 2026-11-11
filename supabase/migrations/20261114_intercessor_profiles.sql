-- ============================================================================
-- Profil opérationnel des intercesseurs (cahier des charges unifié §5.5, pilote V8)
-- Disponibilité, sujets de prédilection, nombre maximum de demandes portées en même temps.
-- Sert à recommander des intercesseurs quand l'administration confie une demande ;
-- l'administrateur décide toujours (aucune assignation automatique).
--
-- Additif et idempotent. Sans ce fichier, chacun est considéré disponible, sans sujet
-- particulier, avec une capacité de 5 demandes.
-- ============================================================================

create table if not exists intercessor_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  availability text not null default 'AVAILABLE',
  prayer_skills text[] not null default '{}',
  max_active integer not null default 5,
  updated_at timestamptz not null default now(),
  constraint intercessor_profiles_availability_check check (availability in ('AVAILABLE', 'BUSY', 'OFFLINE')),
  constraint intercessor_profiles_max_active_check check (max_active between 1 and 50),
  constraint intercessor_profiles_skills_check check (cardinality(prayer_skills) <= 12)
);
alter table intercessor_profiles enable row level security;
