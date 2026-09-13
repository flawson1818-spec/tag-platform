import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser, authApi, isMfaRequired } from '../../lib/api';

const ACCESS_TOKEN_KEY = 'tag.accessToken';
const REFRESH_TOKEN_KEY = 'tag.refreshToken';
const DEVICE_TOKEN_KEY = 'tag.deviceToken';

export interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<LoginResult>;
  completeMfaChallenge: (mfaToken: string, code: string, trustDevice?: boolean) => Promise<void>;
  completeMfaRecovery: (mfaToken: string, recoveryCode: string, trustDevice?: boolean) => Promise<void>;
  requestMfaOtp: (mfaToken: string, channel: 'EMAIL' | 'WHATSAPP') => Promise<void>;
  completeMfaOtp: (mfaToken: string, code: string, trustDevice?: boolean) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function hasStoredSession(): boolean {
  return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY) && localStorage.getItem(REFRESH_TOKEN_KEY));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>(() =>
    hasStoredSession() ? 'loading' : 'anonymous',
  );

  const persistSession = useCallback(
    (accessToken: string, refreshToken: string, sessionUser: AuthUser) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      setUser(sessionUser);
      setStatus('authenticated');
    },
    [],
  );

  const clearSession = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!accessToken || !refreshToken) return;

    authApi
      .me(accessToken)
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() =>
        authApi
          .refresh(refreshToken)
          .then((res) => persistSession(res.access_token, res.refresh_token, res.user))
          .catch(clearSession),
      );
  }, [clearSession, persistSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY) ?? undefined;
      const res = await authApi.login({ email, password, deviceToken });
      if (isMfaRequired(res)) {
        return { mfaRequired: true, mfaToken: res.mfaToken };
      }
      persistSession(res.access_token, res.refresh_token, res.user);
      return { mfaRequired: false };
    },
    [persistSession],
  );

  const completeMfaChallenge = useCallback(
    async (mfaToken: string, code: string, trustDevice = false) => {
      const res = await authApi.mfaChallenge(mfaToken, code, trustDevice);
      if (res.device_token) localStorage.setItem(DEVICE_TOKEN_KEY, res.device_token);
      persistSession(res.access_token, res.refresh_token, res.user);
    },
    [persistSession],
  );

  const completeMfaRecovery = useCallback(
    async (mfaToken: string, recoveryCode: string, trustDevice = false) => {
      const res = await authApi.mfaRecoveryChallenge(mfaToken, recoveryCode, trustDevice);
      if (res.device_token) localStorage.setItem(DEVICE_TOKEN_KEY, res.device_token);
      persistSession(res.access_token, res.refresh_token, res.user);
    },
    [persistSession],
  );

  const requestMfaOtp = useCallback(async (mfaToken: string, channel: 'EMAIL' | 'WHATSAPP') => {
    await authApi.requestMfaOtp(mfaToken, channel);
  }, []);

  const completeMfaOtp = useCallback(
    async (mfaToken: string, code: string, trustDevice = false) => {
      const res = await authApi.mfaOtpVerify(mfaToken, code, trustDevice);
      if (res.device_token) localStorage.setItem(DEVICE_TOKEN_KEY, res.device_token);
      persistSession(res.access_token, res.refresh_token, res.user);
    },
    [persistSession],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await authApi.register({ email, password, displayName });
      persistSession(res.access_token, res.refresh_token, res.user);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => undefined);
    }
    clearSession();
  }, [clearSession]);

  const value: AuthContextValue = {
    user,
    status,
    login,
    completeMfaChallenge,
    completeMfaRecovery,
    requestMfaOtp,
    completeMfaOtp,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
