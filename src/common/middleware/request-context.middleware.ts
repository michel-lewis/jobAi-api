import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { log } from '../logging/logger.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Un en-tête client est repris tel quel sinon. Restreint aux caractères
 * sûrs pour un en-tête HTTP de sortie (res.setHeader lève sur tout ce qui
 * sort du latin1 imprimable) et à une longueur raisonnable, pour qu'un
 * identifiant de corrélation client ne puisse ni planter la réponse ni
 * gonfler les logs.
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface RequestWithId extends Request {
  id: string;
}

function resolveRequestId(req: Request): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;

  return candidate && VALID_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
}

/**
 * Pose un identifiant de corrélation sur chaque requête — repris de
 * l'en-tête client s'il existe et est valide, sinon généré — et journalise
 * une ligne structurée une fois la réponse envoyée (le statut n'est connu
 * qu'à ce moment-là).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = resolveRequestId(req);
    (req as RequestWithId).id = id;
    res.setHeader('X-Request-Id', id);

    const start = Date.now();
    res.on('finish', () => {
      log('info', {
        requestId: id,
        method: req.method,
        // Jamais la query string : un futur lien de vérification ou de
        // reset password y mettrait un token, que redact() ne protège pas
        // puisque ce n'est pas une clé d'objet.
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    });

    next();
  }
}
