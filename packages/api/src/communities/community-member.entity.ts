export type MembershipStatus = 'ACTIVE' | 'PENDING';

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  internal_role: string | null;
  status: MembershipStatus;
  joined_at: string;
}

export interface CommunityMemberWithUser extends CommunityMember {
  users: {
    id: string;
    display_name: string;
    avatar_file_id: string | null;
  } | null;
}
