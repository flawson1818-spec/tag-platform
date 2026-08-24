export const EVENT_TYPES = [
  'VEILLEE',
  'JEUNE',
  'CROISADE',
  'CONFERENCE',
  'ETUDE_BIBLIQUE',
  'DEBAT_BIBLIQUE',
  'FORMATION',
  'INTERCESSION_SPECIALE',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** See docs/10_STATE_MACHINES.md — PRAYER SESSION (reused here for Event.status). */
export type EventStatus = 'CREATED' | 'SCHEDULED' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'ARCHIVED';

export interface Event {
  id: string;
  community_id: string | null;
  type: EventType;
  title: string;
  description: string | null;
  scheduled_at: string;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string | null;
  role_in_event: 'ATTENDEE' | 'SPEAKER' | 'MODERATOR';
  hand_raised_at: string | null;
  created_at: string;
}
