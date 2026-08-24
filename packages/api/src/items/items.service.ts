import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './item.entity';

@Injectable()
export class ItemsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('items');
  }

  private get itemTagsDb() {
    return this.supabase.client.from('item_tags');
  }

  async findAll() {
    const { data, error } = await this.db
      .select('*, tags(*)')
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data as Item[];
  }

  async findOne(id: string) {
    const { data, error } = await this.db.select('*, tags(*)').eq('id', id).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Item ${id} not found`);
    return data as Item;
  }

  async create(dto: CreateItemDto) {
    const { tagIds, ...data } = dto;
    const { data: item, error } = await this.db.insert(data).select().single();
    if (error) throw new InternalServerErrorException(error.message);

    if (tagIds?.length) {
      await this.setTags(item.id, tagIds);
    }
    return this.findOne(item.id);
  }

  async update(id: string, dto: UpdateItemDto) {
    await this.findOne(id);
    const { tagIds, ...data } = dto;

    if (Object.keys(data).length) {
      const { error } = await this.db.update(data).eq('id', id);
      if (error) throw new InternalServerErrorException(error.message);
    }
    if (tagIds !== undefined) {
      await this.setTags(id, tagIds);
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    const { error } = await this.db.delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  private async setTags(itemId: string, tagIds: string[]) {
    const { error: deleteError } = await this.itemTagsDb.delete().eq('item_id', itemId);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    if (!tagIds.length) return;

    const { error: insertError } = await this.itemTagsDb.insert(
      tagIds.map((tagId) => ({ item_id: itemId, tag_id: tagId })),
    );
    if (insertError) throw new InternalServerErrorException(insertError.message);
  }
}
