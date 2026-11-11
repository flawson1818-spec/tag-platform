import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { MOBILIZATION_STATUSES, MobilizationStatus, MobilizationsService } from './mobilizations.service';

export class InviteGroupDto {
  @IsUUID()
  communityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AnswerMobilizationDto {
  @IsIn(MOBILIZATION_STATUSES)
  status!: MobilizationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags('mobilizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MobilizationsController {
  constructor(private readonly service: MobilizationsService) {}

  @Post('prayer-requests/:id/mobilizations')
  invite(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteGroupDto) {
    return this.service.invite(id, dto.communityId, user.id, dto.note);
  }

  @Get('prayer-requests/:id/mobilizations')
  forRequest(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listForRequest(id, user.id);
  }

  @Get('communities/:id/mobilizations')
  forCommunity(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listForCommunity(id, user.id);
  }

  @Patch('mobilizations/:id')
  answer(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerMobilizationDto) {
    return this.service.answer(id, dto.status, user.id, dto.note);
  }

  @Delete('mobilizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.withdraw(id, user.id);
  }
}
