const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

export interface Item {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export const tagsApi = {
  list: () => request<Tag[]>('/tags'),
  create: (data: { name: string; color?: string }) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<Tag>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
};

export const itemsApi = {
  list: () => request<Item[]>('/items'),
  create: (data: { name: string; description?: string; tagIds?: string[] }) =>
    request<Item>('/items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; description?: string; tagIds?: string[] }) =>
    request<Item>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),
};
