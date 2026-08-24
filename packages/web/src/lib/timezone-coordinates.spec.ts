import { approxCoordsForTimezone, projectCoords } from './timezone-coordinates';

describe('approxCoordsForTimezone', () => {
  it('returns the real anchor for a known timezone', () => {
    expect(approxCoordsForTimezone('Europe/Paris')).toEqual({ lat: 48.85, lon: 2.35 });
  });

  it('returns the same neutral anchor for UTC and Etc/UTC', () => {
    expect(approxCoordsForTimezone('UTC')).toEqual(approxCoordsForTimezone('Etc/UTC'));
  });

  it('falls back to an offset-derived longitude for an unlisted but valid IANA timezone', () => {
    // Asia/Kathmandu isn't in the known-anchor table, so this exercises the Intl-offset path.
    const coords = approxCoordsForTimezone('Asia/Kathmandu');
    expect(coords.lat).toBe(15);
    expect(coords.lon).toBeGreaterThan(0);
    expect(coords.lon).toBeLessThanOrEqual(180);
  });

  it('falls back to the neutral anchor instead of throwing for a bogus timezone string', () => {
    expect(approxCoordsForTimezone('Not/ARealZone')).toEqual({ lat: 5.6, lon: -0.2 });
  });
});

describe('projectCoords', () => {
  it('maps (0, 0) to the center of the projection', () => {
    expect(projectCoords(0, 0, 1000, 500)).toEqual({ x: 500, y: 250 });
  });

  it('maps the top-left corner (lat 90, lon -180) to (0, 0)', () => {
    expect(projectCoords(90, -180, 1000, 500)).toEqual({ x: 0, y: 0 });
  });

  it('maps the bottom-right corner (lat -90, lon 180) to (width, height)', () => {
    expect(projectCoords(-90, 180, 1000, 500)).toEqual({ x: 1000, y: 500 });
  });
});
