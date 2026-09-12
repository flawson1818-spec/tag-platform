-- Tag platform schema for Supabase (Postgres).
-- Run this in the Supabase SQL editor, or via the Supabase MCP `execute_sql` tool.

create extension if not exists pgcrypto;

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists item_tags (
  item_id uuid not null references items (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (item_id, tag_id)
);

create index if not exists item_tags_tag_id_idx on item_tags (tag_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = '';

drop trigger if exists tags_set_updated_at on tags;
create trigger tags_set_updated_at
  before update on tags
  for each row execute function set_updated_at();

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- The API server connects with the service role key, which bypasses RLS,
-- so these tables work normally for it. RLS is enabled with no policies so
-- the public anon/authenticated roles (used by Supabase's auto REST API)
-- get zero access by default -- only the service role can reach these rows.
alter table tags enable row level security;
alter table items enable row level security;
alter table item_tags enable row level security;

-- ============================================================================
-- IDENTITY DOMAIN
-- See docs/04_DATABASE_SPECIFICATION.md section 2 and docs/06_RBAC_SPECIFICATION.md.
-- ============================================================================

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text,
  password_hash text not null,
  display_name text not null,
  avatar_file_id uuid,
  locale text not null default 'fr',
  timezone text not null default 'UTC',
  status text not null default 'ACTIVE',
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  constraint users_status_check check (status in ('ACTIVE', 'LOCKED', 'SUSPENDED', 'DELETED'))
);

create index if not exists users_status_idx on users (status);
create index if not exists users_created_at_idx on users (created_at);

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

drop trigger if exists roles_set_updated_at on roles;
create trigger roles_set_updated_at
  before update on roles
  for each row execute function set_updated_at();

create table if not exists role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  community_id uuid,
  created_at timestamptz not null default now(),
  constraint role_assignments_unique unique (user_id, role_id, community_id)
);

create index if not exists role_assignments_user_community_idx on role_assignments (user_id, community_id);
create index if not exists role_assignments_role_id_idx on role_assignments (role_id);
create index if not exists role_permissions_permission_id_idx on role_permissions (permission_id);

-- Hashed refresh tokens (rotation + revocation, see docs/12_SECURITY_SPECIFICATION.md).
create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_token_hash text,
  created_at timestamptz not null default now()
);

create index if not exists refresh_tokens_user_idx on refresh_tokens (user_id);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx on password_reset_tokens (user_id);

alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table users enable row level security;
alter table role_assignments enable row level security;
alter table refresh_tokens enable row level security;
alter table password_reset_tokens enable row level security;

-- Role hierarchy seed, see docs/06_RBAC_SPECIFICATION.md section 2.
insert into roles (code, label) values
  ('VISITEUR', 'Visiteur'),
  ('NOUVEAU_CONVERTI', 'Nouveau Converti'),
  ('INTERCESSEUR', 'Intercesseur'),
  ('MODERATEUR', 'Modérateur'),
  ('RESPONSABLE_EQUIPE', 'Responsable Équipe'),
  ('PASTEUR', 'Pasteur'),
  ('ADMINISTRATEUR', 'Administrateur'),
  ('SUPER_ADMINISTRATEUR', 'Super Administrateur')
on conflict (code) do nothing;

-- Permission matrix seed, see docs/06_RBAC_SPECIFICATION.md section 3.
insert into permissions (code) values
  ('room.view'),
  ('prayer_request.create'),
  ('prayer_request.create_public'),
  ('testimony.create'),
  ('testimony.approve'),
  ('prayer_program.create'),
  ('prayer_request.promote'),
  ('room.moderate'),
  ('community.manage_members'),
  ('community.recurring_schedule'),
  ('moderation.exclude_permanent'),
  ('content.publish_official'),
  ('user.manage'),
  ('role.assign'),
  ('system.configure'),
  ('billing.manage')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from (values
  ('room.view', array['VISITEUR', 'NOUVEAU_CONVERTI', 'INTERCESSEUR', 'MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('prayer_request.create', array['VISITEUR', 'NOUVEAU_CONVERTI', 'INTERCESSEUR', 'MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('prayer_request.create_public', array['NOUVEAU_CONVERTI', 'INTERCESSEUR', 'MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('testimony.create', array['INTERCESSEUR', 'MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('testimony.approve', array['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('prayer_program.create', array['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('prayer_request.promote', array['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('room.moderate', array['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('community.manage_members', array['RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('community.recurring_schedule', array['RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('moderation.exclude_permanent', array['PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('content.publish_official', array['PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('user.manage', array['ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('role.assign', array['ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR']),
  ('system.configure', array['SUPER_ADMINISTRATEUR']),
  ('billing.manage', array['SUPER_ADMINISTRATEUR'])
) as matrix(permission_code, role_codes)
join permissions p on p.code = matrix.permission_code
join roles r on r.code = any(matrix.role_codes)
on conflict (role_id, permission_id) do nothing;

-- ============================================================================
-- COMMUNITY DOMAIN
-- See docs/04_DATABASE_SPECIFICATION.md section 3 and docs/01_FUNCTIONAL_SPECIFICATION.md section 8.
-- ============================================================================

create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text not null,
  parent_id uuid references communities (id) on delete set null,
  language text not null default 'fr',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint communities_type_check check (type in ('GROUP', 'TEAM', 'CELL', 'COUNTRY', 'CITY', 'CHURCH', 'MINISTRY'))
);

create index if not exists communities_type_idx on communities (type);
create index if not exists communities_parent_id_idx on communities (parent_id);

drop trigger if exists communities_set_updated_at on communities;
create trigger communities_set_updated_at
  before update on communities
  for each row execute function set_updated_at();

create table if not exists community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  internal_role text,
  joined_at timestamptz not null default now(),
  constraint community_members_unique unique (community_id, user_id)
);

create index if not exists community_members_user_id_idx on community_members (user_id);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  content text not null,
  status text not null default 'PUBLISHED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint posts_status_check check (status in ('DRAFT', 'PUBLISHED', 'EDITED', 'ARCHIVED'))
);

create index if not exists posts_community_created_idx on posts (community_id, created_at desc);
create index if not exists posts_author_id_idx on posts (author_id);

drop trigger if exists posts_set_updated_at on posts;
create trigger posts_set_updated_at
  before update on posts
  for each row execute function set_updated_at();

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  content text not null,
  status text not null default 'CREATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint comments_status_check check (status in ('CREATED', 'EDITED', 'DELETED'))
);

create index if not exists comments_post_created_idx on comments (post_id, created_at);
create index if not exists comments_author_id_idx on comments (author_id);

drop trigger if exists comments_set_updated_at on comments;
create trigger comments_set_updated_at
  before update on comments
  for each row execute function set_updated_at();

alter table communities enable row level security;
alter table community_members enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;

-- New permission for community entity management (create/update/delete), distinct from
-- community.manage_members. See docs/06_RBAC_SPECIFICATION.md section 3 note: the
-- permissions table is the source of truth and is expected to grow with new features.
insert into permissions (code) values ('community.manage')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = 'community.manage'
on conflict (role_id, permission_id) do nothing;

-- ============================================================================
-- PRAYER DOMAIN
-- See docs/04_DATABASE_SPECIFICATION.md section 4 and docs/01_FUNCTIONAL_SPECIFICATION.md
-- sections 2, 3, 5. community_id NULL = official world room / global program.
-- ============================================================================

create table if not exists prayer_programs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities (id) on delete cascade,
  title text not null,
  recurrence_rule text,
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint prayer_programs_status_check check (status in ('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'))
);

create index if not exists prayer_programs_community_idx on prayer_programs (community_id);
create index if not exists prayer_programs_status_idx on prayer_programs (status);

drop trigger if exists prayer_programs_set_updated_at on prayer_programs;
create trigger prayer_programs_set_updated_at
  before update on prayer_programs
  for each row execute function set_updated_at();

create table if not exists prayer_slots (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references prayer_programs (id) on delete cascade,
  order_index integer not null,
  title text not null,
  category text not null default 'Autre',
  importance text not null default 'Normal',
  start_at timestamptz not null,
  end_at timestamptz not null,
  guided_text text,
  bible_references jsonb not null default '[]'::jsonb,
  recommended_songs jsonb not null default '[]'::jsonb,
  leader_user_id uuid references users (id) on delete set null,
  status text not null default 'SCHEDULED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_slots_category_check check (category in (
    'Famille', 'Finances', 'Santé', 'Guérison', 'Évangélisation', 'Nation',
    'Jeunesse', 'Mariage', 'Église', 'Mission', 'Urgence', 'Autre'
  )),
  constraint prayer_slots_importance_check check (importance in ('Normal', 'Important', 'Urgent')),
  constraint prayer_slots_status_check check (status in ('CREATED', 'SCHEDULED', 'OPEN', 'RUNNING', 'FINISHED', 'ARCHIVED')),
  constraint prayer_slots_time_check check (end_at > start_at)
);

create index if not exists prayer_slots_program_order_idx on prayer_slots (program_id, order_index);
create index if not exists prayer_slots_status_end_idx on prayer_slots (status, end_at);

drop trigger if exists prayer_slots_set_updated_at on prayer_slots;
create trigger prayer_slots_set_updated_at
  before update on prayer_slots
  for each row execute function set_updated_at();

create table if not exists prayer_slot_attendance (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references prayer_slots (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint prayer_slot_attendance_unique unique (slot_id, user_id)
);

create index if not exists prayer_slot_attendance_user_joined_idx on prayer_slot_attendance (user_id, joined_at);

create table if not exists prayer_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references users (id) on delete set null,
  category text not null default 'Autre',
  description text not null,
  photo_file_id uuid,
  attachment_file_id uuid,
  confidentiality text not null default 'ANONYMOUS',
  status text not null default 'NEW',
  promoted_slot_id uuid references prayer_slots (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint prayer_requests_category_check check (category in (
    'Maladie', 'Mariage', 'Emploi', 'Études', 'Visa', 'Enfant', 'Délivrance', 'Famille', 'Autre'
  )),
  constraint prayer_requests_confidentiality_check check (confidentiality in ('ANONYMOUS', 'PRIVATE', 'PUBLIC')),
  constraint prayer_requests_status_check check (status in (
    'DRAFT', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED', 'ARCHIVED', 'RESTORED'
  ))
);

create index if not exists prayer_requests_status_category_idx on prayer_requests (status, category);
create index if not exists prayer_requests_created_at_idx on prayer_requests (created_at);

drop trigger if exists prayer_requests_set_updated_at on prayer_requests;
create trigger prayer_requests_set_updated_at
  before update on prayer_requests
  for each row execute function set_updated_at();

alter table prayer_programs enable row level security;
alter table prayer_slots enable row level security;
alter table prayer_slot_attendance enable row level security;
alter table prayer_requests enable row level security;

-- Status-transition permission for prayer requests, distinct from prayer_request.promote
-- (promotion creates a PrayerSlot; this covers the NEW/ASSIGNED/IN_PROGRESS/WAITING/ANSWERED/
-- ARCHIVED lifecycle). See docs/06_RBAC_SPECIFICATION.md section 3 note on extending permissions.
insert into permissions (code) values ('prayer_request.manage_status')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = 'prayer_request.manage_status'
on conflict (role_id, permission_id) do nothing;

-- ============================================================================
-- PRAYER DOMAIN (continued) — testimonies, campaigns
-- See docs/04_DATABASE_SPECIFICATION.md section 4 and docs/01_FUNCTIONAL_SPECIFICATION.md
-- section 6. Both reuse existing seeded permissions (testimony.create, testimony.approve) —
-- no new permission codes needed here.
-- ============================================================================

create table if not exists testimonies (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users (id) on delete cascade,
  related_request_id uuid references prayer_requests (id) on delete set null,
  media_type text not null default 'TEXT',
  content text,
  file_id uuid,
  status text not null default 'DRAFT',
  moderated_by uuid references users (id) on delete set null,
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint testimonies_media_type_check check (media_type in ('TEXT', 'AUDIO', 'VIDEO', 'PHOTO')),
  constraint testimonies_status_check check (status in ('DRAFT', 'PUBLISHED', 'EDITED', 'ARCHIVED')),
  constraint testimonies_content_or_file_check check (content is not null or file_id is not null)
);

create index if not exists testimonies_status_idx on testimonies (status);
create index if not exists testimonies_created_at_idx on testimonies (created_at);
create index if not exists testimonies_author_id_idx on testimonies (author_id);

drop trigger if exists testimonies_set_updated_at on testimonies;
create trigger testimonies_set_updated_at
  before update on testimonies
  for each row execute function set_updated_at();

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities (id) on delete cascade,
  title text not null,
  status text not null default 'DRAFT',
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint campaigns_status_check check (status in ('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'))
);

create index if not exists campaigns_community_idx on campaigns (community_id);
create index if not exists campaigns_status_idx on campaigns (status);

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

alter table testimonies enable row level security;
alter table campaigns enable row level security;

-- Campaigns aren't in the docs/06_RBAC_SPECIFICATION.md matrix at all; campaign.manage is
-- added following the same "grow the permissions table" allowance used for community.manage
-- and prayer_request.manage_status. Granted at the same level as community.manage since a
-- campaign groups multiple programs (docs/01_FUNCTIONAL_SPECIFICATION.md section 1.2 attributes
-- multi-program/community-wide planning to Responsable d'Équipe+).
insert into permissions (code) values ('campaign.manage')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = 'campaign.manage'
on conflict (role_id, permission_id) do nothing;

-- ============================================================================
-- COMMUNICATION DOMAIN
-- See docs/04_DATABASE_SPECIFICATION.md section 6 and docs/01_FUNCTIONAL_SPECIFICATION.md
-- section 11. MVP scope per docs/09_ROADMAP_AND_BACKLOG.md: "notifications email uniquement" —
-- push and WhatsApp are V1, not built here.
-- ============================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'DELIVERED',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_status_check check (status in ('CREATED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'ARCHIVED'))
);

create index if not exists notifications_user_status_created_idx on notifications (user_id, status, created_at);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'SENT',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint emails_status_check check (status in ('CREATED', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED'))
);

create index if not exists emails_user_id_idx on emails (user_id);
create index if not exists emails_status_idx on emails (status);

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  to_phone text not null,
  body text not null,
  status text not null default 'CREATED',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_messages_status_check check (status in ('CREATED', 'QUEUED', 'SENDING', 'DELIVERED', 'READ', 'FAILED'))
);

create index if not exists whatsapp_messages_user_id_idx on whatsapp_messages (user_id);
create index if not exists whatsapp_messages_status_idx on whatsapp_messages (status);

-- A user's registered device — required before a push notification can be addressed to them.
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token text not null,
  platform text not null default 'UNKNOWN',
  created_at timestamptz not null default now(),
  constraint push_tokens_user_token_unique unique (user_id, token),
  constraint push_tokens_platform_check check (platform in ('IOS', 'ANDROID', 'WEB', 'UNKNOWN'))
);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

create table if not exists push_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  push_token_id uuid references push_tokens (id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'CREATED',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint push_notifications_status_check check (status in ('CREATED', 'QUEUED', 'SENDING', 'DELIVERED', 'FAILED'))
);

create index if not exists push_notifications_user_id_idx on push_notifications (user_id);
create index if not exists push_notifications_status_idx on push_notifications (status);

create table if not exists social_publications (
  id uuid primary key default gen_random_uuid(),
  testimony_id uuid references testimonies (id) on delete set null,
  channel text not null,
  draft_content text not null,
  status text not null default 'DRAFT',
  approved_by uuid references users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_publications_channel_check check (channel in (
    'Facebook', 'Instagram', 'TikTok', 'YouTube', 'X', 'LinkedIn', 'Threads'
  )),
  constraint social_publications_status_check check (status in (
    'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'
  ))
);

create index if not exists social_publications_status_idx on social_publications (status);
create index if not exists social_publications_testimony_idx on social_publications (testimony_id);

drop trigger if exists social_publications_set_updated_at on social_publications;
create trigger social_publications_set_updated_at
  before update on social_publications
  for each row execute function set_updated_at();

alter table notifications enable row level security;
alter table emails enable row level security;
alter table social_publications enable row level security;

-- docs/02_AI_AGENTS_SPECIFICATION.md section 6: "un Administrateur active explicitement le mode
-- 'auto-publish' pour un canal ... donné" — one row per channel; absent = auto-publish off.
create table if not exists social_publication_channel_settings (
  channel text primary key,
  auto_publish boolean not null default false,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint social_publication_channel_settings_channel_check check (channel in (
    'Facebook', 'Instagram', 'TikTok', 'YouTube', 'X', 'LinkedIn', 'Threads'
  ))
);

drop trigger if exists social_publication_channel_settings_set_updated_at on social_publication_channel_settings;
create trigger social_publication_channel_settings_set_updated_at
  before update on social_publication_channel_settings
  for each row execute function set_updated_at();

alter table social_publication_channel_settings enable row level security;

-- Not in the docs/06_RBAC_SPECIFICATION.md matrix (the matrix is an explicit "extrait
-- représentatif", section 3 note), but named in docs/05_API_SPECIFICATION.md section 6 as
-- "Responsable+" for approving social publications, and docs/06_RBAC_SPECIFICATION.md section 5
-- confirms social_publication.draft / .publish are real codes (granted to the IA Communication
-- system role). This covers the human approve/reject counterpart.
insert into permissions (code) values ('social_publication.approve')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = 'social_publication.approve'
on conflict (role_id, permission_id) do nothing;

-- ============================================================================
-- STORAGE DOMAIN
-- See docs/04_DATABASE_SPECIFICATION.md section 7 and docs/10_STATE_MACHINES.md — FILE.
-- Backed by Supabase Storage (bucket "tag-files", created separately) rather than the
-- MinIO/S3 setup in docs/03_ARCHITECTURE_SPECIFICATION.md — same presigned-upload model,
-- no separate object-storage service to stand up given the project already runs on Supabase.
-- ============================================================================

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete cascade,
  bucket_key text not null unique,
  mime_type text not null,
  size_bytes bigint,
  status text not null default 'UPLOADING',
  scan_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint files_status_check check (status in (
    'UPLOADING', 'UPLOADED', 'SCANNED', 'AVAILABLE', 'ARCHIVED', 'DELETED'
  ))
);

create index if not exists files_owner_id_idx on files (owner_id);
create index if not exists files_status_idx on files (status);

drop trigger if exists files_set_updated_at on files;
create trigger files_set_updated_at
  before update on files
  for each row execute function set_updated_at();

alter table files enable row level security;

-- ============================================================================
-- ANALYTICS / ADMINISTRATION DOMAINS
-- See docs/04_DATABASE_SPECIFICATION.md section 8 and docs/10_STATE_MACHINES.md — EXPORT,
-- BACKUP. audit_logs is append-only per docs/04_DATABASE_SPECIFICATION.md section 8 ("aucune
-- mise à jour ni suppression autorisée"). A blanket DO INSTEAD NOTHING rule was tried here
-- first but broke actor_id's own ON DELETE SET NULL cascade (Postgres runs that as an UPDATE
-- under the hood, which the rule silently swallowed, corrupting the FK check) — append-only is
-- enforced at the application layer instead (AuditLogService only ever inserts/selects),
-- consistent with the rest of this schema already trusting the service-role connection.
-- ============================================================================

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  trace_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_created_idx on audit_logs (actor_id, created_at);

alter table audit_logs enable row level security;

create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references users (id) on delete cascade,
  scope text not null,
  status text not null default 'REQUESTED',
  download_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exports_status_check check (status in ('REQUESTED', 'GENERATING', 'READY', 'DOWNLOADED', 'EXPIRED'))
);

create index if not exists exports_requested_by_idx on exports (requested_by);

drop trigger if exists exports_set_updated_at on exports;
create trigger exports_set_updated_at
  before update on exports
  for each row execute function set_updated_at();

alter table exports enable row level security;

create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'CREATED',
  note text,
  requested_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backups_status_check check (status in ('CREATED', 'RUNNING', 'COMPLETED', 'VERIFIED', 'ARCHIVED'))
);

drop trigger if exists backups_set_updated_at on backups;
create trigger backups_set_updated_at
  before update on backups
  for each row execute function set_updated_at();

alter table backups enable row level security;

-- New permissions: none of these are in the docs/06_RBAC_SPECIFICATION.md matrix extract,
-- following the same documented allowance used throughout (section 3 note) to grow the
-- permissions table as features are built. Levels taken from docs/01_FUNCTIONAL_SPECIFICATION.md
-- section 1.2 (Responsable/Admin capability summaries) and docs/05_API_SPECIFICATION.md role
-- comments (sections 9-10).
insert into permissions (code) values
  ('analytics.view_dashboard'),
  ('analytics.export'),
  ('audit_log.view'),
  ('system.operate')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = 'analytics.view_dashboard'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = any(array['analytics.export', 'audit_log.view', 'system.operate'])
on conflict (role_id, permission_id) do nothing;

-- Real presence tracking backing peak-hours analytics (prayer_slot_attendance existed but was
-- never written to before this pass — the realtime gateway now upserts a row on room:join).
create index if not exists prayer_slot_attendance_joined_idx on prayer_slot_attendance (joined_at);

-- ============================================================================
-- ANALYTICS AGGREGATE FUNCTIONS
-- Real SQL aggregation (not fetch-everything-and-group-in-JS) for docs/05_API_SPECIFICATION.md
-- section 9's dashboard: "heures fortes, thèmes, croissance, rétention". Retention is
-- approximated from refresh_tokens activity (login/refresh always writes a row) since there is
-- no separate session/login-event log table in docs/04_DATABASE_SPECIFICATION.md.
-- ============================================================================

create or replace function public.analytics_top_categories(limit_count int default 10)
returns table(category text, request_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select category, count(*) as request_count
  from public.prayer_requests
  where deleted_at is null
  group by category
  order by request_count desc
  limit limit_count;
$$;

create or replace function public.analytics_growth(days int default 30)
returns table(day date, new_users bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('day', created_at)::date as day, count(*) as new_users
  from public.users
  where created_at >= now() - make_interval(days => days)
  group by day
  order by day;
$$;

create or replace function public.analytics_peak_hours()
returns table(hour_of_day int, attendance_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select extract(hour from joined_at)::int as hour_of_day, count(*) as attendance_count
  from public.prayer_slot_attendance
  group by hour_of_day
  order by hour_of_day;
$$;

create or replace function public.analytics_retention()
returns table(period text, eligible_users bigint, retained_users bigint, retention_rate numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      u.id,
      u.created_at,
      exists(
        select 1 from public.refresh_tokens rt
        where rt.user_id = u.id and rt.created_at >= u.created_at + interval '1 day'
      ) as d1,
      exists(
        select 1 from public.refresh_tokens rt
        where rt.user_id = u.id and rt.created_at >= u.created_at + interval '7 day'
      ) as d7,
      exists(
        select 1 from public.refresh_tokens rt
        where rt.user_id = u.id and rt.created_at >= u.created_at + interval '30 day'
      ) as d30
    from public.users u
    where u.deleted_at is null
  )
  select
    'D1',
    count(*) filter (where created_at <= now() - interval '1 day'),
    count(*) filter (where d1 and created_at <= now() - interval '1 day'),
    round(100.0 * count(*) filter (where d1 and created_at <= now() - interval '1 day')
      / nullif(count(*) filter (where created_at <= now() - interval '1 day'), 0), 1)
  from base
  union all
  select
    'D7',
    count(*) filter (where created_at <= now() - interval '7 day'),
    count(*) filter (where d7 and created_at <= now() - interval '7 day'),
    round(100.0 * count(*) filter (where d7 and created_at <= now() - interval '7 day')
      / nullif(count(*) filter (where created_at <= now() - interval '7 day'), 0), 1)
  from base
  union all
  select
    'D30',
    count(*) filter (where created_at <= now() - interval '30 day'),
    count(*) filter (where d30 and created_at <= now() - interval '30 day'),
    round(100.0 * count(*) filter (where d30 and created_at <= now() - interval '30 day')
      / nullif(count(*) filter (where created_at <= now() - interval '30 day'), 0), 1)
  from base;
$$;

-- MFA (TOTP): the base32 secret backing users.mfa_enabled. Nullable — only set once a user
-- completes setup. Stored in plaintext like every other server-role-only column in this schema
-- (no column ever exposed to a public/anon key); a KMS-encrypted-at-rest column would be a
-- reasonable hardening step for a true production rollout, out of scope for this MVP pass.
alter table users add column if not exists mfa_secret text;

-- ============================================================================
-- EVENTS DOMAIN
-- See docs/01_FUNCTIONAL_SPECIFICATION.md and docs/07_UX_UI_SPECIFICATION.md section 7
-- (veillées, jeûnes, croisades, études bibliques...). Reuses the prayer-session state machine
-- for Event.status (docs/10_STATE_MACHINES.md) rather than inventing a parallel one. This
-- domain was built and exercised against the live project directly; added here after the fact
-- so a fresh environment provisioned from this file gets the same tables.
-- ============================================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities (id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  scheduled_at timestamptz not null,
  status text not null default 'CREATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  constraint events_type_check check (type in (
    'VEILLEE', 'JEUNE', 'CROISADE', 'CONFERENCE', 'ETUDE_BIBLIQUE',
    'DEBAT_BIBLIQUE', 'FORMATION', 'INTERCESSION_SPECIALE'
  )),
  constraint events_status_check check (status in ('CREATED', 'SCHEDULED', 'OPEN', 'RUNNING', 'FINISHED', 'ARCHIVED'))
);

create index if not exists events_community_idx on events (community_id);
create index if not exists events_scheduled_at_idx on events (scheduled_at);

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

create table if not exists event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role_in_event text not null default 'ATTENDEE',
  hand_raised_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_participants_role_check check (role_in_event in ('ATTENDEE', 'SPEAKER', 'MODERATOR')),
  constraint event_participants_unique unique (event_id, user_id)
);

create index if not exists event_participants_user_idx on event_participants (user_id);

alter table events enable row level security;
alter table event_participants enable row level security;

insert into permissions (code) values ('event.manage')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from permissions p
join roles r on r.code = any(array['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'])
where p.code = 'event.manage'
on conflict (role_id, permission_id) do nothing;

-- docs/07_UX_UI_SPECIFICATION.md §11: "préférences par type de notification". Keyed by
-- notification `type` (TESTIMONY_PUBLISHED, ...) -> boolean; a missing key means enabled
-- (opt-out model, so existing users keep receiving everything until they explicitly turn a
-- type off). A jsonb column rather than one boolean column per type since the type set is
-- expected to grow with new notification triggers.
alter table users add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- docs/07_UX_UI_SPECIFICATION.md §9: "Communauté à adhésion validée par un Responsable : état
-- 'en attente' affiché explicitement". join_policy is application-validated (IsIn), not a DB
-- check constraint, matching the plain-column style already used for the other late additions
-- in this file. Existing community_members rows default to ACTIVE (they were already full
-- members before this column existed).
alter table communities add column if not exists join_policy text not null default 'OPEN';
alter table community_members add column if not exists status text not null default 'ACTIVE';

-- docs/12_SECURITY_SPECIFICATION.md MFA section lists "Recovery Codes" alongside TOTP/Trusted
-- Devices — TOTP existed but losing the authenticator device meant permanent lockout, no way
-- back in. A brand-new, isolated table only touched by the new enableMfa()/recovery-challenge
-- code paths (unlike communities.join_policy above, nothing existing reads this).
create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx on mfa_recovery_codes (user_id);

alter table mfa_recovery_codes enable row level security;

-- docs/02_AI_AGENTS_SPECIFICATION.md §5 (IA Modératrice) / docs/06_RBAC_SPECIFICATION.md §5
-- ("user.mute_temporary", "room.moderate: mute, avertissement") / docs/09_ROADMAP_AND_BACKLOG.md
-- §4 risk mitigation ("action réversible par défaut — mute temporaire, jamais exclusion"). A
-- brand-new, isolated table only touched by the new mute/unmute code paths in
-- PrayerRealtimeGateway — nothing existing reads it, same shape as mfa_recovery_codes above.
-- muted_by is null for an autonomous IA Modératrice mute (never without an immediate human
-- notification — see notifyAutoMute in the gateway) and the moderator's user id for a manual one.
create table if not exists user_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  community_id uuid references communities (id) on delete cascade,
  muted_until timestamptz not null,
  muted_by uuid references users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists user_mutes_user_id_idx on user_mutes (user_id, community_id);

alter table user_mutes enable row level security;
