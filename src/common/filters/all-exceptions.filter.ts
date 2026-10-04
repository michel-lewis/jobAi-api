import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** Le contrat d'erreur de l'API. Une seule forme, pour toutes les erreurs. */
export interface ErrorResponse {
  code: string;
  message: string;
  errors?: { field: string; message: string }[];
}

/** Un code lisible pour les erreurs que NestJS lève lui-même. */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Attrape TOUTES les exceptions et les renvoie dans un format unique.
 *
 * Avant : l'API parlait deux langues. Celle du projet quand le code levait
 * lui-même l'exception, celle de NestJS pour tout le reste — 429 du
 * throttler, 404 d'une route inconnue, 500 d'un bug. Le frontend devait
 * gérer les deux.
 *
 * Un détail compte plus que le reste : un bug non prévu ne doit jamais
 * laisser fuiter son message vers le client. Un message d'erreur Postgres
 * décrit le schéma de la base ; une trace de pile décrit l'arborescence du
 * serveur. On journalise le détail, on renvoie une phrase neutre.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    httpAdapter.reply(
      host.switchToHttp().getResponse(),
      this.toErrorResponse(exception, status),
      status,
    );
  }

  private toErrorResponse(exception: unknown, status: number): ErrorResponse {
    if (!(exception instanceof HttpException)) {
      // Erreur non prévue : on garde le détail pour nous.
      this.logger.error('Unhandled exception', exception);
      return {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue',
      };
    }

    const body = exception.getResponse();

    // Le code a déjà levé notre format : on le laisse passer tel quel.
    if (this.isErrorResponse(body)) {
      return body;
    }

    // Exception de NestJS : on la traduit.
    return {
      code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR',
      message: exception.message,
    };
  }

  private isErrorResponse(body: unknown): body is ErrorResponse {
    return (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as ErrorResponse).code === 'string' &&
      typeof (body as ErrorResponse).message === 'string'
    );
  }
}
