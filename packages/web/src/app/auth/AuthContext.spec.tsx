import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, getAccessToken, useAuth } from './AuthContext';
import { authApi } from '../../lib/api';

const ACCESS_TOKEN_KEY = 'tag.accessToken';
const REFRESH_TOKEN_KEY = 'tag.refreshToken';

const USER = { id: 'user-1', email: 'a@b.com', display_name: 'Believer' };

function Probe() {
  const { status, user, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  let meSpy: ReturnType<typeof vi.spyOn>;
  let loginSpy: ReturnType<typeof vi.spyOn>;
  let refreshSpy: ReturnType<typeof vi.spyOn>;
  let logoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    meSpy = vi.spyOn(authApi, 'me');
    loginSpy = vi.spyOn(authApi, 'login');
    refreshSpy = vi.spyOn(authApi, 'refresh');
    logoutSpy = vi.spyOn(authApi, 'logout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts anonymous and never calls the API when there is no stored session', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('anonymous');
    expect(meSpy).not.toHaveBeenCalled();
  });

  it('starts loading then becomes authenticated when the stored access token is still valid', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'valid-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
    meSpy.mockResolvedValue(USER as never);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('a@b.com');
  });

  it('falls back to refreshing the token when the stored access token has expired', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'expired-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'still-valid-refresh-token');
    meSpy.mockRejectedValue(new Error('Unauthorized'));
    refreshSpy.mockResolvedValue({
      access_token: 'fresh-access-token',
      refresh_token: 'fresh-refresh-token',
      expires_in: 900,
      token_type: 'Bearer',
      user: USER,
    } as never);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(getAccessToken()).toBe('fresh-access-token');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('fresh-refresh-token');
  });

  it('clears the session and goes anonymous when both the access and refresh tokens are dead', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'expired-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'also-expired-refresh-token');
    meSpy.mockRejectedValue(new Error('Unauthorized'));
    refreshSpy.mockRejectedValue(new Error('Refresh token expired'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it('logout clears the session locally even if the API call fails', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'a-token');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'a-refresh-token');
    meSpy.mockResolvedValue(USER as never);
    logoutSpy.mockRejectedValue(new Error('network down'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));

    screen.getByText('logout').click();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(getAccessToken()).toBeNull();
  });

  it('login persists the session returned by the API', async () => {
    loginSpy.mockResolvedValue({
      access_token: 'a1',
      refresh_token: 'r1',
      expires_in: 900,
      token_type: 'Bearer',
      user: USER,
    } as never);

    function LoginProbe() {
      const { status, login } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button onClick={() => login('a@b.com', 'password')}>login</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>,
    );

    screen.getByText('login').click();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(getAccessToken()).toBe('a1');
  });

  it('login does not persist a session when the account requires MFA', async () => {
    loginSpy.mockResolvedValue({ mfaRequired: true, mfaToken: 'pending-token' } as never);
    let captured: { mfaRequired: boolean; mfaToken?: string } | undefined;

    function LoginProbe() {
      const { login } = useAuth();
      return (
        <button
          onClick={async () => {
            captured = await login('a@b.com', 'password');
          }}
        >
          login
        </button>
      );
    }

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>,
    );

    screen.getByText('login').click();

    await waitFor(() => expect(captured).toEqual({ mfaRequired: true, mfaToken: 'pending-token' }));
    expect(getAccessToken()).toBeNull();
  });

  it('completeMfaChallenge persists the session once the code is verified', async () => {
    const mfaChallengeSpy = vi.spyOn(authApi, 'mfaChallenge').mockResolvedValue({
      access_token: 'a2',
      refresh_token: 'r2',
      expires_in: 900,
      token_type: 'Bearer',
      user: USER,
    } as never);

    function ChallengeProbe() {
      const { status, completeMfaChallenge } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button onClick={() => completeMfaChallenge('pending-token', '123456')}>verify</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <ChallengeProbe />
      </AuthProvider>,
    );

    screen.getByText('verify').click();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(mfaChallengeSpy).toHaveBeenCalledWith('pending-token', '123456');
    expect(getAccessToken()).toBe('a2');
  });

  it('completeMfaRecovery persists the session once a valid recovery code is consumed', async () => {
    const mfaRecoverySpy = vi.spyOn(authApi, 'mfaRecoveryChallenge').mockResolvedValue({
      access_token: 'a3',
      refresh_token: 'r3',
      expires_in: 900,
      token_type: 'Bearer',
      user: USER,
    } as never);

    function RecoveryProbe() {
      const { status, completeMfaRecovery } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button onClick={() => completeMfaRecovery('pending-token', 'AAAA-BBBB-CCCC')}>recover</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <RecoveryProbe />
      </AuthProvider>,
    );

    screen.getByText('recover').click();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(mfaRecoverySpy).toHaveBeenCalledWith('pending-token', 'AAAA-BBBB-CCCC');
    expect(getAccessToken()).toBe('a3');
  });
});
