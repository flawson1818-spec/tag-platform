import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { COMMUNITY_TYPES } from '../../communities/community.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class IntercessorApplicationDto {
  /** Why they want to stand in the gap. */
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1500)
  motivation!: string;

  /** "Le soir après 20 h, le samedi matin…" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  availability?: string;

  /** Topics they carry best (famille, santé, nations…). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  prayerSkills?: string[];
}

export class CommunityApplicationDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsIn(COMMUNITY_TYPES)
  type!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1500)
  mission?: string;

  /** Reaching the church; kept for the administration only, never shown publicly. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}

export class CreateApplicationDto {
  @IsIn(['INTERCESSOR', 'COMMUNITY'])
  kind!: 'INTERCESSOR' | 'COMMUNITY';

  @IsOptional()
  @ValidateNested()
  @Type(() => IntercessorApplicationDto)
  intercessor?: IntercessorApplicationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CommunityApplicationDto)
  community?: CommunityApplicationDto;
}

export class ReviewApplicationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}
