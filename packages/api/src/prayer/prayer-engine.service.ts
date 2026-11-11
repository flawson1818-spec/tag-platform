import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { toRoomId } from './prayer-constants';
import { PrayerProgramsService } from './prayer-programs.service';
import { AI_SHARER, PROGRAM_SHARER, PrayerRealtimeGateway, RoomSharer } from './prayer-realtime.gateway';
import { PrayerSlot } from './prayer-slot.entity';
import { PrayerSlotsService } from './prayer-slots.service';
import { PrayerProgram } from './prayer-program.entity';
import { WORSHIP_GAP_MAX_SECONDS, WORSHIP_SECONDS, WORSHIP_TITLE, startsNewSection } from './worship-music';

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
 *
 * Between two prayer sections comes a short TIME OF PRAISE (worship-music.ts): the last minutes
 * before a new hour of prayer, a short gap of the calendar, or the hand-over of a loop créneau.
 * Worship music (the program's YouTube/Spotify links) plays during it, then the next section
 * starts. Only one program drives a room: the most recently created active one.
 */
@Injectable()
export class PrayerEngineService {
  private readonly logger = new Logger(PrayerEngineService.name);
  /** Rooms whose relay is being completed right now (tick and a click can race). */
  private readonly completing = new Set<string>();
  /** A tick still running when the next second comes (slow database) must not run twice. */
  private ticking = false;
  /** Calendar segments that close a section: when their praise starts, and what comes after. */
  private readonly sectionEnds = new Map<string, { worshipFrom: number; nextTitle: string } | null>();

  constructor(
    private readonly slotsService: PrayerSlotsService,
    private readonly programsService: PrayerProgramsService,
    private readonly gateway: PrayerRealtimeGateway,
  ) {
    this.gateway.onRelayShare((roomId, sharer) => this.completeRelay(roomId, sharer));
  }

  @Interval(1000)
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const { driving, superseded } = await this.programsService.listRoomPrograms();
      await this.silenceSuperseded(superseded);
      const calendar = new Set<string>();
      for (const program of driving) {
        if ((await this.programsService.scheduleMode(program.id)) !== 'CALENDAR') continue;
        calendar.add(program.id);
        try {
          await this.tickCalendar(program.id, toRoomId(program.community_id));
        } catch (error) {
          this.logger.error(`Calendar tick failed for program ${program.id}`, error as Error);
        }
      }
      await this.transitionExpiredSlots(calendar);
      await this.resumeSilentPrograms(driving.filter((p) => !calendar.has(p.id)));
      await this.broadcastTicks(driving);
    } catch (error) {
      this.logger.error('Prayer engine tick failed', error as Error);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * An older program still ACTIVE in a room another program now drives would make the room jump
   * between two prayers. It stays ACTIVE (the world room can never be paused) but stops speaking.
   */
  private async silenceSuperseded(programs: PrayerProgram[]): Promise<void> {
    for (const program of programs) {
      try {
        const running = await this.slotsService.findRunningSlotByProgram(program.id);
        if (running) await this.slotsService.markFinished(running.id);
      } catch (error) {
        this.logger.error(`Failed to silence superseded program ${program.id}`, error as Error);
      }
    }
  }

  /** Opens a time of praise in the room, with worship music, until `endsAt`. */
  private async startInterlude(
    roomId: string,
    programId: string,
    endsAt: number,
    nextTitle: string | null,
    base: PrayerSlot,
    fromSlotId?: string,
  ): Promise<void> {
    const now = Date.now();
    const slot = {
      ...base,
      id: `worship-${base.id}`,
      kind: 'WORSHIP' as const,
      title: WORSHIP_TITLE,
      guided_text: null,
      bible_references: [],
      status: 'RUNNING' as const,
      start_at: new Date(now).toISOString(),
      end_at: new Date(endsAt).toISOString(),
    };
    this.gateway.setInterlude(roomId, { programId, slot, fromSlotId });
    this.gateway.setSharer(roomId, AI_SHARER);
    this.gateway.emitSlotStarted(roomId, slot, secondsUntil(slot.end_at), nextTitle ? { title: nextTitle, startsNewCreneau: true } : null);
    try {
      this.gateway.startWorshipMusic(roomId, await this.programsService.nextWorshipTrack(programId));
    } catch (error) {
      this.logger.warn(`No worship music for program ${programId}: ${(error as Error).message}`);
    }
  }

  private endInterlude(roomId: string): void {
    const interlude = this.gateway.getInterlude(roomId);
    if (!interlude) return;
    this.gateway.setInterlude(roomId, null);
    this.gateway.stopWorshipMusic(roomId);
    this.gateway.emitSlotEnded(roomId, interlude.slot.id);
  }

  /** For a calendar segment: does a new section follow it, and when does its praise begin? */
  private async sectionEndOf(programId: string, slot: PrayerSlot): Promise<{ worshipFrom: number; nextTitle: string } | null> {
    if (this.sectionEnds.has(slot.id)) return this.sectionEnds.get(slot.id) ?? null;
    let info: { worshipFrom: number; nextTitle: string } | null = null;
    const end = Date.parse(slot.end_at);
    const following = await this.slotsService.findNextPlanned(programId, new Date(end - 1));
    if (following && Math.abs(Date.parse(following.start_at) - end) < 1000 && startsNewSection(following)) {
      // The praise takes the last minutes of the closing segment, at most half of it.
      const length = Math.min(WORSHIP_SECONDS * 1000, (end - Date.parse(slot.start_at)) / 2);
      if (length >= 30_000) info = { worshipFrom: end - length, nextTitle: following.title };
    }
    this.sectionEnds.set(slot.id, info);
    if (this.sectionEnds.size > 500) this.sectionEnds.delete(this.sectionEnds.keys().next().value as string);
    return info;
  }

  /**
   * One second of a calendar program: the segment planned for now runs; when its hour comes the
   * next one takes over; if nothing is planned now, the AI carries on with the last créneau,
   * segment after segment, until the next planned one starts.
   */
  private async tickCalendar(programId: string, roomId: string): Promise<void> {
    const now = new Date();
    const interlude = this.gateway.getInterlude(roomId);
    if (interlude?.programId === programId) {
      if (Date.parse(interlude.slot.end_at) > now.getTime()) return; // the praise goes on
      this.endInterlude(roomId);
    }

    const running = await this.slotsService.findRunningSlotByProgram(programId);
    const planned = await this.slotsService.findPlannedAt(programId, now);

    if (planned) {
      this.gateway.setReplay(roomId, null);
      if (running?.id !== planned.id) {
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
          continues ? { title: following.title, startsNewCreneau: startsNewSection(following) } : null,
        );
      }
      // The last minutes before a new hour of prayer: a time of praise.
      if (WORSHIP_SECONDS > 0) {
        const section = await this.sectionEndOf(programId, planned);
        if (section && now.getTime() >= section.worshipFrom && Date.parse(planned.end_at) - now.getTime() > 1000) {
          await this.startInterlude(roomId, programId, Date.parse(planned.end_at), section.nextTitle, planned);
        }
      }
      return;
    }

    // Nothing planned now: the hour that was running is over.
    if (running) await this.finish(roomId, running);

    const replay = this.gateway.getReplay(roomId);
    if (replay && replay.programId === programId && Date.parse(replay.slot.end_at) > now.getTime()) return;

    const nextPlanned = await this.slotsService.findNextPlanned(programId, now);
    // A short gap before the next section: praise fills it.
    if (
      WORSHIP_SECONDS > 0 &&
      nextPlanned &&
      Date.parse(nextPlanned.start_at) - now.getTime() <= WORSHIP_GAP_MAX_SECONDS * 1000 &&
      Date.parse(nextPlanned.start_at) - now.getTime() > 1000
    ) {
      if (replay) this.gateway.emitSlotEnded(roomId, replay.slot.id);
      this.gateway.setReplay(roomId, null);
      await this.startInterlude(roomId, programId, Date.parse(nextPlanned.start_at), nextPlanned.title, running ?? nextPlanned);
      return;
    }

    const block = replay?.programId === programId ? replay.block : await this.slotsService.findReplayBlock(programId, now);
    if (block.length === 0) {
      this.gateway.setReplay(roomId, null);
      return; // A calendar with no créneau at all: nothing to pray yet.
    }
    const index = replay?.programId === programId ? (replay.index + 1) % block.length : 0;
    const segment = block[index];
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
  private async resumeSilentPrograms(programs: PrayerProgram[]): Promise<void> {
    for (const program of programs) {
      try {
        const running = await this.slotsService.findRunningSlotByProgram(program.id);
        if (running) continue;
        const roomId = toRoomId(program.community_id);
        if (this.gateway.getInterlude(roomId)) continue;
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

        // End of the créneau: first a time of praise, then the hand-over.
        const interlude = this.gateway.getInterlude(roomId);
        if (WORSHIP_SECONDS > 0 && interlude?.fromSlotId !== slot.id) {
          const endsAt = Date.now() + WORSHIP_SECONDS * 1000;
          await this.startInterlude(roomId, slot.program_id, endsAt, next.title, slot, slot.id);
          if (this.gateway.hasModerator(roomId)) {
            // A moderator may share the next créneau during the praise; otherwise the AI does at its end.
            this.gateway.openRelay(roomId, {
              fromSlotId: slot.id,
              nextSlotId: next.id,
              nextTitle: next.title,
              programId: slot.program_id,
              deadline: endsAt,
            });
          }
          continue;
        }
        if (interlude?.fromSlotId === slot.id) {
          if (Date.parse(interlude.slot.end_at) > Date.now()) continue;
          if (this.gateway.getPendingRelay(roomId)?.fromSlotId === slot.id) {
            await this.completeRelay(roomId, AI_SHARER);
          } else {
            this.endInterlude(roomId);
            this.gateway.setSharer(roomId, AI_SHARER);
            await this.finish(roomId, slot);
            await this.start(roomId, next);
          }
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
      this.endInterlude(roomId);
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
    this.sectionEnds.delete(slot.id);
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

  private async broadcastTicks(programs: PrayerProgram[]): Promise<void> {
    for (const program of programs) {
      const roomId = toRoomId(program.community_id);
      const takeover = this.gateway.getTakeover(roomId);
      if (takeover && Date.parse(takeover.slot.end_at) <= Date.now()) this.gateway.endTakeover(roomId);
      const running =
        this.gateway.getTakeover(roomId)?.slot ??
        this.gateway.getInterlude(roomId)?.slot ??
        (await this.slotsService.findRunningSlotByProgram(program.id)) ??
        this.gateway.getReplay(roomId)?.slot ??
        null;
      if (!running) continue;
      this.gateway.emitSlotTick(roomId, secondsUntil(running.end_at));
    }
  }
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
}
