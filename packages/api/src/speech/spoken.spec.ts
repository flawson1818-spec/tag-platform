import { readingParts, speakReferences, speakable } from './spoken';

describe('spoken prayer texts', () => {
  it('reads a Bible reference as chapter and verse, never as an hour', () => {
    expect(speakReferences('Jean 3:16')).toBe('Jean, chapitre 3, verset 16');
    expect(speakReferences('1 Jean 4:7-8')).toBe('Premier Jean, chapitre 4, versets 7 à 8');
    expect(speakReferences('Cantique des cantiques 2:4')).toBe('Cantique des cantiques, chapitre 2, verset 4');
    expect(speakReferences('Réunion à 12:00')).toBe('Réunion à 12:00');
  });

  it('cleans what must not be read', () => {
    expect(speakable('[Texte IA] « Prière1: Père, merci » 🙏')).toBe('Prière 1. Père, merci');
  });

  it('reads a request first, then its verse, then the prayer', () => {
    expect(
      readingParts({
        title: 'Maladie — demande de prière',
        guided_text: 'Sujet de prière : Guérison de ma mère.\n\nSeigneur, touche-la.',
        bible_references: ['Jérémie 30:17 — Mais je te guérirai, je panserai tes plaies, dit l’Éternel.'],
      }),
    ).toEqual([
      'Sujet de prière : Guérison de ma mère.',
      'Jérémie, chapitre 30, verset 17. Mais je te guérirai, je panserai tes plaies, dit l’Éternel.',
      'Seigneur, touche-la.',
    ]);
  });
});
