import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PermissionsService } from '../access/permissions.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreatePostDto } from '../posts/dto/create-post.dto';
import { PostsService } from '../posts/posts.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateCommunityDocumentDto } from './dto/create-community-document.dto';
import { CreateCommunityDto } from './dto/create-community.dto';
import { ListCommunitiesQueryDto } from './dto/list-communities.query.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunitiesService } from './communities.service';
import { CommunityDocumentsService } from './community-documents.service';

const COMMUNITY_MANAGE = 'community.manage';
const COMMUNITY_MANAGE_MEMBERS = 'community.manage_members';

@ApiTags('communities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('communities')
export class CommunitiesController {
  constructor(
    private readonly communitiesService: CommunitiesService,
    private readonly postsService: PostsService,
    private readonly permissionsService: PermissionsService,
    private readonly communityDocumentsService: CommunityDocumentsService,
  ) {}

  private async assertPermission(
    userId: string,
    communityId: string | undefined,
    permissionCode: string,
  ): Promise<void> {
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId);
    if (!permissions.has(permissionCode)) {
      throw new ForbiddenException(`Missing permission: ${permissionCode}`);
    }
  }

  @Post()
  async create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateCommunityDto) {
    await this.assertPermission(currentUser.id, dto.parentId, COMMUNITY_MANAGE);
    return this.communitiesService.create(dto, currentUser.id);
  }

  @Get()
  list(@Query() query: ListCommunitiesQueryDto) {
    return this.communitiesService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.communitiesService.findById(id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunityDto,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE);
    return this.communitiesService.update(id, dto, currentUser.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE);
    return this.communitiesService.softDelete(id);
  }

  @Post(':id/join')
  async join(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.communitiesService.join(id, currentUser.id);
  }

  /** So the UI can show "en attente" explicitly on reload, not just right after clicking join. */
  @Get(':id/membership')
  async getMembership(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const status = await this.communitiesService.getMembershipStatus(id, currentUser.id);
    return { status };
  }

  @Get(':id/members/pending')
  async listPendingMembers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE_MEMBERS);
    return this.communitiesService.listPendingMembers(id, query);
  }

  @Patch(':id/members/:userId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE_MEMBERS);
    return this.communitiesService.approveMembership(id, userId);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE_MEMBERS);
    await this.communitiesService.findById(id);
    return this.communitiesService.addMember(id, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE_MEMBERS);
    return this.communitiesService.removeMember(id, userId);
  }

  @Get(':id/members')
  listMembers(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.communitiesService.listMembers(id, query);
  }

  @Post(':id/posts')
  createPost(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createPost(id, currentUser.id, dto);
  }

  @Get(':id/posts')
  listPosts(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.postsService.listForCommunity(id, query);
  }

  @Post(':id/documents')
  async createDocument(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommunityDocumentDto,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE);
    return this.communityDocumentsService.create(id, currentUser.id, dto.fileId, dto.title);
  }

  @Get(':id/documents')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.communityDocumentsService.list(id);
  }

  @Get(':id/documents/:documentId/url')
  async getDocumentUrl(@Param('documentId', ParseUUIDPipe) documentId: string) {
    const url = await this.communityDocumentsService.getReadUrl(documentId);
    return { url };
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDocument(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.assertPermission(currentUser.id, id, COMMUNITY_MANAGE);
    return this.communityDocumentsService.remove(documentId);
  }
}
