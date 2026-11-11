/**
 * Worship between two prayer sections (cahier des charges unifié §4, salle de prière): the room
 * never falls silent, and when one hour of prayer hands over to the next a short time of praise
 * plays — a YouTube or Spotify link chosen by the administration, rotated from one interlude to
 * the next. Only the providers' own embeddable players are used; nothing is hosted here.
 */

function envSeconds(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Length of the praise between two sections. 0 turns the interlude off. */
export const WORSHIP_SECONDS = envSeconds('PRAYER_WORSHIP_SECONDS', 300);
/** A gap in the calendar up to this long is filled with praise; a longer one with the AI's prayer. */
export const WORSHIP_GAP_MAX_SECONDS = envSeconds('PRAYER_WORSHIP_GAP_MAX_SECONDS', 1800);
export const WORSHIP_TITLE = 'Temps de louange';

export interface WorshipTrack {
  /** The provider's official embed URL, built only from a validated id. */
  embedUrl: string;
  provider: 'youtube' | 'spotify';
  /** Kept for clients that only know YouTube videos. */
  videoId?: string;
  link: string;
}

const YT_VIDEO = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const YT_LIST = /youtube\.com\/.*[?&]list=([a-zA-Z0-9_-]{10,64})/;
const SPOTIFY = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|track|artist)\/([a-zA-Z0-9]{10,40})/;

/** Turns a link pasted by the administration into an embeddable player, or null if unknown. */
export function parseWorshipLink(link: string): WorshipTrack | null {
  const value = link.trim();
  const list = value.match(YT_LIST);
  const video = value.match(YT_VIDEO);
  if (video) {
    const playlist = list ? `&list=${list[1]}` : '';
    return { provider: 'youtube', videoId: video[1], embedUrl: `https://www.youtube.com/embed/${video[1]}?autoplay=1${playlist}`, link: value };
  }
  if (list) return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/videoseries?list=${list[1]}&autoplay=1`, link: value };
  const spotify = value.match(SPOTIFY);
  if (spotify) return { provider: 'spotify', embedUrl: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`, link: value };
  return null;
}

/** Default links from the environment (comma or newline separated), used when a program has none. */
export function defaultWorshipLinks(): string[] {
  return (process.env.PRAYER_WORSHIP_LINKS ?? '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => parseWorshipLink(s) !== null);
}

/**
 * Is `next` the start of a new prayer section? Sections are written as hours, so a hand-over
 * on the hour, or a segment titled as an opening ("Prière d'ouverture"), starts one.
 */
export function startsNewSection(next: { title: string; start_at: string }): boolean {
  if (/ouverture|d[ée]but|opening/i.test(next.title)) return true;
  const start = new Date(next.start_at);
  return start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0;
}
