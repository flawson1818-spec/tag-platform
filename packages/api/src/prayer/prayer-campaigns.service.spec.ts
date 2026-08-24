import { PrayerCampaignsService } from './prayer-campaigns.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const DRAFT_CAMPAIGN = {
  id: 'campaign-1',
  community_id: null,
  title: 'Jeûne de 21 jours',
  status: 'DRAFT',
  start_date: null,
  end_date: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

function buildService(supabase: ReturnType<typeof createSupabaseServiceMock>) {
  return new PrayerCampaignsService(supabase as never);
}

describe('PrayerCampaignsService', () => {
  describe('create', () => {
    it('always starts a new campaign at DRAFT', async () => {
      const chain = createQueryChain({ data: DRAFT_CAMPAIGN, error: null });
      const supabase = createSupabaseServiceMock({ campaigns: chain });
      const service = buildService(supabase);

      await service.create({ title: 'Jeûne de 21 jours' } as never, 'actor-1');

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }));
    });
  });

  describe('updateStatus — reuses the CAMPAIGN state machine', () => {
    it('allows DRAFT -> PLANNED', async () => {
      const supabase = createSupabaseServiceMock({
        campaigns: [
          createQueryChain({ data: DRAFT_CAMPAIGN, error: null }),
          createQueryChain({ data: { ...DRAFT_CAMPAIGN, status: 'PLANNED' }, error: null }),
        ],
      });
      const service = buildService(supabase);

      const result = await service.updateStatus('campaign-1', 'PLANNED' as never, 'actor-1');

      expect(result.status).toBe('PLANNED');
    });

    it('rejects skipping straight from DRAFT to ACTIVE', async () => {
      const supabase = createSupabaseServiceMock({
        campaigns: createQueryChain({ data: DRAFT_CAMPAIGN, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.updateStatus('campaign-1', 'ACTIVE' as never, 'actor-1')).rejects.toThrow(
        'Cannot transition campaign from DRAFT to ACTIVE',
      );
    });

    it('rejects any transition out of the terminal ARCHIVED status', async () => {
      const supabase = createSupabaseServiceMock({
        campaigns: createQueryChain({ data: { ...DRAFT_CAMPAIGN, status: 'ARCHIVED' }, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.updateStatus('campaign-1', 'ACTIVE' as never, 'actor-1')).rejects.toThrow(
        'Cannot transition campaign from ARCHIVED to ACTIVE',
      );
    });
  });

  describe('findById', () => {
    it('throws NotFoundException for an unknown or soft-deleted campaign', async () => {
      const supabase = createSupabaseServiceMock({
        campaigns: createQueryChain({ data: null, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.findById('missing')).rejects.toThrow('Campaign missing not found');
    });
  });
});
