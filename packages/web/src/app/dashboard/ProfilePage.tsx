import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAccessToken, useAuth } from '../auth/AuthContext';
import { changeLocale, LOCALE_LABELS, SUPPORTED_LOCALES, SupportedLocale } from '../../i18n/config';
import {
  usersApi,
  filesApi,
  gamificationApi,
  notificationsApi,
  prayerCategoryFollowsApi,
  prayerRemindersApi,
  prayerRequestsApi,
  testimoniesApi,
  MyGamificationStats,
  CommunityGoal,
  LeaderboardEntry,
  NotificationPreference,
  PRAYER_CATEGORIES,
  PrayerCategoryFollow,
  PrayerReminder,
  PrayerRequest,
  Testimony,
} from '../../lib/api';
import { Pagination } from '../Pagination';

function MyPrayerRequestsSection() {
  const { t } = useTranslation();
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
      <h3>{t('profile.myRequests.title')}</h3>
      {error && <p className="error">{error}</p>}
      {requests.length === 0 && !error && <p className="hint">{t('profile.myRequests.none')}</p>}
      <ul className="request-list">
        {requests.map((r) => (
          <li key={r.id} className="request-row">
            <div className="request-meta">
              <span className="chip">{t(`prayerCategories.${r.category}`, r.category)}</span>
              <span className="chip chip-status">{t(`requestStatuses.${r.status}`, r.status)}</span>
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
  const { t } = useTranslation();
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

  const startEdit = (testimony: Testimony) => {
    setEditingId(testimony.id);
    setEditContent(testimony.content ?? '');
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
      <h3>{t('profile.myTestimonies.title')}</h3>
      {error && <p className="error">{error}</p>}
      {testimonies.length === 0 && !error && <p className="hint">{t('profile.myTestimonies.none')}</p>}
      <ul className="request-list">
        {testimonies.map((item) => (
          <li key={item.id} className="request-row">
            <div className="request-meta">
              <span className="chip chip-status">{t(`testimonyStatuses.${item.status}`, item.status)}</span>
            </div>
            <p>
              {item.content ??
                t('profile.myTestimonies.mediaFallback', {
                  type: t(`home.mediaType.${item.media_type}`, item.media_type),
                })}
            </p>
            {item.moderation_reason && (
              <p className="hint">
                {t('profile.myTestimonies.rejectionReason')} {item.moderation_reason}
              </p>
            )}
            {item.status === 'DRAFT' && item.moderation_reason && editingId !== item.id && (
              <button type="button" onClick={() => startEdit(item)}>
                {t('profile.myTestimonies.editAndResubmit')}
              </button>
            )}
            {editingId === item.id && (
              <div className="reject-row">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  style={{ width: '100%' }}
                />
                <button type="button" disabled={resubmitting} onClick={() => resubmit(item.id)}>
                  {resubmitting ? t('profile.myTestimonies.resubmitting') : t('profile.myTestimonies.resubmit')}
                </button>
                <button type="button" onClick={() => setEditingId(null)}>
                  {t('profile.myTestimonies.cancel')}
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
  const { t } = useTranslation();
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
      setError(t('profile.main.avatarInvalidType'));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setError(t('profile.main.avatarTooLarge'));
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
        <img src={previewUrl} alt={t('profile.main.avatarAlt')} className="avatar-preview" />
      ) : (
        <div className="avatar-preview avatar-preview-empty" />
      )}
      <label className="link-button">
        {uploading ? t('profile.main.avatarUploading') : t('profile.main.changeAvatar')}
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} hidden />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function GamificationSection() {
  const { t } = useTranslation();
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
      <h3>{t('profile.gamification.title')}</h3>
      {error && <p className="error">{error}</p>}
      {stats && (
        <div className="gamification-stats">
          <div className="gamification-stat">
            <span className="gamification-stat-value">{stats.totalHours}</span>
            <span className="gamification-stat-label">{t('profile.gamification.hoursPrayed')}</span>
          </div>
          <div className="gamification-stat">
            <span className="gamification-stat-value">{stats.currentStreakDays}</span>
            <span className="gamification-stat-label">{t('profile.gamification.streakDays')}</span>
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
            {t('profile.gamification.goal', {
              month: goal.month,
              achieved: goal.achievedHours,
              target: goal.targetHours,
            })}
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
        {t('profile.gamification.optInLabel')}
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

function NotificationPreferencesSection() {
  const { t } = useTranslation();
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
      <h3>{t('profile.notificationPrefs.title')}</h3>
      <p className="hint">{t('profile.notificationPrefs.intro')}</p>
      {error && <p className="error">{error}</p>}
      {prefs.map((pref) => (
        <label key={pref.type} className="tag-checkbox">
          <input
            type="checkbox"
            checked={pref.enabled}
            disabled={savingType === pref.type}
            onChange={(e) => handleToggle(pref.type, e.target.checked)}
          />
          {t(`profile.notificationPrefTypes.${pref.type}`, pref.type)}
        </label>
      ))}
    </div>
  );
}

const WEEKDAY_COUNT = 7;

function PrayerRemindersSection() {
  const { t } = useTranslation();
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
      <h3>{t('profile.reminders.title')}</h3>
      <p className="hint">{t('profile.reminders.intro')}</p>
      {error && <p className="error">{error}</p>}

      {reminders.length > 0 && (
        <ul className="request-list">
          {reminders.map((r) => (
            <li key={r.id} className="request-row">
              <div className="request-meta">
                <span className="chip">{r.time_of_day}</span>
                <span className="hint">
                  {r.days_of_week.map((d) => t(`profile.reminders.weekdays.${d}`)).join(', ')}
                </span>
              </div>
              <div className="request-form">
                <label className="tag-checkbox">
                  <input type="checkbox" checked={r.enabled} onChange={() => handleToggleEnabled(r)} />
                  {t('profile.reminders.active')}
                </label>
                <button type="button" className="link-button" onClick={() => handleRemove(r.id)}>
                  {t('profile.reminders.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="request-form">
        <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required />
        {Array.from({ length: WEEKDAY_COUNT }, (_, day) => (
          <label key={day} className="tag-checkbox">
            <input type="checkbox" checked={daysOfWeek.includes(day)} onChange={() => toggleDay(day)} />
            {t(`profile.reminders.weekdays.${day}`)}
          </label>
        ))}
        <button type="submit" disabled={submitting || daysOfWeek.length === 0}>
          {submitting ? t('profile.reminders.adding') : t('profile.reminders.add')}
        </button>
      </form>
    </div>
  );
}

function PrayerTopicFollowsSection() {
  const { t } = useTranslation();
  const [follows, setFollows] = useState<PrayerCategoryFollow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyCategory, setBusyCategory] = useState<string | null>(null);

  const refresh = () => {
    const token = getAccessToken();
    if (!token) return;
    prayerCategoryFollowsApi.list(token).then(setFollows).catch((err) => setError((err as Error).message));
  };

  useEffect(refresh, []);

  const followedCategories = new Set(follows.map((f) => f.category));

  const toggleCategory = (category: string) => {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setBusyCategory(category);
    const action = followedCategories.has(category)
      ? prayerCategoryFollowsApi.unfollow(token, category)
      : prayerCategoryFollowsApi.follow(token, category);
    action
      .then(refresh)
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusyCategory(null));
  };

  return (
    <div className="gamification">
      <h3>{t('profile.topicFollows.title')}</h3>
      <p className="hint">{t('profile.topicFollows.intro')}</p>
      {error && <p className="error">{error}</p>}
      <div className="request-form">
        {PRAYER_CATEGORIES.map((category) => (
          <label key={category} className="tag-checkbox">
            <input
              type="checkbox"
              checked={followedCategories.has(category)}
              disabled={busyCategory === category}
              onChange={() => toggleCategory(category)}
            />
            {t(`prayerTopicCategories.${category}`, category)}
          </label>
        ))}
      </div>
    </div>
  );
}

function PrivacySection() {
  const { t } = useTranslation();
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
      <h3>{t('profile.privacy.title')}</h3>
      <p className="hint">{t('profile.privacy.intro')}</p>
      <button type="button" onClick={handleExport} disabled={exporting}>
        {exporting ? t('profile.privacy.exporting') : t('profile.privacy.export')}
      </button>{' '}
      <button type="button" onClick={handleClearAiHistory} disabled={clearingAiHistory}>
        {clearingAiHistory ? t('profile.privacy.clearingAiHistory') : t('profile.privacy.clearAiHistory')}
      </button>
      {aiHistoryCleared && <p className="hint">{t('profile.privacy.aiHistoryCleared')}</p>}

      {confirmingDelete ? (
        <div className="reject-row">
          <p className="error">{t('profile.privacy.deleteWarning')}</p>
          <button type="button" onClick={handleDelete} disabled={deleting}>
            {deleting ? t('profile.privacy.deleting') : t('profile.privacy.confirmDelete')}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)}>
            {t('profile.privacy.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmingDelete(true)}>
          {t('profile.privacy.deleteAccount')}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
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
      .then(() => {
        setSaved(true);
        changeLocale(locale as SupportedLocale);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="auth-page">
      <h2>{t('profile.main.title')}</h2>
      <AvatarUpload avatarFileId={user.avatar_file_id} />
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder={t('profile.main.displayNamePlaceholder')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder={t('profile.main.phonePlaceholder')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <select value={locale} onChange={(e) => setLocale(e.target.value)}>
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t('profile.main.timezonePlaceholder')}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
        <button type="submit" disabled={saving}>
          {saving ? t('profile.main.saving') : t('profile.main.save')}
        </button>
      </form>
      {saved && <p className="hint">{t('profile.main.saved')}</p>}
      {error && <p className="error">{error}</p>}

      <GamificationSection />
      <NotificationPreferencesSection />
      <PrayerRemindersSection />
      <PrayerTopicFollowsSection />
      <MyPrayerRequestsSection />
      <MyTestimoniesSection />
      <PrivacySection />
    </div>
  );
}

export default ProfilePage;
