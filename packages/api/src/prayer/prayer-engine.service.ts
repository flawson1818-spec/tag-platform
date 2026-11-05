import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { toRoomId } from './prayer-constants';
import { PrayerProgramsService } from './prayer-programs.service';
import { AI_SHARER, PrayerRealtimeGateway, RoomSharer } from './prayer-realtime.gateway';
import { PrayerSlot } from './prayer-slot.entity';
import { PrayerSlotsService } from './prayer-slots.service';

/**
 * How long a moderator present in the room has to share the next créneau before the AI
 * Intercessor shares it itself. Overridable for a deployment that wants a longer hand-over.
 */
export const RELAY_GRACE_SECONDS = Number(process.env.PRAYER_RELAY_GRACE_SECONDS) || 180;

/**
 * Server-authoritative continuous prayer room (docs/01_FUNCTIONAL_SPECIFICATION.md §2.3,
 * docs/03_ARCHITECTURE_SPECIFICATION.md §6). Ticks every second.
 *
 * A créneau is the ordered sequence of segments of a program (opening, worship, prayers 1…7
 * with their verses, praise, supplication, closing). Within a créneau the next segment starts
 * the instant the current one ends. At the end of the créneau comes the relay: the créneau is
 * shared again — by a moderator present in the room ("Partager maintenant"), or by the AI
 * Intercessor when no moderator is there or none shares within RELAY_GRACE_SECONDS. During the
 * relay the closing segment stays RUNNING: the prayer never stops.
 */
@Injectable()
export class PrayerEngineService {
  private readonly logger = new Logger(PrayerEngineService.name);
  /** Rooms whose relay is being completed right now (tick and a click can race). */
  private readonly completing = new Set<string>();

  constructor(
    private readonly slotsService: PrayerSlotsService,
    private readonly programsService: PrayerProgramsService,
    private readonly gateway: PrayerRealtimeGateway,
  ) {
    this.gateway.onRelayShare((roomId, sharer) => this.completeRelay(roomId, sharer));
  }

  @Interval(1000)
  async tick(): Promise<void> {
    await this.transitionExpiredSlots();
    await this.resumeSilentPrograms();
    await this.broadcastTicks();
  }

  /**
   * Self-healing continuity guard: the room must never stay silent. If a program has no RUNNING
   * segment at all (the process was down when one ended), restart from the first segment.
   */
  private async resumeSilentPrograms(): Promise<void> {
    const activePrograms = await this.programsService.listActive();
    for (const program of activePrograms) {
      try {
        const running = await this.slotsService.findRunningSlotByProgram(program.id);
        if (running) continue;
        const roomId = toRoomId(program.community_id);
        this.gateway.closeRelay(roomId);
        const first = await this.slotsService.findFirstByProgram(program.id);
        await this.start(roomId, first);
      } catch (error) {
        this.logger.error(`Failed to resume silent program ${program.id}`, error as Error);
      }
    }
  }

  private async transitionExpiredSlots(): Promise<void> {
    const expired = await this.slotsService.findExpiredRunningSlots();

    for (const slot of expired) {
      try {
        const program = await this.programsService.findById(slot.program_id);
        const roomId = toRoomId(program.community_id);
        const { slot: next, wraps } = await this.slotsService.nextAfter(slot);

        if (!wraps) {
          // Inside a créneau: straight on to the next segment, same sharer.
          await this.finish(roomId, slot);
          await this.start(roomId, next);
          continue;
        }

        const relay = this.gateway.getPendingRelay(roomId);
        if (relay && relay.fromSlotId === slot.id) {
          // Waiting for a moderator. The AI steps in at the deadline, or as soon as no
          // moderator is left in the room.
          if (Date.now() >= relay.deadline || !this.gateway.hasModerator(roomId)) {
            await this.completeRelay(roomId, AI_SHARER);
          }
          continue;
        }

        if (this.gateway.hasModerator(roomId)) {
          this.gateway.openRelay(roomId, {
            fromSlotId: slot.id,
            nextSlotId: next.id,
            nextTitle: next.title,
            programId: slot.program_id,
            deadline: Date.now() + RELAY_GRACE_SECONDS * 1000,
          });
          continue;
        }

        // Nobody to share it: the AI Intercessor shares the créneau and the prayer goes on.
        this.gateway.setSharer(roomId, AI_SHARER);
        await this.finish(roomId, slot);
        await this.start(roomId, next);
      } catch (error) {
        this.logger.error(`Failed to transition slot ${slot.id}`, error as Error);
      }
    }
  }

  /** Ends the relay: the closing segment finishes and the shared créneau starts from the top. */
  async completeRelay(roomId: string, sharer: RoomSharer): Promise<void> {
    const relay = this.gateway.getPendingRelay(roomId);
    if (!relay || this.completing.has(roomId)) return;
    this.completing.add(roomId);
    try {
      this.gateway.closeRelay(roomId);
      const closing = await this.slotsService.findById(relay.fromSlotId);
      let next = await this.slotsService.findById(relay.nextSlotId).catch(() => null);
      if (!next || next.status === 'ARCHIVED') next = await this.slotsService.findFirstByProgram(relay.programId);
      this.gateway.setSharer(roomId, sharer);
      if (closing.status === 'RUNNING') await this.finish(roomId, closing);
      await this.start(roomId, next);
    } catch (error) {
      this.logger.error(`Failed to complete the relay in room ${roomId}`, error as Error);
    } finally {
      this.completing.delete(roomId);
    }
  }

  private async finish(roomId: string, slot: PrayerSlot): Promise<void> {
    await this.slotsService.markFinished(slot.id);
    this.gateway.emitSlotEnded(roomId, slot.id);
    this.gateway.clearActiveSpeakers(roomId);
  }

  /** Each segment runs for its OWN intended duration — never the previous segment's. */
  private async start(roomId: string, slot: PrayerSlot): Promise<void> {
    const durationSeconds = await this.slotsService.intendedDurationSeconds(slot);
    const activated = await this.slotsService.activate(slot.id, durationSeconds);
    const upcoming = await this.slotsService.nextAfter(activated).catch(() => null);
    this.gateway.emitSlotStarted(
      roomId,
      activated,
      durationSeconds,
      upcoming ? { title: upcoming.slot.title, startsNewCreneau: upcoming.wraps } : null,
    );
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
