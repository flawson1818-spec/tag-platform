-- ============================================================================
-- Lecture et traduction de la salle de prière
-- Chaque traduction n'est faite qu'une fois (speech_translations) ; speech_usage compte les
-- caractères du mois pour rester dans la gratuité de Google. Additif et idempotent.
-- ============================================================================

create table if not exists speech_translations (
  hash text primary key,
  lang text not null,
  source text not null,
  text text not null,
  created_at timestamptz not null default now()
);
alter table speech_translations enable row level security;

create table if not exists speech_usage (
  month text primary key,
  tts_chars bigint not null default 0,
  translate_chars bigint not null default 0
);
alter table speech_usage enable row level security;
