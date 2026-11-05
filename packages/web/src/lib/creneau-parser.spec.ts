import { formatVerse, parseCreneau, splitVerse } from './creneau-parser';

// The créneau exactly as a moderator sent it (WCI Soviépé, Thursday 5 November 2026).
const EXAMPLE = `JEUDI 05 NOVEMBRE 2026

Prière d'ouverture 12:00-12:03

Adoration et louange  12:03-12:10

12:10-12:15
Prière1:Père merci pour ta puissance divine disponible pour nous rendre ministère et nous donner une nouvelle chance dans la destinée au nom de Jésus

 Jean 10:10 « Le voleur ne vient que pour dérober, égorger et détruire ; moi, je suis venu afin que les brebis aient la vie, et qu'elles soient dans l'abondance ».

12:15-12:20
 Prière2: Père par la Vie divine résident dans chaque membre de cette église wci soviepe et sur cette plateforme réveil tout nos dons potentiel qui dormait en nous au nom de Jésus

Jean 4:14
mais celui qui boira de l'eau que je lui donnerai n'aura jamais soif, et l'eau que je lui donnerai deviendra en lui une source d'eau qui jaillira jusque dans la vie éternelle.

12:20-12:25
Prière3: Père par ta puissance divine  réveil à chaque membre de cette église wci soviepe et sur cette plateforme  tout.nos don spécial au nom de Jésus

Joël 2:25
Je vous remplacerai les années Qu'ont dévorées la sauterelle, Le jélek, le hasil et le gazam, Ma grande armée que j'avais envoyée contre vous.


12:25-12:30
Prière4: Père par la Vie divine résident dans chaque membre de cette église wci soviepe et sur cette plateforme restaurre tout grâce spécial  que nous avons perdus au nom de Jésus

Jean 4:14
mais celui qui boira de l'eau que je lui donnerai n'aura jamais soif, et l'eau que je lui donnerai deviendra en lui une source d'eau qui jaillira jusque dans la vie éternelle.

Louange intense 12:30-12:33

12:33-12:38
Prière5: Père par ta puissance divine  tu as restauré dans chaque membre de cette église wci soviepe et sur cette plateforme  toute potentiel qu'ils ont perdus au nom de Jésus

Joël 2:25
Je vous remplacerai les années Qu'ont dévorées la sauterelle, Le jélek, le hasil et le gazam, Ma grande armée que j'avais envoyée contre vous.

12:38-12:43
 Prière6: Père par ta Miséricorde  divine  restaure à chaque membre de cette église wci soviepe et sur cette plateforme  leur grâce de destiné
perdue au nom de Jésus

Malachie 3:6
Car je suis l'Eternel, je ne change pas; Et vous, enfants de Jacob, vous n'avez pas été consumés.

12:43-12:48
Prière 7: Père merci car tu restaurer  déjà nos dons et potentiel perdu en tant qu'église et en tant que famille au nom de Jésus

 1 Thessaloniciens 5:18
Rendez grâces en toutes choses, car c'est à votre égard la volonté de Dieu en Jésus-Christ.

Supplication Personnelle
12:48-12:53

Louange intense 12:53-12:58

Clôture et Bénédiction finale 12:58-13:00 Voici un exemple de créneau de prière. C'est une prière.`;

describe('parseCreneau', () => {
  const result = parseCreneau(EXAMPLE);

  it('finds the heading and all 13 segments in order, with their own durations', () => {
    expect(result.heading).toBe('JEUDI 05 NOVEMBRE 2026');
    expect(result.segments.map((s) => [s.start, s.end, s.title])).toEqual([
      ['12:00', '12:03', "Prière d'ouverture"],
      ['12:03', '12:10', 'Adoration et louange'],
      ['12:10', '12:15', 'Prière 1'],
      ['12:15', '12:20', 'Prière 2'],
      ['12:20', '12:25', 'Prière 3'],
      ['12:25', '12:30', 'Prière 4'],
      ['12:30', '12:33', 'Louange intense'],
      ['12:33', '12:38', 'Prière 5'],
      ['12:38', '12:43', 'Prière 6'],
      ['12:43', '12:48', 'Prière 7'],
      ['12:48', '12:53', 'Supplication Personnelle'],
      ['12:53', '12:58', 'Louange intense'],
      ['12:58', '13:00', 'Clôture et Bénédiction finale'],
    ]);
    expect(result.segments.map((s) => s.durationSeconds / 60)).toEqual([3, 7, 5, 5, 5, 5, 3, 5, 5, 5, 5, 5, 2]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps the prayer text, joining a prayer written over two lines', () => {
    expect(result.segments[2].prayer).toBe(
      'Père merci pour ta puissance divine disponible pour nous rendre ministère et nous donner une nouvelle chance dans la destinée au nom de Jésus',
    );
    expect(result.segments[8].prayer).toBe(
      'Père par ta Miséricorde divine restaure à chaque membre de cette église wci soviepe et sur cette plateforme leur grâce de destiné perdue au nom de Jésus',
    );
  });

  it('reads verses written on one line or with the text on the next line', () => {
    expect(result.segments[2].verses).toEqual([
      {
        reference: 'Jean 10:10',
        text: "Le voleur ne vient que pour dérober, égorger et détruire ; moi, je suis venu afin que les brebis aient la vie, et qu'elles soient dans l'abondance ».",
      },
    ]);
    expect(result.segments[3].verses[0].reference).toBe('Jean 4:14');
    expect(result.segments[3].verses[0].text).toMatch(/^mais celui qui boira .* vie éternelle\.$/);
    expect(result.segments[9].verses[0].reference).toBe('1 Thessaloniciens 5:18');
    expect(result.segments[8].verses[0]).toEqual({
      reference: 'Malachie 3:6',
      text: "Car je suis l'Eternel, je ne change pas; Et vous, enfants de Jacob, vous n'avez pas été consumés.",
    });
  });

  it('gives a worship segment no prayer text, and ignores a remark after the closing time', () => {
    expect(result.segments[1].prayer).toBe('');
    expect(result.segments[1].verses).toEqual([]);
    expect(result.segments[12].prayer).toBe('');
    // The short title on the line before "12:48-12:53" is not glued onto prayer 7's verse.
    expect(result.segments[9].prayer).not.toContain('Supplication');
  });

  it('handles a créneau crossing midnight', () => {
    const night = parseCreneau('Veillée 23:50-00:10\nPrière1: Garde-nous cette nuit');
    expect(night.segments[0].durationSeconds).toBe(20 * 60);
    expect(night.segments[0].end).toBe('00:10');
  });

  it('round-trips a verse through the stored one-line form', () => {
    const stored = formatVerse({ reference: 'Jean 4:14', text: 'mais celui qui boira…' });
    expect(stored).toBe('Jean 4:14 — mais celui qui boira…');
    expect(splitVerse(stored)).toEqual({ reference: 'Jean 4:14', text: 'mais celui qui boira…' });
    expect(splitVerse('Psaume 100:1-5')).toEqual({ reference: 'Psaume 100:1-5', text: '' });
  });
});
