import { WhatsAppService } from './whatsapp.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('WhatsAppService', () => {
  describe('send', () => {
    it('persists the message honestly at status CREATED — no provider is configured to actually send it', async () => {
      const chain = createQueryChain({
        data: {
          id: 'wa-1',
          user_id: 'user-1',
          to_phone: '+22500000000',
          body: 'Prions ensemble',
          status: 'CREATED',
          sent_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ whatsapp_messages: chain });
      const service = new WhatsAppService(supabase as never);

      const result = await service.send('+22500000000', 'Prions ensemble', 'user-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ to_phone: '+22500000000', status: 'CREATED' }),
      );
      expect(result.status).toBe('CREATED');
    });

    it('allows an anonymous send (no userId) by recording user_id as null', async () => {
      const chain = createQueryChain({
        data: { id: 'wa-1', user_id: null, to_phone: '+225000', body: 'x', status: 'CREATED', sent_at: null, created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ whatsapp_messages: chain });
      const service = new WhatsAppService(supabase as never);

      await service.send('+225000', 'x');

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
    });

    it('throws InternalServerErrorException when the insert fails', async () => {
      const supabase = createSupabaseServiceMock({
        whatsapp_messages: createQueryChain({ data: null, error: { message: 'db down' } }),
      });
      const service = new WhatsAppService(supabase as never);

      await expect(service.send('+225000', 'x')).rejects.toThrow('db down');
    });
  });
});
