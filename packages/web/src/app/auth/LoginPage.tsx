import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

type MfaMode = 'totp' | 'recovery' | 'otp';

export function LoginPage() {
  const { login, completeMfaChallenge, completeMfaRecovery, requestMfaOtp, completeMfaOtp } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [mfaMode, setMfaMode] = useState<MfaMode>('totp');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [otpSent, setOtpSent] = useState<'EMAIL' | 'WHATSAPP' | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mfaMode === 'recovery') {
        await completeMfaRecovery(mfaToken, recoveryCode, trustDevice);
      } else if (mfaMode === 'otp') {
        await completeMfaOtp(mfaToken, code, trustDevice);
      } else {
        await completeMfaChallenge(mfaToken, code, trustDevice);
      }
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async (channel: 'EMAIL' | 'WHATSAPP') => {
    if (!mfaToken) return;
    setError(null);
    setOtpSending(true);
    try {
      await requestMfaOtp(mfaToken, channel);
      setOtpSent(channel);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOtpSending(false);
    }
  };

  const switchMfaMode = (mode: MfaMode) => {
    setMfaMode(mode);
    setOtpSent(null);
    setCode('');
    setRecoveryCode('');
    setError(null);
  };

  if (mfaToken) {
    return (
      <div className="auth-page">
        <h2>{t('auth.mfa.title')}</h2>
        {mfaMode === 'recovery' && <p className="hint">{t('auth.mfa.recoveryHint')}</p>}
        {mfaMode === 'totp' && <p className="hint">{t('auth.mfa.totpHint')}</p>}
        {mfaMode === 'otp' && (
          <p className="hint">
            {otpSent
              ? t('auth.mfa.otpHintSent', {
                  channel: otpSent === 'EMAIL' ? t('auth.mfa.channelEmail') : t('auth.mfa.channelWhatsapp'),
                })
              : t('auth.mfa.otpHintUnsent')}
          </p>
        )}

        {mfaMode === 'otp' && !otpSent && (
          <div className="request-form">
            <button type="button" onClick={() => handleSendOtp('EMAIL')} disabled={otpSending}>
              {otpSending ? t('auth.mfa.sending') : t('auth.mfa.receiveByEmail')}
            </button>
            <button type="button" onClick={() => handleSendOtp('WHATSAPP')} disabled={otpSending}>
              {otpSending ? t('auth.mfa.sending') : t('auth.mfa.receiveByWhatsapp')}
            </button>
          </div>
        )}

        {(mfaMode !== 'otp' || otpSent) && (
          <form onSubmit={handleMfaSubmit} className="auth-form">
            {mfaMode === 'recovery' ? (
              <input
                type="text"
                placeholder={t('auth.mfa.recoveryCodePlaceholder')}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                required
                autoFocus
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                placeholder={t('auth.mfa.sixDigitPlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            )}
            <label className="hint">
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
              {' '}{t('auth.mfa.trustDevice')}
            </label>
            <button
              type="submit"
              disabled={submitting || (mfaMode === 'recovery' ? !recoveryCode : code.length !== 6)}
            >
              {submitting ? t('auth.mfa.verifying') : t('auth.mfa.submit')}
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}

        <p>
          {mfaMode !== 'totp' && (
            <button type="button" className="link-button" onClick={() => switchMfaMode('totp')}>
              {t('auth.mfa.useAuthenticator')}
            </button>
          )}
        </p>
        <p>
          {mfaMode !== 'otp' && (
            <button type="button" className="link-button" onClick={() => switchMfaMode('otp')}>
              {t('auth.mfa.receiveOtp')}
            </button>
          )}
        </p>
        <p>
          {mfaMode !== 'recovery' && (
            <button type="button" className="link-button" onClick={() => switchMfaMode('recovery')}>
              {t('auth.mfa.lostDevice')}
            </button>
          )}
        </p>
        <p>
          <button type="button" className="link-button" onClick={() => setMfaToken(null)}>
            {t('auth.mfa.back')}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h2>{t('auth.login.title')}</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="email"
          placeholder={t('auth.login.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder={t('auth.login.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p>
        {t('auth.login.noAccount')} <Link to="/register">{t('auth.login.createAccount')}</Link>
      </p>
      <p>
        <Link to="/forgot-password">{t('auth.login.forgotPassword')}</Link>
      </p>
    </div>
  );
}

export default LoginPage;
