import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { log } from '../../common/logging/logger.js';
import {
  LlmMalformedResponseError,
  LlmRejectedError,
  LlmRetriesExhaustedError,
  LlmTimeoutError,
  LlmTokenCapExceededError,
  type GenerateTextInput,
  type GenerateTextOutput,
  type LlmPort,
} from './llm.port.js';
import {
  LlmProviderHttpError,
  type LlmProviderClient,
} from './provider/llm-provider-client.js';
import type { DailyQuotaTracker } from './daily-quota-tracker.js';

export interface GuardedLlmServiceConfig {
  totalBudgetMs: number;
  maxAttempts: number;
  maxOutputTokensCeiling: number;
  dailyQuotaLimit: number;
  retryBackoffMs: number;
}

const rawResponseSchema = z.object({
  text: z.string().min(1),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
});

/** Tarif approximatif, à ajuster si le modèle par défaut change. */
const INPUT_RATE_USD_PER_1K_TOKENS = 0.0008;
const OUTPUT_RATE_USD_PER_1K_TOKENS = 0.004;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Le point de passage unique vers le fournisseur. Porte le délai total, la
 * politique de retry, le plafond de jetons, le quota quotidien et la
 * journalisation sans fuite — une seule fois, pour n'importe quelle
 * implémentation de LlmProviderClient et de DailyQuotaTracker injectée.
 */
@Injectable()
export class GuardedLlmService implements LlmPort {
  constructor(
    private readonly client: LlmProviderClient,
    private readonly quota: DailyQuotaTracker,
    private readonly config: GuardedLlmServiceConfig,
  ) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const started = Date.now();

    try {
      if (input.maxOutputTokens > this.config.maxOutputTokensCeiling) {
        throw new LlmTokenCapExceededError(
          `maxOutputTokens (${input.maxOutputTokens}) dépasse le plafond (${this.config.maxOutputTokensCeiling})`,
        );
      }

      const result = await this.attemptWithRetries(input);

      log('info', {
        userId: input.userId,
        durationMs: Date.now() - started,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        outcome: 'success',
      });

      return result;
    } catch (error) {
      log('error', {
        userId: input.userId,
        durationMs: Date.now() - started,
        outcome: 'error',
        errorKind: error instanceof Error ? error.constructor.name : 'unknown',
      });
      throw error;
    }
  }

  private async attemptWithRetries(
    input: GenerateTextInput,
  ): Promise<GenerateTextOutput> {
    let remainingBudgetMs = this.config.totalBudgetMs;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      // Une unité de quota par tentative qui atteint réellement le
      // fournisseur — pas seulement en cas de succès final. Avant tout
      // appel réseau : un quota dépassé ne doit jamais toucher le fournisseur.
      await this.quota.consume(input.userId, this.config.dailyQuotaLimit);

      const remainingAttempts = this.config.maxAttempts - attempt + 1;
      const attemptTimeoutMs = Math.max(
        1,
        Math.floor(remainingBudgetMs / remainingAttempts),
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
      const attemptStarted = Date.now();
      let attemptFailedAsTimeout = false;

      try {
        const raw = await this.client.send(
          { prompt: input.prompt, maxOutputTokens: input.maxOutputTokens },
          controller.signal,
        );

        const parsed = rawResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new LlmMalformedResponseError(
            'La réponse du fournisseur ne respecte pas le format attendu',
          );
        }

        return {
          text: parsed.data.text,
          inputTokens: parsed.data.inputTokens,
          outputTokens: parsed.data.outputTokens,
          estimatedCostUsd: this.estimateCostUsd(
            parsed.data.inputTokens,
            parsed.data.outputTokens,
          ),
        };
      } catch (error) {
        if (error instanceof LlmMalformedResponseError) {
          throw error;
        }

        if (error instanceof LlmProviderHttpError) {
          if (!isRetryableStatus(error.status)) {
            throw new LlmRejectedError(error.message);
          }
        } else {
          // Abandon (délai dépassé) ou erreur réseau : retentable, comme un 5xx.
          attemptFailedAsTimeout = true;
        }

        remainingBudgetMs -= Date.now() - attemptStarted;
        const isLastAttempt = attempt === this.config.maxAttempts;

        if (isLastAttempt || remainingBudgetMs <= 0) {
          throw attemptFailedAsTimeout
            ? new LlmTimeoutError('Délai total dépassé')
            : new LlmRetriesExhaustedError(
                'Nombre maximal de tentatives atteint',
              );
        }

        await sleep(this.config.retryBackoffMs);
        remainingBudgetMs -= this.config.retryBackoffMs;
      } finally {
        clearTimeout(timer);
      }
    }

    // Inatteignable : chaque itération renvoie ou lève avant la fin de la
    // boucle. Conserve le type de retour pour TypeScript.
    throw new LlmRetriesExhaustedError('Nombre maximal de tentatives atteint');
  }

  private estimateCostUsd(inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1000) * INPUT_RATE_USD_PER_1K_TOKENS +
      (outputTokens / 1000) * OUTPUT_RATE_USD_PER_1K_TOKENS
    );
  }
}
