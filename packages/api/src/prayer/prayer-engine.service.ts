import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { toRoomId } from './prayer-constants';
import { PrayerProgramsService } from './prayer-programs.service';
import { PrayerRealtimeGateway } from './prayer-realtime.gateway';
import { PrayerSlotsService } from './prayer-slots.service';

/**
 * Server-authoritative continuous prayer room: ticks every second, ends slots whose window
 * has elapsed, and immediately activates the next one (looping back to the first slot when a
 * program is exhausted) so the room is never silent. See docs/01_FUNCTIONAL_SPECIFICATION.md
 * section 2.3 and docs/03_ARCHITECTURE_SPECIFICATION.md section 6.
 */
@Injectable()
export class PrayerEngineService {
  private readonly logger = new Logger(PrayerEngineService.name);

  constructor(
    private readonly slotsService: PrayerSlotsService,
    private readonly programsService: PrayerProgramsService,
    private readonly gateway: PrayerRealtimeGateway,
  ) {}

  @Interval(1000)
  async tick(): Promise<void> {
    await this.transitionExpiredSlots();
    await this.resumeSilentPrograms();
    await this.broadcastTicks();
  }

  /**
   * Self-healing continuity guard (docs/01_FUNCTIONAL_SPECIFICATION.md section 2.3): the room
   * must never stay silent. transitionExpiredSlots() only reacts to a RUNNING slot expiring —
   * it does nothing if a program has *no* RUNNING slot at all, which happens whenever this
   * process was down at the moment the last slot ended. Restart from the first slot instead of
   * waiting for a human to notice.
   */
  private async resumeSilentPrograms(): Promise<void> {
    const activePrograms = await this.programsService.listActive();
    for (const program of activePrograms) {
      try {
        const running = await this.slotsService.findRunningSlotByProgram(program.id);
        if (running) continue;
        const first = await this.slotsService.findFirstByProgram(program.id);
        const durationSeconds = Math.max(
          1,
          Math.round((new Date(first.end_at).getTime() - new Date(first.start_at).getTime()) / 1000),
        );
        const activated = await this.slotsService.activate(first.id, durationSeconds);
        this.gateway.emitSlotStarted(toRoomId(program.community_id), activated, durationSeconds);
      } catch (error) {
        this.logger.error(`Failed to resume silent program ${program.id}`, error as Error);
      }
    }
  }

  private async transitionExpiredSlots(): Promise<void> {
    const expired = await this.slotsService.findExpiredRunningSlots();

    for (const slot of expired) {
      try {
        await this.slotsService.markFinished(slot.id);
        const program = await this.programsService.findById(slot.program_id);
        const roomId = toRoomId(program.community_id);
        this.gateway.emitSlotEnded(roomId, slot.id);
        this.gateway.clearActiveSpeakers(roomId);

        const durationSeconds = Math.max(
          1,
          Math.round((new Date(slot.end_at).getTime() - new Date(slot.start_at).getTime()) / 1000),
        );
        const next =
          (await this.slotsService.findByOrderIndex(slot.program_id, slot.order_index + 1)) ??
          (await this.slotsService.findFirstByProgram(slot.program_id));
        const activated = await this.slotsService.activate(next.id, durationSeconds);
        this.gateway.emitSlotStarted(roomId, activated, durationSeconds);
      } catch (error) {
        this.logger.error(`Failed to transition slot ${slot.id}`, error as Error);
      }
    }
  }

  private async broadcastTicks(): Promise<void> {
    const activePrograms = await this.programsService.listActive();
    for (const program of activePrograms) {
      const running = await this.slotsService.findRunningSlotByProgram(program.id);
      if (!running) continue;
      const remainingSeconds = Math.max(0, Math.round((new Date(running.end_at).getTime() - Date.now()) / 1000));
      this.gateway.emitSlotTick(toRoomId(program.community_id), remainingSeconds);
    }
  }
}
