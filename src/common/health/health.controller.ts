import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service.js';

/**
 * Render sonde cette route pour savoir si l'app est vivante. `@SkipThrottle`
 * parce qu'un ping d'infrastructure ne doit jamais se faire bloquer par le
 * plafond partagé avec le trafic applicatif.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<{ status: 'ok' }> {
    const healthy = await this.healthService.isHealthy();

    if (!healthy) {
      // Jamais de détail d'infrastructure dans la réponse — seulement le
      // format d'erreur générique du projet.
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service indisponible',
      });
    }

    return { status: 'ok' };
  }
}
