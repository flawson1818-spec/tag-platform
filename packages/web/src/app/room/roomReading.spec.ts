import { chunks, readingPlan, speakable } from './roomReading';

describe('room reading', () => {
  it('reads a prayer request first, then its verse, then the prayer — and again', () => {
    const plan = readingPlan({
      title: 'Maladie — demande de prière',
      guided_text: 'Sujet de prière : Guérison de ma mère.\n\nSeigneur, touche-la de ta main.',
      bible_references: ['Jérémie 30:17 — Mais je te guérirai, je panserai tes plaies, dit l’Éternel.'],
    });
    expect(plan.first).toEqual([
      'Sujet de prière : Guérison de ma mère.',
      'Jérémie 30:17.',
      'Mais je te guérirai, je panserai tes plaies, dit l’Éternel.',
      'Seigneur, touche-la de ta main.',
    ]);
    expect(plan.again).toEqual(plan.first);
  });

  it('reads an ordinary segment: title, prayer, verses; then prayer and verses again', () => {
    const plan = readingPlan({ title: 'Prière 1', guided_text: 'Père, merci.', bible_references: ['Jean 3:16'] });
    expect(plan.first).toEqual(['Prière 1', 'Père, merci.', 'Jean 3:16']);
    expect(plan.again).toEqual(['Père, merci.', 'Jean 3:16']);
  });

  it('speaks clean text in short pieces', () => {
    expect(speakable('[Texte IA] « Amen » 🙏')).toBe('Amen');
    expect(chunks('a '.repeat(200)).every((c) => c.length <= 180)).toBe(true);
  });
});
