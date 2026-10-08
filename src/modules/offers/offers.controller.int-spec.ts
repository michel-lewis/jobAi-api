import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';
import { Offer } from './entities/offer.entity.js';

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
    title: 'Ingénieur backend',
    description: 'Nous cherchons une personne pour renforcer notre équipe.',
    company: 'Acme',
    location: 'Montréal',
    applyUrl: 'https://acme.example.com/jobs/42',
    ...overrides,
  };
}

/**
 * Insère une offre publique directement en base. L'API n'a aucune route
 * pour créer une offre publique (POST /offers pose toujours
 * createdByUserId = l'utilisateur du jeton) : c'est le seul moyen d'en
 * fabriquer une pour le test.
 */
async function insertPublicOffer(api: TestApp, title: string): Promise<string> {
  const id = randomUUID();
  await api.dataSource
    .getRepository(Offer)
    .createQueryBuilder()
    .insert()
    .into(Offer)
    .values({
      id,
      source: 'jobbank',
      externalId: null,
      createdByUserId: null,
      title,
      company: null,
      location: null,
      description: 'Description',
      applyUrl: null,
      applyChannel: 'generic_llm',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
  return id;
}

describe('POST /offers, GET /offers/:id, GET /offers', () => {
  let api: TestApp;
  let alice: LoggedInUser;
  let bob: LoggedInUser;

  // Un seul login par utilisateur, partagé entre tests : /auth/login est
  // plafonné en requêtes par minute (voir profiles.controller.int-spec.ts).
  beforeAll(async () => {
    api = await startTestApp();
    alice = await registerAndLogin(api, 'alice@example.com');
    bob = await registerAndLogin(api, 'bob@example.com');
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  // Purge ciblée de la seule table offers : alice et bob doivent survivre
  // d'un test à l'autre, leur jeton référence leur id (même raison que
  // profiles.controller.int-spec.ts, qui ne tronque jamais les profils entre
  // tests). Un truncateAll() + ré-inscription/reconnexion ici dépasserait
  // largement les 5 requêtes/minute de /auth/login pour 8 tests.
  beforeEach(async () => {
    await api.dataSource.query(
      'TRUNCATE TABLE "offers" RESTART IDENTITY CASCADE',
    );
  });

  it('une offre creee par POST /offers a source manual_paste, le bon auteur, apply_channel manual_only, et renvoie 201 avec la forme exacte du document', async () => {
    const response = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeCreateOfferBody());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      source: 'manual_paste',
      createdByUserId: alice.userId,
      title: 'Ingénieur backend',
      company: 'Acme',
      location: 'Montréal',
      description: 'Nous cherchons une personne pour renforcer notre équipe.',
      applyUrl: 'https://acme.example.com/jobs/42',
      applyChannel: 'manual_only',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('refuse une creation sans jeton', async () => {
    const response = await request(api.server)
      .post('/offers')
      .send(makeCreateOfferBody());

    expect(response.status).toBe(401);
  });

  it('un id qui n est pas un UUID renvoie 400, jamais 500', async () => {
    const response = await request(api.server)
      .get('/offers/ceci-n-est-pas-un-uuid')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  /**
   * Prouve que ZodValidationPipe est réellement câblé sur @Body, pas
   * seulement sur le DTO en isolation (create-offer.dto.spec.ts) ou sur le
   * paramètre d'id : sans le pipe sur le handler POST, un corps invalide
   * atteindrait le service tel quel.
   */
  it('un POST avec un title vide renvoie 400 VALIDATION_FAILED', async () => {
    const response = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeCreateOfferBody({ title: '' }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  /**
   * Prouve que ZodValidationPipe est réellement câblé sur @Query pour
   * GET /offers : sans le pipe sur ce handler, une limite hors bornes
   * (max 100) passerait telle quelle jusqu'au service.
   */
  it('un GET /offers avec limit=999 renvoie 400', async () => {
    const response = await request(api.server)
      .get('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .query({ limit: 999 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('renvoie 404, jamais 500, sur un id UUID absent', async () => {
    const response = await request(api.server)
      .get(`/offers/${randomUUID()}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('OFFER_NOT_FOUND');
  });

  /**
   * Réplique au niveau HTTP de la preuve centrale du ticket
   * (voir offers.service.int-spec.ts) : une offre privée d'Alice ne doit
   * jamais atteindre Bob via la route, et surtout pas révéler son existence
   * par un 403 — seul un 404 est permis, identique à celui d'un id qui
   * n'existe pas du tout.
   */
  it('une offre privee d un autre utilisateur renvoie 404, jamais 403 — ne revele pas son existence', async () => {
    const created = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeCreateOfferBody({ title: 'Offre privée d Alice' }));

    const response = await request(api.server)
      .get(`/offers/${created.body.id}`)
      .set('Authorization', `Bearer ${bob.token}`);

    expect(response.status).toBe(404);
    expect(response.status).not.toBe(403);
    expect(response.body.code).toBe('OFFER_NOT_FOUND');
  });

  it('une offre publique est accessible par GET /offers/:id a n importe quel utilisateur connecté', async () => {
    const publicOfferId = await insertPublicOffer(
      api,
      'Offre publique partagée',
    );

    const response = await request(api.server)
      .get(`/offers/${publicOfferId}`)
      .set('Authorization', `Bearer ${bob.token}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(publicOfferId);
    expect(response.body.createdByUserId).toBeNull();
  });

  it('GET /offers liste les offres de l utilisateur et les offres publiques, sans celles d un autre utilisateur', async () => {
    const aliceOffer = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send(makeCreateOfferBody({ title: 'Offre privée d Alice' }));

    const bobOffer = await request(api.server)
      .post('/offers')
      .set('Authorization', `Bearer ${bob.token}`)
      .send(makeCreateOfferBody({ title: 'Offre privée de Bob' }));

    const publicOfferId = await insertPublicOffer(api, 'Offre publique');

    const response = await request(api.server)
      .get('/offers')
      .set('Authorization', `Bearer ${alice.token}`)
      .query({ limit: 10, offset: 0 });

    expect(response.status).toBe(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(aliceOffer.body.id);
    expect(ids).toContain(publicOfferId);
    expect(ids).not.toContain(bobOffer.body.id);
  });
});
