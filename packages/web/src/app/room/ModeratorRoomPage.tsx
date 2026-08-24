import { useEffect, useState } from 'react';
import { getAccessToken } from '../auth/AuthContext';
import { LeaderCandidate, PrayerSlot, prayerApi } from '../../lib/api';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function ModeratorRoomPage() {
  const [slots, setSlots] = useState<PrayerSlot[]>([]);
  const [candidates, setCandidates] = useState<LeaderCandidate[]>([]);
  const [error, setError] = useState<string | null>(() =>
    getAccessToken() ? null : 'Tu dois être connecté pour gérer les créneaux.',
  );
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    prayerApi
      .active()
      .then((active) =>
        Promise.all([prayerApi.listProgramSlots(active.program_id), prayerApi.leaderCandidates(token)]),
      )
      .then(([programSlots, leaderCandidates]) => {
        setSlots(programSlots);
        setCandidates(leaderCandidates);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async (slotId: string, leaderUserId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setSavingSlotId(slotId);
    setError(null);
    try {
      const updated = await prayerApi.assignLeader(token, slotId, leaderUserId || null);
      setSlots((prev) => prev.map((s) => (s.id === slotId ? updated : s)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSlotId(null);
    }
  };

  if (loading) return <p>Chargement…</p>;

  return (
    <div className="moderator-page">
      <h2>Gestion des intercesseurs — programme en cours</h2>
      <p className="hint">
        Assigne un intercesseur à chaque section. Sans assignation, l'IA Intercession anime automatiquement.
      </p>
      {error && <p className="error">{error}</p>}

      {slots.length > 0 && (
        <table className="slot-table">
          <thead>
            <tr>
              <th>Heure</th>
              <th>Section</th>
              <th>Catégorie</th>
              <th>Animateur</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id} className={slot.status === 'RUNNING' ? 'slot-row-live' : ''}>
                <td>
                  {formatTime(slot.start_at)}–{formatTime(slot.end_at)}
                  {slot.status === 'RUNNING' && <span className="live-badge"> En direct</span>}
                </td>
                <td>{slot.title}</td>
                <td>{slot.category}</td>
                <td>
                  <select
                    value={slot.leader_user_id ?? ''}
                    disabled={savingSlotId === slot.id}
                    onChange={(e) => handleAssign(slot.id, e.target.value)}
                  >
                    <option value="">IA Intercession</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{savingSlotId === slot.id ? 'Enregistrement…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ModeratorRoomPage;
