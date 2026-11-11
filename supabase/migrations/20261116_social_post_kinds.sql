-- ============================================================================
-- Communauté : ce que l'on partage — un message, une expérience vécue, un écrit.
-- Additif et idempotent. Sans ce fichier, tout est un message et les filtres
-- « Expériences » / « Écrits » restent vides.
-- ============================================================================

alter table posts add column if not exists kind text not null default 'MESSAGE';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_kind_check') then
    alter table posts add constraint posts_kind_check check (kind in ('MESSAGE', 'EXPERIENCE', 'WRITING'));
  end if;
end $$;
create index if not exists posts_kind_created_idx on posts (kind, created_at desc);
