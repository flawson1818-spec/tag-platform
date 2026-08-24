import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { login, completeMfaChallenge } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
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
      await completeMfaChallenge(mfaToken, code);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (mfaToken) {
    return (
      <div className="auth-page">
        <h2>Vérification en deux étapes</h2>
        <p className="hint">Entre le code à 6 chiffres généré par ton application d'authentification.</p>
        <form onSubmit={handleMfaSubmit} className="auth-form">
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
            {submitting ? 'Vérification…' : 'Valider'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
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
