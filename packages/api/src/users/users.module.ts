import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AdministrationModule } from '../administration/administration.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [SupabaseModule, AccessModule, AdministrationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
