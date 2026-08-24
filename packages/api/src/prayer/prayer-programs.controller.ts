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
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { roleRank } from '../roles/role-hierarchy';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { PrayerProgramsService } from './prayer-programs.service';
import { PrayerSlotsService } from './prayer-slots.service';

const PROGRAM_PERMISSION = 'prayer_program.create';

@ApiTags('prayer-programs')
@Controller('prayer-programs')
export class PrayerProgramsController {
  constructor(
    private readonly programsService: PrayerProgramsService,
    private readonly slotsService: PrayerSlotsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * docs/06_RBAC_SPECIFICATION.md section 4: a community-scoped program can be managed
   * by prayer_program.create held globally OR scoped to that community (Responsable+ of
   * the community rattachée); the world room's official program (community_id = NULL)
   * requires a globally-held Administrateur+ role, not just the base permission.
   */
  private async assertCanManage(userId: string, communityId: string | null): Promise<void> {
    if (communityId === null) {
      const globalRoles = await this.permissionsService.getUserRoleCodes(userId, { globalOnly: true });
      const isAdminOrAbove = [...globalRoles].some((code) => roleRank(code) >= roleRank('ADMINISTRATEUR'));
      if (!isAdminOrAbove) {
        throw new ForbiddenException('Managing the world prayer program requires Administrateur or above');
      }
      return;
    }
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId);
    if (!permissions.has(PROGRAM_PERMISSION)) {
      throw new ForbiddenException(`Missing permission: ${PROGRAM_PERMISSION}`);
    }
  }

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
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateProgramDto) {
    await this.assertCanManage(currentUser.id, dto.communityId ?? null);
    return this.programsService.create(dto, currentUser.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    const program = await this.programsService.findById(id);
    await this.assertCanManage(currentUser.id, program.community_id);
    return this.programsService.update(id, dto, currentUser.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const program = await this.programsService.findById(id);
    await this.assertCanManage(currentUser.id, program.community_id);
    return this.programsService.softDelete(id);
  }

  @Post(':id/slots')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createSlot(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSlotDto,
  ) {
    const program = await this.programsService.findById(id);
    await this.assertCanManage(currentUser.id, program.community_id);
    return this.slotsService.create(id, dto);
  }
}
