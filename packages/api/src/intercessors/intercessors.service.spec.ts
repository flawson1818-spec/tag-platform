import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';
import { DEFAULT_PROFILE, IntercessorsService, scoreIntercessor } from './intercessors.service';

describe('scoreIntercessor (pilot V8, out of 100)', () => {
  it('rewards the topic, availability, free capacity and an empty hand', () => {
    expect(scoreIntercessor({ availability: 'AVAILABLE', prayerSkills: ['Famille'], maxActive: 5 }, 0, 'Famille')).toMatchObject({
      score: 100,
      matchesTopic: true,
      full: false,
    });
    // Busy, no topic match, 4 of 5 taken: 10 + 5 = 15
    expect(scoreIntercessor({ availability: 'BUSY', prayerSkills: ['Santé'], maxActive: 5 }, 4, 'Emploi').score).toBe(15);
  });

  it('someone already full gets no capacity points', () => {
    expect(scoreIntercessor({ ...DEFAULT_PROFILE, maxActive: 2 }, 2, 'Visa')).toMatchObject({ score: 25, full: true });
  });

  it('matches topics without caring about case', () => {
    expect(scoreIntercessor({ ...DEFAULT_PROFILE, prayerSkills: ['famille'] }, 1, 'Famille').matchesTopic).toBe(true);
  });
});

describe('IntercessorsService.recommend', () => {
  it('ranks every intercessor for the request, best first, the admin still decides', async () => {
    const supabase = createSupabaseServiceMock({
      prayer_requests: [
        createQueryChain({ data: { id: 'r1', category: 'Famille' }, error: null }),
        createQueryChain({ data: [{ assigned_to: 'u-busy' }, { assigned_to: 'u-busy' }], error: null }),
      ],
      users: createQueryChain({
        data: [
          { id: 'u-busy', display_name: 'Paul' },
          { id: 'u-family', display_name: 'Esther' },
          { id: 'u-new', display_name: 'Jean' },
        ],
        error: null,
      }),
      intercessor_profiles: createQueryChain({
        data: [{ user_id: 'u-family', availability: 'AVAILABLE', prayer_skills: ['Famille'], max_active: 5 }],
        error: null,
      }),
    });
    const permissions = { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['u-busy', 'u-family', 'u-new']) };
    const list = await new IntercessorsService(supabase as never, permissions as never).recommend('r1');
    expect(list.map((r) => r.displayName)).toEqual(['Esther', 'Jean', 'Paul']);
    expect(list[0]).toMatchObject({ score: 100, matchesTopic: true });
    expect(list[2]).toMatchObject({ activeRequests: 2 });
  });
});
