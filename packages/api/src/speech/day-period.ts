import { DEFAULT_PRAYER_TIMEZONE } from '../prayer/zoned-time';

/**
 * The prayer follows the hour. Seven moments of the day, each with its own call to prayer and a
 * verse (Louis Segond): the morning watch, the hour of midday, the evening, the night, the
 * midnight vigil, the watch before dawn. Written in French, translated for other listeners.
 */
export type DayPeriod = 'DAWN' | 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'EVENING' | 'NIGHT' | 'MIDNIGHT' | 'VIGIL';

export interface HourTheme {
  key: DayPeriod;
  label: string;
  intro: string;
  verse: { reference: string; text: string };
}

const THEMES: Record<DayPeriod, Omit<HourTheme, 'key'>> = {
  DAWN: {
    label: 'Prière du matin',
    intro: 'Le jour se lève. Offrons au Seigneur les premières heures de cette journée, et plaçons-la entre ses mains.',
    verse: { reference: 'Psaume 5:4', text: "Éternel ! le matin tu entends ma voix ; le matin je me tourne vers toi, et je regarde." },
  },
  MORNING: {
    label: 'Prière de la matinée',
    intro: 'La journée est lancée. Prions pour nos familles, nos études, notre travail, et demandons la direction de Dieu.',
    verse: { reference: 'Psaume 118:24', text: "C'est ici la journée que l'Éternel a faite : qu'elle soit pour nous un sujet d'allégresse et de joie !" },
  },
  MIDDAY: {
    label: 'Prière de midi',
    intro: "Il est midi. Faisons une pause devant Dieu : reprenons souffle, remettons-lui nos fardeaux et rendons-lui grâce.",
    verse: { reference: 'Psaume 55:18', text: 'Le soir, le matin, à midi, je soupire et je gémis, et il entendra ma voix.' },
  },
  AFTERNOON: {
    label: "Prière de l'après-midi",
    intro: "C'est l'heure de la prière, comme au temps des apôtres. Intercédons pour l'Église, pour les malades et pour les nations.",
    verse: { reference: 'Actes 3:1', text: 'Pierre et Jean montaient au temple pour la prière de la neuvième heure.' },
  },
  EVENING: {
    label: 'Prière du soir',
    intro: "Le jour s'achève. Remercions Dieu pour sa fidélité d'aujourd'hui et déposons devant lui ce que nous portons.",
    verse: { reference: 'Psaume 141:2', text: "Que ma prière soit devant ta face comme l'encens, et l'élévation de mes mains comme le sacrifice du soir !" },
  },
  NIGHT: {
    label: 'Prière de la nuit',
    intro: "La nuit tombe. Prions pour le repos de ceux qui dorment, pour la protection des foyers, et pour ceux qui travaillent ou souffrent cette nuit.",
    verse: { reference: 'Psaume 4:9', text: "Je me couche et je m'endors en paix, car toi seul, Éternel ! tu me donnes la sécurité dans ma demeure." },
  },
  MIDNIGHT: {
    label: 'Prière de minuit',
    intro: "Il est minuit : c'est l'heure de la veille. Pendant que beaucoup dorment, nous restons éveillés pour louer Dieu et intercéder pour la ville et les nations.",
    verse: { reference: 'Psaume 119:62', text: "Je me lève au milieu de la nuit pour te louer, à cause des jugements de ta justice." },
  },
  VIGIL: {
    label: 'Veille avant l’aube',
    intro: "Nous veillons avant l'aube, comme les gardes qui attendent le matin. Tenons ferme dans l'espérance : la lumière vient.",
    verse: { reference: 'Psaume 130:6', text: "Mon âme soupire après le Seigneur, plus que les gardes ne soupirent après le matin, plus que les gardes ne soupirent après le matin." },
  },
};

/** The local hour (0–23) in a time zone. */
export function localHour(at: Date, tz: string = DEFAULT_PRAYER_TIMEZONE): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at);
  return Number(h) % 24;
}

export function periodOfHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 9) return 'DAWN';
  if (hour >= 9 && hour < 12) return 'MORNING';
  if (hour >= 12 && hour < 15) return 'MIDDAY';
  if (hour >= 15 && hour < 18) return 'AFTERNOON';
  if (hour >= 18 && hour < 21) return 'EVENING';
  if (hour >= 21) return 'NIGHT';
  if (hour < 3) return 'MIDNIGHT';
  return 'VIGIL';
}

export function hourTheme(at: Date = new Date(), tz: string = DEFAULT_PRAYER_TIMEZONE): HourTheme {
  const key = periodOfHour(localHour(at, tz));
  return { key, ...THEMES[key] };
}
