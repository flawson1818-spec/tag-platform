import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { CreateSocialPostDto } from './dto/create-social-post.dto';
import { UpdateMemberProfileDto } from './dto/update-member-profile.dto';
import { FeedFilter, POST_KINDS, SocialService } from './social.service';

/** Members only: the feed and profiles are for signed-in members of the platform. */
@ApiTags('social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('feed')
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('view') view?: string,
    @Query('communityId') communityId?: string,
  ) {
    const views = ['all', 'groups', 'photos', ...POST_KINDS];
    const filter: FeedFilter = {
      view: views.includes(view ?? '') ? (view as FeedFilter['view']) : 'all',
      communityId: communityId && /^[0-9a-f-]{36}$/i.test(communityId) ? communityId : undefined,
    };
    return this.socialService.feed(user.id, Math.max(1, page), limit, filter);
  }

  @Post('posts')
  createPost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSocialPostDto) {
    return this.socialService.createPost(user.id, dto);
  }

  @Post('posts/:id/amen')
  @HttpCode(HttpStatus.OK)
  amen(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.setAmen(id, user.id, true);
  }

  @Delete('posts/:id/amen')
  removeAmen(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.setAmen(id, user.id, false);
  }

  @Patch('me/profile')
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMemberProfileDto) {
    return this.socialService.updateMyProfile(user.id, dto);
  }

  @Get('members')
  members(@Query('search') search = '') {
    return this.socialService.searchMembers(String(search).slice(0, 80));
  }

  @Get('members/:id')
  profile(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.profile(id, user.id);
  }

  @Get('members/:id/posts')
  memberPosts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.socialService.memberPosts(id, user.id, Math.max(1, page));
  }
}
