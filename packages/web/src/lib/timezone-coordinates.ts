interface Coords {
  lat: number;
  lon: number;
}

// Repères réels (ville représentative) pour les fuseaux les plus courants.
// Pour un fuseau absent de cette liste, on retombe sur son décalage UTC actuel
// pour approximer une longitude — jamais de position individuelle inventée.
const KNOWN_TIMEZONES: Record<string, Coords> = {
  UTC: { lat: 5.6, lon: -0.2 },
  'Etc/UTC': { lat: 5.6, lon: -0.2 },
  'Europe/Paris': { lat: 48.85, lon: 2.35 },
  'Europe/London': { lat: 51.5, lon: -0.12 },
  'Europe/Berlin': { lat: 52.52, lon: 13.4 },
  'Europe/Madrid': { lat: 40.42, lon: -3.7 },
  'Europe/Rome': { lat: 41.9, lon: 12.5 },
  'Europe/Brussels': { lat: 50.85, lon: 4.35 },
  'Europe/Lisbon': { lat: 38.72, lon: -9.14 },
  'Europe/Moscow': { lat: 55.75, lon: 37.6 },
  'America/New_York': { lat: 40.7, lon: -74.0 },
  'America/Chicago': { lat: 41.9, lon: -87.6 },
  'America/Denver': { lat: 39.7, lon: -104.99 },
  'America/Los_Angeles': { lat: 34.0, lon: -118.2 },
  'America/Toronto': { lat: 43.7, lon: -79.4 },
  'America/Montreal': { lat: 45.5, lon: -73.6 },
  'America/Sao_Paulo': { lat: -23.5, lon: -46.6 },
  'America/Bogota': { lat: 4.7, lon: -74.1 },
  'America/Mexico_City': { lat: 19.4, lon: -99.1 },
  'America/Port-au-Prince': { lat: 18.6, lon: -72.3 },
  'Africa/Lagos': { lat: 6.5, lon: 3.4 },
  'Africa/Abidjan': { lat: 5.3, lon: -4.0 },
  'Africa/Accra': { lat: 5.6, lon: -0.2 },
  'Africa/Kinshasa': { lat: -4.3, lon: 15.3 },
  'Africa/Douala': { lat: 4.05, lon: 9.7 },
  'Africa/Nairobi': { lat: -1.3, lon: 36.8 },
  'Africa/Johannesburg': { lat: -26.2, lon: 28.0 },
  'Africa/Cairo': { lat: 30.0, lon: 31.2 },
  'Africa/Casablanca': { lat: 33.6, lon: -7.6 },
  'Africa/Dakar': { lat: 14.7, lon: -17.4 },
  'Africa/Tunis': { lat: 36.8, lon: 10.2 },
  'Asia/Kolkata': { lat: 22.0, lon: 79.0 },
  'Asia/Calcutta': { lat: 22.0, lon: 79.0 },
  'Asia/Shanghai': { lat: 31.2, lon: 121.5 },
  'Asia/Tokyo': { lat: 35.7, lon: 139.7 },
  'Asia/Manila': { lat: 14.6, lon: 121.0 },
  'Asia/Jakarta': { lat: -6.2, lon: 106.8 },
  'Asia/Dubai': { lat: 25.2, lon: 55.3 },
  'Asia/Seoul': { lat: 37.6, lon: 127.0 },
  'Asia/Singapore': { lat: 1.35, lon: 103.8 },
  'Asia/Beirut': { lat: 33.9, lon: 35.5 },
  'Australia/Sydney': { lat: -33.9, lon: 151.2 },
  'Pacific/Auckland': { lat: -36.8, lon: 174.8 },
};

export function approxCoordsForTimezone(timezone: string): Coords {
  const known = KNOWN_TIMEZONES[timezone];
  if (known) return known;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const offsetLabel = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
    const match = offsetLabel.match(/GMT([+-]\d+)(?::(\d+))?/);
    const hours = match ? Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0) : 0;
    const lon = Math.max(-180, Math.min(180, hours * 15));
    return { lat: 15, lon };
  } catch {
    return { lat: 5.6, lon: -0.2 };
  }
}

export function projectCoords(lat: number, lon: number, width: number, height: number) {
  return {
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  };
}

export interface OrthographicPoint {
  x: number;
  y: number;
  /** -1 (far side, directly behind the globe) to 1 (facing the viewer head-on); also used to fake foreshortening near the limb. */
  depth: number;
  /** Whether the point sits on the visible (near) hemisphere for the current rotation. */
  visible: boolean;
}

// Standard orthographic (globe) projection, viewed head-on from lon 0 / lat 0 before rotation.
// `rotationDeg` spins the sphere around its polar axis — used to animate a turning globe.
export function projectOrthographic(
  lat: number,
  lon: number,
  rotationDeg: number,
  radius: number,
): OrthographicPoint {
  const phi = (lat * Math.PI) / 180;
  const lambda = ((lon + rotationDeg) * Math.PI) / 180;
  const depth = Math.cos(phi) * Math.cos(lambda);
  return {
    x: radius * Math.cos(phi) * Math.sin(lambda),
    y: -radius * Math.sin(phi),
    depth,
    visible: depth > 0,
  };
}
