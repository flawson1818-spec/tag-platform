import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSocialPublicationDto } from './dto/create-social-publication.dto';
import { ListSocialPublicationsQueryDto } from './dto/list-social-publications.query.dto';
import { SocialPublication } from './social-publication.entity';

const PUBLICATION_COLUMNS =
  'id, testimony_id, channel, draft_content, status, approved_by, published_at, created_at, updated_at';

@Injectable()
export class SocialPublicationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('social_publications');
  }

  async create(dto: CreateSocialPublicationDto): Promise<SocialPublication> {
    const { data, error } = await this.db
      .insert({
        testimony_id: dto.testimonyId ?? null,
        channel: dto.channel,
        draft_content: dto.draftContent,
        status: 'DRAFT',
      })
      .select(PUBLICATION_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as SocialPublication;
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
