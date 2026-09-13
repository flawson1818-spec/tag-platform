import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

const COMMUNITY_MANAGE_PERMISSION = 'community.manage';
const POST_MODERATE_PERMISSION = 'post.moderate';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** docs/06_RBAC_SPECIFICATION.md §4: author or a Responsable+ of the post's own community. */
  @Patch(':id')
  async updatePost(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePostDto,
  ) {
    const post = await this.postsService.findPostById(id);
    const canManage = (await this.permissionsService.getUserPermissionCodes(currentUser.id, post.community_id)).has(
      COMMUNITY_MANAGE_PERMISSION,
    );
    return this.postsService.updatePost(id, currentUser.id, dto.content, canManage);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archivePost(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const post = await this.postsService.findPostById(id);
    const canManage = (await this.permissionsService.getUserPermissionCodes(currentUser.id, post.community_id)).has(
      COMMUNITY_MANAGE_PERMISSION,
    );
    return this.postsService.archivePost(id, currentUser.id, canManage);
  }

  @Post(':id/comments')
  createComment(
    @Param('id', ParseUUIDPipe) postId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.createComment(postId, currentUser.id, dto);
  }

  @Get(':id/comments')
  listComments(@Param('id', ParseUUIDPipe) postId: string, @Query() query: PaginationQueryDto) {
    return this.postsService.listComments(postId, query);
  }

  /** docs/06_RBAC_SPECIFICATION.md §4: author-only — a Modérateur+ can delete, but never edit, someone else's comment. */
  @Patch(':id/comments/:commentId')
  updateComment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.updateComment(commentId, currentUser.id, dto.content);
  }

  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    const post = await this.postsService.findPostById(postId);
    const canModerate = (await this.permissionsService.getUserPermissionCodes(currentUser.id, post.community_id)).has(
      POST_MODERATE_PERMISSION,
    );
    return this.postsService.deleteComment(commentId, currentUser.id, canModerate);
  }
}
