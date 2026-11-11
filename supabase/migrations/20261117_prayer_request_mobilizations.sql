-- ============================================================================
-- Mobilisation d'un groupe sur une demande de prière (cahier des charges unifié §5.6)
-- L'administration confie une demande à une église, une cellule, une équipe : invité →
-- accepté / décliné → terminé. Additif et idempotent ; sans ce fichier, rien ne change.
-- ============================================================================

create table if not exists prayer_request_mobilizations (
  id uuid primary key default gen_random_uuid(),
  prayer_request_id uuid not null references prayer_requests (id) on delete cascade,
  community_id uuid not null references communities (id) on delete cascade,
  status text not null default 'INVITED',
  note text,
  invited_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_request_mobilizations_status_check check (status in ('INVITED', 'ACCEPTED', 'DECLINED', 'DONE')),
  constraint prayer_request_mobilizations_unique unique (prayer_request_id, community_id)
);
create index if not exists prayer_request_mobilizations_community_idx on prayer_request_mobilizations (community_id, created_at desc);
alter table prayer_request_mobilizations enable row level security;
