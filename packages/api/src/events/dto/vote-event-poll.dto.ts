import { IsInt, Min } from 'class-validator';

export class VoteEventPollDto {
  @IsInt()
  @Min(0)
  optionIndex!: number;
}
