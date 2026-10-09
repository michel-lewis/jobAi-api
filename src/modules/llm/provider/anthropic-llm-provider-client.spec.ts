import { AnthropicLlmProviderClient } from './anthropic-llm-provider-client.js';
import { LlmProviderHttpError } from './llm-provider-client.js';

/**
 * Clé volontairement reconnaissable : si elle réapparaît n'importe où dans
 * l'erreur levée (message, propriétés propres, stack), le test la retrouve.
 */
const SECRET_API_KEY = 'sk-ant-TEST-SECRET-KEY-9f3e1c7a2b';

/** Concatène tout ce qu'une Error peut porter, y compris ses propriétés
 * propres non énumérables par défaut (message, stack) et celles ajoutées
 * par une sous-classe (ex. `status` sur LlmProviderHttpError). */
function flattenError(error: unknown): string {
  if (!(error instanceof Error)) {
    return JSON.stringify(error);
  }
  const ownProps = JSON.stringify(error, Object.getOwnPropertyNames(error));
  return `${error.message}\n${String(error.stack ?? '')}\n${ownProps}`;
}

/** Une Response minimale, suffisante pour ce que le client doit lire. */
function fakeFetchResponse(init: {
  ok: boolean;
  status: number;
  body: unknown;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
    text: async () => JSON.stringify(init.body),
  } as unknown as Response;
}

describe('AnthropicLlmProviderClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('traduit une réponse 200 bien formée en RawLlmResponse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeFetchResponse({
        ok: true,
        status: 200,
        body: {
          id: 'msg_01',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Bonjour, voici votre réponse.' }],
          model: 'claude-3-5-sonnet-test',
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 34 },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new AnthropicLlmProviderClient(
      SECRET_API_KEY,
      'claude-3-5-sonnet-test',
    );

    const response = await client.send(
      { prompt: 'Dis bonjour', maxOutputTokens: 100 },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      text: 'Bonjour, voici votre réponse.',
      inputTokens: 12,
      outputTokens: 34,
    });
  });

  it(
    "une erreur HTTP du fournisseur (401) ne fait jamais fuiter la clé d'API " +
      'dans LlmProviderHttpError, même si la réponse du fournisseur contenait ' +
      'du détail sur la requête',
    async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        fakeFetchResponse({
          ok: false,
          status: 401,
          body: {
            type: 'error',
            error: {
              type: 'authentication_error',
              message: 'invalid x-api-key',
            },
          },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const client = new AnthropicLlmProviderClient(
        SECRET_API_KEY,
        'claude-3-5-sonnet-test',
      );

      const error = await client
        .send(
          { prompt: 'Dis bonjour', maxOutputTokens: 100 },
          new AbortController().signal,
        )
        .catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(LlmProviderHttpError);
      expect((error as InstanceType<typeof LlmProviderHttpError>).status).toBe(
        401,
      );
      expect(flattenError(error)).not.toContain(SECRET_API_KEY);
    },
  );

  it(
    "une erreur HTTP du fournisseur (500) ne fait jamais fuiter la clé d'API " +
      'dans LlmProviderHttpError',
    async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        fakeFetchResponse({
          ok: false,
          status: 500,
          body: {
            type: 'error',
            error: { type: 'api_error', message: 'Internal server error' },
          },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const client = new AnthropicLlmProviderClient(
        SECRET_API_KEY,
        'claude-3-5-sonnet-test',
      );

      const error = await client
        .send(
          { prompt: 'Dis bonjour', maxOutputTokens: 100 },
          new AbortController().signal,
        )
        .catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(LlmProviderHttpError);
      expect((error as InstanceType<typeof LlmProviderHttpError>).status).toBe(
        500,
      );
      expect(flattenError(error)).not.toContain(SECRET_API_KEY);
    },
  );
});
