import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../lib/api';

export function ResetPasswordPage() {
  const { t } = useTranslation();
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
        <h2>{t('resetPassword.doneTitle')}</h2>
        <p className="confirmation">{t('resetPassword.doneMessage')}</p>
        <button type="button" onClick={() => navigate('/login')}>
          {t('resetPassword.login')}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h2>{t('resetPassword.title')}</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder={t('resetPassword.codePlaceholder')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder={t('resetPassword.newPasswordPlaceholder')}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <p className="hint">{t('resetPassword.passwordHint')}</p>
        <button type="submit" disabled={submitting}>
          {submitting ? t('resetPassword.resetting') : t('resetPassword.reset')}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/forgot-password">{t('resetPassword.requestNewCode')}</Link>
      </p>
    </div>
  );
}

export default ResetPasswordPage;
