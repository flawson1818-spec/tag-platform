import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrustedDevice, authApi } from '../../lib/api';
import { getAccessToken, useAuth } from './AuthContext';
import i18n from '../../i18n/config';

type Step = 'idle' | 'awaiting-code' | 'enabled';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MfaSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(user?.mfa_enabled ? 'enabled' : 'idle');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);

  const refreshTrustedDevices = () => {
    const token = getAccessToken();
    if (!token) return;
    authApi.listTrustedDevices(token).then(setTrustedDevices).catch(() => setTrustedDevices([]));
  };

  useEffect(() => {
    if (step === 'enabled') refreshTrustedDevices();
  }, [step]);

  const handleRevokeDevice = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    authApi
      .revokeTrustedDevice(token, id)
      .then(refreshTrustedDevices)
      .catch((err) => setError((err as Error).message));
  };

  const startSetup = () => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    authApi
      .mfaSetup(token)
      .then((res) => {
        setSecret(res.secret);
        setOtpauthUrl(res.otpauthUrl);
        setStep('awaiting-code');
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSubmitting(false));
  };

  const handleEnable = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    authApi
      .mfaEnable(token, code)
      .then((res) => {
        setStep('enabled');
        setCode('');
        setRecoveryCodes(res.recoveryCodes.length > 0 ? res.recoveryCodes : null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSubmitting(false));
  };

  const handleDisable = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    authApi
      .mfaDisable(token, code)
      .then(() => {
        setStep('idle');
        setSecret(null);
        setOtpauthUrl(null);
        setCode('');
        setRecoveryCodes(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="auth-page">
      <h2>{t('mfaSettings.title')}</h2>
      <p className="hint">{t('mfaSettings.intro')}</p>

      {step === 'idle' && (
        <button onClick={startSetup} disabled={submitting}>
          {submitting ? t('mfaSettings.preparing') : t('mfaSettings.enable')}
        </button>
      )}

      {step === 'awaiting-code' && secret && (
        <form onSubmit={handleEnable} className="auth-form">
          <p className="hint">{t('mfaSettings.setupHint')}</p>
          <p>
            <code>{secret}</code>
          </p>
          {otpauthUrl && (
            <p className="hint">
              <a href={otpauthUrl}>{t('mfaSettings.openInApp')}</a>
            </p>
          )}
          <input
            type="text"
            inputMode="numeric"
            placeholder={t('mfaSettings.sixDigitPlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
            autoFocus
          />
          <button type="submit" disabled={submitting || code.length !== 6}>
            {submitting ? t('mfaSettings.verifying') : t('mfaSettings.confirm')}
          </button>
        </form>
      )}

      {step === 'enabled' && (
        <>
          <p className="hint">{t('mfaSettings.enabledHint')}</p>

          {recoveryCodes && (
            <div className="confirmation">
              <p>
                <strong>{t('mfaSettings.recoveryCodesWarning')}</strong> {t('mfaSettings.recoveryCodesDetail')}
              </p>
              <ul>
                {recoveryCodes.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setRecoveryCodes(null)}>
                {t('mfaSettings.recoveryCodesNoted')}
              </button>
            </div>
          )}

          <form onSubmit={handleDisable} className="auth-form">
            <input
              type="text"
              inputMode="numeric"
              placeholder={t('mfaSettings.disableCodePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required
            />
            <button type="submit" disabled={submitting || code.length !== 6}>
              {submitting ? t('mfaSettings.disabling') : t('mfaSettings.disable')}
            </button>
          </form>

          <div className="request-row" style={{ marginTop: '1rem' }}>
            <h3>{t('mfaSettings.trustedDevicesTitle')}</h3>
            <p className="hint">{t('mfaSettings.trustedDevicesIntro')}</p>
            {trustedDevices.length === 0 && <p className="hint">{t('mfaSettings.noTrustedDevices')}</p>}
            <ul className="request-list">
              {trustedDevices.map((device) => (
                <li key={device.id} className="request-row">
                  <div className="request-meta">
                    <span>{device.label ?? t('mfaSettings.unnamedDevice')}</span>
                    <span className="hint">{t('mfaSettings.expiresOn', { date: formatDate(device.expires_at) })}</span>
                  </div>
                  <button type="button" className="link-button" onClick={() => handleRevokeDevice(device.id)}>
                    {t('mfaSettings.revoke')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default MfaSettingsPage;
