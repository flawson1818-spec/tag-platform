import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { Notification } from './notification.entity';

const NOTIFICATION_COLUMNS = 'id, user_id, type, payload, status, read_at, created_at';

@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('notifications');
  }

  /** Creates an in-app notification for a user. See docs/01_FUNCTIONAL_SPECIFICATION.md section 11 for trigger types. */
  async create(userId: string, type: string, payload: Record<string, unknown> = {}): Promise<Notification> {
    const { data, error } = await this.db
      .insert({ user_id: userId, type, payload, status: 'DELIVERED' })
      .select(NOTIFICATION_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Notification;
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
