import { webOrigins } from './web-origin';

describe('webOrigins', () => {
  it('defaults to the local dev server', () => {
    expect(webOrigins('')).toBe('http://localhost:4200');
    expect(webOrigins(undefined)).toBe('http://localhost:4200');
  });
  it('accepts one address, ignoring a trailing slash', () => {
    expect(webOrigins('https://tour.vercel.app/')).toBe('https://tour.vercel.app');
  });
  it('accepts several, separated by commas', () => {
    expect(webOrigins(' https://a.app , https://b.org/ ')).toEqual(['https://a.app', 'https://b.org']);
  });
});
