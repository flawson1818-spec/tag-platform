import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

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
}
