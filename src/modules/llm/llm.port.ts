/**
 * Le seul contrat que le reste du projet (bientôt `documents`) connaîtra.
 * Tout le reste de ce module — fournisseur réel, faux déterministe, garde-fou,
 * compteur de quota — est un détail d'implémentation derrière `LlmPort`.
 */
export interface GenerateTextInput {
  userId: string;
  prompt: string;
  maxOutputTokens: number;
}

export interface GenerateTextOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export const LLM_PORT = Symbol('LLM_PORT');

export interface LlmPort {
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}

export class LlmTimeoutError extends Error {}
export class LlmRetriesExhaustedError extends Error {}
export class LlmMalformedResponseError extends Error {}
/** 400 — jamais retentée. */
export class LlmRejectedError extends Error {}
export class LlmTokenCapExceededError extends Error {}
export class LlmQuotaExceededError extends Error {}
