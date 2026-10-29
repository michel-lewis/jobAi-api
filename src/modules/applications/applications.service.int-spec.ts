import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import { AuthService } from '../auth/auth.service.js';
import { OffersService } from '../offers/offers.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import type { PutProfileDto } from '../profiles/dto/put-profile.dto.js';
import { ApplicationsService } from './applications.service.js';
import { Application } from './entities/application.entity.js';
import {
  LLM_PORT,
  LlmRejectedError,
  type GenerateTextInput,
  type GenerateTextOutput,
  type LlmPort,
} from '../llm/llm.port.js';
import { CA_EN_NORM, CA_FR_NORM } from '../documents/market-norms/ca-norms.js';

/**
 * `Array.from({length:n},(_,i)=>'wordN').join(' ')` : un compte de mots
 * exact et vérifiable, aucun mot capitalisé — jamais de faux positif
 * d'ancrage sur le remplissage lui-même.
 */
function fillerWords(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `word${offset + i}`).join(' ');
}

/**
 * Lettre conforme à `norm` : ouverture, TROIS paragraphes de corps,
 * clôture — dans `paragraphCount` autant que dans `lengthRange`.
 * Correction N (revue senior) : un seul paragraphe de corps, même avec
 * l'ouverture et la clôture comptées à part, ne tombe plus dans [3, 5]
 * depuis que `checkMarketFormat` ne compte plus la salutation ni la
 * clôture comme des paragraphes — il en faut vraiment trois.
 */
function buildConformantLetter(
  norm: {
    letter: { openingFormula: string | null; closingFormula: string | null };
  },
  wordCount: number,
): string {
  const third = Math.floor(wordCount / 3);
  const bodyParagraphs = [
    fillerWords(third, 0),
    fillerWords(third, third),
    fillerWords(wordCount - 2 * third, third * 2),
  ];
  return [
    norm.letter.openingFormula,
    ...bodyParagraphs,
    norm.letter.closingFormula,
  ].join('\n\n');
}

/** Le plus petit PutProfileDto non vide : une seule expérience. */
function makeNonEmptyProfileDto(
  overrides: Partial<PutProfileDto['experiences'][number]> = {},
): PutProfileDto {
  return {
    fullName: 'Lewis Kouamkouam',
    headline: null,
    summary: null,
    email: null,
    phone: null,
    location: null,
    willingToRelocate: false,
    workPreference: null,
    workAuthorizationNote: null,
    rawCvText: null,
    experiences: [
      {
        company: 'Acme',
        title: 'Développeuse',
        employmentType: 'full_time',
        location: null,
        startDate: '2020-01-01',
        endDate: '2021-01-01',
        summary: null,
        bullets: [],
        ...overrides,
      },
    ],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    links: [],
  };
}

/**
 * Conforme à CA_FR_NORM (toutes les offres de ce fichier utilisent
 * language:'fr', country:'CA') — depuis que le pipeline réel vérifie le
 * format (ADR-16), une phrase isolée comme avant déclenche systématiquement
 * une imprécision de longueur/paragraphes/formules, puis un rejet au bout
 * de FORMAT_MAX_ATTEMPTS. Ces doubles ne testent pas la qualité du texte,
 * seulement la mécanique de relance/concurrence : il leur faut un texte
 * qui passe les vérificateurs pour l'exercer.
 */
const CONFORMANT_FR_TEXT = buildConformantLetter(CA_FR_NORM, 300);

/** Toujours une réponse exploitable, déterministe, sans mot inventé. */
class AlwaysSucceedsLlm implements LlmPort {
  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    return {
      text: CONFORMANT_FR_TEXT,
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
      text: CONFORMANT_FR_TEXT,
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

/** Toujours une réponse exploitable, mais compte ses appels réels. */
class CountingLlm implements LlmPort {
  calls = 0;

  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    this.calls += 1;
    return {
      text: CONFORMANT_FR_TEXT,
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
  }
}

/** Toujours le même texte fixe, et compte ses appels réels. */
/**
 * Compté et indexé par `userId`, jamais globalement : ce fichier ne
 * truncate qu'au `beforeEach` suivant, pas pendant un test, et une
 * candidature créée en arrière-plan par un test précédent (ex. « Preuve 7 »,
 * dont le premier `create()` n'est jamais attendu jusqu'à son statut
 * terminal) peut encore être en vol quand ce test change la stratégie —
 * son appel, non attendu par ce test-là, arriverait sinon ici et fausserait
 * un compte global. Filtrer par `userId` rend le compte robuste à ce bruit
 * sans toucher aux tests existants qui le causent légitimement.
 */
class FixedTextLlm implements LlmPort {
  private callsByUser = new Map<string, number>();

  constructor(private readonly text: string) {}

  callsFor(userId: string): number {
    return this.callsByUser.get(userId) ?? 0;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    this.callsByUser.set(
      input.userId,
      (this.callsByUser.get(input.userId) ?? 0) + 1,
    );
    return {
      text: this.text,
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
  }
}

/**
 * Lève à chaque appel — sert à prouver activement qu'un pré-vol bloque la
 * génération AVANT tout appel LLM, plutôt que par coïncidence de timing.
 * Compté par `userId`, même raison que `FixedTextLlm` ci-dessus.
 */
class ThrowingLlm implements LlmPort {
  private callsByUser = new Map<string, number>();

  callsFor(userId: string): number {
    return this.callsByUser.get(userId) ?? 0;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    this.callsByUser.set(
      input.userId,
      (this.callsByUser.get(input.userId) ?? 0) + 1,
    );
    throw new Error(
      'Ce faux LLM ne doit jamais être appelé pour un profil vide.',
    );
  }
}

/**
 * Renvoie une réponse différente par appel réel POUR CE userId (bornée au
 * dernier élément), et garde chaque `prompt` reçu, groupé par `userId` —
 * sert à observer le prompt d'un éventuel second appel de correction,
 * jamais en l'appelant directement. Groupé par utilisateur pour la même
 * raison que `FixedTextLlm` ci-dessus : un appel égaré d'un test précédent
 * ne doit jamais se mélanger aux prompts de celui-ci.
 */
class SequentialCapturingLlm implements LlmPort {
  private promptsByUser = new Map<string, string[]>();

  constructor(private readonly responses: string[]) {}

  promptsFor(userId: string): string[] {
    return this.promptsByUser.get(userId) ?? [];
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const prompts = this.promptsByUser.get(input.userId) ?? [];
    prompts.push(input.prompt);
    this.promptsByUser.set(input.userId, prompts);
    const index = Math.min(prompts.length - 1, this.responses.length - 1);
    return {
      text: this.responses[index],
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
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
  let profiles: ProfilesService;
  let controllable: ControllableLlm;
  let userCounter = 0;

  beforeAll(async () => {
    controllable = new ControllableLlm();
    api = await startTestApp({ overrides: overrideLlm(controllable) });
    auth = api.app.get(AuthService);
    offers = api.app.get(OffersService);
    applications = api.app.get(ApplicationsService);
    profiles = api.app.get(ProfilesService);
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
      language: 'fr',
      country: 'CA',
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
      language: 'fr',
      country: 'CA',
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
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
      language: 'fr',
      country: 'CA',
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
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
      language: 'fr',
      country: 'CA',
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

  // Les tests ci-dessus n'enchaînent que des create() séquentiels : la
  // contrainte unique Postgres (uq_applications_user_offer) est l'arbitre
  // réel d'une course, pas seulement un filet de sécurité qu'on ne
  // déclenche jamais en pratique — Promise.all() ici prouve que deux
  // tentatives réellement concurrentes, pas juste l'une après l'autre, ne
  // déclenchent jamais deux générations.
  it('deux POST réellement concurrents (Promise.all, pas séquentiels) ne déclenchent qu un seul appel LLM', async () => {
    const counting = new CountingLlm();
    controllable.setStrategy(counting);

    const user = await makeUser('concurrent');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
      language: 'fr',
      country: 'CA',
    });

    const [first] = await Promise.all([
      applications.create(user.id, offer.id),
      applications.create(user.id, offer.id),
    ]);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, first.id);
        expect(state.status).toBe('generated');
      },
      { timeout: 10_000 },
    );

    const count = await api.dataSource.getRepository(Application).count({
      where: { userId: user.id, offerId: offer.id },
    });
    expect(count).toBe(1);
    expect(counting.calls).toBe(1);
  });

  // Régression : create() doit lui-même constater la péremption d'un
  // brouillon avant de relancer — pas seulement findOne()/GET. Sans cette
  // vérification, un brouillon dont le processus est mort restait 'draft'
  // pour toujours tant que personne ne faisait de GET.
  it('un POST sur un brouillon périmé relance réellement une génération, sans passer par findOne', async () => {
    controllable.setStrategy(new NeverResolvesLlm());

    const user = await makeUser('stale-retry');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
      language: 'fr',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    // Le LLM ne répondra jamais : le brouillon reste réellement 'draft' en
    // base tant qu'on ne recule pas generationStartedAt nous-mêmes — pas
    // un vrai délai d'attente.
    await api.dataSource
      .getRepository(Application)
      .update(
        { id: created.id },
        { generationStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      );

    const counting = new CountingLlm();
    controllable.setStrategy(counting);

    // Le POST seul — jamais findOne()/GET — doit constater la péremption
    // et relancer une génération réelle.
    await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const count = await api.dataSource.getRepository(Application).count({
          where: { userId: user.id, offerId: offer.id, status: 'generated' },
        });
        expect(count).toBe(1);
      },
      { timeout: 10_000 },
    );

    expect(counting.calls).toBeGreaterThanOrEqual(1);
  });

  // Correction 2 — preuve centrale : la norme résolue depuis
  // offer.country/offer.language gouverne réellement le pipeline (ADR-16).
  it('une offre canadienne anglophone dont le texte produit est déjà conforme à CA_EN_NORM donne un document qui commence par la formule d ouverture anglaise, en un seul appel LLM', async () => {
    const text = buildConformantLetter(CA_EN_NORM, 300);
    const fixedLlm = new FixedTextLlm(text);
    controllable.setStrategy(fixedLlm);

    const user = await makeUser('ca-en-conforme');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());

    const offer = await offers.create(user.id, {
      title: 'Backend Developer',
      description: 'Job description.',
      company: 'Acme',
      location: 'Toronto',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generated');
      },
      { timeout: 10_000 },
    );

    const state = await applications.findOne(user.id, created.id);
    expect(state.document?.content.startsWith('Dear Hiring Manager,')).toBe(
      true,
    );
    expect(fixedLlm.callsFor(user.id)).toBe(1);
  });

  // Correction 2 — pré-vol : un profil resté vide (celui créé à
  // l'inscription) bloque la génération AVANT tout appel LLM.
  it('un profil resté vide après l inscription finit en generation_failed sans jamais appeler le LLM', async () => {
    const throwing = new ThrowingLlm();
    controllable.setStrategy(throwing);

    const user = await makeUser('profil-vide');
    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generation_failed');
      },
      { timeout: 10_000 },
    );

    const state = await applications.findOne(user.id, created.id);
    expect(state.status).not.toBe('generated');
    expect(throwing.callsFor(user.id)).toBe(0);
  });

  // Correction 2 — faute de fait : un nom d'entreprise inventé, ni dans le
  // profil ni dans l'offre, rejette immédiatement sans second appel, même si
  // le format est par ailleurs correct.
  it('un nom d entreprise inventé absent du profil et de l offre rejette immédiatement la génération, un seul appel LLM', async () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    words.splice(50, 0, 'Zorblex', 'Dynamics');
    const text = [
      CA_EN_NORM.letter.openingFormula,
      words.join(' '),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const fixedLlm = new FixedTextLlm(text);
    controllable.setStrategy(fixedLlm);

    const user = await makeUser('fait-invente');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());

    const offer = await offers.create(user.id, {
      title: 'Backend Developer',
      description: 'Job description.',
      company: 'Acme',
      location: 'Toronto',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generation_failed');
      },
      { timeout: 10_000 },
    );

    expect(fixedLlm.callsFor(user.id)).toBe(1);
  });

  // Correction B — le tiret cadratin produit par le LLM ne survit jamais
  // dans le document final (correction mécanique, câblée par la route).
  it('un tiret cadratin produit par le LLM ne survit jamais dans le document final', async () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    // Trois paragraphes de corps (correction N) — un seul ne tombe plus
    // dans [3, 5].
    const text = [
      CA_EN_NORM.letter.openingFormula,
      `${words.slice(0, 50).join(' ')} — ${words.slice(50, 100).join(' ')}`,
      words.slice(100, 200).join(' '),
      words.slice(200, 300).join(' '),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const fixedLlm = new FixedTextLlm(text);
    controllable.setStrategy(fixedLlm);

    const user = await makeUser('tiret-cadratin');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());

    const offer = await offers.create(user.id, {
      title: 'Backend Developer',
      description: 'Job description.',
      company: 'Acme',
      location: 'Toronto',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generated');
      },
      { timeout: 10_000 },
    );

    const state = await applications.findOne(user.id, created.id);
    expect(state.document?.content).not.toContain('—');
  });

  // Correction B — un superlatif déjà présent dans le profil survit à la
  // correction mécanique (superlatifsAutorisés câblé par la route).
  it('un superlatif déjà présent dans le profil survit à la correction mécanique du document final', async () => {
    const words = Array.from({ length: 298 }, (_, i) => `word${i}`);
    // Trois paragraphes de corps (correction N) — un seul ne tombe plus
    // dans [3, 5].
    const text = [
      CA_EN_NORM.letter.openingFormula,
      `${words.slice(0, 50).join(' ')} exceptional ${words.slice(50, 100).join(' ')}`,
      words.slice(100, 199).join(' '),
      words.slice(199, 298).join(' '),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const fixedLlm = new FixedTextLlm(text);
    controllable.setStrategy(fixedLlm);

    const user = await makeUser('superlatif-garde');
    await profiles.replace(
      user.id,
      1,
      makeNonEmptyProfileDto({
        summary: 'Reconnue pour un travail exceptional.',
      }),
    );

    const offer = await offers.create(user.id, {
      title: 'Backend Developer',
      description: 'Job description.',
      company: 'Acme',
      location: 'Toronto',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generated');
      },
      { timeout: 10_000 },
    );

    const state = await applications.findOne(user.id, created.id);
    expect(state.document?.content).toContain('exceptional');
  });

  // Correction B — un superlatif absent de la source (profil ET offre) est
  // retiré mécaniquement du document final.
  it('un superlatif absent du profil et de l offre est retiré mécaniquement du document final', async () => {
    const words = Array.from({ length: 298 }, (_, i) => `word${i}`);
    // Trois paragraphes de corps (correction N) — un seul ne tombe plus
    // dans [3, 5].
    const text = [
      CA_EN_NORM.letter.openingFormula,
      `${words.slice(0, 50).join(' ')} exceptional ${words.slice(50, 100).join(' ')}`,
      words.slice(100, 199).join(' '),
      words.slice(199, 298).join(' '),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const fixedLlm = new FixedTextLlm(text);
    controllable.setStrategy(fixedLlm);

    const user = await makeUser('superlatif-retire');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());

    const offer = await offers.create(user.id, {
      title: 'Backend Developer',
      description: 'Job description.',
      company: 'Acme',
      location: 'Toronto',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(state.status).toBe('generated');
      },
      { timeout: 10_000 },
    );

    const state = await applications.findOne(user.id, created.id);
    expect(state.document?.content).not.toContain('exceptional');
  });

  // Correction C — ça ne fuit pas : le prompt du second appel (correction de
  // format) ne réexpose jamais le nom de l'entreprise ni la durée calculée
  // de la source, même s'il s'agit de corriger seulement la longueur.
  it('le prompt du second appel de correction ne contient ni le nom de l entreprise ni la durée calculée depuis la source', async () => {
    const user = await makeUser('fuite-prompt');
    await profiles.replace(
      user.id,
      1,
      makeNonEmptyProfileDto({
        company: 'Nordaxis Corp',
        startDate: '2020-01-01',
        endDate: '2023-01-01',
      }),
    );

    const offer = await offers.create(user.id, {
      title: 'Poste',
      description: 'Description du poste.',
      company: 'Acme',
      location: 'Montréal',
      applyUrl: null,
      language: 'fr',
      country: 'CA',
    });

    const shortText = [
      CA_FR_NORM.letter.openingFormula,
      fillerWords(30),
      CA_FR_NORM.letter.closingFormula,
    ].join('\n\n');
    const conformantText = buildConformantLetter(CA_FR_NORM, 300);
    const capturing = new SequentialCapturingLlm([shortText, conformantText]);
    controllable.setStrategy(capturing);

    const created = await applications.create(user.id, offer.id);

    await vi.waitFor(
      async () => {
        const state = await applications.findOne(user.id, created.id);
        expect(['generated', 'generation_failed']).toContain(state.status);
      },
      { timeout: 10_000 },
    );

    const prompts = capturing.promptsFor(user.id);
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    const correctionPrompt = prompts[1];
    expect(correctionPrompt).not.toContain('Nordaxis Corp');
    expect(correctionPrompt).not.toContain('3 ans');
  });

  // Correction C — ça ne fuit pas, côté journal : aucune trace de log ne
  // contient le texte produit par le LLM.
  // Scénario qui déclenche réellement une écriture de log (la faute de fait
  // ci-dessous) plutôt qu'une lettre conforme : sur le chemin de succès,
  // `runGeneration` n'écrit aucun log applicatif, donc ce test serait
  // vacueusement vert sans jamais exercer le seul endroit du code qui
  // journalise quoi que ce soit sur cette génération (le catch de
  // `runGeneration`) — revue senior, découvert en vérifiant par mutation
  // que ce test tombe bien au rouge quand on casse ce qu'il protège.
  it('aucune trace de log ne contient le texte produit par le LLM, y compris sur le chemin de rejet qui journalise', async () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    words.splice(50, 0, 'Zorblex', 'Dynamics');
    const text = [
      CA_EN_NORM.letter.openingFormula,
      words.join(' '),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const fixedLlm = new FixedTextLlm(text);
    controllable.setStrategy(fixedLlm);

    const user = await makeUser('fuite-log');
    await profiles.replace(user.id, 1, makeNonEmptyProfileDto());

    const offer = await offers.create(user.id, {
      title: 'Backend Developer',
      description: 'Job description.',
      company: 'Acme',
      location: 'Toronto',
      applyUrl: null,
      language: 'en',
      country: 'CA',
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const created = await applications.create(user.id, offer.id);

      await vi.waitFor(
        async () => {
          const state = await applications.findOne(user.id, created.id);
          expect(state.status).toBe('generation_failed');
        },
        { timeout: 10_000 },
      );

      const capturedArgs = [
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
      ].flat();
      expect(capturedArgs.length).toBeGreaterThan(0);
      const leaked = capturedArgs.some(
        (arg) =>
          typeof arg === 'string' &&
          (arg.includes('word137') || arg.includes('Zorblex Dynamics')),
      );
      expect(leaked).toBe(false);
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
