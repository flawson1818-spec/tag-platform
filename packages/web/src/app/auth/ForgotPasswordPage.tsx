import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../lib/api';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
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
      <h2>{t('forgotPassword.title')}</h2>
      {sent ? (
        <p className="confirmation">{t('forgotPassword.sentMessage')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder={t('forgotPassword.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? t('forgotPassword.sending') : t('forgotPassword.send')}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/reset-password">{t('forgotPassword.haveCode')}</Link> —{' '}
        <Link to="/login">{t('forgotPassword.backToLogin')}</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
