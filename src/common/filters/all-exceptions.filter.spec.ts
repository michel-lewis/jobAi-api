import { HttpAdapterHost } from '@nestjs/core';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import * as loggerModule from '../logging/logger.js';

function hostWith(requestId: string): {
  host: ArgumentsHost;
  reply: ReturnType<typeof vi.fn>;
} {
  const reply = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: requestId }),
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return { host, reply };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("journalise l'id de corrélation de la requête pour une erreur non prévue", () => {
    const logSpy = vi.spyOn(loggerModule, 'log').mockImplementation(() => {});
    const { host, reply } = hostWith('req-abc-123');
    const adapterHost = {
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost;
    const filter = new AllExceptionsFilter(adapterHost);

    filter.catch(new Error('panne inattendue'), host);

    expect(logSpy).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ requestId: 'req-abc-123' }),
    );
    // Le client ne voit jamais le détail, seulement le code neutre.
    expect(reply).toHaveBeenCalledWith(
      {},
      {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue',
      },
      500,
    );
  });
});
