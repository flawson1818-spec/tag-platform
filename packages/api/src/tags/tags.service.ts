import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { Tag } from './tag.entity';

@Injectable()
export class TagsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('tags');
  }

  async findAll() {
    const { data, error } = await this.db
      .select('*, items(id)')
      .order('name', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data as (Tag & { items: { id: string }[] })[]).map(({ items, ...tag }) => ({
      ...tag,
      _count: { items: items.length },
    }));
  }

  async findOne(id: string) {
    const { data, error } = await this.db.select('*, items(*)').eq('id', id).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Tag ${id} not found`);
    return data;
  }

  async create(dto: CreateTagDto) {
    const { data: existing } = await this.db.select('id').eq('name', dto.name).maybeSingle();
    if (existing) {
      throw new ConflictException(`Tag "${dto.name}" already exists`);
    }
    const { data, error } = await this.db.insert(dto).select().single();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(`Tag "${dto.name}" already exists`);
      }
      throw new InternalServerErrorException(error.message);
    }
    return data as Tag;
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.findOne(id);
    const { data, error } = await this.db.update(dto).eq('id', id).select().single();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(`Tag "${dto.name}" already exists`);
      }
      throw new InternalServerErrorException(error.message);
    }
    return data as Tag;
  }

  async remove(id: string) {
    await this.findOne(id);
    const { error } = await this.db.delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
