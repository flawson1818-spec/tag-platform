import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { AuditLogService } from '../administration/audit-log.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserStatus } from './user.entity';
import { toUserResponse, UserResponseDto } from './user-response.dto';

const USER_COLUMNS =
  'id, email, phone, password_hash, display_name, avatar_file_id, locale, timezone, status, mfa_enabled, email_verified_at, created_at, updated_at, deleted_at';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  displayName: string;
  phone?: string;
  locale?: string;
  timezone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private get db() {
    return this.supabase.client.from('users');
  }

  async findById(id: string): Promise<User> {
    const { data, error } = await this.db
      .select(USER_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`User ${id} not found`);
    return data as unknown as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.db.select(USER_COLUMNS).eq('email', email).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as User | null;
  }

  async create(input: CreateUserData): Promise<User> {
    const { data, error } = await this.db
      .insert({
        email: input.email,
        password_hash: input.passwordHash,
        display_name: input.displayName,
        phone: input.phone,
        locale: input.locale,
        timezone: input.timezone,
      })
      .select(USER_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') throw new ConflictException('Email already registered');
      throw new InternalServerErrorException(error.message);
    }
    return data as unknown as User;
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findById(id);
    const { data, error } = await this.db
      .update({
        display_name: dto.displayName,
        phone: dto.phone,
        locale: dto.locale,
        timezone: dto.timezone,
        avatar_file_id: dto.avatarFileId,
      })
      .eq('id', id)
      .select(USER_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as User;
  }

  async updateStatus(id: string, status: UserStatus, actorId: string): Promise<User> {
    const before = await this.findById(id);
    const { data, error } = await this.db
      .update({ status })
      .eq('id', id)
      .select(USER_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    await this.auditLogService.record(actorId, 'USER_STATUS_CHANGED', 'user', id, { status: before.status }, {
      status,
    });

    return data as unknown as User;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const { error } = await this.db.update({ password_hash: passwordHash }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * mfa_secret deliberately never joins USER_COLUMNS / the User entity — it must never travel
   * through toUserResponse() or any general-purpose user read. These three methods are the only
   * code path allowed to touch it, and only AuthService's MFA flows call them.
   */
  async getMfaSecret(id: string): Promise<string | null> {
    const { data, error } = await this.db.select('mfa_secret').eq('id', id).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return (data as { mfa_secret: string | null } | null)?.mfa_secret ?? null;
  }

  async setMfaSecret(id: string, secret: string): Promise<void> {
    const { error } = await this.db.update({ mfa_secret: secret }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async setMfaEnabled(id: string, enabled: boolean): Promise<void> {
    const { error } = await this.db
      .update({ mfa_enabled: enabled, ...(enabled ? {} : { mfa_secret: null }) })
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    await this.findById(id);
    const { error } = await this.db
      .update({ status: 'DELETED', deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);

    await this.auditLogService.record(actorId, 'USER_DELETED', 'user', id);
  }

  /**
   * Self-service GDPR export (docs/08_NON_FUNCTIONAL_REQUIREMENTS.md section 7 — "Droit d'accès,
   * de rectification, d'export et de suppression des données personnelles depuis le Profil").
   * Synchronous JSON, unlike the admin bulk-export job/file pipeline in AnalyticsService — a
   * single user's own data is small enough not to need async job handling.
   */
  async exportMyData(userId: string): Promise<Record<string, unknown>> {
    const profile = toUserResponse(await this.findById(userId));

    const [prayerRequests, testimonies, eventParticipations, notifications, aiInteractions] = await Promise.all([
      this.supabase.client.from('prayer_requests').select('*').eq('author_id', userId),
      this.supabase.client.from('testimonies').select('*').eq('author_id', userId),
      this.supabase.client.from('event_participants').select('*').eq('user_id', userId),
      this.supabase.client.from('notifications').select('*').eq('user_id', userId),
      this.supabase.client.from('ai_interaction_logs').select('*').eq('user_id', userId),
    ]);

    for (const result of [prayerRequests, testimonies, eventParticipations, notifications, aiInteractions]) {
      if (result.error) throw new InternalServerErrorException(result.error.message);
    }

    return {
      exportedAt: new Date().toISOString(),
      profile,
      prayerRequests: prayerRequests.data,
      testimonies: testimonies.data,
      eventParticipations: eventParticipations.data,
      notifications: notifications.data,
      aiInteractions: aiInteractions.data,
    };
  }

  /**
   * docs/02_AI_AGENTS_SPECIFICATION.md section 8 — "mémoire longue... accessible à l'utilisateur
   * (consultation et suppression)". Consultation is covered by exportMyData(); this is the
   * deletion half, kept separate from full account deletion since a user may want to clear their
   * AI history without deleting their whole account.
   */
  async deleteMyAiHistory(userId: string): Promise<void> {
    const { error } = await this.supabase.client.from('ai_interaction_logs').delete().eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * Self-service account deletion — unlike the admin-triggered softDelete() above (which leaves
   * identifying fields intact for moderation/audit history on accounts an admin removes), this
   * also scrubs PII since the user is explicitly exercising their own right to erasure. Revokes
   * every refresh token so existing sessions stop working immediately.
   */
  async deleteMyAccount(userId: string): Promise<void> {
    await this.findById(userId);
    const anonymizedEmail = `deleted-${userId}@tag.invalid`;

    const { error } = await this.db
      .update({
        status: 'DELETED',
        deleted_at: new Date().toISOString(),
        email: anonymizedEmail,
        phone: null,
        display_name: 'Compte supprimé',
        avatar_file_id: null,
      })
      .eq('id', userId);
    if (error) throw new InternalServerErrorException(error.message);

    const { error: tokenError } = await this.supabase.client
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (tokenError) throw new InternalServerErrorException(tokenError.message);

    await this.auditLogService.record(userId, 'USER_SELF_DELETED', 'user', userId);
  }

  async list(query: ListUsersQueryDto): Promise<PaginatedResult<UserResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(USER_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.status) {
      request = request.eq('status', query.status);
    }

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return {
      data: (data as unknown as User[]).map(toUserResponse),
      meta: buildPaginationMeta(page, limit, count ?? 0),
    };
  }
}
