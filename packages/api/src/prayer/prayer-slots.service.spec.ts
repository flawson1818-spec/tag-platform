import { PrayerSlotsService } from './prayer-slots.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const RUNNING_SLOT_A = {
  id: 'slot-a',
  program_id: 'program-1',
  order_index: 0,
  title: 'Ouverture',
  category: 'Famille',
  importance: 'Normal',
  start_at: '2026-01-01T08:05:00.000Z',
  end_at: '2026-01-01T08:10:00.000Z',
  guided_text: null,
  bible_references: [],
  recommended_songs: [],
  leader_user_id: null,
  status: 'RUNNING',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  leader: null,
};

const RUNNING_SLOT_B = { ...RUNNING_SLOT_A, id: 'slot-b', start_at: '2026-01-01T08:00:00.000Z' };

describe('PrayerSlotsService', () => {
  describe('findRunningSlotByProgram', () => {
    it('returns null when no slot is running', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.findRunningSlotByProgram('program-1');

      expect(result).toBeNull();
    });

    it('returns the single running slot untouched', async () => {
      const chain = createQueryChain({ data: [RUNNING_SLOT_A], error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.findRunningSlotByProgram('program-1');

      expect(result?.id).toBe('slot-a');
      expect(chain.update).not.toHaveBeenCalled();
    });

    /**
     * Regression test for the duplicate-RUNNING-slots bug encountered this session (caused by
     * concurrent zombie engine instances): self-heals by keeping only the most recently started
     * slot as canonical and marking every other RUNNING slot FINISHED, rather than crashing.
     */
    it('self-heals by keeping the most recent slot and finishing the rest when more than one is RUNNING', async () => {
      // First call returns both duplicates (ordered start_at desc, so A is most recent);
      // subsequent .update(...).eq(...) calls for markFinished(row.id) resolve via the same chain.
      const chain = createQueryChain({ data: [RUNNING_SLOT_A, RUNNING_SLOT_B], error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.findRunningSlotByProgram('program-1');

      expect(result?.id).toBe('slot-a');
      expect(chain.update).toHaveBeenCalledWith({ status: 'FINISHED' });
      expect(chain.eq).toHaveBeenCalledWith('id', 'slot-b');
    });
  });

  describe('remove', () => {
    it('refuses to delete a RUNNING slot', async () => {
      const chain = createQueryChain({ data: RUNNING_SLOT_A, error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      await expect(service.remove('slot-a')).rejects.toThrow(
        'Cannot delete a slot that has already run or is running',
      );
    });

    it('refuses to delete a FINISHED slot', async () => {
      const chain = createQueryChain({ data: { ...RUNNING_SLOT_A, status: 'FINISHED' }, error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      await expect(service.remove('slot-a')).rejects.toThrow(
        'Cannot delete a slot that has already run or is running',
      );
    });

    it('deletes a SCHEDULED slot', async () => {
      const chain = createQueryChain({ data: { ...RUNNING_SLOT_A, status: 'SCHEDULED' }, error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      await service.remove('slot-a');

      expect(chain.delete).toHaveBeenCalled();
    });
  });

  describe('findNext', () => {
    it('returns the slot at the next order index within the same program', async () => {
      const current = { ...RUNNING_SLOT_A, order_index: 0 };
      const next = { ...RUNNING_SLOT_A, id: 'slot-next', order_index: 1 };
      const supabase = createSupabaseServiceMock({
        prayer_slots: [
          createQueryChain({ data: current, error: null }), // findById
          createQueryChain({ data: next, error: null }), // findByOrderIndex
        ],
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.findNext('slot-a');

      expect(result.id).toBe('slot-next');
    });

    it('wraps back to the first slot when the current slot is last in the program', async () => {
      const current = { ...RUNNING_SLOT_A, order_index: 2 };
      const first = { ...RUNNING_SLOT_A, id: 'slot-first', order_index: 0 };
      const supabase = createSupabaseServiceMock({
        prayer_slots: [
          createQueryChain({ data: current, error: null }), // findById
          createQueryChain({ data: null, error: null }), // findByOrderIndex -> none
          createQueryChain({ data: first, error: null }), // findFirstByProgram
        ],
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.findNext('slot-a');

      expect(result.id).toBe('slot-first');
    });
  });

  describe('create', () => {
    it('auto-assigns the next order_index when none is given', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_slots: [
          createQueryChain({ data: [], error: null }), // assertNoOverlap: no conflicts
          createQueryChain({ data: { order_index: 2 }, error: null }), // nextOrderIndex lookup
          createQueryChain({ data: { ...RUNNING_SLOT_A, order_index: 3 }, error: null }), // insert
        ],
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.create('program-1', {
        title: 'Nouveau',
        category: 'Famille',
        startTime: '08:00',
        endTime: '08:10',
      } as never);

      expect(result.order_index).toBe(3);
    });

    it('starts at order_index 0 for the first slot in a program', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_slots: [
          createQueryChain({ data: [], error: null }), // assertNoOverlap: no conflicts
          createQueryChain({ data: null, error: null }), // nextOrderIndex: no existing slots
          createQueryChain({ data: { ...RUNNING_SLOT_A, order_index: 0 }, error: null }), // insert
        ],
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.create('program-1', {
        title: 'Premier',
        category: 'Famille',
        startTime: '08:00',
        endTime: '08:10',
      } as never);

      expect(result.order_index).toBe(0);
    });

    it('rejects a slot that overlaps an existing one in the same program', async () => {
      const chain = createQueryChain({
        data: [{ title: 'Ouverture', start_at: '2000-01-01T08:05:00.000Z', end_at: '2000-01-01T08:10:00.000Z' }],
        error: null,
      });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      await expect(
        service.create('program-1', {
          title: 'Nouveau',
          category: 'Famille',
          startTime: '08:08',
          endTime: '08:15',
        } as never),
      ).rejects.toThrow(/chevauche/);
      expect(chain.insert).not.toHaveBeenCalled();
    });

    it('rejects a slot whose endTime is not after startTime', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      await expect(
        service.create('program-1', {
          title: 'Invalide',
          category: 'Famille',
          startTime: '08:10',
          endTime: '08:10',
        } as never),
      ).rejects.toThrow('endAt must be after startAt');
      expect(chain.select).not.toHaveBeenCalled();
    });

    it('allows a slot immediately adjacent to (not overlapping) an existing one', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_slots: [
          createQueryChain({ data: [], error: null }), // assertNoOverlap: adjacent, no conflicts
          createQueryChain({ data: null, error: null }), // nextOrderIndex
          createQueryChain({ data: { ...RUNNING_SLOT_A, order_index: 0 }, error: null }), // insert
        ],
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.create('program-1', {
        title: 'Suivant',
        category: 'Famille',
        startTime: '08:10',
        endTime: '08:20',
      } as never);

      expect(result).toBeDefined();
    });

    it('rolls an overnight slot (end before start) onto the next reference day', async () => {
      const chains = [
        createQueryChain({ data: [], error: null }), // assertNoOverlap: no conflicts
        createQueryChain({ data: null, error: null }), // nextOrderIndex
        createQueryChain({ data: { ...RUNNING_SLOT_A, order_index: 0 }, error: null }), // insert
      ];
      const supabase = createSupabaseServiceMock({ prayer_slots: chains });
      const service = new PrayerSlotsService(supabase as never);

      await service.create('program-1', {
        title: 'Veille de nuit',
        category: 'Famille',
        startTime: '23:30',
        endTime: '00:15',
      } as never);

      expect(chains[2].insert).toHaveBeenCalledWith(
        expect.objectContaining({ start_at: '2000-01-01T23:30:00.000Z', end_at: '2000-01-02T00:15:00.000Z' }),
      );
    });
  });

  describe('update', () => {
    it('refuses to change the time of a slot that is no longer SCHEDULED', async () => {
      const chain = createQueryChain({ data: { ...RUNNING_SLOT_A, status: 'RUNNING' }, error: null });
      const supabase = createSupabaseServiceMock({ prayer_slots: chain });
      const service = new PrayerSlotsService(supabase as never);

      await expect(service.update('slot-a', { startTime: '09:00' } as never)).rejects.toThrow(
        /can be changed/,
      );
    });

    it('allows changing the time of a SCHEDULED slot, excluding itself from the overlap check', async () => {
      const scheduled = { ...RUNNING_SLOT_A, status: 'SCHEDULED', start_at: '2000-01-01T08:00:00.000Z', end_at: '2000-01-01T08:10:00.000Z' };
      const chains = [
        createQueryChain({ data: scheduled, error: null }), // findById
        createQueryChain({ data: [], error: null }), // assertNoOverlap: no conflicts
        createQueryChain({ data: { ...scheduled, start_at: '2000-01-01T09:00:00.000Z', end_at: '2000-01-01T09:10:00.000Z' }, error: null }), // update
      ];
      const supabase = createSupabaseServiceMock({ prayer_slots: chains });
      const service = new PrayerSlotsService(supabase as never);

      await service.update('slot-a', { startTime: '09:00', endTime: '09:10' } as never);

      expect(chains[1].neq).toHaveBeenCalledWith('id', 'slot-a');
      expect(chains[2].update).toHaveBeenCalledWith(
        expect.objectContaining({ start_at: '2000-01-01T09:00:00.000Z', end_at: '2000-01-01T09:10:00.000Z' }),
      );
    });

    it('leaves the time untouched when neither startTime nor endTime is given', async () => {
      const scheduled = { ...RUNNING_SLOT_A, status: 'SCHEDULED' };
      const chains = [
        createQueryChain({ data: scheduled, error: null }), // findById
        createQueryChain({ data: { ...scheduled, title: 'Renommé' }, error: null }), // update
      ];
      const supabase = createSupabaseServiceMock({ prayer_slots: chains });
      const service = new PrayerSlotsService(supabase as never);

      await service.update('slot-a', { title: 'Renommé' } as never);

      expect(chains[1].update).toHaveBeenCalledWith(
        expect.not.objectContaining({ start_at: expect.anything() }),
      );
    });
  });

  describe('injectUrgent', () => {
    it('cuts short the running slot and activates the urgent one in its place', async () => {
      const urgentSlot = { ...RUNNING_SLOT_A, id: 'slot-urgent', order_index: 4, importance: 'Urgent' };
      const chains = [
        createQueryChain({ data: [RUNNING_SLOT_A], error: null }), // findRunningSlotByProgram
        createQueryChain({ data: null, error: null }), // cutShort
        createQueryChain({ data: [], error: null }), // assertNoOverlap: no conflicts
        createQueryChain({ data: { order_index: 3 }, error: null }), // nextOrderIndex
        createQueryChain({ data: urgentSlot, error: null }), // insert
        createQueryChain({ data: { ...urgentSlot, status: 'RUNNING' }, error: null }), // activate
      ];
      const supabase = createSupabaseServiceMock({ prayer_slots: chains });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.injectUrgent('program-1', {
        title: 'Sujet urgent',
        category: 'Urgence',
        durationSeconds: 300,
      });

      expect(result.interrupted?.id).toBe('slot-a');
      expect(chains[1].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'FINISHED' }));
      expect(result.activated.id).toBe('slot-urgent');
      expect(result.activated.status).toBe('RUNNING');
    });

    it('activates the urgent slot directly when nothing is currently running', async () => {
      const urgentSlot = { ...RUNNING_SLOT_A, id: 'slot-urgent', order_index: 0, importance: 'Urgent' };
      const chains = [
        createQueryChain({ data: [], error: null }), // findRunningSlotByProgram: none
        createQueryChain({ data: [], error: null }), // assertNoOverlap: no conflicts
        createQueryChain({ data: null, error: null }), // nextOrderIndex: no existing slots
        createQueryChain({ data: urgentSlot, error: null }), // insert
        createQueryChain({ data: { ...urgentSlot, status: 'RUNNING' }, error: null }), // activate
      ];
      const supabase = createSupabaseServiceMock({ prayer_slots: chains });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.injectUrgent('program-1', {
        title: 'Sujet urgent',
        category: 'Urgence',
        durationSeconds: 300,
      });

      expect(result.interrupted).toBeNull();
      expect(result.activated.id).toBe('slot-urgent');
    });
  });

  describe('listLeaderCandidates', () => {
    it('deduplicates a user who holds multiple eligible roles', async () => {
      const rows = [
        { users: { id: 'user-1', display_name: 'Believer One' } },
        { users: { id: 'user-1', display_name: 'Believer One' } },
        { users: { id: 'user-2', display_name: 'Believer Two' } },
      ];
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: rows, error: null }),
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.listLeaderCandidates();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id).sort()).toEqual(['user-1', 'user-2']);
    });

    it('filters by search term case-insensitively', async () => {
      const rows = [
        { users: { id: 'user-1', display_name: 'Believer One' } },
        { users: { id: 'user-2', display_name: 'Someone Else' } },
      ];
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: rows, error: null }),
      });
      const service = new PrayerSlotsService(supabase as never);

      const result = await service.listLeaderCandidates('believer');

      expect(result).toEqual([{ id: 'user-1', display_name: 'Believer One' }]);
    });
  });
});
