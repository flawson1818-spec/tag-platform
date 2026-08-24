import { IsIn } from 'class-validator';

export const EXPORT_SCOPES = ['prayer_requests', 'testimonies', 'users', 'communities'] as const;

export class RequestExportDto {
  @IsIn(EXPORT_SCOPES)
  scope!: string;
}
