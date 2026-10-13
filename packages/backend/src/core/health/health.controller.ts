import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService, type ReadinessReport } from './health.service';

/**
 * Endpoints de saúde consumidos por orquestradores (k8s, load balancer).
 *
 * `GET /health` responde enquanto o processo está de pé; `GET /health/ready`
 * só responde 200 quando banco, Redis e storage estão saudáveis, caso
 * contrário devolve 503 com o relatório detalhado no corpo.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): { status: 'ok' } {
    return this.health.liveness();
  }

  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.readiness();

    const isUnavailable = report.status === 'error';
    if (isUnavailable) {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
