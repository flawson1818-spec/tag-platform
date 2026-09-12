import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { CommunityAnnouncement } from './announcement.entity';

const ANNOUNCEMENT_COLUMNS = 'id, community_id, author_id, content, pinned_at, created_at, updated_at';

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §8.2 ("Annonces", distinct from "Fil d'actualité") and §1.2
 * (Pasteur: "Publie des communications officielles à l'échelle d'une communauté ou nation") /
 * docs/07_UX_UI_SPECIFICATION.md §9 ("annonces épinglées"). A brand-new, isolated table — `posts`
 * requires a non-null community_id and has no pinned concept, so this is deliberately separate
 * rather than overloading that table. community_id null means nation-wide.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('community_announcements');
  }

  async create(communityId: string | null, authorId: string, content: string): Promise<CommunityAnnouncement> {
    const { data, error } = await this.db
      .insert({ community_id: communityId, author_id: authorId, content })
      .select(ANNOUNCEMENT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as CommunityAnnouncement;
  }

  /**
   * A community's feed shows both its own announcements and nation-wide broadcasts; passing
   * `null` (no community) lists only the nation-wide ones. Pinned first, then most recent.
   */
  async list(communityId: string | null, query: PaginationQueryDto): Promise<PaginatedResult<CommunityAnnouncement>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(ANNOUNCEMENT_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);
    request = communityId ? request.or(`community_id.eq.${communityId},community_id.is.null`) : request.is('community_id', null);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);
    return { data: data as unknown as CommunityAnnouncement[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async findById(id: string): Promise<CommunityAnnouncement> {
    const { data, error } = await this.db.select(ANNOUNCEMENT_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Announcement ${id} not found`);
    return data as unknown as CommunityAnnouncement;
  }

  async setPinned(id: string, pinned: boolean): Promise<CommunityAnnouncement> {
    await this.findById(id);
    const { data, error } = await this.db
      .update({ pinned_at: pinned ? new Date().toISOString() : null })
      .eq('id', id)
      .select(ANNOUNCEMENT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as CommunityAnnouncement;
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    const { error } = await this.db.update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
