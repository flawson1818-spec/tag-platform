import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

export class CreateEventPollDto {
  @IsString()
  @MaxLength(280)
  question!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options!: string[];
}
