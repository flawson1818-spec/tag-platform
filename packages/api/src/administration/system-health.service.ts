import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface SystemHealth {
  status: 'OK' | 'DEGRADED';
  database: { connected: boolean; latencyMs: number };
  uptimeSeconds: number;
  checkedAt: string;
}

@Injectable()
export class SystemHealthService {
  constructor(private readonly supabase: SupabaseService) {}

  async check(): Promise<SystemHealth> {
    const start = Date.now();
    const { error } = await this.supabase.client.from('roles').select('id').limit(1);
    const latencyMs = Date.now() - start;

    return {
      status: error ? 'DEGRADED' : 'OK',
      database: { connected: !error, latencyMs },
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }
}
