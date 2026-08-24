import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../lib/api';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="auth-page">
        <h2>Mot de passe réinitialisé</h2>
        <p className="confirmation">
          Ton mot de passe a été mis à jour. Toutes tes sessions précédentes ont été déconnectées.
        </p>
        <button type="button" onClick={() => navigate('/login')}>
          Se connecter
        </button>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h2>Réinitialiser le mot de passe</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder="Code reçu par e-mail"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Nouveau mot de passe"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <p className="hint">Minimum 12 caractères, avec majuscule, minuscule, chiffre et caractère spécial.</p>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Réinitialisation…' : 'Réinitialiser'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/forgot-password">Redemander un code</Link>
      </p>
    </div>
  );
}

export default ResetPasswordPage;
