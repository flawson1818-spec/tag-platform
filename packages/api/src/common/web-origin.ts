/**
 * Sites allowed to call the API and open its sockets (CORS). WEB_ORIGIN holds one address or
 * several separated by commas, e.g. "https://tour-avant-garde.vercel.app,https://www.monsite.org".
 * A trailing slash is ignored. Defaults to the local dev server.
 */
export function webOrigins(value = process.env.WEB_ORIGIN): string | string[] {
  const list = (value ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (list.length === 0) return 'http://localhost:4200';
  return list.length === 1 ? list[0] : list;
}
