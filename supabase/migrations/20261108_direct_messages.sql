-- ============================================================================
-- Réseau social chrétien — étape 2 : messagerie privée entre deux membres
-- Une conversation relie exactement deux membres (user_a < user_b, une seule par paire).
-- Chaque membre peut en bloquer un autre : plus aucun message dans un sens ni dans l'autre.
--
-- Additif et idempotent : trois nouvelles tables, aucune donnée existante modifiée. Sans ce
-- fichier, la page Messages s'affiche vide et l'envoi répond « pas encore activé ».
-- ============================================================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references users (id) on delete cascade,
  user_b uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  user_a_read_at timestamptz,
  user_b_read_at timestamptz,
  constraint conversations_pair_order check (user_a < user_b),
  constraint conversations_pair_unique unique (user_a, user_b)
);

create index if not exists conversations_user_b_idx on conversations (user_b);
alter table conversations enable row level security;

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint direct_messages_content_check check (char_length(content) between 1 and 4000)
);

create index if not exists direct_messages_thread_idx on direct_messages (conversation_id, created_at desc);
alter table direct_messages enable row level security;

create table if not exists user_blocks (
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on user_blocks (blocked_id);
alter table user_blocks enable row level security;
