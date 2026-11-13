/**
 * The verse that carries a prayer request into the room, by category (Louis Segond 1910, public
 * domain). Stored like any verse of a créneau: "Référence — texte".
 */
const VERSES: Record<string, string> = {
  Maladie: 'Jérémie 30:17 — Mais je te guérirai, je panserai tes plaies, dit l’Éternel.',
  Mariage: 'Psaume 127:1 — Si l’Éternel ne bâtit la maison, ceux qui la bâtissent travaillent en vain.',
  Emploi: 'Philippiens 4:19 — Et mon Dieu pourvoira à tous vos besoins selon sa richesse, avec gloire, en Jésus-Christ.',
  Études:
    'Jacques 1:5 — Si quelqu’un d’entre vous manque de sagesse, qu’il la demande à Dieu, qui donne à tous simplement et sans reproche, et elle lui sera donnée.',
  Visa: 'Psaume 121:8 — L’Éternel gardera ton départ et ton arrivée, dès maintenant et à jamais.',
  Enfant: 'Psaume 127:3 — Voici, des fils sont un héritage de l’Éternel, le fruit des entrailles est une récompense.',
  Délivrance: 'Jean 8:36 — Si donc le Fils vous affranchit, vous serez réellement libres.',
  Famille: 'Josué 24:15 — Moi et ma maison, nous servirons l’Éternel.',
  Autre:
    'Philippiens 4:6 — Ne vous inquiétez de rien ; mais en toute chose faites connaître vos besoins à Dieu par des prières et des supplications, avec des actions de grâces.',
};

export function verseForRequest(category: string): string {
  return VERSES[category] ?? VERSES.Autre;
}

/**
 * What the room reads for a request: the request first, then the prayer that carries it. The
 * request is read as written — its author made it public — never with their name.
 */
export function requestGuidedText(description: string, prayer: string | null): string {
  const subject = `Sujet de prière : ${description.trim()}`;
  return prayer?.trim() ? `${subject}\n\n${prayer.trim()}` : `${subject}\n\nSeigneur, nous te présentons ce sujet. Agis selon ta parole et ta bonté.`;
}
