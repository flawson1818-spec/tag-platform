import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreateSocialPublicationDto } from './dto/create-social-publication.dto';
import { ListSocialPublicationsQueryDto } from './dto/list-social-publications.query.dto';
import { SocialPublicationsService } from './social-publications.service';

const APPROVE_PERMISSION = 'social_publication.approve';

@ApiTags('social-publications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social-publications')
export class SocialPublicationsController {
  constructor(private readonly publicationsService: SocialPublicationsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(APPROVE_PERMISSION)
  create(@Body() dto: CreateSocialPublicationDto) {
    return this.publicationsService.create(dto);
  }

  @Get()
  list(@Query() query: ListSocialPublicationsQueryDto) {
    return this.publicationsService.list(query);
  }

  @Patch(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission(APPROVE_PERMISSION)
  approve(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicationsService.approve(id, currentUser.id);
  }

  @Patch(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission(APPROVE_PERMISSION)
  reject(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicationsService.reject(id, currentUser.id);
  }
}
