import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { CommunityMemberWithUser } from './community-member.entity';
import { Community } from './community.entity';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateCommunityDto } from './dto/create-community.dto';
import { ListCommunitiesQueryDto } from './dto/list-communities.query.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

const COMMUNITY_COLUMNS = 'id, type, name, parent_id, language, timezone, created_at, updated_at, deleted_at';

@Injectable()
export class CommunitiesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('communities');
  }

  async findById(id: string): Promise<Community> {
    const { data, error } = await this.db
      .select(COMMUNITY_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Community ${id} not found`);
    return data as unknown as Community;
  }

  async list(query: ListCommunitiesQueryDto): Promise<PaginatedResult<Community>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(COMMUNITY_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.type) request = request.eq('type', query.type);
    if (query.parentId) request = request.eq('parent_id', query.parentId);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Community[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async create(dto: CreateCommunityDto, actorId: string): Promise<Community> {
    const { data, error } = await this.db
      .insert({
        type: dto.type,
        name: dto.name,
        parent_id: dto.parentId ?? null,
        language: dto.language,
        timezone: dto.timezone,
        created_by: actorId,
        updated_by: actorId,
      })
      .select(COMMUNITY_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    const community = data as unknown as Community;
    await this.addMember(community.id, { userId: actorId });
    return community;
  }

  async update(id: string, dto: UpdateCommunityDto, actorId: string): Promise<Community> {
    await this.findById(id);
    const { data, error } = await this.db
      .update({
        name: dto.name,
        language: dto.language,
        timezone: dto.timezone,
        updated_by: actorId,
      })
      .eq('id', id)
      .select(COMMUNITY_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Community;
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    const { error } = await this.db.update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * Self-service join (docs/07_UX_UI_SPECIFICATION.md §9 "adhésion directe") — deliberately not
   * gated behind `community.manage_members` (that permission is for a Responsable adding someone
   * *else*; requiring it here made it impossible for an ordinary member to ever join a community
   * themselves). No approval workflow yet — every community currently allows immediate join.
   */
  async join(communityId: string, userId: string): Promise<void> {
    await this.findById(communityId);
    await this.addMember(communityId, { userId });
  }

  async addMember(communityId: string, dto: AddMemberDto): Promise<void> {
    const { error } = await this.supabase.client.from('community_members').insert({
      community_id: communityId,
      user_id: dto.userId,
      internal_role: dto.internalRole ?? null,
    });
    if (error && error.code !== '23505') throw new InternalServerErrorException(error.message);
  }

  async removeMember(communityId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async listMembers(
    communityId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<CommunityMemberWithUser>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    const { data, error, count } = await this.supabase.client
      .from('community_members')
      .select('id, community_id, user_id, internal_role, joined_at, users(id, display_name, avatar_file_id)', {
        count: 'exact',
      })
      .eq('community_id', communityId)
      .order('joined_at', { ascending: true })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);

    return {
      data: data as unknown as CommunityMemberWithUser[],
      meta: buildPaginationMeta(page, limit, count ?? 0),
    };
  }
}
