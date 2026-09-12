import { FormEvent, useEffect, useState } from 'react';
import { TrustedDevice, authApi } from '../../lib/api';
import { getAccessToken, useAuth } from './AuthContext';

type Step = 'idle' | 'awaiting-code' | 'enabled';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MfaSettingsPage() {
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
      <h2>Vérification en deux étapes</h2>
      <p className="hint">
        Protège ton compte avec un code à usage unique généré par une application comme Google
        Authenticator ou Authy, en plus de ton mot de passe.
      </p>

      {step === 'idle' && (
        <button onClick={startSetup} disabled={submitting}>
          {submitting ? 'Préparation…' : 'Activer la vérification en deux étapes'}
        </button>
      )}

      {step === 'awaiting-code' && secret && (
        <form onSubmit={handleEnable} className="auth-form">
          <p className="hint">
            Ajoute cette clé dans ton application d'authentification, puis entre le code généré
            pour confirmer.
          </p>
          <p>
            <code>{secret}</code>
          </p>
          {otpauthUrl && (
            <p className="hint">
              <a href={otpauthUrl}>Ouvrir directement dans l'application (mobile)</a>
            </p>
          )}
          <input
            type="text"
            inputMode="numeric"
            placeholder="Code à 6 chiffres"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
            autoFocus
          />
          <button type="submit" disabled={submitting || code.length !== 6}>
            {submitting ? 'Vérification…' : 'Confirmer'}
          </button>
        </form>
      )}

      {step === 'enabled' && (
        <>
          <p className="hint">La vérification en deux étapes est activée sur ce compte.</p>

          {recoveryCodes && (
            <div className="confirmation">
              <p>
                <strong>Note ces codes de récupération dans un endroit sûr.</strong> Chacun ne peut
                être utilisé qu'une seule fois, si tu perds l'accès à ton application
                d'authentification. Ils ne seront plus jamais affichés.
              </p>
              <ul>
                {recoveryCodes.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setRecoveryCodes(null)}>
                J'ai bien noté mes codes
              </button>
            </div>
          )}

          <form onSubmit={handleDisable} className="auth-form">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Code à 6 chiffres pour désactiver"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required
            />
            <button type="submit" disabled={submitting || code.length !== 6}>
              {submitting ? 'Désactivation…' : 'Désactiver'}
            </button>
          </form>

          <div className="request-row" style={{ marginTop: '1rem' }}>
            <h3>Appareils de confiance</h3>
            <p className="hint">
              Un appareil sur lequel tu as coché « Se souvenir de cet appareil » ne redemande pas
              de code de vérification pendant 30 jours.
            </p>
            {trustedDevices.length === 0 && <p className="hint">Aucun appareil de confiance enregistré.</p>}
            <ul className="request-list">
              {trustedDevices.map((device) => (
                <li key={device.id} className="request-row">
                  <div className="request-meta">
                    <span>{device.label ?? 'Appareil sans nom'}</span>
                    <span className="hint">Expire le {formatDate(device.expires_at)}</span>
                  </div>
                  <button type="button" className="link-button" onClick={() => handleRevokeDevice(device.id)}>
                    Révoquer
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
