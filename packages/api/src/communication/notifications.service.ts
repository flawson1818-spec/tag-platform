import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { NOTIFICATION_TYPES, Notification, NotificationPreference, NotificationType } from './notification.entity';

const NOTIFICATION_COLUMNS = 'id, user_id, type, payload, status, read_at, created_at';

@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('notifications');
  }

  private get usersDb() {
    return this.supabase.client.from('users');
  }

  /**
   * Creates an in-app notification for a user, unless they've turned this type off
   * (docs/07_UX_UI_SPECIFICATION.md §11 "préférences par type de notification"). Returns null
   * when suppressed rather than throwing — a disabled preference is an expected outcome, not
   * an error condition callers need to handle specially. See
   * docs/01_FUNCTIONAL_SPECIFICATION.md section 11 for trigger types.
   */
  async create(userId: string, type: string, payload: Record<string, unknown> = {}): Promise<Notification | null> {
    if (!(await this.isEnabled(userId, type))) return null;

    const { data, error } = await this.db
      .insert({ user_id: userId, type, payload, status: 'DELIVERED' })
      .select(NOTIFICATION_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Notification;
  }

  /**
   * Fails open (true) on any lookup hiccup — an ancillary preference check must never block a
   * legitimate notification, same philosophy as AiModerationService/SocialPublicationsService's
   * auto-publish lookup.
   */
  private async isEnabled(userId: string, type: string): Promise<boolean> {
    const { data, error } = await this.usersDb.select('notification_prefs').eq('id', userId).maybeSingle();
    if (error || !data) return true;
    const prefs = (data as { notification_prefs: Record<string, boolean> }).notification_prefs ?? {};
    return prefs[type] !== false;
  }

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    const { data, error } = await this.usersDb.select('notification_prefs').eq('id', userId).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const prefs = (data as { notification_prefs: Record<string, boolean> } | null)?.notification_prefs ?? {};
    return NOTIFICATION_TYPES.map((t) => ({ type: t, enabled: prefs[t] !== false }));
  }

  async setPreference(userId: string, type: string, enabled: boolean): Promise<NotificationPreference[]> {
    if (!NOTIFICATION_TYPES.includes(type as NotificationType)) {
      throw new BadRequestException(`Unknown notification type: ${type}`);
    }
    const { data, error } = await this.usersDb.select('notification_prefs').eq('id', userId).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const prefs = { ...((data as { notification_prefs: Record<string, boolean> } | null)?.notification_prefs ?? {}), [type]: enabled };

    const { error: updateError } = await this.usersDb.update({ notification_prefs: prefs }).eq('id', userId);
    if (updateError) throw new InternalServerErrorException(updateError.message);

    return NOTIFICATION_TYPES.map((t) => ({ type: t, enabled: prefs[t] !== false }));
  }

  async listForUser(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedResult<Notification>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(NOTIFICATION_COLUMNS, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.status) request = request.eq('status', query.status);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Notification[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const { data, error } = await this.db
      .update({ status: 'READ', read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select(NOTIFICATION_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Notification ${id} not found`);
    return data as unknown as Notification;
  }

  async markAllRead(userId: string): Promise<void> {
    const { error } = await this.db
      .update({ status: 'READ', read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .neq('status', 'READ');
    if (error) throw new InternalServerErrorException(error.message);
  }

  async archive(id: string, userId: string): Promise<Notification> {
    const { data, error } = await this.db
      .update({ status: 'ARCHIVED' })
      .eq('id', id)
      .eq('user_id', userId)
      .select(NOTIFICATION_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Notification ${id} not found`);
    return data as unknown as Notification;
  }
}
