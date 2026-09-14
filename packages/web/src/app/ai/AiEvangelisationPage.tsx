import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaithPathLevel, FaithPathProgress, aiApi } from '../../lib/api';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { AiChatWidget } from './AiChatWidget';

function FaithPathPanel() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const [progress, setProgress] = useState<FaithPathProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    aiApi.getFaithPath(token).then(setProgress).catch(() => setProgress(null));
  };

  useEffect(() => {
    if (status === 'authenticated') refresh();
  }, [status]);

  const setLevel = (level: FaithPathLevel) => {
    const token = getAccessToken();
    if (!token) return;
    aiApi.setFaithPathLevel(token, level).then(refresh).catch((err) => setError((err as Error).message));
  };

  const advance = () => {
    const token = getAccessToken();
    if (!token) return;
    aiApi.advanceFaithPath(token).then(refresh).catch((err) => setError((err as Error).message));
  };

  if (status !== 'authenticated') {
    return <p className="hint">{t('aiEvangelism.needLogin')}</p>;
  }

  if (!progress) return null;

  const currentIndex = progress.steps.findIndex((s) => s.step === progress.current_step);
  const isLastStep = currentIndex === progress.steps.length - 1;

  return (
    <div className="request-row" style={{ marginBottom: '0.8rem' }}>
      <p className="hint">{t('aiEvangelism.pathIntro')}</p>
      <div className="request-form">
        {progress.steps.map((s, index) => (
          <span key={s.step} className={index === currentIndex ? 'chip chip-status' : 'chip'}>
            {t(`faithPathSteps.${s.label}`, s.label)}
          </span>
        ))}
      </div>

      {!progress.declared_level && (
        <div className="request-form">
          <span className="hint">{t('aiEvangelism.levelQuestion')}</span>
          <button type="button" onClick={() => setLevel('NOUVEAU')}>
            {t('aiEvangelism.levelNew')}
          </button>
          <button type="button" onClick={() => setLevel('CONNAIT_DEJA')}>
            {t('aiEvangelism.levelKnown')}
          </button>
        </div>
      )}

      {progress.declared_level && !isLastStep && (
        <button type="button" className="link-button" onClick={advance}>
          {t('aiEvangelism.nextStep')}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function AiEvangelisationPage() {
  const { t } = useTranslation();
  return (
    <AiChatWidget
      title={t('aiEvangelism.title')}
      intro={t('aiEvangelism.intro')}
      placeholder={t('aiEvangelism.placeholder')}
      send={aiApi.chatEvangelisation}
    >
      <FaithPathPanel />
    </AiChatWidget>
  );
}

export default AiEvangelisationPage;
