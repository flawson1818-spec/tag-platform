export const PRAYER_CATEGORIES = [
  'Famille',
  'Finances',
  'Santé',
  'Guérison',
  'Évangélisation',
  'Nation',
  'Jeunesse',
  'Mariage',
  'Église',
  'Mission',
  'Urgence',
  'Autre',
] as const;

export type PrayerCategory = (typeof PRAYER_CATEGORIES)[number];

export const PRAYER_IMPORTANCE_LEVELS = ['Normal', 'Important', 'Urgent'] as const;

export type PrayerImportance = (typeof PRAYER_IMPORTANCE_LEVELS)[number];

export const PRAYER_REQUEST_CATEGORIES = [
  'Maladie',
  'Mariage',
  'Emploi',
  'Études',
  'Visa',
  'Enfant',
  'Délivrance',
  'Famille',
  'Autre',
] as const;

export type PrayerRequestCategory = (typeof PRAYER_REQUEST_CATEGORIES)[number];

export const CONFIDENTIALITY_LEVELS = ['ANONYMOUS', 'PRIVATE', 'PUBLIC'] as const;

export type Confidentiality = (typeof CONFIDENTIALITY_LEVELS)[number];

/** The official world room: prayer_programs.community_id IS NULL. */
export const WORLD_ROOM_ID = 'world';

export function toRoomId(communityId: string | null): string {
  return communityId ?? WORLD_ROOM_ID;
}

export function fromRoomId(roomId: string): string | null {
  return roomId === WORLD_ROOM_ID ? null : roomId;
}
