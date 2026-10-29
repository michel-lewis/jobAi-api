import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { TestingModuleBuilder } from '@nestjs/testing';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import {
  LLM_PORT,
  type GenerateTextInput,
  type GenerateTextOutput,
  type LlmPort,
} from '../llm/llm.port.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import type { PutProfileDto } from '../profiles/dto/put-profile.dto.js';
import { CA_EN_NORM, CA_FR_NORM } from '../documents/market-norms/ca-norms.js';

const PASSWORD = 'motdepasse123';

interface LoggedInUser {
  token: string;
  userId: string;
}

async function registerAndLogin(
  api: TestApp,
  email: string,
): Promise<LoggedInUser> {
  await request(api.server)
    .post('/auth/register')
    .send({ email, password: PASSWORD });

  const response = await request(api.server)
    .post('/auth/login')
    .send({ email, password: PASSWORD });

  return {
    token: response.body.token as string,
    userId: response.body.id as string,
  };
}

function makeCreateOfferBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Poste',
    description: 'Description du poste.',
    company: 'Acme',
    location: 'Montréal',
    applyUrl: null,
    language: 'fr',
    country: 'CA',
    ...overrides,
  };
}

/**
 * Bloque generateText() tant que releaseNow() n'a pas été appelé — le seul
 * moyen fiable d'observer un état intermédiaire 'draft' entre le 202 et la
 * fin réelle d'une génération fire-and-forget, sans dépendre d'un
 * minutage incertain.
 */
class GatedLlm implements LlmPort {
  private resolveGate!: () => void;
  private readonly gate: Promise<void>;

  constructor() {
    this.gate = new Promise((resolve) => {
      this.resolveGate = resolve;
    });
  }

  async generateText(_input: GenerateTextInput): Promise<GenerateTextOutput> {
    await this.gate;
    return {
      // Conforme à CA_FR_NORM (makeCreateOfferBody par défaut : language:
      // 'fr', country: 'CA') — depuis que le pipeline vérifie le format
      // réel (ADR-16), une phrase isolée déclenche un tour de correction
      // puis un rejet ; ce double ne teste pas la qualité du texte, mais
      // l'état intermédiaire 'draft' entre le 202 et la fin de génération.
      // Trois paragraphes de corps (correction N) — un seul ne tombe plus
      // dans [3, 5] depuis que la salutation et la clôture ne comptent
      // plus comme des paragraphes.
      text: [
        CA_FR_NORM.letter.openingFormula,
        Array.from({ length: 100 }, (_, i) => `mot${i}`).join(' '),
        Array.from({ length: 100 }, (_, i) => `mot${100 + i}`).join(' '),
        Array.from({ length: 100 }, (_, i) => `mot${200 + i}`).join(' '),
        CA_FR_NORM.letter.closingFormula,
      ].join('\n\n'),
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
  }

  releaseNow(): void {
    this.resolveGate();
  }
}

/**
 * Un seul faux LLM enregistré pour toute la suite (un seul conteneur
 * Postgres) ; chaque test qui a besoin d'une stratégie différente de
 * `GatedLlm` l'installe via `setStrategy` avant d'agir — même pattern que
 * `ControllableLlm` dans applications.service.int-spec.ts.
 */
class ControllableLlm implements LlmPort {
  constructor(private current: LlmPort) {}

  setStrategy(strategy: LlmPort): void {
    this.current = strategy;
  }

  generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    return this.current.generateText(input);
  }
}

/**
 * Renvoie `responses[n]` au n-ième appel réel POUR CE userId (bornée au
 * dernier élément) — compté par utilisateur, jamais globalement : ce fichier
 * ne truncate jamais entre tests (un seul conteneur Postgres pour toute la
 * suite), et une candidature créée en arrière-plan par un test précédent
 * (ex. « GET /applications/:id d'une application appartenant à un autre
 * utilisateur ») peut encore être en vol quand ce test change la stratégie
 * — son appel, non attendu par ce test-là, arriverait sinon ici et fausserait
 * un compte global. Filtrer par `userId` rend le compte robuste à ce bruit
 * sans toucher aux tests existants qui le causent légitimement.
 */
class SequentialResponseLlm implements LlmPort {
  private callsByUser = new Map<string, number>();

  constructor(private readonly responses: string[]) {}

  callsFor(userId: string): number {
    return this.callsByUser.get(userId) ?? 0;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const next = (this.callsByUser.get(input.userId) ?? 0) + 1;
    this.callsByUser.set(input.userId, next);
    const index = Math.min(next - 1, this.responses.length - 1);
    return {
      text: this.responses[index],
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.001,
    };
  }
}

/**
 * `Array.from({length:n},(_,i)=>'wordN').join(' ')` : un compte de mots
 * exact et vérifiable, aucun mot capitalisé — jamais de faux positif
 * d'ancrage sur le remplissage lui-même.
 */
function fillerWords(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `word${offset + i}`).join(' ');
}

/**
 * Lettre conforme à CA_EN_NORM : ouverture, TROIS paragraphes de corps,
 * clôture. Correction N (revue senior) : un seul paragraphe de corps ne
 * tombe plus dans [3, 5] depuis que `checkMarketFormat` ne compte plus la
 * salutation ni la clôture comme des paragraphes — il en faut vraiment
 * trois.
 */
function buildConformantLetter(wordCount: number): string {
  const third = Math.floor(wordCount / 3);
  const bodyParagraphs = [
    fillerWords(third, 0),
    fillerWords(third, third),
    fillerWords(wordCount - 2 * third, third * 2),
  ];
  return [
    CA_EN_NORM.letter.openingFormula,
    ...bodyParagraphs,
    CA_EN_NORM.letter.closingFormula,
  ].join('\n\n');
}

/** Le plus petit PutProfileDto non vide : une seule expérience. */
function makeNonEmptyProfileDto(): PutProfileDto {
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
      },
    ],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    links: [],
  };
}

describe('POST /applications, GET /applications/:id', () => {
  let api: TestApp;
  let llm: GatedLlm;
  let controllable: ControllableLlm;
  let alice: LoggedInUser;
  let bob: LoggedInUser;

  beforeAll(async () => {
    llm = new GatedLlm();
    controllable = new ControllableLlm(llm);
    api = await startTestApp({
      overrides: (builder: TestingModuleBuilder) =>
        builder.overrideProvider(LLM_PORT).useValue(controllable),
    });
    alice = await registerAndLogin(api, 'alice@example.com');
    bob = await registerAndLogin(api, 'bob@example.com');
    // Profil non vide : depuis ADR-16, le pré-vol bloque toute génération
    // pour un profil sans expérience ni compétence — le test "202" ci-dessous
    // attend un vrai 'generated', pas un blocage immédiat.
    const profilesService = api.app.get(ProfilesService);
    await profilesService.replace(alice.userId, 1, makeNonEmptyProfileDto());
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  // Preuve 13.
  it("POST /applications renvoie 202 avec un statut qui n est pas encore 'generated' ; un GET immédiat peut encore montrer 'draft' ; un GET après la fin de la génération montre 'generated' avec le document", async () => {
    const offerResponse = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeCreateOfferBody());

    const postResponse = await request(api.server)
      .post('/applications')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ offerId: offerResponse.body.id });

    expect(postResponse.status).toBe(202);
    expect(postResponse.body.status).not.toBe('generated');

    const immediateGet = await request(api.server)
      .get(`/applications/${postResponse.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(immediateGet.body.status).toBe('draft');

    llm.releaseNow();

    await vi.waitFor(
      async () => {
        const response = await request(api.server)
          .get(`/applications/${postResponse.body.id}`)
          .set('Authorization', `Bearer ${alice.token}`);
        expect(response.body.status).toBe('generated');
      },
      { timeout: 10_000 },
    );

    const finalGet = await request(api.server)
      .get(`/applications/${postResponse.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(finalGet.status).toBe(200);
    expect(finalGet.body.status).toBe('generated');
    expect(finalGet.body.document).toMatchObject({
      type: 'cover_letter',
      content: expect.any(String),
    });
  });

  // Preuve 14.
  it('POST /applications avec l offerId d un autre utilisateur renvoie 404', async () => {
    const offerResponse = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeCreateOfferBody({ title: "Poste privé d'Alice" }));

    const response = await request(api.server)
      .post('/applications')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ offerId: offerResponse.body.id });

    expect(response.status).toBe(404);
  });

  // Preuve 15.
  it('GET /applications/:id d une application appartenant à un autre utilisateur renvoie 404', async () => {
    const offerResponse = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${bob.token}`)
      .send(makeCreateOfferBody({ title: 'Poste de Bob' }));

    const bobApplication = await request(api.server)
      .post('/applications')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ offerId: offerResponse.body.id });

    const response = await request(api.server)
      .get(`/applications/${bobApplication.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(response.status).toBe(404);
  });

  // Preuve 16.
  it('aucune route de candidature n est accessible sans jeton', async () => {
    const postResponse = await request(api.server)
      .post('/applications')
      .send({ offerId: randomUUID() });
    expect(postResponse.status).toBe(401);

    const getResponse = await request(api.server).get(
      `/applications/${randomUUID()}`,
    );
    expect(getResponse.status).toBe(401);
  });

  it('un GET /applications/:id avec un id qui n est pas un UUID renvoie 400, jamais 500', async () => {
    const response = await request(api.server)
      .get('/applications/pas-un-uuid')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(response.status).toBe(400);
  });

  // Correction D — un premier texte trop court (sous lengthRange), par
  // ailleurs correct, déclenche une correction qui réussit : exactement 2
  // appels LLM au total, jamais 1 (la violation de longueur doit être
  // détectée), jamais 3 (une seule correction est tentée).
  it('un premier texte LLM bien trop court déclenche exactement 2 appels LLM au total, jamais 1, jamais 3', async () => {
    const tooShortText = [
      CA_EN_NORM.letter.openingFormula,
      fillerWords(30),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const conformantText = buildConformantLetter(300);
    const sequential = new SequentialResponseLlm([
      tooShortText,
      conformantText,
    ]);
    controllable.setStrategy(sequential);

    const user = await registerAndLogin(
      api,
      `trop-court-${randomUUID()}@example.com`,
    );
    const profilesService = api.app.get(ProfilesService);
    await profilesService.replace(user.userId, 1, makeNonEmptyProfileDto());

    const offerResponse = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${user.token}`)
      .send(makeCreateOfferBody({ language: 'en', country: 'CA' }));

    const postResponse = await request(api.server)
      .post('/applications')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ offerId: offerResponse.body.id });

    await vi.waitFor(
      async () => {
        const response = await request(api.server)
          .get(`/applications/${postResponse.body.id}`)
          .set('Authorization', `Bearer ${user.token}`);
        expect(['generated', 'generation_failed']).toContain(
          response.body.status,
        );
      },
      { timeout: 10_000 },
    );

    expect(sequential.callsFor(user.userId)).toBe(2);
  });

  // Correction D — même preuve pour un premier texte bien trop long (au
  // dessus de lengthRange).
  it('un premier texte LLM bien trop long déclenche exactement 2 appels LLM au total, jamais 1, jamais 3', async () => {
    const tooLongText = [
      CA_EN_NORM.letter.openingFormula,
      fillerWords(600),
      CA_EN_NORM.letter.closingFormula,
    ].join('\n\n');
    const conformantText = buildConformantLetter(300);
    const sequential = new SequentialResponseLlm([tooLongText, conformantText]);
    controllable.setStrategy(sequential);

    const user = await registerAndLogin(
      api,
      `trop-long-${randomUUID()}@example.com`,
    );
    const profilesService = api.app.get(ProfilesService);
    await profilesService.replace(user.userId, 1, makeNonEmptyProfileDto());

    const offerResponse = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${user.token}`)
      .send(makeCreateOfferBody({ language: 'en', country: 'CA' }));

    const postResponse = await request(api.server)
      .post('/applications')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ offerId: offerResponse.body.id });

    await vi.waitFor(
      async () => {
        const response = await request(api.server)
          .get(`/applications/${postResponse.body.id}`)
          .set('Authorization', `Bearer ${user.token}`);
        expect(['generated', 'generation_failed']).toContain(
          response.body.status,
        );
      },
      { timeout: 10_000 },
    );

    expect(sequential.callsFor(user.userId)).toBe(2);
  });
});
