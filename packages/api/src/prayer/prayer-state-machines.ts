import { ConflictException } from '@nestjs/common';
import { PrayerProgramStatus } from './prayer-program.entity';
import { PrayerRequestStatus } from './prayer-request.entity';

/** See docs/10_STATE_MACHINES.md — CAMPAIGN (reused by PrayerProgram.status). */
const PROGRAM_TRANSITIONS: Record<PrayerProgramStatus, PrayerProgramStatus[]> = {
  DRAFT: ['PLANNED'],
  PLANNED: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

/** See docs/10_STATE_MACHINES.md — PRAYER REQUEST. */
const REQUEST_TRANSITIONS: Record<PrayerRequestStatus, PrayerRequestStatus[]> = {
  DRAFT: ['NEW'],
  NEW: ['ASSIGNED', 'ARCHIVED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING', 'ANSWERED'],
  WAITING: ['ANSWERED'],
  ANSWERED: ['ARCHIVED'],
  ARCHIVED: ['RESTORED'],
  RESTORED: ['NEW'],
};

function assertCampaignShapedTransition(from: PrayerProgramStatus, to: PrayerProgramStatus, entity: string): void {
  if (from === to) return;
  if (!PROGRAM_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(`Cannot transition ${entity} from ${from} to ${to}`);
  }
}

export function assertProgramTransition(from: PrayerProgramStatus, to: PrayerProgramStatus): void {
  assertCampaignShapedTransition(from, to, 'prayer program');
}

export function assertRequestTransition(from: PrayerRequestStatus, to: PrayerRequestStatus): void {
  if (from === to) return;
  if (!REQUEST_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(`Cannot transition prayer request from ${from} to ${to}`);
  }
}

/** Campaign.status reuses the same CAMPAIGN state machine as PrayerProgram.status. */
export type CampaignStatus = PrayerProgramStatus;

export function assertCampaignTransition(from: CampaignStatus, to: CampaignStatus): void {
  assertCampaignShapedTransition(from, to, 'campaign');
}
