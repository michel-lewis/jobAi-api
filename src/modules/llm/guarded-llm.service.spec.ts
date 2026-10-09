import * as loggerModule from '../../common/logging/logger.js';
import {
  LlmMalformedResponseError,
  LlmQuotaExceededError,
  LlmRejectedError,
  LlmRetriesExhaustedError,
  LlmTimeoutError,
  LlmTokenCapExceededError,
} from './llm.port.js';
import {
  LlmProviderHttpError,
  type LlmProviderClient,
  type RawLlmResponse,
} from './provider/llm-provider-client.js';
import { FakeLlmProviderClient } from './provider/fake-llm-provider-client.js';
import type { DailyQuotaTracker } from './daily-quota-tracker.js';
import {
  GuardedLlmService,
  type GuardedLlmServiceConfig,
} from './guarded-llm.service.js';

/**
 * Autorise toujours. Son rôle ici est de ne JAMAIS bloquer, pour isoler les
 * preuves qui ne parlent pas de quota — le quota réel (compteur persistant,
 * survie au redémarrage) est prouvé par
 * postgres-daily-quota-tracker.int-spec.ts, pas ici.
 */
function makeAlwaysAllowQuota(): DailyQuotaTracker {
  return {
    async consume(): Promise<void> {
      // toujours autorisé
    },
  };
}

function makeConfig(
  overrides: Partial<GuardedLlmServiceConfig> = {},
): GuardedLlmServiceConfig {
  return {
    totalBudgetMs: 200,
    maxAttempts: 3,
    maxOutputTokensCeiling: 1000,
    dailyQuotaLimit: 1000,
    retryBackoffMs: 20,
    ...overrides,
  };
}

/**
 * Le FakeLlmProviderClient approuvé n'offre que le scénario 'rate_limited'
 * (429) pour les erreurs retentables. Pour prouver qu'un 5xx générique est
 * retenté comme un 429 — ce que dit la preuve 2 — il faut un client minimal
 * implémentant directement LlmProviderClient. Ce n'est pas une fabrique
 * partagée : juste un objet littéral local à ce fichier de test.
 */
function makeAlwaysFailingClient(status: number): LlmProviderClient {
  return {
    async send(): Promise<RawLlmResponse> {
      throw new LlmProviderHttpError(status, `Erreur ${status} du fournisseur`);
    },
  };
}

describe('GuardedLlmService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un appel qui dépasse le budget temporel total échoue avec une erreur de délai, pas en attendant indéfiniment', async () => {
    const client = new FakeLlmProviderClient('timeout');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ totalBudgetMs: 50, maxAttempts: 1 }),
    );

    const started = Date.now();
    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);
    const elapsed = Date.now() - started;

    expect(error).toBeInstanceOf(LlmTimeoutError);
    // La preuve que ce n'est pas une attente indéfinie : l'échec arrive
    // près du budget configuré (quelques dizaines de ms), pas après le
    // vrai timeout du test (plusieurs secondes).
    expect(elapsed).toBeLessThan(1000);
  }, 5000);

  it('une erreur 429 du fournisseur est retentée avant l échec final', async () => {
    const client = new FakeLlmProviderClient('rate_limited');
    const sendSpy = vi.spyOn(client, 'send');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxAttempts: 3, totalBudgetMs: 3000 }),
    );

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmRetriesExhaustedError);
    expect(sendSpy).toHaveBeenCalledTimes(3);
  }, 5000);

  it('une erreur 500 du fournisseur est retentée avant l échec final', async () => {
    const client = makeAlwaysFailingClient(500);
    const sendSpy = vi.spyOn(client, 'send');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxAttempts: 3, totalBudgetMs: 3000 }),
    );

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmRetriesExhaustedError);
    expect(sendSpy).toHaveBeenCalledTimes(3);
  }, 5000);

  it('une erreur 400 du fournisseur n est jamais retentée', async () => {
    const client = new FakeLlmProviderClient('rejected');
    const sendSpy = vi.spyOn(client, 'send');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxAttempts: 3, totalBudgetMs: 3000 }),
    );

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmRejectedError);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  }, 5000);

  it('le nombre de tentatives s arrête exactement au plafond configuré, même si le fournisseur échoue toujours avec une erreur retentable', async () => {
    const client = new FakeLlmProviderClient('rate_limited');
    const sendSpy = vi.spyOn(client, 'send');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxAttempts: 5, totalBudgetMs: 5000 }),
    );

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmRetriesExhaustedError);
    expect(sendSpy).toHaveBeenCalledTimes(5);
  }, 8000);

  it('une réponse qui ne respecte pas le format attendu est rejetée, jamais renvoyée telle quelle', async () => {
    const client = new FakeLlmProviderClient('malformed');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig(),
    );

    const result = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(result).toBeInstanceOf(LlmMalformedResponseError);
  });

  it('un appel qui demande plus de jetons que le plafond est refusé avant tout appel au fournisseur', async () => {
    const client = new FakeLlmProviderClient('normal');
    const sendSpy = vi.spyOn(client, 'send');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxOutputTokensCeiling: 100 }),
    );

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 101 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmTokenCapExceededError);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("la ligne de log d'un appel réussi ne contient, à aucune profondeur, ni le prompt envoyé ni le texte de la réponse", async () => {
    const logSpy = vi.spyOn(loggerModule, 'log').mockImplementation(() => {});
    const client = new FakeLlmProviderClient('normal');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig(),
    );
    const secretPrompt = 'PROMPT_SECRET_NE_DOIT_JAMAIS_FUITER_93f7';

    const result = await service.generateText({
      userId: 'u1',
      prompt: secretPrompt,
      maxOutputTokens: 10,
    });

    const loggedPayload = JSON.stringify(logSpy.mock.calls);

    expect(logSpy).toHaveBeenCalled();
    expect(loggedPayload).not.toContain(secretPrompt);
    expect(loggedPayload).not.toContain(result.text);
  });

  it("la ligne de log d'un appel en échec ne contient, à aucune profondeur, ni le prompt envoyé ni une clé d'API", async () => {
    const logSpy = vi.spyOn(loggerModule, 'log').mockImplementation(() => {});
    const client = new FakeLlmProviderClient('rejected');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig(),
    );
    const secretPrompt = 'PROMPT_SECRET_ECHEC_NE_DOIT_JAMAIS_FUITER_27ab';

    await service
      .generateText({ userId: 'u1', prompt: secretPrompt, maxOutputTokens: 10 })
      .catch(() => {});

    const loggedPayload = JSON.stringify(logSpy.mock.calls);

    expect(logSpy).toHaveBeenCalled();
    expect(loggedPayload).not.toContain(secretPrompt);
    // GuardedLlmService ne reçoit jamais de clé d'API dans son constructeur
    // (LlmProviderClient, DailyQuotaTracker, GuardedLlmServiceConfig — aucun
    // champ de clé) : cette partie de la preuve est garantie par le type,
    // pas observable à ce niveau. Voir le rapport final pour le détail.
    expect(loggedPayload).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
  });

  it('attend au moins le délai configuré entre deux tentatives, au lieu de marteler le fournisseur', async () => {
    const client = new FakeLlmProviderClient('rate_limited');
    const retryBackoffMs = 50;
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxAttempts: 3, totalBudgetMs: 3000, retryBackoffMs }),
    );

    const started = Date.now();
    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);
    const elapsed = Date.now() - started;

    expect(error).toBeInstanceOf(LlmRetriesExhaustedError);
    // 3 tentatives => 2 pauses. La marge de -5 ne compense pas la durée
    // réelle d'exécution (qui ne peut qu'AUGMENTER elapsed, jamais le faire
    // échouer sur un >=) : elle absorbe la granularité de Date.now() et des
    // timers Node, où un délai programmé à 50 ms peut se résoudre et être
    // lu comme 49 ms.
    expect(elapsed).toBeGreaterThanOrEqual(2 * retryBackoffMs - 5);
  }, 5000);

  it('consomme une unité de quota par tentative qui atteint le fournisseur, pas seulement en cas de succès', async () => {
    const client = new FakeLlmProviderClient('rate_limited');
    const quota: DailyQuotaTracker = {
      consume: vi.fn().mockResolvedValue(undefined),
    };
    const service = new GuardedLlmService(
      client,
      quota,
      makeConfig({ maxAttempts: 3, totalBudgetMs: 3000 }),
    );

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmRetriesExhaustedError);
    expect(quota.consume).toHaveBeenCalledTimes(3);
  }, 5000);

  it('un appel refusé par le quota ne touche jamais le fournisseur', async () => {
    const client = new FakeLlmProviderClient('normal');
    const sendSpy = vi.spyOn(client, 'send');
    const quota: DailyQuotaTracker = {
      consume: vi
        .fn()
        .mockRejectedValue(new LlmQuotaExceededError('quota dépassé')),
    };
    const service = new GuardedLlmService(client, quota, makeConfig());

    const error = await service
      .generateText({ userId: 'u1', prompt: 'bonjour', maxOutputTokens: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmQuotaExceededError);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('un appel qui demande exactement le plafond de jetons est accepté', async () => {
    const client = new FakeLlmProviderClient('normal');
    const sendSpy = vi.spyOn(client, 'send');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig({ maxOutputTokensCeiling: 100 }),
    );

    const result = await service.generateText({
      userId: 'u1',
      prompt: 'bonjour',
      maxOutputTokens: 100,
    });

    expect(result.text).toBeDefined();
    expect(sendSpy).toHaveBeenCalled();
  });

  it("la ligne de log d'un appel réussi contient la durée, les jetons et le résultat", async () => {
    const logSpy = vi.spyOn(loggerModule, 'log').mockImplementation(() => {});
    const client = new FakeLlmProviderClient('normal');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig(),
    );

    await service.generateText({
      userId: 'u1',
      prompt: 'bonjour',
      maxOutputTokens: 10,
    });

    expect(logSpy).toHaveBeenCalledWith(
      'info',
      expect.objectContaining({
        durationMs: expect.any(Number),
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        outcome: 'success',
      }),
    );
  });

  it('un appel réussi renvoie le texte du fournisseur', async () => {
    const client = new FakeLlmProviderClient('normal');
    const service = new GuardedLlmService(
      client,
      makeAlwaysAllowQuota(),
      makeConfig(),
    );

    const result = await service.generateText({
      userId: 'u1',
      prompt: 'bonjour',
      maxOutputTokens: 10,
    });

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });
});
