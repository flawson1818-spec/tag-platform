import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TagsModule } from '../tags/tags.module';
import { ItemsModule } from '../items/items.module';

@Module({
  imports: [PrismaModule, TagsModule, ItemsModule],
})
export class AppModule {}
