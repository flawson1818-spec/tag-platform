import { Controller, Get } from '@nestjs/common';

/**
 * Public, unauthenticated, no database round-trip — this is what Docker's HEALTHCHECK and a
 * Kubernetes livenessProbe hit. For a real dependency check (DB connectivity/latency), see the
 * authenticated GET /admin/system/health instead (AdminController/SystemHealthService).
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
