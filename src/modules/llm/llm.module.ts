import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

function readConfigFromEnv(config: ConfigService): GuardedLlmServiceConfig {
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
 * Pas de ConfigModule ni de TypeOrmModule dans les imports : les deux sont
 * des modules globaux (ConfigModule.forRoot({isGlobal:true}), le module coeur
 * de TypeOrmModule), donc ConfigService et DataSource sont injectables ici
 * sans import explicite dès que ce module fait partie d'un arbre qui les
 * enregistre (l'application réelle, ou un harnais de test qui les monte).
 *
 * `ConfigService`/`DataSource` sont déclarés dans `inject`, jamais récupérés
 * via `ModuleRef.get` dans le corps d'une fabrique : `ModuleRef.get` ne crée
 * aucune arête dans le graphe de dépendances Nest, donc rien ne garantit que
 * le provider visé soit déjà instancié au moment de l'appel — c'est
 * exactement ce qui causait le crash en production (ConfigService pas encore
 * prêt, `moduleRef.get` renvoyait une valeur inutilisable). Déclarer la
 * dépendance dans `inject` force Nest à construire ConfigService/DataSource
 * AVANT d'appeler la fabrique.
 *
 * Conséquence directe : ce module ne compile plus seul, sans ConfigModule ni
 * TypeOrmModule dans l'arbre — ce qui est voulu, la preuve « aucun appel
 * réseau en environnement de test » se fait maintenant avec le vrai câblage
 * (voir llm.module.int-spec.ts) plutôt qu'en isolation complète.
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
      useFactory: (config: ConfigService): LlmProviderClient => {
        if (isTestEnv()) {
          return new FakeLlmProviderClient('normal');
        }
        return new AnthropicLlmProviderClient(
          config.get<string>('ANTHROPIC_API_KEY') ?? '',
          config.get<string>('LLM_MODEL') ?? DEFAULT_MODEL,
        );
      },
      inject: [ConfigService],
    },
    {
      provide: DAILY_QUOTA_TRACKER,
      useFactory: (dataSource: DataSource): DailyQuotaTracker => {
        if (isTestEnv()) {
          return { consume: async () => {} };
        }
        return new PostgresDailyQuotaTracker(dataSource);
      },
      inject: [DataSource],
    },
    {
      provide: LLM_PORT,
      useFactory: (
        client: LlmProviderClient,
        quota: DailyQuotaTracker,
        config: ConfigService,
      ) => {
        const guardConfig: GuardedLlmServiceConfig = isTestEnv()
          ? {
              totalBudgetMs: 5000,
              maxAttempts: 3,
              maxOutputTokensCeiling: 1024,
              dailyQuotaLimit: 20,
              retryBackoffMs: 500,
            }
          : readConfigFromEnv(config);
        return new GuardedLlmService(client, quota, guardConfig);
      },
      inject: [LLM_PROVIDER_CLIENT, DAILY_QUOTA_TRACKER, ConfigService],
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
