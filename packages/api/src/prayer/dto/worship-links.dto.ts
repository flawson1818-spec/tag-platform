import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class WorshipLinksDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  links!: string[];
}
