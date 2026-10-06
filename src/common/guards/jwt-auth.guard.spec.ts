import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard.js';

const mockJwtService = {
  verifyAsync: vi.fn(),
};

function contextWith(authorization: string | undefined): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const request: Partial<AuthenticatedRequest> = {
    headers: { authorization },
  } as Partial<AuthenticatedRequest>;

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(mockJwtService as unknown as JwtService);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('refuse une requête sans en-tête Authorization', async () => {
    const { context } = contextWith(undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('refuse un en-tête qui n est pas un jeton Bearer', async () => {
    const { context } = contextWith('un-jeton-sans-prefixe');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('refuse un jeton invalide ou expiré', async () => {
    mockJwtService.verifyAsync.mockRejectedValueOnce(new Error('expiré'));
    const { context } = contextWith('Bearer un-jeton-perime');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepte un jeton valide et pose userId sur la requête', async () => {
    mockJwtService.verifyAsync.mockResolvedValueOnce({ sub: 'user-123' });
    const { context, request } = contextWith('Bearer un-jeton-valide');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.userId).toBe('user-123');
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('un-jeton-valide');
  });
});
