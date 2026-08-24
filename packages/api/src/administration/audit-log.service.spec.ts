import { AuditLogService } from './audit-log.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('AuditLogService', () => {
  describe('record', () => {
    it('inserts the actor/action/entity, defaulting before/after/entity_id to null when omitted', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ audit_logs: chain });
      const service = new AuditLogService(supabase as never);

      await service.record('actor-1', 'USER_DELETED', 'user');

      expect(chain.insert).toHaveBeenCalledWith({
        actor_id: 'actor-1',
        action: 'USER_DELETED',
        entity_type: 'user',
        entity_id: null,
        before: null,
        after: null,
      });
    });

    it('accepts a null actor (system-initiated actions)', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ audit_logs: chain });
      const service = new AuditLogService(supabase as never);

      await service.record(null, 'SYSTEM_CLEANUP', 'system');

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ actor_id: null }));
    });
  });

  describe('list', () => {
    it('filters by entity_type only when provided', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ audit_logs: chain });
      const service = new AuditLogService(supabase as never);

      await service.list({ entityType: 'user' } as never);

      expect(chain.eq).toHaveBeenCalledWith('entity_type', 'user');
    });

    it('does not filter by entity_type when none is given', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ audit_logs: chain });
      const service = new AuditLogService(supabase as never);

      await service.list({} as never);

      expect(chain.eq).not.toHaveBeenCalled();
    });
  });
});
