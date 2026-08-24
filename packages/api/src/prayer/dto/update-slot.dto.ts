import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSlotDto } from './create-slot.dto';

/**
 * Status is engine-managed (SCHEDULED -> RUNNING -> FINISHED) and not editable here;
 * startAt/endAt are also engine-recomputed once a slot has run, so only content fields
 * are exposed for manual editing.
 */
export class UpdateSlotDto extends PartialType(OmitType(CreateSlotDto, ['startAt', 'endAt'] as const)) {}
