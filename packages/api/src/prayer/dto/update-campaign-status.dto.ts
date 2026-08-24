import { IsIn } from 'class-validator';

const CAMPAIGN_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];

export class UpdateCampaignStatusDto {
  @IsIn(CAMPAIGN_STATUSES)
  status!: string;
}
