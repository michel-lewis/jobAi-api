/**
 * Interne au module — jamais exporté par `LlmModule`. Une seule tentative,
 * jamais de retry ni de budget temporel ici : c'est `GuardedLlmService` qui
 * décide, pour n'importe quelle implémentation (réelle ou faux déterministe).
 */
export interface RawLlmRequest {
  prompt: string;
  maxOutputTokens: number;
}

export interface RawLlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export const LLM_PROVIDER_CLIENT = Symbol('LLM_PROVIDER_CLIENT');

export interface LlmProviderClient {
  send(request: RawLlmRequest, signal: AbortSignal): Promise<RawLlmResponse>;
}

/** Levée sur un code d'erreur HTTP du fournisseur — jamais sur une réponse malformée. */
export class LlmProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
