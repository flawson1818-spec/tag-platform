import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PRAYER_REQUEST_CATEGORIES } from '../prayer/prayer-constants';
import { Availability, IntercessorsService } from './intercessors.service';

export class UpdateIntercessorProfileDto {
  @IsOptional()
  @IsIn(['AVAILABLE', 'BUSY', 'OFFLINE'])
  availability?: Availability;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsIn(PRAYER_REQUEST_CATEGORIES, { each: true })
  prayerSkills?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxActive?: number;
}

@ApiTags('intercessors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('intercessors')
export class IntercessorsController {
  constructor(private readonly intercessorsService: IntercessorsService) {}

  @Get('me')
  myProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.intercessorsService.myProfile(user.id);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateIntercessorProfileDto) {
    return this.intercessorsService.updateMyProfile(user.id, dto);
  }

  /** For the administration entrusting a request: who fits best, and why. */
  @Get('recommendations/:requestId')
  @UseGuards(PermissionGuard)
  @RequirePermission('prayer_request.manage_status')
  recommend(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.intercessorsService.recommend(requestId);
  }
}
