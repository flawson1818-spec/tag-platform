-- ============================================================================
-- Durée prévue de chaque segment d'un créneau
-- docs/01_FUNCTIONAL_SPECIFICATION.md §2 : chaque segment d'un créneau (ouverture, adoration,
-- prière 1…7, louange, supplication, clôture) a sa propre durée. Jusqu'ici elle n'était déduite
-- que de start_at/end_at, que le moteur réécrit à chaque passage — et un défaut transmettait la
-- durée d'un segment au suivant. Cette colonne garde la durée voulue, une fois pour toutes.
--
-- Strictement additif et idempotent : une colonne NULLABLE, remplie pour les segments encore
-- planifiés. Sans elle, l'API retombe sur l'ancienne déduction.
-- ============================================================================

alter table prayer_slots add column if not exists duration_seconds integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prayer_slots_duration_seconds_check') then
    alter table prayer_slots add constraint prayer_slots_duration_seconds_check
      check (duration_seconds is null or duration_seconds between 1 and 86400);
  end if;
end $$;

-- Segments encore planifiés : leur fenêtre start_at/end_at est toujours celle saisie.
update prayer_slots
set duration_seconds = greatest(1, extract(epoch from (end_at - start_at))::integer)
where duration_seconds is null
  and status = 'SCHEDULED'
  and end_at > start_at;
