import { PartialType } from '@nestjs/mapped-types';
import { CreateSlotDto } from './create-slot.dto';

/**
 * Status is engine-managed (SCHEDULED -> RUNNING -> FINISHED) and not editable here. startTime/
 * endTime ARE editable — unlike the old absolute startAt/endAt, they describe a recurring time of
 * day, not "when this specific row last ran", so there's no engine-state reason to block it. The
 * service layer still rejects the edit once the slot has left SCHEDULED (see
 * PrayerSlotsService.update), since at that point its start_at/end_at have been overwritten with
 * the real current activation window and no longer represent "the next time this slot fires".
 */
export class UpdateSlotDto extends PartialType(CreateSlotDto) {}
