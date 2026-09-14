import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { LeaderCandidate, PrayerSlot, prayerApi } from '../../lib/api';
import i18n from '../../i18n/config';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
}

export function ModeratorRoomPage() {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<PrayerSlot[]>([]);
  const [candidates, setCandidates] = useState<LeaderCandidate[]>([]);
  const [error, setError] = useState<string | null>(() =>
    getAccessToken() ? null : i18n.t('moderatorRoom.needLogin'),
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

  if (loading) return <p>{t('moderatorRoom.loading')}</p>;

  return (
    <div className="moderator-page">
      <h2>{t('moderatorRoom.title')}</h2>
      <p className="hint">{t('moderatorRoom.intro')}</p>
      {error && <p className="error">{error}</p>}

      {slots.length > 0 && (
        <table className="slot-table">
          <thead>
            <tr>
              <th>{t('moderatorRoom.tableTime')}</th>
              <th>{t('moderatorRoom.tableSection')}</th>
              <th>{t('moderatorRoom.tableCategory')}</th>
              <th>{t('moderatorRoom.tableLeader')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id} className={slot.status === 'RUNNING' ? 'slot-row-live' : ''}>
                <td>
                  {formatTime(slot.start_at)}–{formatTime(slot.end_at)}
                  {slot.status === 'RUNNING' && <span className="live-badge"> {t('moderatorRoom.liveBadge')}</span>}
                </td>
                <td>{slot.title}</td>
                <td>{t(`prayerTopicCategories.${slot.category}`, slot.category)}</td>
                <td>
                  <select
                    value={slot.leader_user_id ?? ''}
                    disabled={savingSlotId === slot.id}
                    onChange={(e) => handleAssign(slot.id, e.target.value)}
                  >
                    <option value="">{t('moderatorRoom.leaderAi')}</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{savingSlotId === slot.id ? t('moderatorRoom.saving') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ModeratorRoomPage;
