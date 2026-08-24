import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { PrayerProgramsService } from './prayer-programs.service';
import { PrayerSlotsService } from './prayer-slots.service';

@ApiTags('prayer-programs')
@Controller('prayer-programs')
export class PrayerProgramsController {
  constructor(
    private readonly programsService: PrayerProgramsService,
    private readonly slotsService: PrayerSlotsService,
  ) {}

  @Get()
  list(@Query() query: PaginationQueryDto & { communityId?: string }) {
    return this.programsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.programsService.findById(id);
  }

  @Get(':id/slots')
  listSlots(@Param('id', ParseUUIDPipe) id: string) {
    return this.slotsService.listForProgram(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateProgramDto) {
    return this.programsService.create(dto, currentUser.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.programsService.update(id, dto, currentUser.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.programsService.softDelete(id);
  }

  @Post(':id/slots')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  createSlot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSlotDto) {
    return this.slotsService.create(id, dto);
  }
}
