const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

// Same keys as AuthContext — duplicated here (rather than imported) so this module
// stays a plain fetch client with no dependency on the React auth layer.
const ACCESS_TOKEN_KEY = 'tag.accessToken';
const REFRESH_TOKEN_KEY = 'tag.refreshToken';

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Access tokens expire after 15 minutes (see JWT_ACCESS_EXPIRES_IN_SECONDS). A page left
 * open longer than that — the world map polling every 5s is the clearest case — would
 * otherwise 401 forever, since only AuthContext's one-time mount check used to refresh.
 * Deduplicated so concurrent 401s (e.g. several polling requests at once) trigger a single
 * refresh call instead of a burst of them.
 */
function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then((res) => (res.ok ? (res.json() as Promise<AuthResponse>) : null))
    .then((body) => {
      if (!body) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        return null;
      }
      localStorage.setItem(ACCESS_TOKEN_KEY, body.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, body.refresh_token);
      return body.access_token;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

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

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && !isRetry && headers.Authorization) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return request<T>(path, { ...init, headers: { ...headers, Authorization: `Bearer ${newAccessToken}` } }, true);
    }
  }

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

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  display_name: string;
  avatar_file_id: string | null;
  locale: string;
  timezone: string;
  status: string;
  mfa_enabled: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: AuthUser;
  device_token?: string;
}

export interface TrustedDevice {
  id: string;
  label: string | null;
  last_used_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface PrayerSlot {
  id: string;
  program_id: string;
  order_index: number;
  title: string;
  category: string;
  importance: string;
  start_at: string;
  end_at: string;
  guided_text: string | null;
  bible_references: string[];
  recommended_songs: string[];
  leader_user_id: string | null;
  leader_display_name: string | null;
  status: string;
}

export interface ActivePrayerSlot extends PrayerSlot {
  remainingSeconds: number;
}

export interface LeaderCandidate {
  id: string;
  display_name: string;
}

export const PRAYER_PROGRAM_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;

export const PRAYER_CATEGORIES = [
  'Famille',
  'Finances',
  'Santé',
  'Guérison',
  'Évangélisation',
  'Nation',
  'Jeunesse',
  'Mariage',
  'Église',
  'Mission',
  'Urgence',
  'Autre',
] as const;

export const PRAYER_IMPORTANCE_LEVELS = ['Normal', 'Important', 'Urgent'] as const;

export interface PrayerProgram {
  id: string;
  community_id: string | null;
  title: string;
  recurrence_rule: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSlotPayload {
  title: string;
  category: string;
  importance?: string;
  startAt: string;
  endAt: string;
  guidedText?: string;
  bibleReferences?: string[];
  recommendedSongs?: string[];
  leaderUserId?: string;
  orderIndex?: number;
}

export interface ChatMessage {
  id: string;
  community_id: string | null;
  author_id: string;
  author_display_name: string | null;
  content: string;
  status: string;
  created_at: string;
}

export interface RoomPerson {
  userId: string;
  displayName: string;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export const prayerApi = {
  active: (roomId = 'world') =>
    request<ActivePrayerSlot>(`/prayer-slots/active?roomId=${encodeURIComponent(roomId)}`),
  listProgramSlots: (programId: string) => request<PrayerSlot[]>(`/prayer-programs/${programId}/slots`),
  leaderCandidates: (token: string, search?: string) =>
    request<LeaderCandidate[]>(
      `/prayer-slots/leader-candidates${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      { headers: authHeaders(token) },
    ),
  assignLeader: (token: string, slotId: string, leaderUserId: string | null) =>
    request<PrayerSlot>(`/prayer-slots/${slotId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ leaderUserId }),
    }),
  listPrograms: (page = 1) => request<PaginatedResult<PrayerProgram>>(`/prayer-programs?page=${page}&limit=20`),
  createProgram: (token: string, data: { title: string; communityId?: string; recurrenceRule?: string }) =>
    request<PrayerProgram>('/prayer-programs', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  updateProgram: (
    token: string,
    id: string,
    data: { title?: string; recurrenceRule?: string; status?: string },
  ) =>
    request<PrayerProgram>(`/prayer-programs/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }),
  removeProgram: (token: string, id: string) =>
    request<void>(`/prayer-programs/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
  createSlot: (token: string, programId: string, data: CreateSlotPayload) =>
    request<PrayerSlot>(`/prayer-programs/${programId}/slots`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }),
  updateSlot: (token: string, slotId: string, data: Partial<Omit<CreateSlotPayload, 'startAt' | 'endAt'>>) =>
    request<PrayerSlot>(`/prayer-slots/${slotId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }),
  removeSlot: (token: string, slotId: string) =>
    request<void>(`/prayer-slots/${slotId}`, { method: 'DELETE', headers: authHeaders(token) }),
};

export const PRAYER_REQUEST_CATEGORIES = [
  'Maladie',
  'Mariage',
  'Emploi',
  'Études',
  'Visa',
  'Enfant',
  'Délivrance',
  'Famille',
  'Autre',
] as const;

export const CONFIDENTIALITY_LEVELS = ['ANONYMOUS', 'PRIVATE', 'PUBLIC'] as const;

export interface PrayerRequest {
  id: string;
  author_id: string | null;
  category: string;
  description: string;
  confidentiality: string;
  status: string;
  photo_file_id: string | null;
  attachment_file_id: string | null;
  promoted_slot_id: string | null;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface FlaggedPrayerRequest extends PrayerRequest {
  ai_flag_reason: string | null;
  ai_flag_confidence: number | null;
}

export const prayerRequestsApi = {
  create: (
    data: {
      category: string;
      description: string;
      confidentiality?: string;
      photoFileId?: string;
      attachmentFileId?: string;
    },
    token?: string | null,
  ) =>
    request<PrayerRequest>('/prayer-requests', {
      method: 'POST',
      headers: token ? authHeaders(token) : undefined,
      body: JSON.stringify(data),
    }),
  /** docs/07_UX_UI_SPECIFICATION.md §5: "liste filtrable par statut/catégorie". */
  list: (token: string, page = 1, filters: { status?: string; category?: string } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    return request<PaginatedResult<PrayerRequest>>(`/prayer-requests?${params.toString()}`, {
      headers: authHeaders(token),
    });
  },
  /** docs/07_UX_UI_SPECIFICATION.md §8 (Profil — "Mes demandes"). */
  listMine: (token: string, page = 1) =>
    request<PaginatedResult<PrayerRequest>>(`/prayer-requests?mine=true&page=${page}&limit=20`, {
      headers: authHeaders(token),
    }),
  listFlagged: (token: string) =>
    request<FlaggedPrayerRequest[]>('/prayer-requests/flagged', { headers: authHeaders(token) }),
  mediaUrl: (token: string, id: string, kind: 'photo' | 'attachment') =>
    request<{ url: string }>(`/prayer-requests/${id}/media?kind=${kind}`, { headers: authHeaders(token) }),
  /** Moderator-only: docs/07_UX_UI_SPECIFICATION.md §5 "Modérateur assigne (ASSIGNED)...". */
  updateStatus: (token: string, id: string, status: string) =>
    request<PrayerRequest>(`/prayer-requests/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),
  /** Moderator-only: "...ou promeut en sujet collectif" — injects an urgent slot into the given program. */
  promote: (token: string, id: string, programId: string) =>
    request<PrayerRequest>(`/prayer-requests/${id}/promote`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ programId }),
    }),
};

export interface Testimony {
  id: string;
  author_id: string;
  related_request_id: string | null;
  media_type: string;
  content: string | null;
  file_id: string | null;
  status: string;
  moderated_by: string | null;
  moderation_reason: string | null;
  ai_flagged: boolean;
  ai_flag_reason: string | null;
  ai_flag_confidence: number | null;
  created_at: string;
}

export type PublicTestimony = Pick<Testimony, 'id' | 'media_type' | 'content' | 'created_at'>;

export const testimoniesApi = {
  /** Public — recent published testimonies for the unauthenticated Accueil feed. */
  listRecentPublic: (limit = 6) => request<PublicTestimony[]>(`/testimonies/public/recent?limit=${limit}`),
  create: (token: string, data: { mediaType?: string; content?: string; fileId?: string }) =>
    request<Testimony>('/testimonies', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ mediaType: 'TEXT', ...data }),
    }),
  list: (token: string, status?: string, page = 1) =>
    request<PaginatedResult<Testimony>>(
      `/testimonies?page=${page}&limit=20${status ? `&status=${status}` : ''}`,
      { headers: authHeaders(token) },
    ),
  /** docs/07_UX_UI_SPECIFICATION.md §8 (Profil — "Mes témoignages"), any status. */
  listMine: (token: string, page = 1) =>
    request<PaginatedResult<Testimony>>(`/testimonies?mine=true&page=${page}&limit=20`, {
      headers: authHeaders(token),
    }),
  /** Author-only, and only while still DRAFT — lets a rejected testimony be revised and resubmitted. */
  update: (token: string, id: string, data: { mediaType?: string; content?: string; fileId?: string }) =>
    request<Testimony>(`/testimonies/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }),
  approve: (token: string, id: string) =>
    request<Testimony>(`/testimonies/${id}/approve`, { method: 'PATCH', headers: authHeaders(token) }),
  reject: (token: string, id: string, reason: string) =>
    request<Testimony>(`/testimonies/${id}/reject`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    }),
  listFlagged: (token: string) => request<Testimony[]>('/testimonies/flagged', { headers: authHeaders(token) }),
  mediaUrl: (token: string, id: string) =>
    request<{ url: string }>(`/testimonies/${id}/media`, { headers: authHeaders(token) }),
};

export interface SocialPublication {
  id: string;
  testimony_id: string | null;
  channel: string;
  draft_content: string;
  status: string;
  approved_by: string | null;
  published_at: string | null;
  created_at: string;
}

export interface SocialPublicationChannelSetting {
  channel: string;
  auto_publish: boolean;
  updated_by: string | null;
  updated_at: string;
}

export const socialPublicationsApi = {
  list: (token: string, status?: string, page = 1) =>
    request<PaginatedResult<SocialPublication>>(
      `/social-publications?page=${page}&limit=20${status ? `&status=${status}` : ''}`,
      { headers: authHeaders(token) },
    ),
  approve: (token: string, id: string) =>
    request<SocialPublication>(`/social-publications/${id}/approve`, {
      method: 'PATCH',
      headers: authHeaders(token),
    }),
  reject: (token: string, id: string) =>
    request<SocialPublication>(`/social-publications/${id}/reject`, {
      method: 'PATCH',
      headers: authHeaders(token),
    }),
  listChannelSettings: (token: string) =>
    request<SocialPublicationChannelSetting[]>('/social-publications/settings', { headers: authHeaders(token) }),
  setChannelAutoPublish: (token: string, channel: string, autoPublish: boolean) =>
    request<SocialPublicationChannelSetting>(`/social-publications/settings/${encodeURIComponent(channel)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ autoPublish }),
    }),
};

export const COMMUNITY_TYPES = ['GROUP', 'TEAM', 'CELL', 'COUNTRY', 'CITY', 'CHURCH', 'MINISTRY'] as const;

export const JOIN_POLICIES = ['OPEN', 'APPROVAL'] as const;

export interface Community {
  id: string;
  type: string;
  name: string;
  parent_id: string | null;
  language: string;
  timezone: string;
  join_policy: (typeof JOIN_POLICIES)[number];
  created_at: string;
}

export type MembershipStatus = 'ACTIVE' | 'PENDING' | 'NONE';

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  internal_role: string | null;
  status: 'ACTIVE' | 'PENDING';
  joined_at: string;
  users: { id: string; display_name: string; avatar_file_id: string | null } | null;
}

export interface Post {
  id: string;
  community_id: string;
  author_id: string;
  content: string;
  status: string;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  status: string;
  created_at: string;
}

export const communitiesApi = {
  list: (token: string, page = 1, parentId?: string, search?: string) =>
    request<PaginatedResult<Community>>(
      `/communities?page=${page}&limit=20${parentId ? `&parentId=${parentId}` : ''}${
        search ? `&search=${encodeURIComponent(search)}` : ''
      }`,
      { headers: authHeaders(token) },
    ),
  get: (token: string, id: string) => request<Community>(`/communities/${id}`, { headers: authHeaders(token) }),
  create: (token: string, data: { type: string; name: string; joinPolicy?: string; parentId?: string }) =>
    request<Community>('/communities', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  listMembers: (token: string, communityId: string, page = 1) =>
    request<PaginatedResult<CommunityMember>>(`/communities/${communityId}/members?page=${page}&limit=50`, {
      headers: authHeaders(token),
    }),
  /** Responsable-only: requests still awaiting approval. */
  listPendingMembers: (token: string, communityId: string, page = 1) =>
    request<PaginatedResult<CommunityMember>>(`/communities/${communityId}/members/pending?page=${page}&limit=50`, {
      headers: authHeaders(token),
    }),
  approveMember: (token: string, communityId: string, userId: string) =>
    request<void>(`/communities/${communityId}/members/${userId}/approve`, {
      method: 'PATCH',
      headers: authHeaders(token),
    }),
  removeMember: (token: string, communityId: string, userId: string) =>
    request<void>(`/communities/${communityId}/members/${userId}`, { method: 'DELETE', headers: authHeaders(token) }),
  /** Self-service join — the member is always the authenticated caller, inferred from the token. */
  join: (token: string, communityId: string) =>
    request<{ status: 'ACTIVE' | 'PENDING' }>(`/communities/${communityId}/join`, {
      method: 'POST',
      headers: authHeaders(token),
    }),
  /** The caller's own membership state — lets the UI show "en attente" explicitly on reload. */
  getMembership: (token: string, communityId: string) =>
    request<{ status: MembershipStatus }>(`/communities/${communityId}/membership`, { headers: authHeaders(token) }),
};

export const postsApi = {
  listForCommunity: (token: string, communityId: string, page = 1) =>
    request<PaginatedResult<Post>>(`/communities/${communityId}/posts?page=${page}&limit=20`, {
      headers: authHeaders(token),
    }),
  create: (token: string, communityId: string, content: string) =>
    request<Post>(`/communities/${communityId}/posts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ content }),
    }),
  listComments: (token: string, postId: string) =>
    request<PaginatedResult<Comment>>(`/posts/${postId}/comments?limit=50`, { headers: authHeaders(token) }),
  createComment: (token: string, postId: string, content: string) =>
    request<Comment>(`/posts/${postId}/comments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ content }),
    }),
};

export interface Announcement {
  id: string;
  community_id: string | null;
  author_id: string;
  content: string;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}

export const announcementsApi = {
  /** No communityId lists nation-wide broadcasts only; with one, also includes a community's own. */
  list: (communityId?: string, page = 1) =>
    request<PaginatedResult<Announcement>>(
      `/announcements?page=${page}&limit=20${communityId ? `&communityId=${communityId}` : ''}`,
    ),
  create: (token: string, data: { communityId?: string; content: string }) =>
    request<Announcement>('/announcements', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  pin: (token: string, id: string) =>
    request<Announcement>(`/announcements/${id}/pin`, { method: 'PATCH', headers: authHeaders(token) }),
  unpin: (token: string, id: string) =>
    request<Announcement>(`/announcements/${id}/unpin`, { method: 'PATCH', headers: authHeaders(token) }),
  remove: (token: string, id: string) =>
    request<void>(`/announcements/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
};

export interface WorldMapSnapshot {
  presence: number;
  activeRooms: number;
  timezones: { timezone: string; count: number }[];
}

export interface DashboardSnapshot {
  topCategories: { category: string; requestCount: number }[];
  growth: { day: string; newUsers: number }[];
  peakHours: { hourOfDay: number; attendanceCount: number }[];
  retention: { period: string; eligibleUsers: number; retainedUsers: number; retentionRate: number | null }[];
}

export const EXPORT_SCOPES = ['prayer_requests', 'testimonies', 'users', 'communities'] as const;

export interface ExportJob {
  id: string;
  scope: string;
  status: string;
  download_url: string | null;
  expires_at: string | null;
  created_at: string;
}

export const analyticsApi = {
  /** Public — no account required (Accueil screen, world map). */
  worldMap: () => request<WorldMapSnapshot>('/analytics/world-map'),
  dashboard: (token: string) => request<DashboardSnapshot>('/analytics/dashboard', { headers: authHeaders(token) }),
  requestExport: (token: string, scope: string) =>
    request<ExportJob>(`/analytics/export?scope=${encodeURIComponent(scope)}`, { headers: authHeaders(token) }),
};

export interface MfaRequiredResponse {
  mfaRequired: true;
  mfaToken: string;
}

export function isMfaRequired(res: AuthResponse | MfaRequiredResponse): res is MfaRequiredResponse {
  return (res as MfaRequiredResponse).mfaRequired === true;
}

export const authApi = {
  register: (data: { email: string; password: string; displayName: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string; deviceToken?: string }) =>
    request<AuthResponse | MfaRequiredResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  mfaChallenge: (mfaToken: string, code: string, trustDevice = false) =>
    request<AuthResponse>('/auth/mfa/challenge', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code, trustDevice }),
    }),
  /** For a lost authenticator device — same pending mfaToken, a recovery code instead of a TOTP code. */
  mfaRecoveryChallenge: (mfaToken: string, recoveryCode: string, trustDevice = false) =>
    request<AuthResponse>('/auth/mfa/recovery', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, recoveryCode, trustDevice }),
    }),
  listTrustedDevices: (token: string) =>
    request<TrustedDevice[]>('/auth/mfa/trusted-devices', { headers: authHeaders(token) }),
  revokeTrustedDevice: (token: string, id: string) =>
    request<void>(`/auth/mfa/trusted-devices/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
  mfaSetup: (token: string) =>
    request<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', {
      method: 'POST',
      headers: authHeaders(token),
    }),
  /** Returns freshly generated recovery codes, shown once — never retrievable again after this call. */
  mfaEnable: (token: string, code: string) =>
    request<{ recoveryCodes: string[] }>('/auth/mfa/enable', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ code }),
    }),
  mfaDisable: (token: string, code: string) =>
    request<void>('/auth/mfa/disable', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ code }),
    }),
  forgotPassword: (email: string) =>
    request<void>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<void>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  verifyEmail: (token: string) => request<void>('/auth/email/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: (accessToken: string) =>
    request<void>('/auth/email/resend', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }),
  refresh: (refreshToken: string) =>
    request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  me: (accessToken: string) =>
    request<AuthUser>('/users/me', { headers: { Authorization: `Bearer ${accessToken}` } }),
};

export const ROLE_HIERARCHY = [
  'VISITEUR',
  'NOUVEAU_CONVERTI',
  'INTERCESSEUR',
  'MODERATEUR',
  'RESPONSABLE_EQUIPE',
  'PASTEUR',
  'ADMINISTRATEUR',
  'SUPER_ADMINISTRATEUR',
] as const;

export interface Role {
  id: string;
  code: string;
  label: string;
}

export interface StoredFile {
  id: string;
  owner_id: string;
  bucket_key: string;
  mime_type: string;
  size_bytes: number | null;
  status: string;
  readUrl?: string;
}

export interface PresignResult {
  file: StoredFile;
  uploadUrl: string;
  token: string;
}

export const filesApi = {
  presign: (token: string, data: { filename: string; mimeType: string; sizeBytes?: number }) =>
    request<PresignResult>('/files/presign', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  get: (token: string, id: string) => request<StoredFile>(`/files/${id}`, { headers: authHeaders(token) }),
  /** Uploads directly to the Supabase Storage signed URL — bypasses the API's own request() helper (different host, no JSON body/response). */
  upload: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'x-upsert': 'false', 'cache-control': 'max-age=3600', 'content-type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Échec de l'upload (${res.status})`);
  },
};

export const usersApi = {
  updateMe: (
    token: string,
    data: { displayName?: string; phone?: string; locale?: string; timezone?: string; avatarFileId?: string },
  ) => request<AuthUser>('/users/me', { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data) }),
  exportMe: (token: string) => request<Record<string, unknown>>('/users/me/export', { headers: authHeaders(token) }),
  deleteMe: (token: string) => request<void>('/users/me', { method: 'DELETE', headers: authHeaders(token) }),
  deleteMyAiHistory: (token: string) =>
    request<void>('/users/me/ai-history', { method: 'DELETE', headers: authHeaders(token) }),
  list: (token: string, page = 1, status?: string) =>
    request<PaginatedResult<AuthUser>>(
      `/users?page=${page}&limit=20${status ? `&status=${status}` : ''}`,
      { headers: authHeaders(token) },
    ),
  updateStatus: (token: string, id: string, status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED') =>
    request<AuthUser>(`/users/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),
};

export const rolesApi = {
  list: (token: string) => request<Role[]>('/roles', { headers: authHeaders(token) }),
  assign: (token: string, userId: string, roleCode: string, communityId?: string) =>
    request<void>('/roles/assign', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userId, roleCode, communityId }),
    }),
  revoke: (token: string, userId: string, roleCode: string, communityId?: string) =>
    request<void>('/roles/revoke', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userId, roleCode, communityId }),
    }),
};

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  type: string;
  enabled: boolean;
}

export const pushApi = {
  vapidPublicKey: () => request<{ publicKey: string | null }>('/push/vapid-public-key'),
  register: (token: string, subscriptionToken: string) =>
    request<void>('/push/register', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ token: subscriptionToken, platform: 'WEB' }),
    }),
  unregister: (token: string, subscriptionToken: string) =>
    request<void>('/push/register', {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({ token: subscriptionToken }),
    }),
};

export const notificationsApi = {
  list: (token: string, status?: string, page = 1) =>
    request<PaginatedResult<AppNotification>>(
      `/notifications?page=${page}&limit=20${status ? `&status=${status}` : ''}`,
      { headers: authHeaders(token) },
    ),
  markRead: (token: string, id: string) =>
    request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH', headers: authHeaders(token) }),
  markAllRead: (token: string) =>
    request<void>('/notifications/read-all', { method: 'PATCH', headers: authHeaders(token) }),
  archive: (token: string, id: string) =>
    request<AppNotification>(`/notifications/${id}/archive`, { method: 'PATCH', headers: authHeaders(token) }),
  listPreferences: (token: string) =>
    request<NotificationPreference[]>('/notifications/preferences', { headers: authHeaders(token) }),
  setPreference: (token: string, type: string, enabled: boolean) =>
    request<NotificationPreference[]>(`/notifications/preferences/${type}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ enabled }),
    }),
};

export interface PrayerReminder {
  id: string;
  user_id: string;
  time_of_day: string;
  days_of_week: number[];
  timezone: string;
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export const prayerRemindersApi = {
  list: (token: string) => request<PrayerReminder[]>('/prayer-reminders', { headers: authHeaders(token) }),
  create: (token: string, data: { timeOfDay: string; daysOfWeek: number[]; timezone: string }) =>
    request<PrayerReminder>('/prayer-reminders', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  update: (token: string, id: string, data: Partial<{ timeOfDay: string; daysOfWeek: number[]; timezone: string; enabled: boolean }>) =>
    request<PrayerReminder>(`/prayer-reminders/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }),
  remove: (token: string, id: string) =>
    request<void>(`/prayer-reminders/${id}`, { method: 'DELETE', headers: authHeaders(token) }),
};

export const EVENT_TYPES = [
  'VEILLEE',
  'JEUNE',
  'CROISADE',
  'CONFERENCE',
  'ETUDE_BIBLIQUE',
  'DEBAT_BIBLIQUE',
  'FORMATION',
  'INTERCESSION_SPECIALE',
] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  VEILLEE: 'Veillée',
  JEUNE: 'Jeûne',
  CROISADE: 'Croisade',
  CONFERENCE: 'Conférence',
  ETUDE_BIBLIQUE: 'Étude biblique',
  DEBAT_BIBLIQUE: 'Débat biblique',
  FORMATION: 'Formation',
  INTERCESSION_SPECIALE: 'Intercession spéciale',
};

export const EVENT_STATUSES = ['CREATED', 'SCHEDULED', 'OPEN', 'RUNNING', 'FINISHED', 'ARCHIVED'] as const;

export interface TagEvent {
  id: string;
  community_id: string | null;
  type: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  status: string;
  created_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string | null;
  role_in_event: string;
  hand_raised_at: string | null;
  created_at: string;
}

export interface EventBreakoutRoom {
  id: string;
  event_id: string;
  label: string;
  capacity: number | null;
  created_at: string;
  occupant_count: number;
}

export interface EventPoll {
  id: string;
  event_id: string;
  question: string;
  options: string[];
  closed_at: string | null;
  created_at: string;
  vote_counts: number[];
  total_votes: number;
  my_vote: number | null;
}

export interface AiChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatResponse {
  reply: string;
  escalated: boolean;
}

export type FaithPathStep = 'DECOUVERTE' | 'QUI_EST_JESUS' | 'EVANGILE' | 'REPONSE_PERSONNELLE' | 'COMMUNAUTE';
export type FaithPathLevel = 'NOUVEAU' | 'CONNAIT_DEJA';

export interface FaithPathProgress {
  current_step: FaithPathStep;
  declared_level: FaithPathLevel | null;
  updated_at: string;
  steps: { step: FaithPathStep; label: string }[];
}

export const aiApi = {
  chatAccueil: (message: string, history: AiChatTurn[]) =>
    request<AiChatResponse>('/ai/accueil/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  chatEvangelisation: (message: string, history: AiChatTurn[]) =>
    request<AiChatResponse>('/ai/evangelisation/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  getFaithPath: (token: string) =>
    request<FaithPathProgress>('/ai/evangelisation/faith-path', { headers: authHeaders(token) }),
  setFaithPathLevel: (token: string, level: FaithPathLevel) =>
    request<FaithPathProgress>('/ai/evangelisation/faith-path/level', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ level }),
    }),
  advanceFaithPath: (token: string) =>
    request<FaithPathProgress>('/ai/evangelisation/faith-path/advance', {
      method: 'POST',
      headers: authHeaders(token),
    }),
};

export const eventsApi = {
  list: (page = 1, type?: string) =>
    request<PaginatedResult<TagEvent>>(`/events?page=${page}&limit=20${type ? `&type=${type}` : ''}`),
  create: (
    token: string,
    data: { type: string; title: string; description?: string; scheduledAt: string; communityId?: string },
  ) => request<TagEvent>('/events', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  updateStatus: (token: string, id: string, status: string) =>
    request<TagEvent>(`/events/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),
  join: (token: string, id: string) =>
    request<EventParticipant>(`/events/${id}/join`, { method: 'POST', headers: authHeaders(token) }),
  listParticipants: (id: string) => request<EventParticipant[]>(`/events/${id}/participants`),
  raiseHand: (token: string, id: string) =>
    request<EventParticipant>(`/events/${id}/hand-raise`, { method: 'POST', headers: authHeaders(token) }),
  lowerHand: (token: string, id: string) =>
    request<void>(`/events/${id}/hand-lower`, { method: 'POST', headers: authHeaders(token) }),
  setParticipantRole: (token: string, id: string, userId: string, role: string) =>
    request<EventParticipant>(`/events/${id}/participants/${userId}/role`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ role }),
    }),
  createBreakoutRooms: (token: string, id: string, roomCount: number) =>
    request<EventBreakoutRoom[]>(`/events/${id}/breakout-rooms`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ roomCount }),
    }),
  listBreakoutRooms: (id: string) => request<EventBreakoutRoom[]>(`/events/${id}/breakout-rooms`),
  myBreakoutRoom: (token: string, id: string) =>
    request<string | null>(`/events/${id}/breakout-rooms/me`, { headers: authHeaders(token) }),
  joinBreakoutRoom: (token: string, id: string, roomId: string) =>
    request<{ roomId: string; redirected: boolean }>(`/events/${id}/breakout-rooms/${roomId}/join`, {
      method: 'POST',
      headers: authHeaders(token),
    }),
  leaveBreakoutRoom: (token: string, id: string) =>
    request<void>(`/events/${id}/breakout-rooms/leave`, { method: 'POST', headers: authHeaders(token) }),
  createPoll: (token: string, id: string, question: string, options: string[]) =>
    request<EventPoll>(`/events/${id}/polls`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ question, options }),
    }),
  listPolls: (id: string) => request<EventPoll[]>(`/events/${id}/polls`),
  votePoll: (token: string, id: string, pollId: string, optionIndex: number) =>
    request<EventPoll>(`/events/${id}/polls/${pollId}/vote`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ optionIndex }),
    }),
  closePoll: (token: string, id: string, pollId: string) =>
    request<EventPoll>(`/events/${id}/polls/${pollId}/close`, { method: 'POST', headers: authHeaders(token) }),
};

export const CAMPAIGN_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;

export interface Campaign {
  id: string;
  community_id: string | null;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export const campaignsApi = {
  list: (page = 1) => request<PaginatedResult<Campaign>>(`/campaigns?page=${page}&limit=20`),
  create: (token: string, data: { title: string; communityId?: string; startDate?: string; endDate?: string }) =>
    request<Campaign>('/campaigns', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) }),
  updateStatus: (token: string, id: string, status: string) =>
    request<Campaign>(`/campaigns/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),
};

export interface MyGamificationStats {
  totalHours: number;
  currentStreakDays: number;
  badges: string[];
  leaderboardOptIn: boolean;
}

export interface CommunityGoal {
  targetHours: number;
  achievedHours: number;
  month: string;
}

export interface LeaderboardEntry {
  displayName: string;
  hours: number;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface Backup {
  id: string;
  status: string;
  note: string | null;
  requested_by: string;
  created_at: string;
}

export interface SystemHealth {
  status: 'OK' | 'DEGRADED';
  database: { connected: boolean; latencyMs: number };
  uptimeSeconds: number;
  checkedAt: string;
}

export const adminApi = {
  auditLogs: (token: string, page = 1, entityType?: string) =>
    request<PaginatedResult<AuditLog>>(
      `/admin/audit-logs?page=${page}&limit=20${entityType ? `&entityType=${encodeURIComponent(entityType)}` : ''}`,
      { headers: authHeaders(token) },
    ),
  backups: (token: string, page = 1) =>
    request<PaginatedResult<Backup>>(`/admin/backups?page=${page}&limit=20`, { headers: authHeaders(token) }),
  runBackup: (token: string) => request<Backup>('/admin/backups/run', { method: 'POST', headers: authHeaders(token) }),
  health: (token: string) => request<SystemHealth>('/admin/system/health', { headers: authHeaders(token) }),
};

export const gamificationApi = {
  myStats: (token: string) => request<MyGamificationStats>('/gamification/me', { headers: authHeaders(token) }),
  communityGoal: () => request<CommunityGoal>('/gamification/community-goal'),
  leaderboard: () => request<LeaderboardEntry[]>('/gamification/leaderboard'),
  setLeaderboardOptIn: (token: string, optIn: boolean) =>
    request<void>('/gamification/leaderboard-opt-in', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ optIn }),
    }),
};
