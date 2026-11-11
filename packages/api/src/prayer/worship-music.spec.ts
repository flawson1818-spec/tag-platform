import { describe, expect, it } from 'vitest';
import { parseWorshipLink, startsNewSection } from './worship-music';

describe('parseWorshipLink', () => {
  it('reads a YouTube video, a playlist and a Spotify playlist', () => {
    expect(parseWorshipLink('https://www.youtube.com/watch?v=abcdefghijk')?.embedUrl).toBe('https://www.youtube.com/embed/abcdefghijk?autoplay=1');
    expect(parseWorshipLink('https://youtu.be/abcdefghijk')?.videoId).toBe('abcdefghijk');
    expect(parseWorshipLink('https://www.youtube.com/playlist?list=PLabcdefghij12')?.embedUrl).toBe(
      'https://www.youtube.com/embed/videoseries?list=PLabcdefghij12&autoplay=1',
    );
    expect(parseWorshipLink('https://open.spotify.com/intl-fr/playlist/37i9dQZF1DXcb6CQIjdqKy?si=x')?.embedUrl).toBe(
      'https://open.spotify.com/embed/playlist/37i9dQZF1DXcb6CQIjdqKy',
    );
  });

  it('refuses anything else', () => {
    expect(parseWorshipLink('https://example.com/song.mp3')).toBeNull();
    expect(parseWorshipLink('javascript:alert(1)')).toBeNull();
  });
});

describe('startsNewSection', () => {
  it('sees a new section on the hour or at an opening', () => {
    expect(startsNewSection({ title: 'Adoration', start_at: '2026-11-11T13:00:00Z' })).toBe(true);
    expect(startsNewSection({ title: "Prière d'ouverture", start_at: '2026-11-11T13:07:00Z' })).toBe(true);
    expect(startsNewSection({ title: 'Prière 3', start_at: '2026-11-11T13:20:00Z' })).toBe(false);
  });
});
