import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import { AuthService } from '../auth/auth.service.js';
import { OffersService } from '../offers/offers.service.js';
import { ApplicationsService } from './applications.service.js';
import { Application } from './entities/application.entity.js';
import {
  LLM_PORT,
  LlmRejectedError,
  type GenerateTextInput,
  type GenerateTextOutput,
  type LlmPort,
} from '../llm/llm.port.js';

/** Toujours une réponse exploitable, déterministe, sans mot inventé. */
class AlwaysSucceedsLlm implements LlmPort {
  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    return {
      text: 'Je vous écris pour exprimer mon intérêt pour ce poste.',
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
  }
}

/**
 * Échoue au premier appel, réussit ensuite. Sert à prouver qu'un deuxième
 * POST relance réellement une génération — pas seulement que le statut
 * retourne à 'draft' — en comptant les appels réels au port.
 */
class FlakyOnceLlm implements LlmPort {
  calls = 0;

  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    this.calls += 1;
    if (this.calls === 1) {
      throw new LlmRejectedError('Rejet simulé pour le test.');
    }
    return {
      text: 'Je vous écris pour exprimer mon intérêt pour ce poste.',
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
  }
}

/**
 * Ne se résout jamais : le travail reste réellement 'draft' en base, sans
 * qu'aucune génération ne puisse jamais le faire avancer.
 */
class NeverResolvesLlm implements LlmPort {
  generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    return new Promise(() => {
      // Volontairement jamais résolue ni rejetée.
    });
  }
}

/**
 * Un seul faux LLM pour tout le fichier, dont la stratégie interne change
 * de test en test — pour ne démarrer qu'UN conteneur Postgres au lieu de
 * trois. L'app et son override sont enregistrés une seule fois ; seule
 * l'instance pointée par `current` change, jamais partagée d'un test à
 * l'autre (chaque test appelle `setStrategy` avec une instance fraîche
 * avant d'agir).
 */
class ControllableLlm implements LlmPort {
  private current: LlmPort = new AlwaysSucceedsLlm();

  setStrategy(strategy: LlmPort): void {
    this.current = strategy;
  }

  generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    return this.current.generateText(input);
  }
}

function overrideLlm(llm: LlmPort) {
  return (builder: TestingModuleBuilder): TestingModuleBuilder =>
    builder.overrideProvider(LLM_PORT).useValue(llm);
}

describe('ApplicationsService — orchestration contre une vraie base', () => {
  let api: TestApp;
  let auth: AuthService;
  let offers: OffersService;
  let applications: ApplicationsService;
  let controllable: ControllableLlm;
  let userCounter = 0;

  beforeAll(async () => {
    controllable = new ControllableLlm();
    api = await startTestApp({ overrides: overrideLlm(controllable) });
    auth = api.app.get(AuthService);
    offers = api.app.get(OffersService);
    applications = api.app.get(ApplicationsService);
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  beforeEach(async () => {
    await api.truncateAll();
  });

  async function makeUser(label: string) {
    userCounter += 1;
    return auth.register({
      email: `${label}-${userCounter}-${randomUUID()}@example.com`,
      password: 'motdepasse123',
    });
  }

  // Preuve 7.
  it('deux POST identiques (même utilisateur, même offre) ne créent qu une seule ligne Application', async () => {
    controllable.setStrategy(new AlwaysSucceedsLlm());

    const user = await makeUser('alice');
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
    });

    await applications.create(user.id, offer.id);
    await applications.create(user.id, offer.id);

    const count = await api.dataSource.getRepository(Application).count({
      where: { userId: user.id, offerId: offer.id },
    });
    expect(count).toBe(1);
  });

  // Preuve 10.
  it('un POST sur une offre non visible par l utilisateur ne crée aucune ligne dans applications', async () => {
    controllable.setStrategy(new AlwaysSucceedsLlm());

    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const privateOffer = await offers.create(alice.id, {
      title: "Poste privé d'Alice",
      description: 'Description.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
    });

    const before = await api.dataSource.getRepository(Application).count();

    const error = await applications
      .create(bob.id, privateOffer.id)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);

    const after = await api.dataSource.getRepository(Application).count();
    expect(after).toBe(before);
    expect(after).toBe(0);
  });

  // Preuve 9.
  it('un POST sur une application déjà en generation_failed la fait repasser en draft et relance réellement une génération (deux appels distincts au LLM au total)', async () => {
    const flaky = new FlakyOnceLlm();
    controllable.setStrategy(flaky);

    const user = await makeUser('retry');
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generation_failed');
      },
      { timeout: 10_000 },
    );
    expect(flaky.calls).toBe(1);

    await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generated');
      },
      { timeout: 10_000 },
    );
    expect(flaky.calls).toBe(2);
  });

  // Preuve 17.
  it("un travail 'draft' plus vieux que GENERATION_STALE_TIMEOUT_MS est lu comme generation_failed par findOne, sans qu aucun worker ne l ait écrit", async () => {
    controllable.setStrategy(new NeverResolvesLlm());

    const user = await makeUser('stale');
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
    });

    const created = await applications.create(user.id, offer.id);

    // Le LLM ne répondra jamais : si le travail passe par
    // 'generation_failed', ce n'est jamais parce qu'un worker l'a écrit —
    // c'est uniquement findOne() qui le constate à la lecture, à partir
    // d'un generationStartedAt reculé nous-mêmes. Pas de vrai délai
    // d'attente dans ce test. generationStartedAt — pas createdAt — est le
    // champ que startOrRetry pose à CHAQUE lancement (création initiale et
    // relance), contrairement à createdAt qui ne bouge jamais.
    await api.dataSource
      .getRepository(Application)
      .update(
        { id: created.id },
        { generationStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      );

    const state = await applications.findOne(user.id, created.id);

    expect(state.status).toBe('generation_failed');
    expect(state.failureReason).toBeTruthy();
    expect(state.failureReason?.length).toBeGreaterThan(0);
    expect(state.failureReason?.toLowerCase()).toMatch(
      /délai|périm|timeout|stale/,
    );

    // Deuxième lecture : l'état déjà écrit ne doit pas se recalculer de
    // façon incohérente entre deux GET.
    const secondRead = await applications.findOne(user.id, created.id);
    expect(secondRead.status).toBe('generation_failed');
    expect(secondRead.failureReason).toBe(state.failureReason);
  });
});
