import type { MiddlewareConsumer } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware.js';

/**
 * Point d'application unique — appelé par AppModule.configure() et par le
 * harnais de test. Deux endroits qui décident du câblage de la middleware
 * pourraient diverger ; un seul qui décide ne le peut pas.
 */
export function applyGlobalMiddleware(consumer: MiddlewareConsumer): void {
  consumer.apply(RequestContextMiddleware).forRoutes('*');
}
