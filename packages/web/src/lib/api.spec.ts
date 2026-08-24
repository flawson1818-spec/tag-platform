import { authApi, prayerApi, tagsApi } from './api';

// Same storage keys api.ts uses internally (kept private there on purpose — see its own
// comment on why it doesn't import AuthContext's constants).
const ACCESS_TOKEN_KEY = 'tag.accessToken';
const REFRESH_TOKEN_KEY = 'tag.refreshToken';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const AUTH_RESPONSE = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  expires_in: 900,
  token_type: 'Bearer',
  user: { id: 'user-1', email: 'a@b.com' },
};

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not attempt a token refresh for a request with no Authorization header', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Invalid credentials' }, 401));

    await expect(authApi.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      'Invalid credentials',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token once on a 401 and transparently retries the original request', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale-access-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'valid-refresh-token');
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401)) // original call, stale token
      .mockResolvedValueOnce(jsonResponse(AUTH_RESPONSE, 200)) // POST /auth/refresh
      .mockResolvedValueOnce(jsonResponse([{ id: 'leader-1', display_name: 'Aclan' }], 200)); // retried call

    const result = await prayerApi.leaderCandidates('stale-access-token');

    expect(result).toEqual([{ id: 'leader-1', display_name: 'Aclan' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3000/api/auth/refresh');
    // The retried call must carry the freshly-issued token, not the stale one.
    const retriedHeaders = fetchMock.mock.calls[2][1].headers;
    expect(retriedHeaders.Authorization).toBe('Bearer new-access-token');
    // And localStorage must now hold the new pair for subsequent requests.
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-access-token');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('new-refresh-token');
  });

  it('propagates the original 401 when there is no refresh token to fall back on', async () => {
    // No refresh token in storage at all.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));

    await expect(prayerApi.leaderCandidates('stale-access-token')).rejects.toThrow('Unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the original 401 when the refresh call itself fails, without retrying', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'expired-refresh-token');
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401)) // original call
      .mockResolvedValueOnce(jsonResponse({ message: 'Refresh token expired' }, 401)); // refresh fails too

    await expect(prayerApi.leaderCandidates('stale-access-token')).rejects.toThrow('Unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A failed refresh clears the now-useless stored session.
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it('never retries more than once even if the freshly-refreshed token also gets a 401', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'valid-refresh-token');
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse(AUTH_RESPONSE, 200))
      .mockResolvedValueOnce(jsonResponse({ message: 'Still unauthorized' }, 401));

    await expect(prayerApi.leaderCandidates('stale-access-token')).rejects.toThrow('Still unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('parses a validation error whose message is an array into a comma-joined string', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: ['email must be an email', 'password too short'] }, 400),
    );

    await expect(tagsApi.list()).rejects.toThrow('email must be an email, password too short');
  });

  it('returns undefined for a 204 No Content response instead of trying to parse a body', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) });

    await expect(tagsApi.remove('tag-1')).resolves.toBeUndefined();
  });
});
