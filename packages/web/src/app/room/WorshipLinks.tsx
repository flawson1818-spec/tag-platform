import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../auth/AuthContext';
import { worshipApi } from '../../lib/api';

/**
 * The praise played between two prayer sections: YouTube or Spotify links, one per line, taken
 * in turn at each time of praise.
 */
export function WorshipLinks({ programId }: { programId: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    worshipApi
      .links(token, programId)
      .then((res) => setText(res.links.join('\n')))
      .catch(() => setText(''));
  }, [programId]);

  const save = () => {
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    const links = text.split('\n').map((l) => l.trim()).filter(Boolean);
    worshipApi
      .setLinks(token, programId, links)
      .then((res) => {
        setText(res.links.join('\n'));
        setNotice(t('worshipLinks.saved', { count: res.links.length }));
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <section className="worship-links">
      <h4>
        <span aria-hidden="true">🎵</span> {t('worshipLinks.title')}
      </h4>
      <p className="hint">{t('worshipLinks.intro')}</p>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'https://www.youtube.com/watch?v=…\nhttps://open.spotify.com/playlist/…'}
        aria-label={t('worshipLinks.title')}
      />
      <button type="button" onClick={save} disabled={saving}>
        {t('worshipLinks.save')}
      </button>
      {notice && <p className="hint">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
