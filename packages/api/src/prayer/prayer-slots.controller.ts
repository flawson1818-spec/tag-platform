import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import { fromRoomId, WORLD_ROOM_ID } from './prayer-constants';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { PrayerProgramsService } from './prayer-programs.service';
import { PrayerSlotsService } from './prayer-slots.service';

@ApiTags('prayer-slots')
@Controller('prayer-slots')
export class PrayerSlotsController {
  constructor(
    private readonly slotsService: PrayerSlotsService,
    private readonly programsService: PrayerProgramsService,
  ) {}

  @Get('active')
  async active(@Query('roomId') roomId: string = WORLD_ROOM_ID) {
    const program = await this.programsService.findActiveByCommunity(fromRoomId(roomId));
    if (!program) throw new NotFoundException(`No active prayer program for room ${roomId}`);

    const slot = await this.slotsService.findRunningSlotByProgram(program.id);
    if (!slot) throw new NotFoundException(`No slot currently running for room ${roomId}`);

    const remainingSeconds = Math.max(0, Math.round((new Date(slot.end_at).getTime() - Date.now()) / 1000));
    return { ...slot, remainingSeconds };
  }

  @Get(':id/next')
  next(@Param('id', ParseUUIDPipe) id: string) {
    return this.slotsService.findNext(id);
  }

  @Get('leader-candidates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  leaderCandidates(@Query('search') search?: string) {
    return this.slotsService.listLeaderCandidates(search);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlotDto) {
    return this.slotsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_program.create')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.slotsService.remove(id);
  }
}
