-- ============================================================================
-- « Je prie pour ce sujet » (cahier des charges unifié §5.7)
-- Quand une demande est portée dans la salle, chacun peut dire qu'il prie pour elle — une fois
-- par personne — et le demandeur voit combien ont prié. Additif et idempotent.
-- ============================================================================

create table if not exists prayer_request_prayers (
  prayer_request_id uuid not null references prayer_requests (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prayer_request_id, user_id)
);
alter table prayer_request_prayers enable row level security;
