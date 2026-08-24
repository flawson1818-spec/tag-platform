import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h2>Mot de passe oublié</h2>
      {sent ? (
        <p className="confirmation">
          Si un compte existe avec cette adresse, un code de réinitialisation vient d'être envoyé.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Envoi…' : 'Envoyer le code'}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/reset-password">J'ai déjà un code</Link> — <Link to="/login">Retour à la connexion</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
