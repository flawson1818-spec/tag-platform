import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLog } from './audit-log.entity';

const AUDIT_LOG_COLUMNS =
  'id, actor_id, action, entity_type, entity_id, before, after, ip, user_agent, trace_id, created_at';

/**
 * `audit_logs` is append-only at the database level (INSERT-only rules — see
 * supabase/schema.sql). This service only ever inserts and reads.
 *
 * ip/user_agent/trace_id are left null for now: capturing them consistently needs a
 * request-scoped interceptor threaded through every mutation, which is a cross-cutting
 * change wider than this pass — recorded as a known gap rather than wired ad hoc per call site.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly supabase: SupabaseService) {}

  async record(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId?: string,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase.client.from('audit_logs').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      before: before ?? null,
      after: after ?? null,
    });
    if (error) throw new InternalServerErrorException(error.message);
  }

  async list(query: PaginationQueryDto & { entityType?: string }): Promise<PaginatedResult<AuditLog>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.supabase.client
      .from('audit_logs')
      .select(AUDIT_LOG_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.entityType) request = request.eq('entity_type', query.entityType);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as AuditLog[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }
}
