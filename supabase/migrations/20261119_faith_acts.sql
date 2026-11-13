-- ============================================================================
-- Actes de foi (cahier des charges unifié §5.8)
-- Un membre enregistre un engagement, un jeûne, un don de temps, une veille de prière, une
-- sortie d'évangélisation ; les autres le soutiennent ; accompli, il peut devenir un témoignage.
-- Additif et idempotent.
-- ============================================================================

create table if not exists faith_acts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  description text,
  start_date date not null default current_date,
  end_date date,
  is_public boolean not null default true,
  status text not null default 'ACTIVE',
  fulfilled_at timestamptz,
  testimony_id uuid references testimonies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faith_acts_kind_check check (kind in ('COMMITMENT', 'FAST', 'TIME_GIFT', 'PRAYER_VIGIL', 'EVANGELISM')),
  constraint faith_acts_status_check check (status in ('ACTIVE', 'FULFILLED', 'ABANDONED')),
  constraint faith_acts_dates_check check (end_date is null or end_date >= start_date)
);
create index if not exists faith_acts_user_idx on faith_acts (user_id, created_at desc);
alter table faith_acts enable row level security;

create table if not exists faith_act_supports (
  act_id uuid not null references faith_acts (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (act_id, user_id)
);
alter table faith_act_supports enable row level security;
