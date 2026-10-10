import {
  LlmProviderHttpError,
  type LlmProviderClient,
  type RawLlmRequest,
  type RawLlmResponse,
} from './llm-provider-client.js';

export type FakeLlmScenario =
  'normal' | 'timeout' | 'rate_limited' | 'rejected' | 'malformed';

/**
 * Déterministe : chaque scénario produit toujours le même comportement.
 * 'timeout' n'a pas d'horloge propre — il attend que le `signal` fourni par
 * l'appelant s'annule, puis rejette. Un délai interne au faux testerait
 * l'horloge du faux, pas celle du garde-fou.
 */
export class FakeLlmProviderClient implements LlmProviderClient {
  constructor(private readonly scenario: FakeLlmScenario) {}

  send(_request: RawLlmRequest, signal: AbortSignal): Promise<RawLlmResponse> {
    switch (this.scenario) {
      case 'normal':
        return Promise.resolve({
          text: 'Voici une lettre de motivation générée.',
          inputTokens: 12,
          outputTokens: 34,
        });

      case 'timeout':
        return new Promise<RawLlmResponse>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('Appel abandonné (signal annulé)'));
          });
        });

      case 'rate_limited':
        return Promise.reject(
          new LlmProviderHttpError(429, 'Too Many Requests'),
        );

      case 'rejected':
        return Promise.reject(new LlmProviderHttpError(400, 'Bad Request'));

      case 'malformed':
        // Forme volontairement invalide : outputTokens manquant. Le cast
        // ment sur le type, exactement ce qu'un vrai fournisseur pourrait
        // renvoyer sans prévenir le compilateur — GuardedLlmService valide
        // la forme à l'exécution, pas TypeScript.
        return Promise.resolve({
          text: 'incomplet',
        } as unknown as RawLlmResponse);
    }
  }
}
