import { FormEvent, useEffect, useState } from 'react';
import { Tag, tagsApi } from '../../lib/api';

export function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    tagsApi
      .list()
      .then(setTags)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await tagsApi.create({ name, color });
      setName('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await tagsApi.remove(id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h2>Tags</h2>

      <form onSubmit={handleCreate} className="inline-form">
        <input
          type="text"
          placeholder="Nom du tag"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title="Couleur"
        />
        <button type="submit">Ajouter</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Chargement…</p>
      ) : (
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag.id} className="tag-row">
              <span
                className="tag-badge"
                style={{ backgroundColor: tag.color ?? '#999' }}
              >
                {tag.name}
              </span>
              <span className="tag-count">{tag._count?.items ?? 0} item(s)</span>
              <button onClick={() => handleDelete(tag.id)}>Supprimer</button>
            </li>
          ))}
          {tags.length === 0 && <p>Aucun tag pour l'instant.</p>}
        </ul>
      )}
    </div>
  );
}

export default TagsPage;
