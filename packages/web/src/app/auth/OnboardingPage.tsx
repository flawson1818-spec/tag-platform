import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, useAuth } from './AuthContext';
import { Community, communitiesApi, authApi, aiApi } from '../../lib/api';
import { AiChatWidget } from '../ai/AiChatWidget';

const STEPS = ['Vérification', 'Découverte', 'Communauté'] as const;

function VerificationStep({ onNext }: { onNext: () => void }) {
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
      <h2>Vérifie ton adresse e-mail</h2>
      {verified ? (
        <p className="confirmation">Adresse vérifiée — merci !</p>
      ) : (
        <>
          <p className="hint">Un code de vérification vient de t'être envoyé par e-mail.</p>
          <form onSubmit={handleVerify} className="auth-form">
            <input
              type="text"
              placeholder="Code reçu par e-mail"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Vérification…' : 'Vérifier'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <p>
            <button type="button" className="link-button" onClick={handleResend}>
              Renvoyer le code
            </button>
            {resent && <span className="hint"> — code renvoyé.</span>}
          </p>
        </>
      )}
      <button type="button" onClick={onNext}>
        {verified ? 'Continuer' : 'Passer pour l\'instant'}
      </button>
    </div>
  );
}

function DiscoveryStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="onboarding-step">
      <AiChatWidget
        title="Fais connaissance avec l'IA Accueil"
        intro="Pose-lui une question sur le fonctionnement de TAG — comment rejoindre la salle de prière, déposer une demande, partager un témoignage…"
        placeholder="Comment ça marche ?"
        send={aiApi.chatAccueil}
      />
      <button type="button" onClick={onNext}>
        Continuer
      </button>
    </div>
  );
}

function CommunityStep({ onDone }: { onDone: () => void }) {
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
      await communitiesApi.join(token, communityId, user.id);
      setJoinedIds((prev) => new Set(prev).add(communityId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="auth-page">
      <h2>Rejoins une communauté</h2>
      <p className="hint">Optionnel — tu pourras toujours le faire plus tard depuis "Communautés".</p>
      {error && <p className="error">{error}</p>}
      <ul className="request-list">
        {communities.map((c) => (
          <li key={c.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{c.type}</span>
            </div>
            <p>{c.name}</p>
            <button onClick={() => handleJoin(c.id)} disabled={joinedIds.has(c.id)}>
              {joinedIds.has(c.id) ? 'Rejoint ✓' : 'Rejoindre'}
            </button>
          </li>
        ))}
      </ul>
      {communities.length === 0 && !error && <p className="hint">Aucune communauté à proposer pour l'instant.</p>}
      <button type="button" onClick={onDone}>
        Terminer
      </button>
    </div>
  );
}

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  return (
    <div>
      <p className="hint">
        Étape {step + 1} / {STEPS.length} — {STEPS[step]}
      </p>
      {step === 0 && <VerificationStep onNext={() => setStep(1)} />}
      {step === 1 && <DiscoveryStep onNext={() => setStep(2)} />}
      {step === 2 && <CommunityStep onDone={() => navigate('/dashboard')} />}
    </div>
  );
}

export default OnboardingPage;
