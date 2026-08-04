import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.item.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tags: true },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { tags: true },
    });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found`);
    }
    return item;
  }

  create(dto: CreateItemDto) {
    const { tagIds, ...data } = dto;
    return this.prisma.item.create({
      data: {
        ...data,
        tags: tagIds ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      },
      include: { tags: true },
    });
  }

  async update(id: string, dto: UpdateItemDto) {
    await this.findOne(id);
    const { tagIds, ...data } = dto;
    return this.prisma.item.update({
      where: { id },
      data: {
        ...data,
        tags: tagIds ? { set: tagIds.map((id) => ({ id })) } : undefined,
      },
      include: { tags: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.item.delete({ where: { id } });
  }
}
