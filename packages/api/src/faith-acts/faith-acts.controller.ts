import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { FAITH_ACT_KINDS, FaithActKind, FaithActStatus, FaithActsService } from './faith-acts.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFaithActDto {
  @IsIn(FAITH_ACT_KINDS)
  kind!: FaithActKind;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Matches(DATE)
  startDate?: string;

  @IsOptional()
  @Matches(DATE)
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateFaithActDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'FULFILLED', 'ABANDONED'])
  status?: FaithActStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE)
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** When fulfilled: what God did, published as a testimony after moderation. */
  @IsOptional()
  @IsString()
  @MaxLength(4500)
  testimony?: string;
}

@ApiTags('faith-acts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FaithActsController {
  constructor(private readonly service: FaithActsService) {}

  @Post('faith-acts')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFaithActDto) {
    return this.service.create(user.id, dto);
  }

  @Get('faith-acts/mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listFor(user.id, user.id);
  }

  @Get('social/members/:id/faith-acts')
  ofMember(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listFor(id, user.id);
  }

  @Patch('faith-acts/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaithActDto) {
    return this.service.update(id, user.id, dto);
  }

  @Delete('faith-acts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id, user.id);
  }

  @Post('faith-acts/:id/support')
  @HttpCode(HttpStatus.OK)
  support(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.support(id, user.id, true);
  }

  @Delete('faith-acts/:id/support')
  unsupport(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.support(id, user.id, false);
  }
}
