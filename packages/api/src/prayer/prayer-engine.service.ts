import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { toRoomId } from './prayer-constants';
import { PrayerProgramsService } from './prayer-programs.service';
import { AI_SHARER, PROGRAM_SHARER, PrayerRealtimeGateway, RoomSharer } from './prayer-realtime.gateway';
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
 *
 * That is the LOOP mode. In CALENDAR mode (prayer programmed over a day, a week, a month) each
 * dated segment starts at its own hour and the next one follows without a break; in an hour
 * nobody wrote, the AI carries on with the last créneau until the next planned one — the prayer
 * never stops there either (see tickCalendar).
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
    const programs = await this.programsService.listActive();
    const calendar = new Set<string>();
    for (const program of programs) {
      if ((await this.programsService.scheduleMode(program.id)) !== 'CALENDAR') continue;
      calendar.add(program.id);
      try {
        await this.tickCalendar(program.id, toRoomId(program.community_id));
      } catch (error) {
        this.logger.error(`Calendar tick failed for program ${program.id}`, error as Error);
      }
    }
    await this.transitionExpiredSlots(calendar);
    await this.resumeSilentPrograms(calendar);
    await this.broadcastTicks();
  }

  /**
   * One second of a calendar program: the segment planned for now runs; when its hour comes the
   * next one takes over; if nothing is planned now, the AI carries on with the last créneau,
   * segment after segment, until the next planned one starts.
   */
  private async tickCalendar(programId: string, roomId: string): Promise<void> {
    const now = new Date();
    const running = await this.slotsService.findRunningSlotByProgram(programId);
    const planned = await this.slotsService.findPlannedAt(programId, now);

    if (planned) {
      this.gateway.setReplay(roomId, null);
      if (running?.id === planned.id) return;
      if (running) await this.finish(roomId, running);
      this.gateway.closeRelay(roomId);
      this.gateway.setSharer(roomId, PROGRAM_SHARER);
      const activated = await this.slotsService.markRunning(planned.id);
      const following = await this.slotsService.findNextPlanned(programId, new Date(Date.parse(activated.end_at) - 1));
      const continues = following && Math.abs(Date.parse(following.start_at) - Date.parse(activated.end_at)) < 1000;
      this.gateway.emitSlotStarted(
        roomId,
        activated,
        secondsUntil(activated.end_at),
        continues ? { title: following.title, startsNewCreneau: false } : null,
      );
      return;
    }

    // Nothing planned now: the hour that was running is over.
    if (running) await this.finish(roomId, running);

    const replay = this.gateway.getReplay(roomId);
    if (replay && replay.programId === programId && Date.parse(replay.slot.end_at) > now.getTime()) return;

    const block = replay?.programId === programId ? replay.block : await this.slotsService.findReplayBlock(programId, now);
    if (block.length === 0) {
      this.gateway.setReplay(roomId, null);
      return; // A calendar with no créneau at all: nothing to pray yet.
    }
    const index = replay?.programId === programId ? (replay.index + 1) % block.length : 0;
    const segment = block[index];
    const nextPlanned = await this.slotsService.findNextPlanned(programId, now);
    const ownEnd = now.getTime() + (await this.slotsService.intendedDurationSeconds(segment)) * 1000;
    const endsAt = nextPlanned ? Math.min(ownEnd, Date.parse(nextPlanned.start_at)) : ownEnd;
    const slot: PrayerSlot = { ...segment, status: 'RUNNING', start_at: now.toISOString(), end_at: new Date(endsAt).toISOString() };

    if (replay) this.gateway.emitSlotEnded(roomId, replay.slot.id);
    this.gateway.setReplay(roomId, { programId, block, index, slot });
    this.gateway.setSharer(roomId, AI_SHARER);
    const nextUp =
      nextPlanned && endsAt === Date.parse(nextPlanned.start_at)
        ? { title: nextPlanned.title, startsNewCreneau: true }
        : { title: block[(index + 1) % block.length].title, startsNewCreneau: index + 1 >= block.length };
    this.gateway.emitSlotStarted(roomId, slot, secondsUntil(slot.end_at), nextUp);
  }

  /**
   * Self-healing continuity guard: the room must never stay silent. If a program has no RUNNING
   * segment at all (the process was down when one ended), restart from the first segment.
   */
  private async resumeSilentPrograms(calendar: Set<string>): Promise<void> {
    const activePrograms = await this.programsService.listActive();
    for (const program of activePrograms) {
      if (calendar.has(program.id)) continue;
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

  private async transitionExpiredSlots(calendar: Set<string>): Promise<void> {
    const expired = await this.slotsService.findExpiredRunningSlots();

    for (const slot of expired) {
      if (calendar.has(slot.program_id)) continue;
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
      const roomId = toRoomId(program.community_id);
      const running =
        (await this.slotsService.findRunningSlotByProgram(program.id)) ?? this.gateway.getReplay(roomId)?.slot ?? null;
      if (!running) continue;
      this.gateway.emitSlotTick(roomId, secondsUntil(running.end_at));
    }
  }
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
}
