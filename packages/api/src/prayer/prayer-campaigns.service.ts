import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { Campaign } from './campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { assertCampaignTransition, CampaignStatus } from './prayer-state-machines';

const CAMPAIGN_COLUMNS = 'id, community_id, title, status, start_date, end_date, created_at, updated_at, deleted_at';

@Injectable()
export class PrayerCampaignsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('campaigns');
  }

  async create(dto: CreateCampaignDto, actorId: string): Promise<Campaign> {
    const { data, error } = await this.db
      .insert({
        community_id: dto.communityId ?? null,
        title: dto.title,
        status: 'DRAFT',
        start_date: dto.startDate ?? null,
        end_date: dto.endDate ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Campaign;
  }

  async findById(id: string): Promise<Campaign> {
    const { data, error } = await this.db
      .select(CAMPAIGN_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Campaign ${id} not found`);
    return data as unknown as Campaign;
  }

  async list(query: PaginationQueryDto): Promise<PaginatedResult<Campaign>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    const { data, error, count } = await this.db
      .select(CAMPAIGN_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Campaign[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async updateStatus(id: string, status: CampaignStatus, actorId: string): Promise<Campaign> {
    const campaign = await this.findById(id);
    assertCampaignTransition(campaign.status, status);

    const { data, error } = await this.db
      .update({ status, updated_by: actorId })
      .eq('id', id)
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Campaign;
  }
}
