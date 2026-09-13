import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

type MfaMode = 'totp' | 'recovery' | 'otp';

export function LoginPage() {
  const { login, completeMfaChallenge, completeMfaRecovery, requestMfaOtp, completeMfaOtp } = useAuth();
  const navigate = useNavigate();
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
        <h2>Vérification en deux étapes</h2>
        {mfaMode === 'recovery' && <p className="hint">Entre l'un de tes codes de récupération à usage unique.</p>}
        {mfaMode === 'totp' && (
          <p className="hint">Entre le code à 6 chiffres généré par ton application d'authentification.</p>
        )}
        {mfaMode === 'otp' && (
          <p className="hint">
            {otpSent
              ? `Un code à 6 chiffres a été envoyé par ${otpSent === 'EMAIL' ? 'e-mail' : 'WhatsApp'}.`
              : 'Reçois un code à usage unique par e-mail ou WhatsApp.'}
          </p>
        )}

        {mfaMode === 'otp' && !otpSent && (
          <div className="request-form">
            <button type="button" onClick={() => handleSendOtp('EMAIL')} disabled={otpSending}>
              {otpSending ? 'Envoi…' : 'Recevoir par e-mail'}
            </button>
            <button type="button" onClick={() => handleSendOtp('WHATSAPP')} disabled={otpSending}>
              {otpSending ? 'Envoi…' : 'Recevoir par WhatsApp'}
            </button>
          </div>
        )}

        {(mfaMode !== 'otp' || otpSent) && (
          <form onSubmit={handleMfaSubmit} className="auth-form">
            {mfaMode === 'recovery' ? (
              <input
                type="text"
                placeholder="Code de récupération"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                required
                autoFocus
              />
            ) : (
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
            )}
            <label className="hint">
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
              {' '}Se souvenir de cet appareil pendant 30 jours
            </label>
            <button
              type="submit"
              disabled={submitting || (mfaMode === 'recovery' ? !recoveryCode : code.length !== 6)}
            >
              {submitting ? 'Vérification…' : 'Valider'}
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}

        <p>
          {mfaMode !== 'totp' && (
            <button type="button" className="link-button" onClick={() => switchMfaMode('totp')}>
              J'ai mon application d'authentification
            </button>
          )}
        </p>
        <p>
          {mfaMode !== 'otp' && (
            <button type="button" className="link-button" onClick={() => switchMfaMode('otp')}>
              Recevoir un code par e-mail ou WhatsApp
            </button>
          )}
        </p>
        <p>
          {mfaMode !== 'recovery' && (
            <button type="button" className="link-button" onClick={() => switchMfaMode('recovery')}>
              J'ai perdu mon appareil — utiliser un code de récupération
            </button>
          )}
        </p>
        <p>
          <button type="button" className="link-button" onClick={() => setMfaToken(null)}>
            Retour
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h2>Connexion</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="email"
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p>
        Pas encore de compte ? <Link to="/register">Créer un compte</Link>
      </p>
      <p>
        <Link to="/forgot-password">Mot de passe oublié ?</Link>
      </p>
    </div>
  );
}

export default LoginPage;
