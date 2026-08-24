import { ConflictException } from '@nestjs/common';
import { EventStatus } from './event.entity';

/** See docs/10_STATE_MACHINES.md — PRAYER SESSION. */
const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  CREATED: ['SCHEDULED'],
  SCHEDULED: ['OPEN'],
  OPEN: ['RUNNING'],
  RUNNING: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function assertEventTransition(from: EventStatus, to: EventStatus): void {
  if (from === to) return;
  if (!EVENT_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(`Cannot transition event from ${from} to ${to}`);
  }
}
