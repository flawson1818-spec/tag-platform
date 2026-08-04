import { FormEvent, useEffect, useState } from 'react';
import { Item, Tag, itemsApi, tagsApi } from '../../lib/api';

export function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([itemsApi.list(), tagsApi.list()])
      .then(([itemsRes, tagsRes]) => {
        setItems(itemsRes);
        setTags(tagsRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await itemsApi.create({ name, description, tagIds: selectedTagIds });
      setName('');
      setDescription('');
      setSelectedTagIds([]);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await itemsApi.remove(id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h2>Items</h2>

      <form onSubmit={handleCreate} className="item-form">
        <input
          type="text"
          placeholder="Nom de l'item"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="tag-picker">
          {tags.map((tag) => (
            <label key={tag.id} className="tag-checkbox">
              <input
                type="checkbox"
                checked={selectedTagIds.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
              />
              <span
                className="tag-badge"
                style={{ backgroundColor: tag.color ?? '#999' }}
              >
                {tag.name}
              </span>
            </label>
          ))}
          {tags.length === 0 && <p>Crée d'abord des tags pour pouvoir les assigner.</p>}
        </div>
        <button type="submit">Ajouter l'item</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Chargement…</p>
      ) : (
        <ul className="item-list">
          {items.map((item) => (
            <li key={item.id} className="item-row">
              <div>
                <strong>{item.name}</strong>
                {item.description && <p>{item.description}</p>}
                <div className="tag-badges">
                  {item.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="tag-badge"
                      style={{ backgroundColor: tag.color ?? '#999' }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => handleDelete(item.id)}>Supprimer</button>
            </li>
          ))}
          {items.length === 0 && <p>Aucun item pour l'instant.</p>}
        </ul>
      )}
    </div>
  );
}

export default ItemsPage;
