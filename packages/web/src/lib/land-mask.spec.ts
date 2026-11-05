import { isLand, landCellCentres } from './land-mask';

describe('land mask', () => {
  it('knows where the continents are', () => {
    expect(isLand(5.3, -4.0)).toBe(true); // Abidjan region
    expect(isLand(6.1, 1.2)).toBe(true); // Lomé region
    expect(isLand(48.8, 2.3)).toBe(true); // Paris
    expect(isLand(-23.5, -46.6)).toBe(true); // São Paulo
    expect(isLand(0, -30)).toBe(false); // mid-Atlantic
    expect(isLand(-30, 80)).toBe(false); // Indian Ocean
    expect(isLand(0, -150)).toBe(false); // Pacific
  });

  it('has a plausible number of land cells (about 30 % of the sphere, more cells near the poles)', () => {
    const cells = landCellCentres();
    expect(cells.length).toBeGreaterThan(8000);
    expect(cells.length).toBeLessThan(11000);
  });
});
