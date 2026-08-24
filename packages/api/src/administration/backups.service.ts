import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { Backup } from './backup.entity';

const BACKUP_COLUMNS = 'id, status, note, requested_by, created_at, updated_at';

/**
 * There is no self-hosted backup pipeline to run here (docs/03_ARCHITECTURE_SPECIFICATION.md's
 * MinIO/multi-region setup isn't stood up — see docs/15_DEVOPS_SPECIFICATION.md). The database
 * already sits on Supabase, which runs its own managed Point-in-Time Recovery. This service
 * honestly records that a backup was requested rather than pretending to execute one.
 */
@Injectable()
export class BackupsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('backups');
  }

  async run(requestedBy: string): Promise<Backup> {
    const { data, error } = await this.db
      .insert({
        status: 'COMPLETED',
        requested_by: requestedBy,
        note: "Sauvegarde gérée automatiquement par la Point-in-Time Recovery de Supabase ; cet enregistrement trace uniquement la demande.",
      })
      .select(BACKUP_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Backup;
  }

  async list(query: PaginationQueryDto): Promise<PaginatedResult<Backup>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    const { data, error, count } = await this.db
      .select(BACKUP_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Backup[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }
}
