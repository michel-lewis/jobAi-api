import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { LLM_PORT } from './llm.port.js';
import {
  LLM_PROVIDER_CLIENT,
  type LlmProviderClient,
} from './provider/llm-provider-client.js';
import { FakeLlmProviderClient } from './provider/fake-llm-provider-client.js';
import { AnthropicLlmProviderClient } from './provider/anthropic-llm-provider-client.js';
import {
  DAILY_QUOTA_TRACKER,
  type DailyQuotaTracker,
} from './daily-quota-tracker.js';
import { PostgresDailyQuotaTracker } from './postgres-daily-quota-tracker.js';
import {
  GuardedLlmService,
  type GuardedLlmServiceConfig,
} from './guarded-llm.service.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}

function readConfigFromEnv(moduleRef: ModuleRef): GuardedLlmServiceConfig {
  const config = moduleRef.get(ConfigService, { strict: false });
  return {
    totalBudgetMs: config.get<number>('LLM_TOTAL_BUDGET_MS') ?? 55_000,
    maxAttempts: config.get<number>('LLM_MAX_ATTEMPTS') ?? 3,
    maxOutputTokensCeiling: config.get<number>('LLM_MAX_OUTPUT_TOKENS') ?? 1024,
    dailyQuotaLimit: config.get<number>('LLM_DAILY_QUOTA_PER_USER') ?? 20,
    retryBackoffMs: config.get<number>('LLM_RETRY_BACKOFF_MS') ?? 500,
  };
}

/**
 * COUCHE 1 — feuille, aucun autre module métier importé.
 *
 * Pas de ConfigModule ni de TypeOrmModule dans les imports : ConfigService et
 * DataSource sont résolus PARESSEUSEMENT via ModuleRef, seulement dans la
 * branche qui en a réellement besoin. En environnement de test, aucune des
 * deux n'est jamais appelée, donc ce module compile et s'exécute seul — sans
 * AppModule ni ConfigModule.forRoot() ailleurs dans l'arbre, ce qui permet de
 * le tester en isolation sans jamais toucher le réseau ni la base.
 *
 * Le choix d'implémentation lit `process.env.NODE_ENV` directement dans le
 * corps de chaque fabrique, jamais dans une condition statique au chargement
 * du fichier : une valeur posée juste avant de compiler le module doit être
 * celle que ces fabriques voient.
 */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER_CLIENT,
      useFactory: (moduleRef: ModuleRef): LlmProviderClient => {
        if (isTestEnv()) {
          return new FakeLlmProviderClient('normal');
        }
        const config = moduleRef.get(ConfigService, { strict: false });
        return new AnthropicLlmProviderClient(
          config.get<string>('ANTHROPIC_API_KEY') ?? '',
          config.get<string>('LLM_MODEL') ?? DEFAULT_MODEL,
        );
      },
      inject: [ModuleRef],
    },
    {
      provide: DAILY_QUOTA_TRACKER,
      useFactory: (moduleRef: ModuleRef): DailyQuotaTracker => {
        if (isTestEnv()) {
          return { consume: async () => {} };
        }
        const dataSource = moduleRef.get(DataSource, { strict: false });
        return new PostgresDailyQuotaTracker(dataSource);
      },
      inject: [ModuleRef],
    },
    {
      provide: LLM_PORT,
      useFactory: (
        client: LlmProviderClient,
        quota: DailyQuotaTracker,
        moduleRef: ModuleRef,
      ) => {
        const config: GuardedLlmServiceConfig = isTestEnv()
          ? {
              totalBudgetMs: 5000,
              maxAttempts: 3,
              maxOutputTokensCeiling: 1024,
              dailyQuotaLimit: 20,
              retryBackoffMs: 500,
            }
          : readConfigFromEnv(moduleRef);
        return new GuardedLlmService(client, quota, config);
      },
      inject: [LLM_PROVIDER_CLIENT, DAILY_QUOTA_TRACKER, ModuleRef],
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
