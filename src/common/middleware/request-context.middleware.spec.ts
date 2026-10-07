import type { NextFunction, Request, Response } from 'express';
import {
  RequestContextMiddleware,
  type RequestWithId,
} from './request-context.middleware.js';
import * as loggerModule from '../logging/logger.js';

function responseStub(): { response: Response; triggerFinish: () => void } {
  let finishListener: (() => void) | undefined;
  const response = {
    statusCode: 204,
    setHeader: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'finish') {
        finishListener = listener;
      }
    }),
  } as unknown as Response;

  return { response, triggerFinish: () => finishListener?.() };
}

function requestStub(
  headers: Record<string, string | undefined>,
  originalUrl = '/profiles/me?token=abc',
): Request {
  return {
    headers,
    method: 'GET',
    originalUrl,
  } as unknown as Request;
}

describe('RequestContextMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("génère un identifiant quand le client n'en fournit pas", () => {
    const middleware = new RequestContextMiddleware();
    const req = requestStub({});
    const { response, triggerFinish } = responseStub();
    const next = vi.fn();
    const logSpy = vi.spyOn(loggerModule, 'log').mockImplementation(() => {});

    middleware.use(req, response, next as NextFunction);

    const id = (req as RequestWithId).id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    expect(next).toHaveBeenCalled();

    triggerFinish();
    expect(logSpy).toHaveBeenCalledWith(
      'info',
      expect.objectContaining({ requestId: id, path: '/profiles/me' }),
    );
  });

  it("reprend l'identifiant du client quand il est valide", () => {
    const middleware = new RequestContextMiddleware();
    const req = requestStub({ 'x-request-id': 'trace-abc-123' });
    const { response } = responseStub();

    middleware.use(req, response, vi.fn() as NextFunction);

    expect((req as RequestWithId).id).toBe('trace-abc-123');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'trace-abc-123',
    );
  });

  it('ignore un identifiant client invalide et en génère un autre', () => {
    const middleware = new RequestContextMiddleware();
    const malformed = 'x'.repeat(200); // dépasse la longueur acceptée
    const req = requestStub({ 'x-request-id': malformed });
    const { response } = responseStub();

    middleware.use(req, response, vi.fn() as NextFunction);

    const id = (req as RequestWithId).id;
    expect(id).not.toBe(malformed);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejette un identifiant client contenant des caractères hors en-tête HTTP', () => {
    const middleware = new RequestContextMiddleware();
    const req = requestStub({ 'x-request-id': 'id\r\nX-Injected: 1' });
    const { response } = responseStub();

    middleware.use(req, response, vi.fn() as NextFunction);

    expect((req as RequestWithId).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).not.toHaveBeenCalledWith(
      'X-Request-Id',
      expect.stringContaining('\r\n'),
    );
  });

  it('ne journalise jamais la query string', () => {
    const middleware = new RequestContextMiddleware();
    const req = requestStub({});
    const { response, triggerFinish } = responseStub();
    const logSpy = vi.spyOn(loggerModule, 'log').mockImplementation(() => {});

    middleware.use(req, response, vi.fn() as NextFunction);
    triggerFinish();

    expect(logSpy).toHaveBeenCalledWith(
      'info',
      expect.objectContaining({ path: '/profiles/me' }),
    );
  });
});
