import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { WelcomeService } from './welcome.service';

@Module({ imports: [SupabaseModule], providers: [WelcomeService], exports: [WelcomeService] })
export class WelcomeModule {}
