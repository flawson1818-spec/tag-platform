-- ============================================================================
-- Candidatures (cahier des charges unifié §5.4, repris du pilote V1)
--   INTERCESSOR : un membre demande à devenir intercesseur ; validé → rôle Intercesseur.
--   COMMUNITY   : un membre inscrit son église ou son groupe ; validé → la communauté est
--                 créée, le candidat en devient le responsable.
-- Rien n'est publié avant la décision de l'administration.
--
-- Additif et idempotent. Sans ce fichier, la page Candidatures répond « pas encore activée ».
-- ============================================================================

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  applicant_id uuid not null references users (id) on delete cascade,
  status text not null default 'PENDING',
  payload jsonb not null default '{}'::jsonb,
  review_note text,
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  community_id uuid references communities (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint applications_kind_check check (kind in ('INTERCESSOR', 'COMMUNITY')),
  constraint applications_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  constraint applications_note_check check (review_note is null or char_length(review_note) <= 1000)
);

-- One pending intercessor application per member at a time.
create unique index if not exists applications_one_pending_intercessor
  on applications (applicant_id) where kind = 'INTERCESSOR' and status = 'PENDING';
create index if not exists applications_status_idx on applications (status, created_at desc);
alter table applications enable row level security;
