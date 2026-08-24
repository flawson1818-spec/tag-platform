import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class StorageModule {}
