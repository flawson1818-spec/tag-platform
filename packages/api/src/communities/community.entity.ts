export const COMMUNITY_TYPES = [
  'GROUP',
  'TEAM',
  'CELL',
  'COUNTRY',
  'CITY',
  'CHURCH',
  'MINISTRY',
] as const;

export type CommunityType = (typeof COMMUNITY_TYPES)[number];

export const JOIN_POLICIES = ['OPEN', 'APPROVAL'] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

export interface Community {
  id: string;
  type: CommunityType;
  name: string;
  parent_id: string | null;
  language: string;
  timezone: string;
  join_policy: JoinPolicy;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
