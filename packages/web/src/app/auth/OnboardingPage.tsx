import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from './AuthContext';
import { Community, communitiesApi, authApi, aiApi } from '../../lib/api';
import { AiChatWidget } from '../ai/AiChatWidget';

const STEP_KEYS = ['verification', 'discovery', 'community'] as const;

function VerificationStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [resent, setResent] = useState(false);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.verifyEmail(token);
      setVerified(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setError(null);
    try {
      await authApi.resendVerification(accessToken);
      setResent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="auth-page">
      <h2>{t('onboarding.verifyTitle')}</h2>
      {verified ? (
        <p className="confirmation">{t('onboarding.verified')}</p>
      ) : (
        <>
          <p className="hint">{t('onboarding.codeSentHint')}</p>
          <form onSubmit={handleVerify} className="auth-form">
            <input
              type="text"
              placeholder={t('onboarding.codePlaceholder')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <button type="submit" disabled={submitting}>
              {submitting ? t('onboarding.verifying') : t('onboarding.verify')}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <p>
            <button type="button" className="link-button" onClick={handleResend}>
              {t('onboarding.resendCode')}
            </button>
            {resent && <span className="hint"> {t('onboarding.codeResent')}</span>}
          </p>
        </>
      )}
      <button type="button" onClick={onNext}>
        {verified ? t('onboarding.continue') : t('onboarding.skipForNow')}
      </button>
    </div>
  );
}

function DiscoveryStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="onboarding-step">
      <AiChatWidget
        title={t('onboarding.discoveryTitle')}
        intro={t('onboarding.discoveryIntro')}
        placeholder={t('onboarding.discoveryPlaceholder')}
        send={aiApi.chatAccueil}
      />
      <button type="button" onClick={onNext}>
        {t('onboarding.continue')}
      </button>
    </div>
  );
}

function CommunityStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    communitiesApi
      .list(token)
      .then((res) => setCommunities(res.data.slice(0, 5)))
      .catch((err) => setError((err as Error).message));
  }, []);

  const handleJoin = async (communityId: string) => {
    const token = getAccessToken();
    if (!token || !user) return;
    try {
      await communitiesApi.join(token, communityId);
      setJoinedIds((prev) => new Set(prev).add(communityId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="auth-page">
      <h2>{t('onboarding.communityTitle')}</h2>
      <p className="hint">{t('onboarding.communityIntro')}</p>
      {error && <p className="error">{error}</p>}
      <ul className="request-list">
        {communities.map((c) => (
          <li key={c.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`communityTypes.${c.type}`, c.type)}</span>
            </div>
            <p>{c.name}</p>
            <button onClick={() => handleJoin(c.id)} disabled={joinedIds.has(c.id)}>
              {joinedIds.has(c.id) ? t('onboarding.joined') : t('onboarding.join')}
            </button>
          </li>
        ))}
      </ul>
      {communities.length === 0 && !error && <p className="hint">{t('onboarding.noCommunities')}</p>}
      <button type="button" onClick={onDone}>
        {t('onboarding.finish')}
      </button>
    </div>
  );
}

export function OnboardingPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  return (
    <div>
      <p className="hint">
        {t('onboarding.stepLabel', {
          current: step + 1,
          total: STEP_KEYS.length,
          name: t(`onboarding.steps.${STEP_KEYS[step]}`),
        })}
      </p>
      {step === 0 && <VerificationStep onNext={() => setStep(1)} />}
      {step === 1 && <DiscoveryStep onNext={() => setStep(2)} />}
      {step === 2 && <CommunityStep onDone={() => navigate('/dashboard')} />}
    </div>
  );
}

export default OnboardingPage;
