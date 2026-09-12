import { useEffect, useState } from 'react';
import { FaithPathLevel, FaithPathProgress, aiApi } from '../../lib/api';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { AiChatWidget } from './AiChatWidget';

function FaithPathPanel() {
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
    return (
      <p className="hint">
        Connecte-toi pour suivre ton parcours de découverte de la foi, étape par étape.
      </p>
    );
  }

  if (!progress) return null;

  const currentIndex = progress.steps.findIndex((s) => s.step === progress.current_step);
  const isLastStep = currentIndex === progress.steps.length - 1;

  return (
    <div className="request-row" style={{ marginBottom: '0.8rem' }}>
      <p className="hint">Ton parcours de découverte de la foi :</p>
      <div className="request-form">
        {progress.steps.map((s, index) => (
          <span key={s.step} className={index === currentIndex ? 'chip chip-status' : 'chip'}>
            {s.label}
          </span>
        ))}
      </div>

      {!progress.declared_level && (
        <div className="request-form">
          <span className="hint">Ton niveau ?</span>
          <button type="button" onClick={() => setLevel('NOUVEAU')}>
            Je découvre
          </button>
          <button type="button" onClick={() => setLevel('CONNAIT_DEJA')}>
            Je connais déjà un peu
          </button>
        </div>
      )}

      {progress.declared_level && !isLastStep && (
        <button type="button" className="link-button" onClick={advance}>
          Étape suivante →
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function AiEvangelisationPage() {
  return (
    <AiChatWidget
      title="✝️ IA Évangélisation"
      intro="Discute de questions de foi, pose des questions bibliques, ou demande à découvrir l'Évangile."
      placeholder="Qui était Jésus ?"
      send={aiApi.chatEvangelisation}
    >
      <FaithPathPanel />
    </AiChatWidget>
  );
}

export default AiEvangelisationPage;
