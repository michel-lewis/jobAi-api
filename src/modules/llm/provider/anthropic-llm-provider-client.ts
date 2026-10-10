import type {
  LlmProviderClient,
  RawLlmRequest,
  RawLlmResponse,
} from './llm-provider-client.js';
import { LlmProviderHttpError } from './llm-provider-client.js';
import { LlmMalformedResponseError } from '../llm.port.js';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessagesResponseBody {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Une seule tentative — `GuardedLlmService` porte le retry et le délai.
 * N'extrait jamais les en-têtes ou le corps de LA REQUÊTE dans un message
 * d'erreur : c'est le seul endroit du projet où une clé d'API transite,
 * donc le seul endroit où elle pourrait fuiter si on y était négligent.
 */
export class AnthropicLlmProviderClient implements LlmProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async send(
    request: RawLlmRequest,
    signal: AbortSignal,
  ): Promise<RawLlmResponse> {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxOutputTokens,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new LlmProviderHttpError(
        response.status,
        `Le fournisseur a répondu ${response.status}`,
      );
    }

    let body: AnthropicMessagesResponseBody;
    try {
      body = (await response.json()) as AnthropicMessagesResponseBody;
    } catch {
      // Un 200 dont le corps n'est pas du JSON valide n'est pas un délai ni
      // une erreur réseau retentable : c'est une réponse malformée, au même
      // titre qu'une forme JSON inattendue détectée plus loin.
      throw new LlmMalformedResponseError(
        'La réponse du fournisseur n’est pas un JSON valide',
      );
    }

    // Une forme inattendue n'est pas détectée ici : GuardedLlmService valide
    // la forme générique de RawLlmResponse après coup, quelle que soit
    // l'implémentation de LlmProviderClient qui l'a produite (réelle ou
    // faux déterministe) — ce cast ment sur le type comme le ferait une
    // vraie réponse malformée, volontairement.
    return {
      text: body.content?.[0]?.text,
      inputTokens: body.usage?.input_tokens,
      outputTokens: body.usage?.output_tokens,
    } as unknown as RawLlmResponse;
  }
}
