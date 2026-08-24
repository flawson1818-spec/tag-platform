import { IsIn } from 'class-validator';

const PARTICIPANT_ROLES = ['ATTENDEE', 'SPEAKER', 'MODERATOR'];

export class UpdateParticipantRoleDto {
  @IsIn(PARTICIPANT_ROLES)
  role!: 'ATTENDEE' | 'SPEAKER' | 'MODERATOR';
}
