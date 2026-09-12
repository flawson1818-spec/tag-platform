import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import {
  usersApi,
  filesApi,
  gamificationApi,
  notificationsApi,
  prayerRemindersApi,
  prayerRequestsApi,
  testimoniesApi,
  MyGamificationStats,
  CommunityGoal,
  LeaderboardEntry,
  NotificationPreference,
  PrayerReminder,
  PrayerRequest,
  Testimony,
} from '../../lib/api';
import { Pagination } from '../Pagination';

function MyPrayerRequestsSection() {
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    prayerRequestsApi
      .listMine(token, page)
      .then((res) => {
        setRequests(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message));
  }, [page]);

  return (
    <div className="gamification">
      <h3>Mes demandes de prière</h3>
      {error && <p className="error">{error}</p>}
      {requests.length === 0 && !error && <p className="hint">Aucune demande (les demandes anonymes n'apparaissent pas ici).</p>}
      <ul className="request-list">
        {requests.map((r) => (
          <li key={r.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{r.category}</span>
              <span className="chip chip-status">{r.status}</span>
            </div>
            <p>{r.description}</p>
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function MyTestimoniesSection() {
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    testimoniesApi
      .listMine(token, page)
      .then((res) => {
        setTestimonies(res.data);
        setTotalPages(res.meta.totalPages);
      })
      .catch((err) => setError((err as Error).message));
  };

  useEffect(refresh, [page]);

  const startEdit = (t: Testimony) => {
    setEditingId(t.id);
    setEditContent(t.content ?? '');
  };

  const resubmit = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    setResubmitting(true);
    setError(null);
    try {
      await testimoniesApi.update(token, id, { content: editContent });
      setEditingId(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <div className="gamification">
      <h3>Mes témoignages</h3>
      {error && <p className="error">{error}</p>}
      {testimonies.length === 0 && !error && <p className="hint">Aucun témoignage partagé pour l'instant.</p>}
      <ul className="request-list">
        {testimonies.map((t) => (
          <li key={t.id} className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{t.status}</span>
            </div>
            <p>{t.content ?? `Témoignage ${t.media_type.toLowerCase()}`}</p>
            {t.moderation_reason && <p className="hint">Motif du refus : {t.moderation_reason}</p>}
            {t.status === 'DRAFT' && t.moderation_reason && editingId !== t.id && (
              <button type="button" onClick={() => startEdit(t)}>
                Modifier et resoumettre
              </button>
            )}
            {editingId === t.id && (
              <div className="reject-row">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  style={{ width: '100%' }}
                />
                <button type="button" disabled={resubmitting} onClick={() => resubmit(t.id)}>
                  {resubmitting ? 'Envoi…' : 'Resoumettre'}
                </button>
                <button type="button" onClick={() => setEditingId(null)}>
                  Annuler
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

function AvatarUpload({ avatarFileId }: { avatarFileId: string | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !avatarFileId) return;
    filesApi
      .get(token, avatarFileId)
      .then((file) => {
        if (file.readUrl) setPreviewUrl(file.readUrl);
      })
      .catch(() => undefined);
  }, [avatarFileId]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const token = getAccessToken();
    if (!token) return;

    if (!file.type.startsWith('image/')) {
      setError('Choisis une image (JPG, PNG…).');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setError('Image trop lourde (5 Mo maximum).');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const { file: stored, uploadUrl } = await filesApi.presign(token, {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await filesApi.upload(uploadUrl, file);
      await usersApi.updateMe(token, { avatarFileId: stored.id });
      setPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="avatar-upload">
      {previewUrl ? (
        <img src={previewUrl} alt="Avatar" className="avatar-preview" />
      ) : (
        <div className="avatar-preview avatar-preview-empty" />
      )}
      <label className="link-button">
        {uploading ? 'Envoi…' : "Changer l'avatar"}
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} hidden />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function GamificationSection() {
  const [stats, setStats] = useState<MyGamificationStats | null>(null);
  const [goal, setGoal] = useState<CommunityGoal | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [optInSaving, setOptInSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = () => {
    gamificationApi.leaderboard().then(setLeaderboard).catch(() => undefined);
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    gamificationApi
      .myStats(token)
      .then((s) => {
        setStats(s);
        setOptIn(s.leaderboardOptIn);
      })
      .catch((err) => setError((err as Error).message));
    gamificationApi.communityGoal().then(setGoal).catch(() => undefined);
    loadLeaderboard();
  }, []);

  const handleOptInChange = (checked: boolean) => {
    const token = getAccessToken();
    if (!token) return;
    setOptIn(checked);
    setOptInSaving(true);
    gamificationApi
      .setLeaderboardOptIn(token, checked)
      .then(loadLeaderboard)
      .catch((err) => setError((err as Error).message))
      .finally(() => setOptInSaving(false));
  };

  return (
    <div className="gamification">
      <h3>Ma prière</h3>
      {error && <p className="error">{error}</p>}
      {stats && (
        <div className="gamification-stats">
          <div className="gamification-stat">
            <span className="gamification-stat-value">{stats.totalHours}</span>
            <span className="gamification-stat-label">heures priées</span>
          </div>
          <div className="gamification-stat">
            <span className="gamification-stat-value">{stats.currentStreakDays}</span>
            <span className="gamification-stat-label">jours de suite</span>
          </div>
        </div>
      )}
      {stats && stats.badges.length > 0 && (
        <div className="gamification-badges">
          {stats.badges.map((badge) => (
            <span key={badge} className="tag-badge" style={{ background: '#45519c' }}>
              {badge}
            </span>
          ))}
        </div>
      )}

      {goal && (
        <div className="gamification-goal">
          <p className="hint">
            Objectif communautaire de {goal.month} : {goal.achievedHours} / {goal.targetHours} h
          </p>
          <div className="room-progress">
            <div
              className="room-progress-fill"
              style={{ width: `${Math.min(100, (goal.achievedHours / goal.targetHours) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <label className="tag-checkbox">
        <input
          type="checkbox"
          checked={optIn}
          disabled={optInSaving}
          onChange={(e) => handleOptInChange(e.target.checked)}
        />
        Apparaître dans le classement public
      </label>

      {leaderboard.length > 0 && (
        <ol className="gamification-leaderboard">
          {leaderboard.map((entry) => (
            <li key={entry.displayName}>
              <span>{entry.displayName}</span>
              <span>{entry.hours} h</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TESTIMONY_PUBLISHED: 'Ton témoignage est publié',
  TESTIMONY_REJECTED: 'Ton témoignage est refusé',
  PRAYER_REQUEST_ANSWERED: 'Ta demande de prière a une réponse',
  PRAYER_REMINDER: 'Tes rappels de prière planifiés',
  EVENT_CREATED: 'Un nouvel événement dans une de tes communautés',
  EVENT_REMINDER: 'Rappel avant un événement auquel tu es inscrit',
};

function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    notificationsApi.listPreferences(token).then(setPrefs).catch((err) => setError((err as Error).message));
  }, []);

  const handleToggle = (type: string, enabled: boolean) => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setSavingType(type);
    notificationsApi
      .setPreference(token, type, enabled)
      .then(setPrefs)
      .catch((err) => setError((err as Error).message))
      .finally(() => setSavingType(null));
  };

  if (prefs.length === 0 && !error) return null;

  return (
    <div className="gamification">
      <h3>Notifications</h3>
      <p className="hint">Choisis les notifications que tu veux recevoir.</p>
      {error && <p className="error">{error}</p>}
      {prefs.map((pref) => (
        <label key={pref.type} className="tag-checkbox">
          <input
            type="checkbox"
            checked={pref.enabled}
            disabled={savingType === pref.type}
            onChange={(e) => handleToggle(pref.type, e.target.checked)}
          />
          {NOTIFICATION_TYPE_LABELS[pref.type] ?? pref.type}
        </label>
      ))}
    </div>
  );
}

const WEEKDAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function PrayerRemindersSection() {
  const [reminders, setReminders] = useState<PrayerReminder[]>([]);
  const [timeOfDay, setTimeOfDay] = useState('06:30');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    prayerRemindersApi.list(token).then(setReminders).catch((err) => setError((err as Error).message));
  };

  useEffect(refresh, []);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token || daysOfWeek.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await prayerRemindersApi.create(token, { timeOfDay, daysOfWeek, timezone });
      setReminders((prev) => [...prev, created]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = (reminder: PrayerReminder) => {
    const token = getAccessToken();
    if (!token) return;
    prayerRemindersApi
      .update(token, reminder.id, { enabled: !reminder.enabled })
      .then((updated) => setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r))))
      .catch((err) => setError((err as Error).message));
  };

  const handleRemove = (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    prayerRemindersApi
      .remove(token, id)
      .then(() => setReminders((prev) => prev.filter((r) => r.id !== id)))
      .catch((err) => setError((err as Error).message));
  };

  return (
    <div className="gamification">
      <h3>Rappels de prière</h3>
      <p className="hint">Planifie un rappel pour ne jamais manquer ton moment de prière.</p>
      {error && <p className="error">{error}</p>}

      {reminders.length > 0 && (
        <ul className="request-list">
          {reminders.map((r) => (
            <li key={r.id} className="request-row">
              <div className="request-meta">
                <span className="chip">{r.time_of_day}</span>
                <span className="hint">{r.days_of_week.map((d) => WEEKDAY_LABELS[d]).join(', ')}</span>
              </div>
              <div className="request-form">
                <label className="tag-checkbox">
                  <input type="checkbox" checked={r.enabled} onChange={() => handleToggleEnabled(r)} />
                  Actif
                </label>
                <button type="button" className="link-button" onClick={() => handleRemove(r.id)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="request-form">
        <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required />
        {WEEKDAY_LABELS.map((label, day) => (
          <label key={day} className="tag-checkbox">
            <input type="checkbox" checked={daysOfWeek.includes(day)} onChange={() => toggleDay(day)} />
            {label}
          </label>
        ))}
        <button type="submit" disabled={submitting || daysOfWeek.length === 0}>
          {submitting ? 'Ajout…' : 'Ajouter un rappel'}
        </button>
      </form>
    </div>
  );
}

function PrivacySection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearingAiHistory, setClearingAiHistory] = useState(false);
  const [aiHistoryCleared, setAiHistoryCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setExporting(true);
    try {
      const data = await usersApi.exportMe(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tag-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleClearAiHistory = async () => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setClearingAiHistory(true);
    try {
      await usersApi.deleteMyAiHistory(token);
      setAiHistoryCleared(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClearingAiHistory(false);
    }
  };

  const handleDelete = async () => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setDeleting(true);
    try {
      await usersApi.deleteMe(token);
      await logout();
      navigate('/login');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  return (
    <div className="gamification">
      <h3>Mes données</h3>
      <p className="hint">Droit d'accès, d'export et de suppression de tes données personnelles.</p>
      <button type="button" onClick={handleExport} disabled={exporting}>
        {exporting ? 'Export…' : 'Exporter mes données (JSON)'}
      </button>{' '}
      <button type="button" onClick={handleClearAiHistory} disabled={clearingAiHistory}>
        {clearingAiHistory ? 'Suppression…' : 'Effacer mon historique IA'}
      </button>
      {aiHistoryCleared && <p className="hint">Historique IA effacé.</p>}

      {confirmingDelete ? (
        <div className="reject-row">
          <p className="error">
            Cette action est irréversible : ton compte sera anonymisé et tu seras déconnecté partout.
          </p>
          <button type="button" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Suppression…' : 'Confirmer la suppression définitive'}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmingDelete(true)}>
          Supprimer mon compte
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [locale, setLocale] = useState(user?.locale ?? 'fr');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    usersApi
      .updateMe(token, { displayName, phone: phone || undefined, locale, timezone })
      .then(() => setSaved(true))
      .catch((err) => setError((err as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="auth-page">
      <h2>Mon profil</h2>
      <AvatarUpload avatarFileId={user.avatar_file_id} />
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder="Nom affiché"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder="Téléphone (optionnel)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="text"
          placeholder="Langue (ex : fr)"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        />
        <input
          type="text"
          placeholder="Fuseau horaire (ex : Africa/Abidjan)"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
      {saved && <p className="hint">Profil mis à jour.</p>}
      {error && <p className="error">{error}</p>}

      <GamificationSection />
      <NotificationPreferencesSection />
      <PrayerRemindersSection />
      <MyPrayerRequestsSection />
      <MyTestimoniesSection />
      <PrivacySection />
    </div>
  );
}

export default ProfilePage;
