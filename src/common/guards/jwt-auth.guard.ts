import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

const BEARER_PREFIX = 'Bearer ';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

/**
 * Vérifie le JWT et pose `request.userId`. Vit dans `common/`, pas dans
 * `auth/` : un module métier de couche 1 (ex. `profiles`) ne peut pas
 * importer un autre module de couche 1 pour obtenir ce guard. Il ne dépend
 * que de `JwtService`, un tiers — jamais de `AuthService`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Jeton manquant');
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    return header?.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length)
      : undefined;
  }
}
