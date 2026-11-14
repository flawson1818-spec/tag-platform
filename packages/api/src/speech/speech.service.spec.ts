import { SpeechService } from './speech.service';

function chain(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'in', 'upsert']) b[op] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

const SLOT = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Prière 1',
  guided_text: 'Père, merci pour Jean 3:16.',
  bible_references: ['Jean 3:16 — Car Dieu a tant aimé le monde'],
};

function build(tables: Record<string, unknown> = {}) {
  const supabase = { client: { from: (t: string) => chain(tables[t] ?? { data: null, error: null }), storage: { from: () => ({}) } } };
  const slots = { findById: vi.fn().mockResolvedValue(SLOT) };
  const gateway = { findLiveSlot: vi.fn().mockReturnValue(null) };
  return new SpeechService(supabase as never, slots as never, gateway as never);
}

describe('SpeechService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it('without a Google key: French, read by the device, references spoken as chapter and verse', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const view = await build().slot(SLOT.id, 'en');
    expect(view).toMatchObject({ lang: 'fr', translated: false, neural: false });
    expect(view.parts).toEqual(['Prière 1', 'Père, merci pour Jean, chapitre 3, verset 16.', 'Jean, chapitre 3, verset 16. Car Dieu a tant aimé le monde']);
  });

  it('translates everything the room shows and reads, once, into the visitor language', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'k';
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const q = (JSON.parse(init.body as string) as { q: string[] }).q;
      return new Response(JSON.stringify({ data: { translations: q.map((t) => ({ translatedText: `EN:${t}` })) } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = await build({ speech_usage: { data: { tts_chars: 0, translate_chars: 0 }, error: null }, speech_translations: { data: [], error: null } }).slot(SLOT.id, 'en');
    expect(view).toMatchObject({ lang: 'en', translated: true, title: 'EN:Prière 1' });
    expect(view.verses[0]).toEqual({ reference: 'EN:Jean 3:16', text: 'EN:Car Dieu a tant aimé le monde' });
    expect(view.parts[1]).toBe('EN:Père, merci pour Jean, chapitre 3, verset 16.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays in French when the monthly translation budget is spent', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'k';
    process.env.TRANSLATE_MONTHLY_CHAR_LIMIT = '10';
    vi.stubGlobal('fetch', vi.fn());
    const view = await build({ speech_usage: { data: { tts_chars: 0, translate_chars: 5 }, error: null }, speech_translations: { data: [], error: null } }).slot(SLOT.id, 'es');
    expect(view).toMatchObject({ lang: 'fr', translated: false });
  });
});
