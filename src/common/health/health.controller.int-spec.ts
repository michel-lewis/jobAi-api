import request from 'supertest';
import {
  startTestApp,
  type TestApp,
} from '../../../test/integration/app-harness.js';

/**
 * Dans son propre fichier, sa propre app : le dernier test coupe la base
 * pour de vrai, ce qui rend cette app inutilisable pour quoi que ce soit
 * d'autre ensuite.
 */
describe('GET /health', () => {
  let api: TestApp;

  beforeAll(async () => {
    api = await startTestApp();
  }, 180_000);

  afterAll(async () => {
    await api.stop();
  });

  it('répond 200 quand la base est accessible', async () => {
    const response = await request(api.server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    // Preuve que RequestContextMiddleware est bien câblée via
    // AppModule.configure() sur une vraie requête — pas seulement que
    // middleware.use() fonctionne isolément en test unitaire.
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Dernier test du fichier : après ça, la base n'existe plus.
  it('répond 503 sans détail d infrastructure quand la base est coupée', async () => {
    await api.stopDatabase();

    const response = await request(api.server).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service indisponible',
    });
  }, 30_000);
});
