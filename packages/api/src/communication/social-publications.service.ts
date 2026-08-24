import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSocialPublicationDto } from './dto/create-social-publication.dto';
import { ListSocialPublicationsQueryDto } from './dto/list-social-publications.query.dto';
import { SOCIAL_CHANNELS, SocialChannel, SocialPublication, SocialPublicationChannelSetting } from './social-publication.entity';

const PUBLICATION_COLUMNS =
  'id, testimony_id, channel, draft_content, status, approved_by, published_at, created_at, updated_at';
const SETTINGS_COLUMNS = 'channel, auto_publish, updated_by, updated_at';

@Injectable()
export class SocialPublicationsService {
  private readonly logger = new Logger(SocialPublicationsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('social_publications');
  }

  private get settingsDb() {
    return this.supabase.client.from('social_publication_channel_settings');
  }

  /**
   * docs/02_AI_AGENTS_SPECIFICATION.md section 6: a draft is always human-reviewed unless an
   * Administrator has explicitly turned on "auto-publish" for that exact channel — skips straight
   * to APPROVED (never a fabricated PUBLISHED/published_at, since no channel is actually wired to
   * a real posting API yet; APPROVED is the same terminal state a human reviewer would reach).
   */
  async create(dto: CreateSocialPublicationDto): Promise<SocialPublication> {
    const autoPublish = await this.isAutoPublishEnabled(dto.channel);
    const { data, error } = await this.db
      .insert({
        testimony_id: dto.testimonyId ?? null,
        channel: dto.channel,
        draft_content: dto.draftContent,
        status: autoPublish ? 'APPROVED' : 'DRAFT',
      })
      .select(PUBLICATION_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as SocialPublication;
  }

  /** Every channel, defaulting to auto_publish: false for one with no settings row yet. */
  async listChannelSettings(): Promise<SocialPublicationChannelSetting[]> {
    const { data, error } = await this.settingsDb.select(SETTINGS_COLUMNS);
    if (error) throw new InternalServerErrorException(error.message);
    const byChannel = new Map(
      (data as unknown as SocialPublicationChannelSetting[] | null ?? []).map((s) => [s.channel, s]),
    );
    return SOCIAL_CHANNELS.map(
      (channel) => byChannel.get(channel) ?? { channel, auto_publish: false, updated_by: null, updated_at: '' },
    );
  }

  async setChannelAutoPublish(
    channel: string,
    autoPublish: boolean,
    actorId: string,
  ): Promise<SocialPublicationChannelSetting> {
    if (!SOCIAL_CHANNELS.includes(channel as SocialChannel)) {
      throw new BadRequestException(`Unknown channel: ${channel}`);
    }
    const { data, error } = await this.settingsDb
      .upsert({ channel, auto_publish: autoPublish, updated_by: actorId }, { onConflict: 'channel' })
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as SocialPublicationChannelSetting;
  }

  /**
   * Fails open to `false` (never auto-publish) on any lookup error — same philosophy as
   * AiModerationService: this is an ancillary configuration lookup that must never block or
   * break the caller's write (drafting a social publication after a testimony is approved).
   */
  private async isAutoPublishEnabled(channel: string): Promise<boolean> {
    const { data, error } = await this.settingsDb.select('auto_publish').eq('channel', channel).maybeSingle();
    if (error) {
      this.logger.error(`Failed to look up auto-publish setting for ${channel}: ${error.message}`);
      return false;
    }
    return Boolean((data as { auto_publish: boolean } | null)?.auto_publish);
  }

  async list(query: ListSocialPublicationsQueryDto): Promise<PaginatedResult<SocialPublication>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(PUBLICATION_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.status) request = request.eq('status', query.status);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as SocialPublication[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async approve(id: string, moderatorId: string): Promise<SocialPublication> {
    const publication = await this.getPending(id);
    const { data, error } = await this.db
      .update({ status: 'APPROVED', approved_by: moderatorId })
      .eq('id', publication.id)
      .select(PUBLICATION_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as SocialPublication;
  }

  async reject(id: string, moderatorId: string): Promise<SocialPublication> {
    const publication = await this.getPending(id);
    const { data, error } = await this.db
      .update({ status: 'REJECTED', approved_by: moderatorId })
      .eq('id', publication.id)
      .select(PUBLICATION_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as SocialPublication;
  }

  private async getPending(id: string): Promise<SocialPublication> {
    const { data, error } = await this.db.select(PUBLICATION_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const publication = data as unknown as SocialPublication | null;
    if (!publication) throw new NotFoundException(`Social publication ${id} not found`);
    if (publication.status !== 'DRAFT' && publication.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(`Social publication ${id} is not pending approval`);
    }
    return publication;
  }
}
