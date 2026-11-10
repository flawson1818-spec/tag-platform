-- ============================================================================
-- Prière en continu sur un calendrier (jour, semaine, mois)
-- Un programme en mode CALENDAR contient des créneaux datés : chacun commence à son heure
-- (ex. jeudi 5 novembre 12:00-13:00) et le suivant enchaîne sans arrêt. Entre deux créneaux
-- écrits, l'IA prolonge la prière avec le dernier créneau : la prière ne s'arrête jamais.
-- Les programmes existants restent en mode LOOP (le créneau tourne en boucle, comme avant).
--
-- Additif et idempotent : une colonne avec valeur par défaut, un index.
-- ============================================================================

alter table prayer_programs add column if not exists schedule_mode text not null default 'LOOP';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prayer_programs_schedule_mode_check') then
    alter table prayer_programs add constraint prayer_programs_schedule_mode_check
      check (schedule_mode in ('LOOP', 'CALENDAR'));
  end if;
end $$;

-- "Quel segment est prévu maintenant ?" — interrogé chaque seconde par le moteur.
create index if not exists prayer_slots_program_window_idx on prayer_slots (program_id, start_at, end_at)
  where status <> 'ARCHIVED';
