import { CampaignStatus } from './prayer-state-machines';

export interface Campaign {
  id: string;
  community_id: string | null;
  title: string;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
